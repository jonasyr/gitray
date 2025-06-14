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
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
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
    maxConcurrentProcesses: parseEnvNumber(
      process.env.GIT_MAX_CONCURRENT_PROCESSES,
      GIT_SERVICE.MAX_CONCURRENT_PROCESSES
    ),
    cloneDepth: parseEnvNumber(
      process.env.GIT_CLONE_DEPTH,
      GIT_SERVICE.CLONE_DEPTH
    ),
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

  /**
   * NEW: Repository-level caching configuration
   * Controls the shared repository coordinator and prevents duplicate clones
   */
  repositoryCache: {
    // Enable/disable the repository coordination system
    enabled: parseEnvBoolean(process.env.REPO_CACHE_ENABLED, true),

    // Maximum number of repositories to keep cached
    maxRepositories: parseEnvNumber(
      process.env.REPO_CACHE_MAX_REPOSITORIES,
      50
    ),

    // Maximum age of cached repositories in hours
    maxAgeHours: parseEnvNumber(process.env.REPO_CACHE_MAX_AGE_HOURS, 24),

    // Memory limit for repository metadata (in bytes)
    memoryLimitBytes:
      parseEnvNumber(process.env.REPO_CACHE_MEMORY_LIMIT_GB, 1) * 1024 ** 3,

    // Disk limit for cached repositories (in bytes)
    diskLimitBytes:
      parseEnvNumber(process.env.REPO_CACHE_DISK_LIMIT_GB, 5) * 1024 ** 3,

    // Cleanup interval for expired repositories (in milliseconds)
    cleanupIntervalMs: parseEnvNumber(
      process.env.REPO_CACHE_CLEANUP_INTERVAL_MS,
      5 * 60 * 1000
    ), // 5 minutes

    // Enable aggressive cleanup when memory pressure is detected
    aggressiveEviction: parseEnvBoolean(
      process.env.REPO_CACHE_AGGRESSIVE_EVICTION,
      true
    ),

    // Base directory for shared repository storage
    basePath:
      process.env.REPO_CACHE_BASE_PATH ||
      path.join(os.tmpdir(), 'gitray-shared-repos'),
  },

  /**
   * NEW: Operation coordination configuration
   * Controls how parallel operations on the same repository are handled
   */
  operationCoordination: {
    // Enable operation coordination and coalescing
    enabled: parseEnvBoolean(
      process.env.REPO_OPERATION_COORDINATION_ENABLED,
      true
    ),

    // Timeout for coordinated operations (in milliseconds)
    operationTimeoutMs: parseEnvNumber(
      process.env.REPO_OPERATION_TIMEOUT_MS,
      10 * 60 * 1000
    ), // 10 minutes

    // Enable coalescing of identical operations
    coalescingEnabled: parseEnvBoolean(
      process.env.REPO_OPERATION_COALESCING_ENABLED,
      true
    ),

    // Maximum number of concurrent operations per repository
    maxConcurrentOpsPerRepo: parseEnvNumber(
      process.env.REPO_MAX_CONCURRENT_OPS,
      3
    ),

    // Queue size limit for pending operations
    maxQueueSize: parseEnvNumber(process.env.REPO_OPERATION_MAX_QUEUE_SIZE, 10),

    // Enable detailed operation logging for debugging
    enableOperationLogging: parseEnvBoolean(
      process.env.DEBUG_REPO_OPERATIONS,
      false
    ),
  },

  /**
   * NEW: Enhanced cache strategy configuration
   * Controls the multi-level caching behavior
   */
  cacheStrategy: {
    // Enable hierarchical caching (raw commits -> filtered -> aggregated)
    hierarchicalCaching: parseEnvBoolean(
      process.env.CACHE_HIERARCHICAL_ENABLED,
      true
    ),

    // Memory pressure thresholds
    memoryPressureThreshold:
      parseEnvNumber(process.env.CACHE_MEMORY_PRESSURE_THRESHOLD, 80) / 100, // 80%

    // Emergency eviction size (percentage of cache to evict under pressure)
    emergencyEvictionPercent:
      parseEnvNumber(process.env.CACHE_EMERGENCY_EVICTION_PERCENT, 30) / 100, // 30%

    // Large value bypass threshold (percentage of memory limit)
    largeValueBypassPercent:
      parseEnvNumber(process.env.CACHE_LARGE_VALUE_BYPASS_PERCENT, 10) / 100, // 10%

    // Cache key strategies
    cacheKeys: {
      // Time-to-live for different types of cached data
      rawCommitsTTL: parseEnvNumber(
        process.env.CACHE_RAW_COMMITS_TTL_SECONDS,
        3600
      ), // 1 hour
      filteredCommitsTTL: parseEnvNumber(
        process.env.CACHE_FILTERED_COMMITS_TTL_SECONDS,
        1800
      ), // 30 minutes
      aggregatedDataTTL: parseEnvNumber(
        process.env.CACHE_AGGREGATED_DATA_TTL_SECONDS,
        900
      ), // 15 minutes
      repositoryInfoTTL: parseEnvNumber(
        process.env.CACHE_REPOSITORY_INFO_TTL_SECONDS,
        7200
      ), // 2 hours
    },

    // Enable cache warming for frequently accessed repositories
    cacheWarming: {
      enabled: parseEnvBoolean(process.env.CACHE_WARMING_ENABLED, false),
      maxWarmupRepos: parseEnvNumber(process.env.CACHE_WARMING_MAX_REPOS, 10),
      warmupScheduleHours: parseEnvNumber(
        process.env.CACHE_WARMING_SCHEDULE_HOURS,
        6
      ), // Every 6 hours
    },
  },
};

/**
 * ENHANCED: Configuration validation with new settings
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

  // Validate Git configuration
  if (config.git.maxConcurrentProcesses <= 0) {
    errors.push('GIT_MAX_CONCURRENT_PROCESSES must be greater than 0');
  }

  if (config.git.maxConcurrentProcesses > 20) {
    warnings.push(
      'GIT_MAX_CONCURRENT_PROCESSES is very high (>20), may overwhelm system resources'
    );
  }

  if (config.git.cloneDepth <= 0) {
    errors.push('GIT_CLONE_DEPTH must be greater than 0');
  }

  if (config.git.cloneDepth < 10) {
    warnings.push(
      'GIT_CLONE_DEPTH is very low (<10), may miss important commit history'
    );
  }

  // Validate repository cache configuration
  if (config.repositoryCache.enabled) {
    if (config.repositoryCache.maxRepositories <= 0) {
      errors.push('REPO_CACHE_MAX_REPOSITORIES must be greater than 0');
    }

    if (config.repositoryCache.maxAgeHours <= 0) {
      errors.push('REPO_CACHE_MAX_AGE_HOURS must be greater than 0');
    }

    if (config.repositoryCache.diskLimitBytes < 100 * 1024 * 1024) {
      // 100MB minimum
      warnings.push(
        'REPO_CACHE_DISK_LIMIT_GB is very low (<100MB), may cause frequent evictions'
      );
    }

    if (config.repositoryCache.diskLimitBytes > 50 * 1024 ** 3) {
      // 50GB
      warnings.push(
        'REPO_CACHE_DISK_LIMIT_GB is very high (>50GB), ensure sufficient disk space'
      );
    }
  }

  // Validate operation coordination
  if (config.operationCoordination.enabled) {
    if (config.operationCoordination.operationTimeoutMs < 30000) {
      // 30 seconds minimum
      warnings.push(
        'REPO_OPERATION_TIMEOUT_MS is very low (<30s), may cause premature timeouts'
      );
    }

    if (config.operationCoordination.maxConcurrentOpsPerRepo <= 0) {
      errors.push('REPO_MAX_CONCURRENT_OPS must be greater than 0');
    }
  }

  // Validate cache strategy
  if (
    config.cacheStrategy.memoryPressureThreshold <= 0 ||
    config.cacheStrategy.memoryPressureThreshold >= 1
  ) {
    errors.push('CACHE_MEMORY_PRESSURE_THRESHOLD must be between 0 and 100');
  }

  if (
    config.cacheStrategy.emergencyEvictionPercent <= 0 ||
    config.cacheStrategy.emergencyEvictionPercent >= 1
  ) {
    errors.push('CACHE_EMERGENCY_EVICTION_PERCENT must be between 0 and 100');
  }

  // Performance warnings for cache strategy
  if (config.cacheStrategy.cacheKeys.rawCommitsTTL < 300) {
    // 5 minutes
    warnings.push(
      'CACHE_RAW_COMMITS_TTL_SECONDS is very low (<5min), may cause excessive recomputation'
    );
  }

  if (config.cacheStrategy.cacheKeys.rawCommitsTTL > 86400) {
    // 24 hours
    warnings.push(
      'CACHE_RAW_COMMITS_TTL_SECONDS is very high (>24h), may use excessive storage'
    );
  }

  // Compatibility warnings
  if (config.repositoryCache.enabled && !config.hybridCache.enableDisk) {
    warnings.push(
      'Repository cache is enabled but hybrid cache disk is disabled - may reduce effectiveness'
    );
  }

  if (config.operationCoordination.enabled && !config.repositoryCache.enabled) {
    warnings.push(
      'Operation coordination is enabled but repository cache is disabled - limited benefits'
    );
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
      git: {
        maxConcurrentProcesses: config.git.maxConcurrentProcesses,
        cloneDepth: config.git.cloneDepth,
      },
    });

    // Log current repository cache configuration in debug mode
    console.debug('Repository cache configuration:', {
      repositoryCache: {
        enabled: config.repositoryCache.enabled,
        maxRepositories: config.repositoryCache.maxRepositories,
        maxAgeHours: config.repositoryCache.maxAgeHours,
        diskLimitGB: Math.round(
          config.repositoryCache.diskLimitBytes / 1024 ** 3
        ),
        basePath: config.repositoryCache.basePath,
      },
      operationCoordination: {
        enabled: config.operationCoordination.enabled,
        coalescingEnabled: config.operationCoordination.coalescingEnabled,
        operationTimeoutMs: config.operationCoordination.operationTimeoutMs,
      },
      cacheStrategy: {
        hierarchicalCaching: config.cacheStrategy.hierarchicalCaching,
        memoryPressureThreshold: `${config.cacheStrategy.memoryPressureThreshold * 100}%`,
        ttl: config.cacheStrategy.cacheKeys,
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
  repositoryCache: repositoryCacheConfig,
  operationCoordination: operationCoordinationConfig,
  cacheStrategy: cacheStrategyConfig,
} = config;

export default config;
