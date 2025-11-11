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
  CodeChurnAnalysis,
  FileChurnData,
  ChurnFilterOptions,
  ChurnRiskLevel,
  ChurnRiskThresholds,
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

interface BatchProcessingResult {
  batch: Commit[];
  wasCacheHit: boolean;
  batchTime: number;
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
   * Initialize streaming metrics
   */
  private initializeStreamingMetrics(
    totalCommits: number,
    resumeState?: StreamingResumeState
  ): StreamingMetrics {
    return {
      totalCommits,
      processedCommits: resumeState?.processedCount ?? 0,
      batchesProcessed: 0,
      averageBatchTime: 0,
      memoryUsageMB: 0,
      cacheHitRate: 0,
      startTime: Date.now(),
    };
  }

  /**
   * Adjust batch size based on memory pressure
   */
  private adjustBatchSizeForMemoryPressure(baseBatchSize: number): number {
    const memoryStats = getMemoryStats();

    switch (memoryStats.pressure.level) {
      case 'warning':
        return Math.min(baseBatchSize, 500);
      case 'critical':
        return Math.min(baseBatchSize, 250);
      case 'emergency':
        return Math.min(baseBatchSize, 100);
      default:
        return baseBatchSize;
    }
  }

  /**
   * Check if we should stop due to emergency memory pressure
   */
  private checkEmergencyMemoryPressure(
    localRepoPath: string,
    metrics: StreamingMetrics
  ): void {
    const memoryStats = getMemoryStats();
    if (memoryStats.pressure.level === 'emergency') {
      logger.error('Emergency memory pressure - stopping stream', {
        localRepoPath,
        batchesProcessed: metrics.batchesProcessed,
        processedCommits: metrics.processedCommits,
      });
      throw new Error('Streaming stopped due to emergency memory pressure');
    }
  }

  /**
   * Process a single batch of commits with caching
   */
  private async processBatch(
    localGit: SimpleGit,
    localRepoPath: string,
    currentSkip: number,
    batchSize: number,
    options: StreamingOptions
  ): Promise<BatchProcessingResult> {
    const batchStartTime = Date.now();
    const cacheKey = `commits_batch:${localRepoPath}:${currentSkip}:${batchSize}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      const batch = JSON.parse(cached);
      logger.debug(
        `Cache hit for batch ${currentSkip}-${currentSkip + batchSize}`
      );
      return {
        batch,
        wasCacheHit: true,
        batchTime: Date.now() - batchStartTime,
      };
    }

    // Fetch from git
    const batch = await this.fetchBatchFromGit(
      localGit,
      currentSkip,
      batchSize,
      options
    );

    // Cache the result
    await redis.set(cacheKey, JSON.stringify(batch), 'EX', 3600);

    logger.debug(
      `Fetched and cached batch ${currentSkip}-${currentSkip + batchSize}`,
      {
        batchCommits: batch.length,
      }
    );

    return {
      batch,
      wasCacheHit: false,
      batchTime: Date.now() - batchStartTime,
    };
  }

  /**
   * Fetch batch from git repository
   */
  private async fetchBatchFromGit(
    localGit: SimpleGit,
    currentSkip: number,
    batchSize: number,
    options: StreamingOptions
  ): Promise<Commit[]> {
    const args = [
      'log',
      '--pretty=format:' + GIT_SERVICE.LOG_FORMAT,
      `--skip=${currentSkip}`,
      '-n',
      String(batchSize),
    ];

    if (options.startFromCommit) {
      args.push(options.startFromCommit);
    }

    const raw = await localGit.raw(args);

    return raw
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
  }

  /**
   * Update metrics after processing a batch
   */
  private updateMetricsAfterBatch(
    metrics: StreamingMetrics,
    batchResult: BatchProcessingResult
  ): void {
    metrics.batchesProcessed++;
    metrics.processedCommits += batchResult.batch.length;
    metrics.averageBatchTime =
      (metrics.averageBatchTime * (metrics.batchesProcessed - 1) +
        batchResult.batchTime) /
      metrics.batchesProcessed;
    metrics.lastBatchTime = batchResult.batchTime;
    metrics.memoryUsageMB = process.memoryUsage().heapUsed / 1024 / 1024;

    // Update cache hit rate
    const totalBatches = metrics.batchesProcessed;
    const currentHits =
      metrics.cacheHitRate * (metrics.batchesProcessed - 1) +
      (batchResult.wasCacheHit ? 1 : 0);
    metrics.cacheHitRate = totalBatches > 0 ? currentHits / totalBatches : 0;
  }

  /**
   * Save resume state for error recovery
   */
  private async saveResumeState(
    localRepoPath: string,
    batch: Commit[],
    metrics: StreamingMetrics
  ): Promise<void> {
    const resumeState: StreamingResumeState = {
      lastProcessedSha: batch[batch.length - 1]?.sha,
      processedCount: metrics.processedCommits,
      totalEstimatedCount: metrics.totalCommits,
      startTime: metrics.startTime,
    };

    const resumeKey = `stream_resume:${localRepoPath}`;
    await redis.set(resumeKey, JSON.stringify(resumeState), 'EX', 7200);
  }

  /**
   * Log batch completion progress
   */
  private logBatchProgress(metrics: StreamingMetrics, batchSize: number): void {
    logger.info(`Batch ${metrics.batchesProcessed} completed`, {
      batchSize,
      processedCommits: metrics.processedCommits,
      totalCommits: metrics.totalCommits,
      progress: `${((metrics.processedCommits / metrics.totalCommits) * 100).toFixed(1)}%`,
      batchTime: `${metrics.lastBatchTime}ms`,
      avgBatchTime: `${metrics.averageBatchTime.toFixed(0)}ms`,
      memoryMB: metrics.memoryUsageMB.toFixed(1),
    });
  }

  /**
   * Handle memory pressure during streaming
   */
  private handleMemoryPressure(metrics: StreamingMetrics): void {
    if (metrics.memoryUsageMB > 500) {
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
  }

  /**
   * Record metrics and cleanup after streaming completion
   */
  private async finalizeStreaming(
    localRepoPath: string,
    metrics: StreamingMetrics,
    success: boolean = true
  ): Promise<void> {
    const totalDuration = Date.now() - metrics.startTime;

    if (success) {
      // Clean up resume state on successful completion
      try {
        const resumeKey = `stream_resume:${localRepoPath}`;
        await redis.del(resumeKey);
      } catch (cleanupError) {
        logger.warn('Failed to clean up resume state', { error: cleanupError });
      }

      // Record streaming completion
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
    let metrics: StreamingMetrics | undefined;

    try {
      // Initialize metrics and get total count
      const totalCommits = await this.getCommitCount(localRepoPath);
      metrics = this.initializeStreamingMetrics(
        totalCommits,
        options.resumeState
      );
      recordStreamingStart(metrics.totalCommits);

      // Setup streaming parameters
      let currentSkip = options.resumeState?.processedCount ?? 0;
      const baseBatchSize = options.batchSize ?? config.streaming.batchSize;
      const maxCommits = options.maxCommits ?? metrics.totalCommits;

      logger.info(`Memory-aware streaming configuration`, {
        totalCommits: metrics.totalCommits,
        initialBatchSize: baseBatchSize,
        maxCommits,
        resumeFromSkip: currentSkip,
      });

      // Main streaming loop
      while (currentSkip < maxCommits && currentSkip < metrics.totalCommits) {
        // Check for emergency memory pressure
        this.checkEmergencyMemoryPressure(localRepoPath, metrics);

        // Adjust batch size based on memory pressure
        const adjustedBatchSize =
          this.adjustBatchSizeForMemoryPressure(baseBatchSize);
        const remaining = Math.min(
          maxCommits - currentSkip,
          metrics.totalCommits - currentSkip
        );
        const currentBatchSize = Math.min(adjustedBatchSize, remaining);

        logger.debug(
          `Processing memory-aware batch: skip=${currentSkip}, size=${currentBatchSize}, pressureLevel=${getMemoryStats().pressure.level}`
        );

        try {
          // Process the batch
          const batchResult = await this.processBatch(
            localGit,
            localRepoPath,
            currentSkip,
            currentBatchSize,
            options
          );

          // Update metrics
          this.updateMetricsAfterBatch(metrics, batchResult);

          // Record batch metrics
          recordStreamingBatch(
            batchResult.batch.length,
            batchResult.batchTime,
            batchResult.wasCacheHit,
            metrics.totalCommits
          );

          recordEnhancedCacheOperation(
            'batch_cache',
            batchResult.wasCacheHit,
            undefined,
            localRepoPath,
            metrics.totalCommits
          );

          // Save resume state
          await this.saveResumeState(localRepoPath, batchResult.batch, metrics);

          // Log progress
          this.logBatchProgress(metrics, batchResult.batch.length);

          currentSkip += batchResult.batch.length;

          // Yield the batch
          yield batchResult.batch;

          // Handle memory pressure
          this.handleMemoryPressure(metrics);
        } catch (batchError) {
          logger.error(`Error processing batch at skip=${currentSkip}`, {
            error: batchError,
            localRepoPath,
            currentSkip,
            batchSize: currentBatchSize,
          });

          // Skip this batch and continue (resilient approach)
          currentSkip += currentBatchSize;
          continue;
        }
      }

      // Finalize successful streaming
      await this.finalizeStreaming(localRepoPath, metrics, true);
    } catch (error) {
      // Record streaming error
      const errorType =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      recordStreamingError(errorType, false, metrics?.totalCommits ?? 0);

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
   * Determine if streaming should be used based on memory pressure and repo size
   */
  private async determineStreamingStrategy(
    localRepoPath: string
  ): Promise<boolean> {
    const memoryStats = getMemoryStats();
    const forceStreaming =
      memoryStats.pressure.level === 'warning' ||
      memoryStats.pressure.level === 'critical' ||
      memoryStats.pressure.level === 'emergency';

    return forceStreaming || (await this.shouldUseStreaming(localRepoPath));
  }

  /**
   * Execute streaming-based commit retrieval
   */
  private async executeStreamingCommits(
    localRepoPath: string
  ): Promise<Commit[]> {
    const memoryStats = getMemoryStats();

    logger.info(
      'Using streaming getCommits for large repository or memory pressure',
      {
        forceStreaming: memoryStats.pressure.level !== 'normal',
        pressureLevel: memoryStats.pressure.level,
      }
    );

    const batchSize = this.adjustBatchSizeForMemoryPressure(
      config.streaming.batchSize
    );
    const streamingOptions: StreamingOptions = { batchSize };

    const allCommits: Commit[] = [];
    const streamStartTime = Date.now();

    for await (const batch of this.getCommitsStream(
      localRepoPath,
      streamingOptions
    )) {
      allCommits.push(...batch);

      // Check for emergency memory pressure
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

    this.logStreamingCompletion(
      allCommits.length,
      Date.now() - streamStartTime
    );
    return allCommits;
  }

  /**
   * Log streaming completion statistics
   */
  private logStreamingCompletion(
    commitCount: number,
    streamTime: number
  ): void {
    logger.info(`Memory-protected streaming getCommits completed`, {
      totalCommits: commitCount,
      streamingTime: streamTime,
      commitsPerSecond: Math.round(commitCount / (streamTime / 1000)),
      finalMemoryPressure: getMemoryStats().pressure.level,
    });
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
      const useStreaming = await this.determineStreamingStrategy(localRepoPath);

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

      return await this.executeStreamingCommits(localRepoPath);
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

  /**
   * NEW: Build git log arguments with filters for commit statistics
   */
  private buildCommitStatsArgs(options?: CommitFilterOptions): string[] {
    const args = ['log', '--pretty=format:%H|%cI|%an|%ae|%s', '--numstat'];

    if (options?.fromDate) args.push(`--since=${options.fromDate}`);
    if (options?.toDate) args.push(`--until=${options.toDate}`);
    if (options?.authors && options.authors.length > 0) {
      options.authors.forEach((author) => args.push(`--author=${author}`));
    } else if (options?.author) {
      args.push(`--author=${options.author}`);
    }
    if (options?.fileExtension) {
      args.push('--', `**/*.${options.fileExtension}`);
    }

    return args;
  }

  /**
   * NEW: Parse commit header line from git log output
   */
  private parseCommitHeader(line: string) {
    const parts = line.split('|');
    if (parts.length < 5) return null;

    const [sha, date, authorName, authorEmail] = parts;
    const message = parts.slice(4).join('|');

    return {
      sha,
      authorName,
      authorEmail,
      date,
      message,
      linesAdded: 0,
      linesDeleted: 0,
    };
  }

  /**
   * NEW: Parse numstat line and update commit statistics
   */
  private parseNumstatLine(line: string, currentCommit: any): void {
    const statParts = line.split(/\s+/);
    if (statParts.length >= 2) {
      const added = parseInt(statParts[0], 10);
      const deleted = parseInt(statParts[1], 10);

      if (!isNaN(added)) currentCommit.linesAdded += added;
      if (!isNaN(deleted)) currentCommit.linesDeleted += deleted;
    }
  }

  /**
   * NEW: Get commits with line-level statistics using --numstat
   * Fetches commit data including lines added and deleted per commit
   */
  async getCommitsWithStats(
    localRepoPath: string,
    options?: CommitFilterOptions
  ): Promise<
    Array<{
      sha: string;
      authorName: string;
      authorEmail: string;
      date: string;
      message: string;
      linesAdded: number;
      linesDeleted: number;
    }>
  > {
    logger.info(`Getting commits with stats from: ${localRepoPath}`, {
      options,
    });

    try {
      const localGit = simpleGit(localRepoPath);
      const args = this.buildCommitStatsArgs(options);
      const raw = await localGit.raw(args);

      const commits: Array<any> = [];
      const lines = raw.split('\n');
      let currentCommit: any = null;

      for (const line of lines) {
        if (!line.trim()) continue;

        if (line.includes('|')) {
          if (currentCommit) commits.push(currentCommit);
          currentCommit = this.parseCommitHeader(line);
        } else if (currentCommit && line.match(/^\d+\s+\d+\s+/)) {
          this.parseNumstatLine(line, currentCommit);
        }
      }

      if (currentCommit) commits.push(currentCommit);

      logger.info(
        `Successfully retrieved ${commits.length} commits with stats from ${localRepoPath}`
      );
      return commits;
    } catch (error) {
      logger.error(
        `Error reading commits with stats from repository ${localRepoPath}`,
        {
          error,
          localRepoPath,
        }
      );
      throw new RepositoryError(
        `${ERROR_MESSAGES.COMMITS_FETCH_FAILED}: ${error instanceof Error ? error.message : String(error)}`,
        localRepoPath
      );
    }
  }

  /**
   * NEW: Get top contributors with aggregated statistics
   * Returns up to 5 top contributors sorted by commit count
   */
  async getTopContributors(
    localRepoPath: string,
    options?: CommitFilterOptions
  ): Promise<
    Array<{
      login: string;
      commitCount: number;
      linesAdded: number;
      linesDeleted: number;
      contributionPercentage: number;
    }>
  > {
    logger.info(`Getting top contributors from: ${localRepoPath}`, { options });

    try {
      // Fetch commits with line statistics
      const commitsWithStats = await this.getCommitsWithStats(
        localRepoPath,
        options
      );

      // Aggregate stats by author
      const contributorMap = new Map<
        string,
        {
          login: string;
          commitCount: number;
          linesAdded: number;
          linesDeleted: number;
        }
      >();

      for (const commit of commitsWithStats) {
        // Use author name as the unique identifier for GDPR compliance (pseudonymized)
        const login = commit.authorName;

        if (!contributorMap.has(login)) {
          contributorMap.set(login, {
            login,
            commitCount: 0,
            linesAdded: 0,
            linesDeleted: 0,
          });
        }

        const contributor = contributorMap.get(login)!;
        contributor.commitCount += 1;
        contributor.linesAdded += commit.linesAdded;
        contributor.linesDeleted += commit.linesDeleted;
      }

      // Convert to array and sort by commit count
      const contributors = Array.from(contributorMap.values());
      contributors.sort((a, b) => b.commitCount - a.commitCount);

      // Calculate contribution percentages and take top 5
      const totalCommits = commitsWithStats.length;
      const topContributors = contributors.slice(0, 5).map((contributor) => ({
        ...contributor,
        contributionPercentage:
          totalCommits > 0 ? contributor.commitCount / totalCommits : 0,
      }));

      logger.info(
        `Successfully aggregated ${topContributors.length} top contributors from ${localRepoPath}`,
        {
          totalContributors: contributors.length,
          totalCommits,
        }
      );

      return topContributors;
    } catch (error) {
      logger.error(`Error getting top contributors from ${localRepoPath}`, {
        error,
        localRepoPath,
      });
      throw new RepositoryError(
        `Failed to get top contributors: ${error instanceof Error ? error.message : String(error)}`,
        localRepoPath
      );
    }
  }

  // ========================================================================
  // CODE CHURN ANALYSIS - File Change Frequency and Risk Analysis
  // ========================================================================

  /**
   * Default risk thresholds for code churn analysis
   */
  private readonly DEFAULT_CHURN_THRESHOLDS: ChurnRiskThresholds = {
    high: 30,
    medium: 15,
    low: 0,
  };

  /**
   * Determine risk level based on change count and thresholds
   */
  private determineRiskLevel(
    changes: number,
    thresholds: ChurnRiskThresholds
  ): ChurnRiskLevel {
    if (changes >= thresholds.high) return 'high';
    if (changes >= thresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Build git log arguments for churn analysis
   */
  private buildChurnAnalysisArgs(options?: ChurnFilterOptions): string[] {
    const args = ['log', '--name-only', '--pretty=format:%H|%cI|%an'];

    // Add date filters
    if (options?.since) {
      args.push(`--since=${options.since}`);
    }
    if (options?.until) {
      args.push(`--until=${options.until}`);
    }

    // Add path filters if specified
    if (options?.paths && options.paths.length > 0) {
      args.push('--');
      args.push(...options.paths);
    }

    return args;
  }

  /**
   * Parse git log output for churn analysis
   * Extracts file paths and associated commit information
   */
  private parseChurnLogOutput(
    output: string,
    options?: ChurnFilterOptions
  ): Map<
    string,
    {
      changes: number;
      firstChange?: string;
      lastChange?: string;
      authors: Set<string>;
    }
  > {
    const fileChurnMap = new Map<
      string,
      {
        changes: number;
        firstChange?: string;
        lastChange?: string;
        authors: Set<string>;
      }
    >();

    const lines = output.split('\n');
    let currentCommitDate: string | null = null;
    let currentAuthor: string | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Check if this is a commit header line
      if (trimmedLine.includes('|')) {
        const parts = trimmedLine.split('|');
        if (parts.length >= 3) {
          currentCommitDate = parts[1];
          currentAuthor = parts[2];
          continue;
        }
      }

      // This is a file path
      if (currentCommitDate && currentAuthor && trimmedLine) {
        const filePath = trimmedLine;

        // Apply extension filter if specified
        if (options?.extensions && options.extensions.length > 0) {
          const fileExt = path.extname(filePath).substring(1); // Remove leading dot
          if (!options.extensions.includes(fileExt)) {
            continue;
          }
        }

        // Initialize or update file churn data
        if (!fileChurnMap.has(filePath)) {
          fileChurnMap.set(filePath, {
            changes: 0,
            firstChange: currentCommitDate,
            lastChange: currentCommitDate,
            authors: new Set(),
          });
        }

        const fileData = fileChurnMap.get(filePath)!;
        fileData.changes += 1;
        fileData.authors.add(currentAuthor);

        // Update date range (git log is in reverse chronological order)
        if (
          !fileData.lastChange ||
          new Date(currentCommitDate) > new Date(fileData.lastChange)
        ) {
          fileData.lastChange = currentCommitDate;
        }
        if (
          !fileData.firstChange ||
          new Date(currentCommitDate) < new Date(fileData.firstChange)
        ) {
          fileData.firstChange = currentCommitDate;
        }
      }
    }

    return fileChurnMap;
  }

  /**
   * Apply filters and sorting to churn data
   */
  private filterAndSortChurnData(
    churnData: FileChurnData[],
    options?: ChurnFilterOptions
  ): FileChurnData[] {
    let filtered = churnData;

    // Filter by minimum changes
    if (options?.minChanges !== undefined && options.minChanges > 0) {
      const minChanges = options.minChanges;
      filtered = filtered.filter((file) => file.changes >= minChanges);
    }

    // Filter by risk levels
    if (options?.riskLevels && options.riskLevels.length > 0) {
      filtered = filtered.filter((file) =>
        options.riskLevels!.includes(file.risk)
      );
    }

    // Sort by changes (descending) - highest churn files first
    filtered.sort((a, b) => b.changes - a.changes);

    return filtered;
  }

  /**
   * Calculate metadata for churn analysis
   */
  private calculateChurnMetadata(
    files: FileChurnData[],
    thresholds: ChurnRiskThresholds,
    dateRange: { from: string; to: string },
    options?: ChurnFilterOptions,
    processingTime?: number
  ): CodeChurnAnalysis['metadata'] {
    const totalChanges = files.reduce((sum, file) => sum + file.changes, 0);

    const highRiskCount = files.filter((f) => f.risk === 'high').length;
    const mediumRiskCount = files.filter((f) => f.risk === 'medium').length;
    const lowRiskCount = files.filter((f) => f.risk === 'low').length;

    return {
      totalFiles: files.length,
      totalChanges,
      riskThresholds: thresholds,
      dateRange,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
      analyzedAt: new Date().toISOString(),
      filterOptions: options,
      processingTime,
    };
  }

  /**
   * NEW: Analyze code churn (file change frequency) for the repository
   * Returns detailed analysis of which files change most frequently
   */
  async analyzeCodeChurn(
    localRepoPath: string,
    options?: ChurnFilterOptions,
    customThresholds?: ChurnRiskThresholds
  ): Promise<CodeChurnAnalysis> {
    const startTime = Date.now();
    logger.info(`Analyzing code churn for: ${localRepoPath}`, { options });

    try {
      const localGit = simpleGit(localRepoPath);

      // Determine date range
      const until = options?.until || new Date().toISOString();
      const since =
        options?.since || subDays(new Date(), 365).toISOString().split('T')[0]; // Default: last year

      // Use custom thresholds or defaults
      const thresholds = customThresholds || this.DEFAULT_CHURN_THRESHOLDS;

      // Build and execute git log command
      const args = this.buildChurnAnalysisArgs({
        ...options,
        since,
        until,
      });

      logger.debug('Executing git log for churn analysis', {
        args: args.join(' '),
      });

      const raw = await localGit.raw(args);

      // Parse the output to extract file change frequencies
      const fileChurnMap = this.parseChurnLogOutput(raw, options);

      // Convert to FileChurnData array with risk levels
      const filesWithChurn: FileChurnData[] = Array.from(
        fileChurnMap.entries()
      ).map(([filePath, data]) => {
        const extension = path.extname(filePath);
        const risk = this.determineRiskLevel(data.changes, thresholds);

        return {
          path: filePath,
          changes: data.changes,
          risk,
          extension: extension || undefined,
          firstChange: data.firstChange,
          lastChange: data.lastChange,
          authorCount: data.authors.size,
        };
      });

      // Apply filters and sorting
      const filteredFiles = this.filterAndSortChurnData(
        filesWithChurn,
        options
      );

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      // Build metadata
      const metadata = this.calculateChurnMetadata(
        filteredFiles,
        thresholds,
        { from: since, to: until },
        options,
        processingTime
      );

      logger.info(`Successfully analyzed code churn for ${localRepoPath}`, {
        totalFiles: metadata.totalFiles,
        totalChanges: metadata.totalChanges,
        highRiskCount: metadata.highRiskCount,
        mediumRiskCount: metadata.mediumRiskCount,
        lowRiskCount: metadata.lowRiskCount,
        processingTime,
      });

      return {
        files: filteredFiles,
        metadata,
      };
    } catch (error) {
      logger.error(`Error analyzing code churn for ${localRepoPath}`, {
        error,
        localRepoPath,
      });
      throw new RepositoryError(
        `Failed to analyze code churn: ${error instanceof Error ? error.message : String(error)}`,
        localRepoPath
      );
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
              repoType: repoType === 'unknown' ? undefined : repoType,
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
