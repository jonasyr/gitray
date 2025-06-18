// apps/backend/__tests__/unit/services/repositoryCache.unit.test.ts
// CORRECTED OPTIMIZATION - Maintains coverage while reducing real bloat

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Commit, CommitHeatmapData } from '@gitray/shared-types';
import { config } from '../../../src/config';

// Streamlined mocks - comprehensive but not excessive
const mockHybridCache = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  clear: vi.fn(),
  quit: vi.fn().mockResolvedValue(undefined),
  getStats: vi.fn().mockReturnValue({
    memory: { entries: 10, usageBytes: 1024 },
    disk: { entries: 5, usageBytes: 2048 },
  }),
}));

const mockGitService = vi.hoisted(() => ({
  getCommits: vi.fn(),
  aggregateCommits: vi.fn(),
  aggregateCommitsByTime: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const mockWithSharedRepository = vi.hoisted(() => vi.fn());
const mockWithKeyLock = vi.hoisted(() => vi.fn());
const mockWithOrderedLocks = vi.hoisted(() => vi.fn());

// Consolidated metrics mock
const mockMetrics = vi.hoisted(() => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
  getRepositorySizeCategory: vi.fn().mockReturnValue('medium'),
  recordEnhancedCacheOperation: vi.fn(),
  updateServiceHealthScore: vi.fn(),
  recordDetailedError: vi.fn(),
  recordDataFreshness: vi.fn(),
  recordCacheTransaction: vi.fn(),
  recordTransactionRollback: vi.fn(),
  recordRollbackDuration: vi.fn(),
  recordRollbackVerification: vi.fn(),
  recordCriticalRollbackFailure: vi.fn(),
}));

// Efficient mock setup
vi.mock('../../../src/utils/hybridLruCache', () => ({
  default: vi.fn(() => mockHybridCache),
}));

vi.mock('../../../src/services/gitService', () => ({
  gitService: mockGitService,
}));

vi.mock('../../../src/services/logger', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

vi.mock('../../../src/services/repositoryCoordinator', () => ({
  withSharedRepository: mockWithSharedRepository,
}));

vi.mock('../../../src/utils/lockManager', () => ({
  withKeyLock: mockWithKeyLock,
  withOrderedLocks: mockWithOrderedLocks,
}));

vi.mock('../../../src/services/metrics', () => mockMetrics);

vi.mock('../../../src/services/distributedCacheInvalidation', () => ({
  getDistributedCacheInvalidation: vi.fn(() => ({
    registerInvalidationHandler: vi.fn(),
    invalidateGlobally: vi.fn().mockResolvedValue(undefined),
    isServiceHealthy: vi.fn().mockReturnValue(true),
  })),
  shutdownDistributedCacheInvalidation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/config', () => ({
  config: {
    hybridCache: {
      maxEntries: 1000,
      memoryLimitBytes: 1024 * 1024,
      diskPath: '/tmp/test-cache',
      lockTimeoutMs: 5000,
      enableRedis: false,
      redisConfig: {
        keyPrefix: 'gitray:',
        host: 'localhost',
        port: 6379,
      },
    },
    cacheStrategy: {
      hierarchicalCaching: true,
      cacheKeys: {
        rawCommitsTTL: 3600,
        filteredCommitsTTL: 1800,
        aggregatedDataTTL: 900,
      },
    },
  },
}));

// Test data
const testCommits: Commit[] = [
  {
    sha: 'abc123',
    authorName: 'John Doe',
    authorEmail: 'john@example.com',
    date: '2023-01-01T10:00:00Z',
    message: 'Initial commit',
  },
  {
    sha: 'def456',
    authorName: 'Jane Smith',
    authorEmail: 'jane@example.com',
    date: '2023-01-02T11:00:00Z',
    message: 'Add feature',
  },
];

const testHeatmapData: CommitHeatmapData = {
  timePeriod: 'day' as const,
  data: [{ periodStart: '2023-01-01', commitCount: 2 }],
  metadata: { maxCommitCount: 2, totalCommits: 2 },
};

const mockRepositoryHandle = {
  localPath: '/tmp/repo',
  commitCount: 100,
  sizeCategory: 'medium' as const,
  isShared: false,
  refCount: 1,
};

describe('RepositoryCache', () => {
  let repositoryCache: any;

  beforeEach(async () => {
    // Streamlined reset - only what's needed
    vi.clearAllMocks();

    // Default behaviors
    mockHybridCache.get.mockResolvedValue(null);
    mockHybridCache.set.mockResolvedValue(undefined);
    mockHybridCache.del.mockResolvedValue(true);
    mockGitService.getCommits.mockResolvedValue(testCommits);
    mockGitService.aggregateCommitsByTime.mockResolvedValue(testHeatmapData);

    mockWithKeyLock.mockImplementation(async (key, fn) => await fn());
    mockWithOrderedLocks.mockImplementation(async (locks, fn) => await fn());
    mockWithSharedRepository.mockImplementation(
      async (url, fn) => await fn(mockRepositoryHandle)
    );

    const module = await import('../../../src/services/repositoryCache');
    repositoryCache = module.repositoryCache;
  });

  afterEach(async () => {
    await repositoryCache?.shutdown?.().catch(() => {});
    vi.resetModules();
  });

  describe('Initialization and Configuration', () => {
    test('should initialize with correct cache tier allocation', () => {
      // ARRANGE & ACT: Constructor allocates memory across tiers

      // ASSERT: Verify configuration-driven initialization
      expect(repositoryCache).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'RepositoryCacheManager initialized with transactional consistency',
        expect.objectContaining({
          hierarchicalCaching: true,
          transactionalConsistency: true,
        })
      );
    });
  });

  describe('Raw Commits Cache Operations', () => {
    test('should return cached commits on cache hit', async () => {
      // ARRANGE: Cache hit scenario
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.get.mockResolvedValue(testCommits);

      // ACT: Request commits
      const result = await repositoryCache.getOrParseCommits(repoUrl);

      // ASSERT: Verify cache hit behavior without repository access
      expect(result).toEqual(testCommits);
      expect(mockMetrics.cacheHits.inc).toHaveBeenCalledWith({
        operation: 'raw_commits',
      });
      expect(mockGitService.getCommits).not.toHaveBeenCalled();
    });

    test('should fetch from repository on cache miss', async () => {
      // ARRANGE: Cache miss scenario
      const repoUrl = 'https://github.com/test/repo.git';

      // ACT: Request commits
      const result = await repositoryCache.getOrParseCommits(repoUrl);

      // ASSERT: Verify repository fetch and caching
      expect(result).toEqual(testCommits);
      expect(mockMetrics.cacheMisses.inc).toHaveBeenCalledWith({
        operation: 'raw_commits',
      });
      expect(mockGitService.getCommits).toHaveBeenCalledWith('/tmp/repo');
      expect(mockHybridCache.set).toHaveBeenCalled();
    });

    test('should handle null git service response gracefully', async () => {
      // ARRANGE: Git service returns null
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.getCommits.mockResolvedValue(null);

      // ACT: Request commits
      const result = await repositoryCache.getOrParseCommits(repoUrl);

      // ASSERT: Verify graceful null handling
      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'gitService.getCommits returned null, using empty array',
        expect.objectContaining({ repoUrl })
      );
    });

    test('should track duplicate clone prevention', async () => {
      // ARRANGE: Shared repository scenario
      const repoUrl = 'https://github.com/test/repo.git';
      mockWithSharedRepository.mockImplementation(async (url, fn) => {
        return await fn({
          ...mockRepositoryHandle,
          isShared: true,
          refCount: 3,
        });
      });

      // ACT: Request commits
      await repositoryCache.getOrParseCommits(repoUrl);

      // ASSERT: Verify efficiency tracking
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Duplicate clone prevented',
        expect.objectContaining({ repoUrl, refCount: 3 })
      );
    });
  });

  describe('Filtered Commits Cache Operations', () => {
    test('should return cached filtered commits on cache hit', async () => {
      // ARRANGE: Filtered cache hit
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { author: 'John Doe' };
      const filteredCommits = [testCommits[0]];
      mockHybridCache.get.mockResolvedValue(filteredCommits);

      // ACT: Request filtered commits
      const result = await repositoryCache.getOrParseFilteredCommits(
        repoUrl,
        options
      );

      // ASSERT: Verify filtered cache hit
      expect(result).toEqual(filteredCommits);
      expect(mockMetrics.cacheHits.inc).toHaveBeenCalledWith({
        operation: 'filtered_commits',
      });
    });

    test('should apply author filter on cache miss', async () => {
      // ARRANGE: Filtered cache miss, raw cache hit
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { author: 'Jane Smith' };
      mockHybridCache.get
        .mockResolvedValueOnce(null) // filtered miss
        .mockResolvedValueOnce(testCommits); // raw hit

      // ACT: Request filtered commits
      const result = await repositoryCache.getOrParseFilteredCommits(
        repoUrl,
        options
      );

      // ASSERT: Verify filtering logic
      expect(result).toHaveLength(1);
      expect(result[0].authorName).toBe('Jane Smith');
      expect(mockHybridCache.set).toHaveBeenCalled();
    });

    test('should apply multiple authors filter', async () => {
      // ARRANGE: Multiple authors scenario
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { authors: ['John Doe', 'Jane Smith'] };
      mockHybridCache.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(testCommits);

      // ACT: Apply multiple authors filter
      const result = await repositoryCache.getOrParseFilteredCommits(
        repoUrl,
        options
      );

      // ASSERT: Verify multiple author filtering
      expect(result).toHaveLength(2);
    });

    test('should apply date range filter correctly', async () => {
      // ARRANGE: Date filter scenario
      const repoUrl = 'https://github.com/test/repo.git';
      const options = {
        fromDate: '2023-01-01T00:00:00Z',
        toDate: '2023-01-01T23:59:59Z',
      };
      mockHybridCache.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(testCommits);

      // ACT: Apply date filter
      const result = await repositoryCache.getOrParseFilteredCommits(
        repoUrl,
        options
      );

      // ASSERT: Verify date filtering
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2023-01-01T10:00:00Z');
    });

    test('should apply pagination correctly', async () => {
      // ARRANGE: Pagination scenario
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { skip: 1, limit: 1 };
      mockHybridCache.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(testCommits);

      // ACT: Apply pagination
      const result = await repositoryCache.getOrParseFilteredCommits(
        repoUrl,
        options
      );

      // ASSERT: Verify pagination logic
      expect(result).toHaveLength(1);
      expect(result[0].sha).toBe('def456');
    });

    test('should handle invalid date filters gracefully', async () => {
      // ARRANGE: Invalid date filters
      const cache = repositoryCache as any;
      const options = { fromDate: 'invalid-date', toDate: 'also-invalid' };

      // ACT: Apply invalid filters
      const result = cache.applyFilters(testCommits, options);

      // ASSERT: Verify graceful degradation
      expect(result).toHaveLength(testCommits.length);
    });
  });

  describe('Aggregated Data Cache Operations', () => {
    test('should return cached aggregated data on cache hit', async () => {
      // ARRANGE: Aggregated cache hit
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.get.mockResolvedValue(testHeatmapData);

      // ACT: Request aggregated data
      const result = await repositoryCache.getOrGenerateAggregatedData(repoUrl);

      // ASSERT: Verify aggregated cache hit
      expect(result).toEqual(testHeatmapData);
      expect(mockMetrics.cacheHits.inc).toHaveBeenCalledWith({
        operation: 'aggregated_data',
      });
      expect(mockGitService.aggregateCommitsByTime).not.toHaveBeenCalled();
    });

    test('should generate aggregated data on cache miss', async () => {
      // ARRANGE: Aggregated cache miss
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.get
        .mockResolvedValueOnce(null) // aggregated miss
        .mockResolvedValueOnce(null) // filtered miss
        .mockResolvedValueOnce(testCommits); // raw hit

      // ACT: Request aggregated data
      const result = await repositoryCache.getOrGenerateAggregatedData(repoUrl);

      // ASSERT: Verify aggregation generation
      expect(result).toEqual(testHeatmapData);
      expect(mockGitService.aggregateCommitsByTime).toHaveBeenCalledWith(
        testCommits,
        undefined
      );
      expect(mockHybridCache.set).toHaveBeenCalled();
    });

    test('should handle aggregation with filter options', async () => {
      // ARRANGE: Filtered aggregation scenario
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { author: 'John Doe' };
      mockHybridCache.get.mockResolvedValue(null);

      // ACT: Request filtered aggregated data
      const result = await repositoryCache.getOrGenerateAggregatedData(
        repoUrl,
        options
      );

      // ASSERT: Verify filtered aggregation
      expect(result).toEqual(testHeatmapData);
      expect(mockGitService.aggregateCommitsByTime).toHaveBeenCalled();
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate all cache tiers for repository', async () => {
      // ARRANGE: Repository with cached data
      const repoUrl = 'https://github.com/test/repo.git';

      // ACT: Invalidate repository
      await repositoryCache.invalidateRepository(repoUrl);

      // ASSERT: Verify comprehensive invalidation
      expect(mockHybridCache.del).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Repository cache invalidated locally across all tiers',
        expect.objectContaining({ repoUrl })
      );
    });

    test('should handle partial invalidation failures', async () => {
      // ARRANGE: Partial invalidation failure
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.del
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Cache deletion failed'))
        .mockResolvedValue(true);

      // ACT: Attempt invalidation
      await repositoryCache.invalidateRepository(repoUrl);

      // ASSERT: Verify error handling
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to invalidate repository cache locally',
        expect.objectContaining({ repoUrl, error: 'Cache deletion failed' })
      );
    });
  });

  describe('Transaction Management', () => {
    test('should handle successful transaction lifecycle', async () => {
      // ARRANGE: Normal operation scenario
      const repoUrl = 'https://github.com/test/repo.git';

      // ACT: Perform cached operation
      await repositoryCache.getOrParseCommits(repoUrl);

      // ASSERT: Verify transaction completed successfully
      const stats = repositoryCache.getCacheStats();
      expect(stats.transactions.started).toBeGreaterThan(0);
      expect(stats.transactions.committed).toBeGreaterThan(0);
    });

    test('should rollback transaction on cache operation failure', async () => {
      // ARRANGE: Cache operation failure
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.set.mockRejectedValue(new Error('Cache write failed'));

      // ACT & ASSERT: Verify rollback on failure
      await expect(
        repositoryCache.getOrParseCommits(repoUrl)
      ).rejects.toThrow();

      const stats = repositoryCache.getCacheStats();
      expect(stats.transactions.failed).toBeGreaterThan(0);
    });

    test('should handle transaction rollback with verification', async () => {
      // ARRANGE: Setup rollback scenario
      const repoUrl = 'https://github.com/test/rollback.git';
      const cache = repositoryCache as any;
      const transaction = cache.createTransaction(repoUrl);

      const mockRollbackOp = {
        execute: vi.fn().mockResolvedValue(undefined),
        verify: vi.fn().mockResolvedValue(true),
        description: 'Test rollback operation',
        cacheType: 'raw' as const,
        key: 'test-key',
      };

      transaction.rollbackOperations = [mockRollbackOp];

      // ACT: Execute rollback
      await cache.rollbackTransaction(transaction);

      // ASSERT: Verify rollback execution and verification
      expect(mockRollbackOp.execute).toHaveBeenCalled();
      expect(mockRollbackOp.verify).toHaveBeenCalled();
    });

    test('should handle rollback verification failures with retries', async () => {
      // ARRANGE: Rollback verification failure
      const repoUrl = 'https://github.com/test/rollback.git';
      const cache = repositoryCache as any;
      const transaction = cache.createTransaction(repoUrl);

      const mockRollbackOp = {
        execute: vi.fn().mockResolvedValue(undefined),
        verify: vi.fn().mockResolvedValue(false), // Verification always fails
        description: 'Failing rollback operation',
        cacheType: 'raw' as const,
        key: 'test-key',
      };

      transaction.rollbackOperations = [mockRollbackOp];

      // ACT & ASSERT: Verify retry logic on verification failure
      await expect(cache.rollbackTransaction(transaction)).rejects.toThrow(
        expect.objectContaining({ name: 'TransactionRollbackError' })
      );

      expect(mockRollbackOp.execute).toHaveBeenCalledTimes(3); // Max retries
      expect(mockRollbackOp.verify).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle cache read failures gracefully', async () => {
      // ARRANGE: Cache read error
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.get.mockRejectedValue(new Error('Cache read error'));

      // ACT: Request commits despite cache error
      const result = await repositoryCache.getOrParseCommits(repoUrl);

      // ASSERT: Verify graceful degradation
      expect(result).toEqual(testCommits);
      expect(mockMetrics.recordDetailedError).toHaveBeenCalled();
    });

    test('should handle repository fetch failures', async () => {
      // ARRANGE: Git service failure
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.getCommits.mockRejectedValue(
        new Error('Git operation failed')
      );

      // ACT & ASSERT: Verify error propagation
      await expect(repositoryCache.getOrParseCommits(repoUrl)).rejects.toThrow(
        'Git operation failed'
      );
    });

    test('should handle cache write failures with transaction rollback', async () => {
      // ARRANGE: Cache write failure scenario
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.set.mockRejectedValue(new Error('Cache write failed'));

      // ACT & ASSERT: Verify transaction rollback on write failure
      await expect(
        repositoryCache.getOrParseCommits(repoUrl)
      ).rejects.toThrow();

      const stats = repositoryCache.getCacheStats();
      expect(stats.transactions.failed).toBeGreaterThan(0);
    });
  });

  describe('Concurrent Operations and Safety', () => {
    test('should handle concurrent requests safely', async () => {
      // ARRANGE: Concurrent request scenario
      const repoUrl = 'https://github.com/test/concurrent.git';
      let callCount = 0;
      mockGitService.getCommits.mockImplementation(async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return testCommits;
      });

      // ACT: Make concurrent requests
      const promises = [
        repositoryCache.getOrParseCommits(repoUrl),
        repositoryCache.getOrParseCommits(repoUrl),
        repositoryCache.getOrParseCommits(repoUrl),
      ];

      const results = await Promise.all(promises);

      // ASSERT: Verify safe concurrent handling
      expect(results).toHaveLength(3);
      results.forEach((result) => expect(result).toEqual(testCommits));
      expect(callCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Cache Statistics and Monitoring', () => {
    test('should return comprehensive cache statistics', () => {
      // ARRANGE & ACT: Get cache statistics
      const stats = repositoryCache.getCacheStats();

      // ASSERT: Verify statistics structure
      expect(stats).toMatchObject({
        entries: {
          rawCommits: expect.any(Number),
          filteredCommits: expect.any(Number),
          aggregatedData: expect.any(Number),
        },
        memoryUsage: {
          rawCommits: expect.any(Number),
          filteredCommits: expect.any(Number),
          aggregatedData: expect.any(Number),
          total: expect.any(Number),
        },
        hitRatios: {
          rawCommits: expect.any(Number),
          filteredCommits: expect.any(Number),
          aggregatedData: expect.any(Number),
          overall: expect.any(Number),
        },
        efficiency: {
          duplicateClonesPrevented: expect.any(Number),
          totalCacheOperations: expect.any(Number),
          averageHitTime: expect.any(Number),
          averageMissTime: expect.any(Number),
        },
        transactions: {
          started: expect.any(Number),
          committed: expect.any(Number),
          rolledBack: expect.any(Number),
          failed: expect.any(Number),
        },
      });
    });

    test('should calculate hit ratios correctly', async () => {
      // ARRANGE: Generate hits and misses
      const repoUrl = 'https://github.com/test/ratio.git';
      mockHybridCache.get.mockResolvedValueOnce(testCommits); // hit
      await repositoryCache.getOrParseCommits(repoUrl);

      mockHybridCache.get.mockResolvedValueOnce(null); // miss
      await repositoryCache.getOrParseCommits(repoUrl + '2');

      // ACT: Get statistics
      const stats = repositoryCache.getCacheStats();

      // ASSERT: Verify hit ratio calculation
      expect(stats.hitRatios.rawCommits).toBe(0.5);
    });
  });

  describe('Cache Key Management', () => {
    test('should generate consistent cache keys for identical inputs', () => {
      // ARRANGE: Identical inputs
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { author: 'John Doe', limit: 10 };
      const cache = repositoryCache as any;

      // ACT: Generate keys multiple times
      const key1 = cache.generateFilteredCommitsKey(repoUrl, options);
      const key2 = cache.generateFilteredCommitsKey(repoUrl, options);

      // ASSERT: Verify consistency
      expect(key1).toBe(key2);
    });

    test('should generate different keys for different options', () => {
      // ARRANGE: Different options
      const repoUrl = 'https://github.com/test/repo.git';
      const cache = repositoryCache as any;

      // ACT: Generate keys with different options
      const key1 = cache.generateFilteredCommitsKey(repoUrl, {
        author: 'John',
      });
      const key2 = cache.generateFilteredCommitsKey(repoUrl, {
        author: 'Jane',
      });

      // ASSERT: Verify uniqueness
      expect(key1).not.toBe(key2);
    });

    test('should detect specific filters correctly', () => {
      // ARRANGE: Filter detection scenarios
      const cache = repositoryCache as any;

      // ACT & ASSERT: Test filter detection
      expect(cache.hasSpecificFilters({})).toBe(false);
      expect(cache.hasSpecificFilters({ author: 'John' })).toBe(true);
      expect(cache.hasSpecificFilters({ authors: ['John'] })).toBe(true);
      expect(cache.hasSpecificFilters({ fromDate: '2023-01-01' })).toBe(true);
      expect(cache.hasSpecificFilters({ limit: 10 })).toBe(true);
      expect(cache.hasSpecificFilters(undefined)).toBe(false);
    });
  });

  describe('Redis-Enabled Distributed Cache Scenarios', () => {
    beforeEach(() => {
      // Enable Redis for these specific tests
      config.hybridCache.enableRedis = true;
    });

    afterEach(() => {
      // Reset Redis to disabled for other tests
      config.hybridCache.enableRedis = false;
    });

    test('should handle distributed cache invalidation when Redis is enabled', async () => {
      // ARRANGE: Redis-enabled invalidation scenario
      const repoUrl = 'https://github.com/test/distributed.git';
      const mockDistributedCache = {
        invalidateGlobally: vi.fn().mockResolvedValue(undefined),
        registerInvalidationHandler: vi.fn(),
      };

      vi.doMock('../../../src/services/distributedCacheInvalidation', () => ({
        getDistributedCacheInvalidation: vi.fn(() => mockDistributedCache),
      }));

      // ACT: Invalidate with Redis enabled
      await repositoryCache.invalidateRepository(repoUrl);

      // ASSERT: Verify distributed invalidation attempt
      expect(mockHybridCache.del).toHaveBeenCalled();
    });

    test('should handle distributed cache failures gracefully', async () => {
      // ARRANGE: Distributed cache failure scenario
      const repoUrl = 'https://github.com/test/distributed-fail.git';

      // Mock the distributed cache service to throw an error
      const { getDistributedCacheInvalidation } = await import(
        '../../../src/services/distributedCacheInvalidation'
      );
      const mockDistributedCache = vi.mocked(getDistributedCacheInvalidation)();
      vi.mocked(mockDistributedCache.invalidateGlobally).mockRejectedValueOnce(
        new Error('Redis connection failed')
      );

      // ACT: Attempt invalidation with Redis failure
      await repositoryCache.invalidateRepository(repoUrl);

      // ASSERT: Verify graceful handling of distributed cache failure
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to broadcast distributed cache invalidation',
        expect.objectContaining({ repoUrl })
      );
    });

    test('should register distributed invalidation handlers on startup', async () => {
      // ARRANGE: Redis-enabled initialization
      const mockDistributedCache = {
        registerInvalidationHandler: vi.fn(),
      };

      vi.doMock('../../../src/services/distributedCacheInvalidation', () => ({
        getDistributedCacheInvalidation: vi.fn(() => mockDistributedCache),
      }));

      // Enable Redis in config
      config.hybridCache.enableRedis = true;

      // ACT: Initialize new cache instance with Redis enabled
      vi.resetModules();
      await import('../../../src/services/repositoryCache');

      // ASSERT: Verify handler registration
      // Note: Handler registration happens during construction in Redis-enabled mode
      expect(
        mockDistributedCache.registerInvalidationHandler
      ).toHaveBeenCalledWith('repository', expect.any(Function));

      // Clean up
      config.hybridCache.enableRedis = false;
    });
  });

  describe('Advanced Transaction Rollback Scenarios', () => {
    test('should handle multiple rollback operation failures with different error types', async () => {
      // ARRANGE: Complex rollback failure scenario
      const repoUrl = 'https://github.com/test/multi-rollback-fail.git';
      const cache = repositoryCache as any;
      const transaction = cache.createTransaction(repoUrl);

      const executeFailureOp = {
        execute: vi
          .fn()
          .mockRejectedValue(new Error('Execute failed permanently')),
        verify: vi.fn().mockResolvedValue(true),
        description: 'Execute failure operation',
        cacheType: 'raw' as const,
        key: 'execute-fail-key',
      };

      const verifyFailureOp = {
        execute: vi.fn().mockResolvedValue(undefined),
        verify: vi.fn().mockResolvedValue(false),
        description: 'Verify failure operation',
        cacheType: 'filtered' as const,
        key: 'verify-fail-key',
      };

      const successOp = {
        execute: vi.fn().mockResolvedValue(undefined),
        verify: vi.fn().mockResolvedValue(true),
        description: 'Success operation',
        cacheType: 'aggregated' as const,
        key: 'success-key',
      };

      transaction.rollbackOperations = [
        executeFailureOp,
        verifyFailureOp,
        successOp,
      ];

      // ACT & ASSERT: Verify complex rollback failure handling
      await expect(cache.rollbackTransaction(transaction)).rejects.toThrow(
        expect.objectContaining({
          name: 'TransactionRollbackError',
          failedOperations: [
            'Verify failure operation',
            'Execute failure operation',
          ],
        })
      );

      // Verify retry attempts
      expect(executeFailureOp.execute).toHaveBeenCalledTimes(3);
      expect(verifyFailureOp.execute).toHaveBeenCalledTimes(3);
      expect(successOp.execute).toHaveBeenCalledTimes(1);
    });

    test('should handle exponential backoff timing correctly in rollback retries', async () => {
      // ARRANGE: Rollback retry timing scenario
      const repoUrl = 'https://github.com/test/backoff-timing.git';
      const cache = repositoryCache as any;
      const transaction = cache.createTransaction(repoUrl);

      const timestamps: number[] = [];
      let attempts = 0;

      const timingOp = {
        execute: vi.fn().mockImplementation(() => {
          timestamps.push(Date.now());
          attempts++;
          if (attempts < 3) {
            throw new Error(`Backoff attempt ${attempts}`);
          }
          return Promise.resolve();
        }),
        verify: vi.fn().mockResolvedValue(true),
        description: 'Timing test operation',
        cacheType: 'raw' as const,
        key: 'timing-key',
      };

      transaction.rollbackOperations = [timingOp];

      // ACT: Execute rollback with timing
      const startTime = Date.now();
      await cache.rollbackTransaction(transaction);
      const endTime = Date.now();

      // ASSERT: Verify exponential backoff timing
      expect(timingOp.execute).toHaveBeenCalledTimes(3);
      expect(endTime - startTime).toBeGreaterThan(250); // Minimum backoff time
      expect(mockLogger.warn).toHaveBeenCalledTimes(2); // Two retry warnings
    });

    test('should handle critical rollback failures requiring manual intervention', async () => {
      // ARRANGE: Critical system failure scenario
      const repoUrl = 'https://github.com/test/critical-failure.git';
      const cache = repositoryCache as any;
      const transaction = cache.createTransaction(repoUrl);

      const criticalOp = {
        execute: vi
          .fn()
          .mockRejectedValue(new Error('Critical system failure')),
        verify: vi.fn().mockResolvedValue(true),
        description: 'Critical cache operation',
        cacheType: 'raw' as const,
        key: 'critical-key',
      };

      transaction.rollbackOperations = [criticalOp];

      // ACT & ASSERT: Verify critical failure handling
      await expect(cache.rollbackTransaction(transaction)).rejects.toThrow();

      // Verify critical alert logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        'CRITICAL: Transaction rollback incomplete - Manual intervention required',
        expect.objectContaining({
          transactionId: transaction.id,
          requiresManualIntervention: true,
          severity: 'CRITICAL',
        })
      );

      expect(mockMetrics.recordCriticalRollbackFailure).toHaveBeenCalledWith(
        'cache_write',
        1,
        'critical'
      );
    });

    test('should prevent double commit/rollback of same transaction', async () => {
      // ARRANGE: Double operation scenario
      const repoUrl = 'https://github.com/test/double-op.git';
      const cache = repositoryCache as any;
      const transaction = cache.createTransaction(repoUrl);

      // ACT: Commit transaction once
      await cache.commitTransaction(transaction);

      // Attempt to commit again
      await cache.commitTransaction(transaction);

      // Attempt to rollback already committed transaction
      await cache.rollbackTransaction(transaction);

      // ASSERT: Verify prevention of double operations
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempted to commit already completed transaction',
        expect.objectContaining({ transactionId: transaction.id })
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempted to rollback already completed transaction',
        expect.objectContaining({ transactionId: transaction.id })
      );
    });
  });

  describe('Memory Pressure and Large Repository Scenarios', () => {
    test('should handle large commit datasets efficiently', async () => {
      // ARRANGE: Large repository scenario
      const repoUrl = 'https://github.com/test/large-repo.git';
      const largeCommitSet = Array.from({ length: 50000 }, (_, i) => ({
        sha: `commit_${i}`,
        authorName: `Author ${i % 1000}`,
        authorEmail: `author${i % 1000}@example.com`,
        date: new Date(Date.now() - i * 86400000).toISOString(),
        message: `Commit ${i}`,
      }));

      mockGitService.getCommits.mockResolvedValue(largeCommitSet);

      // ACT: Handle large dataset
      const result = await repositoryCache.getOrParseCommits(repoUrl);

      // ASSERT: Verify large dataset handling
      expect(result).toHaveLength(50000);
      expect(mockHybridCache.set).toHaveBeenCalled();
    });

    test('should apply complex filter combinations to large datasets', async () => {
      // ARRANGE: Complex filtering scenario
      const repoUrl = 'https://github.com/test/complex-filter.git';
      const complexCommitSet = Array.from({ length: 1000 }, (_, i) => ({
        sha: `commit_${i}`,
        authorName: i % 3 === 0 ? 'Alice' : i % 3 === 1 ? 'Bob' : 'Charlie',
        authorEmail: `user${i % 3}@example.com`,
        date: new Date(2023, 0, 1 + i).toISOString(),
        message: `Commit ${i}`,
      }));

      mockHybridCache.get
        .mockResolvedValueOnce(null) // filtered miss
        .mockResolvedValueOnce(complexCommitSet); // raw hit

      const options = {
        authors: ['Alice', 'Bob'],
        fromDate: '2023-01-100T00:00:00.000Z',
        toDate: '2023-01-200T00:00:00.000Z',
        skip: 10,
        limit: 50,
      };

      // ACT: Apply complex filters
      const result = await repositoryCache.getOrParseFilteredCommits(
        repoUrl,
        options
      );

      // ASSERT: Verify complex filtering
      expect(result.length).toBeLessThanOrEqual(50); // Limit applied
      result.forEach((commit: Commit) => {
        expect(['Alice', 'Bob']).toContain(commit.authorName);
      });
    });

    test('should handle memory-intensive aggregation operations', async () => {
      // ARRANGE: Memory-intensive aggregation
      const repoUrl = 'https://github.com/test/heavy-aggregation.git';

      const heavyHeatmapData: CommitHeatmapData = {
        timePeriod: 'day' as const,
        data: Array.from({ length: 365 }, (_, i) => ({
          periodStart: new Date(2023, 0, i + 1).toISOString().split('T')[0],
          commitCount: Math.floor(Math.random() * 50),
        })),
        metadata: { maxCommitCount: 50, totalCommits: 10000 },
      };

      mockHybridCache.get.mockResolvedValue(null);
      mockGitService.aggregateCommitsByTime.mockResolvedValue(heavyHeatmapData);

      // ACT: Process heavy aggregation
      const result = await repositoryCache.getOrGenerateAggregatedData(repoUrl);

      // ASSERT: Verify heavy aggregation handling
      expect(result.data.length).toBe(365);
      expect(result.metadata.totalCommits).toBe(10000);
    });
  });

  describe('Configuration Edge Cases and Variations', () => {
    test('should handle different TTL configurations', async () => {
      // ARRANGE: Custom TTL scenario
      config.cacheStrategy.cacheKeys.rawCommitsTTL = 7200; // 2 hours

      const repoUrl = 'https://github.com/test/custom-ttl.git';

      // ACT: Cache with custom TTL
      await repositoryCache.getOrParseCommits(repoUrl);

      // ASSERT: Verify TTL configuration usage
      expect(mockHybridCache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        'EX',
        7200
      );

      // Reset config
      config.cacheStrategy.cacheKeys.rawCommitsTTL = 3600;
    });

    test('should handle cache allocation boundary conditions', async () => {
      // ARRANGE: Boundary allocation scenario
      const stats = repositoryCache.getCacheStats();

      // ACT & ASSERT: Verify allocation boundaries
      expect(stats.entries.rawCommits).toBeGreaterThanOrEqual(0);
      expect(stats.entries.filteredCommits).toBeGreaterThanOrEqual(0);
      expect(stats.entries.aggregatedData).toBeGreaterThanOrEqual(0);
      expect(stats.memoryUsage.total).toBeGreaterThanOrEqual(0);
    });

    test('should handle edge cases in filter option processing', async () => {
      // ARRANGE: Edge case filter options
      const cache = repositoryCache as any;
      const edgeCaseFilters = [
        null,
        undefined,
        {},
        { author: '' },
        { authors: [] },
        { fromDate: null },
        { toDate: undefined },
        { skip: 0 },
        { limit: 0 },
      ];

      // ACT & ASSERT: Test each edge case
      edgeCaseFilters.forEach((filter) => {
        const hasFilters = cache.hasSpecificFilters(filter);
        if (
          filter === null ||
          filter === undefined ||
          (typeof filter === 'object' && Object.keys(filter).length === 0)
        ) {
          expect(hasFilters).toBe(false);
        }
      });
    });
  });

  describe('Network and Timeout Error Scenarios', () => {
    test('should handle timeout scenarios in lock operations', async () => {
      // ARRANGE: Lock timeout scenario
      const repoUrl = 'https://github.com/test/timeout.git';
      let lockCallCount = 0;

      // Override the mock implementation before the operation
      mockWithKeyLock.mockImplementation(async (key, fn) => {
        lockCallCount++;
        if (lockCallCount === 1) {
          // Simulate timeout delay
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        return await fn();
      });

      // ACT: Execute operation that should trigger withKeyLock (filtered commits uses withKeyLock)
      await repositoryCache.getOrParseFilteredCommits(repoUrl, {
        author: 'test',
      });

      // ASSERT: Verify that the lock was used
      expect(lockCallCount).toBeGreaterThanOrEqual(1);
      expect(mockWithKeyLock).toHaveBeenCalled();
    });

    test('should handle cascade failures across cache tiers', async () => {
      // ARRANGE: Cascade failure scenario
      const repoUrl = 'https://github.com/test/cascade-fail.git';

      // Simulate failures at different levels
      mockHybridCache.get.mockRejectedValue(new Error('Cache tier failure'));
      mockGitService.getCommits.mockRejectedValue(
        new Error('Git service failure')
      );

      // ACT & ASSERT: Verify cascade failure handling
      await expect(repositoryCache.getOrParseCommits(repoUrl)).rejects.toThrow(
        'Git service failure'
      );

      expect(mockMetrics.recordDetailedError).toHaveBeenCalledTimes(2); // Cache + Git errors
    });

    test('should handle partial cache tier failures during invalidation', async () => {
      // ARRANGE: Partial tier failure during invalidation
      const repoUrl = 'https://github.com/test/partial-tier-fail.git';

      // First populate multiple cache tiers
      await repositoryCache.getOrParseCommits(repoUrl);
      await repositoryCache.getOrParseFilteredCommits(repoUrl, {
        author: 'test',
      });
      await repositoryCache.getOrGenerateAggregatedData(repoUrl);

      // Setup partial failure during invalidation
      mockHybridCache.del
        .mockResolvedValueOnce(true) // Raw tier succeeds
        .mockRejectedValueOnce(new Error('Filtered tier failure')) // Filtered fails
        .mockResolvedValueOnce(true) // Aggregated succeeds
        .mockResolvedValue(true); // Remaining calls succeed

      // ACT: Attempt invalidation with partial failure
      await repositoryCache.invalidateRepository(repoUrl);

      // ASSERT: Verify partial failure handling
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to invalidate repository cache locally',
        expect.objectContaining({
          repoUrl,
          error: 'Filtered tier failure',
        })
      );
    });
  });

  describe('Shutdown and Resource Management', () => {
    test('should shutdown all cache tiers properly', async () => {
      // ARRANGE: Active cache instance

      // ACT: Shutdown cache
      await repositoryCache.shutdown();

      // ASSERT: Verify proper shutdown
      expect(mockHybridCache.quit).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'RepositoryCacheManager shutdown completed'
      );
    });

    test('should handle shutdown failures gracefully', async () => {
      // ARRANGE: Shutdown failure
      mockHybridCache.quit.mockRejectedValueOnce(new Error('Shutdown failed'));

      // ACT: Attempt shutdown
      await repositoryCache.shutdown();

      // ASSERT: Verify graceful failure handling
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during RepositoryCacheManager shutdown',
        expect.objectContaining({ error: 'Shutdown failed' })
      );
    });

    test('should cleanup active transactions during shutdown', async () => {
      // ARRANGE: Pending transaction
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.set.mockImplementation(() => new Promise(() => {})); // Never resolves

      const operationPromise = repositoryCache.getOrParseCommits(repoUrl);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // ACT: Shutdown with active transaction
      await repositoryCache.shutdown();

      // ASSERT: Verify active transaction cleanup
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Shutting down with active transactions',
        expect.objectContaining({ activeTransactions: expect.any(Number) })
      );

      operationPromise.catch(() => {});
    });

    test('should handle distributed cache shutdown when Redis enabled', async () => {
      // ARRANGE: Redis-enabled shutdown
      config.hybridCache.enableRedis = true;

      const mockShutdownDistributedCache = vi.fn().mockResolvedValue(undefined);
      vi.doMock('../../../src/services/distributedCacheInvalidation', () => ({
        shutdownDistributedCacheInvalidation: mockShutdownDistributedCache,
      }));

      // ACT: Shutdown with Redis enabled
      await repositoryCache.shutdown();

      // ASSERT: Verify distributed cache shutdown attempt
      expect(mockHybridCache.quit).toHaveBeenCalledTimes(3);

      // Reset config
      config.hybridCache.enableRedis = false;
    });
  });
});
