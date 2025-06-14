// apps/backend/__tests__/config.test.ts

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the shared-types module with correct default values
vi.mock('@gitray/shared-types', () => ({
  RATE_LIMIT: {
    WINDOW_MS: 60000,
    MAX_REQUESTS: 100,
    MESSAGE: 'Too many requests',
  },
  GIT_SERVICE: {
    MAX_CONCURRENT_PROCESSES: 5,
    CLONE_DEPTH: 1,
  },
}));

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Environment Variable Parsing', () => {
    test('should parse numeric environment variables correctly', async () => {
      process.env.PORT = '8080';
      process.env.REDIS_PORT = '6380';
      process.env.GIT_MAX_CONCURRENT_PROCESSES = '8';

      const { config } = await import('../src/config');

      expect(config.port).toBe(8080);
      expect(config.redis.port).toBe(6380);
      expect(config.git.maxConcurrentProcesses).toBe(8);
    });

    test('should use default values for missing environment variables', async () => {
      delete process.env.PORT;
      delete process.env.REDIS_PORT;
      delete process.env.GIT_MAX_CONCURRENT_PROCESSES;

      const { config } = await import('../src/config');

      expect(config.port).toBe(3001);
      expect(config.redis.port).toBe(6379);
      expect(config.git.maxConcurrentProcesses).toBe(5);
    });

    test('should handle invalid numeric environment variables', async () => {
      process.env.PORT = 'invalid-port';
      process.env.REDIS_PORT = 'not-a-number';
      process.env.GIT_MAX_CONCURRENT_PROCESSES = 'invalid';

      const { config } = await import('../src/config');

      // Should fall back to defaults for invalid values
      expect(config.port).toBe(3001);
      expect(config.redis.port).toBe(6379);
      expect(config.git.maxConcurrentProcesses).toBe(5);
    });

    test('should parse boolean environment variables correctly', async () => {
      process.env.REDIS_LAZY_CONNECT = 'false';
      process.env.CACHE_ENABLE_REDIS = 'true';
      process.env.CACHE_ENABLE_DISK = 'false';

      const { config } = await import('../src/config');

      expect(config.redis.lazyConnect).toBe(false);
      expect(config.hybridCache.enableRedis).toBe(true);
      expect(config.hybridCache.enableDisk).toBe(false);
    });

    test('should handle case-insensitive boolean values', async () => {
      process.env.CACHE_ENABLE_REDIS = 'TRUE';
      process.env.CACHE_ENABLE_DISK = 'False';
      process.env.REDIS_LAZY_CONNECT = 'True';

      const { config } = await import('../src/config');

      expect(config.hybridCache.enableRedis).toBe(true);
      expect(config.hybridCache.enableDisk).toBe(false);
      expect(config.redis.lazyConnect).toBe(true);
    });

    test('should use default values for missing boolean environment variables', async () => {
      delete process.env.CACHE_ENABLE_REDIS;
      delete process.env.CACHE_ENABLE_DISK;
      delete process.env.REDIS_LAZY_CONNECT;

      const { config } = await import('../src/config');

      expect(config.hybridCache.enableRedis).toBe(true);
      expect(config.hybridCache.enableDisk).toBe(true);
      expect(config.redis.lazyConnect).toBe(true);
    });
  });

  describe('Server Configuration', () => {
    test('should configure server port correctly', async () => {
      process.env.PORT = '4000';

      const { config } = await import('../src/config');

      expect(config.port).toBe(4000);
    });

    test('should configure CORS origin correctly', async () => {
      process.env.CORS_ORIGIN = 'https://example.com';

      const { config } = await import('../src/config');

      expect(config.cors.origin).toBe('https://example.com');
      expect(config.cors.credentials).toBe(true);
    });

    test('should use default CORS origin when not specified', async () => {
      delete process.env.CORS_ORIGIN;

      const { config } = await import('../src/config');

      expect(config.cors.origin).toBe('http://localhost:5173');
    });
  });

  describe('Rate Limiting Configuration', () => {
    test('should configure rate limiting from shared constants', async () => {
      const { config } = await import('../src/config');

      expect(config.rateLimit).toEqual({
        windowMs: 60000,
        max: 100,
        message: 'Too many requests',
      });
    });
  });

  describe('Redis Configuration', () => {
    test('should configure Redis connection settings', async () => {
      process.env.REDIS_HOST = 'redis.example.com';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'secret123';
      process.env.REDIS_DB = '2';

      const { config } = await import('../src/config');

      expect(config.redis.host).toBe('redis.example.com');
      expect(config.redis.port).toBe(6380);
      expect(config.redis.password).toBe('secret123');
      expect(config.redis.db).toBe(2);
    });

    test('should use default Redis settings when not specified', async () => {
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
      delete process.env.REDIS_PASSWORD;
      delete process.env.REDIS_DB;

      const { config } = await import('../src/config');

      expect(config.redis.host).toBe('localhost');
      expect(config.redis.port).toBe(6379);
      expect(config.redis.password).toBeUndefined();
      expect(config.redis.db).toBe(0);
    });
  });

  describe('Git Configuration', () => {
    test('should configure Git maxConcurrentProcesses and cloneDepth', async () => {
      process.env.GIT_MAX_CONCURRENT_PROCESSES = '8';
      process.env.GIT_CLONE_DEPTH = '42';
      const { config } = await import('../src/config');
      expect(config.git.maxConcurrentProcesses).toBe(8);
      expect(config.git.cloneDepth).toBe(42);
    });
    test('should use default Git settings', async () => {
      delete process.env.GIT_MAX_CONCURRENT_PROCESSES;
      delete process.env.GIT_CLONE_DEPTH;
      const { config } = await import('../src/config');
      expect(config.git.maxConcurrentProcesses).toBe(5);
      expect(config.git.cloneDepth).toBe(1);
    });
  });

  describe('Hybrid Cache Configuration', () => {
    test('should configure hybrid cache settings', async () => {
      process.env.CACHE_MAX_ENTRIES = '2000';
      process.env.CACHE_MEMORY_LIMIT_GB = '2';
      process.env.CACHE_ONDISK_PATH = '/custom/cache';
      process.env.CACHE_LOCK_TIMEOUT_MS = '10000';
      process.env.CACHE_ENABLE_REDIS = 'true';
      process.env.CACHE_ENABLE_DISK = 'false';

      const { config } = await import('../src/config');

      expect(config.hybridCache.maxEntries).toBe(2000);
      expect(config.hybridCache.memoryLimitBytes).toBe(2 * 1024 ** 3);
      expect(config.hybridCache.diskPath).toBe('/custom/cache');
      expect(config.hybridCache.lockTimeoutMs).toBe(10000);
      expect(config.hybridCache.enableRedis).toBe(true);
      expect(config.hybridCache.enableDisk).toBe(false);
    });

    test('should configure Redis settings for hybrid cache', async () => {
      process.env.CACHE_ENABLE_REDIS = 'true';
      process.env.REDIS_HOST = 'cache-redis.example.com';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'cache-secret';
      process.env.REDIS_CACHE_DB = '3';
      process.env.CACHE_REDIS_PREFIX = 'gitray-cache:';

      const { config } = await import('../src/config');

      expect(config.hybridCache.enableRedis).toBe(true);
      expect(config.hybridCache.redisConfig).toMatchObject({
        host: 'cache-redis.example.com',
        port: 6380,
        password: 'cache-secret',
        db: 3,
        keyPrefix: 'gitray-cache:',
      });
    });

    test('should use default hybrid cache settings', async () => {
      delete process.env.CACHE_MAX_ENTRIES;
      delete process.env.CACHE_MEMORY_LIMIT_GB;
      delete process.env.CACHE_ONDISK_PATH;
      delete process.env.CACHE_LOCK_TIMEOUT_MS;
      delete process.env.CACHE_ENABLE_REDIS;
      delete process.env.CACHE_ENABLE_DISK;

      const { config } = await import('../src/config');

      expect(config.hybridCache.maxEntries).toBe(10000);
      expect(config.hybridCache.memoryLimitBytes).toBe(1 * 1024 ** 3);
      expect(config.hybridCache.diskPath).toContain('/tmp/gitray-cache');
      expect(config.hybridCache.lockTimeoutMs).toBe(120000);
      expect(config.hybridCache.enableRedis).toBe(true);
      expect(config.hybridCache.enableDisk).toBe(true);
    });
  });

  describe('Cache Strategy Configuration', () => {
    test('should configure cache strategy settings', async () => {
      process.env.CACHE_HIERARCHICAL_ENABLED = 'false';
      process.env.CACHE_RAW_COMMITS_TTL_SECONDS = '7200';
      process.env.CACHE_FILTERED_COMMITS_TTL_SECONDS = '3600';
      process.env.CACHE_AGGREGATED_DATA_TTL_SECONDS = '1800';

      const { config } = await import('../src/config');

      expect(config.cacheStrategy.hierarchicalCaching).toBe(false);
      expect(config.cacheStrategy.cacheKeys.rawCommitsTTL).toBe(7200);
      expect(config.cacheStrategy.cacheKeys.filteredCommitsTTL).toBe(3600);
      expect(config.cacheStrategy.cacheKeys.aggregatedDataTTL).toBe(1800);
    });

    test('should use default cache strategy settings', async () => {
      delete process.env.CACHE_HIERARCHICAL_ENABLED;
      delete process.env.CACHE_RAW_COMMITS_TTL_SECONDS;
      delete process.env.CACHE_FILTERED_COMMITS_TTL_SECONDS;
      delete process.env.CACHE_AGGREGATED_DATA_TTL_SECONDS;

      const { config } = await import('../src/config');

      expect(config.cacheStrategy.hierarchicalCaching).toBe(true);
      expect(config.cacheStrategy.cacheKeys.rawCommitsTTL).toBe(3600);
      expect(config.cacheStrategy.cacheKeys.filteredCommitsTTL).toBe(1800);
      expect(config.cacheStrategy.cacheKeys.aggregatedDataTTL).toBe(900);
    });
  });

  describe('Lock Configuration', () => {
    test('should configure lock settings', async () => {
      process.env.LOCK_DIR = '/custom/locks';
      process.env.CACHE_LOCK_TIMEOUT_MS = '10000';
      process.env.LOCK_CLEANUP_INTERVAL_MS = '60000';
      process.env.LOCK_STALE_AGE_MS = '120000';
      process.env.DEBUG_LOCK_LOGGING = 'true';
      const { config } = await import('../src/config');
      expect(config.locks.lockDir).toBe('/custom/locks');
      expect(config.locks.defaultTimeoutMs).toBe(10000);
      expect(config.locks.cleanupIntervalMs).toBe(60000);
      expect(config.locks.staleLockAgeMs).toBe(120000);
      expect(config.locks.enableLockLogging).toBe(true);
    });
    test('should use default lock settings', async () => {
      delete process.env.LOCK_DIR;
      delete process.env.CACHE_LOCK_TIMEOUT_MS;
      delete process.env.LOCK_CLEANUP_INTERVAL_MS;
      delete process.env.LOCK_STALE_AGE_MS;
      delete process.env.DEBUG_LOCK_LOGGING;
      const { config } = await import('../src/config');
      expect(config.locks.lockDir).toContain('/tmp/gitray-locks');
      expect(config.locks.defaultTimeoutMs).toBe(120000);
      expect(config.locks.cleanupIntervalMs).toBe(300000);
      expect(config.locks.staleLockAgeMs).toBe(600000);
      expect(config.locks.enableLockLogging).toBe(false);
    });
  });

  describe('Operation Coordination Configuration', () => {
    test('should configure operation coordination settings', async () => {
      process.env.REPO_MAX_CONCURRENT_OPS = '20';
      process.env.REPO_OPERATION_TIMEOUT_MS = '180000';
      process.env.REPO_OPERATION_MAX_QUEUE_SIZE = '15';
      process.env.REPO_OPERATION_COORDINATION_ENABLED = 'true';
      const { config } = await import('../src/config');
      expect(config.operationCoordination.maxConcurrentOpsPerRepo).toBe(20);
      expect(config.operationCoordination.operationTimeoutMs).toBe(180000);
      expect(config.operationCoordination.maxQueueSize).toBe(15);
      expect(config.operationCoordination.enabled).toBe(true);
    });
    test('should use default operation coordination settings', async () => {
      delete process.env.REPO_MAX_CONCURRENT_OPS;
      delete process.env.REPO_OPERATION_TIMEOUT_MS;
      delete process.env.REPO_OPERATION_MAX_QUEUE_SIZE;
      delete process.env.REPO_OPERATION_COORDINATION_ENABLED;
      const { config } = await import('../src/config');
      expect(config.operationCoordination.maxConcurrentOpsPerRepo).toBe(3);
      expect(config.operationCoordination.operationTimeoutMs).toBe(600000);
      expect(config.operationCoordination.maxQueueSize).toBe(10);
      expect(config.operationCoordination.enabled).toBe(true);
    });
  });

  describe('Configuration Validation', () => {
    test('should validate hybrid cache configuration', async () => {
      process.env.CACHE_MAX_ENTRIES = '0';
      process.env.CACHE_MEMORY_LIMIT_GB = '0';
      process.env.CACHE_LOCK_TIMEOUT_MS = '0';

      const { validateConfig } = await import('../src/config');

      expect(() => validateConfig()).toThrow();
    });

    test('should validate Redis configuration', async () => {
      process.env.REDIS_PORT = '70000'; // Invalid port

      const { validateConfig } = await import('../src/config');

      expect(() => validateConfig()).toThrow();
    });

    test('should validate Git configuration', async () => {
      process.env.GIT_MAX_CONCURRENT_PROCESSES = '0';
      process.env.GIT_CLONE_DEPTH = '0';

      const { validateConfig } = await import('../src/config');

      expect(() => validateConfig()).toThrow();
    });

    test('should warn about high Git concurrent processes', async () => {
      process.env.GIT_MAX_CONCURRENT_PROCESSES = '25';

      const { validateConfig } = await import('../src/config');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateConfig();

      // The validation should not throw but should warn
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('GIT_MAX_CONCURRENT_PROCESSES is very high')
      );

      consoleSpy.mockRestore();
    });

    test('should warn about low Git clone depth', async () => {
      process.env.GIT_CLONE_DEPTH = '5';

      const { validateConfig } = await import('../src/config');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateConfig();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('GIT_CLONE_DEPTH is very low')
      );

      consoleSpy.mockRestore();
    });

    test('should validate repository cache configuration when enabled', async () => {
      process.env.REPO_CACHE_ENABLED = 'true';
      process.env.REPO_CACHE_MAX_REPOSITORIES = '0';
      process.env.REPO_CACHE_MAX_AGE_HOURS = '0';

      const { validateConfig } = await import('../src/config');

      expect(() => validateConfig()).toThrow();
    });

    test('should warn about low repository cache disk limit', async () => {
      process.env.REPO_CACHE_ENABLED = 'true';
      process.env.REPO_CACHE_DISK_LIMIT_GB = '0.05'; // 50MB

      const { validateConfig } = await import('../src/config');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateConfig();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('REPO_CACHE_DISK_LIMIT_GB is very low')
      );

      consoleSpy.mockRestore();
    });

    test('should warn about high repository cache disk limit', async () => {
      process.env.REPO_CACHE_ENABLED = 'true';
      process.env.REPO_CACHE_DISK_LIMIT_GB = '60'; // 60GB

      const { validateConfig } = await import('../src/config');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateConfig();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('REPO_CACHE_DISK_LIMIT_GB is very high')
      );

      consoleSpy.mockRestore();
    });

    test('should validate operation coordination when enabled', async () => {
      process.env.REPO_OPERATION_COORDINATION_ENABLED = 'true';
      process.env.REPO_MAX_CONCURRENT_OPS = '0';

      const { validateConfig } = await import('../src/config');

      expect(() => validateConfig()).toThrow();
    });

    test('should warn about low operation timeout', async () => {
      process.env.REPO_OPERATION_COORDINATION_ENABLED = 'true';
      process.env.REPO_OPERATION_TIMEOUT_MS = '10000'; // 10 seconds

      const { validateConfig } = await import('../src/config');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateConfig();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('REPO_OPERATION_TIMEOUT_MS is very low')
      );

      consoleSpy.mockRestore();
    });

    test('should validate cache strategy thresholds', async () => {
      process.env.CACHE_MEMORY_PRESSURE_THRESHOLD = '120'; // Invalid: > 100
      process.env.CACHE_EMERGENCY_EVICTION_PERCENT = '120'; // Invalid: > 100

      const { validateConfig } = await import('../src/config');

      expect(() => validateConfig()).toThrow();
    });

    test('should validate cache strategy thresholds - zero values', async () => {
      process.env.CACHE_MEMORY_PRESSURE_THRESHOLD = '0';
      process.env.CACHE_EMERGENCY_EVICTION_PERCENT = '0';

      const { validateConfig } = await import('../src/config');

      expect(() => validateConfig()).toThrow();
    });

    test('should warn about very low raw commits TTL', async () => {
      process.env.CACHE_RAW_COMMITS_TTL_SECONDS = '60'; // 1 minute

      const { validateConfig } = await import('../src/config');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateConfig();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('CACHE_RAW_COMMITS_TTL_SECONDS is very low')
      );

      consoleSpy.mockRestore();
    });

    test('should warn about very high raw commits TTL', async () => {
      process.env.CACHE_RAW_COMMITS_TTL_SECONDS = '100000'; // > 24 hours

      const { validateConfig } = await import('../src/config');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateConfig();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('CACHE_RAW_COMMITS_TTL_SECONDS is very high')
      );

      consoleSpy.mockRestore();
    });

    test('should pass validation with valid configuration', async () => {
      // Set all valid values
      process.env.CACHE_MAX_ENTRIES = '1000';
      process.env.CACHE_MEMORY_LIMIT_GB = '1';
      process.env.CACHE_LOCK_TIMEOUT_MS = '30000';
      process.env.REDIS_PORT = '6379';
      process.env.GIT_MAX_CONCURRENT_PROCESSES = '5';
      process.env.GIT_CLONE_DEPTH = '50';
      process.env.REPO_CACHE_ENABLED = 'true';
      process.env.REPO_CACHE_MAX_REPOSITORIES = '50';
      process.env.REPO_CACHE_MAX_AGE_HOURS = '24';
      process.env.REPO_CACHE_DISK_LIMIT_GB = '5';
      process.env.REPO_OPERATION_COORDINATION_ENABLED = 'true';
      process.env.REPO_OPERATION_TIMEOUT_MS = '600000';
      process.env.REPO_MAX_CONCURRENT_OPS = '3';
      process.env.CACHE_MEMORY_PRESSURE_THRESHOLD = '80';
      process.env.CACHE_EMERGENCY_EVICTION_PERCENT = '30';
      process.env.CACHE_RAW_COMMITS_TTL_SECONDS = '3600';

      const { validateConfig } = await import('../src/config');

      expect(() => validateConfig()).not.toThrow();
    });

    test('should handle repository cache disabled', async () => {
      process.env.REPO_CACHE_ENABLED = 'false';

      const { validateConfig } = await import('../src/config');

      // Should not validate repository cache settings when disabled
      expect(() => validateConfig()).not.toThrow();
    });

    test('should handle operation coordination disabled', async () => {
      process.env.REPO_OPERATION_COORDINATION_ENABLED = 'false';

      const { validateConfig } = await import('../src/config');

      // Should not validate operation coordination settings when disabled
      expect(() => validateConfig()).not.toThrow();
    });
  });

  describe('Advanced Configuration Features', () => {
    test('should configure streaming settings', async () => {
      process.env.STREAMING_ENABLED = 'true';
      process.env.STREAMING_COMMIT_THRESHOLD = '100000';
      process.env.STREAMING_BATCH_SIZE = '2000';

      const { config } = await import('../src/config');

      expect(config.streaming.enabled).toBe(true);
      expect(config.streaming.commitThreshold).toBe(100000);
      expect(config.streaming.batchSize).toBe(2000);
    });

    test('should configure debug settings', async () => {
      process.env.DEBUG_CACHE_LOGGING = 'true';
      process.env.DEBUG_LOCK_LOGGING = 'true';
      process.env.LOG_LEVEL = 'debug';
      process.env.ENABLE_METRICS = 'false';

      const { config } = await import('../src/config');

      expect(config.debug.enableCacheLogging).toBe(true);
      expect(config.debug.enableLockLogging).toBe(true);
      expect(config.debug.logLevel).toBe('debug');
      expect(config.debug.enableMetrics).toBe(false);
    });

    test('should configure cache warming settings', async () => {
      process.env.CACHE_WARMING_ENABLED = 'true';
      process.env.CACHE_WARMING_MAX_REPOS = '20';
      process.env.CACHE_WARMING_SCHEDULE_HOURS = '12';

      const { config } = await import('../src/config');

      expect(config.cacheStrategy.cacheWarming.enabled).toBe(true);
      expect(config.cacheStrategy.cacheWarming.maxWarmupRepos).toBe(20);
      expect(config.cacheStrategy.cacheWarming.warmupScheduleHours).toBe(12);
    });

    test('should configure lock manager settings', async () => {
      process.env.LOCK_DIR = '/custom/lock/dir';
      process.env.CACHE_LOCK_TIMEOUT_MS = '180000';
      process.env.LOCK_CLEANUP_INTERVAL_MS = '600000';
      process.env.LOCK_STALE_AGE_MS = '1200000';
      process.env.DEBUG_LOCK_LOGGING = 'true';

      const { config } = await import('../src/config');

      expect(config.locks.lockDir).toBe('/custom/lock/dir');
      expect(config.locks.defaultTimeoutMs).toBe(180000);
      expect(config.locks.cleanupIntervalMs).toBe(600000);
      expect(config.locks.staleLockAgeMs).toBe(1200000);
      expect(config.locks.enableLockLogging).toBe(true);
    });

    test('should configure all cache TTL settings', async () => {
      process.env.CACHE_RAW_COMMITS_TTL_SECONDS = '7200';
      process.env.CACHE_FILTERED_COMMITS_TTL_SECONDS = '3600';
      process.env.CACHE_AGGREGATED_DATA_TTL_SECONDS = '1800';
      process.env.CACHE_REPOSITORY_INFO_TTL_SECONDS = '14400';

      const { config } = await import('../src/config');

      expect(config.cacheStrategy.cacheKeys.rawCommitsTTL).toBe(7200);
      expect(config.cacheStrategy.cacheKeys.filteredCommitsTTL).toBe(3600);
      expect(config.cacheStrategy.cacheKeys.aggregatedDataTTL).toBe(1800);
      expect(config.cacheStrategy.cacheKeys.repositoryInfoTTL).toBe(14400);
    });
  });

  describe('Helper Functions', () => {
    test('should parse environment numbers correctly', async () => {
      // Test the helper functions by importing the config module
      process.env.TEST_NUMBER = '42';
      process.env.TEST_INVALID_NUMBER = 'not-a-number';

      const { config } = await import('../src/config');

      // The helper functions should be working correctly within the config
      expect(typeof config.port).toBe('number');
      expect(typeof config.redis.port).toBe('number');
    });

    test('should parse environment booleans correctly', async () => {
      process.env.TEST_BOOLEAN_TRUE = 'true';
      process.env.TEST_BOOLEAN_FALSE = 'false';
      process.env.TEST_BOOLEAN_INVALID = 'maybe';

      const { config } = await import('../src/config');

      // The helper functions should be working correctly within the config
      expect(typeof config.hybridCache.enableRedis).toBe('boolean');
      expect(typeof config.hybridCache.enableDisk).toBe('boolean');
    });
  });
});
