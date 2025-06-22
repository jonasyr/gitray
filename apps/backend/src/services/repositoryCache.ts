/**
 * Repository Cache Service - Multi-tier Git Data Caching System
 *
 * Provides high-performance, transactionally consistent caching for Git repository data
 * with intelligent memory management and deadlock-free concurrent access.
 *
 * @fileoverview This service implements a sophisticated three-tier caching architecture:
 * - Tier 1: Raw commits (direct Git extraction results)
 * - Tier 2: Filtered commits (author/date/pagination filtered data)
 * - Tier 3: Aggregated data (heatmaps, statistics, visualizations)
 *
 * Key features:
 * - Transactional consistency with automatic rollback on failures
 * - Ordered locking system preventing deadlocks in concurrent operations
 * - Memory-aware cache allocation preventing OOM on large repositories
 * - Repository coordination to eliminate duplicate clones
 * - Comprehensive metrics and health monitoring
 */

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
  recordCacheTransaction,
  recordTransactionRollback,
  recordRollbackDuration,
  recordRollbackVerification,
  recordCriticalRollbackFailure,
} from './metrics';
import { withKeyLock, withOrderedLocks } from '../utils/lockManager';
import { getDistributedCacheInvalidation } from './distributedCacheInvalidation';

const logger = getLogger();
import {
  Commit,
  CommitFilterOptions,
  CommitHeatmapData,
  TransactionRollbackError,
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

/**
 * Configuration options for commit cache operations.
 * These filters determine which commits are included in cached results.
 */
export interface CommitCacheOptions {
  /** Skip commits from this specific author */
  author?: string;

  /** Include commits only from these authors (exclusive filter) */
  authors?: string[];

  /** Include commits only after this date (ISO 8601 format) */
  fromDate?: string;

  /** Include commits only before this date (ISO 8601 format) */
  toDate?: string;

  /** Number of commits to skip for pagination */
  skip?: number;

  /** Maximum number of commits to return (pagination limit) */
  limit?: number;
}

/**
 * Comprehensive cache performance and health statistics.
 * Used for monitoring cache efficiency and identifying optimization opportunities.
 */
export interface CacheStats {
  /** Distribution of cached entries across all three tiers */
  entries: {
    rawCommits: number;
    filteredCommits: number;
    aggregatedData: number;
  };

  /** Memory consumption breakdown by cache tier in bytes */
  memoryUsage: {
    rawCommits: number;
    filteredCommits: number;
    aggregatedData: number;
    total: number;
  };

  /** Cache hit efficiency ratios (0.0 to 1.0) for performance analysis */
  hitRatios: {
    rawCommits: number;
    filteredCommits: number;
    aggregatedData: number;
    overall: number;
  };

  /** Operational efficiency metrics for cost-benefit analysis */
  efficiency: {
    /** Number of repository clones prevented through cache coordination */
    duplicateClonesPrevented: number;
    /** Total cache operations performed since startup */
    totalCacheOperations: number;
    /** Average response time for cache hits in milliseconds */
    averageHitTime: number;
    /** Average response time for cache misses in milliseconds */
    averageMissTime: number;
  };

  /** Transactional consistency metrics for reliability monitoring */
  transactions?: {
    started: number;
    committed: number;
    rolledBack: number;
    failed: number;
  };
}

/**
 * Enhanced rollback operation with verification capabilities.
 * Provides comprehensive rollback with retry logic and verification.
 */
interface RollbackOperation {
  /** Function to execute the rollback operation */
  execute: () => Promise<void>;

  /** Function to verify the rollback operation succeeded */
  verify: () => Promise<boolean>;

  /** Human-readable description of the operation for logging */
  description: string;

  /** Cache tier this operation affects */
  cacheType: 'raw' | 'filtered' | 'aggregated';

  /** Cache key being rolled back */
  key: string;
}

/**
 * Atomic transaction context for cache operations.
 * Ensures data consistency across multiple cache tiers by enabling rollback on failures.
 *
 * This prevents partial cache states where some tiers are updated while others fail,
 * which could lead to inconsistent data being served to clients.
 */
interface CacheTransaction {
  /** Unique identifier for tracking transaction lifecycle */
  id: string;

  /** Sequential log of all cache operations performed within this transaction */
  operations: Array<{
    cache: 'raw' | 'filtered' | 'aggregated';
    operation: 'set' | 'del';
    key: string;
    originalValue?: any;
    newValue?: any;
  }>;

  /** Flag indicating if transaction has been committed or rolled back */
  completed: boolean;

  /** Enhanced rollback operations with verification and retry capabilities */
  rollbackOperations: RollbackOperation[];
}

/**
 * Multi-tier repository cache manager with transactional consistency.
 *
 * Implements a three-level caching hierarchy optimized for Git repository data:
 * 1. Raw commits: Direct Git extraction results (50% memory allocation)
 * 2. Filtered commits: Author/date/pagination filtered datasets (30% memory allocation)
 * 3. Aggregated data: Processed visualizations and statistics (20% memory allocation)
 *
 * Key architectural decisions:
 * - Memory allocation prioritizes raw commits as they're most reusable
 * - Ordered locking prevents deadlocks in concurrent cache operations
 * - Transactional consistency ensures cache coherence across tiers
 * - Repository coordination eliminates redundant Git clones
 */
export class RepositoryCacheManager {
  /** Primary cache tier: Raw Git commit data shared across all operations */
  private rawCommitsCache: HybridLRUCache<Commit[]>;

  /** Secondary cache tier: Filtered commit data for specific query patterns */
  private filteredCommitsCache: HybridLRUCache<Commit[]>;

  /** Tertiary cache tier: Aggregated visualization data with lowest memory priority */
  private aggregatedDataCache: HybridLRUCache<CommitHeatmapData>;

  /** Active transaction tracking for ensuring atomic cache updates */
  private activeTransactions = new Map<string, CacheTransaction>();

  /** Repository-to-cache-key mapping for efficient bulk invalidation */
  private cacheKeyPatterns = new Map<string, Set<string>>();

  /**
   * Operational metrics tracking for performance monitoring and optimization.
   * These metrics inform cache tuning decisions and help identify bottlenecks.
   */
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
      /** Tracks cost savings from preventing duplicate repository clones */
      duplicateClonesPrevented: 0,
    },
    /** Transactional integrity monitoring for reliability assurance */
    transactions: {
      started: 0,
      committed: 0,
      rolledBack: 0,
      failed: 0,
    },
  };

  constructor() {
    const baseConfig = config.hybridCache;

    /*
     * Initialize raw commits cache with highest memory allocation.
     * Raw commits are the foundation data that all other cache tiers depend on,
     * so we prioritize their retention to minimize expensive Git operations.
     */
    this.rawCommitsCache = new HybridLRUCache<Commit[]>({
      maxEntries: Math.floor(baseConfig.maxEntries * 0.5), // 50% of total entries
      memoryLimitBytes: Math.floor(baseConfig.memoryLimitBytes * 0.6), // 60% of memory budget
      diskPath: `${baseConfig.diskPath}/raw-commits`,
      lockTimeoutMs: baseConfig.lockTimeoutMs,
      redisConfig: baseConfig.enableRedis
        ? {
            ...baseConfig.redisConfig,
            keyPrefix: `${baseConfig.redisConfig.keyPrefix}raw:`,
          }
        : undefined,
    });

    /*
     * Initialize filtered commits cache with medium allocation.
     * Filtered results have high reuse potential for common query patterns
     * but are less fundamental than raw data.
     */
    this.filteredCommitsCache = new HybridLRUCache<Commit[]>({
      maxEntries: Math.floor(baseConfig.maxEntries * 0.3), // 30% of total entries
      memoryLimitBytes: Math.floor(baseConfig.memoryLimitBytes * 0.25), // 25% of memory budget
      diskPath: `${baseConfig.diskPath}/filtered-commits`,
      lockTimeoutMs: baseConfig.lockTimeoutMs,
      redisConfig: baseConfig.enableRedis
        ? {
            ...baseConfig.redisConfig,
            keyPrefix: `${baseConfig.redisConfig.keyPrefix}filtered:`,
          }
        : undefined,
    });

    /*
     * Initialize aggregated data cache with smallest allocation.
     * Aggregations are computationally expensive but have the lowest reuse rate
     * since they're often specific to particular visualization requests.
     */
    this.aggregatedDataCache = new HybridLRUCache<CommitHeatmapData>({
      maxEntries: Math.floor(baseConfig.maxEntries * 0.2), // 20% of total entries
      memoryLimitBytes: Math.floor(baseConfig.memoryLimitBytes * 0.15), // 15% of memory budget
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

    // Initialize distributed cache invalidation
    if (baseConfig.enableRedis) {
      const distributedCache = getDistributedCacheInvalidation(
        baseConfig.redisConfig
      );

      // Register handler for repository invalidation messages from other processes
      distributedCache.registerInvalidationHandler(
        'repository',
        async (pattern: string, metadata?: any) => {
          if (metadata?.repoUrl) {
            logger.debug('Processing distributed cache invalidation', {
              repoUrl: metadata.repoUrl,
              fromRemoteProcess: true,
            });

            // Call the local invalidation method directly to avoid infinite recursion
            await this.invalidateRepositoryLocal(metadata.repoUrl);
          }
        }
      );
    }
  }

  /**
   * Creates a new cache transaction for atomic multi-tier operations.
   *
   * Transactions ensure that cache updates across multiple tiers either all succeed
   * or all fail, preventing inconsistent cache states that could serve stale data.
   *
   * @param repoUrl - Repository URL for transaction context and logging
   * @returns New transaction instance ready for cache operations
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

    // Record transaction started metric
    recordCacheTransaction('started', 'all', 0);

    logger.debug('Cache transaction created', {
      transactionId: transaction.id,
      repoUrl,
    });

    return transaction;
  }

  /**
   * Commits a cache transaction, finalizing all pending operations.
   *
   * Once committed, the transaction cannot be rolled back. This method should only
   * be called after all cache operations have completed successfully.
   *
   * @param transaction - Transaction to commit
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

    // Record transaction committed metric
    recordCacheTransaction('committed', 'all', transaction.operations.length);

    logger.debug('Cache transaction committed', {
      transactionId: transaction.id,
      operationsCount: transaction.operations.length,
    });
  }

  /**
   * Rolls back a cache transaction with comprehensive verification and retry logic.
   *
   * This enhanced rollback method implements:
   * - Retry logic with exponential backoff for transient failures
   * - Verification of each rollback operation's success
   * - Comprehensive error tracking and alerting
   * - Manual intervention alerts for critical failures
   *
   * @param transaction - Transaction to roll back
   * @throws {TransactionRollbackError} When rollback operations fail after retries
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

    const failedRollbacks: string[] = [];
    const maxAttempts = 3;
    const startTime = Date.now();

    try {
      // Execute rollback operations in reverse order to maintain consistency
      for (const rollbackOp of transaction.rollbackOperations.reverse()) {
        let attempts = 0;
        let operationSucceeded = false;
        const operationStartTime = Date.now();

        while (attempts < maxAttempts && !operationSucceeded) {
          try {
            // Execute the rollback operation
            await rollbackOp.execute();

            // Verify the rollback succeeded
            const verified = await rollbackOp.verify();
            if (verified) {
              operationSucceeded = true;

              // Record successful rollback metrics
              recordTransactionRollback(
                'success',
                rollbackOp.cacheType,
                'set',
                attempts
              );
              recordRollbackVerification(
                rollbackOp.cacheType,
                'success',
                attempts + 1
              );

              logger.debug('Rollback operation succeeded', {
                transactionId: transaction.id,
                operation: rollbackOp.description,
                attempts: attempts + 1,
              });
            } else {
              // Record failed verification
              recordRollbackVerification(
                rollbackOp.cacheType,
                'failed',
                attempts + 1
              );
              throw new Error('Rollback verification failed');
            }
          } catch (error) {
            attempts++;
            const errorMessage =
              error instanceof Error ? error.message : String(error);

            if (attempts >= maxAttempts) {
              // Max attempts reached - mark as failed
              failedRollbacks.push(rollbackOp.description);

              // Record failed rollback metrics
              recordTransactionRollback(
                'failed',
                rollbackOp.cacheType,
                'set',
                attempts
              );

              logger.error('Rollback operation failed after retries', {
                transactionId: transaction.id,
                operation: rollbackOp.description,
                cacheType: rollbackOp.cacheType,
                key: rollbackOp.key,
                attempts: maxAttempts,
                error: errorMessage,
              });
            } else {
              // Record retry attempt
              recordTransactionRollback(
                'retry',
                rollbackOp.cacheType,
                'set',
                attempts
              );

              // Retry with exponential backoff
              const backoffMs = Math.pow(2, attempts) * 100;
              logger.warn('Rollback operation failed, retrying', {
                transactionId: transaction.id,
                operation: rollbackOp.description,
                attempt: attempts,
                maxAttempts,
                retryInMs: backoffMs,
                error: errorMessage,
              });

              await new Promise((resolve) => setTimeout(resolve, backoffMs));
            }
          }
        }

        // Record operation duration
        const operationDuration = Date.now() - operationStartTime;
        recordRollbackDuration(
          operationDuration,
          rollbackOp.cacheType,
          1,
          attempts
        );
      }

      // Check if any rollback operations failed
      if (failedRollbacks.length > 0) {
        // Record critical rollback failure metrics
        recordCriticalRollbackFailure(
          'cache_write',
          failedRollbacks.length,
          'critical'
        );
        recordCacheTransaction(
          'failed',
          'all',
          transaction.rollbackOperations.length
        );

        // Critical situation - trigger manual intervention alert
        logger.error(
          'CRITICAL: Transaction rollback incomplete - Manual intervention required',
          {
            transactionId: transaction.id,
            failedRollbacks,
            operationsCount: transaction.rollbackOperations.length,
            failedCount: failedRollbacks.length,
            requiresManualIntervention: true,
            severity: 'CRITICAL',
          }
        );

        // Update metrics for failed rollback
        this.metrics.transactions.failed++;

        // Throw specific error with detailed information
        throw new TransactionRollbackError(
          `Failed to rollback operations: ${failedRollbacks.join(', ')}`,
          transaction.id,
          failedRollbacks
        );
      }

      // Successful rollback - record metrics
      const totalDuration = Date.now() - startTime;
      recordRollbackDuration(
        totalDuration,
        'all' as any,
        transaction.rollbackOperations.length,
        0
      );
      recordCacheTransaction(
        'rolled_back',
        'all',
        transaction.rollbackOperations.length
      );

      transaction.completed = true;
      this.activeTransactions.delete(transaction.id);
      this.metrics.transactions.rolledBack++;

      logger.info('Cache transaction successfully rolled back', {
        transactionId: transaction.id,
        rollbackOperationsCount: transaction.rollbackOperations.length,
        successfulOperations:
          transaction.rollbackOperations.length - failedRollbacks.length,
        totalDurationMs: totalDuration,
      });
    } catch (error) {
      // Handle any unexpected errors during rollback
      if (error instanceof TransactionRollbackError) {
        // Re-throw our specific error type
        throw error;
      }

      // Unexpected error during rollback process
      const totalDuration = Date.now() - startTime;
      recordRollbackDuration(
        totalDuration,
        'all' as any,
        transaction.rollbackOperations.length,
        0
      );
      recordCacheTransaction(
        'failed',
        'all',
        transaction.rollbackOperations.length
      );

      this.metrics.transactions.failed++;
      logger.error('Unexpected error during transaction rollback', {
        transactionId: transaction.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        totalDurationMs: totalDuration,
      });

      throw new TransactionRollbackError(
        `Unexpected error during transaction rollback: ${error instanceof Error ? error.message : String(error)}`,
        transaction.id
      );
    }
  }

  /**
   * Performs a transactional cache set operation with automatic rollback capability.
   *
   * This method ensures that cache updates can be undone if subsequent operations
   * in the same transaction fail. It tracks both the new value being set and the
   * original value for potential restoration, with verification capabilities.
   *
   * @param cache - Target cache instance to update
   * @param cacheType - Cache tier identifier for transaction logging
   * @param key - Cache key to update
   * @param value - New value to cache
   * @param ttl - Time-to-live in seconds
   * @param transaction - Active transaction context
   */
  private async transactionalSet<T>(
    cache: HybridLRUCache<T>,
    cacheType: 'raw' | 'filtered' | 'aggregated',
    key: string,
    value: T,
    ttl: number,
    transaction: CacheTransaction
  ): Promise<void> {
    // Capture existing value for potential rollback before modification
    let originalValue: T | null = null;
    try {
      originalValue = await cache.get(key);
    } catch {
      // Key doesn't exist - this is expected for new cache entries
    }

    // Perform the actual cache update
    await cache.set(key, value, 'EX', ttl);

    // Record operation in transaction log for audit trail
    transaction.operations.push({
      cache: cacheType,
      operation: 'set',
      key,
      originalValue,
      newValue: value,
    });

    // Prepare enhanced rollback operation with verification
    if (originalValue !== null) {
      // Restore original value if rollback is needed
      const rollbackOp: RollbackOperation = {
        execute: async () => {
          await cache.set(key, originalValue as T, 'EX', ttl);
        },
        verify: async () => {
          try {
            const currentValue = await cache.get(key);
            // Deep comparison for verification
            return (
              JSON.stringify(currentValue) === JSON.stringify(originalValue)
            );
          } catch {
            return false;
          }
        },
        description: `Restore ${cacheType} cache key '${key}' to original value`,
        cacheType,
        key,
      };
      transaction.rollbackOperations.push(rollbackOp);
    } else {
      // Delete the newly created key if rollback is needed
      const rollbackOp: RollbackOperation = {
        execute: async () => {
          await cache.del(key);
        },
        verify: async () => {
          try {
            const value = await cache.get(key);
            return value === null || value === undefined;
          } catch {
            // If get() throws, the key likely doesn't exist, which is what we want
            return true;
          }
        },
        description: `Delete newly created ${cacheType} cache key '${key}'`,
        cacheType,
        key,
      };
      transaction.rollbackOperations.push(rollbackOp);
    }

    // Track cache key for repository-based bulk invalidation
    this.trackCacheKey(key);
  }

  /**
   * Performs a transactional cache delete operation with automatic rollback capability.
   *
   * This method ensures that cache deletions can be undone if subsequent operations
   * in the same transaction fail. It captures the original value before deletion
   * to enable restoration during rollback.
   *
   * @param cache - Target cache instance to update
   * @param cacheType - Cache tier identifier for transaction logging
   * @param key - Cache key to delete
   * @param transaction - Active transaction context
   */
  private async transactionalDel<T>(
    cache: HybridLRUCache<T>,
    cacheType: 'raw' | 'filtered' | 'aggregated',
    key: string,
    transaction: CacheTransaction
  ): Promise<void> {
    // Capture existing value for potential rollback before deletion
    let originalValue: T | null = null;
    let originalTtl: number | null = null;

    try {
      originalValue = await cache.get(key);
      // Note: HybridLRUCache doesn't expose TTL, so we use a default
      // In a real implementation, you might want to extend the cache interface
      originalTtl = 3600; // Default 1 hour TTL
    } catch {
      // Key doesn't exist - nothing to delete
      return;
    }

    // Perform the actual cache deletion
    await cache.del(key);

    // Record operation in transaction log for audit trail
    transaction.operations.push({
      cache: cacheType,
      operation: 'del',
      key,
      originalValue,
      newValue: null,
    });

    // Prepare rollback operation to restore the deleted value
    if (originalValue !== null) {
      const rollbackOp: RollbackOperation = {
        execute: async () => {
          await cache.set(key, originalValue as T, 'EX', originalTtl ?? 3600);
        },
        verify: async () => {
          try {
            const currentValue = await cache.get(key);
            // Deep comparison for verification
            return (
              JSON.stringify(currentValue) === JSON.stringify(originalValue)
            );
          } catch {
            return false;
          }
        },
        description: `Restore deleted ${cacheType} cache key '${key}' with original value`,
        cacheType,
        key,
      };
      transaction.rollbackOperations.push(rollbackOp);
    }
  }

  /**
   * Tracks cache keys by repository for efficient bulk invalidation.
   *
   * When a repository is updated, we need to invalidate all associated cache entries
   * across all tiers. This method maintains the mapping between repository identifiers
   * and their cache keys to enable fast pattern-based clearing.
   *
   * @param key - Cache key to track (must follow expected naming pattern)
   */
  private trackCacheKey(key: string): void {
    // Extract repository URL hash from standardized key pattern
    const regex =
      /^(?:raw_commits|filtered_commits|aggregated_data):([a-f0-9]+)/;
    const match = regex.exec(key);
    if (match) {
      const repoHash = match[1];
      if (!this.cacheKeyPatterns.has(repoHash)) {
        this.cacheKeyPatterns.set(repoHash, new Set());
      }
      this.cacheKeyPatterns.get(repoHash)!.add(key);
    }
  }

  /**
   * Retrieves or parses commits with intelligent cache tier selection.
   *
   * This is the primary entry point for commit data retrieval. It implements a smart
   * caching strategy that chooses the optimal cache tier based on the request type:
   *
   * - Simple requests (no filters): Uses raw commits cache for maximum reusability
   * - Filtered requests: Uses filtered commits cache to avoid repeated processing
   *
   * The method employs ordered locking to prevent deadlocks when multiple operations
   * access the same repository concurrently, and uses transactional consistency to
   * ensure cache coherence across all tiers.
   *
   * @param repoUrl - Git repository URL to analyze
   * @param options - Optional filters for commit selection
   * @returns Promise resolving to array of commits matching the criteria
   *
   * @throws {Error} When Git operations fail or cache corruption is detected
   *
   * @example
   * ```typescript
   * // Get all commits (uses raw cache)
   * const allCommits = await repositoryCache.getOrParseCommits('https://github.com/user/repo.git');
   *
   * // Get filtered commits (uses filtered cache)
   * const recentCommits = await repositoryCache.getOrParseCommits('https://github.com/user/repo.git', {
   *   fromDate: '2024-01-01',
   *   limit: 100
   * });
   * ```
   */
  async getOrParseCommits(
    repoUrl: string,
    options?: CommitCacheOptions
  ): Promise<Commit[]> {
    // Use ordered locks to prevent deadlock between cache operations and repository access
    return withOrderedLocks(
      [`cache-operation:${repoUrl}`, `repo-access:${repoUrl}`],
      async () => {
        const startTime = Date.now();

        // Route filtered requests to specialized cache tier for better hit rates
        if (this.hasSpecificFilters(options)) {
          // Extend lock scope to include filtered cache operations
          return withOrderedLocks(
            [
              `cache-operation:${repoUrl}`,
              `cache-filtered:${repoUrl}`,
              `repo-access:${repoUrl}`,
            ],
            () => this.getOrParseFilteredCommitsUnlocked(repoUrl, options)
          );
        }

        // Attempt to retrieve from raw commits cache (Tier 1)
        const rawKey = this.generateRawCommitsKey(repoUrl);
        let commits: Commit[] | null = null;

        try {
          commits = await this.rawCommitsCache.get(rawKey);
        } catch (error) {
          // Record cache operation failure for system health monitoring
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
          // Cache hit: Update metrics and return cached data immediately
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

          // Track data freshness for cache effectiveness analysis
          const cacheAge = Date.now() - startTime;
          recordDataFreshness('commits', cacheAge);

          logger.debug('Raw commits cache hit', {
            repoUrl,
            commitsCount: commits.length,
            cacheKey: rawKey,
          });

          return commits;
        }

        // Cache miss: Fetch from Git repository and cache the result
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
          /*
           * Use shared repository coordination to prevent duplicate Git clones.
           * Multiple concurrent requests for the same repository will share a single
           * clone operation, significantly reducing I/O overhead and disk usage.
           */
          commits = await withSharedRepository(
            repoUrl,
            async (handle: RepositoryHandle) => {
              logger.info('Fetching raw commits via shared repository', {
                repoUrl,
                commitCount: handle.commitCount,
                sizeCategory: handle.sizeCategory,
                isShared: handle.isShared,
              });

              // Track efficiency gains from repository sharing
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

          // Defensive programming: Ensure we never cache null values
          if (!commits) {
            commits = [];
            logger.warn(
              'gitService.getCommits returned null, using empty array',
              {
                repoUrl,
              }
            );
          }

          // Store the fetched data in cache using transactional consistency
          const ttl = config.cacheStrategy.cacheKeys.rawCommitsTTL;
          await this.transactionalSet(
            this.rawCommitsCache,
            'raw',
            rawKey,
            commits,
            ttl,
            transaction
          );

          // Finalize the transaction - all operations succeeded
          await this.commitTransaction(transaction);

          logger.info('Raw commits cached with transaction', {
            repoUrl,
            commitsCount: commits.length,
            ttl,
            sizeCategory: getRepositorySizeCategory(commits.length),
            transactionId: transaction.id,
          });

          // Update system health metrics with successful operation
          updateServiceHealthScore('cache', {
            cacheHitRate: 1.0,
            errorRate: 0.0,
          });

          return commits;
        } catch (error) {
          // Increment transaction failure counter for monitoring
          this.metrics.transactions.failed++;

          // Record comprehensive error details for debugging and alerting
          recordDetailedError(
            'cache',
            error instanceof Error ? error : new Error(String(error)),
            {
              userImpact: 'degraded',
              recoveryAction: 'retry',
              severity: 'warning',
            }
          );

          // Update system health metrics to reflect the failure
          updateServiceHealthScore('cache', { errorRate: 1.0 });

          // Rollback all cache changes to maintain consistency
          await this.rollbackTransaction(transaction);

          logger.error('Failed to cache raw commits, transaction rolled back', {
            repoUrl,
            transactionId: transaction.id,
            error: error instanceof Error ? error.message : String(error),
          });

          throw error;
        }
      }
    );
  }

  /**
   * Retrieves or generates filtered commits using the specialized filtered cache tier.
   *
   * This method optimizes performance for queries with specific filters (author, date range,
   * pagination) by maintaining a separate cache tier for filtered results. This prevents
   * the need to repeatedly apply the same filters to raw commit data.
   *
   * The implementation uses a two-phase approach:
   * 1. Check filtered cache for exact match of filters
   * 2. If miss, fetch raw commits and apply filters, then cache the result
   *
   * @param repoUrl - Git repository URL
   * @param options - Commit filtering criteria
   * @returns Promise resolving to filtered commit array
   *
   * @internal This method uses specialized locking to prevent deadlocks when called
   * from within other cache operations
   */
  async getOrParseFilteredCommits(
    repoUrl: string,
    options?: CommitCacheOptions
  ): Promise<Commit[]> {
    return withKeyLock(`cache-filtered:${repoUrl}`, async () => {
      const startTime = Date.now();

      // Attempt retrieval from filtered commits cache (Tier 2)
      const filteredKey = this.generateFilteredCommitsKey(repoUrl, options);
      let filteredCommits = await this.filteredCommitsCache.get(filteredKey);

      if (filteredCommits) {
        // Cache hit: Return filtered data immediately
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

        // Track data freshness for filtered cache effectiveness
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

      // Cache miss: Generate filtered data from raw commits
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
        /*
         * Carefully ordered locking prevents deadlocks when this filtered cache
         * operation needs to call the main getOrParseCommits method, which also
         * acquires cache-operation locks.
         */
        const rawCommits = await withOrderedLocks(
          [`cache-filtered:${repoUrl}`, `cache-operation:${repoUrl}`],
          () => this.getOrParseCommitsUnlocked(repoUrl)
        );

        // Apply client-specified filters to raw commit data
        filteredCommits = this.applyFilters(rawCommits, options);

        // Cache the filtered results for future requests with same criteria
        const ttl = config.cacheStrategy.cacheKeys.filteredCommitsTTL;
        await this.transactionalSet(
          this.filteredCommitsCache,
          'filtered',
          filteredKey,
          filteredCommits,
          ttl,
          transaction
        );

        // Commit the transaction after successful caching
        await this.commitTransaction(transaction);

        logger.debug('Filtered commits cached with transaction', {
          repoUrl,
          originalCount: rawCommits?.length ?? 0,
          filteredCount: filteredCommits.length,
          filters: options,
          ttl,
          transactionId: transaction.id,
        });

        // Update system health with successful filtered cache operation
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
   * Retrieves or generates aggregated visualization data using the tertiary cache tier.
   *
   * This method handles the most computationally expensive operations by processing
   * commit data into visualization-ready formats (heatmaps, statistics, charts).
   *
   * The aggregated cache has the smallest memory allocation (15%) since these results
   * are highly specific and have lower reuse rates compared to raw or filtered data.
   * However, caching prevents expensive recomputation of complex aggregations.
   *
   * @param repoUrl - Git repository URL
   * @param filterOptions - Optional filters for data aggregation scope
   * @returns Promise resolving to processed visualization data
   */
  async getOrGenerateAggregatedData(
    repoUrl: string,
    filterOptions?: CommitFilterOptions
  ): Promise<CommitHeatmapData> {
    return withKeyLock(`cache-aggregated:${repoUrl}`, async () => {
      const startTime = Date.now();

      // Attempt retrieval from aggregated data cache (Tier 3)
      const aggregatedKey = this.generateAggregatedDataKey(
        repoUrl,
        filterOptions
      );
      let aggregatedData = await this.aggregatedDataCache.get(aggregatedKey);

      if (aggregatedData) {
        // Cache hit: Return pre-computed visualization data
        this.metrics.operations.aggregatedHits++;
        this.recordHitTime(startTime);
        cacheHits.inc({ operation: 'aggregated_data' });
        recordEnhancedCacheOperation(
          'aggregated_data',
          true,
          undefined,
          repoUrl
        );

        // Track data freshness for aggregated cache monitoring
        const cacheAge = Date.now() - startTime;
        recordDataFreshness('aggregated_data', cacheAge);

        logger.debug('Aggregated data cache hit', {
          repoUrl,
          filters: filterOptions,
          cacheKey: aggregatedKey,
        });

        return aggregatedData;
      }

      // Cache miss: Generate aggregated data from filtered commits
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
        // Convert filter options to commit cache options for consistency
        const commitOptions: CommitCacheOptions = {
          author: filterOptions?.author,
          authors: filterOptions?.authors,
          fromDate: filterOptions?.fromDate,
          toDate: filterOptions?.toDate,
        };

        /*
         * Use ordered locking to prevent deadlocks when accessing filtered cache
         * from within the aggregated cache operation context.
         */
        const commits = await withOrderedLocks(
          [`cache-aggregated:${repoUrl}`, `cache-filtered:${repoUrl}`],
          () => this.getOrParseFilteredCommitsUnlocked(repoUrl, commitOptions)
        );

        // Defensive programming: Handle null commits gracefully
        if (!commits) {
          logger.warn(
            'getOrParseFilteredCommits returned null, using empty array',
            { repoUrl }
          );
          // Generate empty aggregated data structure
          aggregatedData = await gitService.aggregateCommitsByTime(
            [],
            filterOptions
          );
        } else {
          // Generate visualization data from filtered commits
          aggregatedData = await gitService.aggregateCommitsByTime(
            commits,
            filterOptions
          );
        }

        // Cache the computationally expensive aggregated results
        const ttl = config.cacheStrategy.cacheKeys.aggregatedDataTTL;
        await this.transactionalSet(
          this.aggregatedDataCache,
          'aggregated',
          aggregatedKey,
          aggregatedData,
          ttl,
          transaction
        );

        // Finalize the transaction
        await this.commitTransaction(transaction);

        logger.debug('Aggregated data cached with transaction', {
          repoUrl,
          filters: filterOptions,
          dataPoints: aggregatedData.data.length,
          totalCommits: aggregatedData.metadata?.totalCommits ?? 0,
          ttl,
          transactionId: transaction.id,
        });

        // Update system health metrics
        updateServiceHealthScore('cache', {
          cacheHitRate: 1.0,
          errorRate: 0.0,
        });

        return aggregatedData;
      } catch (error) {
        // Track aggregation failure for system monitoring
        this.metrics.transactions.failed++;

        // Record comprehensive error details for debugging complex aggregations
        recordDetailedError(
          'cache',
          error instanceof Error ? error : new Error(String(error)),
          {
            userImpact: 'degraded',
            recoveryAction: 'retry',
            severity: 'warning',
          }
        );

        // Update system health metrics
        updateServiceHealthScore('cache', { errorRate: 1.0 });

        // Rollback transaction to maintain cache consistency
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
   * Performs comprehensive cache invalidation across all tiers for a repository.
   *
   * When repository data changes (new commits, branch updates), all cached data
   * becomes stale and must be purged. This method uses pattern-based invalidation
   * to efficiently remove all related cache entries without scanning entire caches.
   *
   * The method invalidates:
   * - Raw commits cache entries
   * - All filtered variations (author, date, pagination filters)
   * - All aggregated visualizations derived from the repository
   *
   * @param repoUrl - Repository URL to invalidate
   *
   * Performance note: Uses tracked key patterns for O(1) invalidation rather than
   * expensive cache scanning operations.
   */
  async invalidateRepository(repoUrl: string): Promise<void> {
    // First, perform local invalidation
    await this.invalidateRepositoryLocal(repoUrl);

    // Then, broadcast to other process instances if distributed cache is enabled
    if (config.hybridCache.enableRedis) {
      try {
        const distributedCache = getDistributedCacheInvalidation();
        await distributedCache.invalidateGlobally('repository', {
          repoUrl,
          reason: 'repository_update',
          keysCount: (
            this.cacheKeyPatterns.get(this.hashUrl(repoUrl)) ?? new Set()
          ).size,
        });
      } catch (err) {
        logger.warn('Failed to broadcast distributed cache invalidation', {
          repoUrl,
          err: err instanceof Error ? err.message : String(err),
        });
        // Continue - local invalidation was successful
      }
    }
  }

  /**
   * Performs local cache invalidation without broadcasting to other processes.
   * Used internally by the distributed cache invalidation system.
   */
  private async invalidateRepositoryLocal(repoUrl: string): Promise<void> {
    return withKeyLock(`cache-invalidate:${repoUrl}`, async () => {
      logger.info('Starting local repository cache invalidation', {
        repoUrl,
      });

      const repoHash = this.hashUrl(repoUrl);
      const keysToInvalidate = this.cacheKeyPatterns.get(repoHash) ?? new Set();

      const operations: Promise<void>[] = [];

      // Invalidate all tracked keys for this repository across all cache tiers
      for (const key of keysToInvalidate) {
        if (key.startsWith('raw_commits:')) {
          operations.push(this.rawCommitsCache.del(key));
        } else if (key.startsWith('filtered_commits:')) {
          operations.push(this.filteredCommitsCache.del(key));
        } else if (key.startsWith('aggregated_data:')) {
          operations.push(this.aggregatedDataCache.del(key));
        }
      }

      /*
       * Also invalidate common base patterns in case key tracking missed some entries.
       * This provides a safety net for edge cases where keys weren't properly tracked.
       */
      const baseKeys = [
        this.generateRawCommitsKey(repoUrl),
        // Common filtered cache patterns
        this.generateFilteredCommitsKey(repoUrl, {}),
        this.generateFilteredCommitsKey(repoUrl, { skip: 0, limit: 100 }),
        // Common aggregated cache patterns
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

      // Execute all invalidation operations concurrently for performance
      const results = await Promise.allSettled(operations);

      // Analyze results and provide comprehensive reporting
      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      // Clean up key pattern tracking for this repository
      this.cacheKeyPatterns.delete(repoHash);

      if (failed > 0) {
        const failedOperations = results
          .filter((r) => r.status === 'rejected')
          .map((r) => (r as PromiseRejectedResult).reason);

        logger.error('Failed to invalidate repository cache locally', {
          repoUrl,
          error: failedOperations[0]?.message ?? 'Cache deletion failed',
          failedCount: failed,
          totalOperations: operations.length,
        });
      } else {
        logger.info('Repository cache invalidated locally across all tiers', {
          repoUrl,
          keysInvalidated: successful,
          totalOperations: operations.length,
        });
      }
    });
  }

  /**
   * Retrieves comprehensive cache statistics for monitoring and optimization.
   *
   * Provides detailed insights into cache performance across all three tiers,
   * including hit/miss ratios, memory usage, and transaction success rates.
   * This data is essential for:
   *
   * - Performance tuning and capacity planning
   * - Identifying cache effectiveness by tier
   * - Monitoring transaction consistency and system health
   * - Detecting memory pressure and optimization opportunities
   *
   * @returns Comprehensive cache statistics and metrics
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
   * Gracefully shuts down all cache tiers and cleans up active transactions.
   *
   * This method ensures system integrity during shutdown by:
   * - Rolling back any active transactions to prevent partial cache states
   * - Properly closing all cache tier connections (memory, disk, Redis)
   * - Logging any issues for post-shutdown analysis
   *
   * Should be called during application shutdown to prevent resource leaks.
   */
  async shutdown(): Promise<void> {
    // Clean up any pending transactions to prevent data inconsistency
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

    // Also shutdown distributed cache invalidation if enabled
    if (config.hybridCache.enableRedis) {
      try {
        const { shutdownDistributedCacheInvalidation } = await import(
          './distributedCacheInvalidation'
        );
        operations.push(shutdownDistributedCacheInvalidation());
      } catch (err) {
        logger.warn('Failed to shutdown distributed cache invalidation', {
          err,
        });
      }
    }

    const results = await Promise.allSettled(operations);
    const failed = results.filter((r) => r.status === 'rejected').length;

    if (failed > 0) {
      const errors = results
        .filter((r) => r.status === 'rejected')
        .map((r) => (r as PromiseRejectedResult).reason);

      logger.error('Error during RepositoryCacheManager shutdown', {
        error: errors[0]?.message ?? 'Shutdown failed',
        failedShutdowns: failed,
      });
    }

    logger.info('RepositoryCacheManager shutdown completed');
  }

  /**
   * Private helper methods for cache key generation and data processing.
   * These methods handle the internal mechanics of cache operations.
   */

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
    const filterHash = this.hashObject(filterOptions ?? {});
    const key = `aggregated_data:${this.hashUrl(repoUrl)}:${filterHash}`;
    this.trackCacheKey(key);
    return key;
  }

  /** Generates stable 16-character hash for repository URLs */
  private hashUrl(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
  }

  /** Generates stable 8-character hash for filter option objects */
  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return crypto.createHash('md5').update(str).digest('hex').slice(0, 8);
  }

  /** Determines if request has specific filters requiring filtered cache tier */
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

  /**
   * Applies client-specified filters to commit arrays with robust error handling.
   *
   * Supports multiple filter types:
   * - Author filtering (name or email matching)
   * - Date range filtering (from/to dates)
   * - Pagination (skip/limit)
   *
   * @param commits - Source commit array (handles null gracefully)
   * @param options - Filter criteria to apply
   * @returns Filtered commit array
   */
  private applyFilters(
    commits: Commit[] | null,
    options?: CommitCacheOptions
  ): Commit[] {
    // Defensive programming: Handle null input gracefully
    if (!commits) {
      logger.warn('applyFilters received null commits, returning empty array');
      return [];
    }

    let filtered = commits;

    // Apply author-based filtering (supports both name and email matching)
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

    // Apply date range filtering with robust date parsing
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

    // Apply pagination controls
    if (options?.skip !== undefined) {
      filtered = filtered.slice(options.skip);
    }

    if (options?.limit !== undefined) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /** Calculates cache hit ratio for performance monitoring */
  private calculateHitRatio(hits: number, misses: number): number {
    const total = hits + misses;
    return total > 0 ? hits / total : 0;
  }

  /** Records timing metrics for cache hit operations */
  private recordHitTime(startTime: number): void {
    const duration = Date.now() - startTime;
    this.metrics.performance.totalHitTime += duration;
    this.metrics.performance.operationCount++;
  }

  /** Records timing metrics for cache miss operations */
  private recordMissTime(startTime: number): void {
    const duration = Date.now() - startTime;
    this.metrics.performance.totalMissTime += duration;
    this.metrics.performance.operationCount++;
  }

  /**
   * Internal raw commits retrieval without external locking.
   *
   * This method is used within ordered lock contexts to prevent deadlocks.
   * It implements the same caching logic as the public method but assumes
   * appropriate locks are already held by the caller.
   *
   * @param repoUrl - Repository URL to fetch commits for
   * @returns Promise resolving to commit array
   * @internal
   */
  async getOrParseCommitsUnlocked(repoUrl: string): Promise<Commit[]> {
    const startTime = Date.now();

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
      // Note: This will use the repo-access lock that's already acquired through withOrderedLocks
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
              totalPrevented: this.metrics.efficiency.duplicateClonesPrevented,
            });
          }

          return gitService.getCommits(handle.localPath);
        }
      );

      // Ensure commits is never null
      if (!commits) {
        commits = [];
        logger.warn('gitService.getCommits returned null, using empty array', {
          repoUrl,
        });
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
  }

  /**
   * Internal filtered commits retrieval without external locking.
   *
   * Used within ordered lock contexts where the filtered cache lock is already
   * held. This prevents lock recursion and deadlock scenarios when filtered
   * operations need to access raw commit data.
   *
   * @param repoUrl - Repository URL
   * @param options - Filtering options
   * @returns Promise resolving to filtered commit array
   * @internal
   */
  async getOrParseFilteredCommitsUnlocked(
    repoUrl: string,
    options?: CommitCacheOptions
  ): Promise<Commit[]> {
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
    recordEnhancedCacheOperation('filtered_commits', false, undefined, repoUrl);

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
      // Get raw commits (use unlocked version since we're already locked)
      const rawCommits = await this.getOrParseCommitsUnlocked(repoUrl);

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
        originalCount: rawCommits?.length ?? 0,
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
  }
}

/**
 * Singleton instance of the repository cache manager.
 * Provides centralized caching for all Git repository operations in the application.
 */
export const repositoryCache = new RepositoryCacheManager();

/**
 * High-level helper functions for easy cache integration.
 * These functions provide a simplified interface to the cache while maintaining
 * all the sophisticated caching, transaction, and error handling logic internally.
 */

/**
 * Retrieves commits for a repository with optional filtering.
 *
 * This is the primary function for accessing cached commit data. It automatically
 * handles cache tier selection, transaction consistency, and error recovery.
 *
 * @param repoUrl - Git repository URL
 * @param options - Optional commit filtering criteria
 * @returns Promise resolving to array of commits
 */
export async function getCachedCommits(
  repoUrl: string,
  options?: CommitCacheOptions
): Promise<Commit[]> {
  return repositoryCache.getOrParseCommits(repoUrl, options);
}

/**
 * Retrieves aggregated visualization data for a repository.
 *
 * Returns processed data suitable for charts, heatmaps, and other visualizations.
 * Results are cached to avoid expensive recomputation of aggregations.
 *
 * @param repoUrl - Git repository URL
 * @param filterOptions - Optional filters for aggregation scope
 * @returns Promise resolving to visualization-ready data
 */
export async function getCachedAggregatedData(
  repoUrl: string,
  filterOptions?: CommitFilterOptions
): Promise<CommitHeatmapData> {
  return repositoryCache.getOrGenerateAggregatedData(repoUrl, filterOptions);
}

/**
 * Invalidates all cached data for a repository.
 *
 * Should be called when repository data changes (new commits, rebases, etc.)
 * to ensure clients receive fresh data on subsequent requests.
 *
 * @param repoUrl - Repository URL to invalidate
 */
export async function invalidateCachedRepository(
  repoUrl: string
): Promise<void> {
  return repositoryCache.invalidateRepository(repoUrl);
}

/**
 * Retrieves comprehensive cache performance statistics.
 *
 * Provides insights into cache effectiveness, memory usage, and system health
 * for monitoring and optimization purposes.
 *
 * @returns Current cache statistics across all tiers
 */
export function getRepositoryCacheStats(): CacheStats {
  return repositoryCache.getCacheStats();
}
