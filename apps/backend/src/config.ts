import { RATE_LIMIT, GIT_SERVICE } from '@gitray/shared-types';
import path from 'path';
import os from 'os';

/**
 * FIX: Added comprehensive configuration for HybridLRUCache
 * Supporting all environment variables mentioned in the issue
 */

// Helper function to parse numeric environment variables with defaults
function parseEnvNumber(
  envVar: string | undefined,
  defaultValue: number
): number {
  if (!envVar) return defaultValue;
  const parsed = Number(envVar);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Helper function to parse boolean environment variables
function parseEnvBoolean(
  envVar: string | undefined,
  defaultValue: boolean
): boolean {
  if (!envVar) return defaultValue;
  return envVar.toLowerCase() === 'true';
}

// Consolidated runtime configuration values
export const config = {
  // Port the backend listens on
  port: parseEnvNumber(process.env.PORT, 3001),

  // Allowed CORS origin for the frontend
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },

  // Express rate limiting options
  rateLimit: {
    windowMs: RATE_LIMIT.WINDOW_MS,
    max: RATE_LIMIT.MAX_REQUESTS,
    message: RATE_LIMIT.MESSAGE,
  },

  // Redis connection settings
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseEnvNumber(process.env.REDIS_PORT, 6379),
    // Additional Redis options for production
    password: process.env.REDIS_PASSWORD,
    db: parseEnvNumber(process.env.REDIS_DB, 0),
    connectTimeout: parseEnvNumber(process.env.REDIS_CONNECT_TIMEOUT, 10000),
    lazyConnect: parseEnvBoolean(process.env.REDIS_LAZY_CONNECT, true),
  },

  // Git defaults used by GitService
  git: {
    maxConcurrentProcesses: GIT_SERVICE.MAX_CONCURRENT_PROCESSES,
    cloneDepth: GIT_SERVICE.CLONE_DEPTH,
  },

  /**
   * NEW: HybridLRUCache configuration
   * All environment variables from the issue specification
   */
  hybridCache: {
    // Maximum number of entries across all cache tiers
    maxEntries: parseEnvNumber(process.env.CACHE_MAX_ENTRIES, 10000),

    // Memory limit in bytes (converted from GB)
    memoryLimitBytes:
      parseEnvNumber(process.env.CACHE_MEMORY_LIMIT_GB, 1) * 1024 ** 3,

    // Path for on-disk cache storage
    diskPath:
      process.env.CACHE_ONDISK_PATH || path.join(os.tmpdir(), 'gitray-cache'),

    // Lock timeout in milliseconds for concurrent operations
    lockTimeoutMs: parseEnvNumber(process.env.CACHE_LOCK_TIMEOUT_MS, 120000),

    // Enable/disable specific cache tiers
    enableRedis: parseEnvBoolean(process.env.CACHE_ENABLE_REDIS, true),
    enableDisk: parseEnvBoolean(process.env.CACHE_ENABLE_DISK, true),

    // Additional performance tuning options
    diskSyncInterval: parseEnvNumber(
      process.env.CACHE_DISK_SYNC_INTERVAL_MS,
      5000
    ),
    memoryCheckInterval: parseEnvNumber(
      process.env.CACHE_MEMORY_CHECK_INTERVAL_MS,
      1000
    ),

    // Redis-specific options for hybrid cache
    redisConfig: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseEnvNumber(process.env.REDIS_PORT, 6379),
      password: process.env.REDIS_PASSWORD,
      db: parseEnvNumber(process.env.REDIS_CACHE_DB, 1), // Separate DB for cache
      keyPrefix: process.env.CACHE_REDIS_PREFIX || 'gitray:cache:',
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: parseEnvNumber(process.env.REDIS_CONNECT_TIMEOUT, 10000),
      lazyConnect: true,
    },
  },

  /**
   * NEW: Lock manager configuration
   */
  locks: {
    // Directory for file-based locks
    lockDir: process.env.LOCK_DIR || path.join(os.tmpdir(), 'gitray-locks'),

    // Default timeout for lock acquisition
    defaultTimeoutMs: parseEnvNumber(process.env.CACHE_LOCK_TIMEOUT_MS, 120000),

    // Cleanup interval for stale locks
    cleanupIntervalMs: parseEnvNumber(
      process.env.LOCK_CLEANUP_INTERVAL_MS,
      300000
    ), // 5 minutes

    // Maximum age for lock files before considering them stale
    staleLockAgeMs: parseEnvNumber(process.env.LOCK_STALE_AGE_MS, 600000), // 10 minutes

    enableLockLogging: parseEnvBoolean(process.env.DEBUG_LOCK_LOGGING, false), // FIX: Added missing property
  },

  /**
   * NEW: Streaming configuration for large repositories
   * (Preparation for Subissue 4)
   */
  streaming: {
    // Threshold for switching to streaming mode (number of commits)
    commitThreshold: parseEnvNumber(
      process.env.STREAMING_COMMIT_THRESHOLD,
      50000
    ),

    // Batch size for streaming operations
    batchSize: parseEnvNumber(process.env.STREAMING_BATCH_SIZE, 1000),

    // Enable/disable streaming mode
    enabled: parseEnvBoolean(process.env.STREAMING_ENABLED, true),
  },

  /**
   * NEW: Development and debugging options
   */
  debug: {
    // Enable detailed cache logging
    enableCacheLogging: parseEnvBoolean(process.env.DEBUG_CACHE_LOGGING, false),

    // Enable lock debugging
    enableLockLogging: parseEnvBoolean(process.env.DEBUG_LOCK_LOGGING, false),

    // Log level for the application
    logLevel: process.env.LOG_LEVEL || 'info',

    // Enable metrics collection
    enableMetrics: parseEnvBoolean(process.env.ENABLE_METRICS, true),
  },
};

/**
 * Configuration validation
 * Ensures that the configuration is valid and logs warnings for potential issues
 */
export function validateConfig(): void {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Validate hybrid cache configuration
  if (config.hybridCache.maxEntries <= 0) {
    errors.push('CACHE_MAX_ENTRIES must be greater than 0');
  }

  if (config.hybridCache.memoryLimitBytes <= 0) {
    errors.push('CACHE_MEMORY_LIMIT_GB must be greater than 0');
  }

  if (config.hybridCache.lockTimeoutMs <= 0) {
    errors.push('CACHE_LOCK_TIMEOUT_MS must be greater than 0');
  }

  // Validate Redis configuration
  if (config.redis.port <= 0 || config.redis.port > 65535) {
    errors.push('REDIS_PORT must be between 1 and 65535');
  }

  // Performance warnings
  if (config.hybridCache.memoryLimitBytes > 4 * 1024 ** 3) {
    // 4GB
    warnings.push(
      'CACHE_MEMORY_LIMIT_GB is very high (>4GB), ensure sufficient system memory'
    );
  }

  if (config.hybridCache.maxEntries > 100000) {
    warnings.push(
      'CACHE_MAX_ENTRIES is very high (>100k), may impact performance'
    );
  }

  // Log validation results
  if (errors.length > 0) {
    console.error('Configuration errors found:');
    errors.forEach((error) => console.error(`  - ${error}`));
    throw new Error('Invalid configuration detected');
  }

  if (warnings.length > 0) {
    console.warn('Configuration warnings:');
    warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  // Log current configuration in debug mode
  if (config.debug.logLevel === 'debug') {
    console.debug('Loaded configuration:', {
      hybridCache: {
        maxEntries: config.hybridCache.maxEntries,
        memoryLimitMB: Math.round(
          config.hybridCache.memoryLimitBytes / 1024 ** 2
        ),
        diskPath: config.hybridCache.diskPath,
        lockTimeoutMs: config.hybridCache.lockTimeoutMs,
      },
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
      },
    });
  }
}

// Export individual configurations for easy importing
export const {
  hybridCache: hybridCacheConfig,
  locks: lockConfig,
  streaming: streamingConfig,
  debug: debugConfig,
} = config;

export default config;
