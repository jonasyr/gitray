// apps/backend/src/services/repositoryCache.ts

import crypto from 'crypto';
import { gitService } from './gitService';
import logger from './logger';
import { withSharedRepository } from './repositoryCoordinator';
import type { RepositoryHandle } from './repositoryCoordinator';
import { config } from '../config';
import HybridLRUCache from '../utils/hybridLruCache';
import { cacheHits, cacheMisses, getRepositorySizeCategory } from './metrics';
import {
  Commit,
  CommitFilterOptions,
  CommitHeatmapData,
} from '@gitray/shared-types';

/**
 * UNIFIED REPOSITORY CACHE MANAGER
 *
 * Implements hierarchical caching strategy:
 * Level 1: Raw commits (shared across all operations)
 * Level 2: Filtered commits (based on filter criteria)
 * Level 3: Aggregated data (heatmaps, statistics)
 *
 * ELIMINATES DUPLICATE CLONES by using shared repository coordination
 * MAXIMIZES CACHE HITS by intelligent key structuring
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
}

/**
 * Multi-tier cache for repository commit data
 */
class RepositoryCacheManager {
  // Level 1: Raw commits cache (highest priority, shared across all operations)
  private rawCommitsCache: HybridLRUCache<Commit[]>;

  // Level 2: Filtered commits cache (medium priority, filtered/paginated data)
  private filteredCommitsCache: HybridLRUCache<Commit[]>;

  // Level 3: Aggregated data cache (lower priority, processed results)
  private aggregatedDataCache: HybridLRUCache<CommitHeatmapData>;

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

    logger.info('RepositoryCacheManager initialized', {
      hierarchicalCaching: config.cacheStrategy.hierarchicalCaching,
      rawCommitsEntries: Math.floor(baseConfig.maxEntries * 0.5),
      filteredCommitsEntries: Math.floor(baseConfig.maxEntries * 0.3),
      aggregatedDataEntries: Math.floor(baseConfig.maxEntries * 0.2),
      memoryDistribution: '60% raw, 25% filtered, 15% aggregated',
    });
  }

  /**
   * Get or parse raw commits for a repository (Level 1 cache)
   */
  async getOrParseCommits(
    repoUrl: string,
    options?: CommitCacheOptions
  ): Promise<Commit[]> {
    const startTime = Date.now();

    // For paginated requests or specific filters, try filtered cache first
    if (this.hasSpecificFilters(options)) {
      return this.getOrParseFilteredCommits(repoUrl, options);
    }

    // Level 1: Try raw commits cache
    const rawKey = this.generateRawCommitsKey(repoUrl);
    let commits = await this.rawCommitsCache.get(rawKey);

    if (commits) {
      this.metrics.operations.rawHits++;
      this.recordHitTime(startTime);
      cacheHits.inc({ operation: 'raw_commits' });

      logger.debug('Raw commits cache hit', {
        repoUrl,
        commitsCount: commits.length,
        cacheKey: rawKey,
      });

      return commits;
    }

    // Cache miss - need to fetch from repository
    this.metrics.operations.rawMisses++;
    this.recordMissTime(startTime);
    cacheMisses.inc({ operation: 'raw_commits' });

    logger.info('Raw commits cache miss, fetching from repository', {
      repoUrl,
      cacheKey: rawKey,
    });

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

    // Cache the raw commits with appropriate TTL
    const ttl = config.cacheStrategy.cacheKeys.rawCommitsTTL;
    await this.rawCommitsCache.set(rawKey, commits, 'EX', ttl);

    logger.info('Raw commits cached', {
      repoUrl,
      commitsCount: commits.length,
      ttl,
      sizeCategory: getRepositorySizeCategory(commits.length),
    });

    return commits;
  }

  /**
   * Get or parse filtered commits (Level 2 cache)
   */
  async getOrParseFilteredCommits(
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

      logger.debug('Filtered commits cache hit', {
        repoUrl,
        commitsCount: filteredCommits.length,
        filters: options,
        cacheKey: filteredKey,
      });

      return filteredCommits;
    }

    // Cache miss - get raw commits and apply filters
    this.metrics.operations.filteredMisses++;
    this.recordMissTime(startTime);
    cacheMisses.inc({ operation: 'filtered_commits' });

    logger.debug(
      'Filtered commits cache miss, applying filters to raw commits',
      {
        repoUrl,
        filters: options,
        cacheKey: filteredKey,
      }
    );

    // Get raw commits (this may hit Level 1 cache)
    const rawCommits = await this.getOrParseCommits(repoUrl);

    // Apply filters (handles null commits internally)
    filteredCommits = this.applyFilters(rawCommits, options);

    // Cache the filtered result with shorter TTL
    const ttl = config.cacheStrategy.cacheKeys.filteredCommitsTTL;
    await this.filteredCommitsCache.set(
      filteredKey,
      filteredCommits,
      'EX',
      ttl
    );

    logger.debug('Filtered commits cached', {
      repoUrl,
      originalCount: rawCommits?.length || 0,
      filteredCount: filteredCommits.length,
      filters: options,
      ttl,
    });

    return filteredCommits;
  }

  /**
   * Get or generate aggregated data (Level 3 cache)
   */
  async getOrGenerateAggregatedData(
    repoUrl: string,
    filterOptions?: CommitFilterOptions
  ): Promise<CommitHeatmapData> {
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

      logger.debug('Aggregated data cache hit', {
        repoUrl,
        filters: filterOptions,
        cacheKey: aggregatedKey,
      });

      return aggregatedData;
    }

    // Cache miss - get commits and generate aggregation
    this.metrics.operations.aggregatedMisses++;
    this.recordMissTime(startTime);
    cacheMisses.inc({ operation: 'aggregated_data' });

    logger.debug('Aggregated data cache miss, generating from commits', {
      repoUrl,
      filters: filterOptions,
      cacheKey: aggregatedKey,
    });

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

    // Cache the aggregated result with shortest TTL
    const ttl = config.cacheStrategy.cacheKeys.aggregatedDataTTL;
    await this.aggregatedDataCache.set(
      aggregatedKey,
      aggregatedData,
      'EX',
      ttl
    );

    logger.debug('Aggregated data cached', {
      repoUrl,
      filters: filterOptions,
      dataPoints: aggregatedData.data.length,
      totalCommits: aggregatedData.metadata?.totalCommits || 0,
      ttl,
    });

    return aggregatedData;
  }

  /**
   * Invalidate all cache data for a repository
   */
  async invalidateRepository(repoUrl: string): Promise<void> {
    const operations = [
      this.rawCommitsCache.del(this.generateRawCommitsKey(repoUrl)),
      // For filtered and aggregated caches, we'd need to iterate through possible keys
      // This is a simplified implementation - in production, you'd want key patterns
    ];

    await Promise.allSettled(operations);

    logger.info('Repository cache invalidated', { repoUrl });
  }

  /**
   * Get cache statistics
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
    };
  }

  /**
   * Shutdown all cache tiers
   */
  async shutdown(): Promise<void> {
    const operations = [
      this.rawCommitsCache.quit(),
      this.filteredCommitsCache.quit(),
      this.aggregatedDataCache.quit(),
    ];

    await Promise.allSettled(operations);

    logger.info('RepositoryCacheManager shutdown completed', {
      finalStats: this.getCacheStats(),
    });
  }

  // Private helper methods

  private generateRawCommitsKey(repoUrl: string): string {
    return `raw_commits:${this.hashUrl(repoUrl)}`;
  }

  private generateFilteredCommitsKey(
    repoUrl: string,
    options?: CommitCacheOptions
  ): string {
    const filterHash = this.hashObject(options || {});
    return `filtered_commits:${this.hashUrl(repoUrl)}:${filterHash}`;
  }

  private generateAggregatedDataKey(
    repoUrl: string,
    filterOptions?: CommitFilterOptions
  ): string {
    const filterHash = this.hashObject(filterOptions || {});
    return `aggregated_data:${this.hashUrl(repoUrl)}:${filterHash}`;
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
      const fromDate = new Date(options.fromDate);
      filtered = filtered.filter((c) => new Date(c.date) >= fromDate);
    }

    if (options?.toDate) {
      const toDate = new Date(options.toDate);
      filtered = filtered.filter((c) => new Date(c.date) <= toDate);
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
