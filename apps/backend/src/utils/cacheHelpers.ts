import type HybridLRUCache from './hybridLruCache';
import type { Logger } from 'winston';
import {
  recordDetailedError,
  updateServiceHealthScore,
} from '../services/metrics';

/**
 * Cache operation context for error handling.
 */
export interface CacheOperationContext {
  operation: string;
  key: string;
  repoUrl?: string;
}

/**
 * Cache transaction interface matching repositoryCache.ts
 */
export interface CacheTransaction {
  id: string;
  operations: Array<{
    type: 'set' | 'delete';
    cache: HybridLRUCache<any>;
    key: string;
    previousValue?: any;
  }>;
}

/**
 * Safely retrieves a value from cache with standardized error handling.
 *
 * This helper wraps cache.get() operations with consistent error recording,
 * logging, and null fallback behavior. It ensures that cache failures don't
 * crash the application and are properly tracked for monitoring.
 *
 * @param cache - The HybridLRUCache instance to retrieve from
 * @param key - Cache key to retrieve
 * @param logger - Winston logger for error logging
 * @param context - Optional context for enhanced error messages
 * @returns Cached value or null if not found or error occurred
 *
 * @example
 * const commits = await safeCacheGet(
 *   rawCommitsCache,
 *   'raw_commits:abc123',
 *   logger,
 *   { operation: 'get', key: rawKey, repoUrl }
 * );
 */
export async function safeCacheGet<T>(
  cache: HybridLRUCache<T>,
  key: string,
  logger: Logger,
  context?: Partial<CacheOperationContext>
): Promise<T | null> {
  try {
    return await cache.get(key);
  } catch (error) {
    // Record detailed error for system health monitoring
    recordDetailedError(
      'cache',
      error instanceof Error ? error : new Error(String(error)),
      {
        userImpact: 'degraded',
        recoveryAction: 'fallback',
        severity: 'warning',
      }
    );

    // Log error with full context for debugging
    logger.error('Cache operation failed', {
      operation: context?.operation || 'get',
      key: context?.key || key,
      repoUrl: context?.repoUrl,
      error: error instanceof Error ? error.message : String(error),
    });

    // Return null to indicate cache miss (graceful degradation)
    return null;
  }
}

/**
 * Transaction error handler context.
 */
export interface TransactionErrorContext {
  repoUrl: string;
  operation: string;
  transactionId: string;
}

/**
 * Metrics interface for transaction failures (matches repositoryCache.ts)
 */
export interface TransactionMetrics {
  transactions: {
    failed: number;
  };
}

/**
 * Standardized transaction error handler with rollback and metrics.
 *
 * This helper provides consistent error handling for cache transaction failures,
 * including metrics tracking, error recording, health score updates, transaction
 * rollback, and structured logging. It ensures all transaction errors are handled
 * uniformly across the codebase.
 *
 * @param transaction - Cache transaction to roll back
 * @param error - The error that occurred
 * @param metrics - Metrics object to update failure counter
 * @param logger - Winston logger for error logging
 * @param context - Transaction context (repoUrl, operation, transactionId)
 * @param rollbackFn - Function to perform transaction rollback
 * @returns Never (always rethrows the error after handling)
 *
 * @example
 * catch (error) {
 *   await handleTransactionError(
 *     transaction,
 *     error,
 *     this.metrics,
 *     logger,
 *     { repoUrl, operation: 'cache_filtered', transactionId: transaction.id },
 *     async (tx) => await this.rollbackTransaction(tx)
 *   );
 * }
 */
export async function handleTransactionError(
  transaction: CacheTransaction,
  error: unknown,
  metrics: TransactionMetrics,
  logger: Logger,
  context: TransactionErrorContext,
  rollbackFn: (tx: CacheTransaction) => Promise<void>
): Promise<never> {
  // Increment failure counter for metrics tracking
  metrics.transactions.failed++;

  // Record comprehensive error details for enhanced metrics
  recordDetailedError(
    'cache',
    error instanceof Error ? error : new Error(String(error)),
    {
      userImpact: 'degraded',
      recoveryAction: 'retry',
      severity: 'warning',
    }
  );

  // Update system health score to reflect cache errors
  updateServiceHealthScore('cache', { errorRate: 1 });

  // Rollback transaction to maintain cache consistency
  await rollbackFn(transaction);

  // Log error with full transaction context
  logger.error(`Failed to ${context.operation}, transaction rolled back`, {
    repoUrl: context.repoUrl,
    transactionId: context.transactionId,
    error: error instanceof Error ? error.message : String(error),
  });

  // Rethrow error to propagate to caller
  throw error;
}
