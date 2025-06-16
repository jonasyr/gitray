import { describe, test, expect, beforeEach, vi } from 'vitest';
import simpleGit from 'simple-git';
import { gitService } from '../../../src/services/gitService';
import redis from '../../../src/services/cache';
import { config } from '../../../src/config';

vi.mock('simple-git');
vi.mock('ioredis');
vi.mock('../../../src/services/logger', () => ({
  __esModule: true,
  default: global.mockLogger,
  getLogger: global.getLogger,
}));

vi.mock('../../../src/utils/memoryPressureManager', () => ({
  getMemoryStats: vi.fn(() => ({
    system: {
      free: 1024 * 1024 * 1024, // 1GB
      total: 4 * 1024 * 1024 * 1024, // 4GB
      usagePercentage: 0.25,
    },
    process: {
      heapUsed: 100 * 1024 * 1024, // 100MB
      heapTotal: 200 * 1024 * 1024, // 200MB
      rss: 150 * 1024 * 1024, // 150MB
    },
    pressure: {
      level: 'normal',
      factor: 0.0,
    },
    gc: {
      forced: 0,
      full: 0,
    },
  })),
  shouldThrottleRequest: vi.fn(() => false),
  executeWithMemoryProtection: vi.fn(async (_, fn) => {
    if (typeof fn === 'function') {
      return await fn();
    }
    throw new Error('executeWithMemoryProtection requires a function');
  }),
  getMemoryMetrics: vi.fn(() => ({})),
}));

vi.mock('../../../src/services/metrics', () => ({
  recordStreamingStart: vi.fn(),
  recordStreamingCompletion: vi.fn(),
  recordStreamingBatch: vi.fn(),
  recordStreamingError: vi.fn(),
  recordEnhancedCacheOperation: vi.fn(),
  recordDetailedError: vi.fn(),
  updateServiceHealthScore: vi.fn(),
  getRepositoryType: vi.fn(() => 'public'),
}));

vi.mock('../../../src/services/cache', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

describe('GitService Streaming Functionality - Simple', () => {
  const mockGit = {
    raw: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (simpleGit as any).mockReturnValue(mockGit);
    vi.spyOn(global.mockLogger, 'info').mockReset();
    vi.spyOn(global.mockLogger, 'warn').mockReset();
    vi.spyOn(global.mockLogger, 'debug').mockReset();
    (redis.get as any).mockResolvedValue(null);
    (redis.set as any).mockResolvedValue('OK');
    (redis.del as any).mockResolvedValue(1);

    // Simple intelligent git.raw mock
    mockGit.raw.mockImplementation((args: string[]) => {
      if (args.includes('--count')) {
        return Promise.resolve('5\n'); // Small default
      } else {
        return Promise.resolve('');
      }
    });
  });

  describe('getCommitCount', () => {
    test('should return commit count for repository', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw.mockResolvedValue('10\n');

      // Act
      const count = await gitService.getCommitCount(localRepoPath);

      // Assert
      expect(count).toBe(10);
      expect(mockGit.raw).toHaveBeenCalledWith(['rev-list', '--count', 'HEAD']);
    });

    test('should handle invalid count output', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw.mockResolvedValue('invalid\n');

      // Act & Assert
      await expect(gitService.getCommitCount(localRepoPath)).rejects.toThrow(
        'Failed to fetch commits from repository'
      );
    });
  });

  describe('shouldUseStreaming', () => {
    test('should return true for large repositories', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw.mockResolvedValue('30\n'); // Above threshold
      config.streaming.enabled = true;
      config.streaming.commitThreshold = 20;

      // Act
      const shouldStream = await gitService.shouldUseStreaming(localRepoPath);

      // Assert
      expect(shouldStream).toBe(true);
    });

    test('should return false for small repositories', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw.mockResolvedValue('10\n'); // Below threshold
      config.streaming.enabled = true;
      config.streaming.commitThreshold = 20;

      // Act
      const shouldStream = await gitService.shouldUseStreaming(localRepoPath);

      // Assert
      expect(shouldStream).toBe(false);
    });

    test('should return false when streaming is disabled', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw.mockResolvedValue('30\n'); // Above threshold but disabled
      config.streaming.enabled = false;

      // Act
      const shouldStream = await gitService.shouldUseStreaming(localRepoPath);

      // Assert
      expect(shouldStream).toBe(false);
    });
  });

  describe('integration with getCommits method', () => {
    test('should use original method for small repositories', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw
        .mockResolvedValueOnce('5\n') // Below threshold
        .mockResolvedValueOnce(
          'abc123|2023-01-01T12:00:00Z|User1|user1@example.com|Test commit'
        );

      config.streaming.enabled = true;
      config.streaming.commitThreshold = 10;

      // Act
      const commits = await gitService.getCommits(localRepoPath);

      // Assert
      expect(commits).toHaveLength(1);
      expect(commits[0].sha).toBe('abc123');
      expect(commits[0].message).toBe('Test commit');
    });

    test('should respect pagination options', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw.mockResolvedValue(
        'abc123|2023-01-01T12:00:00Z|User1|user1@example.com|Test commit'
      );

      // Act - when pagination is provided, it should bypass streaming
      const commits = await gitService.getCommits(localRepoPath, {
        limit: 1,
        skip: 0,
      });

      // Assert
      expect(commits).toHaveLength(1);
      expect(commits[0].sha).toBe('abc123');
    });
  });
});
