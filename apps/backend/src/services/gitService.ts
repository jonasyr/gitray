import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
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
import { getLogger } from '../services/logger';
import { shallowClone } from '../utils/gitUtils';
import { config } from '../config';
import redis from '../services/cache';

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
      maxConcurrentProcesses: GIT_SERVICE.MAX_CONCURRENT_PROCESSES,
    };

    this.git = simpleGit(gitOptions);
    logger.info('GitService initialized with streaming support.');
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
   */
  async shouldUseStreaming(localRepoPath: string): Promise<boolean> {
    if (!config.streaming.enabled) {
      logger.debug('Streaming disabled by configuration');
      return false;
    }

    try {
      const commitCount = await this.getCommitCount(localRepoPath);
      const useStreaming = commitCount > config.streaming.commitThreshold;

      logger.info(
        `Repository decision: ${commitCount} commits, streaming: ${useStreaming}`,
        {
          commitCount,
          threshold: config.streaming.commitThreshold,
          useStreaming,
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
   * NEW: Streaming commit retrieval using async generator
   * Processes commits in configurable batches with progressive caching
   */
  async *getCommitsStream(
    localRepoPath: string,
    options: StreamingOptions
  ): AsyncGenerator<Commit[], StreamingMetrics, unknown> {
    logger.info(`Starting commit stream for: ${localRepoPath}`, { options });

    const localGit: SimpleGit = simpleGit(localRepoPath);
    const metrics: StreamingMetrics = {
      totalCommits: 0,
      processedCommits: options.resumeState?.processedCount || 0,
      batchesProcessed: 0,
      averageBatchTime: 0,
      memoryUsageMB: 0,
      cacheHitRate: 0,
      startTime: Date.now(),
    };

    try {
      // Get total count for progress tracking
      metrics.totalCommits = await this.getCommitCount(localRepoPath);

      let currentSkip = options.resumeState?.processedCount || 0;
      const batchSize = options.batchSize || config.streaming.batchSize;
      const maxCommits = options.maxCommits || metrics.totalCommits;

      logger.info(`Streaming configuration`, {
        totalCommits: metrics.totalCommits,
        batchSize,
        maxCommits,
        resumeFromSkip: currentSkip,
      });

      while (currentSkip < maxCommits && currentSkip < metrics.totalCommits) {
        const batchStartTime = Date.now();
        const remaining = Math.min(
          maxCommits - currentSkip,
          metrics.totalCommits - currentSkip
        );
        const currentBatchSize = Math.min(batchSize, remaining);

        logger.debug(
          `Processing batch: skip=${currentSkip}, size=${currentBatchSize}`
        );

        try {
          // Check cache first for this specific batch
          const cacheKey = `commits_batch:${localRepoPath}:${currentSkip}:${currentBatchSize}`;
          const cached = await redis.get(cacheKey);

          let batch: Commit[];
          if (cached) {
            batch = JSON.parse(cached);
            metrics.cacheHitRate =
              (metrics.cacheHitRate * metrics.batchesProcessed + 1) /
              (metrics.batchesProcessed + 1);
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
            metrics.cacheHitRate =
              (metrics.cacheHitRate * metrics.batchesProcessed) /
              (metrics.batchesProcessed + 1);

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

      logger.info(`Streaming completed for ${localRepoPath}`, {
        totalProcessed: metrics.processedCommits,
        totalBatches: metrics.batchesProcessed,
        totalTime: Date.now() - metrics.startTime,
        avgBatchTime: metrics.averageBatchTime,
        cacheHitRate: `${(metrics.cacheHitRate * 100).toFixed(1)}%`,
      });
    } catch (error) {
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
   * Maintains backward compatibility while adding streaming capabilities
   */
  async getCommits(
    localRepoPath: string,
    options?: { skip?: number; limit?: number }
  ): Promise<Commit[]> {
    logger.info(`Getting commits from: ${localRepoPath}`, { options });

    // If specific pagination is requested, use the original implementation
    if (options?.skip !== undefined || options?.limit !== undefined) {
      return this.getCommitsOriginal(localRepoPath, options);
    }

    try {
      // Check if streaming should be used
      const useStreaming = await this.shouldUseStreaming(localRepoPath);

      if (!useStreaming) {
        logger.info('Using original getCommits for small repository');
        return this.getCommitsOriginal(localRepoPath);
      }

      // Use streaming for large repositories
      logger.info('Using streaming getCommits for large repository');
      const streamingOptions: StreamingOptions = {
        batchSize: config.streaming.batchSize,
      };

      const allCommits: Commit[] = [];
      const streamStartTime = Date.now();

      for await (const batch of this.getCommitsStream(
        localRepoPath,
        streamingOptions
      )) {
        allCommits.push(...batch);

        // Progress logging for large operations
        if (allCommits.length % 5000 === 0) {
          logger.info(
            `Streaming progress: ${allCommits.length} commits processed`
          );
        }
      }

      const streamTime = Date.now() - streamStartTime;
      logger.info(`Streaming getCommits completed`, {
        totalCommits: allCommits.length,
        streamingTime: streamTime,
        commitsPerSecond: Math.round(allCommits.length / (streamTime / 1000)),
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
   * Clones a Git repository into a temporary directory.
   */
  async cloneRepository(repoUrl: string): Promise<string> {
    let tempDir: string | undefined = undefined;
    logger.info(`Attempting to clone repository: ${repoUrl}`);

    try {
      const tempDirPrefix = path.join(os.tmpdir(), GIT_SERVICE.TEMP_DIR_PREFIX);
      tempDir = await mkdtemp(tempDirPrefix);
      logger.info(`Created temporary directory: ${tempDir}`);

      await shallowClone(repoUrl, tempDir);
      logger.info(`Successfully cloned ${repoUrl} into ${tempDir}.`);

      return tempDir;
    } catch (error) {
      logger.error(`Error cloning repository ${repoUrl}`, { error, repoUrl });
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
   * Aggregates commit data by time periods.
   */
  async aggregateCommitsByTime(
    commits: Commit[],
    filterOptions?: CommitFilterOptions
  ): Promise<CommitHeatmapData> {
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
