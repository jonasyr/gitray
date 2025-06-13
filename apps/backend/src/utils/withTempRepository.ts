// apps/backend/src/utils/withTempRepository.ts - ENHANCED VERSION

import { gitService } from '../services/gitService';
import { scheduleCleanup } from './cleanupScheduler';
import { withKeyLock } from './lockManager';
import {
  recordStreamingStart,
  recordStreamingCompletion,
  recordStreamingError,
  getRepositorySizeCategory,
} from '../services/metrics';
import logger from '../services/logger';
import { config } from '../config';
import {
  repositoryCoordinator,
  withSharedRepository,
  coordinatedOperation,
  type RepositoryHandle,
} from '../services/repositoryCoordinator';

/**
 * ENHANCED: Helper that uses shared repositories to prevent duplicate clones
 *
 * NEW FEATURES:
 * - Automatic operation coordination and coalescing
 * - Shared repository handles with reference counting
 * - Intelligent metrics collection
 * - Memory-aware operation handling
 */

export interface RepositoryOperationOptions {
  /** Allow this operation to be coalesced with identical operations */
  allowCoalescing?: boolean;

  /** Skip metrics collection for this operation */
  skipMetrics?: boolean;

  /** Operation type for coordination and logging */
  operationType?: string;

  /** Expected repository size for optimization */
  estimatedCommits?: number;

  /** Force use of legacy temp repository (bypass coordination) */
  forceLegacy?: boolean;
}

/**
 * Enhanced version that uses shared repositories and operation coordination
 */
export async function withTempRepository<T>(
  repoUrl: string,
  callback: (tempDir: string) => Promise<T>,
  options?: RepositoryOperationOptions
): Promise<T> {
  // Check if repository coordination is enabled
  if (!config.repositoryCache?.enabled || options?.forceLegacy) {
    return withTempRepositoryLegacy(repoUrl, callback, options);
  }

  const operationType = options?.operationType || 'generic';
  const allowCoalescing = options?.allowCoalescing ?? true;
  const shouldCollectMetrics =
    !options?.skipMetrics && config.streaming.enabled;

  let streamingMetricsStarted = false;
  let repositoryCommitCount = 0;
  const operationStartTime = Date.now();

  return coordinatedOperation(
    repoUrl,
    operationType,
    async () => {
      return withSharedRepository(repoUrl, async (handle: RepositoryHandle) => {
        repositoryCommitCount = handle.commitCount;

        // STREAMING METRICS: Check if this will be a large repository operation
        if (
          shouldCollectMetrics &&
          repositoryCommitCount > config.streaming.commitThreshold
        ) {
          recordStreamingStart(repositoryCommitCount);
          streamingMetricsStarted = true;

          logger.info('Started coordinated streaming operation', {
            repoUrl,
            operationType,
            commitCount: repositoryCommitCount,
            category: handle.sizeCategory,
            isShared: handle.isShared,
            refCount: handle.refCount,
          });
        }

        try {
          // Execute the callback with the shared temp directory
          const result = await callback(handle.localPath);

          // STREAMING METRICS: Record successful completion
          if (streamingMetricsStarted) {
            const operationDuration = Date.now() - operationStartTime;

            recordStreamingCompletion(
              repositoryCommitCount,
              operationDuration,
              repositoryCommitCount, // Assuming full processing
              Math.ceil(repositoryCommitCount / config.streaming.batchSize),
              0.6, // Higher cache hit rate expected with coordination
              process.memoryUsage().heapUsed / 1024 / 1024
            );

            logger.info('Completed coordinated streaming operation', {
              repoUrl,
              operationType,
              duration: operationDuration,
              commitCount: repositoryCommitCount,
            });
          }

          return result;
        } catch (error) {
          // STREAMING METRICS: Record error if we started tracking
          if (streamingMetricsStarted) {
            const errorType =
              error instanceof Error ? error.constructor.name : 'UnknownError';
            const isRecoverable = false; // Most errors are not recoverable

            recordStreamingError(
              errorType,
              isRecoverable,
              repositoryCommitCount
            );

            logger.error('Coordinated streaming operation failed', {
              repoUrl,
              operationType,
              error: error instanceof Error ? error.message : String(error),
              commitCount: repositoryCommitCount,
              errorType,
            });
          }

          throw error;
        }
      });
    },
    { allowCoalescing }
  );
}

/**
 * Enhanced version specifically for streaming operations with detailed coordination
 */
export async function withTempRepositoryStreaming<T>(
  repoUrl: string,
  callback: (tempDir: string, commitCount: number) => Promise<T>,
  options?: RepositoryOperationOptions & {
    streamingOptions?: {
      batchSize?: number;
      maxCommits?: number;
    };
  }
): Promise<T> {
  // Always use coordination for streaming operations
  if (!config.repositoryCache?.enabled) {
    logger.warn(
      'Repository coordination disabled, falling back to legacy streaming',
      { repoUrl }
    );
    return withTempRepositoryStreamingLegacy(repoUrl, callback, options);
  }

  const operationType = options?.operationType || 'streaming';
  const shouldCollectMetrics =
    !options?.skipMetrics && config.streaming.enabled;
  const operationStartTime = Date.now();

  return coordinatedOperation(
    repoUrl,
    `${operationType}:streaming`,
    async () => {
      return withSharedRepository(repoUrl, async (handle: RepositoryHandle) => {
        const repositoryCommitCount = handle.commitCount;

        if (
          shouldCollectMetrics &&
          repositoryCommitCount > config.streaming.commitThreshold
        ) {
          recordStreamingStart(repositoryCommitCount);

          logger.info('Started enhanced coordinated streaming operation', {
            repoUrl,
            operationType,
            commitCount: repositoryCommitCount,
            category: handle.sizeCategory,
            streamingThreshold: config.streaming.commitThreshold,
            isShared: handle.isShared,
            refCount: handle.refCount,
          });
        }

        try {
          // Execute callback with temp directory and commit count
          const result = await callback(
            handle.localPath,
            repositoryCommitCount
          );

          // Record successful completion
          if (
            shouldCollectMetrics &&
            repositoryCommitCount > config.streaming.commitThreshold
          ) {
            const operationDuration = Date.now() - operationStartTime;

            recordStreamingCompletion(
              repositoryCommitCount,
              operationDuration,
              repositoryCommitCount,
              Math.ceil(
                repositoryCommitCount /
                  (options?.streamingOptions?.batchSize ||
                    config.streaming.batchSize)
              ),
              0.7, // Even higher cache hit rate expected for coordinated streaming
              process.memoryUsage().heapUsed / 1024 / 1024
            );

            logger.info('Completed enhanced coordinated streaming operation', {
              repoUrl,
              operationType,
              duration: operationDuration,
              commitCount: repositoryCommitCount,
            });
          }

          return result;
        } catch (error) {
          // Record error metrics
          if (
            shouldCollectMetrics &&
            repositoryCommitCount > config.streaming.commitThreshold
          ) {
            const errorType =
              error instanceof Error ? error.constructor.name : 'UnknownError';
            recordStreamingError(errorType, false, repositoryCommitCount);
          }

          throw error;
        }
      });
    },
    { allowCoalescing: options?.allowCoalescing ?? true }
  );
}

/**
 * Get repository information using shared coordination
 */
export async function getRepositoryInfo(repoUrl: string): Promise<{
  commitCount: number;
  shouldUseStreaming: boolean;
  estimatedProcessingTime: number;
  recommendedBatchSize: number;
  sizeCategory: string;
  isShared: boolean;
  cached: boolean;
}> {
  if (!config.repositoryCache?.enabled) {
    return getRepositoryInfoLegacy(repoUrl);
  }

  return coordinatedOperation(
    repoUrl,
    'repository-info',
    async () => {
      return withSharedRepository(repoUrl, async (handle: RepositoryHandle) => {
        const shouldUseStreaming =
          config.streaming.enabled &&
          handle.commitCount > config.streaming.commitThreshold;

        // Simple heuristic for estimated processing time
        const estimatedTimePerCommit = shouldUseStreaming ? 0.0005 : 0.001; // Faster with coordination
        const estimatedProcessingTime =
          handle.commitCount * estimatedTimePerCommit;

        // Recommended batch size based on repository size and coordination
        let recommendedBatchSize = config.streaming.batchSize;
        if (handle.commitCount > 500000) {
          recommendedBatchSize = Math.min(2000, config.streaming.batchSize * 2);
        } else if (handle.commitCount < 10000) {
          recommendedBatchSize = Math.max(500, config.streaming.batchSize / 2);
        }

        logger.info('Repository information gathered via coordination', {
          repoUrl,
          commitCount: handle.commitCount,
          shouldUseStreaming,
          estimatedProcessingTime,
          recommendedBatchSize,
          sizeCategory: handle.sizeCategory,
          isShared: handle.isShared,
          refCount: handle.refCount,
        });

        return {
          commitCount: handle.commitCount,
          shouldUseStreaming,
          estimatedProcessingTime,
          recommendedBatchSize,
          sizeCategory: handle.sizeCategory,
          isShared: handle.isShared,
          cached: true, // Always cached when using coordination
        };
      });
    },
    { allowCoalescing: true }
  );
}

/**
 * Invalidate a repository from the coordination cache
 */
export async function invalidateRepositoryCache(
  repoUrl: string
): Promise<void> {
  if (config.repositoryCache?.enabled) {
    await repositoryCoordinator.invalidateRepository(repoUrl);
    logger.info('Repository cache invalidated', { repoUrl });
  }
}

/**
 * Get coordination metrics for monitoring
 */
export function getCoordinationMetrics() {
  if (!config.repositoryCache?.enabled) {
    return null;
  }

  return repositoryCoordinator.getMetrics();
}

/**
 * Get status of all cached repositories
 */
export function getRepositoryStatus() {
  if (!config.repositoryCache?.enabled) {
    return [];
  }

  return repositoryCoordinator.getRepositoryStatus();
}

// ========================================================================
// LEGACY IMPLEMENTATIONS (fallback when coordination is disabled)
// ========================================================================

/**
 * Legacy implementation (original withTempRepository)
 */
async function withTempRepositoryLegacy<T>(
  repoUrl: string,
  callback: (tempDir: string) => Promise<T>,
  options?: RepositoryOperationOptions
): Promise<T> {
  let tempDir: string | undefined;
  let streamingMetricsStarted = false;
  let repositoryCommitCount = 0;
  const operationStartTime = Date.now();

  try {
    return await withKeyLock(repoUrl, async () => {
      // Clone the repository and forward the temp directory to the callback
      tempDir = await gitService.cloneRepository(repoUrl);

      // STREAMING METRICS: Check if this will be a large repository operation
      try {
        if (!options?.skipMetrics && config.streaming.enabled) {
          repositoryCommitCount = await gitService.getCommitCount(tempDir);
          const shouldUseStreaming =
            repositoryCommitCount > config.streaming.commitThreshold;

          if (shouldUseStreaming) {
            recordStreamingStart(repositoryCommitCount);
            streamingMetricsStarted = true;

            logger.info('Started legacy streaming metrics tracking', {
              repoUrl,
              commitCount: repositoryCommitCount,
              category: getRepositorySizeCategory(repositoryCommitCount),
            });
          }
        }
      } catch (countError) {
        logger.warn('Failed to get commit count for legacy metrics', {
          error: countError,
          repoUrl,
        });
      }

      // Execute the callback with the temp directory
      const result = await callback(tempDir);

      // STREAMING METRICS: Record successful completion if we started tracking
      if (streamingMetricsStarted) {
        const operationDuration = Date.now() - operationStartTime;

        recordStreamingCompletion(
          repositoryCommitCount,
          operationDuration,
          repositoryCommitCount,
          Math.ceil(repositoryCommitCount / config.streaming.batchSize),
          0.3, // Lower cache hit rate expected with legacy implementation
          process.memoryUsage().heapUsed / 1024 / 1024
        );

        logger.info('Completed legacy streaming metrics tracking', {
          repoUrl,
          duration: operationDuration,
          commitCount: repositoryCommitCount,
        });
      }

      return result;
    });
  } catch (error) {
    // STREAMING METRICS: Record error if we started tracking
    if (streamingMetricsStarted) {
      const errorType =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      recordStreamingError(errorType, false, repositoryCommitCount);
    }

    throw error;
  } finally {
    if (tempDir) {
      // Ensure cleanup even if the callback throws
      scheduleCleanup(tempDir);
    }
  }
}

/**
 * Legacy streaming implementation
 */
async function withTempRepositoryStreamingLegacy<T>(
  repoUrl: string,
  callback: (tempDir: string, commitCount: number) => Promise<T>,
  options?: RepositoryOperationOptions
): Promise<T> {
  let tempDir: string | undefined;
  let repositoryCommitCount = 0;
  const operationStartTime = Date.now();
  const shouldCollectMetrics =
    !options?.skipMetrics && config.streaming.enabled;

  try {
    return await withKeyLock(repoUrl, async () => {
      // Clone the repository
      tempDir = await gitService.cloneRepository(repoUrl);

      // Get commit count for metrics and callback
      try {
        repositoryCommitCount =
          options?.estimatedCommits ||
          (await gitService.getCommitCount(tempDir));

        if (
          shouldCollectMetrics &&
          repositoryCommitCount > config.streaming.commitThreshold
        ) {
          recordStreamingStart(repositoryCommitCount);

          logger.info('Started legacy enhanced streaming operation', {
            repoUrl,
            commitCount: repositoryCommitCount,
            category: getRepositorySizeCategory(repositoryCommitCount),
            streamingThreshold: config.streaming.commitThreshold,
          });
        }
      } catch (countError) {
        logger.warn(
          'Failed to get commit count for legacy enhanced operation',
          {
            error: countError,
            repoUrl,
          }
        );
        repositoryCommitCount = 0;
      }

      // Execute callback with temp directory and commit count
      const result = await callback(tempDir, repositoryCommitCount);

      // Record successful completion
      if (
        shouldCollectMetrics &&
        repositoryCommitCount > config.streaming.commitThreshold
      ) {
        const operationDuration = Date.now() - operationStartTime;

        recordStreamingCompletion(
          repositoryCommitCount,
          operationDuration,
          repositoryCommitCount,
          Math.ceil(repositoryCommitCount / config.streaming.batchSize),
          0.3, // Lower cache hit rate for legacy
          process.memoryUsage().heapUsed / 1024 / 1024
        );

        logger.info('Completed legacy enhanced streaming operation', {
          repoUrl,
          duration: operationDuration,
          commitCount: repositoryCommitCount,
        });
      }

      return result;
    });
  } catch (error) {
    // Record error metrics
    if (
      shouldCollectMetrics &&
      repositoryCommitCount > config.streaming.commitThreshold
    ) {
      const errorType =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      recordStreamingError(errorType, false, repositoryCommitCount);
    }

    throw error;
  } finally {
    if (tempDir) {
      scheduleCleanup(tempDir);
    }
  }
}

/**
 * Legacy repository info implementation
 */
async function getRepositoryInfoLegacy(repoUrl: string): Promise<{
  commitCount: number;
  shouldUseStreaming: boolean;
  estimatedProcessingTime: number;
  recommendedBatchSize: number;
  sizeCategory: string;
  isShared: boolean;
  cached: boolean;
}> {
  return withTempRepositoryLegacy(
    repoUrl,
    async (tempDir) => {
      const commitCount = await gitService.getCommitCount(tempDir);
      const shouldUseStreaming =
        config.streaming.enabled &&
        commitCount > config.streaming.commitThreshold;

      // Simple heuristic for estimated processing time
      const estimatedTimePerCommit = shouldUseStreaming ? 0.001 : 0.002;
      const estimatedProcessingTime = commitCount * estimatedTimePerCommit;

      // Recommended batch size based on repository size
      let recommendedBatchSize = config.streaming.batchSize;
      if (commitCount > 500000) {
        recommendedBatchSize = Math.min(2000, config.streaming.batchSize * 2);
      } else if (commitCount < 10000) {
        recommendedBatchSize = Math.max(500, config.streaming.batchSize / 2);
      }

      const sizeCategory = getRepositorySizeCategory(commitCount);

      logger.info('Repository information gathered via legacy method', {
        repoUrl,
        commitCount,
        shouldUseStreaming,
        estimatedProcessingTime,
        recommendedBatchSize,
        sizeCategory,
      });

      return {
        commitCount,
        shouldUseStreaming,
        estimatedProcessingTime,
        recommendedBatchSize,
        sizeCategory,
        isShared: false,
        cached: false,
      };
    },
    { operationType: 'repository-info-legacy' }
  );
}
