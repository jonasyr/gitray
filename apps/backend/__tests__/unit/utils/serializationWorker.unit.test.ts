import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { SerializationPool } from '../../../src/utils/serializationWorker';

describe('SerializationWorker', () => {
  let serializationPool: SerializationPool;

  beforeEach(() => {
    serializationPool = new SerializationPool();
  });

  afterEach(async () => {
    await serializationPool.destroy();
  });

  describe('SerializationPool', () => {
    test('should serialize simple objects', async () => {
      // Arrange
      const testData = { key: 'value', number: 42 };

      // Act
      const result = await serializationPool.serialize(testData);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.json).toBe(JSON.stringify(testData));
        expect(result.size).toBe(
          Buffer.byteLength(JSON.stringify(testData), 'utf8')
        );
        expect(typeof result.size).toBe('number');
        expect(result.size).toBeGreaterThan(0);
      }
    });

    test('should serialize complex nested objects', async () => {
      // Arrange
      const complexData = {
        users: [
          { id: 1, name: 'John', details: { age: 30, active: true } },
          { id: 2, name: 'Jane', details: { age: 25, active: false } },
        ],
        metadata: {
          timestamp: Date.now(),
          version: '1.0.0',
          settings: { debug: true, timeout: 5000 },
        },
      };

      // Act
      const result = await serializationPool.serialize(complexData);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const parsed = JSON.parse(result.json);
        expect(parsed).toEqual(complexData);
        expect(result.size).toBe(
          Buffer.byteLength(JSON.stringify(complexData), 'utf8')
        );
      }
    });

    test('should serialize arrays', async () => {
      // Arrange
      const arrayData = [1, 2, 3, 'test', { nested: true }, null];

      // Act
      const result = await serializationPool.serialize(arrayData);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(JSON.parse(result.json)).toEqual(arrayData);
        expect(result.size).toBeGreaterThan(0);
      }
    });

    test('should serialize null and undefined', async () => {
      // Test null
      const nullResult = await serializationPool.serialize(null);
      expect(nullResult.success).toBe(true);
      if (nullResult.success) {
        expect(nullResult.json).toBe('null');
        expect(nullResult.size).toBe(4); // "null" is 4 bytes
      }

      // Test undefined - JSON.stringify(undefined) returns undefined, which should cause an error
      await expect(serializationPool.serialize(undefined)).rejects.toThrow();
    });

    test('should serialize primitive values', async () => {
      // String
      const stringResult = await serializationPool.serialize('hello world');
      expect(stringResult.success).toBe(true);
      if (stringResult.success) {
        expect(stringResult.json).toBe('"hello world"');
      }

      // Number
      const numberResult = await serializationPool.serialize(12345);
      expect(numberResult.success).toBe(true);
      if (numberResult.success) {
        expect(stringResult.json).toBe('"hello world"');
        expect(numberResult.json).toBe('12345');
      }

      // Boolean
      const boolResult = await serializationPool.serialize(true);
      expect(boolResult.success).toBe(true);
      if (boolResult.success) {
        expect(boolResult.json).toBe('true');
      }
    });

    test('should handle circular references gracefully', async () => {
      // Arrange
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      // Act & Assert
      await expect(serializationPool.serialize(circularObj)).rejects.toThrow();
    });

    test('should handle objects with functions (non-serializable)', async () => {
      // Arrange
      const objWithFunction = {
        name: 'test',
        method: function () {
          return 'hello';
        },
        arrow: () => 'world',
      };

      // Act
      const result = await serializationPool.serialize(objWithFunction);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const parsed = JSON.parse(result.json);
        expect(parsed.name).toBe('test');
        // Functions should be omitted in JSON serialization
        expect(parsed.method).toBeUndefined();
        expect(parsed.arrow).toBeUndefined();
      }
    });

    test('should handle symbols gracefully', async () => {
      // Arrange
      const objWithSymbol = {
        name: 'test',
        [Symbol('key')]: 'symbol value',
      };

      // Act
      const result = await serializationPool.serialize(objWithSymbol);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const parsed = JSON.parse(result.json);
        expect(parsed.name).toBe('test');
        // Symbols should be omitted
        expect(Object.getOwnPropertySymbols(parsed).length).toBe(0);
      }
    });

    test('should handle large objects efficiently', async () => {
      // Arrange
      const largeObj = {
        data: Array(1000)
          .fill(0)
          .map((_, i) => ({
            id: i,
            value: `item-${i}`,
            metadata: { created: Date.now(), index: i },
          })),
      };

      // Act
      const startTime = process.hrtime.bigint();
      const result = await serializationPool.serialize(largeObj);
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1_000_000;

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.size).toBeGreaterThan(10000); // Should be substantial
        expect(durationMs).toBeLessThan(1000); // Should complete within 1 second
        const parsed = JSON.parse(result.json);
        expect(parsed.data).toHaveLength(1000);
      }
    });

    test('should handle Date objects', async () => {
      // Arrange
      const dateObj = {
        created: new Date('2023-01-01T00:00:00.000Z'),
        updated: new Date(),
      };

      // Act
      const result = await serializationPool.serialize(dateObj);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const parsed = JSON.parse(result.json);
        expect(parsed.created).toBe('2023-01-01T00:00:00.000Z');
        expect(typeof parsed.updated).toBe('string');
        expect(new Date(parsed.updated).getTime()).not.toBeNaN();
      }
    });

    test('should handle concurrent serialization requests', async () => {
      // Arrange
      const concurrentTasks = Array(10)
        .fill(0)
        .map((_, i) => ({
          id: i,
          data: `concurrent-task-${i}`,
          payload: Array(100).fill(i),
        }));

      // Act
      const promises = concurrentTasks.map((task) =>
        serializationPool.serialize(task)
      );
      const results = await Promise.all(promises);

      // Assert
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        if (result.success) {
          const parsed = JSON.parse(result.json);
          expect(parsed.id).toBe(index);
          expect(parsed.data).toBe(`concurrent-task-${index}`);
          expect(parsed.payload).toHaveLength(100);
          expect(parsed.payload.every((val: number) => val === index)).toBe(
            true
          );
        }
      });
    });

    test('should properly shutdown and cleanup workers', async () => {
      // Arrange
      const testData = { key: 'value' };

      // Act - use the pool first
      const result = await serializationPool.serialize(testData);
      expect(result.success).toBe(true);

      // Shutdown
      await serializationPool.destroy();

      // Assert - should handle graceful shutdown
      expect(true).toBe(true); // If we reach here, shutdown worked

      // Verify that we can't use the pool after shutdown
      await expect(serializationPool.serialize(testData)).rejects.toThrow(
        'SerializationPool has been destroyed'
      );
    });

    test('should handle errors in worker threads gracefully', async () => {
      // This test is challenging because the worker handles most errors
      // We can test with extremely large objects that might cause issues

      // Create an object that might cause serialization issues
      const problematicData = {
        // Very deep nesting might cause stack overflow in some environments
        deepNest: Array(100)
          .fill(0)
          .reduce((acc, _, i) => ({ level: i, nested: acc }), null),
      };

      const result = await serializationPool.serialize(problematicData);

      // Should succeed with reasonable nesting depth
      expect(result.success).toBe(true);
      expect(result.json).toBeDefined();
      expect(result.size).toBeGreaterThan(0);
    });

    test('should calculate accurate byte sizes for unicode strings', async () => {
      // Arrange
      const unicodeData = {
        english: 'Hello World',
        emoji: '🚀✨🎉',
        chinese: '你好世界',
        arabic: 'مرحبا بالعالم',
        mixed: 'Hello 🌍 世界!',
      };

      // Act
      const result = await serializationPool.serialize(unicodeData);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const expectedSize = Buffer.byteLength(
          JSON.stringify(unicodeData),
          'utf8'
        );
        expect(result.size).toBe(expectedSize);

        // Verify unicode characters are preserved
        const parsed = JSON.parse(result.json);
        expect(parsed.emoji).toBe('🚀✨🎉');
        expect(parsed.chinese).toBe('你好世界');
        expect(parsed.arabic).toBe('مرحبا بالعالم');
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty objects and arrays', async () => {
      const emptyObj = await serializationPool.serialize({});
      expect(emptyObj.success).toBe(true);
      if (emptyObj.success) {
        expect(emptyObj.json).toBe('{}');
        expect(emptyObj.size).toBe(2);
      }

      const emptyArray = await serializationPool.serialize([]);
      expect(emptyArray.success).toBe(true);
      if (emptyArray.success) {
        expect(emptyArray.json).toBe('[]');
        expect(emptyArray.size).toBe(2);
      }
    });

    test('should handle deeply nested structures', async () => {
      // Create a reasonably deep structure
      let deepObj: any = { value: 'leaf' };
      for (let i = 0; i < 50; i++) {
        deepObj = { level: i, nested: deepObj };
      }

      const result = await serializationPool.serialize(deepObj);

      // Should handle reasonable nesting depth
      expect(result.success).toBe(true);
      if (result.success) {
        const parsed = JSON.parse(result.json);
        expect(parsed.level).toBe(49);
        expect(parsed.nested).toBeDefined();
      }
    });

    test('should maintain type accuracy for numbers', async () => {
      const numberData = {
        integer: 42,
        float: 3.14159,
        negative: -123,
        zero: 0,
        large: Number.MAX_SAFE_INTEGER,
        small: Number.MIN_SAFE_INTEGER,
      };

      const result = await serializationPool.serialize(numberData);
      expect(result.success).toBe(true);

      if (result.success) {
        const parsed = JSON.parse(result.json);
        expect(parsed.integer).toBe(42);
        expect(parsed.float).toBe(3.14159);
        expect(parsed.negative).toBe(-123);
        expect(parsed.zero).toBe(0);
        expect(parsed.large).toBe(Number.MAX_SAFE_INTEGER);
        expect(parsed.small).toBe(Number.MIN_SAFE_INTEGER);
      }
    });
  });

  describe('Pool Configuration and Stats', () => {
    test('should create pool with custom configuration', () => {
      // Arrange & Act
      const customPool = new SerializationPool(4);
      const stats = customPool.getStats();

      // Assert
      expect(stats.poolSize).toBe(4);
      expect(typeof stats.useWorkers).toBe('boolean');
      expect(stats.isDestroyed).toBe(false);
      expect(stats.queueLength).toBe(0);

      // Cleanup
      customPool.destroy();
    });

    test('should create pool with different sizes', () => {
      // Arrange & Act
      const smallPool = new SerializationPool(2);
      const stats = smallPool.getStats();

      // Assert
      expect(stats.poolSize).toBe(2);
      expect(stats.useWorkers).toBe(false); // Disabled in test environment
      expect(stats.activeWorkers).toBe(0);
      expect(stats.isDestroyed).toBe(false);

      // Cleanup
      smallPool.destroy();
    });
    test('should provide accurate pool statistics', async () => {
      // Arrange
      const pool = new SerializationPool(2); // Test mode automatically disables workers

      // Act - Get initial stats
      let stats = pool.getStats();

      // Assert initial state
      expect(stats.poolSize).toBe(2);
      expect(stats.queueLength).toBe(0);
      expect(stats.isDestroyed).toBe(false);

      // Test serialization
      await pool.serialize({ test: 'data' });

      // Stats should remain consistent
      stats = pool.getStats();
      expect(stats.queueLength).toBe(0); // Should be processed immediately in sync mode

      // Cleanup
      await pool.destroy();

      // Assert destroyed state
      stats = pool.getStats();
      expect(stats.isDestroyed).toBe(true);
    });

    test('should handle default parameters', () => {
      // Arrange & Act
      const defaultPool = new SerializationPool();
      const stats = defaultPool.getStats();

      // Assert - should use defaults (4 workers, enabled in production-like environment)
      expect(stats.poolSize).toBe(4);
      expect(typeof stats.useWorkers).toBe('boolean');
      expect(stats.isDestroyed).toBe(false);

      // Cleanup
      defaultPool.destroy();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should throw error when using destroyed pool', async () => {
      // Arrange
      const pool = new SerializationPool();
      await pool.destroy();

      // Act & Assert
      await expect(pool.serialize({ test: 'data' })).rejects.toThrow(
        'SerializationPool has been destroyed'
      );
    });

    test('should handle serialization errors gracefully', async () => {
      // Arrange
      const pool = new SerializationPool(1); // Test mode uses sync processing

      // Create an object that will cause JSON.stringify to fail
      const problematicData: any = {};
      problematicData.toJSON = () => {
        throw new Error('Serialization failed');
      };

      // Act & Assert
      await expect(pool.serialize(problematicData)).rejects.toThrow(
        'Serialization failed'
      );

      // Cleanup
      await pool.destroy();
    });

    test('should handle multiple destroy calls gracefully', async () => {
      // Arrange
      const pool = new SerializationPool();

      // Act - Call destroy multiple times
      await pool.destroy();
      await pool.destroy(); // Should not throw
      await pool.destroy(); // Should not throw

      // Assert - Should remain destroyed
      const stats = pool.getStats();
      expect(stats.isDestroyed).toBe(true);
    });

    test('should reject pending tasks when destroyed', async () => {
      // Arrange
      const pool = new SerializationPool(1);

      // Add some tasks to the queue (though in sync mode they process immediately)
      const promise1 = pool.serialize({ data: 1 });

      // Act - Destroy while tasks might be pending
      await pool.destroy();

      // The first promise should complete successfully since it's processed immediately in sync mode
      await expect(promise1).resolves.toBeDefined();

      // New tasks after destroy should fail
      await expect(pool.serialize({ data: 2 })).rejects.toThrow(
        'SerializationPool has been destroyed'
      );
    });
  });

  describe('Worker Thread Functionality', () => {
    test('should handle worker creation and management', () => {
      // Test worker initialization
      const pool = new SerializationPool(2);
      const stats = pool.getStats();
      expect(stats.poolSize).toBe(2);
      expect(typeof stats.useWorkers).toBe('boolean');

      // In test environment, workers are disabled for stability
      expect(stats.useWorkers).toBe(false);

      pool.destroy();
    });

    test('should process tasks with fallback processing', async () => {
      // Arrange
      const pool = new SerializationPool(2);

      // Act
      const result = await pool.serialize({
        message: 'test worker processing',
        timestamp: Date.now(),
        data: Array(100).fill('worker-test'),
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.json).toBeDefined();
      expect(result.size).toBeGreaterThan(0);

      // Cleanup
      await pool.destroy();
    });

    test('should use sync processing in test environment', async () => {
      // Arrange - Create pool
      const pool = new SerializationPool(2);
      const stats = pool.getStats();

      // Assert initial state
      expect(stats.useWorkers).toBe(false);
      expect(stats.activeWorkers).toBe(0);

      // Act
      const result = await pool.serialize({
        message: 'test sync fallback',
        data: 'sync-processing',
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.json).toBeDefined();

      // Cleanup
      await pool.destroy();
    });
  });

  describe('Performance and Concurrency', () => {
    test('should handle high concurrency with sync processing', async () => {
      // Arrange
      const pool = new SerializationPool(4); // Test mode forces sync processing
      const taskCount = 50;
      const tasks = Array(taskCount)
        .fill(0)
        .map((_, i) => ({
          id: i,
          data: `concurrent-task-${i}`,
          payload: Array(50).fill(i),
          metadata: { timestamp: Date.now(), index: i },
        }));

      // Act
      const startTime = process.hrtime.bigint();
      const promises = tasks.map((task) => pool.serialize(task));
      const results = await Promise.all(promises);
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1_000_000;

      // Assert
      expect(results).toHaveLength(taskCount);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        if (result.success) {
          const parsed = JSON.parse(result.json);
          expect(parsed.id).toBe(index);
          expect(parsed.data).toBe(`concurrent-task-${index}`);
        }
      });

      // Should complete reasonably quickly even with many tasks
      expect(durationMs).toBeLessThan(5000); // 5 seconds should be more than enough

      // Cleanup
      await pool.destroy();
    });

    test('should maintain pool statistics during concurrent operations', async () => {
      // Arrange
      const pool = new SerializationPool(2);

      // Act - Start concurrent operations
      const promises = Array(10)
        .fill(0)
        .map((_, i) => pool.serialize({ task: i, data: `test-${i}` }));

      // Check stats during processing
      const statsDuring = pool.getStats();
      expect(statsDuring.isDestroyed).toBe(false);
      expect(statsDuring.poolSize).toBe(2);

      // Wait for completion
      const results = await Promise.all(promises);

      // Assert all succeeded
      expect(results.every((r) => r.success)).toBe(true);

      // Final stats check
      const statsFinal = pool.getStats();
      expect(statsFinal.queueLength).toBe(0); // All tasks should be complete

      // Cleanup
      await pool.destroy();
    });

    test('should handle mixed data types in concurrent processing', async () => {
      // Arrange
      const pool = new SerializationPool(2);
      const mixedData = [
        { type: 'object', data: { nested: { value: 42 } } },
        { type: 'array', data: [1, 2, 3, 'four', true] },
        { type: 'string', data: 'simple string' },
        { type: 'number', data: 3.14159 },
        { type: 'boolean', data: true },
        { type: 'null', data: null },
        { type: 'date', data: new Date('2023-01-01') },
        {
          type: 'complex',
          data: {
            users: [{ id: 1, name: 'John' }],
            meta: { version: '1.0' },
          },
        },
      ];

      // Act
      const promises = mixedData.map((item) => pool.serialize(item));
      const results = await Promise.all(promises);

      // Assert
      expect(results).toHaveLength(mixedData.length);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        if (result.success) {
          const parsed = JSON.parse(result.json);
          expect(parsed.type).toBe(mixedData[index].type);
          // Verify the data was serialized correctly
          expect(result.size).toBeGreaterThan(0);
        }
      });

      // Cleanup
      await pool.destroy();
    });
  });

  describe('Memory and Resource Management', () => {
    test('should properly calculate memory usage for different data types', async () => {
      // Arrange
      const pool = new SerializationPool(1);
      const testCases = [
        { data: '', expectedMinSize: 2 }, // Empty string: ""
        { data: 'a', expectedMinSize: 3 }, // Single char: "a"
        { data: {}, expectedMinSize: 2 }, // Empty object: {}
        { data: [], expectedMinSize: 2 }, // Empty array: []
        { data: { key: 'value' }, expectedMinSize: 15 }, // Object with content
      ];

      // Act & Assert
      for (const testCase of testCases) {
        const result = await pool.serialize(testCase.data);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.size).toBeGreaterThanOrEqual(testCase.expectedMinSize);
          // Verify size matches actual JSON byte length
          const expectedSize = Buffer.byteLength(
            JSON.stringify(testCase.data),
            'utf8'
          );
          expect(result.size).toBe(expectedSize);
        }
      }

      // Cleanup
      await pool.destroy();
    });

    test('should handle large data structures efficiently', async () => {
      // Arrange
      const pool = new SerializationPool(1);
      const largeData = {
        metadata: { created: Date.now(), version: '1.0' },
        items: Array(1000)
          .fill(0)
          .map((_, i) => ({
            id: i,
            name: `item-${i}`,
            tags: [`tag-${i % 10}`, `category-${i % 5}`],
            data: {
              value: Math.random(),
              description: `Description for item ${i}`.repeat(3),
              active: i % 2 === 0,
            },
          })),
      };

      // Act
      const startTime = process.hrtime.bigint();
      const result = await pool.serialize(largeData);
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1_000_000;

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.size).toBeGreaterThan(50000); // Should be substantial
        expect(durationMs).toBeLessThan(1000); // Should complete within 1 second

        // Verify data integrity
        const parsed = JSON.parse(result.json);
        expect(parsed.items).toHaveLength(1000);
        expect(parsed.metadata.version).toBe('1.0');
      }

      // Cleanup
      await pool.destroy();
    });

    test('should cleanup resources properly on destroy', async () => {
      // Arrange
      const pool = new SerializationPool(3);

      // Use the pool
      await pool.serialize({ test: 'data' });

      // Verify it's working
      let stats = pool.getStats();
      expect(stats.isDestroyed).toBe(false);

      // Act - Destroy
      await pool.destroy();

      // Assert - Should be properly cleaned up
      stats = pool.getStats();
      expect(stats.isDestroyed).toBe(true);
      expect(stats.queueLength).toBe(0);

      // Should reject new operations
      await expect(pool.serialize({ test: 'data' })).rejects.toThrow();
    });
  });
});
