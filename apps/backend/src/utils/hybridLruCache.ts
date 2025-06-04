import fs from 'fs/promises';
import path from 'path';
import Redis, { RedisOptions } from 'ioredis';
import logger from '../services/logger';
import { withKeyLock } from './lockManager';

// Fix import path - ensure this matches your project structure
// If config is in a different location, adjust accordingly

export interface HybridLRUCacheOptions {
  maxEntries: number;
  memoryLimitBytes: number;
  diskPath: string;
  lockTimeoutMs?: number;
  redisConfig?: RedisOptions;
}

interface MemoryEntry<V> {
  value: V;
  size: number;
  timestamp: number; // FIX: Added timestamp for proper LRU tracking
}

/**
 * FIXES APPLIED:
 * 1. Added proper LRU tracking with timestamps
 * 2. Integrated lock manager for all disk operations
 * 3. Added transactional consistency for multi-tier operations
 * 4. Fixed race conditions in disk index loading
 * 5. Improved error handling and rollback mechanisms
 */
export class HybridLRUCache<V> {
  private redis: Redis | null = null;
  private redisHealthy = false;
  private memory = new Map<string, MemoryEntry<V>>();
  private memoryUsage = 0;
  private disk = new Map<string, string>();
  private lockTimeoutMs: number;

  constructor(private options: HybridLRUCacheOptions) {
    this.lockTimeoutMs = options.lockTimeoutMs || 120000;
    this.initRedis(options.redisConfig);
    void this.initializeDiskCache();
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

  /**
   * FIX: Added proper initialization with error handling and transactional consistency
   */
  private async initializeDiskCache(): Promise<void> {
    try {
      await fs.mkdir(this.options.diskPath, { recursive: true });
      await this.loadDiskIndex();
    } catch (err) {
      logger.error('Failed to initialize disk cache', {
        err,
        diskPath: this.options.diskPath,
      });
      // Don't throw - degrade gracefully to memory-only cache
    }
  }

  /**
   * FIX: Removed race conditions and added proper error handling
   */
  private async loadDiskIndex(): Promise<void> {
    try {
      // Use lock to prevent concurrent modifications during index loading
      await withKeyLock(
        'disk-index-load',
        async () => {
          const files = await fs.readdir(this.options.diskPath);

          // FIX: Process files atomically to avoid race conditions
          const fileStats: Array<{
            file: string;
            filePath: string;
            mtime: number;
          }> = [];

          for (const file of files) {
            try {
              const filePath = path.join(this.options.diskPath, file);
              const stat = await fs.stat(filePath);
              fileStats.push({ file, filePath, mtime: stat.mtimeMs });
            } catch (err) {
              // File might have been deleted between readdir and stat - skip it
              logger.debug('File disappeared during index loading', {
                file,
                err,
              });
            }
          }

          // Sort by modification time (oldest first) for LRU tracking
          fileStats
            .sort((a, b) => a.mtime - b.mtime)
            .forEach((s) => {
              this.disk.set(decodeURIComponent(s.file), s.filePath);
            });

          await this.enforceDiskLimit();
        },
        this.lockTimeoutMs
      );
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

  /**
   * FIX: Proper LRU implementation using timestamps
   */
  private addToMemory(key: string, value: V): void {
    const size = this.calcSize(value);
    if (size > this.options.memoryLimitBytes) {
      logger.warn('Value too large for memory cache', {
        key,
        size,
        limit: this.options.memoryLimitBytes,
      });
      return;
    }

    const timestamp = Date.now();

    if (this.memory.has(key)) {
      const old = this.memory.get(key)!;
      this.memoryUsage -= old.size;
      this.memory.delete(key);
    }

    this.memory.set(key, { value, size, timestamp });
    this.memoryUsage += size;
    this.trimMemory();
  }

  /**
   * FIX: Correct LRU eviction based on timestamps, not insertion order
   */
  private trimMemory(): void {
    while (
      this.memoryUsage > this.options.memoryLimitBytes ||
      this.memory.size > this.options.maxEntries
    ) {
      // Find the oldest entry by timestamp
      let oldestKey: string | null = null;
      let oldestTimestamp = Date.now();

      for (const [key, entry] of this.memory.entries()) {
        if (entry.timestamp < oldestTimestamp) {
          oldestTimestamp = entry.timestamp;
          oldestKey = key;
        }
      }

      if (!oldestKey) break; // Should never happen, but safety check

      const oldEntry = this.memory.get(oldestKey)!;
      this.memory.delete(oldestKey);
      this.memoryUsage -= oldEntry.size;

      logger.debug('Evicted from memory cache', {
        key: oldestKey,
        age: Date.now() - oldestTimestamp,
      });
    }
  }

  /**
   * FIX: Added lock integration and proper transactional handling
   */
  private async addToDisk(key: string, value: V): Promise<void> {
    await withKeyLock(
      `disk:${key}`,
      async () => {
        try {
          const filePath = path.join(
            this.options.diskPath,
            encodeURIComponent(key)
          );
          await fs.writeFile(filePath, this.toJSON(value));

          // Update disk index atomically
          if (this.disk.has(key)) {
            this.disk.delete(key);
          }
          this.disk.set(key, filePath);

          await this.enforceDiskLimit();
        } catch (err) {
          logger.error('Failed to write to disk cache', { key, err });
          throw err; // Re-throw to handle in calling code
        }
      },
      this.lockTimeoutMs
    );
  }

  /**
   * FIX: Proper LRU eviction for disk cache
   */
  private async enforceDiskLimit(): Promise<void> {
    // Don't need external lock here as this is only called from within locked operations
    while (this.disk.size > this.options.maxEntries) {
      // Get the first (oldest) entry from disk map
      const firstEntry = this.disk.entries().next().value;
      if (!firstEntry) break;

      const [oldKey, oldPath] = firstEntry;
      this.disk.delete(oldKey);

      try {
        await fs.unlink(oldPath);
        logger.debug('Evicted from disk cache', { key: oldKey });
      } catch (err) {
        // File might already be gone - that's ok
        logger.debug('File already removed during disk eviction', {
          key: oldKey,
          err,
        });
      }
    }
  }

  /**
   * FIX: Proper LRU update on access and improved error handling
   */
  async get(key: string): Promise<V | null> {
    // Try Redis first
    if (this.redis && this.redisHealthy) {
      try {
        const data = await this.redis.get(key);
        if (data !== null) {
          const value = this.fromJSON(data);
          // Update memory cache with accessed value
          this.addToMemory(key, value);
          return value;
        }
      } catch (err) {
        this.redisHealthy = false;
        logger.warn('HybridLRUCache Redis get failed', { err });
      }
    }

    // Try memory cache
    const mem = this.memory.get(key);
    if (mem) {
      // FIX: Update timestamp for LRU on access
      mem.timestamp = Date.now();
      // Move to end for Map iteration order (backup LRU mechanism)
      this.memory.delete(key);
      this.memory.set(key, mem);
      return mem.value;
    }

    // Try disk cache
    const filePath = this.disk.get(key);
    if (filePath) {
      try {
        // Use lock to prevent concurrent modifications
        return await withKeyLock(
          `disk:${key}`,
          async () => {
            try {
              const data = await fs.readFile(filePath, 'utf-8');
              const value = this.fromJSON(data);

              // Update LRU order in disk cache
              this.disk.delete(key);
              this.disk.set(key, filePath);

              // Promote to memory cache
              this.addToMemory(key, value);
              return value;
            } catch (readErr) {
              // File might have been deleted - remove from index
              this.disk.delete(key);
              logger.debug('Removed stale disk cache entry', {
                key,
                err: readErr,
              });
              return null;
            }
          },
          this.lockTimeoutMs
        );
      } catch (lockErr) {
        logger.warn('Failed to acquire lock for disk read', {
          key,
          err: lockErr,
        });
        return null;
      }
    }

    return null;
  }

  /**
   * FIX: Added transactional consistency and proper error handling
   */
  async set(
    key: string,
    value: V,
    mode?: 'EX' | 'PX',
    duration?: number
  ): Promise<void> {
    const operations: Array<() => Promise<void>> = [];
    const rollbacks: Array<() => Promise<void>> = [];

    // Redis operation
    if (this.redis && this.redisHealthy) {
      operations.push(async () => {
        try {
          if (mode && duration !== undefined) {
            await (this.redis as any).set(
              key,
              this.toJSON(value),
              mode,
              duration
            );
          } else {
            await this.redis!.set(key, this.toJSON(value));
          }
        } catch (err) {
          this.redisHealthy = false;
          logger.warn('HybridLRUCache Redis set failed', { err });
          throw err;
        }
      });

      rollbacks.unshift(async () => {
        try {
          if (this.redis && this.redisHealthy) {
            await this.redis.del(key);
          }
        } catch (err) {
          logger.warn('Failed to rollback Redis operation', { key, err });
        }
      });
    }

    // Memory operation (always succeeds or logs warning)
    operations.push(async () => {
      this.addToMemory(key, value);
    });

    rollbacks.unshift(async () => {
      const mem = this.memory.get(key);
      if (mem) {
        this.memory.delete(key);
        this.memoryUsage -= mem.size;
      }
    });

    // Disk operation
    operations.push(async () => {
      await this.addToDisk(key, value);
    });

    rollbacks.unshift(async () => {
      const filePath = this.disk.get(key);
      if (filePath) {
        this.disk.delete(key);
        try {
          await fs.unlink(filePath);
        } catch (err) {
          logger.warn('Failed to rollback disk operation', { key, err });
        }
      }
    });

    // Execute operations with rollback on failure
    let completedOps = 0;
    try {
      for (const operation of operations) {
        await operation();
        completedOps++;
      }
    } catch (err) {
      logger.error('HybridLRUCache set operation failed, rolling back', {
        key,
        completedOps,
        err,
      });

      // Rollback completed operations
      for (let i = 0; i < completedOps; i++) {
        try {
          await rollbacks[i]();
        } catch (rollbackErr) {
          logger.error('Rollback operation failed', {
            key,
            step: i,
            err: rollbackErr,
          });
        }
      }

      throw err;
    }
  }

  async del(key: string): Promise<void> {
    // Delete from all tiers - continue even if some fail
    const errors: Error[] = [];

    // Redis
    if (this.redis && this.redisHealthy) {
      try {
        await this.redis.del(key);
      } catch (err) {
        this.redisHealthy = false;
        logger.warn('HybridLRUCache Redis del failed', { err });
        errors.push(err as Error);
      }
    }

    // Memory
    const mem = this.memory.get(key);
    if (mem) {
      this.memoryUsage -= mem.size;
      this.memory.delete(key);
    }

    // Disk
    const filePath = this.disk.get(key);
    if (filePath) {
      try {
        await withKeyLock(
          `disk:${key}`,
          async () => {
            this.disk.delete(key);
            try {
              await fs.unlink(filePath);
            } catch (unlinkErr) {
              // File might already be gone - that's ok
              logger.debug('File already removed during delete', {
                key,
                err: unlinkErr,
              });
            }
          },
          this.lockTimeoutMs
        );
      } catch (err) {
        logger.error('Failed to delete from disk cache', { key, err });
        errors.push(err as Error);
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Some delete operations failed: ${errors.map((e) => e.message).join(', ')}`
      );
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
    if (!this.redis) return true; // Memory + disk cache is healthy
    return this.redisHealthy;
  }

  /**
   * FIX: Added diagnostic methods for testing and monitoring
   */
  getStats(): {
    memory: { entries: number; usageBytes: number; limitBytes: number };
    disk: { entries: number; limitEntries: number };
    redis: { healthy: boolean; connected: boolean };
  } {
    return {
      memory: {
        entries: this.memory.size,
        usageBytes: this.memoryUsage,
        limitBytes: this.options.memoryLimitBytes,
      },
      disk: {
        entries: this.disk.size,
        limitEntries: this.options.maxEntries,
      },
      redis: {
        healthy: this.redisHealthy,
        connected: !!this.redis,
      },
    };
  }
}

export default HybridLRUCache;
