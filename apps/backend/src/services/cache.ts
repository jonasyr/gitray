import Redis from 'ioredis';
import { config } from '../config';
import logger from './logger';

// Connection to the Redis instance, falls back to `null` when unavailable
let redis: Redis | null = null;
// Tracks whether the Redis connection is currently healthy
let redisHealthy = false;
/**
 * Initializes the Redis client and sets up connection event handlers.
 * When the connection fails, the service gracefully degrades to an
 * in-memory cache so the application can continue to operate.
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

initRedis();

const memoryCache = new Map<string, string>();

const cache = {
  /**
   * Retrieves a value from the cache.
   * Falls back to the in-memory cache when Redis is unavailable.
   */
  async get(key: string): Promise<string | null> {
    if (redis) {
      return redis.get(key);
    }
    return memoryCache.get(key) ?? null;
  },
  /**
   * Stores a value in the cache.
   * When `mode` and `duration` are provided, the key is set with an expiry.
   */
  async set(
    key: string,
    value: string,
    mode?: 'EX' | 'PX',
    duration?: number
  ): Promise<void> {
    if (redis) {
      if (mode && duration !== undefined) {
        await (redis as any).set(key, value, mode, duration);
      } else {
        await redis.set(key, value);
      }
      return;
    }
    memoryCache.set(key, value);
  },
  /**
   * Deletes a key from the cache.
   */
  async del(key: string): Promise<void> {
    if (redis) {
      await redis.del(key);
      return;
    }
    memoryCache.delete(key);
  },
  /**
   * Closes the Redis connection if one exists.
   */
  async quit(): Promise<void> {
    if (redis) {
      try {
        await redis.quit();
      } catch (err) {
        logger.warn('Error closing Redis connection', { err });
      }
    }
    redisHealthy = false;
  },
  /**
   * Determines whether the cache backend is healthy. When Redis is disabled
   * or has failed to initialize, the in-memory cache is considered healthy.
   */
  isHealthy(): boolean {
    if (redis === null) {
      return true;
    }
    return redisHealthy;
  },
};

export default cache;
