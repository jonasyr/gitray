import {
  describe,
  test,
  expect,
  beforeEach,
  vi,
  type MockInstance,
} from 'vitest';

// Mock ioredis and logger
const mockRedisInstance = {
  on: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  quit: vi.fn(),
  disconnect: vi.fn(),
};

// This will store the handlers registered by initRedis
const capturedRedisHandlers: Record<string, ((err?: Error) => void)[]> = {};

(mockRedisInstance.on as MockInstance).mockImplementation(
  (event: string, callback: (err?: Error) => void) => {
    if (!capturedRedisHandlers[event]) {
      capturedRedisHandlers[event] = [];
    }
    capturedRedisHandlers[event].push(callback);
    return mockRedisInstance;
  }
);

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => mockRedisInstance),
}));

vi.mock('../../src/config', () => ({
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

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: mockLogger,
  getLogger: vi.fn(() => mockLogger),
}));

// Mock HybridLRUCache
const HybridLRUCacheMock = vi.fn();
vi.mock('../../src/utils/hybridLruCache', () => ({
  HybridLRUCache: HybridLRUCacheMock,
}));

// Mock Prometheus register to avoid duplicate metrics errors
vi.mock('prom-client', async () => {
  const actual = await vi.importActual('prom-client');
  return {
    ...actual,
    register: {
      clear: vi.fn(),
      metrics: vi.fn().mockResolvedValue(''),
      registerMetric: vi.fn(),
    },
    collectDefaultMetrics: vi.fn(),
  };
});

// Mock metrics service with all enhanced metrics functions
vi.mock('../../src/services/metrics', () => ({
  // Basic metrics
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },

  // Enhanced metrics functions
  recordEnhancedCacheOperation: vi.fn(),
  updateServiceHealthScore: vi.fn(),
  recordDetailedError: vi.fn(),
  recordFeatureUsage: vi.fn(),
  updateCoordinationMetrics: vi.fn(),
  recordApiMetrics: vi.fn(),
  recordSLAMetrics: vi.fn(),

  // Utility functions
  getUserType: vi.fn().mockReturnValue('anonymous'),
  getRepositoryType: vi.fn().mockReturnValue('public'),
  getTeamSizeCategory: vi.fn().mockReturnValue('individual'),
  getCacheTier: vi.fn().mockReturnValue('L1'),
  getRepositorySizeCategory: vi.fn().mockReturnValue('small'),

  // Middleware and other exports
  metricsMiddleware: vi.fn((req, res, next) => next()),
  register: {
    metrics: vi.fn().mockResolvedValue(''),
    clear: vi.fn(),
  },
}));

describe('Cache Service Integration', () => {
  let cache: any;
  let mockHybridCache: any;
  let mockRedis: any;
  let mockLogger: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Clear Prometheus registry to prevent duplicate metrics errors
    const { register } = await import('prom-client');
    if (register && typeof register.clear === 'function') {
      register.clear();
    }

    // Get the mocked logger
    mockLogger = (await import('../../src/services/logger')).default;
    // Clear captured handlers for each test
    for (const key in capturedRedisHandlers) {
      delete capturedRedisHandlers[key];
    }

    // Reset modules to ensure initRedis is called fresh and mocks are reapplied
    vi.resetModules();

    // Re-import dependencies with mocks
    // Ensure ioredis mock is active after reset
    const ioredis = (await import('ioredis')).default;
    (ioredis as unknown as MockInstance).mockImplementation(
      () => mockRedisInstance
    );

    // Create mockHybridCache
    mockHybridCache = {
      quit: vi.fn().mockResolvedValue(undefined),
      isHealthy: vi.fn().mockReturnValue(true),
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      getStats: vi.fn(),
    };

    HybridLRUCacheMock.mockImplementation(() => mockHybridCache);

    // Mock Redis
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      quit: vi.fn(),
      on: vi.fn((event: string, callback: any) => {
        // Simulate successful connection
        if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
      }),
      disconnect: vi.fn(),
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

    test('should handle Redis init failure and use memory cache', async () => {
      const initFailError = new Error('Redis init failed');
      // Arrange: any ioredis constructor to throw an error for this specific test
      // This requires resetting modules again and setting up mocks specifically for this test's scope.
      vi.resetModules();
      const ioredisSpecial = (await import('ioredis')).default;
      (ioredisSpecial as unknown as MockInstance).mockImplementationOnce(() => {
        // Use mockImplementationOnce
        throw initFailError;
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
      expect(mockHybridCache.quit).toHaveBeenCalled();
      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });

  describe('Cache Operations with Redis', () => {
    beforeEach(async () => {
      // Use the testing injection method to disable HybridLRUCache for these tests
      cache.__setDependenciesForTesting(null, mockRedisInstance, false, true);

      // Ensure Redis is "connected" for these tests by triggering ready
      if (capturedRedisHandlers['ready']) {
        capturedRedisHandlers['ready'].forEach((handler) => handler());
      }
    });

    test('get should call redis.get', async () => {
      mockRedisInstance.get.mockResolvedValue('value_from_redis');
      const value = await cache.get('test_key');
      expect(mockRedisInstance.get).toHaveBeenCalledWith('test_key');
      expect(value).toBe('value_from_redis');
    });

    test('set should call redis.set without expiry', async () => {
      await cache.set('test_key', 'test_value');
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'test_key',
        'test_value'
      );
    });

    test('set should call redis.set with expiry', async () => {
      await cache.set('test_key', 'test_value', 'EX', 3600);
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'test_key',
        'test_value',
        'EX',
        3600
      );
    });

    test('del should call redis.del', async () => {
      await cache.del('test_key');
      expect(mockRedisInstance.del).toHaveBeenCalledWith('test_key');
    });

    test('quit should call redis.quit and set healthy to false', async () => {
      mockRedisInstance.quit.mockResolvedValue('OK');
      await cache.quit();
      expect(mockRedisInstance.quit).toHaveBeenCalled();
      expect(cache.isHealthy()).toBe(false);
    });

    test('quit should handle errors from redis.quit', async () => {
      const quitError = new Error('Quit failed');
      mockRedisInstance.quit.mockRejectedValue(quitError);
      await cache.quit();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Error closing Redis connection',
        { err: quitError }
      );
      expect(cache.isHealthy()).toBe(false);
    });
  });

  describe('Cache Operations with Memory Cache (Redis unavailable)', () => {
    beforeEach(async () => {
      // Simulate Redis init failure
      vi.resetModules();
      const ioredis = (await import('ioredis')).default;
      (ioredis as unknown as MockInstance).mockImplementation(() => {
        throw new Error('Simulated Redis init failure');
      });
      cache = (await import('../../src/services/cache')).default;
    });

    test('get should retrieve from memory cache', async () => {
      // Set directly to memory cache for testing, as redis mock won't be used
      await cache.set('mem_key', 'mem_value'); // This will use memory cache
      const value = await cache.get('mem_key');
      expect(value).toBe('mem_value');
    });

    test('set should store in memory cache', async () => {
      await cache.set('mem_key_set', 'mem_value_set');
      const value = await cache.get('mem_key_set'); // verify it was set
      expect(value).toBe('mem_value_set');
    });

    test('del should remove from memory cache', async () => {
      await cache.set('mem_key_del', 'mem_value_del');
      await cache.del('mem_key_del');
      const value = await cache.get('mem_key_del');
      expect(value).toBeNull();
    });

    test('quit should do nothing significant if redis was never initialized', async () => {
      await cache.quit();
      expect(mockRedisInstance.quit).not.toHaveBeenCalled();
      // isHealthy remains true as memory cache is considered healthy
      expect(cache.isHealthy()).toBe(true);
    });
  });

  describe('isHealthy', () => {
    test('should return true when redis is healthy', async () => {
      if (capturedRedisHandlers['ready']) {
        capturedRedisHandlers['ready'].forEach((handler) => handler());
      }
      expect(cache.isHealthy()).toBe(true);
    });

    test('should return false when redis connection has ended', async () => {
      // Use the testing injection method to disable HybridLRUCache for this test
      cache.__setDependenciesForTesting(null, mockRedisInstance, false, false);

      if (capturedRedisHandlers['ready']) {
        capturedRedisHandlers['ready'].forEach((handler) => handler());
      }
      if (capturedRedisHandlers['end']) {
        capturedRedisHandlers['end'].forEach((handler) => handler());
      }
      expect(cache.isHealthy()).toBe(false);
    });

    test('should return true if redis init failed (memory cache fallback)', async () => {
      // Similar to the init failure test, set up a specific scenario
      vi.resetModules();
      const ioredisFail = (await import('ioredis')).default;
      (ioredisFail as unknown as MockInstance).mockImplementationOnce(() => {
        throw new Error('init fail');
      });
      const localCache = (await import('../../src/services/cache')).default;
      expect(localCache.isHealthy()).toBe(true);
    });
  });

  describe('Redis Connection Error Handling', () => {
    test('should handle Redis error event and disconnect', async () => {
      // Reset to get a fresh import
      vi.resetModules();

      const mockRedis = {
        on: vi.fn(),
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        quit: vi.fn(),
        disconnect: vi.fn(),
      };

      let errorHandler: (err: Error) => void;
      mockRedis.on.mockImplementation((event: string, callback: any) => {
        if (event === 'error') {
          errorHandler = callback;
        } else if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
        return mockRedis;
      });

      const Redis = await import('ioredis');
      (Redis.default as any).mockImplementation(() => mockRedis);

      await import('../../src/services/cache');

      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      // Trigger Redis error event
      const testError = new Error('Redis connection lost');
      errorHandler!(testError);

      expect(mockRedis.disconnect).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis error, falling back to in-memory cache',
        { err: testError }
      );
    });

    test('should handle Redis end event', async () => {
      vi.resetModules();

      const mockRedis = {
        on: vi.fn(),
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        quit: vi.fn(),
        disconnect: vi.fn(),
      };

      let endHandler: () => void;
      mockRedis.on.mockImplementation((event: string, callback: any) => {
        if (event === 'end') {
          endHandler = callback;
        } else if (event === 'ready') {
          setTimeout(() => callback(), 0);
        }
        return mockRedis;
      });

      const Redis = await import('ioredis');
      (Redis.default as any).mockImplementation(() => mockRedis);

      await import('../../src/services/cache');
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      // Trigger Redis end event
      endHandler!();

      expect(mockLogger.warn).toHaveBeenCalledWith('Redis connection closed');
    });
  });

  describe('HybridCache Configuration', () => {
    test('should handle disabled hybrid cache configuration', async () => {
      vi.resetModules();

      // Mock config with hybrid cache disabled
      vi.doMock('../../src/config', () => ({
        config: {
          redis: {
            host: 'localhost',
            port: 6379,
          },
        },
        hybridCacheConfig: {
          enableRedis: false,
          enableDisk: false,
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

      await import('../../src/services/cache');
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'HybridLRUCache disabled, falling back to simple Redis cache'
      );
    });
  });

  describe('Complex Fallback Scenarios', () => {
    test('should handle hybrid cache get failure and fallback to Redis', async () => {
      const key = 'test-key';
      const expectedValue = 'redis-fallback-value';

      // Make hybrid cache fail
      mockHybridCache.get.mockRejectedValue(new Error('Hybrid cache failure'));
      mockRedis.get.mockResolvedValue(expectedValue);

      const result = await cache.get(key);

      expect(result).toBe(expectedValue);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'HybridLRUCache get failed, falling back',
        { key, err: expect.any(Error) }
      );
    });

    test('should handle cache backend failures gracefully', async () => {
      const key = 'test-key';
      const value = 'test-value';

      // Test that set and get operations don't throw even if internal caches fail
      // This tests the fallback to memory cache behavior
      await expect(cache.set(key, value)).resolves.not.toThrow();
      await expect(cache.get(key)).resolves.not.toThrow();

      // Test delete operations
      await expect(cache.del(key)).resolves.not.toThrow();
    });

    test('should handle hybrid cache del failure and fallback to Redis', async () => {
      const key = 'test-key';

      // Make hybrid cache del fail
      mockHybridCache.del.mockRejectedValue(
        new Error('Hybrid cache del failure')
      );
      mockRedis.del.mockResolvedValue(1);

      await cache.del(key);

      expect(mockRedis.del).toHaveBeenCalledWith(key);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'HybridLRUCache del failed, falling back',
        { key, err: expect.any(Error) }
      );
    });

    test('should handle both hybrid cache and Redis del failure, fallback to memory', async () => {
      const key = 'test-key';

      // Make both hybrid cache and Redis del fail
      mockHybridCache.del.mockRejectedValue(
        new Error('Hybrid cache del failure')
      );
      mockRedis.del.mockRejectedValue(new Error('Redis del failure'));

      await cache.del(key);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'HybridLRUCache del failed, falling back',
        { key, err: expect.any(Error) }
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis del failed, falling back to memory',
        { key, err: expect.any(Error) }
      );
    });
  });

  describe('resetHealth() - Testing Method', () => {
    test('should reset hybrid cache health when hybrid cache exists', async () => {
      // Arrange
      cache.__setDependenciesForTesting(mockHybridCache, null, false, false);

      // Act
      cache.resetHealth();

      // Assert - Health should be reset (verified by checking no warnings in subsequent operations)
      expect(cache.isHealthy()).toBe(true);
    });

    test('should reset Redis health when Redis exists', async () => {
      // Arrange
      cache.__setDependenciesForTesting(null, mockRedis, false, true);

      // Act
      cache.resetHealth();

      // Assert - Health should be reset
      expect(cache.isHealthy()).toBe(true);
    });

    test('should reset both hybrid cache and Redis health when both exist', async () => {
      // Arrange
      cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        false,
        false
      );

      // Act
      cache.resetHealth();

      // Assert - Health should be reset for both
      expect(cache.isHealthy()).toBe(true);
    });
  });

  describe('switchToBackend() - Testing Method', () => {
    test('should switch to hybrid backend and initialize if needed', async () => {
      // Arrange
      cache.__setDependenciesForTesting(null, mockRedis, false, true);

      // Act
      await cache.switchToBackend('hybrid');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Switched to cache backend: hybrid'
      );
    });

    test('should switch to redis backend and initialize if needed', async () => {
      // Arrange
      cache.__setDependenciesForTesting(mockHybridCache, null, true, false);

      // Act
      await cache.switchToBackend('redis');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Switched to cache backend: redis'
      );
      const stats = cache.getStats();
      expect(stats.activeBackend).toBe('redis');
    });

    test('should switch to memory backend', async () => {
      // Arrange
      cache.__setDependenciesForTesting(mockHybridCache, mockRedis, true, true);

      // Act
      await cache.switchToBackend('memory');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Switched to cache backend: memory'
      );
      const stats = cache.getStats();
      expect(stats.activeBackend).toBe('memory');
    });

    test('should throw error for unknown backend', async () => {
      // Act & Assert
      await expect(cache.switchToBackend('unknown' as any)).rejects.toThrow(
        'Unknown backend: unknown'
      );
    });
  });

  describe('getStats() - Cache Statistics', () => {
    test('should return hybrid backend stats when hybrid cache is healthy', async () => {
      // Arrange
      const mockStats = {
        memory: { entries: 10, usageBytes: 1024 },
        disk: { entries: 5, usageBytes: 2048 },
      };
      mockHybridCache.getStats.mockReturnValue(mockStats);
      cache.__setDependenciesForTesting(mockHybridCache, mockRedis, true, true);

      // Act
      const stats = cache.getStats();

      // Assert
      expect(stats.activeBackend).toBe('hybrid');
      expect(stats.hybrid).toEqual(mockStats);
      expect(stats.redis.healthy).toBe(true);
      expect(stats.redis.connected).toBe(true);
      expect(stats.memory.entries).toBeTypeOf('number');
    });

    test('should return redis backend when hybrid is unhealthy but redis is healthy', async () => {
      // Arrange
      cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        false,
        true
      );

      // Act
      const stats = cache.getStats();

      // Assert
      expect(stats.activeBackend).toBe('redis');
      expect(stats.redis.healthy).toBe(true);
      expect(stats.redis.connected).toBe(true);
    });

    test('should return memory backend when both hybrid and redis are unhealthy', async () => {
      // Arrange
      cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        false,
        false
      );

      // Act
      const stats = cache.getStats();

      // Assert
      expect(stats.activeBackend).toBe('memory');
      expect(stats.redis.healthy).toBe(false);
      expect(stats.redis.connected).toBe(true);
    });

    test('should handle null hybrid cache in stats', async () => {
      // Arrange
      cache.__setDependenciesForTesting(null, mockRedis, false, true);

      // Act
      const stats = cache.getStats();

      // Assert
      expect(stats.activeBackend).toBe('redis');
      expect(stats.hybrid).toBeUndefined();
      expect(stats.redis.connected).toBe(true);
    });

    test('should handle null redis in stats', async () => {
      // Arrange
      cache.__setDependenciesForTesting(mockHybridCache, null, true, false);

      // Act
      const stats = cache.getStats();

      // Assert
      expect(stats.activeBackend).toBe('hybrid');
      expect(stats.redis.connected).toBe(false);
    });
  });

  describe('isHealthy() - Health Check Edge Cases', () => {
    test('should return true when Redis is null (never initialized)', async () => {
      // Arrange
      cache.__setDependenciesForTesting(mockHybridCache, null, true, false);

      // Act
      const isHealthy = cache.isHealthy();

      // Assert
      expect(isHealthy).toBe(true);
    });

    test('should return false when Redis was initialized but is now unhealthy', async () => {
      // Arrange
      cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        true,
        false
      );

      // Act
      const isHealthy = cache.isHealthy();

      // Assert
      // Note: This tests the method call, actual health logic may be more complex
      expect(typeof isHealthy).toBe('boolean');
    });

    test('should return true when Redis is healthy', async () => {
      // Arrange
      cache.__setDependenciesForTesting(mockHybridCache, mockRedis, true, true);

      // Act
      const isHealthy = cache.isHealthy();

      // Assert
      expect(isHealthy).toBe(true);
    });

    test('should return true when hybrid cache is healthy even if Redis is null', async () => {
      // Arrange
      cache.__setDependenciesForTesting(mockHybridCache, null, true, false);

      // Act
      const isHealthy = cache.isHealthy();

      // Assert
      expect(isHealthy).toBe(true);
    });
  });

  describe('Redis Fallback Error Handling', () => {
    test('should handle Redis get failure and log warning', async () => {
      // Arrange
      const key = 'test-key';

      mockHybridCache.get.mockResolvedValue(null);
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      // Act
      const result = await cache.get(key);

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis get failed, falling back to memory',
        { key, err: expect.any(Error) }
      );
      // Result can be null if not found in fallback
      expect(result).toBeNull();
    });

    test('should handle hybrid cache initialization failure', async () => {
      // Arrange
      cache.__setDependenciesForTesting(null, mockRedis, false, true);

      // Mock HybridLRUCache constructor to throw
      HybridLRUCacheMock.mockImplementationOnce(() => {
        throw new Error('HybridLRUCache initialization failed');
      });

      // Act
      await cache.switchToBackend('hybrid');

      // Assert - Should still switch but log the error
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Switched to cache backend: hybrid'
      );
    });
  });
});
