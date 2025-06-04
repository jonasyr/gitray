// apps/backend/__tests__/utils/hybridLruCache.test.ts

import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import HybridLRUCache from '../../src/utils/hybridLruCache';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('ioredis');
jest.mock('../../src/utils/lockManager', () => ({
  withKeyLock: jest.fn(async (key: string, fn: () => Promise<unknown>) => {
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

    // Set up mock return values separately to avoid type issues
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockRedis.quit.mockResolvedValue('OK');

    // Mock Redis constructor to trigger ready event immediately
    const { default: Redis } = await import('ioredis');
    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => {
      setTimeout(() => {
        const readyHandler = mockRedis.on.mock.calls.find(
          (call: any[]) => call[0] === 'ready'
        )?.[1];
        if (readyHandler) readyHandler();
      }, 0);
      return mockRedis;
    });

    // Mock filesystem operations with default successful responses
    mockFs.mkdir.mockResolvedValue(undefined as any);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.writeFile.mockResolvedValue(undefined as any);
    (mockFs.readFile as any).mockResolvedValue('');
    mockFs.unlink.mockResolvedValue(undefined as any);
    mockFs.stat.mockResolvedValue({ mtimeMs: Date.now() } as any);

    // Create cache instance with small test configuration
    cache = new HybridLRUCache<string>({
      maxEntries: 5,
      memoryLimitBytes: 1024,
      diskPath: testDiskPath,
      lockTimeoutMs: 1000,
      redisConfig: {
        host: 'localhost',
        port: 6379,
      },
    });

    // Wait for initialization to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Clean shutdown
    if (cache) {
      await cache.quit();
    }
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

      // Act - Fill cache beyond memory limit
      for (const key of keys) {
        await cache.set(key, largeValue);
      }
      // Add one more to trigger eviction
      await cache.set('key6', largeValue);

      // Assert - First key should be evicted
      const firstResult = await cache.get('key1');
      const lastResult = await cache.get('key6');

      expect(firstResult).toBeNull();
      expect(lastResult).toBe(largeValue);
    });

    test('should evict when max entries exceeded', async () => {
      // Arrange
      const smallValue = 'small';
      const keys = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7'];

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
      const value = 'x'.repeat(250);
      await cache.set('key1', value);
      await cache.set('key2', value);
      await cache.set('key3', value);

      // Act - Access key1 to move it to most recently used
      await cache.get('key1');
      await cache.set('key4', value);
      await cache.set('key5', value);

      // Assert - key1 should still exist because it was accessed
      const key1Result = await cache.get('key1');
      const key2Result = await cache.get('key2');

      expect(key1Result).toBe(value);
      expect(key2Result).toBeNull();
    });
  });

  describe('Multi-Tier Storage - Happy Path', () => {
    test('should store in Redis when Redis is healthy', async () => {
      // Arrange
      const key = 'redis-key';
      const value = 'redis-value';
      mockRedis.get.mockResolvedValue(JSON.stringify(value));

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

      // Mock Redis to be unavailable to force disk usage
      mockRedis.set.mockRejectedValue(new Error('Redis unavailable'));

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

      // Mock disk file to exist and return value
      mockFs.readFile.mockResolvedValue(JSON.stringify(value));
      mockRedis.get.mockResolvedValue(null);

      // Simulate that disk cache has this key by pre-populating
      await cache.set(key, value);
      // Clear memory cache to force disk lookup
      (cache as any).memory.clear();

      // Act
      const result = await cache.get(key);

      // Assert
      expect(result).toBe(value);
    });
  });

  describe('Disk Cache Management - Happy Path', () => {
    test('should enforce disk entry limits', async () => {
      // Arrange
      // Mock Redis to be unavailable to force disk usage
      mockRedis.set.mockRejectedValue(new Error('Redis unavailable'));

      const keys = ['key1', 'key2', 'key3', 'key4', 'key5', 'key6'];

      // Act - Add entries beyond limit to trigger cleanup
      for (const key of keys) {
        await cache.set(key, 'value');
      }

      // Assert - Should have triggered disk cleanup
      expect(mockFs.unlink).toHaveBeenCalled();
    });

    test('should clean up disk cache on initialization', async () => {
      // Arrange
      const testFiles = ['encoded%20key1', 'encoded%20key2'];
      mockFs.readdir.mockResolvedValue(testFiles as any);
      mockFs.stat.mockResolvedValue({ mtimeMs: Date.now() - 1000 } as any);

      // Act - Create new cache instance
      const newCache = new HybridLRUCache<string>({
        maxEntries: 10,
        memoryLimitBytes: 1024,
        diskPath: testDiskPath,
      });

      // Wait for initialization
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(mockFs.readdir).toHaveBeenCalledWith(testDiskPath);

      // Cleanup
      await newCache.quit();
    });
  });

  describe('Error Handling and Rollback - Happy Path', () => {
    test('should continue operation when Redis fails', async () => {
      // Arrange
      const key = 'test-key';
      const value = 'test-value';
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      // Act
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

      // Act
      await cache.set(key, value);
      const result = await cache.get(key);

      // Assert - Should still work with memory cache
      expect(result).toBe(value);
    });

    test('should handle stale disk files gracefully', async () => {
      // Arrange
      const key = 'stale-key';

      // Mock Redis to return null (cache miss)
      mockRedis.get.mockResolvedValue(null);
      // Mock disk read to fail (stale file)
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

      // Act
      const result = await cache.get(key);

      // Assert - Should return null for missing file
      expect(result).toBeNull();
    });
  });

  describe('Cache Statistics - Happy Path', () => {
    test('should provide accurate memory statistics', async () => {
      // Arrange
      const key = 'stats-key';
      const value = 'stats-value';

      // Act
      await cache.set(key, value);
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
      expect(stats.disk.limitEntries).toBe(5);
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

      await cache.set(key, value);

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

      // Force disk storage by making Redis fail
      mockRedis.set.mockRejectedValue(new Error('Redis unavailable'));
      await cache.set(key, value);

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
      // (cache is already created in beforeEach)

      // Act
      await cache.quit();

      // Assert
      expect(mockRedis.quit).toHaveBeenCalledTimes(1);
    });
  });
});
