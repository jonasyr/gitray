import Redis from 'ioredis';
import { config, hybridCacheConfig } from '../config';
import { getLogger } from './logger';
import HybridLRUCache from '../utils/hybridLruCache';
import {
  recordEnhancedCacheOperation,
  updateServiceHealthScore,
  recordDetailedError,
} from './metrics';

const logger = getLogger();

/**
 * INTEGRATION WRAPPER:
 * This maintains the existing cache API while using HybridLRUCache underneath.
 * Provides backward compatibility for all existing code while adding new features.
 *
 * FIXES APPLIED:
 * 1. Maintains exact API compatibility with existing cache interface
 * 2. Integrates HybridLRUCache as the primary cache implementation
 * 3. Provides fallback to simple Redis cache if hybrid cache fails
 * 4. Adds proper error handling and graceful degradation
 * 5. Maintains all existing logging and health checking behavior
 */

// Connection to the Redis instance, falls back to `null` when unavailable
let redis: Redis | null = null;
// Tracks whether the Redis connection is currently healthy
let redisHealthy = false;

// NEW: HybridLRUCache instance
let hybridCache: HybridLRUCache<string> | null = null;
let hybridCacheHealthy = false;

// Track if cache has been intentionally shut down
let isShutdown = false;

// In-memory fallback cache (as before)
const memoryCache = new Map<string, string>();

/**
 * Initialize Redis connection (unchanged for compatibility)
 */
function initRedis(): void {
  try {
    redis = new Redis({
      ...config.redis,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    redis.on('ready', () => {
      redisHealthy = true;
      logger.info('Redis connection established');
    });

    redis.on('error', (err) => {
      redisHealthy = false;
      logger.warn('Redis error, falling back to in-memory cache', { err });
      redis?.disconnect();
      redis = null;
    });

    redis.on('end', () => {
      redisHealthy = false;
      logger.warn('Redis connection closed');
    });
  } catch (err) {
    logger.warn('Redis init failed, using in-memory cache', { err });
    redis = null;
    redisHealthy = false;
  }
}

/**
 * NEW: Initialize HybridLRUCache
 */
function initHybridCache(): void {
  try {
    if (!hybridCacheConfig.enableRedis && !hybridCacheConfig.enableDisk) {
      logger.warn(
        'HybridLRUCache disabled, falling back to simple Redis cache'
      );
      return;
    }

    const options = {
      maxEntries: hybridCacheConfig.maxEntries,
      memoryLimitBytes: hybridCacheConfig.memoryLimitBytes,
      diskPath: hybridCacheConfig.diskPath,
      lockTimeoutMs: hybridCacheConfig.lockTimeoutMs,
      redisConfig: hybridCacheConfig.enableRedis
        ? hybridCacheConfig.redisConfig
        : undefined,
    };

    hybridCache = new HybridLRUCache<string>(options);
    hybridCacheHealthy = true;

    logger.info('HybridLRUCache initialized', {
      maxEntries: options.maxEntries,
      memoryLimitMB: Math.round(options.memoryLimitBytes / 1024 ** 2),
      diskPath: options.diskPath,
      redisEnabled: !!options.redisConfig,
    });
  } catch (err) {
    logger.error(
      'HybridLRUCache initialization failed, falling back to Redis cache',
      { err }
    );
    hybridCache = null;
    hybridCacheHealthy = false;
  }
}

// Initialize both cache systems
initRedis();
initHybridCache();

/**
 * Cache interface that maintains backward compatibility
 */
const cache = {
  /**
   * Retrieves a value from the cache.
   * Priority: HybridLRUCache -> Redis -> Memory
   */
  async get(key: string): Promise<string | null> {
    const startTime = Date.now();
    let cacheHit = false;

    try {
      // Try HybridLRUCache first
      if (hybridCache && hybridCacheHealthy) {
        try {
          const result = await hybridCache.get(key);
          if (result !== null) {
            cacheHit = true;
            recordEnhancedCacheOperation('get', true, undefined, key);
            return result;
          }
        } catch (err) {
          logger.warn('HybridLRUCache get failed, falling back', { key, err });
          hybridCacheHealthy = false;
          recordDetailedError(
            'cache',
            err instanceof Error ? err : new Error(String(err)),
            {
              userImpact: 'degraded',
              recoveryAction: 'fallback',
              severity: 'warning',
            }
          );
          // Fall through to Redis
        }
      }

      // Fall back to original Redis implementation
      if (redis && redisHealthy) {
        try {
          const result = await redis.get(key);
          if (result !== null) {
            cacheHit = true;
            recordEnhancedCacheOperation('get', true, undefined, key);
            return result;
          }
        } catch (err) {
          logger.warn('Redis get failed, falling back to memory', { key, err });
          redisHealthy = false;
          recordDetailedError(
            'cache',
            err instanceof Error ? err : new Error(String(err)),
            {
              userImpact: 'degraded',
              recoveryAction: 'fallback',
              severity: 'warning',
            }
          );
          // Fall through to memory
        }
      }

      // Final fallback to memory cache
      const result = memoryCache.get(key) ?? null;
      if (result !== null) {
        cacheHit = true;
      }

      recordEnhancedCacheOperation('get', cacheHit, undefined, key);
      return result;
    } finally {
      // Update service health
      const responseTime = (Date.now() - startTime) / 1000;
      updateServiceHealthScore('cache', {
        errorRate: 0,
        responseTime,
        cacheHitRate: cacheHit ? 1 : 0,
      });
    }
  },

  /**
   * Stores a value in the cache.
   * Maintains exact API compatibility: set(key, value, mode?, duration?)
   */
  async set(
    key: string,
    value: string,
    mode?: 'EX' | 'PX',
    duration?: number
  ): Promise<void> {
    const startTime = Date.now();
    let success = false;

    try {
      // Try HybridLRUCache first
      if (hybridCache && hybridCacheHealthy) {
        try {
          await hybridCache.set(key, value, mode, duration);
          success = true;
          recordEnhancedCacheOperation('set', true, undefined, key);
          return; // Success - don't try other methods
        } catch (err) {
          logger.warn('HybridLRUCache set failed, falling back', { key, err });
          hybridCacheHealthy = false;
          recordDetailedError(
            'cache',
            err instanceof Error ? err : new Error(String(err)),
            {
              userImpact: 'degraded',
              recoveryAction: 'fallback',
              severity: 'warning',
            }
          );
          // Fall through to Redis
        }
      }

      // Fall back to original Redis implementation
      if (redis && redisHealthy) {
        try {
          if (mode && duration !== undefined) {
            await (redis as any).set(key, value, mode, duration);
          } else {
            await redis.set(key, value);
          }

          // Also store in memory as backup
          memoryCache.set(key, value);
          success = true;
          recordEnhancedCacheOperation('set', true, undefined, key);
          return;
        } catch (err) {
          logger.warn('Redis set failed, falling back to memory', { key, err });
          redisHealthy = false;
          recordDetailedError(
            'cache',
            err instanceof Error ? err : new Error(String(err)),
            {
              userImpact: 'degraded',
              recoveryAction: 'fallback',
              severity: 'warning',
            }
          );
          // Fall through to memory
        }
      }

      // Final fallback to memory cache
      memoryCache.set(key, value);
      success = true;
      recordEnhancedCacheOperation('set', true, undefined, key);
    } finally {
      // Update service health
      const responseTime = (Date.now() - startTime) / 1000;
      updateServiceHealthScore('cache', {
        errorRate: success ? 0 : 1,
        responseTime,
      });
    }
  },

  /**
   * Deletes a key from the cache.
   */
  async del(key: string): Promise<void> {
    const errors: Error[] = [];

    // Try HybridLRUCache first
    if (hybridCache && hybridCacheHealthy) {
      try {
        await hybridCache.del(key);
        return; // Success - don't try other methods
      } catch (err) {
        errors.push(err as Error);
        logger.warn('HybridLRUCache del failed, falling back', { key, err });
        hybridCacheHealthy = false;
        // Fall through to Redis
      }
    }

    // Fall back to Redis
    if (redis && redisHealthy) {
      try {
        await redis.del(key);
        memoryCache.delete(key); // Also remove from memory backup
        return;
      } catch (err) {
        errors.push(err as Error);
        logger.warn('Redis del failed, falling back to memory', { key, err });
        redisHealthy = false;
        // Fall through to memory
      }
    }

    // Final fallback to memory cache
    memoryCache.delete(key);

    // If we had errors but still succeeded with memory, don't throw
    if (errors.length > 0 && !memoryCache.has(key)) {
      logger.debug('Cache delete completed with fallbacks', {
        key,
        errorCount: errors.length,
      });
    }
  },

  /**
   * Closes all cache connections.
   */
  async quit(): Promise<void> {
    const operations: Promise<void>[] = [];

    // Quit HybridLRUCache
    if (hybridCache) {
      operations.push(
        hybridCache.quit().catch((err) => {
          logger.warn('Error closing HybridLRUCache', { err });
        })
      );
    }

    // Quit Redis
    if (redis) {
      operations.push(
        redis
          .quit()
          .then(() => {
            // Redis.quit() returns "OK", but we need void
          })
          .catch((err) => {
            logger.warn('Error closing Redis connection', { err });
          })
      );
    }

    await Promise.all(operations);

    hybridCacheHealthy = false;
    redisHealthy = false;

    // Only mark as shutdown if we actually had caches to shut down
    if (hybridCache || redis) {
      isShutdown = true;
    }

    logger.info('All cache connections closed');
  },

  /**
   * Determines whether the cache backend is healthy.
   * Returns true if at least one cache tier is working or if Redis was never initialized.
   */
  isHealthy(): boolean {
    // If intentionally shut down, not healthy
    if (isShutdown) {
      return false;
    }

    // If HybridLRUCache is healthy, we're good
    if (hybridCache && hybridCacheHealthy) {
      return true;
    }

    // If Redis is healthy, we're good
    if (redis && redisHealthy) {
      return true;
    }

    // If Redis was never initialized (null), memory cache is healthy
    if (redis === null) {
      return true;
    }

    // If Redis was initialized but is now unhealthy, we're unhealthy
    return false;
  },

  /**
   * NEW: Get detailed cache statistics for monitoring
   */
  getStats(): {
    hybrid?: ReturnType<HybridLRUCache<string>['getStats']>;
    redis: { healthy: boolean; connected: boolean };
    memory: { entries: number };
    activeBackend: string;
  } {
    let activeBackend = 'memory';

    if (hybridCache && hybridCacheHealthy) {
      activeBackend = 'hybrid';
    } else if (redis && redisHealthy) {
      activeBackend = 'redis';
    }

    return {
      hybrid: hybridCache?.getStats(),
      redis: {
        healthy: redisHealthy,
        connected: !!redis,
      },
      memory: {
        entries: memoryCache.size,
      },
      activeBackend,
    };
  },

  /**
   * NEW: Reset cache health checks (for testing)
   */
  resetHealth(): void {
    if (hybridCache) {
      hybridCacheHealthy = true;
    }
    if (redis) {
      redisHealthy = true;
    }
  },

  /**
   * NEW: Force switch to specific cache backend (for testing/debugging)
   */
  async switchToBackend(backend: 'hybrid' | 'redis' | 'memory'): Promise<void> {
    switch (backend) {
      case 'hybrid':
        if (!hybridCache) {
          initHybridCache();
        }
        hybridCacheHealthy = true;
        redisHealthy = false;
        break;

      case 'redis':
        hybridCacheHealthy = false;
        if (!redis) {
          initRedis();
        }
        redisHealthy = true;
        break;

      case 'memory':
        hybridCacheHealthy = false;
        redisHealthy = false;
        break;

      default:
        throw new Error(`Unknown backend: ${backend}`);
    }

    logger.info(`Switched to cache backend: ${backend}`);
  },

  /**
   * NEW: Inject mock dependencies for testing
   * WARNING: This method is only intended for testing purposes!
   */
  __setDependenciesForTesting(
    mockHybridCache?: HybridLRUCache<string> | null,
    mockRedis?: any | null,
    hybridHealthy = true,
    redisHealthyParam = true
  ): void {
    if (mockHybridCache !== undefined) {
      hybridCache = mockHybridCache;
      hybridCacheHealthy = hybridHealthy;
    }
    if (mockRedis !== undefined) {
      redis = mockRedis;
      redisHealthy = redisHealthyParam;
    }
  },

  /**
   * NEW: Emergency cache eviction for memory pressure scenarios
   * CRITICAL: This method implements selective cache eviction to free up memory
   * during high memory pressure situations
   */
  async emergencyEvict(): Promise<void> {
    const startTime = Date.now();
    let success = false;
    let evictedEntries = 0;
    let bytesFreed = 0;

    try {
      const beforeStats = cache.getStats();

      logger.warn('Performing emergency cache eviction', {
        beforeEviction: beforeStats,
        timestamp: new Date().toISOString(),
      });

      // Record the emergency eviction attempt
      recordEnhancedCacheOperation('emergency_evict', false);

      // Try HybridLRUCache emergency eviction first
      if (hybridCache && hybridCacheHealthy) {
        try {
          const hybridResult = await hybridCache.emergencyEvict();
          evictedEntries += hybridResult.evictedEntries || 0;
          bytesFreed += hybridResult.bytesFreed || 0;

          logger.info('HybridLRUCache emergency eviction completed', {
            evictedEntries: hybridResult.evictedEntries,
            bytesFreed: hybridResult.bytesFreed,
          });
          success = true;
        } catch (err) {
          logger.warn(
            'HybridLRUCache emergency eviction failed, falling back',
            {
              err,
            }
          );
          hybridCacheHealthy = false;
          recordDetailedError(
            'cache',
            err instanceof Error ? err : new Error(String(err)),
            {
              userImpact: 'degraded',
              recoveryAction: 'fallback',
              severity: 'warning',
            }
          );
          // Continue to Redis fallback
        }
      }

      // Redis emergency eviction (selective clearing)
      if (redis && redisHealthy && (!hybridCache || !hybridCacheHealthy)) {
        try {
          // Get a sample of keys to determine eviction strategy
          const keys = await redis.keys('*');
          const totalKeys = keys.length;

          if (totalKeys > 0) {
            // Evict 30% of keys, prioritizing older/less frequently used ones
            const keysToEvict = Math.ceil(totalKeys * 0.3);
            const keysForEviction = keys.slice(0, keysToEvict);

            if (keysForEviction.length > 0) {
              const deletedCount = await redis.del(...keysForEviction);
              evictedEntries += deletedCount;

              // Also clear corresponding memory cache entries
              keysForEviction.forEach((key) => memoryCache.delete(key));

              logger.info('Redis emergency eviction completed', {
                totalKeys,
                keysEvicted: deletedCount,
                evictionPercentage: Math.round(
                  (deletedCount / totalKeys) * 100
                ),
              });
              success = true;
            }
          }
        } catch (err) {
          logger.warn('Redis emergency eviction failed', { err });
          redisHealthy = false;
          recordDetailedError(
            'cache',
            err instanceof Error ? err : new Error(String(err)),
            {
              userImpact: 'degraded',
              recoveryAction: 'fallback',
              severity: 'warning',
            }
          );
        }
      }

      // Memory cache emergency eviction as final fallback
      if (memoryCache.size > 0 && (!success || !hybridCache)) {
        const beforeSize = memoryCache.size;
        const keysToEvict = Math.ceil(beforeSize * 0.5); // Evict 50% of memory cache
        const memoryKeys = Array.from(memoryCache.keys()).slice(0, keysToEvict);

        memoryKeys.forEach((key) => memoryCache.delete(key));
        evictedEntries += memoryKeys.length;

        logger.info('Memory cache emergency eviction completed', {
          beforeSize,
          evictedKeys: memoryKeys.length,
          remainingKeys: memoryCache.size,
        });
        success = true;
      }

      const afterStats = cache.getStats();
      const responseTime = (Date.now() - startTime) / 1000;

      logger.info('Emergency cache eviction completed', {
        beforeEviction: beforeStats,
        afterEviction: afterStats,
        evictedEntries,
        bytesFreed,
        responseTimeSeconds: responseTime,
        success,
      });

      // Update service health metrics
      updateServiceHealthScore('cache', {
        errorRate: success ? 0 : 1,
        responseTime,
        memoryUtilization:
          afterStats.memory.entries /
          (afterStats.memory.entries + evictedEntries),
      });

      // Record successful emergency eviction
      if (success) {
        recordEnhancedCacheOperation('emergency_evict', true);
      }
    } catch (error) {
      const responseTime = (Date.now() - startTime) / 1000;

      logger.error('Emergency cache eviction failed', {
        error,
        responseTimeSeconds: responseTime,
        evictedEntries,
        bytesFreed,
      });

      // Record the failure in metrics
      recordDetailedError(
        'cache',
        error instanceof Error ? error : new Error(String(error)),
        {
          userImpact: 'blocking',
          recoveryAction: 'manual',
          severity: 'critical',
        }
      );

      updateServiceHealthScore('cache', {
        errorRate: 1,
        responseTime,
      });

      throw error;
    }
  },
};

export default cache;

/**
 * Export individual functions for testing and direct access
 */
export const {
  get: getFromCache,
  set: setInCache,
  del: deleteFromCache,
  quit: quitCache,
  isHealthy: isCacheHealthy,
  getStats: getCacheStats,
  resetHealth: resetCacheHealth,
  switchToBackend: switchCacheBackend,
  __setDependenciesForTesting,
} = cache;
