import fs from 'fs/promises';
import path from 'path';
import Redis, { RedisOptions } from 'ioredis';
import logger from '../services/logger';

export interface HybridLRUCacheOptions {
  maxEntries: number;
  memoryLimitBytes: number;
  diskPath: string;
  redisConfig?: RedisOptions;
}

interface MemoryEntry<V> {
  value: V;
  size: number;
}

export class HybridLRUCache<V> {
  private redis: Redis | null = null;
  private redisHealthy = false;
  private memory = new Map<string, MemoryEntry<V>>();
  private memoryUsage = 0;
  private disk = new Map<string, string>();

  constructor(private options: HybridLRUCacheOptions) {
    this.initRedis(options.redisConfig);
    void fs.mkdir(options.diskPath, { recursive: true });
    void this.loadDiskIndex();
  }

  private initRedis(redisConfig?: RedisOptions): void {
    if (!redisConfig) return;
    try {
      this.redis = new Redis({
        ...redisConfig,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redis.on('ready', () => {
        this.redisHealthy = true;
        logger.info('HybridLRUCache Redis connection established');
      });
      this.redis.on('error', (err) => {
        this.redisHealthy = false;
        logger.warn('HybridLRUCache Redis error', { err });
        this.redis?.disconnect();
        this.redis = null;
      });
      this.redis.on('end', () => {
        this.redisHealthy = false;
        logger.warn('HybridLRUCache Redis connection closed');
      });
    } catch (err) {
      logger.warn('HybridLRUCache Redis init failed', { err });
      this.redisHealthy = false;
      this.redis = null;
    }
  }

  private async loadDiskIndex(): Promise<void> {
    try {
      const files = await fs.readdir(this.options.diskPath);
      const stats = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(this.options.diskPath, file);
          const stat = await fs.stat(filePath);
          return { file, filePath, mtime: stat.mtimeMs };
        })
      );
      stats
        .sort((a, b) => a.mtime - b.mtime)
        .forEach((s) => {
          this.disk.set(decodeURIComponent(s.file), s.filePath);
        });
      await this.enforceDiskLimit();
    } catch (err) {
      logger.warn('HybridLRUCache failed to load disk index', { err });
    }
  }

  private toJSON(value: V): string {
    return JSON.stringify(value);
  }

  private fromJSON(data: string): V {
    return JSON.parse(data) as V;
  }

  private calcSize(value: V): number {
    return Buffer.byteLength(this.toJSON(value));
  }

  private addToMemory(key: string, value: V): void {
    const size = this.calcSize(value);
    if (size > this.options.memoryLimitBytes) return;
    if (this.memory.has(key)) {
      const old = this.memory.get(key)!;
      this.memoryUsage -= old.size;
      this.memory.delete(key);
    }
    this.memory.set(key, { value, size });
    this.memoryUsage += size;
    this.trimMemory();
  }

  private trimMemory(): void {
    while (
      this.memoryUsage > this.options.memoryLimitBytes ||
      this.memory.size > this.options.maxEntries
    ) {
      const [oldKey, oldVal] = this.memory.entries().next().value as [
        string,
        MemoryEntry<V>,
      ];
      this.memory.delete(oldKey);
      this.memoryUsage -= oldVal.size;
    }
  }

  private async addToDisk(key: string, value: V): Promise<void> {
    const filePath = path.join(this.options.diskPath, encodeURIComponent(key));
    await fs.writeFile(filePath, this.toJSON(value));
    if (this.disk.has(key)) {
      this.disk.delete(key);
    }
    this.disk.set(key, filePath);
    await this.enforceDiskLimit();
  }

  private async enforceDiskLimit(): Promise<void> {
    while (this.disk.size > this.options.maxEntries) {
      const [oldKey, oldPath] = this.disk.entries().next().value as [
        string,
        string,
      ];
      this.disk.delete(oldKey);
      try {
        await fs.unlink(oldPath);
      } catch {
        // ignore
      }
    }
  }

  async get(key: string): Promise<V | null> {
    if (this.redis && this.redisHealthy) {
      try {
        const data = await this.redis.get(key);
        if (data !== null) {
          return this.fromJSON(data);
        }
      } catch (err) {
        this.redisHealthy = false;
        logger.warn('HybridLRUCache Redis get failed', { err });
      }
    }

    const mem = this.memory.get(key);
    if (mem) {
      this.memory.delete(key);
      this.memory.set(key, mem);
      return mem.value;
    }

    const filePath = this.disk.get(key);
    if (filePath) {
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        this.disk.delete(key);
        this.disk.set(key, filePath);
        const value = this.fromJSON(data);
        this.addToMemory(key, value);
        return value;
      } catch {
        // ignore missing file
      }
    }
    return null;
  }

  async set(
    key: string,
    value: V,
    mode?: 'EX' | 'PX',
    duration?: number
  ): Promise<void> {
    if (this.redis && this.redisHealthy) {
      try {
        if (mode && duration !== undefined) {
          await (this.redis as any).set(
            key,
            this.toJSON(value),
            mode,
            duration
          );
        } else {
          await this.redis.set(key, this.toJSON(value));
        }
      } catch (err) {
        this.redisHealthy = false;
        logger.warn('HybridLRUCache Redis set failed', { err });
      }
    }

    this.addToMemory(key, value);
    await this.addToDisk(key, value);
  }

  async del(key: string): Promise<void> {
    if (this.redis && this.redisHealthy) {
      try {
        await this.redis.del(key);
      } catch (err) {
        this.redisHealthy = false;
        logger.warn('HybridLRUCache Redis del failed', { err });
      }
    }

    const mem = this.memory.get(key);
    if (mem) {
      this.memoryUsage -= mem.size;
      this.memory.delete(key);
    }

    const filePath = this.disk.get(key);
    if (filePath) {
      this.disk.delete(key);
      try {
        await fs.unlink(filePath);
      } catch {
        // ignore
      }
    }
  }

  async quit(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch (err) {
        logger.warn('HybridLRUCache Redis quit failed', { err });
      }
    }
    this.redisHealthy = false;
  }

  isHealthy(): boolean {
    if (!this.redis) return true;
    return this.redisHealthy;
  }
}

export default HybridLRUCache;
