// apps/backend/__tests__/unit/utils/lockManager.unit.test.ts

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Stats } from 'fs';

// Mock file system operations
const mockFileHandle = {
  writeFile: vi.fn(),
  close: vi.fn(),
};

const mockFs = vi.hoisted(() => ({
  mkdir: vi.fn(),
  open: vi.fn(),
  unlink: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}));

// Mock dependencies
vi.mock('fs', () => ({ promises: mockFs }));
vi.mock('../../../src/services/logger', () => ({
  __esModule: true,
  default: global.mockLogger,
  getLogger: global.getLogger,
}));

describe('Lock Manager Unit Tests', () => {
  let mockEnv: any;
  let lockManager: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset environment
    mockEnv = { ...process.env };
    delete process.env.NODE_ENV;
    delete process.env.JEST_WORKER_ID;

    // Clear module cache to test different environment configurations
    vi.resetModules();

    // Setup default successful mocks
    mockFileHandle.writeFile.mockResolvedValue(undefined);
    mockFileHandle.close.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.open.mockResolvedValue(mockFileHandle);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockResolvedValue({ mtimeMs: Date.now() - 1000 } as Stats);
  });

  afterEach(() => {
    process.env = mockEnv;
  });

  describe('Environment Configuration Logic', () => {
    test('should start cleanup scheduler when not in test environment', async () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      const mockSetInterval = vi
        .spyOn(global, 'setInterval')
        .mockImplementation(() => 'timer-id' as any);

      // Mock config after environment is set
      vi.doMock('../../../src/config', () => ({
        lockConfig: {
          lockDir: '/tmp/test-locks',
          defaultTimeoutMs: 5000,
          cleanupIntervalMs: 10000,
          staleLockAgeMs: 30000,
          enableLockLogging: true,
        },
      }));

      // Act - Import causes constructor to run
      await import('../../../src/utils/lockManager');

      // Assert
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 10000);

      mockSetInterval.mockRestore();
    });

    test('should not start cleanup scheduler when in test environment', async () => {
      // Arrange
      process.env.NODE_ENV = 'test';
      const mockSetInterval = vi
        .spyOn(global, 'setInterval')
        .mockImplementation(() => 'timer-id' as any);

      vi.doMock('../../../src/config', () => ({
        lockConfig: {
          lockDir: '/tmp/test-locks',
          defaultTimeoutMs: 5000,
          cleanupIntervalMs: 10000,
          staleLockAgeMs: 30000,
          enableLockLogging: true,
        },
      }));

      // Act
      await import('../../../src/utils/lockManager');

      // Assert
      expect(mockSetInterval).not.toHaveBeenCalled();

      mockSetInterval.mockRestore();
    });

    test('should not start cleanup scheduler when JEST_WORKER_ID is set', async () => {
      // Arrange
      process.env.JEST_WORKER_ID = '1';
      const mockSetInterval = vi
        .spyOn(global, 'setInterval')
        .mockImplementation(() => 'timer-id' as any);

      vi.doMock('../../../src/config', () => ({
        lockConfig: {
          lockDir: '/tmp/test-locks',
          defaultTimeoutMs: 5000,
          cleanupIntervalMs: 10000,
          staleLockAgeMs: 30000,
          enableLockLogging: true,
        },
      }));

      // Act
      await import('../../../src/utils/lockManager');

      // Assert
      expect(mockSetInterval).not.toHaveBeenCalled();

      mockSetInterval.mockRestore();
    });
  });

  describe('Error Code Handling', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'test';
      vi.doMock('../../../src/config', () => ({
        lockConfig: {
          lockDir: '/tmp/test-locks',
          defaultTimeoutMs: 1000,
          cleanupIntervalMs: 10000,
          staleLockAgeMs: 30000,
          retryDelayMs: 10, // Fast retry for tests
          enableLockLogging: false,
        },
      }));

      const module = await import('../../../src/utils/lockManager');
      lockManager = module;
    });

    test('should retry when lock exists and eventually succeed', async () => {
      // Arrange
      const existsError = new Error('File exists');
      (existsError as any).code = 'EEXIST';

      let callCount = 0;
      mockFs.open.mockImplementation(() => {
        callCount++;
        if (callCount < 3) return Promise.reject(existsError);
        return Promise.resolve(mockFileHandle);
      });

      const testFn = vi.fn().mockResolvedValue('success');

      // Act
      const result = await lockManager.withKeyLock('test-key', testFn);

      // Assert
      expect(result).toBe('success');
      expect(mockFs.open).toHaveBeenCalledTimes(3);
      expect(testFn).toHaveBeenCalledTimes(1);
    });

    test('should handle ENOENT error when checking stale locks', async () => {
      // Arrange
      const existsError = new Error('File exists');
      (existsError as any).code = 'EEXIST';

      const noentError = new Error('No such file');
      (noentError as any).code = 'ENOENT';

      mockFs.open.mockRejectedValueOnce(existsError);
      mockFs.stat.mockRejectedValueOnce(noentError);
      mockFs.open.mockResolvedValueOnce(mockFileHandle);

      const testFn = vi.fn().mockResolvedValue('success');

      // Act
      const result = await lockManager.withKeyLock('test-key', testFn);

      // Assert
      expect(result).toBe('success');
      expect(mockFs.stat).toHaveBeenCalled();
    });

    test('should throw timeout error when lock acquisition exceeds timeout', async () => {
      // Arrange
      const existsError = new Error('File exists');
      (existsError as any).code = 'EEXIST';

      mockFs.open.mockRejectedValue(existsError);
      // Mock stat to return a recent timestamp, so the lock appears fresh (not stale)
      const recentTime = Date.now() - 10; // 10ms ago, definitely not stale
      mockFs.stat.mockResolvedValue({ mtimeMs: recentTime } as Stats);

      const testFn = vi.fn();

      // Act & Assert - Use 50ms timeout with 10ms retry delay for fast test
      await expect(
        lockManager.withKeyLock('test-key', testFn, 50)
      ).rejects.toThrow(/Lock timeout for test-key/);

      expect(testFn).not.toHaveBeenCalled();
    });

    test('should propagate non-EEXIST errors immediately', async () => {
      // Arrange
      const permissionError = new Error('Permission denied');
      (permissionError as any).code = 'EACCES';

      mockFs.open.mockRejectedValue(permissionError);
      const testFn = vi.fn();

      // Act & Assert
      await expect(lockManager.withKeyLock('test-key', testFn)).rejects.toThrow(
        'Permission denied'
      );
    });
  });

  describe('Stale Lock Detection Logic', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'test';
      vi.doMock('../../../src/config', () => ({
        lockConfig: {
          lockDir: '/tmp/test-locks',
          defaultTimeoutMs: 5000,
          cleanupIntervalMs: 10000,
          staleLockAgeMs: 30000,
          retryDelayMs: 10, // Fast retry for tests
          enableLockLogging: true,
        },
      }));

      const module = await import('../../../src/utils/lockManager');
      lockManager = module;
    });

    test('should remove stale lock when age exceeds timeout', async () => {
      // Arrange
      const existsError = new Error('File exists');
      (existsError as any).code = 'EEXIST';

      const oldTime = Date.now() - 60000; // 60 seconds ago

      mockFs.open.mockRejectedValueOnce(existsError);
      mockFs.stat.mockResolvedValueOnce({ mtimeMs: oldTime } as Stats);
      mockFs.unlink.mockResolvedValueOnce(undefined);
      mockFs.open.mockResolvedValueOnce(mockFileHandle);

      const testFn = vi.fn().mockResolvedValue('success');

      // Act
      const result = await lockManager.withKeyLock('test-key', testFn, 5000);

      // Assert
      expect(result).toBe('success');
      expect(mockFs.unlink).toHaveBeenCalled();
      expect(mockFs.open).toHaveBeenCalledTimes(2); // Once failed, once succeeded
    });

    test('should not remove recent lock during stale check', async () => {
      // Arrange
      const existsError = new Error('File exists');
      (existsError as any).code = 'EEXIST';

      const recentTime = Date.now() - 1000; // 1 second ago

      mockFs.open.mockRejectedValue(existsError);
      mockFs.stat.mockResolvedValue({ mtimeMs: recentTime } as Stats);

      const testFn = vi.fn();

      // Act & Assert
      await expect(
        lockManager.withKeyLock('test-key', testFn, 50)
      ).rejects.toThrow(/Lock timeout/);

      expect(mockFs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('Configuration-Driven Behavior', () => {
    test('should log when enableLockLogging is true', async () => {
      // Arrange
      process.env.NODE_ENV = 'test';
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      vi.doMock('../../../src/config', () => ({
        lockConfig: {
          lockDir: '/tmp/test-locks',
          defaultTimeoutMs: 5000,
          cleanupIntervalMs: 10000,
          staleLockAgeMs: 30000,
          enableLockLogging: true,
        },
      }));

      vi.doMock('../../../src/services/logger', () => ({
        getLogger: () => mockLogger,
      }));

      const module = await import('../../../src/utils/lockManager');
      const testFn = vi.fn().mockResolvedValue('success');

      // Act
      await module.withKeyLock('test-key', testFn);

      // Assert
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Attempting to acquire lock',
        expect.any(Object)
      );
    });

    test('should not log when enableLockLogging is false', async () => {
      // Arrange
      process.env.NODE_ENV = 'test';
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      vi.doMock('../../../src/config', () => ({
        lockConfig: {
          lockDir: '/tmp/test-locks',
          defaultTimeoutMs: 5000,
          cleanupIntervalMs: 10000,
          staleLockAgeMs: 30000,
          enableLockLogging: false,
        },
      }));

      vi.doMock('../../../src/services/logger', () => ({
        getLogger: () => mockLogger,
      }));

      const module = await import('../../../src/utils/lockManager');
      const testFn = vi.fn().mockResolvedValue('success');

      // Act
      await module.withKeyLock('test-key', testFn);

      // Assert
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  describe('Request Coalescing Logic', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'test';
      vi.doMock('../../../src/config', () => ({
        lockConfig: {
          lockDir: '/tmp/test-locks',
          defaultTimeoutMs: 5000,
          cleanupIntervalMs: 10000,
          staleLockAgeMs: 30000,
          enableLockLogging: false,
        },
      }));

      const module = await import('../../../src/utils/lockManager');
      lockManager = module;
    });

    test('should execute function only once for concurrent requests with same key', async () => {
      // Arrange
      let executionCount = 0;
      const testFn = vi.fn().mockImplementation(async () => {
        executionCount++;
        return `result-${executionCount}`;
      });

      // Act
      const [result1, result2, result3] = await Promise.all([
        lockManager.withKeyLock('same-key', testFn),
        lockManager.withKeyLock('same-key', testFn),
        lockManager.withKeyLock('same-key', testFn),
      ]);

      // Assert
      expect(executionCount).toBe(1);
      expect(result1).toBe('result-1');
      expect(result2).toBe('result-1');
      expect(result3).toBe('result-1');
      expect(testFn).toHaveBeenCalledTimes(1);
    });

    test('should propagate errors to all coalesced requests', async () => {
      // Arrange
      const testError = new Error('Function failed');
      const testFn = vi.fn().mockRejectedValue(testError);

      // Act & Assert
      const promises = [
        lockManager.withKeyLock('error-key', testFn),
        lockManager.withKeyLock('error-key', testFn),
      ];

      await expect(Promise.all(promises)).rejects.toThrow('Function failed');
      expect(testFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Lock Release Error Handling', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'test';
      vi.doMock('../../../src/config', () => ({
        lockConfig: {
          lockDir: '/tmp/test-locks',
          defaultTimeoutMs: 5000,
          cleanupIntervalMs: 10000,
          staleLockAgeMs: 30000,
          enableLockLogging: false,
        },
      }));

      const module = await import('../../../src/utils/lockManager');
      lockManager = module;
    });

    test('should succeed when function completes despite file handle close error', async () => {
      // Arrange
      mockFileHandle.close.mockRejectedValue(new Error('Handle close failed'));
      const testFn = vi.fn().mockResolvedValue('success');

      // Act
      const result = await lockManager.withKeyLock('test-key', testFn);

      // Assert
      expect(result).toBe('success');
      expect(mockFs.unlink).toHaveBeenCalled(); // Cleanup should still happen
    });

    test('should succeed when function completes despite file unlink error', async () => {
      // Arrange
      mockFs.unlink.mockRejectedValue(new Error('File deletion failed'));
      const testFn = vi.fn().mockResolvedValue('success');

      // Act
      const result = await lockManager.withKeyLock('test-key', testFn);

      // Assert
      expect(result).toBe('success');
    });

    test('should still cleanup lock tracking when release fails', async () => {
      // Arrange
      mockFileHandle.close.mockRejectedValue(new Error('Close failed'));
      mockFs.unlink.mockRejectedValue(new Error('Unlink failed'));

      const testFn = vi.fn().mockResolvedValue('success');

      // Act
      const result = await lockManager.withKeyLock('test-key', testFn);
      const activeLocks = lockManager.getActiveLocks();

      // Assert
      expect(result).toBe('success');
      expect(activeLocks).toHaveLength(0); // Should be cleaned up from tracking
    });
  });

  describe('Force Release Functionality', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'test';
      vi.doMock('../../../src/config', () => ({
        lockConfig: {
          lockDir: '/tmp/test-locks',
          defaultTimeoutMs: 5000,
          cleanupIntervalMs: 10000,
          staleLockAgeMs: 30000,
          enableLockLogging: false,
        },
      }));

      const module = await import('../../../src/utils/lockManager');
      lockManager = module;
    });

    test('should return true when force release succeeds', async () => {
      // Arrange
      mockFs.unlink.mockResolvedValue(undefined);

      // Act
      const result = await lockManager.forceReleaseLock('test-key');

      // Assert
      expect(result).toBe(true);
      expect(mockFs.unlink).toHaveBeenCalledWith('/tmp/test-locks/test-key');
    });

    test('should return false when force release fails', async () => {
      // Arrange
      mockFs.unlink.mockRejectedValue(new Error('Permission denied'));

      // Act
      const result = await lockManager.forceReleaseLock('test-key');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Ordered Locks Deadlock Prevention', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'test';
      vi.doMock('../../../src/config', () => ({
        lockConfig: {
          lockDir: '/tmp/test-locks',
          defaultTimeoutMs: 5000,
          cleanupIntervalMs: 10000,
          staleLockAgeMs: 30000,
          enableLockLogging: false,
        },
      }));

      const module = await import('../../../src/utils/lockManager');
      lockManager = module;
    });

    test('should acquire locks in sorted order regardless of input order', async () => {
      // Arrange
      const lockOrder: string[] = [];

      // Capture the order locks are acquired by monitoring fs.open calls
      mockFs.open.mockImplementation((path: string) => {
        const lockName = path.split('/').pop();
        lockOrder.push(lockName!);
        return Promise.resolve(mockFileHandle);
      });

      const testFn = vi.fn().mockResolvedValue('success');

      // Act
      await lockManager.withOrderedLocks(
        ['lock-z', 'lock-a', 'lock-m'],
        testFn
      );

      // Assert
      expect(lockOrder).toEqual(['lock-a', 'lock-m', 'lock-z']);
      expect(testFn).toHaveBeenCalledTimes(1);
    });

    test('should handle empty lock array by executing function immediately', async () => {
      // Arrange
      const testFn = vi.fn().mockResolvedValue('empty-result');

      // Act
      const result = await lockManager.withOrderedLocks([], testFn);

      // Assert
      expect(result).toBe('empty-result');
      expect(mockFs.open).not.toHaveBeenCalled();
    });

    test('should remove duplicate locks before sorting', async () => {
      // Arrange
      const lockOrder: string[] = [];

      mockFs.open.mockImplementation((path: string) => {
        const lockName = path.split('/').pop();
        lockOrder.push(lockName!);
        return Promise.resolve(mockFileHandle);
      });

      const testFn = vi.fn().mockResolvedValue('success');

      // Act
      await lockManager.withOrderedLocks(
        ['lock-b', 'lock-a', 'lock-b'],
        testFn
      );

      // Assert
      expect(lockOrder).toEqual(['lock-a', 'lock-b']); // Duplicates removed, sorted
      expect(mockFs.open).toHaveBeenCalledTimes(2); // Only 2 unique locks
    });
  });

  describe('Metrics Calculation', () => {
    beforeEach(async () => {
      process.env.NODE_ENV = 'test';
      vi.doMock('../../../src/config', () => ({
        lockConfig: {
          lockDir: '/tmp/test-locks',
          defaultTimeoutMs: 5000,
          cleanupIntervalMs: 10000,
          staleLockAgeMs: 30000,
          enableLockLogging: false,
        },
      }));

      const module = await import('../../../src/utils/lockManager');
      lockManager = module;
    });

    test('should correctly calculate average wait time over multiple acquisitions', async () => {
      // Arrange
      const testFn = vi.fn().mockResolvedValue('success');
      const initialMetrics = lockManager.getLockMetrics();

      // Act - Perform multiple lock operations
      await lockManager.withKeyLock('key1', testFn);
      await lockManager.withKeyLock('key2', testFn);
      await lockManager.withKeyLock('key3', testFn);

      const finalMetrics = lockManager.getLockMetrics();

      // Assert
      expect(finalMetrics.acquisitions).toBe(initialMetrics.acquisitions + 3);
      expect(finalMetrics.averageWaitTime).toBeGreaterThanOrEqual(0);
      expect(finalMetrics.currentLocks).toBe(0); // All should be released
    });

    test('should track timeout events when they occur', async () => {
      // Arrange
      const existsError = new Error('File exists');
      (existsError as any).code = 'EEXIST';

      mockFs.open.mockRejectedValue(existsError);
      mockFs.stat.mockRejectedValue(existsError); // Always fail stale check

      const testFn = vi.fn();
      const initialMetrics = lockManager.getLockMetrics();

      // Act & Assert
      await expect(
        lockManager.withKeyLock('timeout-key', testFn, 50)
      ).rejects.toThrow(/Lock timeout/);

      const finalMetrics = lockManager.getLockMetrics();
      expect(finalMetrics.timeouts).toBe(initialMetrics.timeouts + 1);
    });
  });
});
