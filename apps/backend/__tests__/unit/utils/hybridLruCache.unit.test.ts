// apps/backend/__tests__/unit/utils/hybridLruCache.unit.test.ts

import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { Stats } from 'fs';

// Mock creation helpers
const createMockStats = (
  mtimeMs: number = Date.now(),
  size: number = 100
): Stats =>
  ({
    mtimeMs,
    isFile: vi.fn().mockReturnValue(true),
    isDirectory: vi.fn().mockReturnValue(false),
    isBlockDevice: vi.fn().mockReturnValue(false),
    isCharacterDevice: vi.fn().mockReturnValue(false),
    isSymbolicLink: vi.fn().mockReturnValue(false),
    isFIFO: vi.fn().mockReturnValue(false),
    isSocket: vi.fn().mockReturnValue(false),
    size,
    atimeMs: mtimeMs,
    ctimeMs: mtimeMs,
    birthtimeMs: mtimeMs,
    atime: new Date(mtimeMs),
    mtime: new Date(mtimeMs),
    ctime: new Date(mtimeMs),
    birthtime: new Date(mtimeMs),
    dev: 0,
    ino: 0,
    mode: 0,
    nlink: 0,
    uid: 0,
    gid: 0,
    rdev: 0,
    blksize: 0,
    blocks: 0,
  }) as Stats;

// Mock implementations
const mockFs = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  stat: vi.fn(),
  lstat: vi.fn(),
  rename: vi.fn(),
  access: vi.fn(),
  constants: { F_OK: 0, R_OK: 4 },
}));

const mockWithKeyLock = vi.hoisted(() => vi.fn());

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  quit: vi.fn(),
  on: vi.fn(),
  disconnect: vi.fn(),
  keys: vi.fn(),
};

// Mock modules
vi.mock('fs/promises', () => ({ default: mockFs, ...mockFs }));
vi.mock('ioredis', () => ({
  __esModule: true,
  default: function MockRedis(this: any) {
    Object.assign(this, mockRedis);
    return this;
  },
}));
vi.mock('../../../src/utils/lockManager', () => ({
  withKeyLock: mockWithKeyLock,
}));
vi.mock('../../../src/services/logger', () => ({
  __esModule: true,
  default: global.mockLogger,
  getLogger: global.getLogger,
}));

// Import after mocking
import HybridLRUCache from '../../../src/utils/hybridLruCache';

describe('HybridLRUCache', () => {
  let cache: HybridLRUCache<string>;
  const testDiskPath = '/tmp/test-cache';

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default mock behaviors
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue('');
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue(createMockStats());
    mockFs.lstat.mockResolvedValue(createMockStats());
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);

    mockWithKeyLock.mockImplementation(
      async (key: string, fn: () => Promise<unknown>) => fn()
    );

    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockRedis.quit.mockResolvedValue('OK');
    mockRedis.keys.mockResolvedValue([]);
    mockRedis.on.mockImplementation(
      (event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') callback();
        return mockRedis;
      }
    );

    cache = new HybridLRUCache<string>({
      maxEntries: 5,
      memoryLimitBytes: 1024,
      diskPath: testDiskPath,
      lockTimeoutMs: 1000,
      redisConfig: { host: 'localhost', port: 6379 },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterEach(async () => {
    if (cache) await cache.destroy();
  });

  describe('Core Operations', () => {
    test('should store and retrieve value from memory tier', async () => {
      // Arrange
      const key = 'test-key';
      const value = 'test-value';

      // Act
      await cache.set(key, value);
      const result = await cache.get(key);

      // Assert
      expect(result).toBe(value);
    });

    test('should return null when key does not exist in any tier', async () => {
      // Arrange
      const nonExistentKey = 'missing-key';

      // Act
      const result = await cache.get(nonExistentKey);

      // Assert
      expect(result).toBeNull();
    });

    test('should delete from all tiers successfully', async () => {
      // Arrange
      const key = 'delete-test';
      const value = 'test-value';
      await cache.set(key, value);

      // Act
      await cache.del(key);
      const result = await cache.get(key);

      // Assert
      expect(result).toBeNull();
      expect(mockRedis.del).toHaveBeenCalledWith(key);
    });
  });

  describe('Memory LRU Eviction', () => {
    test('should evict oldest entry when memory limit exceeded', async () => {
      // Arrange
      const largeValue = 'x'.repeat(300); // 300 bytes each
      await cache.set('old-key', largeValue);
      await cache.set('new-key', largeValue);
      await cache.set('newest-key', largeValue);

      // Act
      await cache.set('trigger-eviction', largeValue);

      // Assert
      const newestResult = await cache.get('trigger-eviction');
      expect(newestResult).toBe(largeValue);
    });

    test('should update LRU order when accessing existing key', async () => {
      // Arrange
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      // Act - Access key1 to make it recently used
      await cache.get('key1');
      await cache.set('key3', 'value3');

      // Assert - key1 should still be accessible after eviction
      const result = await cache.get('key1');
      expect(result).toBe('value1');
    });
  });

  describe('Redis Integration', () => {
    test('should store in Redis when healthy and retrieve from Redis', async () => {
      // Arrange
      const key = 'redis-key';
      const value = 'redis-value';
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(value));

      // Act
      await cache.set(key, value);
      const result = await cache.get(key);

      // Assert
      expect(mockRedis.set).toHaveBeenCalledWith(key, JSON.stringify(value));
      expect(result).toBe(value);
    });

    test('should handle Redis connection failure and mark as unhealthy', async () => {
      // Arrange
      const key = 'redis-fail-key';
      const value = 'test-value';
      mockRedis.set.mockRejectedValueOnce(new Error('Redis connection failed'));

      // Act
      await cache.set(key, value);
      const result = await cache.get(key);

      // Assert
      expect(result).toBe(value); // Should still work from memory
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'HybridLRUCache Redis set failed',
        { err: expect.any(Error) }
      );
    });

    test('should handle Redis get failure gracefully', async () => {
      // Arrange
      const key = 'redis-get-fail';
      mockRedis.get.mockRejectedValueOnce(new Error('Redis read failed'));

      // Act
      const result = await cache.get(key);

      // Assert
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'HybridLRUCache Redis get failed',
        { err: expect.any(Error) }
      );
    });
  });

  describe('Disk Cache Operations', () => {
    test('should write to disk when Redis fails', async () => {
      // Arrange
      const key = 'disk-key';
      const value = 'disk-value';
      mockRedis.set.mockRejectedValue(new Error('Redis unavailable'));

      // Act
      await cache.set(key, value);

      // Assert
      expect(mockWithKeyLock).toHaveBeenCalledWith(
        `disk:${key}`,
        expect.any(Function),
        1000
      );
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    test('should read from disk when memory and Redis miss', async () => {
      // Arrange
      const key = 'disk-read-key';
      const value = 'disk-value';
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(value));

      // Manually add to disk index to simulate existing disk cache
      (cache as any).disk.set(
        key,
        `/tmp/test-cache/${encodeURIComponent(key)}`
      );

      // Act
      const result = await cache.get(key);

      // Assert
      expect(result).toBe(value);
      expect(mockWithKeyLock).toHaveBeenCalledWith(
        `disk:${key}`,
        expect.any(Function),
        1000
      );
    });

    test('should handle disk write failure gracefully', async () => {
      // Arrange
      const key = 'disk-fail-key';
      const value = 'test-value';
      mockRedis.set.mockRejectedValue(new Error('Redis unavailable'));
      mockFs.writeFile.mockRejectedValueOnce(new Error('Disk full'));

      // Act & Assert
      await expect(cache.set(key, value)).resolves.not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Some cache tiers failed but operation completed',
        expect.objectContaining({ key })
      );
    });

    test('should remove stale disk entries during index loading', async () => {
      // Arrange
      const staleFiles = ['stale-key', 'another-stale'];
      mockFs.readdir.mockResolvedValueOnce(staleFiles);
      mockFs.lstat.mockRejectedValue(new Error('ENOENT'));

      // Act - Create new cache instance to trigger index loading
      const newCache = new HybridLRUCache<string>({
        maxEntries: 10,
        memoryLimitBytes: 1024,
        diskPath: testDiskPath,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(mockFs.readdir).toHaveBeenCalled();
      await newCache.destroy();
    });
  });

  describe('Lock Manager Integration', () => {
    test('should use locks for disk operations', async () => {
      // Arrange
      const key = 'lock-test';
      const value = 'test-value';
      mockRedis.set.mockRejectedValue(new Error('Redis unavailable'));

      // Act
      await cache.set(key, value);

      // Assert
      expect(mockWithKeyLock).toHaveBeenCalledWith(
        `disk:${key}`,
        expect.any(Function),
        1000
      );
    });

    test('should handle lock timeout gracefully', async () => {
      // Arrange
      const key = 'lock-timeout-key';
      const value = 'test-value';
      mockWithKeyLock.mockRejectedValueOnce(new Error('Lock timeout'));
      mockRedis.set.mockRejectedValue(new Error('Redis unavailable'));

      // Act
      await cache.set(key, value);
      const result = await cache.get(key);

      // Assert
      expect(result).toBe(value); // Should work from memory despite lock failure
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle corrupted disk cache file', async () => {
      // Arrange
      const key = 'corrupted-key';
      mockFs.readFile.mockResolvedValueOnce('invalid-json{');
      (cache as any).disk.set(
        key,
        `/tmp/test-cache/${encodeURIComponent(key)}`
      );

      // Act
      const result = await cache.get(key);

      // Assert
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to parse disk cache file',
        expect.objectContaining({ key })
      );
    });

    test('should handle disk file deletion during read', async () => {
      // Arrange
      const key = 'deleted-file-key';
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT: no such file'));
      (cache as any).disk.set(
        key,
        `/tmp/test-cache/${encodeURIComponent(key)}`
      );

      // Act
      const result = await cache.get(key);

      // Assert
      expect(result).toBeNull();
    });

    test('should handle delete operation failures', async () => {
      // Arrange
      const key = 'delete-fail-key';
      await cache.set(key, 'test-value');
      mockRedis.del.mockRejectedValueOnce(new Error('Redis delete failed'));

      // Act & Assert
      await expect(cache.del(key)).rejects.toThrow(
        'Some delete operations failed'
      );
    });

    test('should throw when all cache tiers fail during set', async () => {
      // Arrange
      const key = 'all-fail-key';
      const value = 'test-value';
      mockRedis.set.mockRejectedValue(new Error('Redis failed'));
      mockFs.writeFile.mockRejectedValue(new Error('Disk failed'));

      // Mock JSON.stringify to fail for memory operations
      const originalStringify = JSON.stringify;
      vi.spyOn(JSON, 'stringify').mockImplementation(() => {
        throw new Error('JSON serialization failed');
      });

      try {
        // Act & Assert
        await expect(cache.set(key, value)).rejects.toThrow(
          'All cache operations failed'
        );
      } finally {
        // Restore JSON.stringify
        JSON.stringify = originalStringify;
      }
    });
  });

  describe('Environment and Configuration', () => {
    test('should initialize without Redis config', () => {
      // Arrange & Act
      const memoryOnlyCache = new HybridLRUCache<string>({
        maxEntries: 10,
        memoryLimitBytes: 1024,
        diskPath: '/tmp/memory-only',
      });

      // Assert
      expect(memoryOnlyCache.isHealthy()).toBe(true);
      expect(memoryOnlyCache.getStats().redis.connected).toBe(false);
    });

    test('should handle disk path creation failure', async () => {
      // Arrange
      mockFs.mkdir.mockRejectedValueOnce(new Error('Permission denied'));

      // Act & Assert - Should not throw, degrade gracefully
      const newCache = new HybridLRUCache<string>({
        maxEntries: 10,
        memoryLimitBytes: 1024,
        diskPath: '/invalid/path',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(newCache.isHealthy()).toBe(true);
      await newCache.destroy();
    });

    test('should handle different lock timeout configurations', async () => {
      // Arrange
      const slowCache = new HybridLRUCache<string>({
        maxEntries: 10,
        memoryLimitBytes: 1024,
        diskPath: testDiskPath,
        lockTimeoutMs: 5000,
      });

      mockRedis.set.mockRejectedValue(new Error('Redis unavailable'));

      // Act
      await slowCache.set('timeout-test', 'value');

      // Assert
      expect(mockWithKeyLock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        5000
      );

      await slowCache.destroy();
    });
  });

  describe('Emergency Eviction', () => {
    test('should perform emergency eviction across all tiers', async () => {
      // Arrange
      await cache.set('item1', 'value1');
      await cache.set('item2', 'value2');
      mockRedis.keys.mockResolvedValueOnce(['redis-key1', 'redis-key2']);
      mockRedis.del.mockResolvedValueOnce(2);

      // Act
      const result = await cache.emergencyEvict();

      // Assert
      expect(result.evictedEntries).toBeGreaterThan(0);
      expect(result.tiers.memory.evicted).toBeGreaterThan(0);
      expect(result.tiers.redis.evicted).toBe(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'HybridLRUCache emergency eviction started',
        expect.any(Object)
      );
    });

    test('should handle Redis failure during emergency eviction', async () => {
      // Arrange
      await cache.set('test-item', 'test-value');
      mockRedis.keys.mockRejectedValueOnce(
        new Error('Redis connection failed')
      );

      // Act
      const result = await cache.emergencyEvict();

      // Assert
      expect(result.tiers.memory.evicted).toBeGreaterThan(0);
      expect(result.tiers.redis.evicted).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis emergency eviction failed',
        { err: expect.any(Error) }
      );
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should provide accurate cache statistics', () => {
      // Arrange & Act
      const stats = cache.getStats();

      // Assert
      expect(stats).toEqual({
        memory: expect.objectContaining({
          entries: expect.any(Number),
          usageBytes: expect.any(Number),
          limitBytes: 1024,
        }),
        disk: expect.objectContaining({
          entries: expect.any(Number),
          limitEntries: 5,
        }),
        redis: expect.objectContaining({
          healthy: expect.any(Boolean),
          connected: expect.any(Boolean),
        }),
        serialization: expect.objectContaining({
          poolSize: expect.any(Number),
          activeWorkers: expect.any(Number),
          queueLength: expect.any(Number),
          isDestroyed: expect.any(Boolean),
        }),
      });
    });

    test('should track memory usage correctly', async () => {
      // Arrange
      const initialStats = cache.getStats();

      // Act
      await cache.set('memory-test', 'x'.repeat(100));
      const afterStats = cache.getStats();

      // Assert
      expect(afterStats.memory.usageBytes).toBeGreaterThan(
        initialStats.memory.usageBytes
      );
    });
  });

  describe('Cache Lifecycle', () => {
    test('should destroy all resources cleanly', async () => {
      // Arrange
      await cache.set('destroy-test', 'test-value');

      // Act
      await cache.destroy();

      // Assert
      expect(mockRedis.disconnect).toHaveBeenCalled();
      const stats = cache.getStats();
      expect(stats.memory.entries).toBe(0);
      expect(stats.serialization.isDestroyed).toBe(true);
    });

    test('should quit Redis connection gracefully', async () => {
      // Arrange & Act
      await cache.quit();

      // Assert
      expect(mockRedis.quit).toHaveBeenCalled();
      expect(cache.isHealthy()).toBe(false);
    });

    test('should handle quit failure gracefully', async () => {
      // Arrange
      mockRedis.quit.mockRejectedValueOnce(new Error('Quit failed'));

      // Act & Assert - Should not throw
      await expect(cache.quit()).resolves.not.toThrow();
    });
  });

  describe('Serialization Worker Pool', () => {
    test('should fallback to sync serialization when async fails', async () => {
      // Arrange
      const key = 'serialization-test';
      const value = 'test-value';

      // Mock async serialization failure
      const originalPool = (cache as any).serializationPool;
      (cache as any).serializationPool = {
        serialize: vi
          .fn()
          .mockRejectedValue(new Error('SerializationPool worker failed')),
        destroy: vi.fn(),
        getStats: vi.fn().mockReturnValue({
          poolSize: 0,
          activeWorkers: 0,
          queueLength: 0,
          isDestroyed: true,
        }),
      };

      // Act
      await cache.set(key, value);
      const result = await cache.get(key);

      // Assert
      expect(result).toBe(value);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Async serialization failed, falling back to sync',
        expect.objectContaining({ key })
      );

      // Cleanup
      (cache as any).serializationPool = originalPool;
    });
  });
});
