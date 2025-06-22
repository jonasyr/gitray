import { rm, mkdtemp } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import { config } from '../config';
import { getLogger } from './logger';
import {
  recordStreamingStart,
  recordStreamingCompletion,
  recordStreamingBatch,
  recordStreamingError,
  recordEnhancedCacheOperation,
  recordDetailedError,
  updateServiceHealthScore,
  getRepositoryType,
} from './metrics';
import {
  parseISO,
  eachDayOfInterval,
  subDays,
  startOfDay,
  isAfter,
  isBefore,
  format,
} from 'date-fns';
import {
  Commit,
  CommitFilterOptions,
  CommitAggregation,
  CommitHeatmapData,
  GIT_SERVICE,
  ERROR_MESSAGES,
  RepositoryError,
} from '@gitray/shared-types';
import { shallowClone } from '../utils/gitUtils';
import redis from '../services/cache';
// Memory protection imports
import {
  executeWithMemoryProtection,
  getMemoryStats,
} from '../utils/memoryPressureManager';

const logger = getLogger();

/**
 * STREAMING SUPPORT FOR LARGE REPOSITORIES
 *
 * NEW INTERFACES AND TYPES
 */

export interface StreamingOptions {
  batchSize: number;
  startFromCommit?: string;
  maxCommits?: number;
  resumeState?: StreamingResumeState;
}

export interface StreamingResumeState {
  lastProcessedSha?: string;
  processedCount: number;
  totalEstimatedCount: number;
  startTime: number;
}

export interface StreamingMetrics {
  totalCommits: number;
  processedCommits: number;
  batchesProcessed: number;
  averageBatchTime: number;
  memoryUsageMB: number;
  cacheHitRate: number;
  startTime: number;
  lastBatchTime?: number;
}

/**
 * ENHANCED GITSERVICE WITH STREAMING CAPABILITIES
 */
class GitService {
  private readonly git: SimpleGit;

  constructor() {
    const gitOptions: Partial<SimpleGitOptions> = {
      baseDir: process.cwd(),
      binary: 'git',
      maxConcurrentProcesses: config.git.maxConcurrentProcesses,
    };

    this.git = simpleGit(gitOptions);
    logger.info('GitService initialized with streaming support.', {
      maxConcurrentProcesses: config.git.maxConcurrentProcesses,
      cloneDepth: config.git.cloneDepth,
    });
  }

  /**
   * NEW: Fast commit count estimation for large repositories
   * Uses git rev-list --count for O(1) performance
   */
  async getCommitCount(localRepoPath: string): Promise<number> {
    logger.info(`Getting commit count for: ${localRepoPath}`);
    try {
      const localGit: SimpleGit = simpleGit(localRepoPath);

      // Use rev-list --count for fastest possible count
      const countOutput = await localGit.raw(['rev-list', '--count', 'HEAD']);
      const count = parseInt(countOutput.trim(), 10);

      if (isNaN(count)) {
        throw new Error(`Invalid commit count output: ${countOutput}`);
      }

      logger.info(`Repository ${localRepoPath} has ${count} commits`);
      return count;
    } catch (error) {
      logger.error(`Error getting commit count from ${localRepoPath}`, {
        error,
        localRepoPath,
      });
      throw new RepositoryError(
        `${ERROR_MESSAGES.COMMITS_FETCH_FAILED}: Failed to count commits - ${error instanceof Error ? error.message : String(error)}`,
        localRepoPath
      );
    }
  }

  /**
   * NEW: Determines if streaming mode should be used based on repository size
   * and current memory pressure
   */
  async shouldUseStreaming(localRepoPath: string): Promise<boolean> {
    if (!config.streaming.enabled) {
      logger.debug('Streaming disabled by configuration');
      return false;
    }

    try {
      // Check memory pressure first - force streaming under pressure
      const memoryStats = getMemoryStats();
      if (memoryStats.pressure.level !== 'normal') {
        logger.info('Forcing streaming due to memory pressure', {
          pressureLevel: memoryStats.pressure.level,
          systemMemoryUsage: `${(memoryStats.system.usagePercentage * 100).toFixed(1)}%`,
        });
        return true;
      }

      const commitCount = await this.getCommitCount(localRepoPath);
      const useStreaming = commitCount > config.streaming.commitThreshold;

      logger.info(
        `Repository decision: ${commitCount} commits, streaming: ${useStreaming}`,
        {
          commitCount,
          threshold: config.streaming.commitThreshold,
          useStreaming,
          memoryPressure: memoryStats.pressure.level,
        }
      );

      return useStreaming;
    } catch (error) {
      logger.warn(
        'Failed to determine if streaming should be used, defaulting to false',
        {
          error,
          localRepoPath,
        }
      );
      return false;
    }
  }

  /**
   * NEW: Streaming commit retrieval using async generator with memory-aware processing
   * Processes commits in configurable batches with progressive caching and memory protection
   */
  async *getCommitsStream(
    localRepoPath: string,
    options: StreamingOptions
  ): AsyncGenerator<Commit[], StreamingMetrics, unknown> {
    logger.info(`Starting memory-aware commit stream for: ${localRepoPath}`, {
      options,
    });

    const localGit: SimpleGit = simpleGit(localRepoPath);
    const metrics: StreamingMetrics = {
      totalCommits: 0,
      processedCommits: options.resumeState?.processedCount ?? 0,
      batchesProcessed: 0,
      averageBatchTime: 0,
      memoryUsageMB: 0,
      cacheHitRate: 0,
      startTime: Date.now(),
    };

    try {
      // Get total count for progress tracking
      metrics.totalCommits = await this.getCommitCount(localRepoPath);

      // Record streaming start
      recordStreamingStart(metrics.totalCommits);

      let currentSkip = options.resumeState?.processedCount ?? 0;
      const batchSize = options.batchSize ?? config.streaming.batchSize;
      const maxCommits = options.maxCommits ?? metrics.totalCommits;

      logger.info(`Memory-aware streaming configuration`, {
        totalCommits: metrics.totalCommits,
        initialBatchSize: batchSize,
        maxCommits,
        resumeFromSkip: currentSkip,
      });

      while (currentSkip < maxCommits && currentSkip < metrics.totalCommits) {
        const batchStartTime = Date.now();

        // Dynamic batch size adjustment based on memory pressure
        const memoryStats = getMemoryStats();
        let adjustedBatchSize = batchSize;

        if (memoryStats.pressure.level === 'warning') {
          adjustedBatchSize = Math.min(batchSize, 500);
        } else if (memoryStats.pressure.level === 'critical') {
          adjustedBatchSize = Math.min(batchSize, 250);
        } else if (memoryStats.pressure.level === 'emergency') {
          adjustedBatchSize = Math.min(batchSize, 100);
        }

        const remaining = Math.min(
          maxCommits - currentSkip,
          metrics.totalCommits - currentSkip
        );
        const currentBatchSize = Math.min(adjustedBatchSize, remaining);

        logger.debug(
          `Processing memory-aware batch: skip=${currentSkip}, size=${currentBatchSize}, pressureLevel=${memoryStats.pressure.level}`
        );

        // Emergency memory pressure check
        if (memoryStats.pressure.level === 'emergency') {
          logger.error('Emergency memory pressure - stopping stream', {
            localRepoPath,
            batchesProcessed: metrics.batchesProcessed,
            processedCommits: metrics.processedCommits,
          });
          throw new Error('Streaming stopped due to emergency memory pressure');
        }

        try {
          // Check cache first for this specific batch
          const cacheKey = `commits_batch:${localRepoPath}:${currentSkip}:${currentBatchSize}`;
          const cached = await redis.get(cacheKey);

          let batch: Commit[];
          if (cached) {
            batch = JSON.parse(cached);
            // Safely update cache hit rate
            const totalBatches = metrics.batchesProcessed + 1;
            const currentHits =
              metrics.cacheHitRate * metrics.batchesProcessed + 1;
            metrics.cacheHitRate =
              totalBatches > 0 ? currentHits / totalBatches : 1;
            logger.debug(
              `Cache hit for batch ${currentSkip}-${currentSkip + currentBatchSize}`
            );
          } else {
            // Fetch batch from git
            const args = [
              'log',
              '--pretty=format:' + GIT_SERVICE.LOG_FORMAT,
              `--skip=${currentSkip}`,
              '-n',
              String(currentBatchSize),
            ];

            if (options.startFromCommit) {
              args.push(options.startFromCommit);
            }

            const raw = await localGit.raw(args);

            batch = raw
              .split('\n')
              .filter(Boolean)
              .map((line) => {
                const parts = line.split('|');
                const [hash, date, authorName, authorEmail] = parts;
                const message = parts.slice(4).join('|');

                if (!hash || !date || !authorName || !authorEmail || !message) {
                  logger.warn('Skipping commit with missing data in batch', {
                    line,
                    currentSkip,
                  });
                  return null;
                }

                return { sha: hash, message, date, authorName, authorEmail };
              })
              .filter((commit): commit is Commit => commit !== null);

            // Cache this batch for future use
            await redis.set(cacheKey, JSON.stringify(batch), 'EX', 3600); // Cache for 1 hour
            // Safely update cache hit rate (cache miss case)
            const totalBatches = metrics.batchesProcessed + 1;
            const currentHits = metrics.cacheHitRate * metrics.batchesProcessed;
            metrics.cacheHitRate =
              totalBatches > 0 ? currentHits / totalBatches : 0;

            logger.debug(
              `Fetched and cached batch ${currentSkip}-${currentSkip + currentBatchSize}`,
              {
                batchCommits: batch.length,
              }
            );
          }

          // Update metrics
          const batchTime = Date.now() - batchStartTime;
          metrics.batchesProcessed++;
          metrics.processedCommits += batch.length;
          metrics.averageBatchTime =
            (metrics.averageBatchTime * (metrics.batchesProcessed - 1) +
              batchTime) /
            metrics.batchesProcessed;
          metrics.lastBatchTime = batchTime;
          metrics.memoryUsageMB = process.memoryUsage().heapUsed / 1024 / 1024;

          // Record enhanced streaming batch metrics
          recordStreamingBatch(
            batch.length,
            batchTime,
            cached ? true : false,
            metrics.totalCommits
          );

          // Record enhanced cache operation
          recordEnhancedCacheOperation(
            'batch_cache',
            cached ? true : false,
            undefined,
            localRepoPath,
            metrics.totalCommits
          );

          // Store resume state for error recovery
          const resumeState: StreamingResumeState = {
            lastProcessedSha: batch[batch.length - 1]?.sha,
            processedCount: metrics.processedCommits,
            totalEstimatedCount: metrics.totalCommits,
            startTime: metrics.startTime,
          };

          // Cache resume state
          const resumeKey = `stream_resume:${localRepoPath}`;
          await redis.set(resumeKey, JSON.stringify(resumeState), 'EX', 7200); // 2 hours

          logger.info(`Batch ${metrics.batchesProcessed} completed`, {
            batchSize: batch.length,
            processedCommits: metrics.processedCommits,
            totalCommits: metrics.totalCommits,
            progress: `${((metrics.processedCommits / metrics.totalCommits) * 100).toFixed(1)}%`,
            batchTime: `${batchTime}ms`,
            avgBatchTime: `${metrics.averageBatchTime.toFixed(0)}ms`,
            memoryMB: metrics.memoryUsageMB.toFixed(1),
          });

          currentSkip += batch.length;

          // Yield the batch along with current metrics
          yield batch;

          // Memory pressure check - if memory usage is high, suggest GC
          if (metrics.memoryUsageMB > 500) {
            // 500MB threshold
            logger.warn('High memory usage detected during streaming', {
              memoryMB: metrics.memoryUsageMB,
              suggestion:
                'Consider smaller batch sizes for memory-constrained environments',
            });

            // Force garbage collection if available (development/debugging)
            if (global.gc && typeof global.gc === 'function') {
              global.gc();
              logger.debug('Garbage collection triggered');
            }
          }
        } catch (batchError) {
          logger.error(`Error processing batch at skip=${currentSkip}`, {
            error: batchError,
            localRepoPath,
            currentSkip,
            batchSize: currentBatchSize,
          });

          // For batch errors, we can either:
          // 1. Skip this batch and continue (resilient)
          // 2. Throw and abort (fail-fast)
          // We choose resilient approach but log the error
          currentSkip += currentBatchSize;
          continue;
        }
      }

      // Clean up resume state on successful completion
      try {
        const resumeKey = `stream_resume:${localRepoPath}`;
        await redis.del(resumeKey);
      } catch (cleanupError) {
        logger.warn('Failed to clean up resume state', { error: cleanupError });
      }

      // Record streaming completion
      const totalDuration = Date.now() - metrics.startTime;
      recordStreamingCompletion(
        metrics.totalCommits,
        totalDuration,
        metrics.processedCommits,
        metrics.batchesProcessed,
        metrics.cacheHitRate,
        metrics.memoryUsageMB
      );

      logger.info(`Streaming completed for ${localRepoPath}`, {
        totalProcessed: metrics.processedCommits,
        totalBatches: metrics.batchesProcessed,
        totalTime: totalDuration,
        avgBatchTime: metrics.averageBatchTime,
        cacheHitRate: `${(metrics.cacheHitRate * 100).toFixed(1)}%`,
      });
    } catch (error) {
      // Record streaming error
      const errorType =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      recordStreamingError(errorType, false, metrics.totalCommits);

      logger.error(`Error in commit streaming for ${localRepoPath}`, {
        error,
        metrics,
      });
      throw new RepositoryError(
        `${ERROR_MESSAGES.COMMITS_FETCH_FAILED}: Streaming failed - ${error instanceof Error ? error.message : String(error)}`,
        localRepoPath
      );
    }

    return metrics;
  }

  /**
   * ENHANCED: Original getCommits method with automatic streaming detection
   * and memory protection. Maintains backward compatibility while adding
   * streaming capabilities and memory-aware processing.
   */
  async getCommits(
    localRepoPath: string,
    options?: { skip?: number; limit?: number }
  ): Promise<Commit[]> {
    logger.info(`Getting commits from: ${localRepoPath}`, { options });

    // If specific pagination is requested, use the original implementation
    if (options?.skip !== undefined || options?.limit !== undefined) {
      return executeWithMemoryProtection(
        'git-getCommits-paginated',
        () => this.getCommitsOriginal(localRepoPath, options),
        {
          estimatedMemoryMB: options?.limit ? options.limit * 0.001 : 50,
          priority: 'normal',
        }
      );
    }

    try {
      // Check memory pressure first
      const memoryStats = getMemoryStats();
      const forceStreaming =
        memoryStats.pressure.level === 'warning' ||
        memoryStats.pressure.level === 'critical' ||
        memoryStats.pressure.level === 'emergency';

      // Check if streaming should be used
      const useStreaming =
        forceStreaming || (await this.shouldUseStreaming(localRepoPath));

      if (!useStreaming) {
        logger.info('Using original getCommits for small repository');
        return executeWithMemoryProtection(
          'git-getCommits-small',
          () => this.getCommitsOriginal(localRepoPath),
          {
            estimatedMemoryMB: 50,
            priority: 'normal',
          }
        );
      }

      // Use streaming for large repositories or under memory pressure
      logger.info(
        'Using streaming getCommits for large repository or memory pressure',
        {
          forceStreaming,
          pressureLevel: memoryStats.pressure.level,
        }
      );

      // Adjust batch size based on memory pressure
      let batchSize = config.streaming.batchSize;
      if (memoryStats.pressure.level === 'warning') {
        batchSize = Math.min(batchSize, 500);
      } else if (memoryStats.pressure.level === 'critical') {
        batchSize = Math.min(batchSize, 250);
      } else if (memoryStats.pressure.level === 'emergency') {
        batchSize = Math.min(batchSize, 100);
      }

      const streamingOptions: StreamingOptions = {
        batchSize,
      };

      const allCommits: Commit[] = [];
      const streamStartTime = Date.now();

      for await (const batch of this.getCommitsStream(
        localRepoPath,
        streamingOptions
      )) {
        allCommits.push(...batch);

        // Check memory pressure during streaming
        const currentStats = getMemoryStats();
        if (currentStats.pressure.level === 'emergency') {
          logger.warn(
            'Emergency memory pressure during streaming - truncating results',
            {
              commitsCollected: allCommits.length,
              localRepoPath,
            }
          );
          break;
        }

        // Progress logging for large operations
        if (allCommits.length % 5000 === 0) {
          logger.info(
            `Memory-aware streaming progress: ${allCommits.length} commits processed`,
            {
              memoryUsage: `${currentStats.system.usagePercentage.toFixed(2)}%`,
              pressureLevel: currentStats.pressure.level,
            }
          );
        }
      }

      const streamTime = Date.now() - streamStartTime;
      logger.info(`Memory-protected streaming getCommits completed`, {
        totalCommits: allCommits.length,
        streamingTime: streamTime,
        commitsPerSecond: Math.round(allCommits.length / (streamTime / 1000)),
        finalMemoryPressure: getMemoryStats().pressure.level,
      });

      return allCommits;
    } catch (error) {
      logger.error(`Error in enhanced getCommits for ${localRepoPath}`, {
        error,
        localRepoPath,
      });
      throw new RepositoryError(
        `${ERROR_MESSAGES.COMMITS_FETCH_FAILED}: ${error instanceof Error ? error.message : String(error)}`,
        localRepoPath
      );
    }
  }

  /**
   * PRIVATE: Original getCommits implementation for small repos and pagination
   */
  private async getCommitsOriginal(
    localRepoPath: string,
    options?: { skip?: number; limit?: number }
  ): Promise<Commit[]> {
    logger.info(`Using original commit retrieval for: ${localRepoPath}`);
    try {
      const localGit: SimpleGit = simpleGit(localRepoPath);

      const args = ['log', '--pretty=format:' + GIT_SERVICE.LOG_FORMAT];
      if (options?.skip) {
        args.push(`--skip=${options.skip}`);
      }
      if (options?.limit) {
        args.push('-n', String(options.limit));
      }

      const raw = await localGit.raw(args);

      const commits: Commit[] = raw
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const parts = line.split('|');
          const [hash, date, authorName, authorEmail] = parts;
          const message = parts.slice(4).join('|');
          if (!hash || !date || !authorName || !authorEmail || !message) {
            logger.warn('Skipping commit with missing data', { line });
            return null;
          }
          return { sha: hash, message, date, authorName, authorEmail };
        })
        .filter((commit): commit is Commit => commit !== null);

      logger.info(
        `Successfully retrieved ${commits.length} commits from ${localRepoPath}.`
      );
      return commits;
    } catch (error) {
      logger.error(`Error reading commits from repository ${localRepoPath}`, {
        error,
        localRepoPath,
      });
      throw new RepositoryError(
        `${ERROR_MESSAGES.COMMITS_FETCH_FAILED}: ${error instanceof Error ? error.message : String(error)}`,
        localRepoPath
      );
    }
  }

  /**
   * NEW: Get resume state for interrupted streaming operations
   */
  async getStreamingResumeState(
    localRepoPath: string
  ): Promise<StreamingResumeState | null> {
    try {
      const resumeKey = `stream_resume:${localRepoPath}`;
      const cached = await redis.get(resumeKey);

      if (cached) {
        const resumeState = JSON.parse(cached) as StreamingResumeState;
        logger.info('Found resume state for streaming operation', {
          localRepoPath,
          resumeState,
        });
        return resumeState;
      }

      return null;
    } catch (error) {
      logger.warn('Failed to get resume state', { error, localRepoPath });
      return null;
    }
  }

  /**
   * NEW: Clear resume state (for cleanup)
   */
  async clearStreamingResumeState(localRepoPath: string): Promise<void> {
    try {
      const resumeKey = `stream_resume:${localRepoPath}`;
      await redis.del(resumeKey);
      logger.debug('Cleared resume state', { localRepoPath });
    } catch (error) {
      logger.warn('Failed to clear resume state', { error, localRepoPath });
    }
  }

  // ========================================================================
  // EXISTING METHODS (unchanged for backward compatibility)
  // ========================================================================

  /**
   * Clones a Git repository into a temporary directory with memory protection.
   */
  async cloneRepository(repoUrl: string): Promise<string> {
    return executeWithMemoryProtection(
      'git-clone',
      async () => {
        let tempDir: string | undefined = undefined;
        const startTime = Date.now();
        const repoType = getRepositoryType(repoUrl);

        logger.info(`Attempting to clone repository: ${repoUrl}`, { repoType });

        try {
          const tempDirPrefix = path.join(
            os.tmpdir(),
            GIT_SERVICE.TEMP_DIR_PREFIX
          );
          tempDir = await mkdtemp(tempDirPrefix);
          logger.info(`Created temporary directory: ${tempDir}`);

          await shallowClone(repoUrl, tempDir);
          logger.info(`Successfully cloned ${repoUrl} into ${tempDir}.`);

          // Record successful git operation
          const duration = (Date.now() - startTime) / 1000;
          updateServiceHealthScore('git', {
            errorRate: 0,
            responseTime: duration,
          });

          return tempDir;
        } catch (error) {
          const duration = (Date.now() - startTime) / 1000;

          // Record detailed error metrics
          recordDetailedError(
            'git',
            error instanceof Error ? error : new Error(String(error)),
            {
              userImpact: 'blocking',
              recoveryAction: 'retry',
              repoType:
                repoType === 'unknown'
                  ? undefined
                  : (repoType as 'public' | 'private'),
              severity: 'critical',
            }
          );

          // Update service health with error
          updateServiceHealthScore('git', {
            errorRate: 1,
            responseTime: duration,
          });

          logger.error(`Error cloning repository ${repoUrl}`, {
            error,
            repoUrl,
            repoType,
            duration,
          });

          if (tempDir) {
            try {
              logger.info(
                `Attempting cleanup of failed clone directory: ${tempDir}`
              );
              await rm(tempDir, { recursive: true, force: true });
              logger.info(`Cleaned up temporary directory: ${tempDir}`);
            } catch (cleanupError) {
              logger.error(`Failed to cleanup temporary directory ${tempDir}`, {
                cleanupError,
                tempDir,
              });
            }
          }
          throw new RepositoryError(
            `${ERROR_MESSAGES.REPO_CLONE_FAILED}: ${error instanceof Error ? error.message : String(error)}`,
            repoUrl
          );
        }
      },
      {
        estimatedMemoryMB: 100, // Estimate based on average repo size
        priority: 'normal',
      }
    );
  }

  private filterByAuthors(commits: Commit[], authors?: string[]): Commit[] {
    if (!authors || authors.length === 0) {
      return commits;
    }
    return commits.filter((c) =>
      authors.some((a) => c.authorName.includes(a) || c.authorEmail.includes(a))
    );
  }

  private filterByDateRange(
    commits: Commit[],
    startDate: Date,
    endDate: Date
  ): Commit[] {
    return commits.filter((c) => {
      const commitDate = parseISO(c.date);
      return !isBefore(commitDate, startDate) && !isAfter(commitDate, endDate);
    });
  }

  private createDateBuckets(
    startDate: Date,
    endDate: Date
  ): Map<string, CommitAggregation> {
    const buckets = new Map<string, CommitAggregation>();
    eachDayOfInterval({
      start: startOfDay(startDate),
      end: startOfDay(endDate),
    }).forEach((d) => {
      const key = format(d, 'yyyy-MM-dd');
      buckets.set(key, { periodStart: key, commitCount: 0, authors: [] });
    });
    return buckets;
  }

  private tallyCommits(
    commits: Commit[],
    buckets: Map<string, CommitAggregation>
  ): number {
    let max = 0;
    commits.forEach((c) => {
      const key = format(parseISO(c.date), 'yyyy-MM-dd');
      const bucket = buckets.get(key);
      if (!bucket) return;
      bucket.commitCount += 1;
      if (!bucket.authors!.includes(c.authorName)) {
        bucket.authors!.push(c.authorName);
      }
      if (bucket.commitCount > max) {
        max = bucket.commitCount;
      }
    });
    return max;
  }

  /**
   * Aggregates commit data by time periods with memory protection.
   */
  async aggregateCommitsByTime(
    commits: Commit[],
    filterOptions?: CommitFilterOptions
  ): Promise<CommitHeatmapData> {
    return executeWithMemoryProtection(
      'git-aggregate',
      async () => {
        logger.info('Aggregating commits by day', { filterOptions });

        const endDate = filterOptions?.toDate
          ? parseISO(filterOptions.toDate)
          : new Date();
        const startDate = filterOptions?.fromDate
          ? parseISO(filterOptions.fromDate)
          : subDays(endDate, 364);

        const authors =
          filterOptions?.authors ??
          (filterOptions?.author ? [filterOptions.author] : undefined);

        let filtered = this.filterByAuthors(commits, authors);
        filtered = this.filterByDateRange(filtered, startDate, endDate);

        const buckets = this.createDateBuckets(startDate, endDate);
        const maxCommitCount = this.tallyCommits(filtered, buckets);

        const aggregatedData = Array.from(buckets.values());
        return {
          timePeriod: 'day',
          data: aggregatedData,
          metadata: {
            maxCommitCount,
            totalCommits: filtered.length,
          },
        };
      },
      {
        estimatedMemoryMB: commits.length * 0.001,
        priority: 'normal',
      }
    );
  }

  /**
   * Cleans up (deletes) the temporary repository directory.
   */
  async cleanupRepository(repoPath: string): Promise<void> {
    logger.info(`Attempting cleanup of directory: ${repoPath}`);
    try {
      await rm(repoPath, { recursive: true, force: true });
      logger.info(`Successfully cleaned up directory: ${repoPath}`);
    } catch (error) {
      logger.error(`Error cleaning up directory ${repoPath}`, {
        error,
        repoPath,
      });
      throw new RepositoryError(
        `${ERROR_MESSAGES.CLEANUP_FAILED}: ${error instanceof Error ? error.message : String(error)}`,
        repoPath
      );
    }
  }
}

export const gitService = new GitService();
