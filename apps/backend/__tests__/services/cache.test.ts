import {
  describe,
  test,
  expect,
  beforeEach,
  vi,
  type MockInstance,
} from 'vitest';
import actualLogger from '../../src/services/logger'; // Import to get the type, but we'll use the mock

// any ioredis and logger
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

vi.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Cache Service Integration', () => {
  let cache: any;
  let mockHybridCache: jest.Mocked<HybridLRUCache<string>>;
  let mockRedis: any;

  beforeEach(async () => {
    vi.clearAllMocks();
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
      expect(localLogger.warn).toHaveBeenCalledWith(
        'Redis init failed, using in-memory cache',
        { err: initFailError }
      );
      expect(localCache.isHealthy()).toBe(true); // Healthy because memory cache is active
    });
  });

  describe('Cache Operations with Redis', () => {
    beforeEach(async () => {
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
      expect(logger.warn).toHaveBeenCalledWith(
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
});
