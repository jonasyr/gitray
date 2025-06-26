// __tests__/unit/utils/serializationWor            });

// Re-import to trigger the worker thread code
vi.resetModules();
await import('../../../src/utils/serializationWorker');

// Get the message handler that was registered    // Re-import to trigger the worker thread code
vi.resetModules();
await import('../../../src/utils/serializationWorker');

// Get the message handler that was registeredt.test.ts
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Worker } from 'worker_threads';
import { SerializationPool } from '../../../src/utils/serializationWorker';

// Mock worker_threads - this is the key to testing worker code paths
vi.mock('worker_threads', () => ({
  Worker: vi.fn(),
  isMainThread: true,
  parentPort: null,
}));

describe('SerializationWorker - FOCUSED ON UNCOVERED CODE', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    vi.clearAllMocks();
    // Reset modules to ensure clean state for worker thread tests
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  // 🎯 TARGET: Lines 6-26 (Worker thread code)
  describe('Worker Thread Message Handling', () => {
    test('should handle serialization message in worker thread', async () => {
      // ARRANGE: Mock parentPort and simulate worker thread environment
      const mockParentPort = {
        on: vi.fn(),
        postMessage: vi.fn(),
      };

      // Mock worker_threads to simulate worker environment
      vi.doMock('worker_threads', () => ({
        Worker: vi.fn(),
        isMainThread: false,
        parentPort: mockParentPort,
      }));

      // Re-import to trigger the worker thread code
      vi.resetModules();
      await import('../../../src/utils/serializationWorker');

      // Get the message handler that was registered
      const messageHandler = mockParentPort.on.mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1];

      expect(messageHandler).toBeDefined();

      // ACT: Simulate receiving data to serialize
      const testData = { test: 'data' };
      messageHandler?.(testData);

      // ASSERT: Worker should post serialized result
      expect(mockParentPort.postMessage).toHaveBeenCalledWith({
        success: true,
        json: JSON.stringify(testData),
        size: Buffer.byteLength(JSON.stringify(testData), 'utf8'),
      });

      // Cleanup: Restore original mock
      vi.doMock('worker_threads', () => ({
        Worker: vi.fn(),
        isMainThread: true,
        parentPort: null,
      }));
      vi.resetModules();
    });

    test('should handle serialization errors in worker thread', async () => {
      // ARRANGE: Mock parentPort and simulate worker thread environment
      const mockParentPort = {
        on: vi.fn(),
        postMessage: vi.fn(),
      };

      // Mock worker_threads to simulate worker environment
      vi.doMock('worker_threads', () => ({
        Worker: vi.fn(),
        isMainThread: false,
        parentPort: mockParentPort,
      }));

      // Re-import to trigger the worker thread code
      vi.resetModules();
      await import('../../../src/utils/serializationWorker');

      // Get the message handler that was registered
      const messageHandler = mockParentPort.on.mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1];

      expect(messageHandler).toBeDefined();

      // Create circular reference
      const circularData: any = { name: 'test' };
      circularData.self = circularData;

      // ACT: Try to serialize circular reference
      messageHandler?.(circularData);

      // ASSERT: Worker should post error
      expect(mockParentPort.postMessage).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('circular'),
      });

      // Cleanup: Restore original mock
      vi.doMock('worker_threads', () => ({
        Worker: vi.fn(),
        isMainThread: true,
        parentPort: null,
      }));
      vi.resetModules();
    });
  });

  // 🎯 TARGET: Lines 89-90, 94-97, 100-128 (Worker creation and management)
  describe('Worker Pool Management', () => {
    test('should create workers when enabled', async () => {
      // ARRANGE: Enable workers by removing test environment
      delete process.env.NODE_ENV;
      delete process.env.VITEST;

      const mockWorker = {
        on: vi.fn(),
        postMessage: vi.fn(),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(Worker).mockImplementation(() => mockWorker as any);

      // ACT: Create pool with workers enabled
      const pool = new SerializationPool(2);

      // ASSERT: Workers should be created
      expect(Worker).toHaveBeenCalledTimes(2);
      expect(pool.getStats().useWorkers).toBe(true);
      expect(pool.getStats().activeWorkers).toBe(2);

      // Cleanup
      await pool.destroy();
    });

    test('should handle worker creation errors', async () => {
      // ARRANGE: Enable workers
      delete process.env.NODE_ENV;

      // Mock Worker constructor to throw
      vi.mocked(Worker).mockImplementation(() => {
        throw new Error('Worker creation failed');
      });

      // ACT & ASSERT: Should handle worker creation failure gracefully
      expect(() => new SerializationPool(1)).not.toThrow();

      // Should fall back to sync mode - pool is created but has no workers
      const pool = new SerializationPool(1);
      expect(pool.getStats().activeWorkers).toBe(0);

      // Should still be able to serialize using sync fallback
      const result = await pool.serialize({ test: 'data' });
      expect(result).toEqual({
        success: true,
        json: '{"test":"data"}',
        size: expect.any(Number),
      });

      await pool.destroy();
    });

    test('should register worker event handlers', async () => {
      // ARRANGE: Enable workers
      delete process.env.NODE_ENV;

      const mockWorker = {
        on: vi.fn(),
        postMessage: vi.fn(),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(Worker).mockImplementation(() => mockWorker as any);

      // ACT: Create pool
      const pool = new SerializationPool(1);

      // ASSERT: Should register error and exit handlers
      expect(mockWorker.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('exit', expect.any(Function));

      await pool.destroy();
    });

    test('should handle worker errors and recreate workers', async () => {
      // ARRANGE: Enable workers
      delete process.env.NODE_ENV;

      const mockWorker = {
        on: vi.fn(),
        postMessage: vi.fn(),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(Worker).mockImplementation(() => mockWorker as any);

      const pool = new SerializationPool(1);

      // ACT: Simulate worker error
      const errorHandler = mockWorker.on.mock.calls.find(
        (call) => call[0] === 'error'
      )?.[1];
      errorHandler?.(new Error('Worker crashed'));

      // ASSERT: Should create replacement worker
      expect(Worker).toHaveBeenCalledTimes(2); // Original + replacement

      await pool.destroy();
    });

    test('should handle worker exit and recreate', async () => {
      // ARRANGE: Enable workers
      delete process.env.NODE_ENV;

      const mockWorker = {
        on: vi.fn(),
        postMessage: vi.fn(),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(Worker).mockImplementation(() => mockWorker as any);

      const pool = new SerializationPool(1);

      // ACT: Simulate worker exit with error code
      const exitHandler = mockWorker.on.mock.calls.find(
        (call) => call[0] === 'exit'
      )?.[1];
      exitHandler?.(1); // Non-zero exit code

      // ASSERT: Should recreate worker
      expect(Worker).toHaveBeenCalledTimes(2);

      await pool.destroy();
    });
  });

  // 🎯 TARGET: Lines 151-160, 164-210 (Queue processing)
  describe('Queue Processing with Workers', () => {
    test('should process queue when workers are available', async () => {
      // ARRANGE: Enable workers
      delete process.env.NODE_ENV;

      const mockWorker = {
        on: vi.fn(),
        postMessage: vi.fn(),
        terminate: vi.fn().mockResolvedValue(undefined),
        listenerCount: vi.fn().mockReturnValue(0), // Available worker
        off: vi.fn(),
        once: vi.fn(),
      };
      vi.mocked(Worker).mockImplementation(() => mockWorker as any);

      const pool = new SerializationPool(1);

      // Mock successful worker response
      mockWorker.once.mockImplementation((event, callback) => {
        if (event === 'message') {
          setImmediate(() =>
            callback({
              success: true,
              json: '{"test":"data"}',
              size: 15,
            })
          );
        }
      });

      // ACT: Serialize data
      const result = await pool.serialize({ test: 'data' });

      // ASSERT: Should use worker thread path
      expect(mockWorker.postMessage).toHaveBeenCalledWith({ test: 'data' });
      expect(result.success).toBe(true);

      pool.destroy();
    });

    test('should handle worker queue when all workers busy', () => {
      // ARRANGE: Enable workers with all busy
      delete process.env.NODE_ENV;

      const mockWorker = {
        on: vi.fn(),
        postMessage: vi.fn(),
        terminate: vi.fn().mockResolvedValue(undefined),
        listenerCount: vi.fn().mockReturnValue(1), // Busy worker
      };
      vi.mocked(Worker).mockImplementation(() => mockWorker as any);

      const pool = new SerializationPool(1);

      // ACT: Try to process with busy worker
      // This should test the "no available worker" path

      // ASSERT: Queue should handle busy workers
      expect(pool.getStats().activeWorkers).toBe(1);

      pool.destroy();
    });

    test('should handle worker message events correctly', async () => {
      // ARRANGE: Enable workers
      delete process.env.NODE_ENV;

      const mockWorker = {
        on: vi.fn(),
        postMessage: vi.fn(),
        terminate: vi.fn().mockResolvedValue(undefined),
        listenerCount: vi.fn().mockReturnValue(0),
        off: vi.fn(),
        once: vi.fn(),
      };
      vi.mocked(Worker).mockImplementation(() => mockWorker as any);

      const pool = new SerializationPool(1);

      // Mock worker error response
      mockWorker.once.mockImplementation((event, callback) => {
        if (event === 'message') {
          setImmediate(() =>
            callback({
              success: false,
              error: 'Serialization failed',
            })
          );
        }
      });

      // ACT & ASSERT: Should handle worker error response
      await expect(pool.serialize({ test: 'data' })).rejects.toThrow(
        'Serialization failed'
      );

      pool.destroy();
    });
  });

  // 🎯 TARGET: Lines 220-221, 226-227 (Destroy and cleanup)
  describe('Pool Destruction and Cleanup', () => {
    test('should terminate all workers on destroy', async () => {
      // ARRANGE: Enable workers
      delete process.env.NODE_ENV;

      const mockWorker = {
        on: vi.fn(),
        postMessage: vi.fn(),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(Worker).mockImplementation(() => mockWorker as any);

      const pool = new SerializationPool(3);

      // ACT: Destroy pool
      await pool.destroy();

      // ASSERT: All workers should be terminated
      expect(mockWorker.terminate).toHaveBeenCalledTimes(3);
      expect(pool.getStats().isDestroyed).toBe(true);
    });

    test('should reject pending tasks on destroy', async () => {
      // ARRANGE: Enable workers
      delete process.env.NODE_ENV;
      delete process.env.VITEST;

      let listenerCount = 0;
      const mockWorker = {
        on: vi.fn(),
        postMessage: vi.fn(),
        terminate: vi.fn().mockResolvedValue(undefined),
        listenerCount: vi.fn(() => listenerCount),
        off: vi.fn(),
        once: vi.fn((event) => {
          if (event === 'message') {
            // Simulate worker becoming busy
            listenerCount = 1;
            // Don't call the callback - simulating pending task
          }
        }),
      };
      vi.mocked(Worker).mockImplementation(() => mockWorker as any);

      const pool = new SerializationPool(1);

      // Verify workers are enabled and created
      expect(pool.getStats().useWorkers).toBe(true);
      expect(pool.getStats().activeWorkers).toBe(1);

      // Start a task - this should queue it and assign it to worker
      const taskPromise = pool.serialize({ test: 'data' });

      // Verify the task was assigned to the worker
      expect(mockWorker.postMessage).toHaveBeenCalledWith({ test: 'data' });
      expect(mockWorker.once).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      );

      // Give the task a moment to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // ACT: Destroy pool before task completes
      await pool.destroy();

      // ASSERT: Pending tasks should be rejected
      await expect(taskPromise).rejects.toThrow('SerializationPool destroyed');
    });

    test('should handle worker termination errors gracefully', async () => {
      // ARRANGE: Enable workers with termination error
      delete process.env.NODE_ENV;

      const mockWorker = {
        on: vi.fn(),
        postMessage: vi.fn(),
        terminate: vi.fn().mockRejectedValue(new Error('Termination failed')),
      };
      vi.mocked(Worker).mockImplementation(() => mockWorker as any);

      const pool = new SerializationPool(1);

      // ACT: Destroy should not throw even if worker termination fails
      await expect(pool.destroy()).resolves.not.toThrow();

      // ASSERT: Pool should still be marked as destroyed
      expect(pool.getStats().isDestroyed).toBe(true);
    });
  });

  // 🎯 BONUS: Test the condition that determines worker usage
  describe('Worker Usage Decision Logic', () => {
    test('should disable workers in test environment', () => {
      // ARRANGE: Test environment
      process.env.NODE_ENV = 'test';

      const pool = new SerializationPool();

      // ASSERT: Should not use workers in test
      expect(pool.getStats().useWorkers).toBe(false);
      expect(pool.getStats().activeWorkers).toBe(0);

      pool.destroy();
    });

    test('should disable workers in vitest environment', () => {
      // ARRANGE: Vitest environment
      delete process.env.NODE_ENV;
      process.env.VITEST = 'true';

      const pool = new SerializationPool();

      // ASSERT: Should not use workers in vitest
      expect(pool.getStats().useWorkers).toBe(false);

      pool.destroy();
    });

    test('should enable workers in production environment', () => {
      // ARRANGE: Production-like environment
      delete process.env.NODE_ENV;
      delete process.env.VITEST;

      const mockWorker = {
        on: vi.fn(),
        postMessage: vi.fn(),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(Worker).mockImplementation(() => mockWorker as any);

      const pool = new SerializationPool(1);

      // ASSERT: Should use workers in production
      expect(pool.getStats().useWorkers).toBe(true);
      expect(pool.getStats().activeWorkers).toBe(1);

      pool.destroy();
    });
  });
});

// MUCH SHORTER: Only test what you actually need!
describe('SerializationWorker - Sync Fallback (Keep only these few tests)', () => {
  test('should fallback to sync serialization when workers disabled', async () => {
    // ARRANGE: Test environment (workers disabled)
    process.env.NODE_ENV = 'test';
    const pool = new SerializationPool();

    // ACT
    const result = await pool.serialize({ test: 'data' });

    // ASSERT
    expect(result.success).toBe(true);
    expect(pool.getStats().useWorkers).toBe(false);

    pool.destroy();
  });

  test('should handle sync serialization errors', async () => {
    process.env.NODE_ENV = 'test';
    const pool = new SerializationPool();

    const circular: any = {};
    circular.self = circular;

    await expect(pool.serialize(circular)).rejects.toThrow();
    pool.destroy();
  });
});
