import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import logger from '../services/logger';
import { lockConfig } from '../config';

/**
 * IMPROVEMENTS APPLIED:
 * 1. Integrated with new configuration system
 * 2. Added comprehensive logging and metrics
 * 3. Improved error handling and recovery
 * 4. Added cleanup mechanism for stale locks
 * 5. Better request coalescing with error propagation
 * 6. Added diagnostic and monitoring capabilities
 */

interface LockMetrics {
  acquisitions: number;
  timeouts: number;
  staleCleaned: number;
  averageWaitTime: number;
  currentLocks: number;
}

interface LockInfo {
  key: string;
  startTime: number;
  pid: number;
  hostname: string;
}

class LockManager {
  private inflight = new Map<string, Promise<unknown>>();
  private activeLocks = new Map<string, LockInfo>();
  private metrics: LockMetrics = {
    acquisitions: 0,
    timeouts: 0,
    staleCleaned: 0,
    averageWaitTime: 0,
    currentLocks: 0,
  };
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupScheduler();
  }

  /**
   * FIX: Added automatic cleanup of stale locks
   */
  private startCleanupScheduler(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      void this.cleanupStaleLocks();
    }, lockConfig.cleanupIntervalMs);

    logger.info('Lock cleanup scheduler started', {
      cleanupInterval: lockConfig.cleanupIntervalMs,
      staleLockAge: lockConfig.staleLockAgeMs,
    });
  }

  /**
   * FIX: Comprehensive stale lock cleanup
   */
  private async cleanupStaleLocks(): Promise<void> {
    try {
      await this.ensureDir();
      const files = await fs.readdir(lockConfig.lockDir);
      let cleanedCount = 0;

      for (const file of files) {
        try {
          const lockPath = path.join(lockConfig.lockDir, file);
          const stat = await fs.stat(lockPath);

          if (Date.now() - stat.mtimeMs > lockConfig.staleLockAgeMs) {
            await fs.unlink(lockPath);
            cleanedCount++;

            const lockKey = decodeURIComponent(file);
            this.activeLocks.delete(lockKey);

            if (lockConfig.enableLockLogging) {
              logger.debug('Cleaned stale lock', {
                lockKey,
                age: Date.now() - stat.mtimeMs,
              });
            }
          }
        } catch (err) {
          // File might have been deleted by another process - ignore
          if (lockConfig.enableLockLogging) {
            logger.debug('Stale lock cleanup: file disappeared', { file, err });
          }
        }
      }

      if (cleanedCount > 0) {
        this.metrics.staleCleaned += cleanedCount;
        logger.info('Stale lock cleanup completed', {
          cleanedCount,
          totalCleaned: this.metrics.staleCleaned,
        });
      }
    } catch (err) {
      logger.error('Stale lock cleanup failed', { err });
    }
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(lockConfig.lockDir, { recursive: true });
    } catch (err) {
      logger.error('Failed to create lock directory', {
        lockDir: lockConfig.lockDir,
        err,
      });
      throw err;
    }
  }

  /**
   * FIX: Improved stale lock detection with better error handling
   */
  private async tryRemoveIfStale(
    lockPath: string,
    timeout: number
  ): Promise<boolean> {
    try {
      const stat = await fs.stat(lockPath);
      const age = Date.now() - stat.mtimeMs;

      if (age > timeout) {
        await fs.unlink(lockPath);
        this.metrics.staleCleaned++;

        if (lockConfig.enableLockLogging) {
          logger.debug('Removed stale lock during acquisition', {
            lockPath,
            age,
          });
        }

        return true;
      }

      return false;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // Lock file was already removed
        return true;
      }

      logger.warn('Failed to check/remove stale lock', { lockPath, err });
      return false;
    }
  }

  /**
   * FIX: Enhanced lock acquisition with better logging and metrics
   */
  private async acquire(
    lockKey: string,
    timeout: number
  ): Promise<fs.FileHandle> {
    const startTime = Date.now();
    await this.ensureDir();

    const lockPath = path.join(lockConfig.lockDir, encodeURIComponent(lockKey));
    const lockInfo: LockInfo = {
      key: lockKey,
      startTime,
      pid: process.pid,
      hostname: os.hostname(),
    };

    if (lockConfig.enableLockLogging) {
      logger.debug('Attempting to acquire lock', { lockKey, timeout });
    }

    while (true) {
      try {
        const handle = await fs.open(lockPath, 'wx');

        // Write lock metadata for debugging
        await handle.writeFile(JSON.stringify(lockInfo));

        this.activeLocks.set(lockKey, lockInfo);
        this.metrics.acquisitions++;
        this.metrics.currentLocks++;

        const waitTime = Date.now() - startTime;
        this.metrics.averageWaitTime =
          (this.metrics.averageWaitTime * (this.metrics.acquisitions - 1) +
            waitTime) /
          this.metrics.acquisitions;

        if (lockConfig.enableLockLogging) {
          logger.debug('Lock acquired', { lockKey, waitTime });
        }

        return handle;
      } catch (err: any) {
        if (err.code !== 'EEXIST') {
          logger.error('Failed to acquire lock', { lockKey, err });
          throw err;
        }

        // Try to remove stale lock
        const wasStale = await this.tryRemoveIfStale(lockPath, timeout);
        if (wasStale) {
          continue; // Try again immediately
        }

        // Check timeout
        const elapsed = Date.now() - startTime;
        if (elapsed > timeout) {
          this.metrics.timeouts++;

          logger.warn('Lock acquisition timeout', {
            lockKey,
            timeout,
            elapsed,
            metrics: this.getMetrics(),
          });

          throw new Error(`Lock timeout for ${lockKey} after ${elapsed}ms`);
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * FIX: Enhanced lock release with proper cleanup
   */
  private async release(handle: fs.FileHandle, lockKey: string): Promise<void> {
    const lockPath = path.join(lockConfig.lockDir, encodeURIComponent(lockKey));
    const errors: Error[] = [];

    // Close file handle
    try {
      await handle.close();
    } catch (err) {
      errors.push(err as Error);
      logger.warn('Failed to close lock handle', { lockKey, err });
    }

    // Remove lock file
    try {
      await fs.unlink(lockPath);
    } catch (err) {
      errors.push(err as Error);
      logger.warn('Failed to remove lock file', { lockKey, err });
    }

    // Update tracking
    this.activeLocks.delete(lockKey);
    this.metrics.currentLocks--;

    if (lockConfig.enableLockLogging) {
      const lockInfo = this.activeLocks.get(lockKey);
      const holdTime = lockInfo ? Date.now() - lockInfo.startTime : 0;
      logger.debug('Lock released', { lockKey, holdTime });
    }

    // Only throw if both operations failed
    if (errors.length === 2) {
      throw new Error(
        `Failed to release lock ${lockKey}: ${errors.map((e) => e.message).join(', ')}`
      );
    }
  }

  /**
   * FIX: Enhanced withKeyLock with better error propagation and coalescing
   */
  async withKeyLock<T>(
    key: string,
    fn: () => Promise<T>,
    timeout: number = lockConfig.defaultTimeoutMs
  ): Promise<T> {
    // Check for existing inflight operation
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) {
      if (lockConfig.enableLockLogging) {
        logger.debug('Request coalesced', { key });
      }
      return existing;
    }

    // Create new promise for the operation
    const promise = (async (): Promise<T> => {
      let handle: fs.FileHandle | null = null;

      try {
        handle = await this.acquire(key, timeout);
        return await fn();
      } catch (err) {
        logger.error('Lock operation failed', { key, err });
        throw err;
      } finally {
        if (handle) {
          try {
            await this.release(handle, key);
          } catch (releaseErr) {
            logger.error('Lock release failed', { key, err: releaseErr });
            // Don't throw release errors - operation might have succeeded
          }
        }
      }
    })();

    // Store promise for request coalescing
    this.inflight.set(key, promise);

    try {
      return await promise;
    } finally {
      // Remove from inflight regardless of success/failure
      this.inflight.delete(key);
    }
  }

  /**
   * NEW: Get current lock metrics for monitoring
   */
  getMetrics(): LockMetrics {
    return { ...this.metrics };
  }

  /**
   * NEW: Get list of currently held locks
   */
  getActiveLocks(): LockInfo[] {
    return Array.from(this.activeLocks.values());
  }

  /**
   * NEW: Force release a specific lock (for emergency situations)
   */
  async forceRelease(lockKey: string): Promise<boolean> {
    try {
      const lockPath = path.join(
        lockConfig.lockDir,
        encodeURIComponent(lockKey)
      );
      await fs.unlink(lockPath);
      this.activeLocks.delete(lockKey);
      this.metrics.currentLocks--;

      logger.warn('Force released lock', { lockKey });
      return true;
    } catch (err) {
      logger.error('Failed to force release lock', { lockKey, err });
      return false;
    }
  }

  /**
   * NEW: Shutdown cleanup
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Final cleanup of stale locks
    await this.cleanupStaleLocks();

    logger.info('Lock manager shutdown completed', {
      metrics: this.getMetrics(),
      activeLocks: this.activeLocks.size,
    });
  }
}

// Create singleton instance
const lockManager = new LockManager();

/**
 * Main export function with enhanced error handling
 */
export async function withKeyLock<T>(
  key: string,
  fn: () => Promise<T>,
  timeout?: number
): Promise<T> {
  return lockManager.withKeyLock(key, fn, timeout);
}

/**
 * Export additional functions for monitoring and diagnostics
 */
export const getLockMetrics = (): LockMetrics => lockManager.getMetrics();
export const getActiveLocks = (): LockInfo[] => lockManager.getActiveLocks();
export const forceReleaseLock = (lockKey: string): Promise<boolean> =>
  lockManager.forceRelease(lockKey);
export const shutdownLockManager = (): Promise<void> => lockManager.shutdown();

// Export types for use by other modules
export type { LockMetrics, LockInfo };

export default {
  withKeyLock,
  getLockMetrics,
  getActiveLocks,
  forceReleaseLock,
  shutdownLockManager,
};
