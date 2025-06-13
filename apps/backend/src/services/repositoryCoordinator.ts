// apps/backend/src/services/repositoryCoordinator.ts

import path from 'path';
import { mkdtemp, rm, access } from 'fs/promises';
import os from 'os';
import { gitService } from './gitService';
import logger from './logger';
import { withKeyLock } from '../utils/lockManager';
import { config } from '../config';
import { recordStreamingStart, getRepositorySizeCategory } from './metrics';

/**
 * REPOSITORY COORDINATOR: Single source of truth for repository management
 *
 * Eliminates duplicate clones by coordinating all repository operations
 * through shared repository handles with intelligent caching and cleanup.
 */

export interface RepositoryHandle {
  /** Local filesystem path to the cloned repository */
  localPath: string;

  /** Total number of commits in the repository */
  commitCount: number;

  /** When this handle was created/last accessed */
  lastAccessed: Date;

  /** Original repository URL */
  repoUrl: string;

  /** Whether this repository is currently being used by multiple operations */
  isShared: boolean;

  /** Size category for metrics and decision making */
  sizeCategory: 'small' | 'medium' | 'large' | 'huge';

  /** Reference count for cleanup management */
  refCount: number;
}

export interface CoordinationMetrics {
  /** Number of repositories currently cached */
  cachedRepositories: number;

  /** Number of active clone operations */
  activeClones: number;

  /** Number of operations that were coalesced */
  coalescedOperations: number;

  /** Number of duplicate clones prevented */
  duplicateClonesPrevented: number;

  /** Number of cache hits vs misses */
  cacheHits: number;
  cacheMisses: number;

  /** Total disk space used by cached repositories */
  totalDiskUsageBytes: number;
}

interface PendingOperation<T> {
  promise: Promise<T>;
  operationType: string;
  startTime: number;
}

/**
 * Queue for coordinating operations on the same repository
 */
class OperationQueue {
  private pending = new Map<string, PendingOperation<any>>();
  private metrics = {
    coalescedCount: 0,
    operationCount: 0,
  };

  constructor(private repoUrl: string) {}

  async enqueue<T>(
    operationType: string,
    operation: () => Promise<T>,
    options?: { allowCoalescing?: boolean }
  ): Promise<T> {
    const allowCoalescing = options?.allowCoalescing ?? true;

    // Check if same operation type is already running and coalescing is allowed
    if (allowCoalescing) {
      const existing = this.pending.get(operationType);
      if (existing) {
        logger.info('Operation coalesced', {
          repoUrl: this.repoUrl,
          operationType,
          age: Date.now() - existing.startTime,
        });
        this.metrics.coalescedCount++;
        return existing.promise as Promise<T>;
      }
    }

    // Check if we can benefit from a broader operation
    if (operationType === 'heatmap') {
      const commitsOp = this.pending.get('commits');
      if (commitsOp) {
        logger.info('Heatmap operation waiting for commits operation', {
          repoUrl: this.repoUrl,
        });

        try {
          await commitsOp.promise;
          // Commits are now cached, heatmap can proceed faster
          logger.debug('Heatmap can now use cached commit data', {
            repoUrl: this.repoUrl,
          });
        } catch (error) {
          logger.warn(
            'Parent operation failed, heatmap will proceed independently',
            {
              repoUrl: this.repoUrl,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }
      }
    }

    // Start new operation
    const startTime = Date.now();
    const promise = operation().finally(() => {
      this.pending.delete(operationType);
      const duration = Date.now() - startTime;
      logger.debug('Operation completed', {
        repoUrl: this.repoUrl,
        operationType,
        duration,
      });
    });

    this.pending.set(operationType, {
      promise,
      operationType,
      startTime,
    });

    this.metrics.operationCount++;
    return promise;
  }

  getMetrics() {
    return {
      ...this.metrics,
      activePending: this.pending.size,
      activeOperations: Array.from(this.pending.keys()),
    };
  }

  cleanup() {
    // Force cleanup of stale operations (safety measure)
    const staleThreshold = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    for (const [key, op] of this.pending.entries()) {
      if (now - op.startTime > staleThreshold) {
        logger.warn('Removing stale operation from queue', {
          repoUrl: this.repoUrl,
          operationType: op.operationType,
          age: now - op.startTime,
        });
        this.pending.delete(key);
      }
    }
  }
}

/**
 * Main coordinator class that manages shared repositories and prevents duplicate clones
 */
class RepositoryCoordinator {
  private sharedHandles = new Map<string, RepositoryHandle>();
  private operationQueues = new Map<string, OperationQueue>();
  private activeClones = new Map<string, Promise<RepositoryHandle>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  private metrics: CoordinationMetrics = {
    cachedRepositories: 0,
    activeClones: 0,
    coalescedOperations: 0,
    duplicateClonesPrevented: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalDiskUsageBytes: 0,
  };

  constructor() {
    this.startCleanupScheduler();
    logger.info('RepositoryCoordinator initialized', {
      maxCachedRepos: config.repositoryCache?.maxRepositories || 50,
      maxAgeHours: config.repositoryCache?.maxAgeHours || 24,
    });
  }

  /**
   * Get or create a shared repository handle
   */
  async getSharedRepository(repoUrl: string): Promise<RepositoryHandle> {
    // Check if we have a valid cached handle
    const existingHandle = this.sharedHandles.get(repoUrl);
    if (existingHandle && (await this.isHandleValid(existingHandle))) {
      existingHandle.lastAccessed = new Date();
      existingHandle.refCount++;
      this.metrics.cacheHits++;

      // Track duplicate clone prevention
      if (existingHandle.refCount > 1) {
        this.metrics.duplicateClonesPrevented++;
      }

      logger.debug('Reusing cached repository', {
        repoUrl,
        refCount: existingHandle.refCount,
        age: Date.now() - existingHandle.lastAccessed.getTime(),
      });

      return existingHandle;
    }

    // Check if clone is already in progress
    const activeClone = this.activeClones.get(repoUrl);
    if (activeClone) {
      logger.info('Waiting for active clone operation', { repoUrl });
      const handle = await activeClone;
      handle.refCount++;

      // Track duplicate clone prevention for active clones too
      if (handle.refCount > 1) {
        this.metrics.duplicateClonesPrevented++;
      }

      return handle;
    }

    // Start new clone operation
    this.metrics.cacheMisses++;
    this.metrics.activeClones++;

    const clonePromise = this.performClone(repoUrl);
    this.activeClones.set(repoUrl, clonePromise);

    try {
      const handle = await clonePromise;
      this.sharedHandles.set(repoUrl, handle);
      this.metrics.cachedRepositories = this.sharedHandles.size;
      this.updateDiskUsageMetrics();

      logger.info('Repository cloned and cached', {
        repoUrl,
        commitCount: handle.commitCount,
        sizeCategory: handle.sizeCategory,
        localPath: handle.localPath,
      });

      return handle;
    } finally {
      this.activeClones.delete(repoUrl);
      this.metrics.activeClones--;
    }
  }

  /**
   * Coordinate operations on the same repository to prevent duplication
   */
  async coordinateOperation<T>(
    repoUrl: string,
    operationType: string,
    operation: () => Promise<T>,
    options?: { allowCoalescing?: boolean }
  ): Promise<T> {
    let queue = this.operationQueues.get(repoUrl);

    if (!queue) {
      queue = new OperationQueue(repoUrl);
      this.operationQueues.set(repoUrl, queue);
    }

    const result = await queue.enqueue(operationType, operation, options);

    // Update global metrics
    const queueMetrics = queue.getMetrics();
    this.metrics.coalescedOperations += queueMetrics.coalescedCount;

    return result;
  }

  /**
   * Release a reference to a repository handle
   */
  releaseRepository(repoUrl: string): void {
    const handle = this.sharedHandles.get(repoUrl);
    if (handle) {
      handle.refCount = Math.max(0, handle.refCount - 1);
      handle.lastAccessed = new Date();

      logger.debug('Repository reference released', {
        repoUrl,
        refCount: handle.refCount,
      });
    }
  }

  /**
   * Force cleanup of a specific repository
   */
  async invalidateRepository(repoUrl: string): Promise<void> {
    const handle = this.sharedHandles.get(repoUrl);
    if (handle) {
      logger.info('Invalidating cached repository', {
        repoUrl,
        refCount: handle.refCount,
      });

      await this.cleanupHandle(handle);
      this.sharedHandles.delete(repoUrl);
      this.operationQueues.delete(repoUrl);
      this.metrics.cachedRepositories = this.sharedHandles.size;
    }
  }

  /**
   * Get current coordination metrics
   */
  getMetrics(): CoordinationMetrics {
    return { ...this.metrics };
  }

  /**
   * Get detailed status of all cached repositories
   */
  getRepositoryStatus(): Array<{
    repoUrl: string;
    commitCount: number;
    sizeCategory: string;
    refCount: number;
    lastAccessed: Date;
    age: number;
  }> {
    return Array.from(this.sharedHandles.values()).map((handle) => ({
      repoUrl: handle.repoUrl,
      commitCount: handle.commitCount,
      sizeCategory: handle.sizeCategory,
      refCount: handle.refCount,
      lastAccessed: handle.lastAccessed,
      age: Date.now() - handle.lastAccessed.getTime(),
    }));
  }

  /**
   * Shutdown coordinator and cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    logger.info('Shutting down RepositoryCoordinator', {
      cachedRepositories: this.sharedHandles.size,
      metrics: this.metrics,
    });

    // Cleanup all cached repositories
    const cleanupPromises = Array.from(this.sharedHandles.values()).map(
      (handle) => this.cleanupHandle(handle)
    );

    await Promise.allSettled(cleanupPromises);

    this.sharedHandles.clear();
    this.operationQueues.clear();
    this.activeClones.clear();

    logger.info('RepositoryCoordinator shutdown completed');
  }

  // Private methods

  private async performClone(repoUrl: string): Promise<RepositoryHandle> {
    return withKeyLock(
      `clone:${repoUrl}`,
      async () => {
        logger.info('Starting repository clone', { repoUrl });

        // Create temp directory with specific prefix for coordination
        const tempDirPrefix = path.join(
          os.tmpdir(),
          'gitray-coordinator-',
          Buffer.from(repoUrl).toString('base64').slice(0, 10)
        );

        const localPath = await mkdtemp(tempDirPrefix);

        try {
          // Clone repository using existing git service
          await gitService.cloneRepository(repoUrl);
          const actualPath = await gitService.cloneRepository(repoUrl);

          // Move to our coordinated path would be ideal, but for now use git service path
          // In a production implementation, we'd want more control over the clone location

          // Get repository information
          const commitCount = await gitService.getCommitCount(actualPath);
          const sizeCategory = getRepositorySizeCategory(commitCount);

          // Create handle
          const handle: RepositoryHandle = {
            localPath: actualPath, // Use the path from git service
            commitCount,
            lastAccessed: new Date(),
            repoUrl,
            isShared: true,
            sizeCategory,
            refCount: 1,
          };

          // Start streaming metrics if this is a large repository
          if (sizeCategory === 'large' || sizeCategory === 'huge') {
            recordStreamingStart(commitCount);
          }

          logger.info('Repository clone completed', {
            repoUrl,
            localPath: handle.localPath,
            commitCount,
            sizeCategory,
          });

          return handle;
        } catch (error) {
          // Cleanup on failure
          try {
            await rm(localPath, { recursive: true, force: true });
          } catch (cleanupError) {
            logger.warn('Failed to cleanup failed clone directory', {
              localPath,
              error: cleanupError,
            });
          }
          throw error;
        }
      },
      5 * 60 * 1000
    ); // 5-minute timeout for clones
  }

  private async isHandleValid(handle: RepositoryHandle): Promise<boolean> {
    try {
      // Check if directory still exists
      await access(handle.localPath);

      // Check age
      const maxAge =
        (config.repositoryCache?.maxAgeHours || 24) * 60 * 60 * 1000;
      const age = Date.now() - handle.lastAccessed.getTime();

      if (age > maxAge) {
        logger.debug('Repository handle expired', {
          repoUrl: handle.repoUrl,
          age: Math.round(age / (60 * 1000)),
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.debug('Repository handle invalid', {
        repoUrl: handle.repoUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async cleanupHandle(handle: RepositoryHandle): Promise<void> {
    try {
      await rm(handle.localPath, { recursive: true, force: true });
      logger.debug('Repository handle cleaned up', {
        repoUrl: handle.repoUrl,
        localPath: handle.localPath,
      });
    } catch (error) {
      logger.warn('Failed to cleanup repository handle', {
        repoUrl: handle.repoUrl,
        localPath: handle.localPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private startCleanupScheduler(): void {
    if (this.cleanupInterval) return;

    const cleanupIntervalMs = 5 * 60 * 1000; // 5 minutes

    this.cleanupInterval = setInterval(() => {
      void this.performCleanup();
    }, cleanupIntervalMs);

    logger.info('Repository cleanup scheduler started', { cleanupIntervalMs });
  }

  private async performCleanup(): Promise<void> {
    const maxRepositories = config.repositoryCache?.maxRepositories || 50;
    const maxAge = (config.repositoryCache?.maxAgeHours || 24) * 60 * 60 * 1000;

    // Clean up expired handles
    const now = Date.now();
    const toCleanup: RepositoryHandle[] = [];

    for (const [repoUrl, handle] of this.sharedHandles.entries()) {
      const age = now - handle.lastAccessed.getTime();
      const isExpired = age > maxAge;
      const isUnused = handle.refCount === 0;

      if (
        isExpired ||
        (isUnused && this.sharedHandles.size > maxRepositories)
      ) {
        toCleanup.push(handle);
        this.sharedHandles.delete(repoUrl);

        // Also cleanup operation queue
        const queue = this.operationQueues.get(repoUrl);
        if (queue) {
          queue.cleanup();
          if (queue.getMetrics().activePending === 0) {
            this.operationQueues.delete(repoUrl);
          }
        }
      }
    }

    // Perform cleanup
    if (toCleanup.length > 0) {
      logger.info('Cleaning up expired repository handles', {
        count: toCleanup.length,
        reasons: toCleanup.map((h) => ({
          repoUrl: h.repoUrl,
          age: Math.round((now - h.lastAccessed.getTime()) / (60 * 1000)),
          refCount: h.refCount,
        })),
      });

      const cleanupPromises = toCleanup.map((handle) =>
        this.cleanupHandle(handle)
      );
      await Promise.allSettled(cleanupPromises);

      this.metrics.cachedRepositories = this.sharedHandles.size;
      this.updateDiskUsageMetrics();
    }
  }

  private updateDiskUsageMetrics(): void {
    // This is a simplified implementation
    // In production, you'd want to actually measure disk usage
    this.metrics.totalDiskUsageBytes =
      this.sharedHandles.size * 100 * 1024 * 1024; // Rough estimate
  }
}

// Singleton instance
export const repositoryCoordinator = new RepositoryCoordinator();

// Export helper functions
export async function withSharedRepository<T>(
  repoUrl: string,
  callback: (handle: RepositoryHandle) => Promise<T>
): Promise<T> {
  const handle = await repositoryCoordinator.getSharedRepository(repoUrl);

  try {
    return await callback(handle);
  } finally {
    repositoryCoordinator.releaseRepository(repoUrl);
  }
}

export async function coordinatedOperation<T>(
  repoUrl: string,
  operationType: string,
  operation: () => Promise<T>,
  options?: { allowCoalescing?: boolean }
): Promise<T> {
  return repositoryCoordinator.coordinateOperation(
    repoUrl,
    operationType,
    operation,
    options
  );
}
