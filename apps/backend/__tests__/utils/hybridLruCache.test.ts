// apps/backend/__tests__/utils/hybridLruCache.test.ts

import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import HybridLRUCache from '../../src/utils/hybridLruCache';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('ioredis');
jest.mock('../../src/utils/lockManager', () => ({
  withKeyLock: jest.fn(async (key: string, fn: () => Promise<any>) => {
    const result = await fn();
    return result;
  }),
}));
jest.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('HybridLRUCache', () => {
  let cache: HybridLRUCache<string>;
  let mockRedis: any;
  const testDiskPath = '/tmp/test-cache';

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock Redis with event emitter behavior
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      quit: jest.fn(),
      on: jest.fn(),
      disconnect: jest.fn(),
    };

    // Mock Redis constructor
    const RedisMock = jest.fn().mockImplementation(() => {
      // Simulate ready event after construction
      setTimeout(() => {
        // Define a type for the 'ready' event handler.
        // It's assumed to take no arguments and return void.
        type ReadyEventHandler = () => void;

        // Define a type for the arguments array of a single call to mockRedis.on.
        // The first element is the event name (string), and the second is the handler function.
        type MockRedisOnCallArgs = [
          eventName: string,
          handler: (...args: any[]) => void,
        ];

        const readyHandler: ReadyEventHandler | undefined = (
          mockRedis.on.mock.calls as MockRedisOnCallArgs[]
        ) // Cast the array of calls to our defined type
          .find((call) => call[0] === 'ready')?.[1] as
          | ReadyEventHandler
          | undefined; // Cast the found handler to the specific ReadyEventHandler type
        if (readyHandler) readyHandler();
      }, 0);
      return mockRedis;
    });

    // Make the mock available globally
    (global as any).Redis = RedisMock;

    // Mock filesystem operations with debugging
    mockFs.mkdir.mockImplementation(async () => {
      return undefined;
    });
    mockFs.readdir.mockImplementation(async () => {
      return [];
    });
    mockFs.writeFile.mockImplementation(async () => {
      return undefined;
    });
    (mockFs.readFile as any).mockImplementation(async () => {
      return '';
    });
    mockFs.unlink.mockImplementation(async () => {
      return undefined;
    });
    mockFs.stat.mockImplementation(async () => {
      return { mtimeMs: Date.now() } as any;
    });

    // Create cache instance with test configuration
    cache = new HybridLRUCache<string>({
      maxEntries: 5, // Small for testing
      memoryLimitBytes: 1024, // 1KB limit for testing
      diskPath: testDiskPath,
      lockTimeoutMs: 1000,
      redisConfig: {
        host: 'localhost',
        port: 6379,
      },
    });

    // Wait for async initialization to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  describe('Basic Operations - Happy Path', () => {
    test('should store and retrieve value from memory cache', async () => {
      // Arrange
      const key = 'test-key';
      const value = 'test-value';

      // Act
      await cache.set(key, value);
      const result = await cache.get(key);

      // Assert
      expect(result).toBe(value);
    });

    test('should handle multiple key-value pairs', async () => {
      // Arrange
      const testPairs = [
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3'],
      ];

      // Act
      for (const [key, value] of testPairs) {
        await cache.set(key, value);
      }

      // Assert
      for (const [key, expectedValue] of testPairs) {
        const result = await cache.get(key);
        expect(result).toBe(expectedValue);
      }
    });

    test('should return null for non-existent keys', async () => {
      // Arrange
      const nonExistentKey = 'does-not-exist';

      // Act
      const result = await cache.get(nonExistentKey);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('Memory LRU Eviction - Happy Path', () => {
    test('should evict oldest entries when memory limit exceeded', async () => {
      // Arrange
      const largeValue = 'x'.repeat(300); // 300 bytes each
      const keys = ['key1', 'key2', 'key3', 'key4', 'key5'];

      // Act - Fill cache beyond memory limit (1024 bytes)
      for (const key of keys) {
        await cache.set(key, largeValue);
      }

      // Add one more to trigger eviction
      await cache.set('key6', largeValue);

      // Assert - First key should be evicted (FIFO/LRU)
      const firstResult = await cache.get('key1');
      const lastResult = await cache.get('key6');

      expect(firstResult).toBeNull(); // Should be evicted
      expect(lastResult).toBe(largeValue); // Should still exist
    });

    test('should evict when max entries exceeded', async () => {
      // Arrange
      const smallValue = 'small';
      const keys = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']; // More than maxEntries (5)

      // Act
      for (const key of keys) {
        await cache.set(key, smallValue);
      }

      // Assert - First entries should be evicted
      const firstResult = await cache.get('k1');
      const secondResult = await cache.get('k2');
      const lastResult = await cache.get('k7');

      expect(firstResult).toBeNull();
      expect(secondResult).toBeNull();
      expect(lastResult).toBe(smallValue);
    });

    test('should update LRU order on access', async () => {
      // Arrange
      const value = 'x'.repeat(250); // Large enough to trigger eviction
      await cache.set('key1', value);
      await cache.set('key2', value);
      await cache.set('key3', value);

      // Act - Access key1 to move it to end (most recently used)
      await cache.get('key1');

      // Add more entries to trigger eviction
      await cache.set('key4', value);
      await cache.set('key5', value);

      // Assert - key1 should still exist because it was accessed
      const key1Result = await cache.get('key1');
      const key2Result = await cache.get('key2'); // Should be evicted

      expect(key1Result).toBe(value);
      expect(key2Result).toBeNull();
    });
  });

  describe('Multi-Tier Storage - Happy Path', () => {
    test('should store in Redis when Redis is healthy', async () => {
      // Arrange
      const key = 'redis-key';
      const value = 'redis-value';
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue(JSON.stringify(value));

      // Wait for Redis to become healthy
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Act
      await cache.set(key, value);
      const result = await cache.get(key);

      // Assert
      expect(mockRedis.set).toHaveBeenCalledWith(key, JSON.stringify(value));
      expect(result).toBe(value);
    });

    test('should store on disk through file operations', async () => {
      // Arrange
      const key = 'disk-key';
      const value = 'disk-value';
      const expectedFilePath = path.join(testDiskPath, encodeURIComponent(key));

      // Wait for async initialization to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Act
      await cache.set(key, value);

      // Assert
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expectedFilePath,
        JSON.stringify(value)
      );
    });

    test('should retrieve from disk when memory cache miss', async () => {
      // Arrange
      const key = 'disk-key';
      const value = 'disk-value';
      const filePath = path.join(testDiskPath, encodeURIComponent(key));

      // Setup disk cache to return value
      mockFs.readFile.mockResolvedValue(JSON.stringify(value));

      // Simulate disk cache has the file by directly adding to disk map
      const diskCache = (cache as any).disk;
      diskCache.set(key, filePath);

      // Ensure Redis returns null to force disk lookup
      mockRedis.get.mockResolvedValue(null);

      // Act
      const result = await cache.get(key);

      // Assert
      expect(mockFs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
      expect(result).toBe(value);
    });
  });

  describe('Disk Cache Management - Happy Path', () => {
    test('should enforce disk entry limits', async () => {
      // Arrange
      const diskMap = (cache as any).disk;
      const testFiles = ['file1', 'file2', 'file3', 'file4', 'file5', 'file6'];

      // Simulate disk cache being full (maxEntries is 5)
      testFiles.forEach((file, index) => {
        diskMap.set(`key${index}`, `/tmp/${file}`);
      });

      // Wait for async initialization to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Act - Add one more entry to trigger eviction
      await cache.set('newkey', 'newvalue');

      // Assert - Should have triggered disk cleanup
      expect(mockFs.unlink).toHaveBeenCalled();
    });

    test('should clean up disk cache on initialization', async () => {
      // Arrange
      const testFiles = ['encoded%20key1', 'encoded%20key2'];
      mockFs.readdir.mockResolvedValue(testFiles as any);
      mockFs.stat.mockResolvedValue({ mtimeMs: Date.now() - 1000 } as any);

      // Act - Create new cache instance (triggers initialization)
      new HybridLRUCache<string>({
        maxEntries: 10,
        memoryLimitBytes: 1024,
        diskPath: testDiskPath,
      });

      // Wait for async initialization to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Assert
      expect(mockFs.readdir).toHaveBeenCalledWith(testDiskPath);
      expect(mockFs.stat).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Rollback - Happy Path', () => {
    test('should continue operation when Redis fails', async () => {
      // Arrange
      const key = 'test-key';
      const value = 'test-value';
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      // Act - Should not throw error
      await cache.set(key, value);
      const result = await cache.get(key);

      // Assert - Should still work with memory cache
      expect(result).toBe(value);
    });

    test('should continue operation when disk write fails', async () => {
      // Arrange
      const key = 'test-key';
      const value = 'test-value';
      mockFs.writeFile.mockRejectedValue(new Error('Disk full'));

      // Act - Should not throw error
      await cache.set(key, value);
      const result = await cache.get(key);

      // Assert - Should still work with memory cache
      expect(result).toBe(value);
    });

    test('should handle stale disk files gracefully', async () => {
      // Arrange
      const key = 'stale-key';
      const filePath = path.join(testDiskPath, encodeURIComponent(key));
      const diskMap = (cache as any).disk;
      diskMap.set(key, filePath);

      // Ensure Redis returns null to force disk lookup
      mockRedis.get.mockResolvedValue(null);

      // Simulate file not found (stale reference)
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

      // Act
      const result = await cache.get(key);

      // Assert - Should return null and clean up stale reference
      expect(result).toBeNull();
    });
  });

  describe('Cache Statistics - Happy Path', () => {
    test('should provide accurate memory statistics', () => {
      // Arrange
      const key = 'stats-key';
      const value = 'stats-value';

      // Act
      cache.set(key, value); // Don't await to keep it in memory only
      const stats = cache.getStats();

      // Assert
      expect(stats.memory.entries).toBeGreaterThan(0);
      expect(stats.memory.usageBytes).toBeGreaterThan(0);
      expect(stats.memory.limitBytes).toBe(1024);
    });

    test('should provide disk statistics', () => {
      // Arrange & Act
      const stats = cache.getStats();

      // Assert
      expect(stats.disk.entries).toBeGreaterThanOrEqual(0);
      expect(stats.disk.limitEntries).toBe(5); // maxEntries from config
    });

    test('should provide Redis health status', () => {
      // Arrange & Act
      const stats = cache.getStats();

      // Assert
      expect(stats.redis).toHaveProperty('healthy');
      expect(stats.redis).toHaveProperty('connected');
      expect(typeof stats.redis.healthy).toBe('boolean');
      expect(typeof stats.redis.connected).toBe('boolean');
    });
  });

  describe('Cache Deletion - Happy Path', () => {
    test('should delete from all tiers successfully', async () => {
      // Arrange
      const key = 'delete-key';
      const value = 'delete-value';

      // Wait for Redis to become healthy
      await new Promise((resolve) => setTimeout(resolve, 10));

      await cache.set(key, value);
      mockRedis.del.mockResolvedValue(1);

      // Act
      await cache.del(key);

      // Assert
      const result = await cache.get(key);
      expect(result).toBeNull();
      expect(mockRedis.del).toHaveBeenCalledWith(key);
    });

    test('should remove disk files on deletion', async () => {
      // Arrange
      const key = 'disk-delete-key';
      const value = 'disk-value';
      const filePath = path.join(testDiskPath, encodeURIComponent(key));

      // First store the value to ensure it exists in disk
      await cache.set(key, value);

      // Simulate disk cache entry exists
      const diskMap = (cache as any).disk;
      diskMap.set(key, filePath);

      // Act
      await cache.del(key);

      // Assert
      expect(mockFs.unlink).toHaveBeenCalledWith(filePath);
    });
  });

  describe('Cache Lifecycle - Happy Path', () => {
    test('should initialize successfully', () => {
      // Arrange & Act
      const newCache = new HybridLRUCache<string>({
        maxEntries: 100,
        memoryLimitBytes: 2048,
        diskPath: '/tmp/new-cache',
      });

      // Assert
      expect(newCache).toBeInstanceOf(HybridLRUCache);
      expect(newCache.isHealthy()).toBe(true);
    });

    test('should shutdown all connections cleanly', async () => {
      // Arrange
      mockRedis.quit.mockResolvedValue('OK');

      // Act
      await cache.quit();

      // Assert
      expect(mockRedis.quit).toHaveBeenCalledTimes(1);
    });
  });
});
