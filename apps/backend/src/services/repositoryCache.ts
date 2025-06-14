// apps/backend/src/services/repositoryCache.ts - FIXED VERSION

import crypto from 'crypto';
import { gitService } from './gitService';
import { getLogger } from './logger';
import { withSharedRepository } from './repositoryCoordinator';
import type { RepositoryHandle } from './repositoryCoordinator';
import { config } from '../config';
import HybridLRUCache from '../utils/hybridLruCache';
import {
  cacheHits,
  cacheMisses,
  getRepositorySizeCategory,
  recordEnhancedCacheOperation,
  updateServiceHealthScore,
  recordDataFreshness,
  recordDetailedError,
} from './metrics';
import { withKeyLock } from '../utils/lockManager';

const logger = getLogger();
import {
  Commit,
  CommitFilterOptions,
  CommitHeatmapData,
} from '@gitray/shared-types';

/**
 * UNIFIED REPOSITORY CACHE MANAGER - FIXED VERSION
 *
 * FIXES APPLIED:
 * 1. ✅ Transactional cache operations with rollback
 * 2. ✅ Complete cache invalidation across all tiers
 * 3. ✅ Atomic multi-tier cache updates
 * 4. ✅ Enhanced error handling and recovery
 * 5. ✅ Pattern-based cache key management
 */

export interface CommitCacheOptions {
  /** Skip certain authors in the result */
  author?: string;

  /** Include only these authors */
  authors?: string[];

  /** Start date filter (ISO string) */
  fromDate?: string;

  /** End date filter (ISO string) */
  toDate?: string;

  /** Pagination offset */
  skip?: number;

  /** Maximum number of commits to return */
  limit?: number;
}

export interface CacheStats {
  /** Number of entries in each cache tier */
  entries: {
    rawCommits: number;
    filteredCommits: number;
    aggregatedData: number;
  };

  /** Memory usage by tier */
  memoryUsage: {
    rawCommits: number;
    filteredCommits: number;
    aggregatedData: number;
    total: number;
  };

  /** Hit/miss ratios by tier */
  hitRatios: {
    rawCommits: number;
    filteredCommits: number;
    aggregatedData: number;
    overall: number;
  };

  /** Cache efficiency metrics */
  efficiency: {
    duplicateClonesPrevented: number;
    totalCacheOperations: number;
    averageHitTime: number;
    averageMissTime: number;
  };

  /** Transaction metrics */
  transactions?: {
    started: number;
    committed: number;
    rolledBack: number;
    failed: number;
  };
}

/**
 * FIX: Transaction context for atomic cache operations
 */
interface CacheTransaction {
  id: string;
  operations: Array<{
    cache: 'raw' | 'filtered' | 'aggregated';
    operation: 'set' | 'del';
    key: string;
    originalValue?: any;
    newValue?: any;
  }>;
  completed: boolean;
  rollbackOperations: Array<() => Promise<void>>;
}

/**
 * Multi-tier cache for repository commit data with transactional consistency
 */
class RepositoryCacheManager {
  // Level 1: Raw commits cache (highest priority, shared across all operations)
  private rawCommitsCache: HybridLRUCache<Commit[]>;

  // Level 2: Filtered commits cache (medium priority, filtered/paginated data)
  private filteredCommitsCache: HybridLRUCache<Commit[]>;

  // Level 3: Aggregated data cache (lower priority, processed results)
  private aggregatedDataCache: HybridLRUCache<CommitHeatmapData>;

  // FIX: Track active transactions for consistency
  private activeTransactions = new Map<string, CacheTransaction>();

  // FIX: Cache key patterns for complete invalidation
  private cacheKeyPatterns = new Map<string, Set<string>>();

  // Metrics tracking
  private metrics = {
    operations: {
      rawHits: 0,
      rawMisses: 0,
      filteredHits: 0,
      filteredMisses: 0,
      aggregatedHits: 0,
      aggregatedMisses: 0,
    },
    performance: {
      totalHitTime: 0,
      totalMissTime: 0,
      operationCount: 0,
    },
    efficiency: {
      duplicateClonesPrevented: 0,
    },
    // FIX: Add transaction metrics
    transactions: {
      started: 0,
      committed: 0,
      rolledBack: 0,
      failed: 0,
    },
  };

  constructor() {
    const baseConfig = config.hybridCache;

    // Configure raw commits cache (largest allocation)
    this.rawCommitsCache = new HybridLRUCache<Commit[]>({
      maxEntries: Math.floor(baseConfig.maxEntries * 0.5), // 50% of total
      memoryLimitBytes: Math.floor(baseConfig.memoryLimitBytes * 0.6), // 60% of memory
      diskPath: `${baseConfig.diskPath}/raw-commits`,
      lockTimeoutMs: baseConfig.lockTimeoutMs,
      redisConfig: baseConfig.enableRedis
        ? {
            ...baseConfig.redisConfig,
            keyPrefix: `${baseConfig.redisConfig.keyPrefix}raw:`,
          }
        : undefined,
    });

    // Configure filtered commits cache (medium allocation)
    this.filteredCommitsCache = new HybridLRUCache<Commit[]>({
      maxEntries: Math.floor(baseConfig.maxEntries * 0.3), // 30% of total
      memoryLimitBytes: Math.floor(baseConfig.memoryLimitBytes * 0.25), // 25% of memory
      diskPath: `${baseConfig.diskPath}/filtered-commits`,
      lockTimeoutMs: baseConfig.lockTimeoutMs,
      redisConfig: baseConfig.enableRedis
        ? {
            ...baseConfig.redisConfig,
            keyPrefix: `${baseConfig.redisConfig.keyPrefix}filtered:`,
          }
        : undefined,
    });

    // Configure aggregated data cache (smallest allocation)
    this.aggregatedDataCache = new HybridLRUCache<CommitHeatmapData>({
      maxEntries: Math.floor(baseConfig.maxEntries * 0.2), // 20% of total
      memoryLimitBytes: Math.floor(baseConfig.memoryLimitBytes * 0.15), // 15% of memory
      diskPath: `${baseConfig.diskPath}/aggregated-data`,
      lockTimeoutMs: baseConfig.lockTimeoutMs,
      redisConfig: baseConfig.enableRedis
        ? {
            ...baseConfig.redisConfig,
            keyPrefix: `${baseConfig.redisConfig.keyPrefix}aggregated:`,
          }
        : undefined,
    });

    logger.info(
      'RepositoryCacheManager initialized with transactional consistency',
      {
        hierarchicalCaching: config.cacheStrategy.hierarchicalCaching,
        rawCommitsEntries: Math.floor(baseConfig.maxEntries * 0.5),
        filteredCommitsEntries: Math.floor(baseConfig.maxEntries * 0.3),
        aggregatedDataEntries: Math.floor(baseConfig.maxEntries * 0.2),
        memoryDistribution: '60% raw, 25% filtered, 15% aggregated',
        transactionalConsistency: true,
      }
    );
  }

  /**
   * FIX: Create a new cache transaction
   */
  private createTransaction(repoUrl: string): CacheTransaction {
    const transaction: CacheTransaction = {
      id: crypto.randomUUID(),
      operations: [],
      completed: false,
      rollbackOperations: [],
    };

    this.activeTransactions.set(transaction.id, transaction);
    this.metrics.transactions.started++;

    logger.debug('Cache transaction created', {
      transactionId: transaction.id,
      repoUrl,
    });

    return transaction;
  }

  /**
   * FIX: Commit a cache transaction
   */
  private async commitTransaction(
    transaction: CacheTransaction
  ): Promise<void> {
    if (transaction.completed) {
      logger.warn('Attempted to commit already completed transaction', {
        transactionId: transaction.id,
      });
      return;
    }

    transaction.completed = true;
    this.activeTransactions.delete(transaction.id);
    this.metrics.transactions.committed++;

    logger.debug('Cache transaction committed', {
      transactionId: transaction.id,
      operationsCount: transaction.operations.length,
    });
  }

  /**
   * FIX: Rollback a cache transaction
   */
  private async rollbackTransaction(
    transaction: CacheTransaction
  ): Promise<void> {
    if (transaction.completed) {
      logger.warn('Attempted to rollback already completed transaction', {
        transactionId: transaction.id,
      });
      return;
    }

    try {
      // Execute rollback operations in reverse order
      for (const rollbackOp of transaction.rollbackOperations.reverse()) {
        try {
          await rollbackOp();
        } catch (error) {
          logger.error('Failed to execute rollback operation', {
            transactionId: transaction.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      transaction.completed = true;
      this.activeTransactions.delete(transaction.id);
      this.metrics.transactions.rolledBack++;

      logger.debug('Cache transaction rolled back', {
        transactionId: transaction.id,
        rollbackOperationsCount: transaction.rollbackOperations.length,
      });
    } catch (error) {
      // Don't increment failed counter here as it's already incremented in the calling catch block
      logger.error('Failed to rollback transaction', {
        transactionId: transaction.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * FIX: Transactional cache set operation
   */
  private async transactionalSet<T>(
    cache: HybridLRUCache<T>,
    cacheType: 'raw' | 'filtered' | 'aggregated',
    key: string,
    value: T,
    ttl: number,
    transaction: CacheTransaction
  ): Promise<void> {
    // Check if key already exists for rollback
    let originalValue: T | null = null;
    try {
      originalValue = await cache.get(key);
    } catch {
      // Key doesn't exist, that's fine
    }

    // Perform the set operation
    await cache.set(key, value, 'EX', ttl);

    // Record operation for potential rollback
    transaction.operations.push({
      cache: cacheType,
      operation: 'set',
      key,
      originalValue,
      newValue: value,
    });

    // Add rollback operation
    if (originalValue !== null) {
      // Restore original value
      transaction.rollbackOperations.push(async () => {
        await cache.set(key, originalValue as T, 'EX', ttl);
      });
    } else {
      // Delete the key we just set
      transaction.rollbackOperations.push(async () => {
        await cache.del(key);
      });
    }

    // FIX: Track cache key patterns for invalidation
    this.trackCacheKey(key);
  }

  /**
   * FIX: Track cache keys by repository for pattern-based invalidation
   */
  private trackCacheKey(key: string): void {
    // Extract repository URL hash from key pattern
    const match = key.match(
      /^(?:raw_commits|filtered_commits|aggregated_data):([a-f0-9]+)/
    );
    if (match) {
      const repoHash = match[1];
      if (!this.cacheKeyPatterns.has(repoHash)) {
        this.cacheKeyPatterns.set(repoHash, new Set());
      }
      this.cacheKeyPatterns.get(repoHash)!.add(key);
    }
  }

  /**
   * FIX: Get or parse raw commits with transactional consistency
   */
  async getOrParseCommits(
    repoUrl: string,
    options?: CommitCacheOptions
  ): Promise<Commit[]> {
    return withKeyLock(`cache-operation:${repoUrl}`, async () => {
      const startTime = Date.now();

      // For paginated requests or specific filters, try filtered cache first
      if (this.hasSpecificFilters(options)) {
        return this.getOrParseFilteredCommits(repoUrl, options);
      }

      // Level 1: Try raw commits cache
      const rawKey = this.generateRawCommitsKey(repoUrl);
      let commits: Commit[] | null = null;

      try {
        commits = await this.rawCommitsCache.get(rawKey);
      } catch (error) {
        // Record detailed error for enhanced metrics
        recordDetailedError(
          'cache',
          error instanceof Error ? error : new Error(String(error)),
          {
            userImpact: 'degraded',
            recoveryAction: 'fallback',
            severity: 'warning',
          }
        );

        logger.error('Cache operation failed', {
          operation: 'get',
          key: rawKey,
          error: error instanceof Error ? error.message : String(error),
        });
        commits = null;
      }

      if (commits) {
        this.metrics.operations.rawHits++;
        this.recordHitTime(startTime);
        cacheHits.inc({ operation: 'raw_commits' });
        recordEnhancedCacheOperation(
          'raw_commits',
          true,
          undefined,
          repoUrl,
          commits.length
        );

        // Record data freshness
        const cacheAge = Date.now() - startTime;
        recordDataFreshness('commits', cacheAge);

        logger.debug('Raw commits cache hit', {
          repoUrl,
          commitsCount: commits.length,
          cacheKey: rawKey,
        });

        return commits;
      }

      // Cache miss - need to fetch from repository with transaction
      this.metrics.operations.rawMisses++;
      this.recordMissTime(startTime);
      cacheMisses.inc({ operation: 'raw_commits' });
      recordEnhancedCacheOperation('raw_commits', false, undefined, repoUrl);

      logger.info('Raw commits cache miss, fetching from repository', {
        repoUrl,
        cacheKey: rawKey,
      });

      const transaction = this.createTransaction(repoUrl);

      try {
        // Use shared repository to prevent duplicate clones
        commits = await withSharedRepository(
          repoUrl,
          async (handle: RepositoryHandle) => {
            logger.info('Fetching raw commits via shared repository', {
              repoUrl,
              commitCount: handle.commitCount,
              sizeCategory: handle.sizeCategory,
              isShared: handle.isShared,
            });

            // Prevent duplicate clone tracking
            if (handle.isShared && handle.refCount > 1) {
              this.metrics.efficiency.duplicateClonesPrevented++;
              logger.debug('Duplicate clone prevented', {
                repoUrl,
                refCount: handle.refCount,
                totalPrevented:
                  this.metrics.efficiency.duplicateClonesPrevented,
              });
            }

            return gitService.getCommits(handle.localPath);
          }
        );

        // Ensure commits is never null
        if (!commits) {
          commits = [];
          logger.warn(
            'gitService.getCommits returned null, using empty array',
            {
              repoUrl,
            }
          );
        }

        // FIX: Transactional cache write
        const ttl = config.cacheStrategy.cacheKeys.rawCommitsTTL;
        await this.transactionalSet(
          this.rawCommitsCache,
          'raw',
          rawKey,
          commits,
          ttl,
          transaction
        );

        // Commit the transaction
        await this.commitTransaction(transaction);

        logger.info('Raw commits cached with transaction', {
          repoUrl,
          commitsCount: commits.length,
          ttl,
          sizeCategory: getRepositorySizeCategory(commits.length),
          transactionId: transaction.id,
        });

        // Update service health score on successful cache operation
        updateServiceHealthScore('cache', {
          cacheHitRate: 1.0,
          errorRate: 0.0,
        });

        return commits;
      } catch (error) {
        // Increment failure counter
        this.metrics.transactions.failed++;

        // Record detailed error for enhanced metrics
        recordDetailedError(
          'cache',
          error instanceof Error ? error : new Error(String(error)),
          {
            userImpact: 'degraded',
            recoveryAction: 'retry',
            severity: 'warning',
          }
        );

        // Update service health score on error
        updateServiceHealthScore('cache', { errorRate: 1.0 });

        // Rollback transaction on any error
        await this.rollbackTransaction(transaction);

        logger.error('Failed to cache raw commits, transaction rolled back', {
          repoUrl,
          transactionId: transaction.id,
          error: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }
    });
  }

  /**
   * FIX: Get or parse filtered commits with transactional consistency
   */
  async getOrParseFilteredCommits(
    repoUrl: string,
    options?: CommitCacheOptions
  ): Promise<Commit[]> {
    return withKeyLock(`cache-filtered:${repoUrl}`, async () => {
      const startTime = Date.now();

      // Level 2: Try filtered commits cache
      const filteredKey = this.generateFilteredCommitsKey(repoUrl, options);
      let filteredCommits = await this.filteredCommitsCache.get(filteredKey);

      if (filteredCommits) {
        this.metrics.operations.filteredHits++;
        this.recordHitTime(startTime);
        cacheHits.inc({ operation: 'filtered_commits' });
        recordEnhancedCacheOperation(
          'filtered_commits',
          true,
          undefined,
          repoUrl,
          filteredCommits.length
        );

        // Record data freshness
        const cacheAge = Date.now() - startTime;
        recordDataFreshness('commits', cacheAge);

        logger.debug('Filtered commits cache hit', {
          repoUrl,
          commitsCount: filteredCommits.length,
          filters: options,
          cacheKey: filteredKey,
        });

        return filteredCommits;
      }

      // Cache miss - get raw commits and apply filters with transaction
      this.metrics.operations.filteredMisses++;
      this.recordMissTime(startTime);
      cacheMisses.inc({ operation: 'filtered_commits' });
      recordEnhancedCacheOperation(
        'filtered_commits',
        false,
        undefined,
        repoUrl
      );

      logger.debug(
        'Filtered commits cache miss, applying filters to raw commits',
        {
          repoUrl,
          filters: options,
          cacheKey: filteredKey,
        }
      );

      const transaction = this.createTransaction(repoUrl);

      try {
        // Get raw commits (this may hit Level 1 cache)
        const rawCommits = await this.getOrParseCommits(repoUrl);

        // Apply filters (handles null commits internally)
        filteredCommits = this.applyFilters(rawCommits, options);

        // FIX: Transactional cache write for filtered commits
        const ttl = config.cacheStrategy.cacheKeys.filteredCommitsTTL;
        await this.transactionalSet(
          this.filteredCommitsCache,
          'filtered',
          filteredKey,
          filteredCommits,
          ttl,
          transaction
        );

        // Commit the transaction
        await this.commitTransaction(transaction);

        logger.debug('Filtered commits cached with transaction', {
          repoUrl,
          originalCount: rawCommits?.length || 0,
          filteredCount: filteredCommits.length,
          filters: options,
          ttl,
          transactionId: transaction.id,
        });

        // Update service health score on successful cache operation
        updateServiceHealthScore('cache', {
          cacheHitRate: 1.0,
          errorRate: 0.0,
        });

        return filteredCommits;
      } catch (error) {
        // Increment failure counter
        this.metrics.transactions.failed++;

        // Record detailed error for enhanced metrics
        recordDetailedError(
          'cache',
          error instanceof Error ? error : new Error(String(error)),
          {
            userImpact: 'degraded',
            recoveryAction: 'retry',
            severity: 'warning',
          }
        );

        // Update service health score on error
        updateServiceHealthScore('cache', { errorRate: 1.0 });

        // Rollback transaction on any error
        await this.rollbackTransaction(transaction);

        logger.error(
          'Failed to cache filtered commits, transaction rolled back',
          {
            repoUrl,
            transactionId: transaction.id,
            error: error instanceof Error ? error.message : String(error),
          }
        );

        throw error;
      }
    });
  }

  /**
   * FIX: Get or generate aggregated data with transactional consistency
   */
  async getOrGenerateAggregatedData(
    repoUrl: string,
    filterOptions?: CommitFilterOptions
  ): Promise<CommitHeatmapData> {
    return withKeyLock(`cache-aggregated:${repoUrl}`, async () => {
      const startTime = Date.now();

      // Level 3: Try aggregated data cache
      const aggregatedKey = this.generateAggregatedDataKey(
        repoUrl,
        filterOptions
      );
      let aggregatedData = await this.aggregatedDataCache.get(aggregatedKey);

      if (aggregatedData) {
        this.metrics.operations.aggregatedHits++;
        this.recordHitTime(startTime);
        cacheHits.inc({ operation: 'aggregated_data' });
        recordEnhancedCacheOperation(
          'aggregated_data',
          true,
          undefined,
          repoUrl
        );

        // Record data freshness
        const cacheAge = Date.now() - startTime;
        recordDataFreshness('aggregated_data', cacheAge);

        logger.debug('Aggregated data cache hit', {
          repoUrl,
          filters: filterOptions,
          cacheKey: aggregatedKey,
        });

        return aggregatedData;
      }

      // Cache miss - get commits and generate aggregation with transaction
      this.metrics.operations.aggregatedMisses++;
      this.recordMissTime(startTime);
      cacheMisses.inc({ operation: 'aggregated_data' });
      recordEnhancedCacheOperation(
        'aggregated_data',
        false,
        undefined,
        repoUrl
      );

      logger.debug('Aggregated data cache miss, generating from commits', {
        repoUrl,
        filters: filterOptions,
        cacheKey: aggregatedKey,
      });

      const transaction = this.createTransaction(repoUrl);

      try {
        // Convert filter options to commit cache options
        const commitOptions: CommitCacheOptions = {
          author: filterOptions?.author,
          authors: filterOptions?.authors,
          fromDate: filterOptions?.fromDate,
          toDate: filterOptions?.toDate,
        };

        // Get filtered commits (this may hit Level 1 or Level 2 cache)
        const commits = await this.getOrParseFilteredCommits(
          repoUrl,
          commitOptions
        );

        // Ensure commits is never null before passing to aggregateCommitsByTime
        if (!commits) {
          logger.warn(
            'getOrParseFilteredCommits returned null, using empty array',
            { repoUrl }
          );
          // Generate aggregated data for empty commits
          aggregatedData = await gitService.aggregateCommitsByTime(
            [],
            filterOptions
          );
        } else {
          // Generate aggregated data
          aggregatedData = await gitService.aggregateCommitsByTime(
            commits,
            filterOptions
          );
        }

        // FIX: Transactional cache write for aggregated data
        const ttl = config.cacheStrategy.cacheKeys.aggregatedDataTTL;
        await this.transactionalSet(
          this.aggregatedDataCache,
          'aggregated',
          aggregatedKey,
          aggregatedData,
          ttl,
          transaction
        );

        // Commit the transaction
        await this.commitTransaction(transaction);

        logger.debug('Aggregated data cached with transaction', {
          repoUrl,
          filters: filterOptions,
          dataPoints: aggregatedData.data.length,
          totalCommits: aggregatedData.metadata?.totalCommits || 0,
          ttl,
          transactionId: transaction.id,
        });

        // Update service health score on successful cache operation
        updateServiceHealthScore('cache', {
          cacheHitRate: 1.0,
          errorRate: 0.0,
        });

        return aggregatedData;
      } catch (error) {
        // Increment failure counter
        this.metrics.transactions.failed++;

        // Record detailed error for enhanced metrics
        recordDetailedError(
          'cache',
          error instanceof Error ? error : new Error(String(error)),
          {
            userImpact: 'degraded',
            recoveryAction: 'retry',
            severity: 'warning',
          }
        );

        // Update service health score on error
        updateServiceHealthScore('cache', { errorRate: 1.0 });

        // Rollback transaction on any error
        await this.rollbackTransaction(transaction);

        logger.error(
          'Failed to cache aggregated data, transaction rolled back',
          {
            repoUrl,
            transactionId: transaction.id,
            error: error instanceof Error ? error.message : String(error),
          }
        );

        throw error;
      }
    });
  }

  /**
   * FIX: Complete cache invalidation across all tiers with pattern matching
   */
  async invalidateRepository(repoUrl: string): Promise<void> {
    return withKeyLock(`cache-invalidate:${repoUrl}`, async () => {
      logger.info('Starting complete repository cache invalidation', {
        repoUrl,
      });

      const repoHash = this.hashUrl(repoUrl);
      const keysToInvalidate = this.cacheKeyPatterns.get(repoHash) || new Set();

      const operations: Promise<void>[] = [];

      // FIX: Invalidate all known keys for this repository
      for (const key of keysToInvalidate) {
        if (key.startsWith('raw_commits:')) {
          operations.push(this.rawCommitsCache.del(key));
        } else if (key.startsWith('filtered_commits:')) {
          operations.push(this.filteredCommitsCache.del(key));
        } else if (key.startsWith('aggregated_data:')) {
          operations.push(this.aggregatedDataCache.del(key));
        }
      }

      // FIX: Also invalidate base patterns in case we missed some
      const baseKeys = [
        this.generateRawCommitsKey(repoUrl),
        // Generate some common filtered patterns
        this.generateFilteredCommitsKey(repoUrl, {}),
        this.generateFilteredCommitsKey(repoUrl, { skip: 0, limit: 100 }),
        // Generate some common aggregated patterns
        this.generateAggregatedDataKey(repoUrl, {}),
        this.generateAggregatedDataKey(repoUrl, undefined),
      ];

      for (const key of baseKeys) {
        if (key.startsWith('raw_commits:')) {
          operations.push(this.rawCommitsCache.del(key));
        } else if (key.startsWith('filtered_commits:')) {
          operations.push(this.filteredCommitsCache.del(key));
        } else if (key.startsWith('aggregated_data:')) {
          operations.push(this.aggregatedDataCache.del(key));
        }
      }

      // Execute all invalidation operations
      const results = await Promise.allSettled(operations);

      // Count successful invalidations
      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      // Clear the key pattern tracking for this repository
      this.cacheKeyPatterns.delete(repoHash);

      if (failed > 0) {
        const failedOperations = results
          .filter((r) => r.status === 'rejected')
          .map((r) => (r as PromiseRejectedResult).reason);

        logger.error('Failed to invalidate repository cache', {
          repoUrl,
          error: failedOperations[0]?.message || 'Cache deletion failed',
          failedCount: failed,
          totalOperations: operations.length,
        });
      } else {
        logger.info('Repository cache invalidated across all tiers', {
          repoUrl,
          keysInvalidated: successful,
          totalOperations: operations.length,
        });
      }
    });
  }

  /**
   * Get cache statistics including transaction metrics
   */
  getCacheStats(): CacheStats {
    const rawStats = this.rawCommitsCache.getStats();
    const filteredStats = this.filteredCommitsCache.getStats();
    const aggregatedStats = this.aggregatedDataCache.getStats();

    const totalOperations =
      this.metrics.operations.rawHits +
      this.metrics.operations.rawMisses +
      this.metrics.operations.filteredHits +
      this.metrics.operations.filteredMisses +
      this.metrics.operations.aggregatedHits +
      this.metrics.operations.aggregatedMisses;

    const totalHits =
      this.metrics.operations.rawHits +
      this.metrics.operations.filteredHits +
      this.metrics.operations.aggregatedHits;

    return {
      entries: {
        rawCommits: rawStats.memory.entries + rawStats.disk.entries,
        filteredCommits:
          filteredStats.memory.entries + filteredStats.disk.entries,
        aggregatedData:
          aggregatedStats.memory.entries + aggregatedStats.disk.entries,
      },
      memoryUsage: {
        rawCommits: rawStats.memory.usageBytes,
        filteredCommits: filteredStats.memory.usageBytes,
        aggregatedData: aggregatedStats.memory.usageBytes,
        total:
          rawStats.memory.usageBytes +
          filteredStats.memory.usageBytes +
          aggregatedStats.memory.usageBytes,
      },
      hitRatios: {
        rawCommits: this.calculateHitRatio(
          this.metrics.operations.rawHits,
          this.metrics.operations.rawMisses
        ),
        filteredCommits: this.calculateHitRatio(
          this.metrics.operations.filteredHits,
          this.metrics.operations.filteredMisses
        ),
        aggregatedData: this.calculateHitRatio(
          this.metrics.operations.aggregatedHits,
          this.metrics.operations.aggregatedMisses
        ),
        overall: totalOperations > 0 ? totalHits / totalOperations : 0,
      },
      efficiency: {
        duplicateClonesPrevented:
          this.metrics.efficiency.duplicateClonesPrevented,
        totalCacheOperations: totalOperations,
        averageHitTime:
          this.metrics.performance.operationCount > 0
            ? this.metrics.performance.totalHitTime /
              this.metrics.performance.operationCount
            : 0,
        averageMissTime:
          this.metrics.performance.operationCount > 0
            ? this.metrics.performance.totalMissTime /
              this.metrics.performance.operationCount
            : 0,
      },
      // FIX: Include transaction metrics
      transactions: { ...this.metrics.transactions },
    };
  }

  /**
   * Shutdown all cache tiers and clean up transactions
   */
  async shutdown(): Promise<void> {
    // FIX: Cleanup any pending transactions
    if (this.activeTransactions.size > 0) {
      logger.warn('Shutting down with active transactions', {
        activeTransactions: this.activeTransactions.size,
      });

      for (const [
        transactionId,
        transaction,
      ] of this.activeTransactions.entries()) {
        try {
          await this.rollbackTransaction(transaction);
        } catch (error) {
          logger.error('Failed to rollback transaction during shutdown', {
            transactionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const operations = [
      this.rawCommitsCache.quit(),
      this.filteredCommitsCache.quit(),
      this.aggregatedDataCache.quit(),
    ];

    const results = await Promise.allSettled(operations);
    const failed = results.filter((r) => r.status === 'rejected').length;

    if (failed > 0) {
      const errors = results
        .filter((r) => r.status === 'rejected')
        .map((r) => (r as PromiseRejectedResult).reason);

      logger.error('Error during RepositoryCacheManager shutdown', {
        error: errors[0]?.message || 'Shutdown failed',
        failedShutdowns: failed,
      });
    }

    logger.info('RepositoryCacheManager shutdown completed');
  }

  // Private helper methods (unchanged except for key tracking)

  private generateRawCommitsKey(repoUrl: string): string {
    const key = `raw_commits:${this.hashUrl(repoUrl)}`;
    this.trackCacheKey(key);
    return key;
  }

  private generateFilteredCommitsKey(
    repoUrl: string,
    options?: CommitCacheOptions
  ): string {
    const filterHash = this.hashObject(options || {});
    const key = `filtered_commits:${this.hashUrl(repoUrl)}:${filterHash}`;
    this.trackCacheKey(key);
    return key;
  }

  private generateAggregatedDataKey(
    repoUrl: string,
    filterOptions?: CommitFilterOptions
  ): string {
    const filterHash = this.hashObject(filterOptions || {});
    const key = `aggregated_data:${this.hashUrl(repoUrl)}:${filterHash}`;
    this.trackCacheKey(key);
    return key;
  }

  private hashUrl(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
  }

  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('md5').update(str).digest('hex').slice(0, 8);
  }

  private hasSpecificFilters(options?: CommitCacheOptions): boolean {
    if (!options) return false;

    return !!(
      options.author ||
      options.authors?.length ||
      options.fromDate ||
      options.toDate ||
      options.skip !== undefined ||
      options.limit !== undefined
    );
  }

  private applyFilters(
    commits: Commit[] | null,
    options?: CommitCacheOptions
  ): Commit[] {
    // Handle null commits
    if (!commits) {
      logger.warn('applyFilters received null commits, returning empty array');
      return [];
    }

    let filtered = commits;

    // Apply author filters
    if (options?.author) {
      filtered = filtered.filter(
        (c) =>
          c.authorName.includes(options.author!) ||
          c.authorEmail.includes(options.author!)
      );
    }

    if (options?.authors?.length) {
      filtered = filtered.filter((c) =>
        options.authors!.some(
          (author) =>
            c.authorName.includes(author) || c.authorEmail.includes(author)
        )
      );
    }

    // Apply date filters
    if (options?.fromDate) {
      try {
        const fromDate = new Date(options.fromDate);
        if (!isNaN(fromDate.getTime())) {
          filtered = filtered.filter((c) => new Date(c.date) >= fromDate);
        }
      } catch {
        logger.warn('Invalid fromDate filter, ignoring', {
          fromDate: options.fromDate,
        });
      }
    }

    if (options?.toDate) {
      try {
        const toDate = new Date(options.toDate);
        if (!isNaN(toDate.getTime())) {
          filtered = filtered.filter((c) => new Date(c.date) <= toDate);
        }
      } catch {
        logger.warn('Invalid toDate filter, ignoring', {
          toDate: options.toDate,
        });
      }
    }

    // Apply pagination
    if (options?.skip !== undefined) {
      filtered = filtered.slice(options.skip);
    }

    if (options?.limit !== undefined) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  private calculateHitRatio(hits: number, misses: number): number {
    const total = hits + misses;
    return total > 0 ? hits / total : 0;
  }

  private recordHitTime(startTime: number): void {
    const duration = Date.now() - startTime;
    this.metrics.performance.totalHitTime += duration;
    this.metrics.performance.operationCount++;
  }

  private recordMissTime(startTime: number): void {
    const duration = Date.now() - startTime;
    this.metrics.performance.totalMissTime += duration;
    this.metrics.performance.operationCount++;
  }
}

// Singleton instance
export const repositoryCache = new RepositoryCacheManager();

// Export helper functions for easy integration
export async function getCachedCommits(
  repoUrl: string,
  options?: CommitCacheOptions
): Promise<Commit[]> {
  return repositoryCache.getOrParseCommits(repoUrl, options);
}

export async function getCachedAggregatedData(
  repoUrl: string,
  filterOptions?: CommitFilterOptions
): Promise<CommitHeatmapData> {
  return repositoryCache.getOrGenerateAggregatedData(repoUrl, filterOptions);
}

export async function invalidateCachedRepository(
  repoUrl: string
): Promise<void> {
  return repositoryCache.invalidateRepository(repoUrl);
}

export function getRepositoryCacheStats(): CacheStats {
  return repositoryCache.getCacheStats();
}
