import {
  describe,
  test,
  expect,
  beforeEach,
  vi,
  type MockInstance,
} from 'vitest';
import actualLogger from '../../src/services/logger'; // Import to get the type, but we'll use the mock

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
}));

vi.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Cache Service', () => {
  let cache: any; // Dynamically import cache
  let logger: typeof actualLogger; // To hold the mocked logger instance

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

    // Get the fresh mocked logger instance
    logger = (await import('../../src/services/logger')).default;

    // Dynamically import cache after resetting modules and setting up mocks
    cache = (await import('../../src/services/cache')).default;
  });

  describe('Redis Initialization and Connection States', () => {
    test('should establish Redis connection and log success', async () => {
      // Act: Trigger the captured 'ready' handler
      if (capturedRedisHandlers['ready']) {
        capturedRedisHandlers['ready'].forEach((handler) => handler());
      }

      // Assert
      expect(logger.info).toHaveBeenCalledWith('Redis connection established');
      expect(cache.isHealthy()).toBe(true);
    });

    test('should handle Redis connection error and log warning', async () => {
      const testError = new Error('Redis connection failed');
      // Act: Trigger the captured 'error' handler
      if (capturedRedisHandlers['error']) {
        capturedRedisHandlers['error'].forEach((handler) => handler(testError));
      }

      // Assert
      expect(logger.warn).toHaveBeenCalledWith(
        'Redis error, falling back to in-memory cache',
        { err: testError }
      );
      expect(mockRedisInstance.disconnect).toHaveBeenCalled();
      expect(cache.isHealthy()).toBe(true); // Falls back to memory cache
    });

    test('should handle Redis connection end and log warning', async () => {
      // Simulate 'ready' first if necessary for state, then 'end'
      if (capturedRedisHandlers['ready']) {
        capturedRedisHandlers['ready'].forEach((handler) => handler());
      }
      // Act: Trigger the captured 'end' handler
      if (capturedRedisHandlers['end']) {
        capturedRedisHandlers['end'].forEach((handler) => handler());
      }

      // Assert
      expect(logger.warn).toHaveBeenCalledWith('Redis connection closed');
      expect(cache.isHealthy()).toBe(false); // No longer healthy if connection ended
    });

    test('should handle Redis init failure and use memory cache', async () => {
      const initFailError = new Error('Redis init failed');
      // Arrange: Mock ioredis constructor to throw an error for this specific test
      // This requires resetting modules again and setting up mocks specifically for this test's scope.
      vi.resetModules();
      const ioredisSpecial = (await import('ioredis')).default;
      (ioredisSpecial as unknown as MockInstance).mockImplementationOnce(() => {
        // Use mockImplementationOnce
        throw initFailError;
      });
      // Re-import logger and cache for this test's isolated module context
      const localLogger = (await import('../../src/services/logger')).default;
      const localCache = (await import('../../src/services/cache')).default;

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
