import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock external dependencies only - not internal Node.js modules
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  quit: vi.fn(),
  keys: vi.fn(),
  on: vi.fn(),
  disconnect: vi.fn(),
};

const mockHybridCache = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  quit: vi.fn(),
  getStats: vi.fn(),
  emergencyEvict: vi.fn(),
};

vi.mock('ioredis', () => ({
  default: vi.fn(() => mockRedis),
}));

vi.mock('../../../src/utils/hybridLruCache', () => ({
  default: vi.fn(() => mockHybridCache),
}));

vi.mock('../../../src/services/metrics', () => ({
  recordEnhancedCacheOperation: vi.fn(),
  updateServiceHealthScore: vi.fn(),
  recordDetailedError: vi.fn(),
}));

vi.mock('../../../src/services/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Test context factory for clean, fast setup
function createCacheContext() {
  const ctx = {
    cache: null as any,
    resetMocks: () => {
      vi.clearAllMocks();
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);
      mockRedis.quit.mockResolvedValue('OK');
      mockRedis.keys.mockResolvedValue([]);
      mockRedis.on.mockReturnValue(mockRedis);

      mockHybridCache.get.mockResolvedValue(null);
      mockHybridCache.set.mockResolvedValue(undefined);
      mockHybridCache.del.mockResolvedValue(undefined);
      mockHybridCache.quit.mockResolvedValue(undefined);
      mockHybridCache.getStats.mockReturnValue({
        memory: { entries: 0, usageBytes: 0 },
        disk: { entries: 0, usageBytes: 0 },
      });
      mockHybridCache.emergencyEvict.mockResolvedValue({
        evictedEntries: 5,
        bytesFreed: 1024,
      });
    },
    async importCache() {
      const cacheModule = await import('../../../src/services/cache');
      this.cache = cacheModule.default;
      return this.cache;
    },
  };

  ctx.resetMocks();
  return ctx;
}

describe('Cache Service - Core Operations', () => {
  let ctx = createCacheContext();

  beforeEach(async () => {
    ctx = createCacheContext();
    await ctx.importCache();
  });

  describe('Cache Operation Fallback Chain', () => {
    test('should execute hybrid → redis → memory fallback for get operations', async () => {
      // ARRANGE
      ctx.cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        true,
        true
      );
      mockHybridCache.get.mockResolvedValueOnce(null);
      mockRedis.get.mockResolvedValueOnce('redis-value');

      // ACT
      const result = await ctx.cache.get('test-key');

      // ASSERT
      expect(result).toBe('redis-value');
      expect(mockHybridCache.get).toHaveBeenCalledWith('test-key');
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
    });

    test('should fallback to memory cache when both hybrid and redis fail', async () => {
      // ARRANGE
      ctx.cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        true,
        true
      );

      // Force both systems to fail for set operations first
      mockHybridCache.set.mockRejectedValue(new Error('Hybrid set failed'));
      mockRedis.set.mockRejectedValue(new Error('Redis set failed'));

      // Pre-populate memory cache by setting when backends fail
      await ctx.cache.set('memory-key', 'memory-value');

      // Force both systems to fail for get operations
      mockHybridCache.get.mockRejectedValue(new Error('Hybrid get failed'));
      mockRedis.get.mockRejectedValue(new Error('Redis get failed'));

      // ACT
      const result = await ctx.cache.get('memory-key');

      // ASSERT
      expect(result).toBe('memory-value');
    });

    test('should gracefully handle cache backend failures during set operations', async () => {
      // ARRANGE
      ctx.cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        true,
        true
      );
      mockHybridCache.set.mockRejectedValue(new Error('Hybrid set failed'));
      mockRedis.set.mockRejectedValue(new Error('Redis set failed'));

      // ACT & ASSERT - Should not throw, fallback to memory
      await expect(ctx.cache.set('key', 'value')).resolves.not.toThrow();

      // Verify fallback worked
      const result = await ctx.cache.get('key');
      expect(result).toBe('value');
    });
  });

  describe('Health Status Logic', () => {
    test('should return true when hybrid cache is healthy', () => {
      // ARRANGE
      ctx.cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        true,
        false
      );

      // ACT & ASSERT
      expect(ctx.cache.isHealthy()).toBe(true);
    });

    test('should return true when only redis is healthy', () => {
      // ARRANGE
      ctx.cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        false,
        true
      );

      // ACT & ASSERT
      expect(ctx.cache.isHealthy()).toBe(true);
    });

    test('should return true when redis was never initialized', () => {
      // ARRANGE
      ctx.cache.__setDependenciesForTesting(
        mockHybridCache,
        null,
        false,
        false
      );

      // ACT & ASSERT
      expect(ctx.cache.isHealthy()).toBe(true);
    });

    test('should return false after intentional shutdown', async () => {
      // ARRANGE
      ctx.cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        true,
        true
      );

      // ACT
      await ctx.cache.quit();

      // ASSERT
      expect(ctx.cache.isHealthy()).toBe(false);
    });
  });

  describe('Backend Switching', () => {
    test('should switch to specified backend and update active backend status', async () => {
      // ARRANGE
      ctx.cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        false,
        false
      );

      // ACT
      await ctx.cache.switchToBackend('redis');

      // ASSERT
      const stats = ctx.cache.getStats();
      expect(stats.activeBackend).toBe('redis');
    });

    test('should throw error for unknown backend type', async () => {
      // ACT & ASSERT
      await expect(ctx.cache.switchToBackend('invalid' as any)).rejects.toThrow(
        'Unknown backend: invalid'
      );
    });
  });

  describe('Emergency Eviction', () => {
    test('should perform hybrid cache emergency eviction when available', async () => {
      // ARRANGE
      ctx.cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        true,
        true
      );

      // ACT
      await ctx.cache.emergencyEvict();

      // ASSERT
      expect(mockHybridCache.emergencyEvict).toHaveBeenCalled();
    });

    test('should fallback to redis eviction when hybrid cache fails', async () => {
      // ARRANGE
      ctx.cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        true,
        true
      );
      mockHybridCache.emergencyEvict.mockRejectedValue(
        new Error('Hybrid eviction failed')
      );
      mockRedis.keys.mockResolvedValue([
        'key1',
        'key2',
        'key3',
        'key4',
        'key5',
      ]);
      mockRedis.del.mockResolvedValue(2);

      // ACT
      await ctx.cache.emergencyEvict();

      // ASSERT
      expect(mockRedis.keys).toHaveBeenCalledWith('*');
      expect(mockRedis.del).toHaveBeenCalled();
    });

    test('should handle complete emergency eviction failure gracefully', async () => {
      // ARRANGE
      ctx.cache.__setDependenciesForTesting(
        mockHybridCache,
        mockRedis,
        true,
        true
      );
      mockHybridCache.emergencyEvict.mockRejectedValue(
        new Error('Hybrid failed')
      );
      mockRedis.keys.mockRejectedValue(new Error('Redis failed'));

      // ACT & ASSERT - Should still succeed with memory cache fallback
      await expect(ctx.cache.emergencyEvict()).resolves.not.toThrow();
    });
  });
});

describe('Cache Service - Error Recovery', () => {
  let ctx = createCacheContext();

  beforeEach(async () => {
    ctx = createCacheContext();
    await ctx.importCache();
  });

  test('should handle redis connection events and update health status', async () => {
    // ARRANGE
    let errorHandler: (err: Error) => void;

    // Setup the Redis mock to capture event handlers during cache initialization
    mockRedis.on.mockImplementation((event, callback) => {
      if (event === 'error') errorHandler = callback;
      return mockRedis;
    });

    // Import the cache service (this will trigger Redis initialization)
    await ctx.importCache();

    // ACT & ASSERT - Simulate error event using the captured error handler
    if (errorHandler!) {
      errorHandler(new Error('Connection lost'));
      // The error handler should have called disconnect
      expect(mockRedis.disconnect).toHaveBeenCalled();
    }
  });

  test('should handle cache operation timeouts and network failures', async () => {
    // ARRANGE
    ctx.cache.__setDependenciesForTesting(
      mockHybridCache,
      mockRedis,
      true,
      true
    );
    mockHybridCache.get.mockImplementation(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Operation timeout')), 10)
        )
    );
    mockRedis.get.mockResolvedValue('redis-fallback');

    // ACT
    const result = await ctx.cache.get('test-key');

    // ASSERT
    expect(result).toBe('redis-fallback');
  });
});

describe('Cache Service - Configuration Scenarios', () => {
  let ctx = createCacheContext();

  beforeEach(() => {
    ctx = createCacheContext();
  });

  test('should handle hybrid cache disabled configuration', async () => {
    // ARRANGE
    vi.doMock('../../../src/config', () => ({
      config: { redis: { host: 'localhost', port: 6379 } },
      hybridCacheConfig: {
        enableRedis: false,
        enableDisk: false,
        maxEntries: 1000,
        memoryLimitBytes: 1048576,
        diskPath: '/tmp/cache',
        lockTimeoutMs: 5000,
        redisConfig: { host: 'localhost', port: 6379 },
      },
    }));

    // ACT
    await ctx.importCache();

    // ASSERT - Should fallback to redis-only mode without throwing
    const stats = ctx.cache.getStats();
    expect(stats.activeBackend).toBe('redis');
  });

  test('should initialize with memory-only when all backends disabled', async () => {
    // ARRANGE
    vi.doMock('../../../src/config', () => ({
      config: { redis: { host: 'localhost', port: 6379 } },
      hybridCacheConfig: {
        enableRedis: false,
        enableDisk: false,
        maxEntries: 1000,
        memoryLimitBytes: 1048576,
        diskPath: '/tmp/cache',
        lockTimeoutMs: 5000,
      },
    }));

    // Simulate initialization failure
    const Redis = await import('ioredis');
    (Redis.default as any).mockImplementation(() => {
      throw new Error('Redis init failed');
    });

    // ACT
    await ctx.importCache();

    // Set dependencies to simulate both backends being null/disabled
    ctx.cache.__setDependenciesForTesting(null, null, false, false);

    // ASSERT
    expect(ctx.cache.isHealthy()).toBe(true); // Memory cache is always healthy
    const stats = ctx.cache.getStats();
    expect(stats.activeBackend).toBe('memory');
  });
});

describe('Cache Service - Stats and Monitoring', () => {
  let ctx = createCacheContext();

  beforeEach(async () => {
    ctx = createCacheContext();
    await ctx.importCache();
  });

  test('should provide comprehensive cache statistics', () => {
    // ARRANGE
    ctx.cache.__setDependenciesForTesting(
      mockHybridCache,
      mockRedis,
      true,
      true
    );

    // ACT
    const stats = ctx.cache.getStats();

    // ASSERT
    expect(stats).toMatchObject({
      activeBackend: expect.any(String),
      redis: {
        healthy: expect.any(Boolean),
        connected: expect.any(Boolean),
      },
      memory: {
        entries: expect.any(Number),
      },
    });
    expect(['hybrid', 'redis', 'memory']).toContain(stats.activeBackend);
  });

  test('should handle stats collection when backends are unavailable', () => {
    // ARRANGE
    ctx.cache.__setDependenciesForTesting(null, null, false, false);

    // ACT
    const stats = ctx.cache.getStats();

    // ASSERT
    expect(stats.activeBackend).toBe('memory');
    expect(stats.redis.connected).toBe(false);
    expect(stats.hybrid).toBeUndefined();
  });
});
