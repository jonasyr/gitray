import Redis from 'ioredis';
import { config } from '../config';
import logger from './logger';

let redis: Redis | null = null;
let redisHealthy = false;

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
  async get(key: string): Promise<string | null> {
    if (redis) {
      return redis.get(key);
    }
    return memoryCache.get(key) ?? null;
  },
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
  async del(key: string): Promise<void> {
    if (redis) {
      await redis.del(key);
      return;
    }
    memoryCache.delete(key);
  },
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
  isHealthy(): boolean {
    // If redis is null, it means we're using the memory cache due to init failure or error,
    // which is considered a healthy operational state for the cache service.
    if (redis === null) {
      return true;
    }
    // Otherwise, health depends on the Redis connection state.
    return redisHealthy;
  },
};

export default cache;
