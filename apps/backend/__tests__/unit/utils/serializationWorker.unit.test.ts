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
});
