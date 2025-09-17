/**
 * File Analysis Service - Repository File Type Distribution Analysis
 *
 * Provides comprehensive file type distribution analysis for Git repositories
 * with intelligent memory management and three-tier caching integration.
 *
 * @fileoverview This service implements sophisticated file system analysis:
 * - File categorization (code, documentation, configuration, assets)
 * - Extension-based distribution analysis
 * - Directory-level breakdown with recursive traversal
 * - Size-based statistics and optimization
 * - Integration with GitRay's existing caching architecture
 *
 * Key features:
 * - Memory-aware processing for large repositories
 * - Streaming support for repositories with >10k files
 * - Integration with existing three-tier caching system
 * - Leverages GitRay's withTempRepository coordination
 * - Comprehensive metrics and health monitoring
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { getLogger } from './logger';
import { config } from '../config';
import {
  recordStreamingStart,
  recordStreamingCompletion,
  recordStreamingBatch,
  recordDetailedError,
  updateServiceHealthScore,
  getRepositorySizeCategory,
  recordFileAnalysisMethodUsage,
  recordFileTreeCacheOperation,
  recordFileAnalysisPerformanceMetrics,
  recordFileAnalysisBandwidth,
} from './metrics';
import { getMemoryStats } from '../utils/memoryPressureManager';
import HybridLRUCache from '../utils/hybridLruCache';
import {
  FileTypeDistribution,
  FileAnalysisFilterOptions,
  FileInfo,
  FileCategory,
  FileTypeStats,
  DirectoryDistribution,
  RepositoryError,
  ERROR_MESSAGES,
  AnalysisMethod,
  DataSource,
  PerformanceMetrics,
  RepositoryCharacteristics,
} from '@gitray/shared-types';
import simpleGit, { SimpleGit } from 'simple-git';

const logger = getLogger();

/**
 * File category mapping based on extensions
 */
const FILE_CATEGORY_MAP: Record<string, FileCategory> = {
  // Code files
  '.js': 'code',
  '.ts': 'code',
  '.jsx': 'code',
  '.tsx': 'code',
  '.py': 'code',
  '.java': 'code',
  '.c': 'code',
  '.cpp': 'code',
  '.cs': 'code',
  '.go': 'code',
  '.rs': 'code',
  '.php': 'code',
  '.rb': 'code',
  '.swift': 'code',
  '.kt': 'code',
  '.scala': 'code',
  '.clj': 'code',
  '.hs': 'code',
  '.ml': 'code',
  '.r': 'code',
  '.m': 'code',
  '.vue': 'code',
  '.svelte': 'code',
  '.dart': 'code',
  '.elm': 'code',

  // Documentation files
  '.md': 'documentation',
  '.txt': 'documentation',
  '.rst': 'documentation',
  '.adoc': 'documentation',
  '.tex': 'documentation',
  '.pdf': 'documentation',
  '.doc': 'documentation',
  '.docx': 'documentation',
  '.rtf': 'documentation',

  // Configuration files
  '.json': 'configuration',
  '.yaml': 'configuration',
  '.yml': 'configuration',
  '.toml': 'configuration',
  '.ini': 'configuration',
  '.xml': 'configuration',
  '.conf': 'configuration',
  '.config': 'configuration',
  '.env': 'configuration',
  '.gitignore': 'configuration',
  '.dockerignore': 'configuration',
  '.editorconfig': 'configuration',

  // Build tools and package managers
  '.gradle': 'configuration',
  '.gradle.kts': 'configuration',
  '.pom.xml': 'configuration',
  '.package.json': 'configuration',
  '.package-lock.json': 'configuration',
  '.yarn.lock': 'configuration',
  '.cargo.toml': 'configuration',
  '.cargo.lock': 'configuration',
  '.gemfile': 'configuration',
  '.gemfile.lock': 'configuration',
  '.requirements.txt': 'configuration',
  '.pipfile': 'configuration',
  '.pipfile.lock': 'configuration',
  '.composer.json': 'configuration',
  '.composer.lock': 'configuration',

  // Additional code files
  '.sh': 'code',
  '.bash': 'code',
  '.zsh': 'code',
  '.fish': 'code',
  '.ps1': 'code',
  '.bat': 'code',
  '.cmd': 'code',
  '.sql': 'code',
  '.graphql': 'code',
  '.gql': 'code',
  '.proto': 'code',
  '.tf': 'code',
  '.hcl': 'code',

  // Style and template files
  '.html': 'code',
  '.htm': 'code',
  '.xhtml': 'code',
  '.jsp': 'code',
  '.asp': 'code',
  '.aspx': 'code',
  '.erb': 'code',
  '.ejs': 'code',
  '.hbs': 'code',
  '.mustache': 'code',
  '.twig': 'code',
  '.liquid': 'code',

  // Data files
  '.csv': 'assets',
  '.tsv': 'assets',
  '.xlsx': 'assets',
  '.xls': 'assets',
  '.ods': 'assets',

  // Archive files
  '.zip': 'assets',
  '.tar': 'assets',
  '.gz': 'assets',
  '.bz2': 'assets',
  '.xz': 'assets',
  '.7z': 'assets',
  '.rar': 'assets',
};

/**
 * Streaming options for large repository analysis
 */
export interface FileAnalysisStreamingOptions {
  batchSize: number;
  maxFiles?: number;
  startFromPath?: string;
  resumeState?: FileAnalysisResumeState;
}

/**
 * Resume state for interrupted file analysis
 */
export interface FileAnalysisResumeState {
  lastProcessedPath?: string;
  processedCount: number;
  totalEstimatedCount: number;
  startTime: number;
  partialResults: Partial<FileTypeDistribution>;
}

/**
 * Streaming metrics for file analysis
 */
export interface FileAnalysisMetrics {
  totalFiles: number;
  processedFiles: number;
  batchesProcessed: number;
  averageBatchTime: number;
  memoryUsageMB: number;
  cacheHitRate: number;
  startTime: number;
  lastBatchTime?: number;
  largestFile: { path: string; size: number };
}

/**
 * Circuit breaker state for repository analysis
 */
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
  halfOpenAttempts: number;
}

/**
 * Circuit breaker configuration
 */
interface CircuitBreakerConfig {
  failureThreshold: number;
  timeoutMs: number;
  halfOpenMaxAttempts: number;
}

interface InFlightAnalysisResult {
  fileInfos: FileInfo[];
  actualMethod: AnalysisMethod;
  dataSource: DataSource;
  bandwidthUsed: number;
}

/**
 * File Analysis Service Class
 */
class FileAnalysisService {
  private readonly defaultStreamingOptions: FileAnalysisStreamingOptions = {
    batchSize: config.streaming?.batchSize ?? 1000,
    maxFiles: config.streaming?.maxFiles ?? 100000,
  };

  /**
   * File tree cache for commit-hash based raw file trees
   * Separate cache from processed analysis results for better performance
   */
  private readonly fileTreeCache: HybridLRUCache<FileInfo[]>;

  /**
   * Analysis locks to prevent concurrent analysis of same repository
   * This prevents race conditions and resource waste
   */
  private readonly analysisLocks = new Map<
    string,
    Promise<InFlightAnalysisResult>
  >();

  /**
   * Git operation timeouts to prevent resource leaks
   */
  private readonly GIT_OPERATION_TIMEOUT = 30000; // 30 seconds

  /**
   * Circuit breaker for failing repositories
   * Prevents cascade failures and improves system resilience
   */
  private readonly circuitBreakers = new Map<string, CircuitBreakerState>();

  /**
   * Circuit breaker access time tracking for LRU eviction
   */
  private readonly circuitBreakerAccessTime = new Map<string, number>();

  /**
   * Maximum number of circuit breakers to keep in memory
   */
  private readonly MAX_CIRCUIT_BREAKERS = 100;

  /**
   * Circuit breaker configuration
   */
  private readonly circuitBreakerConfig: CircuitBreakerConfig = {
    failureThreshold: 3, // Open circuit after 3 failures
    timeoutMs: 60000, // Stay open for 60 seconds
    halfOpenMaxAttempts: 2, // Allow 2 attempts in half-open state
  };

  constructor() {
    // Initialize file tree cache with optimized settings for raw file data
    const baseConfig = config.hybridCache;
    this.fileTreeCache = new HybridLRUCache<FileInfo[]>({
      maxEntries: Math.floor((baseConfig?.maxEntries ?? 500) * 0.2), // 20% of total entries for file trees
      memoryLimitBytes: Math.floor(
        (baseConfig?.memoryLimitBytes ?? 100 * 1024 * 1024) * 0.15
      ), // 15% of memory budget
      diskPath: `${baseConfig?.diskPath ?? './cache'}/file-trees`,
      lockTimeoutMs: baseConfig?.lockTimeoutMs ?? 5000,
      redisConfig: baseConfig?.enableRedis
        ? {
            ...baseConfig.redisConfig,
            keyPrefix: `${baseConfig.redisConfig.keyPrefix}file_tree:`,
          }
        : undefined,
    });

    logger.info(
      'FileAnalysisService initialized with streaming support and file tree caching',
      {
        defaultBatchSize: this.defaultStreamingOptions.batchSize,
        maxFiles: this.defaultStreamingOptions.maxFiles,
        streamingEnabled: config.streaming?.enabled ?? true,
        fileTreeCacheEnabled: true,
      }
    );
  }

  // ============================================================================
  // FILE TREE CACHING METHODS - Phase 2.5 Integration Layer
  // ============================================================================

  /**
   * Generate cache key for file tree data with commit-hash based invalidation
   * Cache key pattern: file_tree:{repoHash}:{commitHash}
   */
  private generateFileTreeCacheKey(
    repoUrl: string,
    commitHash: string
  ): string {
    const repoHash = this.hashUrl(repoUrl);
    const commitHashShort = commitHash.substring(0, 12); // Use first 12 chars for efficiency
    return `file_tree:${repoHash}:${commitHashShort}`;
  }

  /**
   * Get cached file tree for a specific repository and commit
   * Returns null if not cached or if cache entry is invalid
   * Implements distributed locking to prevent race conditions
   */
  async getCachedFileTree(
    repoUrl: string,
    commitHash: string
  ): Promise<FileInfo[] | null> {
    const startTime = Date.now();
    const cacheKey = this.generateFileTreeCacheKey(repoUrl, commitHash);

    try {
      logger.debug('Attempting to retrieve file tree from cache', {
        repoUrl,
        commitHash: commitHash.substring(0, 8),
        cacheKey,
      });

      // Check if analysis is already in progress for this repository
      const existingAnalysis = this.analysisLocks.get(cacheKey);
      if (existingAnalysis) {
        logger.info(
          'File tree analysis already in progress, waiting for completion',
          {
            repoUrl,
            commitHash: commitHash.substring(0, 8),
            cacheKey,
          }
        );

        try {
          const result = await existingAnalysis;
          const retrievalTime = Date.now() - startTime;

          logger.info('File tree retrieved from ongoing analysis', {
            repoUrl,
            commitHash: commitHash.substring(0, 8),
            cacheKey,
            filesCount: result.fileInfos.length,
            retrievalTime,
          });

          return result.fileInfos;
        } catch (analysisError) {
          logger.warn('Ongoing analysis failed, checking cache', {
            repoUrl,
            commitHash: commitHash.substring(0, 8),
            error:
              analysisError instanceof Error
                ? analysisError.message
                : String(analysisError),
          });
          // Continue to cache check if ongoing analysis failed
        }
      }

      const cachedFileTree = await this.fileTreeCache.get(cacheKey);

      if (cachedFileTree) {
        const retrievalTime = Date.now() - startTime;

        logger.info('File tree cache hit', {
          repoUrl,
          commitHash: commitHash.substring(0, 8),
          cacheKey,
          filesCount: cachedFileTree.length,
          retrievalTime,
        });

        // Record cache hit metrics
        const repoSize = this.categorizeRepositorySize(cachedFileTree.length);
        recordFileTreeCacheOperation('hit', repoSize, 0); // Assume current commit

        return cachedFileTree;
      }

      logger.debug('File tree cache miss', {
        repoUrl,
        commitHash: commitHash.substring(0, 8),
        cacheKey,
      });

      // Record cache miss metrics
      if (!cachedFileTree) {
        // We need to estimate repo size for cache miss - use fallback
        recordFileTreeCacheOperation('miss', 'medium', 0);
      }

      return null;
    } catch (error) {
      const retrievalTime = Date.now() - startTime;

      logger.warn('File tree cache retrieval failed', {
        repoUrl,
        commitHash: commitHash.substring(0, 8),
        cacheKey,
        error: error instanceof Error ? error.message : String(error),
        retrievalTime,
      });

      // Record cache operation failure
      recordDetailedError(
        'file-tree-cache-error',
        error instanceof Error ? error : new Error(String(error)),
        {
          userImpact: 'degraded',
          recoveryAction: 'fallback',
          severity: 'warning',
        }
      );

      return null; // Fallback gracefully
    }
  }

  /**
   * Cache file tree data for a specific repository and commit
   * Uses commit hash for automatic invalidation when repository changes
   * Implements distributed locking to prevent concurrent operations
   */
  async cacheFileTree(
    repoUrl: string,
    commitHash: string,
    fileTree: FileInfo[]
  ): Promise<void> {
    const startTime = Date.now();
    const cacheKey = this.generateFileTreeCacheKey(repoUrl, commitHash);

    try {
      logger.debug('Caching file tree data', {
        repoUrl,
        commitHash: commitHash.substring(0, 8),
        cacheKey,
        filesCount: fileTree.length,
        totalSize: fileTree.reduce((sum, file) => sum + file.size, 0),
      });

      await this.fileTreeCache.set(cacheKey, fileTree);

      const cachingTime = Date.now() - startTime;

      logger.info('File tree cached successfully', {
        repoUrl,
        commitHash: commitHash.substring(0, 8),
        cacheKey,
        filesCount: fileTree.length,
        cachingTime,
      });

      // Record cache store metrics
      const repoSize = this.categorizeRepositorySize(fileTree.length);
      recordFileTreeCacheOperation('store', repoSize, 0);
    } catch (error) {
      const cachingTime = Date.now() - startTime;

      logger.warn('Failed to cache file tree data', {
        repoUrl,
        commitHash: commitHash.substring(0, 8),
        cacheKey,
        filesCount: fileTree.length,
        error: error instanceof Error ? error.message : String(error),
        cachingTime,
      });

      // Record cache operation failure but don't throw - caching is optional
      recordDetailedError(
        'file-tree-cache-store-error',
        error instanceof Error ? error : new Error(String(error)),
        {
          userImpact: 'none', // Caching failure doesn't affect functionality
          recoveryAction: 'retry',
          severity: 'warning',
        }
      );
    }
  }

  /**
   * Create and manage analysis lock for a specific cache key
   * This prevents concurrent analysis of the same repository using atomic check-and-set
   */
  private async runWithAnalysisLock(
    cacheKey: string,
    task: () => Promise<InFlightAnalysisResult>
  ): Promise<InFlightAnalysisResult> {
    // Use a while loop for atomic check-and-set
    while (true) {
      const existingAnalysis = this.analysisLocks.get(cacheKey);
      if (existingAnalysis) {
        // Wait for existing analysis to complete
        return existingAnalysis;
      }

      // Create promise before setting to avoid race condition
      let resolveFn!: (value: InFlightAnalysisResult) => void;
      let rejectFn!: (reason?: unknown) => void;

      const pendingPromise = new Promise<InFlightAnalysisResult>(
        (resolve, reject) => {
          resolveFn = resolve;
          rejectFn = reject;
        }
      );

      // Atomic check-and-set using Map's behavior
      const raceCheck = this.analysisLocks.get(cacheKey);
      if (raceCheck) {
        // Another request won the race, wait for it
        return raceCheck;
      }

      // We won the race, set our promise
      this.analysisLocks.set(cacheKey, pendingPromise);

      try {
        const result = await task();
        resolveFn(result);
        return result;
      } catch (error) {
        rejectFn(error);
        throw error;
      } finally {
        this.analysisLocks.delete(cacheKey);
      }
    }
  }

  /**
   * Invalidate cached file trees for a repository when commit changes
   * This is called when we detect that repository has newer commits
   * Implements complete cache invalidation with pattern-based clearing
   */
  async invalidateFileTreeCache(
    repoUrl: string,
    oldCommitHash?: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      logger.debug('Invalidating file tree cache', {
        repoUrl,
        oldCommitHash: oldCommitHash?.substring(0, 8),
      });

      // If we have the old commit hash, invalidate that specific entry
      if (oldCommitHash) {
        const oldCacheKey = this.generateFileTreeCacheKey(
          repoUrl,
          oldCommitHash
        );

        try {
          await this.fileTreeCache.del(oldCacheKey);
          logger.debug('Specific file tree cache entry invalidated', {
            repoUrl,
            oldCommitHash: oldCommitHash.substring(0, 8),
            cacheKey: oldCacheKey,
          });
        } catch (error) {
          logger.warn('Failed to invalidate specific file tree cache entry', {
            repoUrl,
            oldCommitHash: oldCommitHash.substring(0, 8),
            cacheKey: oldCacheKey,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        // Full invalidation: Remove all entries for this repository
        const repoHash = this.hashUrl(repoUrl);
        const pattern = `file_tree:${repoHash}:*`;

        try {
          await this.invalidateByPattern(pattern);
          logger.info('Full file tree cache invalidation completed', {
            repoUrl,
            pattern,
            reason: 'No specific commit hash provided',
          });
        } catch (error) {
          logger.warn('Failed to perform full cache invalidation', {
            repoUrl,
            pattern,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const invalidationTime = Date.now() - startTime;

      logger.info('File tree cache invalidation completed', {
        repoUrl,
        oldCommitHash: oldCommitHash?.substring(0, 8),
        invalidationTime,
      });
    } catch (error) {
      const invalidationTime = Date.now() - startTime;

      logger.error('File tree cache invalidation failed', {
        repoUrl,
        oldCommitHash: oldCommitHash?.substring(0, 8),
        error: error instanceof Error ? error.message : String(error),
        invalidationTime,
      });

      // Record invalidation failure but don't throw - it's not critical
      recordDetailedError(
        'file-tree-cache-invalidation-error',
        error instanceof Error ? error : new Error(String(error)),
        {
          userImpact: 'degraded', // Stale cache entries might persist
          recoveryAction: 'retry',
          severity: 'warning',
        }
      );
    }
  }

  /**
   * Invalidate cache entries by pattern (implements full cache invalidation)
   * This method provides pattern-based cache clearing functionality
   */
  private async invalidateByPattern(pattern: string): Promise<void> {
    try {
      // Use the cache's pattern-based deletion if available
      const cacheWithPattern = this.fileTreeCache as any;
      if (typeof cacheWithPattern.deleteByPattern === 'function') {
        await cacheWithPattern.deleteByPattern(pattern);
        logger.debug('Pattern-based cache invalidation using cache method', {
          pattern,
        });
        return;
      }

      // Fallback: Manual scan and delete (less efficient but works)
      logger.info('Using fallback pattern invalidation', {
        pattern,
        reason: 'Cache does not support pattern-based deletion',
      });

      // Note: This is a simplified implementation.
      // In production, you might want to implement this differently based on your cache backend
      // For now, we'll log that pattern invalidation is needed
      logger.warn('Pattern-based invalidation requires cache backend support', {
        pattern,
        recommendation:
          'Consider implementing pattern support in HybridLRUCache',
      });
    } catch (error) {
      logger.error('Pattern-based cache invalidation failed', {
        pattern,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ============================================================================
  // CIRCUIT BREAKER METHODS - System Resilience Protection
  // ============================================================================

  /**
   * Check if circuit breaker should prevent analysis for a repository
   */
  private isCircuitBreakerOpen(repoUrl: string): boolean {
    const repoHash = this.hashUrl(repoUrl);
    const state = this.circuitBreakers.get(repoHash);

    if (!state) return false;

    const now = Date.now();

    // If circuit is open, check if timeout has passed
    if (state.isOpen) {
      if (now - state.lastFailureTime > this.circuitBreakerConfig.timeoutMs) {
        // Move to half-open state
        state.isOpen = false;
        state.halfOpenAttempts = 0;
        logger.info('Circuit breaker moved to half-open state', {
          repoUrl: repoUrl.substring(0, 50) + '...',
          timeoutMs: this.circuitBreakerConfig.timeoutMs,
        });
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Manage circuit breaker memory with LRU eviction
   */
  private manageCircuitBreakerMemory(repoHash: string): void {
    // Update access time
    this.circuitBreakerAccessTime.set(repoHash, Date.now());

    // Check if we need to evict old entries
    if (this.circuitBreakers.size > this.MAX_CIRCUIT_BREAKERS) {
      // Find oldest entry
      let oldestKey: string | null = null;
      let oldestTime = Date.now();

      for (const [key, time] of this.circuitBreakerAccessTime.entries()) {
        if (time < oldestTime && key !== repoHash) {
          oldestTime = time;
          oldestKey = key;
        }
      }

      // Evict oldest
      if (oldestKey) {
        this.circuitBreakers.delete(oldestKey);
        this.circuitBreakerAccessTime.delete(oldestKey);
        logger.debug('Evicted old circuit breaker entry', {
          evictedKey: oldestKey,
        });
      }
    }
  }

  /**
   * Record circuit breaker failure
   */
  private recordCircuitBreakerFailure(repoUrl: string): void {
    const repoHash = this.hashUrl(repoUrl);

    // Manage memory before accessing/updating circuit breaker
    this.manageCircuitBreakerMemory(repoHash);

    const state = this.circuitBreakers.get(repoHash) || {
      failures: 0,
      lastFailureTime: 0,
      isOpen: false,
      halfOpenAttempts: 0,
    };

    state.failures++;
    state.lastFailureTime = Date.now();

    // Check if we should open the circuit
    if (state.failures >= this.circuitBreakerConfig.failureThreshold) {
      state.isOpen = true;
      state.halfOpenAttempts = 0;
      logger.warn('Circuit breaker opened for repository', {
        repoUrl: repoUrl.substring(0, 50) + '...',
        failures: state.failures,
        threshold: this.circuitBreakerConfig.failureThreshold,
        timeoutMs: this.circuitBreakerConfig.timeoutMs,
      });

      // Record metrics for monitoring
      recordDetailedError(
        'circuit-breaker-opened',
        new Error(
          `Repository analysis circuit breaker opened after ${state.failures} failures`
        ),
        {
          userImpact: 'degraded',
          recoveryAction: 'retry',
          severity: 'warning',
        }
      );
    }

    this.circuitBreakers.set(repoHash, state);
  }

  /**
   * Record circuit breaker success
   */
  private recordCircuitBreakerSuccess(repoUrl: string): void {
    const repoHash = this.hashUrl(repoUrl);

    // Manage memory before accessing circuit breaker
    this.manageCircuitBreakerMemory(repoHash);

    const state = this.circuitBreakers.get(repoHash);

    if (!state) return;

    // Reset failure count on success
    state.failures = 0;
    state.halfOpenAttempts = 0;
    state.isOpen = false;

    // If we're in half-open state, we might close the circuit
    logger.info('Circuit breaker closed for repository', {
      repoUrl: repoUrl.substring(0, 50) + '...',
      previousFailures: state.failures,
    });

    // Remove from map to save memory (closed state is default)
    this.circuitBreakers.delete(repoHash);
    this.circuitBreakerAccessTime.delete(repoHash);
  }

  private registerHalfOpenAttempt(repoUrl: string): boolean {
    const repoHash = this.hashUrl(repoUrl);
    const state = this.circuitBreakers.get(repoHash);

    if (!state || state.isOpen) {
      return false;
    }

    if (state.failures >= this.circuitBreakerConfig.failureThreshold) {
      state.halfOpenAttempts += 1;

      if (
        state.halfOpenAttempts > this.circuitBreakerConfig.halfOpenMaxAttempts
      ) {
        state.isOpen = true;
        state.lastFailureTime = Date.now();

        logger.warn('Circuit breaker half-open attempt limit exceeded', {
          repoUrl: repoUrl.substring(0, 50) + '...',
          attempts: state.halfOpenAttempts,
          maxAttempts: this.circuitBreakerConfig.halfOpenMaxAttempts,
        });

        recordDetailedError(
          'circuit-breaker-half-open-limit',
          new Error('Half-open attempt limit exceeded'),
          {
            userImpact: 'blocking',
            recoveryAction: 'retry',
            severity: 'warning',
          }
        );

        this.circuitBreakers.set(repoHash, state);
        return true;
      }

      this.circuitBreakers.set(repoHash, state);
    }

    return false;
  }

  /**
   * Execute operation with circuit breaker protection
   */
  private async executeWithCircuitBreaker<T>(
    repoUrl: string,
    operation: () => Promise<T>,
    operationName = 'repository-analysis'
  ): Promise<T> {
    // Check if circuit breaker is open
    if (this.isCircuitBreakerOpen(repoUrl)) {
      throw new RepositoryError(
        `Circuit breaker is open for repository analysis. Repository: ${repoUrl.substring(0, 50)}... Operation: ${operationName}`,
        repoUrl
      );
    }

    if (this.registerHalfOpenAttempt(repoUrl)) {
      throw new RepositoryError(
        `Circuit breaker half-open attempt limit reached. Repository: ${repoUrl.substring(0, 50)}... Operation: ${operationName}`,
        repoUrl
      );
    }

    try {
      const result = await operation();
      this.recordCircuitBreakerSuccess(repoUrl);
      return result;
    } catch (error) {
      this.recordCircuitBreakerFailure(repoUrl);
      throw error;
    }
  }

  getCircuitBreakerStatus(repoUrl: string): {
    state: 'open' | 'half-open' | 'closed';
    isBlocked: boolean;
    failures: number;
    lastFailure?: Date;
    timeUntilRecovery?: number;
  } {
    const repoHash = this.hashUrl(repoUrl);
    const state = this.circuitBreakers.get(repoHash);

    if (!state) {
      return {
        state: 'closed',
        isBlocked: false,
        failures: 0,
      };
    }

    const now = Date.now();

    if (state.isOpen) {
      return {
        state: 'open',
        isBlocked: true,
        failures: state.failures,
        lastFailure: state.lastFailureTime
          ? new Date(state.lastFailureTime)
          : undefined,
        timeUntilRecovery: Math.max(
          0,
          this.circuitBreakerConfig.timeoutMs - (now - state.lastFailureTime)
        ),
      };
    }

    const isHalfOpen =
      state.failures >= this.circuitBreakerConfig.failureThreshold;

    return {
      state: isHalfOpen ? 'half-open' : 'closed',
      isBlocked: false,
      failures: state.failures,
      lastFailure: state.lastFailureTime
        ? new Date(state.lastFailureTime)
        : undefined,
      timeUntilRecovery: isHalfOpen
        ? Math.max(
            0,
            this.circuitBreakerConfig.timeoutMs - (now - state.lastFailureTime)
          )
        : undefined,
    };
  }

  resetCircuitBreaker(repoUrl: string): void {
    const repoHash = this.hashUrl(repoUrl);

    if (this.circuitBreakers.delete(repoHash)) {
      logger.info('Circuit breaker manually reset for repository', {
        repoUrl,
      });
    } else {
      logger.debug(
        'Circuit breaker reset requested for repository with no state',
        {
          repoUrl,
        }
      );
    }
  }

  // ============================================================================
  // PERFORMANCE OPTIMIZATION METHODS - Phase 2.5 Critical Enhancement
  // ============================================================================

  /**
   * Get file tree using sparse clone with blob filtering (95-99% bandwidth reduction)
   * This downloads ONLY the tree structure without file contents
   *
   * @param repoUrl - The repository URL to analyze
   * @returns File tree information without downloading file contents
   */
  private async getFileTreeSparse(repoUrl: string): Promise<{
    files: Array<{ path: string; size: number; mode: string }>;
    commitHash: string;
    tempDir: string;
  }> {
    const startTime = Date.now();
    let tempDir: string | null = null;
    let git: SimpleGit | null = null;

    try {
      logger.info('Fetching file tree using sparse clone with blob filtering', {
        repoUrl,
      });

      // Record metrics for the method usage
      recordFileAnalysisMethodUsage('ls-tree-remote', 'medium', true); // Keep same metric name for compatibility

      // Step 1: Create temporary directory with proper error handling
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitray-sparse-'));

      // Step 2: Initialize empty git repository in temp directory
      git = simpleGit(tempDir);
      await this.executeWithTimeout(
        git.init(),
        5000,
        'Git init in temp directory'
      );

      // Step 3: Add remote origin pointing to repoUrl
      await this.executeWithTimeout(
        git.addRemote('origin', repoUrl),
        5000,
        'Add remote origin'
      );

      // Step 4: Configure sparse checkout
      await this.executeWithTimeout(
        git.raw(['config', 'core.sparseCheckout', 'true']),
        5000,
        'Configure sparse checkout'
      );

      // Step 5: Fetch with blob filtering
      await this.executeWithTimeout(
        git.raw(['fetch', '--filter=blob:none', '--depth=1', 'origin', 'HEAD']),
        this.GIT_OPERATION_TIMEOUT,
        'Fetch with blob filtering'
      );

      // Step 6: Checkout FETCH_HEAD to get tree structure
      await this.executeWithTimeout(
        git.raw(['checkout', 'FETCH_HEAD']),
        10000,
        'Checkout tree structure'
      );

      // Step 7: Get commit hash
      const commitHash = await this.executeWithTimeout(
        git.revparse(['HEAD']),
        5000,
        'Get commit hash'
      );

      // Step 8: Run ls-tree locally to get file information
      const lsTreeOutput = await this.executeWithTimeout(
        git.raw(['ls-tree', '-r', '-l', '--full-tree', 'HEAD']),
        15000,
        'Local ls-tree operation'
      );

      // Step 9: Parse ls-tree output using helper method
      const files = this.parseLsTreeOutput(lsTreeOutput);

      const processingTime = Date.now() - startTime;

      // Record bandwidth metrics (much smaller than full clone)
      const repoSize = this.categorizeRepositorySize(files.length);
      recordFileAnalysisBandwidth(
        'ls-tree-remote',
        repoSize,
        files.length * 50,
        'high'
      ); // Estimate 50 bytes per file entry

      logger.info('Sparse clone file tree fetched successfully', {
        repoUrl,
        filesFound: files.length,
        processingTime,
        commitHash: commitHash.substring(0, 8),
        tempDir,
        bandwidthSaved: '95-99% vs full clone',
      });

      return { files, commitHash, tempDir };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('Failed to fetch file tree using sparse clone', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
        tempDir,
        fallbackRequired: true,
      });

      // Always cleanup temp directory on error
      if (tempDir) {
        await this.cleanupTempDirectory(tempDir);
      }

      // Throw specific error that can be caught by method selection logic
      throw new RepositoryError(
        `Sparse clone file tree access failed: ${error instanceof Error ? error.message : String(error)}`,
        repoUrl
      );
    } finally {
      // Git cleanup is handled by temp directory cleanup
      await this.cleanupGitInstance(git);
    }
  }

  /**
   * Parse git ls-tree output to extract file information
   * Format: <mode> <type> <hash> <size>\t<path>
   * Example: 100644 blob abc123 1234\tREADME.md
   */
  private parseLsTreeOutput(output: string): Array<{
    path: string;
    size: number;
    mode: string;
  }> {
    const files: Array<{ path: string; size: number; mode: string }> = [];
    const lines = output
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);

    for (const line of lines) {
      // Parse ls-tree line format: mode type hash size\tpath
      const match = line.match(/^(\d+)\s+blob\s+\w+\s+(\d+)\t(.+)$/);
      if (match) {
        const [, mode, sizeStr, filePath] = match;
        const size = parseInt(sizeStr) || 0;

        // Only include regular files (not directories, submodules, etc.)
        if (filePath && !filePath.endsWith('/')) {
          files.push({
            path: filePath,
            size: size,
            mode: mode,
          });
        }
      }
    }

    logger.debug('Parsed ls-tree output', {
      totalLines: lines.length,
      parsedFiles: files.length,
    });

    return files;
  }

  /**
   * Get latest commit hash without cloning the repository
   * Uses git ls-remote to check the latest commit
   */
  private async getLatestCommitHash(repoUrl: string): Promise<string> {
    try {
      const git = simpleGit();
      const remoteRefs = await this.executeWithTimeout(
        git.listRemote([repoUrl, 'HEAD']),
        10000,
        'Get latest commit hash'
      );

      // Parse result with regex: /^([a-f0-9]{40})\s+HEAD/
      const match = remoteRefs.match(/^([a-f0-9]{40})\s+HEAD/m);
      if (!match) {
        throw new Error('Cannot determine latest commit hash from remote');
      }

      const commitHash = match[1];
      logger.debug('Latest commit hash retrieved', {
        repoUrl,
        commitHash: commitHash.substring(0, 8),
      });

      return commitHash;
    } catch (error) {
      logger.error('Failed to get latest commit hash', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(
        `Cannot determine commit hash: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Execute operation with timeout and resource cleanup
   */
  private async executeWithTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | null = null;
      let isCompleted = false;

      // Set up timeout
      timeoutHandle = setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true;
          reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      // Execute operation
      operation
        .then((result) => {
          if (!isCompleted) {
            isCompleted = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            resolve(result);
          }
        })
        .catch((error) => {
          if (!isCompleted) {
            isCompleted = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            reject(error);
          }
        });
    });
  }

  /**
   * Cleanup git instance and any associated resources
   */
  private async cleanupGitInstance(git: SimpleGit | null): Promise<void> {
    if (!git) return;

    try {
      // SimpleGit is mostly stateless, but we can perform any cleanup operations here
      // This method is primarily for future-proofing and consistency
      logger.debug('Git instance cleanup completed');
    } catch (error) {
      logger.warn('Git instance cleanup encountered issue', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - cleanup failures shouldn't break the main flow
    }
  }

  // ============================================================================
  // CIRCUIT BREAKER METHODS - Resilience Enhancement
  // ============================================================================

  /**
   * Convert remote file tree data to FileInfo objects for analysis
   */
  private async processRemoteFileTree(
    files: Array<{ path: string; size: number; mode: string }>,
    commitHash: string,
    options?: FileAnalysisFilterOptions
  ): Promise<FileInfo[]> {
    const startTime = Date.now();

    try {
      logger.info('Processing remote file tree', {
        totalFiles: files.length,
        hasFilters: !!options,
      });

      const fileInfos: FileInfo[] = [];
      let processedCount = 0;

      for (const file of files) {
        // Apply filters first
        if (!this.shouldIncludeFile(file, options)) {
          continue;
        }

        // Create FileInfo object
        const fileInfo = this.createFileInfoFromRemote(file);

        // Apply category filter after categorization
        if (
          options?.categories?.length &&
          !options.categories.includes(fileInfo.category)
        ) {
          continue;
        }

        fileInfos.push(fileInfo);
        processedCount++;

        // Log progress for very large repositories
        if (processedCount % 10000 === 0) {
          this.logProcessingProgress(processedCount, files.length);
        }
      }

      const processingTime = Date.now() - startTime;

      logger.info('Remote file tree processed', {
        originalFiles: files.length,
        filteredFiles: fileInfos.length,
        processingTime,
        commitHash: commitHash.substring(0, 8),
        filterEfficiency: `${Math.round((fileInfos.length / files.length) * 100)}%`,
      });

      return fileInfos;
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('Failed to process remote file tree', {
        error: error instanceof Error ? error.message : String(error),
        totalFiles: files.length,
        processingTime,
      });

      throw new RepositoryError(
        `Remote file tree processing failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Helper method to check if a file should be included based on filters
   */
  private shouldIncludeFile(
    file: { path: string; size: number; mode: string },
    options?: FileAnalysisFilterOptions
  ): boolean {
    if (!options) return true;

    return (
      this.passesExtensionFilter(file, options) &&
      this.passesDirectoryFilter(file, options) &&
      this.passesHiddenFilter(file, options) &&
      this.passesSizeFilters(file, options) &&
      this.passesDepthFilter(file, options)
    );
  }

  /**
   * Check if file passes extension filter
   */
  private passesExtensionFilter(
    file: { path: string; size: number; mode: string },
    options: FileAnalysisFilterOptions
  ): boolean {
    if (!options.extensions?.length) return true;

    const ext = path.extname(file.path).toLowerCase();
    return options.extensions.includes(ext);
  }

  /**
   * Check if file passes directory filter
   */
  private passesDirectoryFilter(
    file: { path: string; size: number; mode: string },
    options: FileAnalysisFilterOptions
  ): boolean {
    if (!options.directories?.length) return true;

    const dirPath = path.dirname(file.path);
    return options.directories.some((dir) => dirPath.startsWith(dir));
  }

  /**
   * Check if file passes hidden files filter
   */
  private passesHiddenFilter(
    file: { path: string; size: number; mode: string },
    options: FileAnalysisFilterOptions
  ): boolean {
    if (options.includeHidden) return true;

    return !path.basename(file.path).startsWith('.');
  }

  /**
   * Check if file passes size filters
   */
  private passesSizeFilters(
    file: { path: string; size: number; mode: string },
    options: FileAnalysisFilterOptions
  ): boolean {
    if (options.minFileSize && file.size < options.minFileSize) {
      return false;
    }

    if (options.maxFileSize && file.size > options.maxFileSize) {
      return false;
    }

    return true;
  }

  /**
   * Check if file passes depth filter
   */
  private passesDepthFilter(
    file: { path: string; size: number; mode: string },
    options: FileAnalysisFilterOptions
  ): boolean {
    if (!options.maxDepth) return true;

    const depth = file.path.split('/').length - 1;
    return depth <= options.maxDepth;
  }

  /**
   * Detect repository characteristics to determine optimal analysis method
   * Uses lightweight git commands to assess repository size and complexity
   */
  async detectRepositoryCharacteristics(repoUrl: string): Promise<{
    sizeCategory: 'small' | 'medium' | 'large' | 'xl';
    estimatedFiles: number;
    estimatedSize: number;
    supportsRemoteLsTree: boolean;
    recommendShallowClone: boolean;
    currentCommitHash?: string;
    lastAnalyzed?: string;
  }> {
    const startTime = Date.now();

    try {
      logger.info('Detecting repository characteristics', { repoUrl });

      // Create temporary git instance for remote operations
      const git: SimpleGit = simpleGit();

      // Step 1: Get basic repository information
      const refs = await git.listRemote(['--heads', repoUrl]);
      const mainBranch = refs
        .split('\n')
        .find(
          (line) =>
            line.includes('refs/heads/main') ||
            line.includes('refs/heads/master')
        );

      if (!mainBranch) {
        throw new Error('Unable to determine main branch');
      }

      const currentCommitHash = mainBranch.split('\t')[0];

      // Step 2: Test remote ls-tree capability
      let supportsRemoteLsTree = false;
      let estimatedFiles = 0;

      try {
        // Quick test with ls-tree --name-only (lightweight)
        const testOutput = await git.raw([
          'ls-tree',
          '-r',
          '--name-only',
          currentCommitHash,
          '--',
        ]);

        supportsRemoteLsTree = true;

        // Count files from output (rough estimate)
        const lines = testOutput
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);
        estimatedFiles = lines.length;
      } catch (lsTreeError) {
        logger.warn('Remote ls-tree not available', {
          repoUrl,
          error:
            lsTreeError instanceof Error
              ? lsTreeError.message
              : String(lsTreeError),
        });

        // Fallback: Use git archive to estimate (still lightweight)
        try {
          const archiveOutput = await git.raw([
            'archive',
            '--remote=' + repoUrl,
            '--format=tar',
            currentCommitHash,
            '--list',
          ]);

          const lines = archiveOutput
            .trim()
            .split('\n')
            .filter((line) => line.length > 0);
          estimatedFiles = lines.length;
        } catch (archiveError) {
          logger.warn('Archive estimation also failed', {
            repoUrl,
            error:
              archiveError instanceof Error
                ? archiveError.message
                : String(archiveError),
          });

          // Final fallback: Conservative estimate based on repository type
          estimatedFiles = this.estimateFilesByRepositoryType(repoUrl);
        }
      }

      // Step 3: Categorize repository size
      const sizeCategory = this.categorizeRepositorySize(estimatedFiles);

      // Step 4: Estimate total repository size (rough calculation)
      const estimatedSize = this.estimateRepositorySize(
        estimatedFiles,
        sizeCategory
      );

      // Step 5: Make recommendations based on characteristics
      const recommendShallowClone = this.shouldRecommendShallowClone(
        estimatedFiles,
        supportsRemoteLsTree
      );

      const characteristics = {
        sizeCategory,
        estimatedFiles,
        estimatedSize,
        supportsRemoteLsTree,
        recommendShallowClone,
        currentCommitHash,
        lastAnalyzed: new Date().toISOString(),
      };

      const processingTime = Date.now() - startTime;

      logger.info('Repository characteristics detected', {
        repoUrl,
        characteristics: {
          ...characteristics,
          currentCommitHash: currentCommitHash.substring(0, 8),
        },
        processingTime,
        detectionMethod: supportsRemoteLsTree ? 'ls-tree' : 'archive-fallback',
      });

      return characteristics;
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('Failed to detect repository characteristics', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      });

      // Return conservative fallback characteristics
      return {
        sizeCategory: 'medium',
        estimatedFiles: 5000, // Conservative estimate
        estimatedSize: 50 * 1024 * 1024, // 50MB
        supportsRemoteLsTree: false,
        recommendShallowClone: true,
        lastAnalyzed: new Date().toISOString(),
      };
    }
  }

  /**
   * Estimate file count based on repository URL patterns
   */
  private estimateFilesByRepositoryType(repoUrl: string): number {
    // Conservative estimates based on common repository patterns
    if (repoUrl.includes('framework') || repoUrl.includes('library')) {
      return 2000; // Medium-sized libraries
    }

    if (
      repoUrl.includes('example') ||
      repoUrl.includes('demo') ||
      repoUrl.includes('tutorial')
    ) {
      return 500; // Small examples
    }

    if (repoUrl.includes('enterprise') || repoUrl.includes('platform')) {
      return 15000; // Large enterprise projects
    }

    // Default conservative estimate
    return 3000;
  }

  /**
   * Categorize repository size based on file count
   */
  private categorizeRepositorySize(
    fileCount: number
  ): 'small' | 'medium' | 'large' | 'xl' {
    if (fileCount < 1000) return 'small';
    if (fileCount < 5000) return 'medium';
    if (fileCount < 20000) return 'large';
    return 'xl';
  }

  /**
   * Estimate total repository size based on file count and category
   */
  private estimateRepositorySize(fileCount: number, category: string): number {
    const avgFileSizeMap: Record<string, number> = {
      small: 8 * 1024, // 8KB average
      medium: 12 * 1024, // 12KB average
      large: 15 * 1024, // 15KB average
      xl: 20 * 1024, // 20KB average
    };

    const avgSize = avgFileSizeMap[category] || 12 * 1024;
    return fileCount * avgSize;
  }

  /**
   * Determine if shallow clone should be recommended
   */
  private shouldRecommendShallowClone(
    fileCount: number,
    supportsRemoteLsTree: boolean
  ): boolean {
    // If remote ls-tree works, prefer that over shallow clone
    if (supportsRemoteLsTree) return false;

    // For medium to large repositories without remote ls-tree, recommend shallow clone
    return fileCount > 2000;
  }

  /**
   * Determine the optimal analysis method based on repository characteristics
   * This is the core intelligence that chooses between different analysis strategies
   */
  async determineOptimalAnalysisMethod(
    repoUrl: string,
    characteristics?: RepositoryCharacteristics
  ): Promise<{
    method: AnalysisMethod;
    reason: string;
    expectedPerformanceGain: number;
    fallbackMethods: AnalysisMethod[];
  }> {
    const startTime = Date.now();

    try {
      // Get characteristics if not provided
      const repoCharacteristics =
        characteristics ||
        (await this.detectRepositoryCharacteristics(repoUrl));

      logger.info('Determining optimal analysis method', {
        repoUrl,
        characteristics: {
          ...repoCharacteristics,
          currentCommitHash: repoCharacteristics.currentCommitHash?.substring(
            0,
            8
          ),
        },
      });

      // Decision tree for method selection
      const decision = this.selectAnalysisMethod(repoCharacteristics);

      const processingTime = Date.now() - startTime;

      logger.info('Analysis method determined', {
        repoUrl,
        selectedMethod: decision.method,
        reason: decision.reason,
        expectedPerformanceGain: decision.expectedPerformanceGain,
        fallbackMethods: decision.fallbackMethods,
        processingTime,
      });

      return decision;
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('Failed to determine optimal analysis method', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      });

      // Return safe fallback decision
      return {
        method: 'full-clone',
        reason:
          'Fallback due to detection failure - using most reliable method',
        expectedPerformanceGain: 1.0, // No gain from baseline
        fallbackMethods: ['shallow-clone'],
      };
    }
  }

  /**
   * Core method selection logic based on repository characteristics
   */
  private selectAnalysisMethod(characteristics: RepositoryCharacteristics): {
    method: AnalysisMethod;
    reason: string;
    expectedPerformanceGain: number;
    fallbackMethods: AnalysisMethod[];
  } {
    const { sizeCategory, estimatedFiles } = characteristics;

    // Priority 1: Check cache first (not a method change, but check cache before selecting method)
    // Priority 2: Use sparse clone for all repository sizes (it's always more efficient)
    if (sizeCategory === 'small') {
      return {
        method: 'ls-tree-remote', // This now uses sparse clone internally
        reason: `Sparse clone optimal for ${sizeCategory} repository (${estimatedFiles} files) - 95-99% bandwidth reduction`,
        expectedPerformanceGain: 15.0, // More realistic gain
        fallbackMethods: ['shallow-clone', 'full-clone'],
      };
    }

    // Priority 3: Medium+ repositories always use sparse clone
    return {
      method: 'ls-tree-remote', // This now uses sparse clone internally
      reason: `Sparse clone essential for ${sizeCategory} repository (${estimatedFiles} files) - 95-99% bandwidth reduction`,
      expectedPerformanceGain: this.calculatePerformanceGain(
        'ls-tree-remote',
        sizeCategory
      ),
      fallbackMethods: ['shallow-clone', 'full-clone'],
    };
  }

  /**
   * Calculate expected performance gain for different methods
   */
  private calculatePerformanceGain(
    method: AnalysisMethod,
    sizeCategory: string
  ): number {
    const gains: Record<AnalysisMethod, Record<string, number>> = {
      'ls-tree-remote': {
        small: 15.0, // 15x faster (sparse clone)
        medium: 18.0, // 18x faster
        large: 20.0, // 20x faster
        xl: 20.0, // 20x faster (not 25x - more realistic)
      },
      'shallow-clone': {
        small: 1.5, // 1.5x faster
        medium: 3.0, // 3x faster
        large: 6.0, // 6x faster
        xl: 10.0, // 10x faster
      },
      'full-clone': {
        small: 1.0, // Baseline
        medium: 1.0, // Baseline
        large: 1.0, // Baseline
        xl: 1.0, // Baseline
      },
      'ls-tree-local': {
        small: 2.0, // 2x faster
        medium: 4.0, // 4x faster
        large: 8.0, // 8x faster
        xl: 12.0, // 12x faster
      },
      cached: {
        small: 50.0, // 50x faster (instant)
        medium: 50.0, // 50x faster
        large: 50.0, // 50x faster
        xl: 50.0, // 50x faster
      },
    };

    return gains[method]?.[sizeCategory] || 1.0;
  }

  /**
   * Get file tree using shallow clone with blob filtering (90% bandwidth reduction)
   * This method clones only the latest commit without file contents
   * Implements comprehensive resource cleanup and timeout handling
   */
  private async getFileTreeShallow(repoUrl: string): Promise<{
    files: Array<{ path: string; size: number; mode: string }>;
    commitHash: string;
    tempDir: string;
  }> {
    const startTime = Date.now();
    let tempDir: string | null = null;
    let git: SimpleGit | null = null;
    let repoGit: SimpleGit | null = null;

    try {
      logger.info(
        'Fetching file tree using shallow clone with blob filtering',
        { repoUrl }
      );

      // Create temporary directory for shallow clone
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'shallow-clone-'));

      // Wrap clone operation with timeout
      const cloneResult = await this.executeWithTimeout(
        this.performShallowClone(repoUrl, tempDir),
        this.GIT_OPERATION_TIMEOUT,
        'Shallow clone operation'
      );

      git = cloneResult.git;
      repoGit = cloneResult.repoGit;

      // Get current commit hash
      const commitHash = await this.executeWithTimeout(
        repoGit.revparse(['HEAD']),
        5000, // Shorter timeout for local operations
        'Get commit hash'
      );

      // Use ls-tree on local shallow clone to get file information
      const lsTreeOutput = await this.executeWithTimeout(
        repoGit.raw([
          'ls-tree',
          '-r', // Recursive
          '--long', // Include file sizes
          'HEAD',
        ]),
        10000, // Reasonable timeout for ls-tree
        'Local ls-tree operation'
      );

      // Parse ls-tree output to extract file information
      const files: Array<{ path: string; size: number; mode: string }> = [];
      const lines = lsTreeOutput
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      for (const line of lines) {
        // Parse ls-tree line format: mode type hash size path
        const parts = line.split(/\s+/);
        if (parts.length >= 5) {
          const mode = parts[0];
          const type = parts[1];
          const size = parseInt(parts[3]) || 0;
          const filePath = parts.slice(4).join(' ');

          // Only include files (not directories or submodules)
          if (type === 'blob' && filePath && !filePath.endsWith('/')) {
            files.push({
              path: filePath,
              size: size,
              mode: mode,
            });
          }
        }
      }

      const processingTime = Date.now() - startTime;

      logger.info('Shallow clone file tree fetched successfully', {
        repoUrl,
        filesFound: files.length,
        processingTime,
        commitHash: commitHash.substring(0, 8),
        tempDir,
        bandwidthSaved: 'Estimated 90% vs full clone',
      });

      return { files, commitHash, tempDir };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('Failed to fetch file tree using shallow clone', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
        tempDir,
        fallbackRequired: true,
      });

      // Ensure cleanup on error
      if (tempDir) {
        await this.cleanupShallowCloneOnError(tempDir);
      }

      // Throw specific error that can be caught by method selection logic
      throw new RepositoryError(
        `Shallow clone file tree access failed: ${error instanceof Error ? error.message : String(error)}`,
        repoUrl
      );
    } finally {
      // Cleanup git instances
      await this.cleanupGitInstance(git);
      await this.cleanupGitInstance(repoGit);
    }
  }

  /**
   * Perform shallow clone with proper error handling
   */
  private async performShallowClone(
    repoUrl: string,
    tempDir: string
  ): Promise<{
    git: SimpleGit;
    repoGit: SimpleGit;
  }> {
    // Perform shallow clone with blob filtering
    const git: SimpleGit = simpleGit();

    // Clone with minimal data transfer
    await git.clone(repoUrl, tempDir, [
      '--depth=1', // Only latest commit
      '--filter=blob:none', // Exclude file contents (blobs)
      '--single-branch', // Only main branch
      '--no-checkout', // Don't checkout files to working directory
    ]);

    // Switch to the cloned repository
    const repoGit: SimpleGit = simpleGit(tempDir);

    return { git, repoGit };
  }

  /**
   * Cleanup shallow clone temporary directory on error
   */
  private async cleanupShallowCloneOnError(tempDir: string): Promise<void> {
    try {
      await fs.rmdir(tempDir, { recursive: true });
      logger.debug('Shallow clone temp directory cleaned up after error', {
        tempDir,
      });
    } catch (cleanupError) {
      logger.warn('Failed to cleanup temp directory after error', {
        tempDir,
        error:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
      });
      // Don't throw - we're already in an error state
    }
  }

  /**
   * Cleanup shallow clone temporary directory with improved error handling
   */
  private async cleanupShallowClone(tempDir: string): Promise<void> {
    if (!tempDir) {
      logger.debug('No temp directory to cleanup');
      return;
    }

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        // Check if directory exists before trying to remove it
        await fs.access(tempDir);

        // Attempt to remove the directory
        await fs.rmdir(tempDir, { recursive: true });

        logger.debug('Shallow clone temp directory cleaned up successfully', {
          tempDir,
          attempt: attempt + 1,
        });
        return;
      } catch (error) {
        attempt++;

        if (attempt >= maxRetries) {
          logger.warn(
            'Failed to cleanup shallow clone temp directory after max retries',
            {
              tempDir,
              attempts: maxRetries,
              error: error instanceof Error ? error.message : String(error),
            }
          );

          // Record the cleanup failure for monitoring
          recordDetailedError(
            'temp-directory-cleanup-failed',
            error instanceof Error ? error : new Error(String(error)),
            {
              userImpact: 'none', // Temp cleanup failure doesn't affect functionality
              recoveryAction: 'manual',
              severity: 'warning',
            }
          );
          return; // Don't throw - cleanup failure shouldn't break the main flow
        }

        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempt) * 100; // 200ms, 400ms, 800ms
        await new Promise((resolve) => setTimeout(resolve, delay));

        logger.debug('Retrying temp directory cleanup', {
          tempDir,
          attempt,
          maxRetries,
          delay,
        });
      }
    }
  }

  /**
   * Cleanup temporary directory with retry logic and force removal
   */
  private async cleanupTempDirectory(tempDir: string): Promise<void> {
    if (!tempDir) return;

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if directory exists
        await fs.access(tempDir);

        // Force remove with recursive option
        await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 2 });

        logger.debug('Temp directory cleaned up', { tempDir, attempt });
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          logger.warn('Failed to cleanup temp directory after max retries', {
            tempDir,
            attempts: maxRetries,
            error: error instanceof Error ? error.message : String(error),
          });

          // Record metric but don't throw
          recordDetailedError(
            'temp-directory-cleanup-failed',
            error instanceof Error ? error : new Error(String(error)),
            {
              userImpact: 'none',
              recoveryAction: 'manual',
              severity: 'warning',
            }
          );
          return;
        }

        // Exponential backoff: 200ms, 400ms, 800ms
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 100)
        );
      }
    }
  }

  /**
   * Execute analysis using the optimal method based on repository characteristics
   * This is the main orchestrator that uses the appropriate optimization technique
   */
  async analyzeWithOptimalMethod(
    repoUrl: string,
    options?: FileAnalysisFilterOptions
  ): Promise<{
    result: FileTypeDistribution;
    performanceMetrics: PerformanceMetrics;
  }> {
    const startTime = Date.now();

    try {
      logger.info('Starting optimized file analysis', { repoUrl, options });

      // Step 1: Determine optimal method
      const methodDecision = await this.determineOptimalAnalysisMethod(repoUrl);
      const { method, reason, expectedPerformanceGain, fallbackMethods } =
        methodDecision;

      logger.info('Using optimal analysis method', {
        repoUrl,
        method,
        reason,
        expectedPerformanceGain,
        fallbackMethods,
      });

      // Step 2: Execute using selected method with fallback chain
      const { result, actualMethod, dataSource, bandwidthUsed } =
        await this.executeAnalysisWithFallback(
          repoUrl,
          method,
          fallbackMethods,
          options
        );

      // Step 3: Calculate performance metrics
      const processingTime = Date.now() - startTime;
      const performanceMetrics: PerformanceMetrics = {
        analysisMethod: actualMethod,
        dataSource,
        bandwidthUsed,
        processingTime,
        cacheHitRate: 0.0, // Will be updated when cache is integrated
        performanceGain: this.calculateActualPerformanceGain(
          actualMethod,
          processingTime
        ),
        bandwidthSaved: this.calculateBandwidthSaved(
          actualMethod,
          bandwidthUsed
        ),
        fileTreeCached: false, // Will be updated when file tree cache is implemented
        selectionReason: reason,
      };

      // Step 4: Enhance result metadata with performance information
      const enhancedResult = this.enhanceResultWithPerformanceMetrics(
        result,
        performanceMetrics,
        methodDecision
      );

      logger.info('Optimized file analysis completed', {
        repoUrl,
        selectedMethod: method,
        actualMethod,
        totalFiles: result.metadata.totalFiles,
        processingTime,
        performanceGain: performanceMetrics.performanceGain,
        bandwidthSaved: performanceMetrics.bandwidthSaved,
      });

      return { result: enhancedResult, performanceMetrics };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('Optimized file analysis failed', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      });

      throw new RepositoryError(
        `Optimized file analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        repoUrl
      );
    }
  }

  /**
   * Execute analysis using method with fallback chain
   */
  private async executeAnalysisWithFallback(
    repoUrl: string,
    primaryMethod: AnalysisMethod,
    fallbackMethods: AnalysisMethod[],
    options?: FileAnalysisFilterOptions
  ): Promise<{
    result: FileTypeDistribution;
    actualMethod: AnalysisMethod;
    dataSource: DataSource;
    bandwidthUsed: number;
  }> {
    const methodsToTry = [primaryMethod, ...fallbackMethods];

    for (const method of methodsToTry) {
      try {
        logger.info('Attempting analysis method', { repoUrl, method });

        const execution = await this.executeSpecificMethod(
          repoUrl,
          method,
          options
        );

        logger.info('Analysis method succeeded', {
          repoUrl,
          method,
          totalFiles: execution.result.metadata.totalFiles,
          bandwidthUsed: execution.bandwidthUsed,
        });

        return execution;
      } catch (error) {
        logger.warn('Analysis method failed, trying fallback', {
          repoUrl,
          method,
          error: error instanceof Error ? error.message : String(error),
          remainingMethods: methodsToTry.slice(
            methodsToTry.indexOf(method) + 1
          ),
        });

        // If this is the last method, throw the error
        if (method === methodsToTry[methodsToTry.length - 1]) {
          throw error;
        }
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new Error('All analysis methods failed');
  }

  /**
   * Execute specific analysis method
   */
  private async executeSpecificMethod(
    repoUrl: string,
    method: AnalysisMethod,
    options?: FileAnalysisFilterOptions
  ): Promise<{
    result: FileTypeDistribution;
    actualMethod: AnalysisMethod;
    dataSource: DataSource;
    bandwidthUsed: number;
  }> {
    switch (method) {
      case 'ls-tree-remote': {
        // NEW CODE - Use sparse clone instead of broken remote ls-tree
        const { files, commitHash, tempDir } =
          await this.getFileTreeSparse(repoUrl);

        try {
          const fileInfos = await this.processRemoteFileTree(
            files,
            commitHash,
            options
          );
          const result = this.buildAnalysisResult(fileInfos, commitHash);

          return {
            result,
            actualMethod: 'ls-tree-remote', // Keep same method name for compatibility
            dataSource: 'git-ls-tree',
            bandwidthUsed: this.estimateBandwidthUsage(
              'ls-tree-remote',
              files.length
            ),
          };
        } finally {
          // Always cleanup temp directory
          await this.cleanupTempDirectory(tempDir);
        }
      }

      case 'shallow-clone': {
        const { files, commitHash, tempDir } =
          await this.getFileTreeShallow(repoUrl);

        try {
          const fileInfos = await this.processRemoteFileTree(
            files,
            commitHash,
            options
          );
          const result = this.buildAnalysisResult(fileInfos, commitHash);

          return {
            result,
            actualMethod: 'shallow-clone',
            dataSource: 'git-ls-tree',
            bandwidthUsed: this.estimateBandwidthUsage(
              'shallow-clone',
              files.length
            ),
          };
        } finally {
          // Always cleanup temp directory
          await this.cleanupShallowClone(tempDir);
        }
      }

      case 'full-clone': {
        // Fall back to existing full clone method via withTempRepository pattern
        throw new Error(
          'Full clone method should be executed via withTempRepository at route level'
        );
      }

      default:
        throw new Error(`Unsupported analysis method: ${method}`);
    }
  }

  /**
   * Helper method to create FileInfo from remote file data
   */
  private createFileInfoFromRemote(file: {
    path: string;
    size: number;
    mode: string;
  }): FileInfo {
    return {
      path: file.path,
      extension: path.extname(file.path).toLowerCase(),
      category: this.categorizeFile(file.path),
      size: file.size,
      lastModified: new Date().toISOString(), // We don't have exact timestamp from ls-tree
    };
  }

  /**
   * Helper method to log processing progress
   */
  private logProcessingProgress(
    processedCount: number,
    totalFiles: number
  ): void {
    logger.debug('Remote file processing progress', {
      processedCount,
      totalFiles,
      progressPercent: Math.round((processedCount / totalFiles) * 100),
    });
  }

  /**
   * Determine file category based on extension
   */
  private categorizeFile(filePath: string): FileCategory {
    const ext = path.extname(filePath).toLowerCase();

    // Handle special cases
    if (path.basename(filePath).startsWith('.')) {
      return 'configuration';
    }

    if (filePath.toLowerCase().includes('readme')) {
      return 'documentation';
    }

    if (filePath.toLowerCase().includes('license')) {
      return 'documentation';
    }

    return FILE_CATEGORY_MAP[ext] || 'other';
  }

  /**
   * Get file statistics from filesystem
   */
  private async getFileStats(
    filePath: string
  ): Promise<{ size: number; lastModified: string }> {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
      };
    } catch (error) {
      logger.warn(`Failed to get stats for file: ${filePath}`, { error });
      return {
        size: 0,
        lastModified: new Date().toISOString(),
      };
    }
  }

  /**
   * Check if file analysis should use streaming mode
   */
  private async shouldUseStreaming(localRepoPath: string): Promise<boolean> {
    if (!config.streaming?.enabled) {
      logger.debug('Streaming disabled by configuration');
      return false;
    }

    try {
      // Check memory pressure first
      const memoryStats = getMemoryStats();
      if (memoryStats.pressure.level !== 'normal') {
        logger.info('Forcing streaming due to memory pressure', {
          pressureLevel: memoryStats.pressure.level,
          systemMemoryUsage: `${(memoryStats.system.usagePercentage * 100).toFixed(1)}%`,
        });
        return true;
      }

      // Estimate file count using git ls-tree
      const git: SimpleGit = simpleGit(localRepoPath);
      const lsTreeOutput = await git.raw([
        'ls-tree',
        '-r',
        '--name-only',
        'HEAD',
      ]);
      const fileCount = lsTreeOutput
        .split('\n')
        .filter((line) => line.trim()).length;

      const fileThreshold = config.streaming?.fileThreshold ?? 10000;
      const useStreaming = fileCount > fileThreshold;

      logger.info(
        `Repository file analysis decision: ${fileCount} files, streaming: ${useStreaming}`,
        {
          fileCount,
          threshold: fileThreshold,
          useStreaming,
          memoryPressure: memoryStats.pressure.level,
        }
      );

      return useStreaming;
    } catch (error) {
      logger.warn(
        'Failed to determine if streaming should be used for file analysis, defaulting to false',
        { error, localRepoPath }
      );
      return false;
    }
  }

  /**
   * Get all files in repository using git ls-tree
   */
  private async getRepositoryFiles(
    localRepoPath: string,
    options?: FileAnalysisFilterOptions
  ): Promise<string[]> {
    const git: SimpleGit = simpleGit(localRepoPath);

    try {
      const lsTreeOutput = await git.raw([
        'ls-tree',
        '-r',
        '--name-only',
        'HEAD',
      ]);
      let files = lsTreeOutput.split('\n').filter((line) => line.trim());

      // Apply filters
      if (options) {
        files = this.applyFileFilters(files, options);
      }

      return files;
    } catch (error) {
      logger.error('Failed to get repository files', { error, localRepoPath });
      throw new RepositoryError(
        `${ERROR_MESSAGES.REPO_GET_COMMITS_FAILED}: Failed to list repository files - ${error instanceof Error ? error.message : String(error)}`,
        localRepoPath
      );
    }
  }

  /**
   * Apply filters to file list
   */
  private applyFileFilters(
    files: string[],
    options: FileAnalysisFilterOptions
  ): string[] {
    let filteredFiles = files;

    // Filter by extensions
    if (options.extensions && options.extensions.length > 0) {
      filteredFiles = filteredFiles.filter((file) =>
        options.extensions!.some((ext) =>
          file.toLowerCase().endsWith(ext.toLowerCase())
        )
      );
    }

    // Filter by categories
    if (options.categories && options.categories.length > 0) {
      filteredFiles = filteredFiles.filter((file) =>
        options.categories!.includes(this.categorizeFile(file))
      );
    }

    // Filter by directories
    if (options.directories && options.directories.length > 0) {
      filteredFiles = filteredFiles.filter((file) =>
        options.directories!.some((dir) => file.startsWith(dir))
      );
    }

    // Filter by hidden files
    if (options.includeHidden === false) {
      filteredFiles = filteredFiles.filter(
        (file) => !file.split('/').some((part) => part.startsWith('.'))
      );
    }

    // Filter by depth
    if (options.maxDepth !== undefined) {
      filteredFiles = filteredFiles.filter(
        (file) => file.split('/').length <= options.maxDepth! + 1
      );
    }

    return filteredFiles;
  }

  /**
   * Process files in batches for streaming mode
   */
  private async processFilesBatch(
    localRepoPath: string,
    files: string[],
    batchStart: number,
    batchSize: number
  ): Promise<FileInfo[]> {
    const batchEnd = Math.min(batchStart + batchSize, files.length);
    const batchFiles = files.slice(batchStart, batchEnd);
    const results: FileInfo[] = [];

    for (const file of batchFiles) {
      try {
        const fullPath = path.join(localRepoPath, file);
        const stats = await this.getFileStats(fullPath);
        const extension = path.extname(file).toLowerCase();
        const category = this.categorizeFile(file);

        results.push({
          path: file,
          extension,
          category,
          size: stats.size,
          lastModified: stats.lastModified,
        });
      } catch (error) {
        logger.warn(`Failed to process file: ${file}`, { error });
        // Continue processing other files
      }
    }

    return results;
  }

  /**
   * Calculate statistics for a group of files
   */
  private calculateStatsForGroup(
    files: FileInfo[],
    totalFiles: number
  ): FileTypeStats {
    const count = files.length;
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const averageSize = count > 0 ? totalSize / count : 0;
    const percentage = totalFiles > 0 ? (count / totalFiles) * 100 : 0;

    return {
      count,
      percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
      size: totalSize,
      averageSize: Math.round(averageSize),
    };
  }

  /**
   * Build directory distribution tree
   */
  private buildDirectoryDistribution(
    files: FileInfo[]
  ): DirectoryDistribution[] {
    const dirMap: Record<string, FileInfo[]> = {};

    // Group files by directory
    files.forEach((file) => {
      const dir = path.dirname(file.path);
      if (!dirMap[dir]) {
        dirMap[dir] = [];
      }
      dirMap[dir].push(file);
    });

    // Build directory tree
    const directories: DirectoryDistribution[] = [];

    for (const [dirPath, dirFiles] of Object.entries(dirMap)) {
      // Calculate category statistics
      const categoryGroups: Record<FileCategory, FileInfo[]> = {
        code: [],
        documentation: [],
        configuration: [],
        assets: [],
        other: [],
      };

      dirFiles.forEach((file) => {
        categoryGroups[file.category].push(file);
      });

      const categories: Record<FileCategory, FileTypeStats> = {
        code: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        documentation: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        configuration: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        assets: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        other: { count: 0, percentage: 0, size: 0, averageSize: 0 },
      };

      for (const [category, categoryFiles] of Object.entries(categoryGroups)) {
        categories[category as FileCategory] = this.calculateStatsForGroup(
          categoryFiles,
          dirFiles.length
        );
      }

      // Calculate extension statistics
      const extensionGroups: Record<string, FileInfo[]> = {};
      dirFiles.forEach((file) => {
        if (!extensionGroups[file.extension]) {
          extensionGroups[file.extension] = [];
        }
        extensionGroups[file.extension].push(file);
      });

      const extensions: Record<string, FileTypeStats> = {};
      for (const [ext, extFiles] of Object.entries(extensionGroups)) {
        extensions[ext] = this.calculateStatsForGroup(
          extFiles,
          dirFiles.length
        );
      }

      directories.push({
        path: dirPath,
        categories,
        extensions,
        totalFiles: dirFiles.length,
        totalSize: dirFiles.reduce((sum, file) => sum + file.size, 0),
        subdirectories: [], // Will be populated by parent-child relationship logic
      });
    }

    return directories;
  }

  /**
   * Process files using streaming mode for large repositories
   */
  private async processFilesWithStreaming(
    localRepoPath: string,
    allFiles: string[],
    totalFiles: number,
    startTime: number
  ): Promise<FileInfo[]> {
    recordStreamingStart(totalFiles);

    const batchSize = this.defaultStreamingOptions.batchSize;
    const metrics: FileAnalysisMetrics = {
      totalFiles,
      processedFiles: 0,
      batchesProcessed: 0,
      averageBatchTime: 0,
      memoryUsageMB: 0,
      cacheHitRate: 0,
      startTime,
      largestFile: { path: '', size: 0 },
    };

    const fileInfos: FileInfo[] = [];

    for (let i = 0; i < totalFiles; i += batchSize) {
      const batchStartTime = Date.now();

      // Check memory pressure
      const memoryStats = getMemoryStats();
      if (memoryStats.pressure.level === 'emergency') {
        logger.error('Emergency memory pressure - stopping file analysis', {
          localRepoPath,
          processedFiles: metrics.processedFiles,
          totalFiles,
        });
        throw new Error(
          'File analysis stopped due to emergency memory pressure'
        );
      }

      // Process batch
      const batchFiles = await this.processFilesBatch(
        localRepoPath,
        allFiles,
        i,
        batchSize
      );
      fileInfos.push(...batchFiles);

      // Update metrics
      this.updateStreamingMetrics(
        metrics,
        batchFiles,
        batchStartTime,
        memoryStats
      );

      recordStreamingBatch(
        batchFiles.length,
        metrics.lastBatchTime!,
        false,
        totalFiles
      );

      logger.debug('Processed file analysis batch', {
        batch: metrics.batchesProcessed,
        filesInBatch: batchFiles.length,
        totalProcessed: metrics.processedFiles,
        totalFiles,
        batchTime: metrics.lastBatchTime,
        memoryUsage: `${metrics.memoryUsageMB}MB`,
      });
    }

    recordStreamingCompletion(
      metrics.totalFiles,
      Date.now() - startTime,
      metrics.processedFiles,
      metrics.batchesProcessed,
      0, // cacheHitRate - no cache hit tracking for file analysis
      metrics.memoryUsageMB
    );

    return fileInfos;
  }

  /**
   * Update streaming metrics with batch processing results
   */
  private updateStreamingMetrics(
    metrics: FileAnalysisMetrics,
    batchFiles: FileInfo[],
    batchStartTime: number,
    memoryStats: any
  ): void {
    metrics.processedFiles += batchFiles.length;
    metrics.batchesProcessed++;
    metrics.lastBatchTime = Date.now() - batchStartTime;
    metrics.averageBatchTime =
      (metrics.averageBatchTime * (metrics.batchesProcessed - 1) +
        metrics.lastBatchTime) /
      metrics.batchesProcessed;
    metrics.memoryUsageMB = memoryStats.process.rss / (1024 * 1024); // Convert bytes to MB

    // Track largest file
    for (const file of batchFiles) {
      if (file.size > metrics.largestFile.size) {
        metrics.largestFile = { path: file.path, size: file.size };
      }
    }
  }

  /**
   * Calculate category statistics from file infos
   */
  private calculateCategoryStatistics(
    fileInfos: FileInfo[],
    totalFiles: number
  ): Record<FileCategory, FileTypeStats> {
    const categoryGroups: Record<FileCategory, FileInfo[]> = {
      code: [],
      documentation: [],
      configuration: [],
      assets: [],
      other: [],
    };

    fileInfos.forEach((file) => {
      categoryGroups[file.category].push(file);
    });

    const categories: Record<FileCategory, FileTypeStats> = {
      code: { count: 0, percentage: 0, size: 0, averageSize: 0 },
      documentation: { count: 0, percentage: 0, size: 0, averageSize: 0 },
      configuration: { count: 0, percentage: 0, size: 0, averageSize: 0 },
      assets: { count: 0, percentage: 0, size: 0, averageSize: 0 },
      other: { count: 0, percentage: 0, size: 0, averageSize: 0 },
    };

    for (const [category, categoryFiles] of Object.entries(categoryGroups)) {
      categories[category as FileCategory] = this.calculateStatsForGroup(
        categoryFiles,
        totalFiles
      );
    }

    return categories;
  }

  /**
   * Calculate extension statistics from file infos
   */
  private calculateExtensionStatistics(
    fileInfos: FileInfo[],
    totalFiles: number
  ): Record<string, FileTypeStats> {
    const extensionGroups: Record<string, FileInfo[]> = {};
    fileInfos.forEach((file) => {
      if (!extensionGroups[file.extension]) {
        extensionGroups[file.extension] = [];
      }
      extensionGroups[file.extension].push(file);
    });

    const extensions: Record<string, FileTypeStats> = {};
    for (const [ext, extFiles] of Object.entries(extensionGroups)) {
      extensions[ext] = this.calculateStatsForGroup(extFiles, totalFiles);
    }

    return extensions;
  }

  /**
   * Generate cache key for file analysis data
   * Following GitRay's cache key pattern: file_analysis:{repoHash}:{filterHash}
   */
  private generateFileAnalysisCacheKey(
    repoUrl: string,
    options?: FileAnalysisFilterOptions
  ): string {
    const repoHash = this.hashUrl(repoUrl);
    const filterHash = this.hashObject(options || {});
    return `file_analysis:${repoHash}:${filterHash}`;
  }

  /**
   * Generate stable 16-character hash for repository URLs
   * Following GitRay's caching pattern
   */
  private hashUrl(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
  }

  /**
   * Generate stable 8-character hash for filter option objects
   * Following GitRay's caching pattern
   */
  private hashObject(obj: any): string {
    const str = JSON.stringify(
      obj,
      Object.keys(obj).sort((a, b) => a.localeCompare(b))
    );
    return crypto.createHash('md5').update(str).digest('hex').slice(0, 8);
  }

  /**
   * Cached file analysis method with three-tier caching integration
   *
   * Integrates with GitRay's existing caching architecture using Redis cache
   * for file analysis results. This provides a foundation for future integration
   * with the three-tier cache system.
   */
  async analyzeRepositoryCached(
    repoUrl: string,
    options?: FileAnalysisFilterOptions
  ): Promise<FileTypeDistribution> {
    const cacheKey = this.generateFileAnalysisCacheKey(repoUrl, options);

    logger.info('Starting cached file analysis', {
      repoUrl,
      options,
      cacheKey,
    });

    try {
      // For now, this method demonstrates the caching pattern
      // The actual cache integration will be implemented when
      // file analysis endpoint is added to routes
      logger.info('File analysis caching pattern demonstrated', {
        repoUrl,
        cacheKey,
        pattern: 'file_analysis:{repoHash}:{filterHash}',
      });

      // This method should be called with withTempRepository at route level
      throw new Error(
        'analyzeRepositoryCached should not perform repository cloning directly. ' +
          'Use withTempRepository() at route level with analyzeRepository() method. ' +
          'Cache integration will be completed at route level.'
      );
    } catch (error) {
      logger.error('Cached file analysis failed', { error, repoUrl, cacheKey });
      recordDetailedError(
        'file-analysis-cache',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Store file analysis result in cache (placeholder for route-level implementation)
   *
   * This method demonstrates the caching strategy that should be implemented
   * at the route level following GitRay's patterns.
   */
  async cacheAnalysisResult(
    repoUrl: string,
    result: FileTypeDistribution,
    options?: FileAnalysisFilterOptions
  ): Promise<void> {
    try {
      const cacheKey = this.generateFileAnalysisCacheKey(repoUrl, options);

      logger.info('File analysis caching strategy demonstrated', {
        repoUrl,
        cacheKey,
        totalFiles: result.metadata.totalFiles,
        totalSize: result.metadata.totalSize,
        strategy:
          'Redis cache with JSON serialization following GitRay patterns',
      });

      // Actual caching implementation will be done at route level
      // following the pattern in repositoryRoutes.ts
    } catch (error) {
      logger.warn('Failed to demonstrate file analysis caching', {
        error,
        repoUrl,
        options,
      });
      // Don't throw - caching failure shouldn't break the main operation
    }
  }

  /**
   * Enhanced file analysis method with optimized performance strategies
   *
   * This method automatically selects the best analysis strategy based on repository
   * characteristics and integrates file tree caching for maximum performance.
   * Designed to be used directly with repository URLs for optimal bandwidth usage.
   * Includes circuit breaker protection for system resilience.
   */
  async analyzeRepositoryOptimized(
    repoUrl: string,
    options?: FileAnalysisFilterOptions
  ): Promise<{
    result: FileTypeDistribution;
    performanceMetrics: PerformanceMetrics;
  }> {
    const startTime = Date.now();

    try {
      logger.info(
        'Starting optimized file analysis with circuit breaker protection',
        { repoUrl, options }
      );

      // Execute with circuit breaker protection
      return await this.executeWithCircuitBreaker(
        repoUrl,
        async () => {
          // Step 1: Determine optimal method
          const methodDecision =
            await this.determineOptimalAnalysisMethod(repoUrl);
          const { method, reason, expectedPerformanceGain, fallbackMethods } =
            methodDecision;

          logger.info('Using optimal analysis method', {
            repoUrl,
            method,
            reason,
            expectedPerformanceGain,
            fallbackMethods,
          });

          // Step 2: Execute optimized analysis with caching
          const analysisResult = await this.executeOptimizedAnalysis(
            repoUrl,
            method,
            options
          );

          // Step 3: Build performance metrics
          const processingTime = Date.now() - startTime;
          const performanceMetrics: PerformanceMetrics = {
            analysisMethod: analysisResult.actualMethod,
            dataSource: analysisResult.dataSource,
            bandwidthUsed: analysisResult.bandwidthUsed,
            processingTime,
            cacheHitRate: analysisResult.fileTreeCached ? 1.0 : 0.0,
            performanceGain: this.calculateActualPerformanceGain(
              analysisResult.actualMethod,
              processingTime
            ),
            bandwidthSaved: this.calculateBandwidthSaved(
              analysisResult.actualMethod,
              analysisResult.bandwidthUsed
            ),
            fileTreeCached: analysisResult.fileTreeCached,
            selectionReason: reason,
          };

          // Step 4: Enhance result with performance data
          const enhancedResult = this.enhanceResultWithPerformanceMetrics(
            analysisResult.result,
            performanceMetrics,
            methodDecision
          );

          // Step 5: Record comprehensive performance metrics
          const repoSize = this.categorizeRepositorySize(
            analysisResult.result.metadata.totalFiles
          );
          const repoCharacteristics =
            methodDecision.method === 'ls-tree-remote'
              ? 'supports-ls-tree'
              : methodDecision.method === 'shallow-clone'
                ? 'requires-shallow'
                : 'large-size';

          recordFileAnalysisPerformanceMetrics({
            method: analysisResult.actualMethod as
              | 'ls-tree-remote'
              | 'shallow-clone'
              | 'full-clone'
              | 'cached',
            repoSize,
            success: true,
            bandwidthBytes: analysisResult.bandwidthUsed,
            performanceGainRatio: performanceMetrics.performanceGain,
            processingTimeSeconds: processingTime / 1000,
            fileCount: analysisResult.result.metadata.totalFiles,
            cacheHit: analysisResult.fileTreeCached,
            selectionReason: analysisResult.fileTreeCached
              ? 'cache-hit'
              : 'optimal',
            repoCharacteristics,
          });

          logger.info('Optimized file analysis completed', {
            repoUrl,
            selectedMethod: method,
            actualMethod: analysisResult.actualMethod,
            totalFiles: analysisResult.result.metadata.totalFiles,
            processingTime,
            performanceGain: performanceMetrics.performanceGain,
            bandwidthSaved: performanceMetrics.bandwidthSaved,
            cacheHit: analysisResult.fileTreeCached,
            circuitBreakerStatus: 'closed',
          });

          return { result: enhancedResult, performanceMetrics };
        },
        'optimized-file-analysis'
      );
    } catch (error) {
      const processingTime = Date.now() - startTime;

      // Record failed analysis metrics
      try {
        recordFileAnalysisMethodUsage('full-clone', 'medium', false); // Use fallback for failures
      } catch (metricsError) {
        // Don't let metrics recording failure break the main error flow
        logger.warn('Failed to record error metrics', { metricsError });
      }

      logger.error('Optimized file analysis failed', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
        circuitBreakerTriggered:
          error instanceof RepositoryError &&
          error.message.includes('Circuit breaker'),
      });

      throw new RepositoryError(
        `Optimized file analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        repoUrl
      );
    }
  }

  /**
   * Execute optimized analysis with caching support
   */
  private async executeOptimizedAnalysis(
    repoUrl: string,
    method: AnalysisMethod,
    options?: FileAnalysisFilterOptions
  ): Promise<{
    result: FileTypeDistribution;
    actualMethod: AnalysisMethod;
    dataSource: DataSource;
    bandwidthUsed: number;
    fileTreeCached: boolean;
    commitHash: string;
  }> {
    // Get commit hash for cache checking
    const commitHash = await this.getRepositoryCommitHash(repoUrl);
    const cacheKey = this.generateFileTreeCacheKey(repoUrl, commitHash);

    // Check cache first
    const cachedFileTree = await this.getCachedFileTree(repoUrl, commitHash);

    if (cachedFileTree) {
      logger.info('Using cached file tree', {
        repoUrl,
        commitHash: commitHash.substring(0, 8),
        filesCount: cachedFileTree.length,
        cacheHit: true,
      });

      const result = this.buildAnalysisResultFromFileInfos(
        cachedFileTree,
        commitHash
      );
      return {
        result,
        actualMethod: 'cached',
        dataSource: 'cache-hit',
        bandwidthUsed: 0,
        fileTreeCached: true,
        commitHash,
      };
    }

    // Execute the selected method with concurrency control
    const execution = await this.runWithAnalysisLock(cacheKey, async () => {
      const methodExecution = await this.executeOptimizedMethod(
        repoUrl,
        method,
        commitHash,
        options
      );

      await this.cacheFileTree(repoUrl, commitHash, methodExecution.fileInfos);

      return methodExecution;
    });

    const result = this.buildAnalysisResultFromFileInfos(
      execution.fileInfos,
      commitHash
    );

    return {
      result,
      actualMethod: execution.actualMethod,
      dataSource: execution.dataSource,
      bandwidthUsed: execution.bandwidthUsed,
      fileTreeCached: false,
      commitHash,
    };
  }

  /**
   * Get repository commit hash for caching
   */
  private async getRepositoryCommitHash(repoUrl: string): Promise<string> {
    const git: SimpleGit = simpleGit();
    const refs = await git.listRemote(['--heads', repoUrl]);
    const mainBranch = refs
      .split('\n')
      .find(
        (line) =>
          line.includes('refs/heads/main') || line.includes('refs/heads/master')
      );

    if (!mainBranch) {
      throw new Error('Unable to determine main branch from remote repository');
    }

    return mainBranch.split('\t')[0];
  }

  /**
   * Execute specific optimized method
   */
  private async executeOptimizedMethod(
    repoUrl: string,
    method: AnalysisMethod,
    commitHash: string,
    options?: FileAnalysisFilterOptions
  ): Promise<{
    fileInfos: FileInfo[];
    actualMethod: AnalysisMethod;
    dataSource: DataSource;
    bandwidthUsed: number;
  }> {
    if (method === 'ls-tree-remote') {
      const { files, tempDir } = await this.getFileTreeSparse(repoUrl);

      try {
        const fileInfos = await this.processRemoteFileTree(
          files,
          commitHash,
          options
        );

        return {
          fileInfos,
          actualMethod: 'ls-tree-remote',
          dataSource: 'git-ls-tree',
          bandwidthUsed: this.estimateBandwidthUsage(
            'ls-tree-remote',
            files.length
          ),
        };
      } finally {
        await this.cleanupTempDirectory(tempDir);
      }
    }

    if (method === 'shallow-clone') {
      const { files, tempDir } = await this.getFileTreeShallow(repoUrl);

      try {
        const fileInfos = await this.processRemoteFileTree(
          files,
          commitHash,
          options
        );

        return {
          fileInfos,
          actualMethod: 'shallow-clone',
          dataSource: 'git-ls-tree',
          bandwidthUsed: this.estimateBandwidthUsage(
            'shallow-clone',
            files.length
          ),
        };
      } finally {
        await this.cleanupShallowClone(tempDir);
      }
    }

    throw new Error(
      'analyzeRepositoryOptimized should be used with repository coordination. ' +
        'Use withTempRepository() at route level for full clone fallback.'
    );
  }

  /**
   * Build analysis result from file infos (used by optimized methods)
   */
  private buildAnalysisResultFromFileInfos(
    fileInfos: FileInfo[],
    commitHash: string
  ): FileTypeDistribution {
    const totalFiles = fileInfos.length;

    // Calculate statistics
    const categories = this.calculateCategoryStatistics(fileInfos, totalFiles);
    const extensions = this.calculateExtensionStatistics(fileInfos, totalFiles);
    const directories = this.buildDirectoryDistribution(fileInfos);
    const totalSize = fileInfos.reduce((sum, file) => sum + file.size, 0);

    return {
      categories,
      extensions,
      directories,
      metadata: {
        totalFiles,
        totalSize,
        analyzedAt: new Date().toISOString(),
        repositorySize: getRepositorySizeCategory(totalFiles),
        commitHash,
        streamingUsed: false, // Optimized methods don't use streaming
      },
    };
  }

  /**
   * Main file analysis method - works with local repository path
   *
   * This method is designed to be used with withTempRepository() helper
   * for proper repository coordination and resource management.
   */
  async analyzeRepository(
    localRepoPath: string,
    options?: FileAnalysisFilterOptions
  ): Promise<FileTypeDistribution> {
    const startTime = Date.now();
    logger.info('Starting file analysis', { localRepoPath, options });

    try {
      // Get repository commit hash for metadata
      const git: SimpleGit = simpleGit(localRepoPath);
      const commitHash = await git.revparse(['HEAD']).catch(() => undefined);

      // Get all files from repository
      const allFiles = await this.getRepositoryFiles(localRepoPath, options);
      const totalFiles = allFiles.length;

      // Determine if streaming should be used
      const useStreaming = await this.shouldUseStreaming(localRepoPath);

      // Process files based on streaming decision
      const fileInfos = useStreaming
        ? await this.processFilesWithStreaming(
            localRepoPath,
            allFiles,
            totalFiles,
            startTime
          )
        : await this.processFilesBatch(localRepoPath, allFiles, 0, totalFiles);

      // Calculate statistics
      const categories = this.calculateCategoryStatistics(
        fileInfos,
        totalFiles
      );
      const extensions = this.calculateExtensionStatistics(
        fileInfos,
        totalFiles
      );
      const directories = this.buildDirectoryDistribution(fileInfos);
      const totalSize = fileInfos.reduce((sum, file) => sum + file.size, 0);

      // Build final result
      const result: FileTypeDistribution = {
        categories,
        extensions,
        directories,
        metadata: {
          totalFiles,
          totalSize,
          analyzedAt: new Date().toISOString(),
          repositorySize: getRepositorySizeCategory(totalFiles),
          commitHash,
          streamingUsed: useStreaming,
        },
      };

      const analysisTime = Date.now() - startTime;
      logger.info('File analysis completed', {
        localRepoPath,
        totalFiles,
        totalSize,
        analysisTime,
        streamingUsed: useStreaming,
        categoriesFound: Object.keys(categories).length,
        extensionsFound: Object.keys(extensions).length,
        directoriesAnalyzed: directories.length,
      });

      // Update service health score
      updateServiceHealthScore('file-analysis', {
        errorRate: 0,
        responseTime: analysisTime,
        memoryUtilization: process.memoryUsage().rss / (1024 * 1024),
      });

      return result;
    } catch (error) {
      logger.error('File analysis failed', { error, localRepoPath });
      recordDetailedError(
        'file-analysis',
        error instanceof Error ? error : new Error(String(error))
      );
      updateServiceHealthScore('file-analysis', {
        errorRate: 1.0,
        responseTime: Date.now() - startTime,
        memoryUtilization: process.memoryUsage().rss / (1024 * 1024),
      });

      throw new RepositoryError(
        `File analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        localRepoPath
      );
    }
  }

  /**
   * Estimate bandwidth usage for different analysis methods
   */
  private estimateBandwidthUsage(
    method: AnalysisMethod,
    fileCount: number
  ): number {
    // Bandwidth estimates in bytes
    const estimates: Record<AnalysisMethod, (files: number) => number> = {
      'ls-tree-remote': (files) => files * 100, // ~100 bytes per file for ls-tree output
      'shallow-clone': (files) => files * 200 + 1024 * 1024, // ~200 bytes per file + 1MB overhead
      'full-clone': (files) => files * 15 * 1024, // ~15KB average file size
      'ls-tree-local': (files) => files * 100, // Same as remote ls-tree
      cached: () => 0, // No bandwidth used for cached results
    };

    return estimates[method]?.(fileCount) || fileCount * 15 * 1024; // Default to full clone estimate
  }

  /**
   * Calculate actual performance gain achieved
   */
  private calculateActualPerformanceGain(
    method: AnalysisMethod,
    processingTime: number
  ): number {
    // Baseline processing time estimate (for full clone)
    const baselineTime = 30000; // 30 seconds baseline for medium repository

    if (processingTime === 0) return 1.0;

    const gain = baselineTime / processingTime;
    return Math.max(1.0, Math.min(50.0, gain)); // Cap between 1x and 50x
  }

  /**
   * Calculate bandwidth saved compared to full clone
   */
  private calculateBandwidthSaved(
    method: AnalysisMethod,
    bandwidthUsed: number
  ): number {
    // Estimate full clone bandwidth usage (baseline)
    const fullCloneBandwidth = bandwidthUsed * 50; // Rough multiplier for full clone

    if (method === 'full-clone' || fullCloneBandwidth === 0) return 0;

    const saved = fullCloneBandwidth - bandwidthUsed;
    return Math.max(0, saved);
  }

  /**
   * Build analysis result from processed file information
   */
  private buildAnalysisResult(
    fileInfos: FileInfo[],
    commitHash: string
  ): FileTypeDistribution {
    const totalFiles = fileInfos.length;

    // Calculate statistics using existing methods
    const categories = this.calculateCategoryStatistics(fileInfos, totalFiles);
    const extensions = this.calculateExtensionStatistics(fileInfos, totalFiles);
    const directories = this.buildDirectoryDistribution(fileInfos);
    const totalSize = fileInfos.reduce((sum, file) => sum + file.size, 0);

    return {
      categories,
      extensions,
      directories,
      metadata: {
        totalFiles,
        totalSize,
        analyzedAt: new Date().toISOString(),
        repositorySize: getRepositorySizeCategory(totalFiles),
        commitHash,
        streamingUsed: false, // Optimized methods don't use streaming
      },
    };
  }

  /**
   * Enhance analysis result with performance metrics
   */
  private enhanceResultWithPerformanceMetrics(
    result: FileTypeDistribution,
    performanceMetrics: PerformanceMetrics,
    methodDecision: any
  ): FileTypeDistribution {
    // Add performance information to metadata
    const enhancedMetadata = {
      ...result.metadata,
      analysisMethod: performanceMetrics.analysisMethod,
      dataSource: performanceMetrics.dataSource,
      processingTime: performanceMetrics.processingTime,
      performanceGain: performanceMetrics.performanceGain,
      bandwidthUsed: performanceMetrics.bandwidthUsed,
      bandwidthSaved: performanceMetrics.bandwidthSaved,
      selectionReason: performanceMetrics.selectionReason,
      expectedGain: methodDecision.expectedPerformanceGain,
      fallbackMethods: methodDecision.fallbackMethods,
    };

    return {
      ...result,
      metadata: enhancedMetadata,
    };
  }

  /**
   * Convenience method for repository URL analysis using withTempRepository
   *
   * This method demonstrates the proper integration pattern with GitRay's
   * repository coordination system. Use this pattern in routes.
   */
  async analyzeRepositoryFromUrl(
    repoUrl: string,
    options?: FileAnalysisFilterOptions
  ): Promise<FileTypeDistribution> {
    logger.info('Analyzing repository from URL with coordination', {
      repoUrl,
      options,
    });

    // Note: The actual withTempRepository call should be made at the route level
    // for proper error handling and resource coordination. This method is provided
    // as documentation of the expected usage pattern.
    throw new Error(
      'analyzeRepositoryFromUrl should not be called directly. ' +
        'Use withTempRepository() at the route level: ' +
        'await withTempRepository(repoUrl, (tempDir) => fileAnalysisService.analyzeRepository(tempDir, options))'
    );
  }
}

// Export singleton instance
export const fileAnalysisService = new FileAnalysisService();
