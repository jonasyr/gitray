// apps/backend/__tests__/utils/lockManager.test.ts

import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies before importing the module
jest.mock('fs/promises');
jest.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/config', () => ({
  lockConfig: {
    lockDir: '/tmp/test-locks',
    defaultTimeoutMs: 5000,
    cleanupIntervalMs: 10000,
    staleLockAgeMs: 30000,
    enableLockLogging: true,
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

// Import after mocking
let withKeyLock: any;
let getLockMetrics: any;
let getActiveLocks: any;
let shutdownLockManager: any;

describe('Lock Manager', () => {
  let mockFileHandle: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset module cache to get fresh instance
    jest.resetModules();

    // Create mock file handle with proper methods
    mockFileHandle = {
      writeFile: jest.fn().mockImplementation(() => Promise.resolve()),
      close: jest.fn().mockImplementation(() => Promise.resolve()),
    };

    // Use mockImplementation to ensure fs.open returns our mock handle
    mockFs.mkdir.mockImplementation(() => Promise.resolve(undefined as any));
    mockFs.open.mockImplementation(() => Promise.resolve(mockFileHandle));
    mockFs.unlink.mockImplementation(() => Promise.resolve(undefined as any));
    mockFs.readdir.mockImplementation(() => Promise.resolve([]));
    mockFs.stat.mockImplementation(() =>
      Promise.resolve({
        mtimeMs: Date.now() - 1000,
      } as any)
    );

    // Import fresh instances AFTER setting up mocks
    const lockManagerModule = await import('../../src/utils/lockManager');
    withKeyLock = lockManagerModule.withKeyLock;
    getLockMetrics = lockManagerModule.getLockMetrics;
    getActiveLocks = lockManagerModule.getActiveLocks;
    shutdownLockManager = lockManagerModule.shutdownLockManager;
  });

  afterEach(async () => {
    jest.useRealTimers();
    await shutdownLockManager();
  });

  describe('Basic Lock Operations - Happy Path', () => {
    test('should acquire and release lock successfully', async () => {
      // Arrange
      const lockKey = 'test-lock';
      const expectedLockPath = path.join(
        '/tmp/test-locks',
        encodeURIComponent(lockKey)
      );
      const executionOrder: string[] = [];

      const testFunction = async () => {
        executionOrder.push('function-start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push('function-end');
        return 'success';
      };

      // Act
      const resultPromise = withKeyLock(lockKey, testFunction);
      // Advance timers to allow setTimeout to complete
      jest.advanceTimersByTime(100);
      const result = await resultPromise;

      // Assert
      expect(result).toBe('success');
      expect(mockFs.mkdir).toHaveBeenCalledWith('/tmp/test-locks', {
        recursive: true,
      });
      expect(mockFs.open).toHaveBeenCalledWith(expectedLockPath, 'wx');
      expect(mockFileHandle.writeFile).toHaveBeenCalled();
      expect(mockFileHandle.close).toHaveBeenCalled();
      expect(mockFs.unlink).toHaveBeenCalledWith(expectedLockPath);
      expect(executionOrder).toEqual(['function-start', 'function-end']);
    });

    test('should handle async function execution correctly', async () => {
      // Arrange
      const lockKey = 'async-test';
      let executedValue = '';

      const asyncTestFunction = async () => {
        executedValue = 'started';
        await new Promise((resolve) => setTimeout(resolve, 50));
        executedValue = 'completed';
        return { status: 'done', value: executedValue };
      };

      // Act
      const resultPromise = withKeyLock(lockKey, asyncTestFunction);
      jest.advanceTimersByTime(100);
      const result = await resultPromise;

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
        await new Promise((resolve) => setTimeout(resolve, 100));
        return `execution-${executionCount}`;
      };

      // Act
      const promises = [
        withKeyLock(lockKey, testFunction),
        withKeyLock(lockKey, testFunction),
        withKeyLock(lockKey, testFunction),
      ];

      jest.advanceTimersByTime(200);
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
        await new Promise((resolve) => setTimeout(resolve, 50));
        throw expectedError;
      };

      // Act & Assert
      const promises = [
        withKeyLock(lockKey, errorFunction),
        withKeyLock(lockKey, errorFunction),
      ];

      jest.advanceTimersByTime(100);
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

      // Act
      await withKeyLock(lockKey, testFunction);
      const metrics = getLockMetrics();

      // Assert
      expect(metrics.acquisitions).toBe(1);
      expect(metrics.averageWaitTime).toBeGreaterThanOrEqual(0);
      expect(metrics.currentLocks).toBe(0);
    });

    test('should track multiple lock operations', async () => {
      // Arrange
      const testFunction = async () => 'success';

      // Act
      await withKeyLock('key1', testFunction);
      await withKeyLock('key2', testFunction);
      await withKeyLock('key3', testFunction);

      const metrics = getLockMetrics();

      // Assert
      expect(metrics.acquisitions).toBe(3);
      expect(metrics.currentLocks).toBe(0);
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
    test('should clean up stale locks automatically', async () => {
      // Arrange
      const staleLockFiles = ['stale-lock-1', 'stale-lock-2'];
      const currentTime = Date.now();

      mockFs.readdir.mockResolvedValue(staleLockFiles as any);
      mockFs.stat.mockImplementation(() => {
        return Promise.resolve({
          mtimeMs: currentTime - 60000, // 60 seconds old (stale)
        } as any);
      });

      // Act - Trigger cleanup by advancing timer
      jest.advanceTimersByTime(10000); // cleanupIntervalMs
      await jest.runAllTimersAsync();

      // Assert
      expect(mockFs.readdir).toHaveBeenCalledWith('/tmp/test-locks');
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
      jest.advanceTimersByTime(10000);
      await jest.runAllTimersAsync();

      // Assert
      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join('/tmp/test-locks', 'stale-lock')
      );
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
      const customTimeout = 2000;
      const testFunction = async () => 'success';

      const lockExistsError = new Error('File exists');
      (lockExistsError as any).code = 'EEXIST';
      mockFs.open.mockRejectedValue(lockExistsError);

      // Act & Assert
      jest.setTimeout(3000); // Increase test timeout

      const promise = withKeyLock(lockKey, testFunction, customTimeout);
      jest.advanceTimersByTime(customTimeout + 100);

      await expect(promise).rejects.toThrow(/timeout/i);
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
      // Arrange
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      // Act
      await shutdownLockManager();

      // Assert
      expect(clearIntervalSpy).toHaveBeenCalled();
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
        await new Promise((resolve) => setTimeout(resolve, 100));
        process1Complete = true;
        return 'process1-result';
      };

      const process2Function = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        process2Complete = true;
        return 'process2-result';
      };

      // Act
      const promises = Promise.all([
        withKeyLock(lockKey, process1Function),
        withKeyLock(lockKey, process2Function),
      ]);

      jest.advanceTimersByTime(200);
      const [result1, result2] = await promises;

      // Assert - Both should complete with coalescing
      expect(process1Complete).toBe(true);
      expect(process2Complete).toBe(false); // Coalesced, didn't execute
      expect(result1).toBe('process1-result');
      expect(result2).toBe('process1-result'); // Same result due to coalescing
    });
  });
});
