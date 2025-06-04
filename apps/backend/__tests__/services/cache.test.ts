// apps/backend/__tests__/services/cache.test.ts

import { jest } from '@jest/globals';
import HybridLRUCache from '../../src/utils/hybridLruCache';

// Mock dependencies before importing cache
jest.mock('ioredis');
jest.mock('../../src/utils/hybridLruCache');
jest.mock('../../src/utils/lockManager', () => ({
  withKeyLock: jest.fn((key: string, fn: () => any) => fn()),
}));
jest.mock('../../src/config', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379,
    },
  },
  hybridCacheConfig: {
    enableRedis: true,
    enableDisk: true,
    maxEntries: 1000,
    memoryLimitBytes: 1048576,
    diskPath: '/tmp/test-cache',
    lockTimeoutMs: 5000,
    redisConfig: {
      host: 'localhost',
      port: 6379,
    },
  },
  lockConfig: {
    lockDir: '/tmp/test-locks',
    defaultTimeoutMs: 5000,
    cleanupIntervalMs: 30000,
    staleLockAgeMs: 60000,
    enableLockLogging: false,
  },
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

describe('Cache Service Integration', () => {
  let cache: any;
  let mockHybridCache: jest.Mocked<HybridLRUCache<string>>;
  let mockRedis: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock HybridLRUCache
    const HybridLRUCacheMock = HybridLRUCache as jest.MockedClass<
      typeof HybridLRUCache
    >;
    mockHybridCache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      quit: jest.fn(),
      isHealthy: jest.fn(),
      getStats: jest.fn(),
    } as any;

    // Properly setup the mock return values
    mockHybridCache.quit.mockResolvedValue(undefined);
    mockHybridCache.isHealthy.mockReturnValue(true);

    HybridLRUCacheMock.mockImplementation(() => mockHybridCache);

    // Mock Redis
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      quit: jest.fn(),
      on: jest.fn((event: string, callback: any) => {
        // Simulate successful connection
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      }),
      disconnect: jest.fn(),
    };

    // Setup mock return values
    mockRedis.quit.mockResolvedValue('OK');

    // Mock Redis constructor
    const Redis = await import('ioredis');
    (Redis.default as any).mockImplementation(() => mockRedis);

    // Import cache after mocks are set up
    const cacheModule = await import('../../src/services/cache');
    cache = cacheModule.default;

    // Allow async initialization to complete
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // Inject our mocks into the cache service
    if (cache.__setDependenciesForTesting) {
      cache.__setDependenciesForTesting(mockHybridCache, mockRedis, true, true);
    }
  });

  describe('get() - Happy Path', () => {
    test('should return value from HybridLRUCache when available', async () => {
      // Arrange
      const key = 'test-key';
      const expectedValue = 'test-value';
      mockHybridCache.get.mockResolvedValue(expectedValue);

      // Act
      const result = await cache.get(key);

      // Assert
      expect(result).toBe(expectedValue);
      expect(mockHybridCache.get).toHaveBeenCalledWith(key);
      expect(mockHybridCache.get).toHaveBeenCalledTimes(1);
    });

    test('should fallback to Redis when HybridLRUCache returns null', async () => {
      // Arrange
      const key = 'test-key';
      const expectedValue = 'redis-value';
      mockHybridCache.get.mockResolvedValue(null);
      mockRedis.get.mockResolvedValue(expectedValue);

      // Act
      const result = await cache.get(key);

      // Assert
      expect(result).toBe(expectedValue);
      expect(mockHybridCache.get).toHaveBeenCalledWith(key);
      expect(mockRedis.get).toHaveBeenCalledWith(key);
    });

    test('should fallback to memory when both HybridLRUCache and Redis fail', async () => {
      // Arrange
      const key = 'memory-key';
      const value = 'memory-value';

      // Make both HybridLRUCache and Redis fail for get operations
      mockHybridCache.get.mockResolvedValue(null);
      mockRedis.get.mockRejectedValue(new Error('Redis down'));

      // Make HybridLRUCache and Redis fail for set operations to force memory fallback
      mockHybridCache.set.mockRejectedValue(new Error('Hybrid cache down'));
      mockRedis.set.mockRejectedValue(new Error('Redis down'));

      // Pre-populate memory cache (this should succeed and store in memory as final fallback)
      await cache.set(key, value);

      // Reset get mocks to ensure clean test
      mockHybridCache.get.mockResolvedValue(null);
      mockRedis.get.mockRejectedValue(new Error('Redis down'));

      // Act
      const result = await cache.get(key);

      // Assert
      expect(result).toBe(value);
    });
  });

  describe('set() - Happy Path', () => {
    test('should store value in HybridLRUCache successfully', async () => {
      // Arrange
      const key = 'test-key';
      const value = 'test-value';
      mockHybridCache.set.mockResolvedValue(undefined);

      // Act
      await cache.set(key, value);

      // Assert
      expect(mockHybridCache.set).toHaveBeenCalledWith(
        key,
        value,
        undefined,
        undefined
      );
      expect(mockHybridCache.set).toHaveBeenCalledTimes(1);
    });

    test('should store value with expiration parameters', async () => {
      // Arrange
      const key = 'test-key';
      const value = 'test-value';
      const mode = 'EX';
      const duration = 3600;
      mockHybridCache.set.mockResolvedValue(undefined);

      // Act
      await cache.set(key, value, mode, duration);

      // Assert
      expect(mockHybridCache.set).toHaveBeenCalledWith(
        key,
        value,
        mode,
        duration
      );
    });

    test('should fallback to Redis when HybridLRUCache fails', async () => {
      // Arrange
      const key = 'test-key';
      const value = 'test-value';
      mockHybridCache.set.mockRejectedValue(new Error('Hybrid cache down'));
      mockRedis.set.mockResolvedValue('OK');

      // Act
      await cache.set(key, value, 'EX', 300);

      // Assert
      expect(mockHybridCache.set).toHaveBeenCalledWith(key, value, 'EX', 300);
      expect(mockRedis.set).toHaveBeenCalledWith(key, value, 'EX', 300);
    });
  });

  describe('del() - Happy Path', () => {
    test('should delete from HybridLRUCache successfully', async () => {
      // Arrange
      const key = 'test-key';
      mockHybridCache.del.mockResolvedValue(undefined);

      // Act
      await cache.del(key);

      // Assert
      expect(mockHybridCache.del).toHaveBeenCalledWith(key);
      expect(mockHybridCache.del).toHaveBeenCalledTimes(1);
    });

    test('should fallback to Redis when HybridLRUCache fails', async () => {
      // Arrange
      const key = 'test-key';
      mockHybridCache.del.mockRejectedValue(new Error('Hybrid cache down'));
      mockRedis.del.mockResolvedValue(1);

      // Act
      await cache.del(key);

      // Assert
      expect(mockHybridCache.del).toHaveBeenCalledWith(key);
      expect(mockRedis.del).toHaveBeenCalledWith(key);
    });
  });

  describe('isHealthy() - Happy Path', () => {
    test('should return true when HybridLRUCache is healthy', () => {
      // Arrange
      mockHybridCache.isHealthy.mockReturnValue(true);

      // Act
      const result = cache.isHealthy();

      // Assert
      expect(result).toBe(true);
    });

    test('should return true when Redis is healthy but HybridLRUCache is not', () => {
      // Arrange
      mockHybridCache.isHealthy.mockReturnValue(false);
      // Simulate Redis being healthy by having it exist

      // Act
      const result = cache.isHealthy();

      // Assert
      expect(result).toBe(true); // Should fallback to Redis health
    });
  });

  describe('getStats() - Happy Path', () => {
    test('should return comprehensive cache statistics', () => {
      // Arrange
      const expectedHybridStats = {
        memory: { entries: 50, usageBytes: 1024, limitBytes: 1048576 },
        disk: { entries: 200, limitEntries: 10000 },
        redis: { healthy: true, connected: true },
      };
      mockHybridCache.getStats.mockReturnValue(expectedHybridStats);

      // Act
      const result = cache.getStats();

      // Assert
      expect(result).toEqual({
        hybrid: expectedHybridStats,
        redis: expect.objectContaining({
          healthy: expect.any(Boolean),
          connected: expect.any(Boolean),
        }),
        memory: expect.objectContaining({
          entries: expect.any(Number),
        }),
        activeBackend: expect.any(String),
      });
    });
  });

  describe('quit() - Happy Path', () => {
    test('should close all cache connections successfully', async () => {
      // Arrange
      mockHybridCache.quit.mockResolvedValue(undefined);
      mockRedis.quit.mockResolvedValue('OK');

      // Act
      await cache.quit();

      // Assert
      expect(mockHybridCache.quit).toHaveBeenCalledTimes(1);
      expect(mockRedis.quit).toHaveBeenCalledTimes(1);
    });
  });
});
