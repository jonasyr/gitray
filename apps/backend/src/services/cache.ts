import Redis from 'ioredis';
import { config } from '../config';
import logger from './logger';

let redis: Redis | null = null;
try {
  redis = new Redis(config.redis);
  redis.on('error', (err) => {
    logger.warn('Redis error, falling back to in-memory cache', { err });
    redis?.disconnect();
    redis = null;
  });
} catch (err) {
  logger.warn('Redis init failed, using in-memory cache', { err });
  redis = null;
}

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
};

export default cache;
