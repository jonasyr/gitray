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

/**
 * ENHANCED: Helper that clones a repository, runs a callback, then schedules cleanup
 * Now includes streaming metrics and intelligent operation detection
 */
export async function withTempRepository<T>(
  repoUrl: string,
  callback: (tempDir: string) => Promise<T>
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
        if (config.streaming.enabled) {
          repositoryCommitCount = await gitService.getCommitCount(tempDir);
          const shouldUseStreaming =
            repositoryCommitCount > config.streaming.commitThreshold;

          if (shouldUseStreaming) {
            recordStreamingStart(repositoryCommitCount);
            streamingMetricsStarted = true;
            logger.info('Started streaming metrics tracking', {
              repoUrl,
              commitCount: repositoryCommitCount,
              category: getRepositorySizeCategory(repositoryCommitCount),
            });
          }
        }
      } catch (countError) {
        logger.warn(
          'Failed to get commit count for metrics, proceeding without streaming metrics',
          {
            error: countError,
            repoUrl,
          }
        );
      }

      // Execute the callback with the temp directory
      const result = await callback(tempDir);

      // STREAMING METRICS: Record successful completion if we started tracking
      if (streamingMetricsStarted) {
        const operationDuration = Date.now() - operationStartTime;

        // For metrics, we assume the operation processed all commits
        // In reality, this depends on what the callback does, but this gives us a baseline
        recordStreamingCompletion(
          repositoryCommitCount,
          operationDuration,
          repositoryCommitCount, // Assuming full processing
          Math.ceil(repositoryCommitCount / config.streaming.batchSize), // Estimated batches
          0.5, // Default cache hit rate estimate (actual rate tracked in gitService)
          process.memoryUsage().heapUsed / 1024 / 1024 // Current memory usage in MB
        );

        logger.info('Completed streaming metrics tracking', {
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
      const isRecoverable = false; // Most errors in withTempRepository are not recoverable

      recordStreamingError(errorType, isRecoverable, repositoryCommitCount);

      logger.error('Streaming operation failed', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
        commitCount: repositoryCommitCount,
        errorType,
      });
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
 * NEW: Enhanced version specifically for streaming operations
 * Provides more detailed metrics and monitoring capabilities
 */
export async function withTempRepositoryStreaming<T>(
  repoUrl: string,
  callback: (tempDir: string, commitCount: number) => Promise<T>,
  options?: {
    skipMetrics?: boolean;
    estimatedCommits?: number;
  }
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
          logger.info('Started enhanced streaming operation', {
            repoUrl,
            commitCount: repositoryCommitCount,
            category: getRepositorySizeCategory(repositoryCommitCount),
            streamingThreshold: config.streaming.commitThreshold,
          });
        }
      } catch (countError) {
        logger.warn('Failed to get commit count for enhanced operation', {
          error: countError,
          repoUrl,
        });
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
          0.5, // Default estimate
          process.memoryUsage().heapUsed / 1024 / 1024
        );

        logger.info('Completed enhanced streaming operation', {
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
 * NEW: Get repository information without processing commits
 * Useful for size estimation and streaming decision making
 */
export async function getRepositoryInfo(repoUrl: string): Promise<{
  commitCount: number;
  shouldUseStreaming: boolean;
  estimatedProcessingTime: number;
  recommendedBatchSize: number;
}> {
  return withTempRepository(repoUrl, async (tempDir) => {
    const commitCount = await gitService.getCommitCount(tempDir);
    const shouldUseStreaming =
      config.streaming.enabled &&
      commitCount > config.streaming.commitThreshold;

    // Simple heuristic for estimated processing time
    // Based on typical git log performance and network factors
    const estimatedTimePerCommit = shouldUseStreaming ? 0.001 : 0.002; // seconds per commit
    const estimatedProcessingTime = commitCount * estimatedTimePerCommit;

    // Recommended batch size based on repository size
    let recommendedBatchSize = config.streaming.batchSize;
    if (commitCount > 500000) {
      recommendedBatchSize = Math.min(2000, config.streaming.batchSize * 2);
    } else if (commitCount < 10000) {
      recommendedBatchSize = Math.max(500, config.streaming.batchSize / 2);
    }

    logger.info('Repository information gathered', {
      repoUrl,
      commitCount,
      shouldUseStreaming,
      estimatedProcessingTime,
      recommendedBatchSize,
    });

    return {
      commitCount,
      shouldUseStreaming,
      estimatedProcessingTime,
      recommendedBatchSize,
    };
  });
}
