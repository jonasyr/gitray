// apps/backend/__tests__/unit/config.unit.test.ts

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock shared-types module
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

// Mock os module for memory tests
const mockTmpdir = vi.fn(() => '/tmp');
const mockTotalmem = vi.fn(() => 8 * 1024 ** 3); // 8GB default

vi.mock('os', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    tmpdir: mockTmpdir,
    totalmem: mockTotalmem,
  };
});

describe('Config Unit Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.GIT_CLONE_DEPTH = '20'; // Set default to avoid clone depth warnings
    process.env.ADMIN_AUTH_ENABLED = 'false'; // Disable admin auth in tests to avoid token requirement
    mockTotalmem.mockReturnValue(8 * 1024 ** 3); // 8GB default
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Environment Variable Parsing', () => {
    test('should parse valid numeric environment variables', async () => {
      // ARRANGE
      process.env.PORT = '8080';
      process.env.REDIS_PORT = '6380';
      process.env.CACHE_MAX_ENTRIES = '5000';

      // ACT
      const { config } = await import('../../src/config');

      // ASSERT
      expect(config.port).toBe(8080);
      expect(config.redis.port).toBe(6380);
      expect(config.hybridCache.maxEntries).toBe(5000);
    });

    test('should fallback to defaults for invalid numeric values', async () => {
      // ARRANGE
      process.env.PORT = 'invalid-port';
      process.env.REDIS_PORT = 'not-a-number';
      process.env.CACHE_MAX_ENTRIES = 'abc';

      // ACT
      const { config } = await import('../../src/config');

      // ASSERT
      expect(config.port).toBe(3001);
      expect(config.redis.port).toBe(6379);
      expect(config.hybridCache.maxEntries).toBe(10000);
    });

    test('should parse boolean environment variables correctly', async () => {
      // ARRANGE
      process.env.CACHE_ENABLE_REDIS = 'true';
      process.env.CACHE_ENABLE_DISK = 'false';
      process.env.REDIS_LAZY_CONNECT = 'True';

      // ACT
      const { config } = await import('../../src/config');

      // ASSERT
      expect(config.hybridCache.enableRedis).toBe(true);
      expect(config.hybridCache.enableDisk).toBe(false);
      expect(config.redis.lazyConnect).toBe(true);
    });

    test('should handle missing environment variables with defaults', async () => {
      // ARRANGE
      delete process.env.PORT;
      delete process.env.CACHE_ENABLE_REDIS;
      delete process.env.GIT_MAX_CONCURRENT_PROCESSES;

      // ACT
      const { config } = await import('../../src/config');

      // ASSERT
      expect(config.port).toBe(3001);
      expect(config.hybridCache.enableRedis).toBe(true);
      expect(config.git.maxConcurrentProcesses).toBe(5);
    });

    test('should handle edge case boolean values', async () => {
      // ARRANGE
      process.env.CACHE_ENABLE_REDIS = 'FALSE';
      process.env.CACHE_ENABLE_DISK = 'invalid-bool';
      process.env.REDIS_LAZY_CONNECT = '';

      // ACT
      const { config } = await import('../../src/config');

      // ASSERT
      expect(config.hybridCache.enableRedis).toBe(false);
      expect(config.hybridCache.enableDisk).toBe(false); // parseEnvBoolean returns false for invalid strings
      expect(config.redis.lazyConnect).toBe(true); // Default when empty
    });
  });

  describe('Configuration Validation - Error Paths', () => {
    test('should throw error when cache max entries is zero', async () => {
      // ARRANGE
      process.env.CACHE_MAX_ENTRIES = '0';

      // ACT
      const { validateConfig } = await import('../../src/config');

      // ASSERT
      expect(() => validateConfig()).toThrow('Invalid configuration detected');
    });

    test('should throw error when memory limit is zero', async () => {
      // ARRANGE
      process.env.CACHE_MEMORY_LIMIT_GB = '0';

      // ACT
      const { validateConfig } = await import('../../src/config');

      // ASSERT
      expect(() => validateConfig()).toThrow('Invalid configuration detected');
    });

    test('should throw error when Redis port is invalid', async () => {
      // ARRANGE
      process.env.REDIS_PORT = '70000';

      // ACT
      const { validateConfig } = await import('../../src/config');

      // ASSERT
      expect(() => validateConfig()).toThrow('Invalid configuration detected');
    });

    test('should throw error when Git concurrent processes is zero', async () => {
      // ARRANGE
      process.env.GIT_MAX_CONCURRENT_PROCESSES = '0';

      // ACT
      const { validateConfig } = await import('../../src/config');

      // ASSERT
      expect(() => validateConfig()).toThrow('Invalid configuration detected');
    });

    test('should throw error when memory pressure thresholds are invalid', async () => {
      // ARRANGE
      process.env.CACHE_MEMORY_PRESSURE_THRESHOLD = '150';

      // ACT
      const { validateConfig } = await import('../../src/config');

      // ASSERT
      expect(() => validateConfig()).toThrow('Invalid configuration detected');
    });

    test('should throw error when memory threshold ordering is wrong', async () => {
      // ARRANGE
      process.env.MEMORY_WARNING_THRESHOLD = '90';
      process.env.MEMORY_CRITICAL_THRESHOLD = '80';

      // ACT
      const { validateConfig } = await import('../../src/config');

      // ASSERT
      expect(() => validateConfig()).toThrow('Invalid configuration detected');
    });

    test('should throw error when repository cache settings are invalid', async () => {
      // ARRANGE
      process.env.REPO_CACHE_ENABLED = 'true';
      process.env.REPO_CACHE_MAX_REPOSITORIES = '0';

      // ACT
      const { validateConfig } = await import('../../src/config');

      // ASSERT
      expect(() => validateConfig()).toThrow('Invalid configuration detected');
    });
  });

  describe('Configuration Validation - Warning Paths', () => {
    test('should warn when Git concurrent processes is very high', async () => {
      // ARRANGE
      process.env.GIT_MAX_CONCURRENT_PROCESSES = '25';
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // ACT
      const { validateConfig } = await import('../../src/config');
      validateConfig();

      // ASSERT
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('GIT_MAX_CONCURRENT_PROCESSES is very high')
      );

      consoleSpy.mockRestore();
    });

    test('should warn when repository cache disk limit is very low', async () => {
      // ARRANGE
      process.env.REPO_CACHE_ENABLED = 'true';
      process.env.REPO_CACHE_DISK_LIMIT_GB = '0.05';
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // ACT
      const { validateConfig } = await import('../../src/config');
      validateConfig();

      // ASSERT
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('REPO_CACHE_DISK_LIMIT_GB is very low')
      );

      consoleSpy.mockRestore();
    });

    test('should handle cache memory limit configuration correctly', async () => {
      // ARRANGE
      mockTotalmem.mockReturnValue(2 * 1024 ** 3); // 2GB system
      process.env.CACHE_MEMORY_LIMIT_GB = '1.5'; // 1.5GB cache
      process.env.GIT_CLONE_DEPTH = '20'; // Set high enough to avoid the clone depth warning
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // ACT
      const { validateConfig } = await import('../../src/config');
      validateConfig();

      // ASSERT
      // This test verifies that memory limit configuration is handled without errors
      // System-level memory warnings depend on runtime conditions and are tested separately
      expect(() => validateConfig()).not.toThrow();

      consoleSpy.mockRestore();
    });
  });

  describe('Configuration Object Creation', () => {
    test('should create config with custom CORS origin', async () => {
      // ARRANGE
      process.env.CORS_ORIGIN = 'https://custom.example.com';

      // ACT
      const { config } = await import('../../src/config');

      // ASSERT
      expect(config.cors.origin).toBe('https://custom.example.com');
      expect(config.cors.credentials).toBe(true);
    });

    test('should configure hybrid cache with Redis settings', async () => {
      // ARRANGE
      process.env.REDIS_HOST = 'redis.example.com';
      process.env.REDIS_CACHE_DB = '3';
      process.env.CACHE_REDIS_PREFIX = 'custom:';

      // ACT
      const { config } = await import('../../src/config');

      // ASSERT
      expect(config.hybridCache.redisConfig.host).toBe('redis.example.com');
      expect(config.hybridCache.redisConfig.db).toBe(3);
      expect(config.hybridCache.redisConfig.keyPrefix).toBe('custom:');
    });

    test('should configure memory pressure with percentage conversion', async () => {
      // ARRANGE
      process.env.MEMORY_WARNING_THRESHOLD = '75';
      process.env.CACHE_MEMORY_PRESSURE_THRESHOLD = '80';

      // ACT
      const { config } = await import('../../src/config');

      // ASSERT
      expect(config.memoryPressure.warningThreshold).toBe(0.75);
      expect(config.cacheStrategy.memoryPressureThreshold).toBe(0.8);
    });

    test('should configure streaming with threshold and batch size', async () => {
      // ARRANGE
      process.env.STREAMING_COMMIT_THRESHOLD = '100000';
      process.env.STREAMING_BATCH_SIZE = '2000';
      process.env.STREAMING_ENABLED = 'false';

      // ACT
      const { config } = await import('../../src/config');

      // ASSERT
      expect(config.streaming.commitThreshold).toBe(100000);
      expect(config.streaming.batchSize).toBe(2000);
      expect(config.streaming.enabled).toBe(false);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('should handle negative environment variable values', async () => {
      // ARRANGE
      process.env.PORT = '-1';
      process.env.CACHE_MAX_ENTRIES = '-100';

      // ACT
      const { config } = await import('../../src/config');

      // ASSERT
      expect(config.port).toBe(-1); // parseEnvNumber allows negative numbers
      expect(config.hybridCache.maxEntries).toBe(-100);
    });

    test('should handle very large numeric values', async () => {
      // ARRANGE
      process.env.CACHE_MEMORY_LIMIT_GB = '1000';
      process.env.CACHE_MAX_ENTRIES = '999999999';

      // ACT
      const { config } = await import('../../src/config');

      // ASSERT
      expect(config.hybridCache.memoryLimitBytes).toBe(1000 * 1024 ** 3);
      expect(config.hybridCache.maxEntries).toBe(999999999);
    });

    test('should handle floating point environment variables', async () => {
      // ARRANGE
      process.env.PORT = '3000.5';
      process.env.REDIS_PORT = '6379.9';

      // ACT
      const { config } = await import('../../src/config');

      // ASSERT
      expect(config.port).toBe(3000.5);
      expect(config.redis.port).toBe(6379.9);
    });

    test('should handle empty string environment variables', async () => {
      // ARRANGE
      process.env.PORT = '';
      process.env.CACHE_ENABLE_REDIS = '';
      process.env.CORS_ORIGIN = '';

      // ACT
      const { config } = await import('../../src/config');

      // ASSERT
      expect(config.port).toBe(3001); // Falls back to default
      expect(config.hybridCache.enableRedis).toBe(true); // Falls back to default
      expect(config.cors.origin).toBe(''); // Empty string is valid for CORS origin
    });
  });

  describe('Configuration Interdependencies', () => {
    test('should handle disabled repository cache without validation errors', async () => {
      // ARRANGE
      process.env.REPO_CACHE_ENABLED = 'false';
      process.env.REPO_CACHE_MAX_REPOSITORIES = '0'; // Would normally be invalid

      // ACT
      const { validateConfig } = await import('../../src/config');

      // ASSERT
      expect(() => validateConfig()).not.toThrow();
    });

    test('should handle disabled operation coordination without validation errors', async () => {
      // ARRANGE
      process.env.REPO_OPERATION_COORDINATION_ENABLED = 'false';
      process.env.REPO_MAX_CONCURRENT_OPS = '0'; // Would normally be invalid

      // ACT
      const { validateConfig } = await import('../../src/config');

      // ASSERT
      expect(() => validateConfig()).not.toThrow();
    });

    test('should warn about inconsistent cache configuration', async () => {
      // ARRANGE
      process.env.REPO_CACHE_ENABLED = 'true';
      process.env.CACHE_ENABLE_DISK = 'false';
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // ACT
      const { validateConfig } = await import('../../src/config');
      validateConfig();

      // ASSERT
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Repository cache is enabled but hybrid cache disk is disabled'
        )
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Debug Configuration', () => {
    test('should log debug information when debug level is enabled', async () => {
      // ARRANGE
      process.env.LOG_LEVEL = 'debug';
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      // ACT
      const { validateConfig } = await import('../../src/config');
      validateConfig();

      // ASSERT
      expect(consoleSpy).toHaveBeenCalledWith(
        'Loaded configuration:',
        expect.any(Object)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Repository cache configuration:',
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    test('should not log debug information when debug level is disabled', async () => {
      // ARRANGE
      process.env.LOG_LEVEL = 'info';
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      // ACT
      const { validateConfig } = await import('../../src/config');
      validateConfig();

      // ASSERT
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Exported Configuration Objects', () => {
    test('should export individual configuration sections', async () => {
      // ARRANGE & ACT
      const {
        hybridCacheConfig,
        lockConfig,
        streamingConfig,
        debugConfig,
        repositoryCacheConfig,
      } = await import('../../src/config');

      // ASSERT
      expect(hybridCacheConfig).toBeDefined();
      expect(hybridCacheConfig.maxEntries).toBeTypeOf('number');
      expect(lockConfig).toBeDefined();
      expect(lockConfig.lockDir).toBeTypeOf('string');
      expect(streamingConfig).toBeDefined();
      expect(streamingConfig.enabled).toBeTypeOf('boolean');
      expect(debugConfig).toBeDefined();
      expect(debugConfig.logLevel).toBeTypeOf('string');
      expect(repositoryCacheConfig).toBeDefined();
      expect(repositoryCacheConfig.enabled).toBeTypeOf('boolean');
    });
  });

  describe('System Resource Validation', () => {
    test('should handle system memory configuration correctly', async () => {
      // ARRANGE
      mockTotalmem.mockReturnValue(1.5 * 1024 ** 3); // 1.5GB system
      process.env.GIT_CLONE_DEPTH = '20'; // Set high enough to avoid the clone depth warning
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // ACT
      const { validateConfig } = await import('../../src/config');
      validateConfig();

      // ASSERT
      // This test verifies that system memory configuration is handled without errors
      // System-level memory warnings depend on runtime conditions and are tested separately
      expect(() => validateConfig()).not.toThrow();

      consoleSpy.mockRestore();
    });

    test('should pass validation with valid resource allocation', async () => {
      // ARRANGE
      mockTotalmem.mockReturnValue(16 * 1024 ** 3); // 16GB system
      process.env.CACHE_MEMORY_LIMIT_GB = '2'; // 2GB cache
      process.env.CACHE_MAX_ENTRIES = '10000';
      process.env.REDIS_PORT = '6379';

      // ACT
      const { validateConfig } = await import('../../src/config');

      // ASSERT
      expect(() => validateConfig()).not.toThrow();
    });
  });
});
