import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scheduleCleanup,
  runCleanupQueue,
  startCleanupScheduler,
  stopCleanupScheduler,
  getQueueStatus,
  clearQueue,
} from '../../src/utils/cleanupScheduler';
import { gitService } from '../../src/services/gitService';
import logger from '../../src/services/logger';

// Mock dependencies
vi.mock('../../src/services/gitService', () => ({
  gitService: {
    cleanupRepository: vi.fn(),
  },
}));

vi.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/services/metrics', () => ({
  cleanupQueueSize: {
    set: vi.fn(),
  },
  tempDirectories: {
    inc: vi.fn(),
    dec: vi.fn(),
  },
}));

const mockCleanupRepository = gitService.cleanupRepository as ReturnType<
  typeof vi.fn
>;
const mockLoggerInfo = logger.info as ReturnType<typeof vi.fn>;
const mockLoggerError = logger.error as ReturnType<typeof vi.fn>;

describe('cleanupScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();

    // Stop any running scheduler and clear the queue
    stopCleanupScheduler();
    clearQueue();
  });

  afterEach(() => {
    stopCleanupScheduler();
    clearQueue();
    vi.useRealTimers();
  });

  describe('scheduleCleanup', () => {
    test('adds path to cleanup queue', () => {
      const testPath = '/tmp/test-repo';

      scheduleCleanup(testPath);

      const status = getQueueStatus();
      expect(status.size).toBe(1);
      expect(status.items).toContain(testPath);
    });

    test('handles multiple paths in queue', () => {
      const paths = ['/tmp/repo1', '/tmp/repo2', '/tmp/repo3'];

      paths.forEach(scheduleCleanup);

      const status = getQueueStatus();
      expect(status.size).toBe(3);
      expect(status.items).toEqual(expect.arrayContaining(paths));
    });
  });

  describe('runCleanupQueue', () => {
    test('processes cleanup queue successfully', async () => {
      const testPaths = ['/tmp/repo1', '/tmp/repo2'];
      mockCleanupRepository.mockResolvedValue(undefined);

      testPaths.forEach(scheduleCleanup);

      await runCleanupQueue();

      expect(mockCleanupRepository).toHaveBeenCalledTimes(2);
      expect(mockCleanupRepository).toHaveBeenCalledWith('/tmp/repo1');
      expect(mockCleanupRepository).toHaveBeenCalledWith('/tmp/repo2');
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Running cleanup for 2 directories'
      );

      const status = getQueueStatus();
      expect(status.size).toBe(0);
    });

    test('handles cleanup errors gracefully', async () => {
      const testPath = '/tmp/error-repo';
      const error = new Error('Cleanup failed');
      mockCleanupRepository.mockRejectedValue(error);

      scheduleCleanup(testPath);

      await runCleanupQueue();

      expect(mockCleanupRepository).toHaveBeenCalledWith(testPath);
      expect(mockLoggerError).toHaveBeenCalledWith('Async cleanup failed', {
        repoPath: testPath,
        error,
      });

      const status = getQueueStatus();
      expect(status.size).toBe(0);
    });

    test('processes in batches of 10', async () => {
      const paths = Array.from({ length: 25 }, (_, i) => `/tmp/repo${i}`);
      mockCleanupRepository.mockResolvedValue(undefined);

      paths.forEach(scheduleCleanup);

      await runCleanupQueue();

      // Should process first 10 items
      expect(mockCleanupRepository).toHaveBeenCalledTimes(10);

      const status = getQueueStatus();
      expect(status.size).toBe(15); // 25 - 10 = 15 remaining
    });

    test('returns early when queue is empty', async () => {
      await runCleanupQueue();

      expect(mockCleanupRepository).not.toHaveBeenCalled();
      expect(mockLoggerInfo).not.toHaveBeenCalled();
    });
  });

  describe('startCleanupScheduler', () => {
    test('starts interval scheduler', () => {
      startCleanupScheduler();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Cleanup scheduler started');
    });

    test('does not start multiple schedulers', () => {
      startCleanupScheduler();
      startCleanupScheduler();

      // Should only log once
      expect(mockLoggerInfo).toHaveBeenCalledTimes(1);
    });

    test('runs cleanup periodically', () => {
      const testPath = '/tmp/periodic-test';
      mockCleanupRepository.mockResolvedValue(undefined);

      scheduleCleanup(testPath);
      startCleanupScheduler();

      // Fast-forward time by 1 minute
      vi.advanceTimersByTime(60000);

      expect(mockCleanupRepository).toHaveBeenCalledWith(testPath);
    });
  });

  describe('stopCleanupScheduler', () => {
    test('stops running scheduler', () => {
      startCleanupScheduler();
      stopCleanupScheduler();

      expect(mockLoggerInfo).toHaveBeenCalledWith('Cleanup scheduler stopped');
    });

    test('handles stopping when not running', () => {
      stopCleanupScheduler();

      // Should not throw error
      expect(mockLoggerInfo).not.toHaveBeenCalledWith(
        'Cleanup scheduler stopped'
      );
    });
  });

  describe('getQueueStatus', () => {
    test('returns current queue status', () => {
      const paths = ['/tmp/repo1', '/tmp/repo2'];
      paths.forEach(scheduleCleanup);

      const status = getQueueStatus();

      expect(status.size).toBe(2);
      expect(status.items).toEqual(paths);
    });

    test('returns copy of queue items', () => {
      const testPath = '/tmp/test';
      scheduleCleanup(testPath);

      const status1 = getQueueStatus();
      const status2 = getQueueStatus();

      // Should be different array instances
      expect(status1.items).not.toBe(status2.items);
      expect(status1.items).toEqual(status2.items);
    });
  });
});
