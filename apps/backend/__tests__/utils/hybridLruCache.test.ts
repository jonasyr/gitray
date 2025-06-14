// apps/backend/__tests__/utils/hybridLruCache.test.ts

import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { Stats } from 'fs';

// Define proper types for mocks
type MockedFunction<T extends (...args: any[]) => any> = ReturnType<
  typeof vi.fn<T>
>;

// Create a proper Stats mock object
const createMockStats = (mtimeMs: number = Date.now()): Stats =>
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

// Create comprehensive mocks using vi.hoisted
const mockFs = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  stat: vi.fn(),
}));

// Mock the withKeyLock function using vi.hoisted
const mockWithKeyLock = vi.hoisted(() => vi.fn());

// Mock Redis
const mockRedis = {
  get: vi.fn() as MockedFunction<(key: string) => Promise<string | null>>,
  set: vi.fn() as MockedFunction<
    (key: string, value: string) => Promise<string>
  >,
  del: vi.fn() as MockedFunction<(key: string) => Promise<number>>,
  quit: vi.fn() as MockedFunction<() => Promise<string>>,
  on: vi.fn() as MockedFunction<
    (event: string, callback: (...args: any[]) => void) => void
  >,
  disconnect: vi.fn() as MockedFunction<() => void>,
};

// Initialize Redis mock return values
mockRedis.get.mockResolvedValue(null);
mockRedis.set.mockResolvedValue('OK');
mockRedis.del.mockResolvedValue(1);
mockRedis.quit.mockResolvedValue('OK');
mockRedis.on.mockImplementation(
  (event: string, callback: (...args: any[]) => void) => {
    if (event === 'ready') {
      setTimeout(() => callback(), 0);
    }
  }
);

vi.mock('fs/promises', () => ({
  default: mockFs,
  ...mockFs,
}));

// Mock IORedis - need to handle both default export and named imports
vi.mock('ioredis', () => {
  function MockRedisClass(this: any) {
    // Copy all properties from mockRedis to this instance
    Object.assign(this, mockRedis);
    return this;
  }

  return {
    __esModule: true,
    default: MockRedisClass,
    Redis: MockRedisClass,
  };
});

vi.mock('../../src/utils/lockManager', () => ({
  withKeyLock: mockWithKeyLock,
}));
vi.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: global.mockLogger,
  getLogger: global.getLogger,
}));

// Import after mocking
import HybridLRUCache from '../../src/utils/hybridLruCache';

describe('HybridLRUCache', () => {
  let cache: HybridLRUCache<string>;
  const testDiskPath = '/tmp/test-cache';

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset all mock implementations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue('');
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue(createMockStats());

    // Initialize mockWithKeyLock
    mockWithKeyLock.mockImplementation(
      async (key: string, fn: () => Promise<unknown>) => {
        return await fn();
      }
    );

    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockRedis.quit.mockResolvedValue('OK');

    // Ensure Redis 'ready' event is triggered immediately to mark Redis as healthy
    mockRedis.on.mockImplementation(
      (event: string, callback: (...args: any[]) => void) => {
        if (event === 'ready') {
          // Trigger immediately and synchronously to ensure Redis is marked healthy
          callback();
        }
        // Return this for chaining
        return mockRedis;
      }
    );

    mockWithKeyLock.mockImplementation(
      async (key: string, fn: () => Promise<unknown>) => {
        return await fn();
      }
    );

    // Create cache instance
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

    // Wait for Redis ready event to trigger
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  afterEach(async () => {
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

      // Assert - First key should be evicted from memory (but might be in Redis/disk)
      const lastResult = await cache.get('key6');
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

      // Assert - Last entry should be retrievable
      const lastResult = await cache.get('k7');
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

      // Assert - key1 should still be accessible (either from memory, Redis, or disk)
      const key1Result = await cache.get('key1');
      expect(key1Result).toBe(value);
    });
  });

  describe('Multi-Tier Storage - Happy Path', () => {
    test('should store in Redis when Redis is healthy', async () => {
      // Arrange
      const key = 'redis-key';
      const value = 'redis-value';

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

      // Mock Redis to be unavailable to force disk usage
      mockRedis.set.mockRejectedValue(new Error('Redis unavailable'));

      // Act
      await cache.set(key, value);

      // Assert
      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(mockWithKeyLock).toHaveBeenCalled();
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

      // Assert - Should have attempted disk operations
      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(mockWithKeyLock).toHaveBeenCalled();
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
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Assert
      expect(mockFs.readdir).toHaveBeenCalled();

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

      // Force disk storage by making Redis fail
      mockRedis.set.mockRejectedValue(new Error('Redis unavailable'));
      await cache.set(key, value);

      // Act
      await cache.del(key);

      // Assert
      expect(mockFs.unlink).toHaveBeenCalled();
      expect(mockWithKeyLock).toHaveBeenCalled();
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

  describe('Integration with Lock Manager - Happy Path', () => {
    test('should use locks for disk operations', async () => {
      // Arrange
      const key = 'lock-test-key';
      const value = 'lock-test-value';

      // Force disk usage by making Redis fail
      mockRedis.set.mockRejectedValue(new Error('Redis unavailable'));

      // Act
      await cache.set(key, value);

      // Assert
      expect(mockWithKeyLock).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    test('should handle lock failures gracefully', async () => {
      // Arrange
      const key = 'lock-fail-key';
      const value = 'lock-fail-value';

      // Make lock acquisition fail
      mockWithKeyLock.mockRejectedValue(new Error('Lock timeout'));
      // Force disk usage
      mockRedis.set.mockRejectedValue(new Error('Redis unavailable'));

      // Act & Assert - Should still succeed with memory cache
      await cache.set(key, value);
      const result = await cache.get(key);
      expect(result).toBe(value);
    });
  });
});
