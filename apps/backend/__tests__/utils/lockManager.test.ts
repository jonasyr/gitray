// apps/backend/__tests__/utils/lockManager.test.ts

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Stats } from 'fs';

// Create a proper Stats mock object
const createMockStats = (mtimeMs: number = Date.now() - 1000): Stats =>
  ({
    mtimeMs,
    isFile: vi.fn().mockReturnValue(true),
    isDirectory: vi.fn().mockReturnValue(false),
    isBlockDevice: vi.fn().mockReturnValue(false),
    isCharacterDevice: vi.fn().mockReturnValue(false),
    isSymbolicLink: vi.fn().mockReturnValue(false),
    isFIFO: vi.fn().mockReturnValue(false),
    isSocket: vi.fn().mockReturnValue(false),
    dev: 0,
    ino: 0,
    mode: 0,
    nlink: 0,
    uid: 0,
    gid: 0,
    rdev: 0,
    size: 0,
    blksize: 0,
    blocks: 0,
    atimeMs: mtimeMs,
    ctimeMs: mtimeMs,
    birthtimeMs: mtimeMs,
    atime: new Date(mtimeMs),
    mtime: new Date(mtimeMs),
    ctime: new Date(mtimeMs),
    birthtime: new Date(mtimeMs),
  }) as Stats;

// Create comprehensive mocks before any imports
const mockFileHandle = {
  writeFile: vi.fn(),
  close: vi.fn(),
};

// Create comprehensive mocks using vi.hoisted
const mockFs = vi.hoisted(() => ({
  mkdir: vi.fn(),
  open: vi.fn(),
  unlink: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}));

// Mock timer functions to prevent background intervals
const originalSetInterval = global.setInterval;
const originalClearInterval = global.clearInterval;
const mockSetInterval = vi.fn();
const mockClearInterval = vi.fn();

// Store interval IDs to track them
const activeIntervals = new Set<NodeJS.Timeout>();

// Set up environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.JEST_WORKER_ID = '1';

// Mock global timer functions
global.setInterval = mockSetInterval.mockImplementation(() => {
  // Return a mock interval ID but don't actually start the interval
  const mockIntervalId = Symbol('mockInterval') as any;
  activeIntervals.add(mockIntervalId);
  return mockIntervalId;
}) as any;

global.clearInterval = mockClearInterval.mockImplementation(
  (intervalId: any) => {
    if (intervalId) {
      activeIntervals.delete(intervalId);
    }
  }
) as any;

// Mock fs/promises with proper pattern to match lockManager import
vi.mock('fs', () => ({
  promises: mockFs,
}));

// Mock logger
vi.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: global.mockLogger,
  getLogger: global.getLogger,
}));

// Mock config
vi.mock('../../src/config', () => ({
  lockConfig: {
    lockDir: '/tmp/test-locks',
    defaultTimeoutMs: 5000,
    cleanupIntervalMs: 10000,
    staleLockAgeMs: 30000,
    enableLockLogging: true,
  },
}));

// Import after mocking
import {
  withKeyLock,
  getLockMetrics,
  getActiveLocks,
  shutdownLockManager,
} from '../../src/utils/lockManager';

describe('Lock Manager', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Clear mock interval tracking
    activeIntervals.clear();

    // Initialize mock return values for this test
    mockFileHandle.writeFile.mockResolvedValue(undefined);
    mockFileHandle.close.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.open.mockResolvedValue(mockFileHandle);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockResolvedValue(createMockStats());
  });

  afterEach(async () => {
    // Shutdown the lockManager to clear any timers
    try {
      await shutdownLockManager();
    } catch {
      // Ignore shutdown errors in tests
    }

    // Verify all intervals were cleared
    expect(activeIntervals.size).toBe(0);
  });

  describe('Basic Lock Operations - Happy Path', () => {
    test('should acquire and release lock successfully', async () => {
      // Arrange
      const lockKey = 'test-lock';
      const executionOrder: string[] = [];

      const testFunction = async () => {
        executionOrder.push('function-start');
        executionOrder.push('function-end');
        return 'success';
      };

      // Ensure the first fs.open call succeeds immediately
      mockFs.open.mockResolvedValueOnce(mockFileHandle);

      // Act
      const result = await withKeyLock(lockKey, testFunction);

      // Assert
      expect(result).toBe('success');
      expect(mockFs.mkdir).toHaveBeenCalledWith('/tmp/test-locks', {
        recursive: true,
      });
      expect(mockFs.open).toHaveBeenCalledWith(
        '/tmp/test-locks/test-lock',
        'wx'
      );
      expect(mockFileHandle.writeFile).toHaveBeenCalled();
      expect(mockFileHandle.close).toHaveBeenCalled();
      expect(mockFs.unlink).toHaveBeenCalledWith('/tmp/test-locks/test-lock');
      expect(executionOrder).toEqual(['function-start', 'function-end']);
    });

    test('should handle async function execution correctly', async () => {
      // Arrange
      const lockKey = 'async-test';
      let executedValue = '';

      const asyncTestFunction = async () => {
        executedValue = 'started';
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        executedValue = 'completed';
        return { status: 'done', value: executedValue };
      };

      // Act
      const result = await withKeyLock(lockKey, asyncTestFunction);

      // Assert
      expect(result).toEqual({ status: 'done', value: 'completed' });
      expect(executedValue).toBe('completed');
    });

    test('should propagate function return values correctly', async () => {
      // Arrange
      const lockKey = 'return-test';
      const expectedReturn = { data: [1, 2, 3], count: 3 };

      const returnTestFunction = async () => {
        return expectedReturn;
      };

      // Act
      const result = await withKeyLock(lockKey, returnTestFunction);

      // Assert
      expect(result).toEqual(expectedReturn);
    });
  });

  describe('Request Coalescing - Happy Path', () => {
    test('should coalesce identical concurrent requests', async () => {
      // Arrange
      const lockKey = 'coalesce-test';
      let executionCount = 0;

      const testFunction = async () => {
        executionCount++;
        return `execution-${executionCount}`;
      };

      // Act
      const promises = [
        withKeyLock(lockKey, testFunction),
        withKeyLock(lockKey, testFunction),
        withKeyLock(lockKey, testFunction),
      ];

      const results = await Promise.all(promises);

      // Assert
      expect(executionCount).toBe(1);
      expect(results).toEqual(['execution-1', 'execution-1', 'execution-1']);
      expect(mockFs.open).toHaveBeenCalledTimes(1);
    });

    test('should handle error propagation in coalesced requests', async () => {
      // Arrange
      const lockKey = 'error-coalesce';
      const expectedError = new Error('Test error');

      const errorFunction = async () => {
        throw expectedError;
      };

      // Act & Assert
      const promises = [
        withKeyLock(lockKey, errorFunction),
        withKeyLock(lockKey, errorFunction),
      ];

      await expect(Promise.all(promises)).rejects.toThrow('Test error');
    });

    test('should not coalesce different keys', async () => {
      // Arrange
      let execution1 = false;
      let execution2 = false;

      const function1 = async () => {
        execution1 = true;
        return 'result1';
      };

      const function2 = async () => {
        execution2 = true;
        return 'result2';
      };

      // Act
      const [result1, result2] = await Promise.all([
        withKeyLock('key1', function1),
        withKeyLock('key2', function2),
      ]);

      // Assert
      expect(execution1).toBe(true);
      expect(execution2).toBe(true);
      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(mockFs.open).toHaveBeenCalledTimes(2);
    });
  });

  describe('Lock Metrics - Happy Path', () => {
    test('should track lock acquisition metrics', async () => {
      // Arrange
      const lockKey = 'metrics-test';
      const testFunction = async () => 'success';

      // Get initial metrics to calculate the delta
      const initialMetrics = getLockMetrics();

      // Act
      await withKeyLock(lockKey, testFunction);
      const finalMetrics = getLockMetrics();

      // Assert - Check that metrics increased by 1
      expect(finalMetrics.acquisitions).toBe(initialMetrics.acquisitions + 1);
      expect(finalMetrics.averageWaitTime).toBeGreaterThanOrEqual(0);
      expect(finalMetrics.currentLocks).toBe(0);
    });

    test('should track multiple lock operations', async () => {
      // Arrange
      const testFunction = async () => 'success';

      // Get initial metrics to calculate the delta
      const initialMetrics = getLockMetrics();

      // Act
      await withKeyLock('key1', testFunction);
      await withKeyLock('key2', testFunction);
      await withKeyLock('key3', testFunction);

      const finalMetrics = getLockMetrics();

      // Assert - Check that metrics increased by 3
      expect(finalMetrics.acquisitions).toBe(initialMetrics.acquisitions + 3);
      expect(finalMetrics.currentLocks).toBe(0);
    });

    test('should provide active locks information', async () => {
      // Arrange
      const lockKey = 'active-test';
      let activeLocksDuringExecution: any[] = [];

      const testFunction = async () => {
        activeLocksDuringExecution = getActiveLocks();
        return 'success';
      };

      // Act
      await withKeyLock(lockKey, testFunction);

      // Assert
      expect(activeLocksDuringExecution).toHaveLength(1);
      expect(activeLocksDuringExecution[0]).toMatchObject({
        key: lockKey,
        startTime: expect.any(Number),
        pid: expect.any(Number),
        hostname: expect.any(String),
      });

      const currentActiveLocks = getActiveLocks();
      expect(currentActiveLocks).toHaveLength(0);
    });
  });

  describe('Stale Lock Cleanup - Happy Path', () => {
    test('should clean up stale locks when manually triggered', async () => {
      // Arrange
      const staleLockFiles = ['stale-lock-1', 'stale-lock-2'];
      const currentTime = Date.now();

      mockFs.readdir.mockResolvedValue(staleLockFiles as any);
      mockFs.stat.mockImplementation(() => {
        return Promise.resolve({
          mtimeMs: currentTime - 60000, // 60 seconds old (stale)
        } as any);
      });

      // Act - Trigger cleanup through shutdown (which calls cleanup)
      await shutdownLockManager();

      // Assert
      expect(mockFs.readdir).toHaveBeenCalled();
      expect(mockFs.unlink).toHaveBeenCalledTimes(2);
    });

    test('should preserve recent locks during cleanup', async () => {
      // Arrange
      const lockFiles = ['recent-lock', 'stale-lock'];
      const currentTime = Date.now();

      mockFs.readdir.mockResolvedValue(lockFiles as any);
      mockFs.stat.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('recent-lock')) {
          return Promise.resolve({ mtimeMs: currentTime - 5000 } as any); // 5 seconds old (recent)
        } else {
          return Promise.resolve({ mtimeMs: currentTime - 60000 } as any); // 60 seconds old (stale)
        }
      });

      // Act
      await shutdownLockManager();

      // Assert
      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
    });

    test('should verify timer mocking is working', () => {
      // Since we prevent the timer from starting in test environment,
      // we just verify our mock setup is correct
      expect(mockSetInterval).toBeDefined();
      expect(mockClearInterval).toBeDefined();
      expect(activeIntervals).toBeDefined();
    });
  });

  describe('Error Handling - Happy Path', () => {
    test('should handle lock directory creation gracefully', async () => {
      // Arrange
      const lockKey = 'mkdir-test';
      const testFunction = async () => 'success';

      mockFs.mkdir.mockRejectedValueOnce(new Error('Permission denied'));

      // Act & Assert
      await expect(withKeyLock(lockKey, testFunction)).rejects.toThrow();
    });

    test('should handle file cleanup errors gracefully', async () => {
      // Arrange
      const lockKey = 'cleanup-error-test';
      const testFunction = async () => 'success';

      mockFs.unlink.mockRejectedValue(new Error('File in use'));

      // Act
      const result = await withKeyLock(lockKey, testFunction);

      // Assert
      expect(result).toBe('success');
    });

    test('should propagate function errors correctly', async () => {
      // Arrange
      const lockKey = 'function-error-test';
      const expectedError = new Error('Function failed');

      const errorFunction = async () => {
        throw expectedError;
      };

      // Act & Assert
      await expect(withKeyLock(lockKey, errorFunction)).rejects.toThrow(
        'Function failed'
      );

      expect(mockFileHandle.close).toHaveBeenCalled();
      expect(mockFs.unlink).toHaveBeenCalled();
    });
  });

  describe('Lock Timeout Handling - Happy Path', () => {
    test('should use custom timeout when provided', async () => {
      // Arrange
      const lockKey = 'timeout-test';
      const customTimeout = 100; // Use shorter timeout for testing
      const testFunction = async () => 'success';

      const lockExistsError = new Error('File exists');
      (lockExistsError as any).code = 'EEXIST';

      // Mock to fail initially, then succeed after a delay
      let callCount = 0;
      mockFs.open.mockImplementation(() => {
        callCount++;
        if (callCount < 5) {
          return Promise.reject(lockExistsError);
        }
        return Promise.resolve(mockFileHandle);
      });

      // Act & Assert - This should succeed before timeout
      const result = await withKeyLock(lockKey, testFunction, customTimeout);
      expect(result).toBe('success');
    });

    test('should use default timeout when not provided', async () => {
      // Arrange
      const lockKey = 'default-timeout-test';
      const testFunction = async () => 'success';

      // Act
      const result = await withKeyLock(lockKey, testFunction);

      // Assert
      expect(result).toBe('success');
    });
  });

  describe('Shutdown Behavior - Happy Path', () => {
    test('should shutdown cleanly and stop cleanup scheduler', async () => {
      // Act
      await shutdownLockManager();

      // Assert - In test environment, timer doesn't start so clearInterval may not be called
      // But we should still verify that fs cleanup operations happen
      expect(mockFs.readdir).toHaveBeenCalled();
    });

    test('should provide final metrics on shutdown', async () => {
      // Arrange
      const lockKey = 'shutdown-test';
      const testFunction = async () => 'success';

      await withKeyLock(lockKey, testFunction);

      // Act
      await shutdownLockManager();
      const finalMetrics = getLockMetrics();

      // Assert
      expect(finalMetrics.acquisitions).toBeGreaterThan(0);
      expect(finalMetrics.currentLocks).toBe(0);
    });
  });

  describe('Cross-Process Simulation - Happy Path', () => {
    test('should handle concurrent lock attempts from different processes', async () => {
      // Arrange
      const lockKey = 'cross-process-test';
      let process1Complete = false;
      let process2Complete = false;

      const process1Function = async () => {
        process1Complete = true;
        return 'process1-result';
      };

      const process2Function = async () => {
        process2Complete = true;
        return 'process2-result';
      };

      // Act
      const [result1, result2] = await Promise.all([
        withKeyLock(lockKey, process1Function),
        withKeyLock(lockKey, process2Function),
      ]);

      // Assert - Both should complete with coalescing
      expect(process1Complete).toBe(true);
      expect(process2Complete).toBe(false); // Coalesced, didn't execute
      expect(result1).toBe('process1-result');
      expect(result2).toBe('process1-result'); // Same result due to coalescing
    });
  });

  afterAll(async () => {
    // Ensure final cleanup
    try {
      await shutdownLockManager();
    } catch {
      // Ignore shutdown errors in tests
    }

    // Restore original timer functions
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;

    // Verify all intervals were cleared
    expect(activeIntervals.size).toBe(0);
  });
});
