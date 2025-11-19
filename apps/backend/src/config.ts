import { RATE_LIMIT, GIT_SERVICE } from '@gitray/shared-types';
import path from 'node:path';
import os from 'node:os';

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
  return Number.isNaN(parsed) ? defaultValue : parsed;
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
    host: process.env.REDIS_HOST ?? 'localhost',
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
      process.env.CACHE_ONDISK_PATH ?? path.join(os.tmpdir(), 'gitray-cache'),

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
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseEnvNumber(process.env.REDIS_PORT, 6379),
      password: process.env.REDIS_PASSWORD,
      db: parseEnvNumber(process.env.REDIS_CACHE_DB, 1), // Separate DB for cache
      keyPrefix: process.env.CACHE_REDIS_PREFIX ?? 'gitray:cache:',
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
    lockDir: process.env.LOCK_DIR ?? path.join(os.tmpdir(), 'gitray-locks'),

    // Default timeout for lock acquisition
    defaultTimeoutMs: parseEnvNumber(process.env.CACHE_LOCK_TIMEOUT_MS, 120000),

    // Cleanup interval for stale locks
    cleanupIntervalMs: parseEnvNumber(
      process.env.LOCK_CLEANUP_INTERVAL_MS,
      300000
    ), // 5 minutes

    // Maximum age for lock files before considering them stale
    staleLockAgeMs: parseEnvNumber(process.env.LOCK_STALE_AGE_MS, 600000), // 10 minutes

    // Retry delay when lock acquisition fails
    retryDelayMs: parseEnvNumber(process.env.LOCK_RETRY_DELAY_MS, 100),

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

    // Threshold for switching to streaming mode for file analysis (number of files)
    fileThreshold: parseEnvNumber(process.env.STREAMING_FILE_THRESHOLD, 10000),

    // Maximum number of files to process in file analysis
    maxFiles: parseEnvNumber(process.env.STREAMING_MAX_FILES, 100000),

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
    logLevel: process.env.LOG_LEVEL ?? 'info',

    // Enable metrics collection
    enableMetrics: parseEnvBoolean(process.env.ENABLE_METRICS, true),
  },

  /**
   * Admin authentication configuration
   * Controls access to admin-only endpoints like cache management and metrics
   */
  adminAuth: {
    // Enable/disable admin authentication (can be disabled for local development)
    enabled: parseEnvBoolean(process.env.ADMIN_AUTH_ENABLED, true),

    // Require authentication for /metrics endpoint
    requireForMetrics: parseEnvBoolean(
      process.env.REQUIRE_AUTH_FOR_METRICS,
      true
    ),
  },

  /**
   * Admin-specific rate limiting configuration
   * More restrictive than general API rate limiting
   */
  adminRateLimit: {
    // Time window for rate limiting (15 minutes)
    windowMs: parseEnvNumber(process.env.ADMIN_RATE_LIMIT_WINDOW_MS, 900000),

    // Maximum requests per window
    max: parseEnvNumber(process.env.ADMIN_RATE_LIMIT_MAX, 100),

    // Error message for rate limit exceeded
    message: 'Too many admin requests, please try again later',
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
      process.env.REPO_CACHE_BASE_PATH ??
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

  /**
   * CRITICAL: Memory Pressure Management Configuration
   * Completes the "safety triangle" for production stability
   */
  memoryPressure: {
    // System memory thresholds (from environment)
    warningThreshold:
      parseEnvNumber(process.env.MEMORY_WARNING_THRESHOLD, 75) / 100, // 75%
    criticalThreshold:
      parseEnvNumber(process.env.MEMORY_CRITICAL_THRESHOLD, 85) / 100, // 85%
    emergencyThreshold:
      parseEnvNumber(process.env.MEMORY_EMERGENCY_THRESHOLD, 95) / 100, // 95%

    // Process memory thresholds
    processWarningThreshold:
      parseEnvNumber(process.env.MEMORY_PROCESS_WARNING_THRESHOLD, 50) / 100, // 50%
    processCriticalThreshold:
      parseEnvNumber(process.env.MEMORY_PROCESS_CRITICAL_THRESHOLD, 70) / 100, // 70%

    // Circuit breaker configuration
    enableCircuitBreaker: parseEnvBoolean(
      process.env.MEMORY_CIRCUIT_BREAKER,
      true
    ),
    enableRequestThrottling: parseEnvBoolean(
      process.env.MEMORY_REQUEST_THROTTLING,
      true
    ),
    enableEmergencyEviction: parseEnvBoolean(
      process.env.MEMORY_EMERGENCY_EVICTION,
      true
    ),

    // Monitoring configuration
    checkIntervalMs: parseEnvNumber(process.env.MEMORY_CHECK_INTERVAL_MS, 5000), // 5 seconds
    alertCooldownMs: parseEnvNumber(
      process.env.MEMORY_ALERT_COOLDOWN_MS,
      60000
    ), // 1 minute
  },
};

/**
 * Validation result interface
 */
interface ValidationResult {
  warnings: string[];
  errors: string[];
}

/**
 * Helper function to add validation error
 */
function addError(result: ValidationResult, message: string): void {
  result.errors.push(message);
}

/**
 * Helper function to add validation warning
 */
function addWarning(result: ValidationResult, message: string): void {
  result.warnings.push(message);
}

/**
 * Helper function to validate range
 */
function validateRange(
  value: number,
  min: number,
  max: number,
  name: string,
  result: ValidationResult
): void {
  if (value < min || value > max) {
    addError(result, `${name} must be between ${min} and ${max}`);
  }
}

/**
 * Helper function to validate percentage (0-100)
 */
function validatePercentage(
  value: number,
  name: string,
  result: ValidationResult
): void {
  validateRange(value, 0, 100, name, result);
}

/**
 * Validate hybrid cache configuration
 */
function validateHybridCache(result: ValidationResult): void {
  if (config.hybridCache.maxEntries <= 0) {
    addError(result, 'CACHE_MAX_ENTRIES must be greater than 0');
  }

  if (config.hybridCache.memoryLimitBytes <= 0) {
    addError(result, 'CACHE_MEMORY_LIMIT_GB must be greater than 0');
  }

  if (config.hybridCache.lockTimeoutMs <= 0) {
    addError(result, 'CACHE_LOCK_TIMEOUT_MS must be greater than 0');
  }

  // Performance warnings
  if (config.hybridCache.memoryLimitBytes > 4 * 1024 ** 3) {
    addWarning(
      result,
      'CACHE_MEMORY_LIMIT_GB is very high (>4GB), ensure sufficient system memory'
    );
  }

  if (config.hybridCache.maxEntries > 100000) {
    addWarning(
      result,
      'CACHE_MAX_ENTRIES is very high (>100k), may impact performance'
    );
  }
}

/**
 * Validate Redis configuration
 */
function validateRedis(result: ValidationResult): void {
  validateRange(config.redis.port, 1, 65535, 'REDIS_PORT', result);
}

/**
 * Validate Git configuration
 */
function validateGit(result: ValidationResult): void {
  if (config.git.maxConcurrentProcesses <= 0) {
    addError(result, 'GIT_MAX_CONCURRENT_PROCESSES must be greater than 0');
  }

  if (config.git.maxConcurrentProcesses > 20) {
    addWarning(
      result,
      'GIT_MAX_CONCURRENT_PROCESSES is very high (>20), may overwhelm system resources'
    );
  }

  if (config.git.cloneDepth <= 0) {
    addError(result, 'GIT_CLONE_DEPTH must be greater than 0');
  }

  if (config.git.cloneDepth < 10) {
    addWarning(
      result,
      'GIT_CLONE_DEPTH is very low (<10), may miss important commit history'
    );
  }
}

/**
 * Validate repository cache configuration
 */
function validateRepositoryCache(result: ValidationResult): void {
  if (!config.repositoryCache.enabled) return;

  if (config.repositoryCache.maxRepositories <= 0) {
    addError(result, 'REPO_CACHE_MAX_REPOSITORIES must be greater than 0');
  }

  if (config.repositoryCache.maxAgeHours <= 0) {
    addError(result, 'REPO_CACHE_MAX_AGE_HOURS must be greater than 0');
  }

  const minDiskSize = 100 * 1024 * 1024; // 100MB
  const maxDiskSize = 50 * 1024 ** 3; // 50GB

  if (config.repositoryCache.diskLimitBytes < minDiskSize) {
    addWarning(
      result,
      'REPO_CACHE_DISK_LIMIT_GB is very low (<100MB), may cause frequent evictions'
    );
  }

  if (config.repositoryCache.diskLimitBytes > maxDiskSize) {
    addWarning(
      result,
      'REPO_CACHE_DISK_LIMIT_GB is very high (>50GB), ensure sufficient disk space'
    );
  }
}

/**
 * Validate operation coordination configuration
 */
function validateOperationCoordination(result: ValidationResult): void {
  if (!config.operationCoordination.enabled) return;

  if (config.operationCoordination.operationTimeoutMs < 30000) {
    addWarning(
      result,
      'REPO_OPERATION_TIMEOUT_MS is very low (<30s), may cause premature timeouts'
    );
  }

  if (config.operationCoordination.maxConcurrentOpsPerRepo <= 0) {
    addError(result, 'REPO_MAX_CONCURRENT_OPS must be greater than 0');
  }
}

/**
 * Validate cache strategy configuration
 */
function validateCacheStrategy(result: ValidationResult): void {
  validatePercentage(
    config.cacheStrategy.memoryPressureThreshold * 100,
    'CACHE_MEMORY_PRESSURE_THRESHOLD',
    result
  );

  validatePercentage(
    config.cacheStrategy.emergencyEvictionPercent * 100,
    'CACHE_EMERGENCY_EVICTION_PERCENT',
    result
  );

  const { rawCommitsTTL } = config.cacheStrategy.cacheKeys;

  if (rawCommitsTTL < 300) {
    addWarning(
      result,
      'CACHE_RAW_COMMITS_TTL_SECONDS is very low (<5min), may cause excessive recomputation'
    );
  }

  if (rawCommitsTTL > 86400) {
    addWarning(
      result,
      'CACHE_RAW_COMMITS_TTL_SECONDS is very high (>24h), may use excessive storage'
    );
  }
}

/**
 * Validate admin authentication configuration
 */
function validateAdminAuth(result: ValidationResult): void {
  if (!config.adminAuth.enabled) {
    addWarning(
      result,
      'Admin authentication is disabled - admin endpoints are not protected'
    );
    return;
  }

  // Check if ADMIN_TOKEN is configured when auth is enabled
  if (!process.env.ADMIN_TOKEN) {
    addError(
      result,
      'ADMIN_TOKEN environment variable must be set when ADMIN_AUTH_ENABLED is true'
    );
  } else if (process.env.ADMIN_TOKEN.length < 32) {
    addWarning(
      result,
      'ADMIN_TOKEN should be at least 32 characters for security'
    );
  }
}

/**
 * Validate admin rate limiting configuration
 */
function validateAdminRateLimit(result: ValidationResult): void {
  if (config.adminRateLimit.windowMs <= 0) {
    addError(result, 'ADMIN_RATE_LIMIT_WINDOW_MS must be greater than 0');
  }

  if (config.adminRateLimit.max <= 0) {
    addError(result, 'ADMIN_RATE_LIMIT_MAX must be greater than 0');
  }

  if (config.adminRateLimit.windowMs < 60000) {
    addWarning(
      result,
      'ADMIN_RATE_LIMIT_WINDOW_MS is very low (<1min), may be too restrictive'
    );
  }
}

/**
 * Validate memory pressure configuration
 */
function validateMemoryPressure(result: ValidationResult): void {
  const { warningThreshold, criticalThreshold, emergencyThreshold } =
    config.memoryPressure;

  validatePercentage(
    warningThreshold * 100,
    'MEMORY_WARNING_THRESHOLD',
    result
  );
  validatePercentage(
    criticalThreshold * 100,
    'MEMORY_CRITICAL_THRESHOLD',
    result
  );
  validatePercentage(
    emergencyThreshold * 100,
    'MEMORY_EMERGENCY_THRESHOLD',
    result
  );

  if (warningThreshold >= criticalThreshold) {
    addError(
      result,
      'MEMORY_WARNING_THRESHOLD must be less than MEMORY_CRITICAL_THRESHOLD'
    );
  }

  if (criticalThreshold >= emergencyThreshold) {
    addError(
      result,
      'MEMORY_CRITICAL_THRESHOLD must be less than MEMORY_EMERGENCY_THRESHOLD'
    );
  }

  if (config.memoryPressure.checkIntervalMs < 1000) {
    addWarning(
      result,
      'MEMORY_CHECK_INTERVAL_MS is very low (<1s), may impact performance'
    );
  }

  if (warningThreshold > 0.9) {
    addWarning(
      result,
      'MEMORY_WARNING_THRESHOLD is very high (>90%), may not provide enough warning time'
    );
  }
}

/**
 * Validate system compatibility and performance warnings
 */
function validateSystemCompatibility(result: ValidationResult): void {
  // Compatibility warnings
  if (config.repositoryCache.enabled && !config.hybridCache.enableDisk) {
    addWarning(
      result,
      'Repository cache is enabled but hybrid cache disk is disabled - may reduce effectiveness'
    );
  }

  if (config.operationCoordination.enabled && !config.repositoryCache.enabled) {
    addWarning(
      result,
      'Operation coordination is enabled but repository cache is disabled - limited benefits'
    );
  }

  // System memory checks
  const totalMemoryGB = os.totalmem() / 1024 ** 3;
  if (totalMemoryGB < 2) {
    addWarning(
      result,
      'System has less than 2GB RAM, memory pressure thresholds may need adjustment'
    );
  }

  if (config.hybridCache.memoryLimitBytes > os.totalmem() * 0.5) {
    addWarning(
      result,
      'Cache memory limit is more than 50% of system memory, may cause memory pressure'
    );
  }
}

/**
 * Log validation results and handle errors
 */
function logValidationMessages(
  level: 'error' | 'warn',
  header: string,
  messages: string[]
): void {
  if (messages.length === 0) return;
  const logger = level === 'error' ? console.error : console.warn;
  logger(header);
  for (const message of messages) {
    logger(`  - ${message}`);
  }
}

function handleValidationResults(result: ValidationResult): void {
  logValidationMessages('error', 'Configuration errors found:', result.errors);
  if (result.errors.length > 0) {
    throw new Error('Invalid configuration detected');
  }

  logValidationMessages('warn', 'Configuration warnings:', result.warnings);
}

/**
 * Log debug configuration information
 */
function logDebugConfiguration(): void {
  if (config.debug.logLevel !== 'debug') return;

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

/**
 * REFACTORED: Configuration validation with reduced cognitive complexity
 * Original function split into smaller, focused validation functions
 */
export function validateConfig(): void {
  const result: ValidationResult = { warnings: [], errors: [] };

  // Run all validation checks
  validateHybridCache(result);
  validateRedis(result);
  validateGit(result);
  validateAdminAuth(result);
  validateAdminRateLimit(result);
  validateRepositoryCache(result);
  validateOperationCoordination(result);
  validateCacheStrategy(result);
  validateMemoryPressure(result);
  validateSystemCompatibility(result);

  // Handle results and log debug info
  handleValidationResults(result);
  logDebugConfiguration();
}

// Export individual configurations for easy importing
export const {
  hybridCache: hybridCacheConfig,
  locks: lockConfig,
  streaming: streamingConfig,
  debug: debugConfig,
  adminAuth: adminAuthConfig,
  adminRateLimit: adminRateLimitConfig,
  repositoryCache: repositoryCacheConfig,
  operationCoordination: operationCoordinationConfig,
  cacheStrategy: cacheStrategyConfig,
  memoryPressure: memoryPressureConfig,
} = config;

export default config;
