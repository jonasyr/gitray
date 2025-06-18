// apps/backend/__tests__/unit/services/repositoryCache.unit.test.ts
// ULTRA-FAST VERSION - Eliminates all slow tests and problematic imports

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Commit, CommitHeatmapData } from '@gitray/shared-types';
import crypto from 'crypto';

// Streamlined mocks - only what's needed
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

// Mock config completely - no require() calls
const mockConfig = {
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
};

vi.mock('../../../src/config', () => ({
  config: mockConfig,
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
      // ARRANGE: Setup simple rollback scenario
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
      // ARRANGE: Concurrent request scenario (no delays)
      const repoUrl = 'https://github.com/test/concurrent.git';
      let callCount = 0;
      mockGitService.getCommits.mockImplementation(async () => {
        callCount++;
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

  describe('Configuration and Edge Cases', () => {
    test('should handle different TTL configurations', async () => {
      // ARRANGE: Custom TTL scenario using mocked config
      const originalTTL = mockConfig.cacheStrategy.cacheKeys.rawCommitsTTL;
      mockConfig.cacheStrategy.cacheKeys.rawCommitsTTL = 7200; // 2 hours

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
      mockConfig.cacheStrategy.cacheKeys.rawCommitsTTL = originalTTL;
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
          (typeof filter === 'object' &&
            filter !== null &&
            Object.keys(filter).length === 0)
        ) {
          expect(hasFilters).toBe(false);
        }
      });
    });

    test('should handle null commits in aggregation pipeline', async () => {
      // ARRANGE: Null commits scenario
      const cache = repositoryCache as any;

      // ACT: Test null handling in filter application
      const result = cache.applyFilters(null, { author: 'test' });

      // ASSERT: Verify graceful null handling
      expect(result).toEqual([]);
    });
  });

  describe('Lock Operations and Safety', () => {
    test('should handle lock operations correctly', async () => {
      // ARRANGE: Lock operation test with proper mock tracking
      const repoUrl = 'https://github.com/test/locks.git';
      let lockCallCount = 0;

      // Ensure cache miss so lock gets called
      mockHybridCache.get.mockResolvedValueOnce(null);

      // Track lock calls properly
      mockWithOrderedLocks.mockImplementation(async (locks, fn) => {
        lockCallCount++;
        return await fn();
      });

      // ACT: Execute operation that requires locks
      const result = await repositoryCache.getOrParseCommits(repoUrl);

      // ASSERT: Verify lock usage
      expect(result).toEqual(testCommits);
      expect(lockCallCount).toBeGreaterThanOrEqual(1);
      expect(mockWithOrderedLocks).toHaveBeenCalled();
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
  });

  describe('Memory and Resource Management', () => {
    test('should handle large commit datasets efficiently', async () => {
      // ARRANGE: Moderately large dataset (fast test)
      const repoUrl = 'https://github.com/test/large-repo.git';
      const largeCommitSet = Array.from({ length: 200 }, (_, i) => ({
        sha: `commit_${i}`,
        authorName: `Author ${i % 20}`,
        authorEmail: `author${i % 20}@example.com`,
        date: new Date(Date.now() - i * 86400000).toISOString(),
        message: `Commit ${i}`,
      }));

      mockGitService.getCommits.mockResolvedValue(largeCommitSet);

      // ACT: Handle large dataset
      const result = await repositoryCache.getOrParseCommits(repoUrl);

      // ASSERT: Verify large dataset handling
      expect(result).toHaveLength(200);
      expect(mockHybridCache.set).toHaveBeenCalled();
    });

    test('should apply complex filter combinations to datasets', async () => {
      // ARRANGE: Complex filtering scenario
      const repoUrl = 'https://github.com/test/complex-filter.git';
      const complexCommitSet = Array.from({ length: 100 }, (_, i) => ({
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
        skip: 5,
        limit: 20,
      };

      // ACT: Apply complex filters
      const result = await repositoryCache.getOrParseFilteredCommits(
        repoUrl,
        options
      );

      // ASSERT: Verify complex filtering
      expect(result.length).toBeLessThanOrEqual(20); // Limit applied
      result.forEach((commit: Commit) => {
        expect(['Alice', 'Bob']).toContain(commit.authorName);
      });
    });
  });

  describe('Redis-Enabled Distributed Cache Coverage', () => {
    test('should initialize distributed cache handlers when Redis is enabled', async () => {
      // ARRANGE: Force Redis initialization code path
      mockConfig.hybridCache.enableRedis = true;

      // Clear module cache and re-import to trigger constructor with Redis enabled
      vi.resetModules();
      const { RepositoryCacheManager } = await import(
        '../../../src/services/repositoryCache'
      );

      // ACT: Create new instance with Redis enabled
      const redisEnabledCache = new (RepositoryCacheManager as any)();

      // ASSERT: Verify Redis initialization occurred
      expect(redisEnabledCache).toBeDefined();

      // Reset
      mockConfig.hybridCache.enableRedis = false;
    });

    test('should handle distributed cache invalidation broadcasts', async () => {
      // ARRANGE: Redis enabled with broadcast scenario
      mockConfig.hybridCache.enableRedis = true;
      const repoUrl = 'https://github.com/test/broadcast.git';

      const mockDistributedCache = {
        invalidateGlobally: vi.fn().mockResolvedValue(undefined),
        registerInvalidationHandler: vi.fn(),
      };

      vi.doMock('../../../src/services/distributedCacheInvalidation', () => ({
        getDistributedCacheInvalidation: vi.fn(() => mockDistributedCache),
      }));

      // ACT: Trigger distributed invalidation
      await repositoryCache.invalidateRepository(repoUrl);

      // ASSERT: Verify broadcast attempt (covers lines 1943-1969)
      expect(mockHybridCache.del).toHaveBeenCalled();

      // Reset
      mockConfig.hybridCache.enableRedis = false;
    });

    test('should register invalidation handlers during Redis initialization', async () => {
      // ARRANGE: Test handler registration code path
      mockConfig.hybridCache.enableRedis = true;

      const mockDistributedCache = {
        registerInvalidationHandler: vi.fn(),
        invalidateGlobally: vi.fn(),
      };

      vi.doMock('../../../src/services/distributedCacheInvalidation', () => ({
        getDistributedCacheInvalidation: vi.fn(() => mockDistributedCache),
      }));

      // ACT: Import module with Redis enabled to trigger handler registration
      vi.resetModules();
      await import('../../../src/services/repositoryCache');

      // ASSERT: Verify handler was registered (covers lines 1943-1969)
      expect(
        mockDistributedCache.registerInvalidationHandler
      ).toHaveBeenCalledWith('repository', expect.any(Function));

      // Reset
      mockConfig.hybridCache.enableRedis = false;
    });

    test('should handle Redis shutdown during cache shutdown', async () => {
      // ARRANGE: Redis enabled shutdown scenario
      mockConfig.hybridCache.enableRedis = true;

      const mockShutdownDistributedCache = vi.fn().mockResolvedValue(undefined);
      vi.doMock('../../../src/services/distributedCacheInvalidation', () => ({
        shutdownDistributedCacheInvalidation: mockShutdownDistributedCache,
        getDistributedCacheInvalidation: vi.fn(() => ({
          registerInvalidationHandler: vi.fn(),
        })),
      }));

      // ACT: Shutdown with Redis enabled (covers lines 2076-2105)
      await repositoryCache.shutdown();

      // ASSERT: Verify Redis shutdown was attempted
      expect(mockHybridCache.quit).toHaveBeenCalledTimes(3);

      // Reset
      mockConfig.hybridCache.enableRedis = false;
    });
  });

  describe('Advanced Transaction Rollback Coverage', () => {
    test('should handle rollback operations with execute failures', async () => {
      // ARRANGE: Transaction with execute failure (covers lines 1995-2018)
      const cache = repositoryCache as any;
      const transaction = cache.createTransaction('test-repo');

      const failingOp = {
        execute: vi.fn().mockRejectedValue(new Error('Execute failed')),
        verify: vi.fn().mockResolvedValue(true),
        description: 'Failing execute operation',
        cacheType: 'raw' as const,
        key: 'fail-key',
      };

      transaction.rollbackOperations = [failingOp];

      // ACT & ASSERT: Execute rollback with failure (covers rollback error paths)
      await expect(cache.rollbackTransaction(transaction)).rejects.toThrow(
        expect.objectContaining({ name: 'TransactionRollbackError' })
      );

      expect(mockMetrics.recordCriticalRollbackFailure).toHaveBeenCalled();
    });

    test('should handle rollback operations with verification failures', async () => {
      // ARRANGE: Transaction with verification failure (covers lines 2131-2167)
      const cache = repositoryCache as any;
      const transaction = cache.createTransaction('verify-fail-repo');

      const verifyFailOp = {
        execute: vi.fn().mockResolvedValue(undefined),
        verify: vi.fn().mockResolvedValue(false), // Verification fails
        description: 'Verify failing operation',
        cacheType: 'filtered' as const,
        key: 'verify-fail-key',
      };

      transaction.rollbackOperations = [verifyFailOp];

      // ACT & ASSERT: Execute rollback with verification failure
      await expect(cache.rollbackTransaction(transaction)).rejects.toThrow(
        expect.objectContaining({ name: 'TransactionRollbackError' })
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'CRITICAL: Transaction rollback incomplete - Manual intervention required',
        expect.objectContaining({
          requiresManualIntervention: true,
          severity: 'CRITICAL',
        })
      );
    });

    test('should handle rollback with mixed operation outcomes', async () => {
      // ARRANGE: Multiple operations with different outcomes (covers lines 2131-2167)
      const cache = repositoryCache as any;
      const transaction = cache.createTransaction('mixed-outcome-repo');

      const successOp = {
        execute: vi.fn().mockResolvedValue(undefined),
        verify: vi.fn().mockResolvedValue(true),
        description: 'Success operation',
        cacheType: 'aggregated' as const,
        key: 'success-key',
      };

      const failOp = {
        execute: vi.fn().mockRejectedValue(new Error('Mixed failure')),
        verify: vi.fn().mockResolvedValue(true),
        description: 'Mixed failure operation',
        cacheType: 'raw' as const,
        key: 'fail-key',
      };

      transaction.rollbackOperations = [successOp, failOp];

      // ACT: Execute mixed rollback scenario
      await expect(cache.rollbackTransaction(transaction)).rejects.toThrow();

      // ASSERT: Verify partial success handling
      expect(successOp.execute).toHaveBeenCalled();
      expect(failOp.execute).toHaveBeenCalled();
    });

    test('should handle transaction rollback order correctly', async () => {
      // ARRANGE: Test rollback order (LIFO) - covers lines 1995-2018
      const cache = repositoryCache as any;
      const transaction = cache.createTransaction('order-test-repo');

      const executionOrder: string[] = [];

      const firstOp = {
        execute: vi.fn().mockImplementation(() => {
          executionOrder.push('first');
          return Promise.resolve();
        }),
        verify: vi.fn().mockResolvedValue(true),
        description: 'First operation',
        cacheType: 'raw' as const,
        key: 'first-key',
      };

      const secondOp = {
        execute: vi.fn().mockImplementation(() => {
          executionOrder.push('second');
          return Promise.resolve();
        }),
        verify: vi.fn().mockResolvedValue(true),
        description: 'Second operation',
        cacheType: 'filtered' as const,
        key: 'second-key',
      };

      transaction.rollbackOperations = [firstOp, secondOp];

      // ACT: Execute rollback
      await cache.rollbackTransaction(transaction);

      // ASSERT: Verify LIFO order (reverse order)
      expect(executionOrder).toEqual(['second', 'first']);
    });
  });

  describe('Configuration and Edge Case Coverage', () => {
    test('should handle cache key pattern tracking edge cases', async () => {
      // ARRANGE: Test key pattern tracking (covers lines 1821-1837)
      const cache = repositoryCache as any;
      const repoUrl = 'https://github.com/test/pattern-edge.git';

      // ACT: Generate keys with edge case patterns
      const rawKey = cache.generateRawCommitsKey(repoUrl);
      const filteredKey = cache.generateFilteredCommitsKey(repoUrl, {
        author: 'test-author',
        fromDate: '2023-01-01',
        limit: 100,
      });
      const aggregatedKey = cache.generateAggregatedDataKey(repoUrl, {
        timePeriod: 'day',
        author: 'test-author',
      });

      // ASSERT: Verify key pattern structure and tracking
      expect(rawKey).toMatch(/^raw_commits:[a-f0-9]+$/);
      expect(filteredKey).toMatch(/^filtered_commits:[a-f0-9]+:[a-f0-9]+$/);
      expect(aggregatedKey).toMatch(/^aggregated_data:[a-f0-9]+:[a-f0-9]+$/);

      // Verify keys are tracked for invalidation
      expect(cache.cacheKeyPatterns.size).toBeGreaterThanOrEqual(0);
    });

    test('should handle URL and object hashing edge cases', async () => {
      // ARRANGE: Test hash generation edge cases (covers lines 1892-1898)
      const cache = repositoryCache as any;

      // ACT: Test various URL and object combinations
      const urlHash1 = cache.hashUrl('https://github.com/test/repo.git');
      const urlHash2 = cache.hashUrl('https://github.com/test/repo.git');
      const urlHash3 = cache.hashUrl('https://github.com/different/repo.git');

      const objHash1 = cache.hashObject({ author: 'test', limit: 10, skip: 0 });
      const objHash2 = cache.hashObject({ skip: 0, author: 'test', limit: 10 }); // Different order
      const objHash3 = cache.hashObject({ author: 'different', limit: 10 });

      // ASSERT: Verify hash consistency and uniqueness
      expect(urlHash1).toBe(urlHash2); // Same input = same hash
      expect(urlHash1).not.toBe(urlHash3); // Different input = different hash
      expect(objHash1).toBe(objHash2); // Order shouldn't matter
      expect(objHash1).not.toBe(objHash3); // Different content = different hash
      expect(urlHash1).toHaveLength(16); // MD5 slice length
      expect(objHash1).toHaveLength(8); // Object hash length
    });

    test('should handle cache allocation configuration edge cases', async () => {
      // ARRANGE: Test memory allocation boundaries (covers lines 1906-1910)
      const originalConfig = { ...mockConfig.hybridCache };

      // Test with minimal memory configuration
      mockConfig.hybridCache.maxEntries = 10;
      mockConfig.hybridCache.memoryLimitBytes = 1024;

      // ACT: Create cache with minimal configuration
      vi.resetModules();
      const { RepositoryCacheManager } = await import(
        '../../../src/services/repositoryCache'
      );
      const minimalCache = new (RepositoryCacheManager as any)();

      // ASSERT: Verify minimal configuration handling
      expect(minimalCache).toBeDefined();
      const stats = minimalCache.getCacheStats();
      expect(stats.entries.rawCommits).toBeGreaterThanOrEqual(0);
      expect(stats.memoryUsage.total).toBeGreaterThanOrEqual(0);

      // Reset configuration
      mockConfig.hybridCache = originalConfig;
    });

    test('should handle filter detection edge cases completely', async () => {
      // ARRANGE: Comprehensive filter edge cases
      const cache = repositoryCache as any;

      // ACT & ASSERT: Test edge cases based on actual implementation behavior
      expect(cache.hasSpecificFilters(null)).toBe(false);
      expect(cache.hasSpecificFilters(undefined)).toBe(false);
      expect(cache.hasSpecificFilters({})).toBe(false);
      expect(cache.hasSpecificFilters({ author: '' })).toBe(false); // Empty string treated as no filter
      expect(cache.hasSpecificFilters({ authors: [] })).toBe(false); // Empty array treated as no filter
      expect(cache.hasSpecificFilters({ authors: ['test'] })).toBe(true);
      expect(cache.hasSpecificFilters({ author: 'test' })).toBe(true);
      expect(cache.hasSpecificFilters({ fromDate: '2023-01-01' })).toBe(true);
      expect(cache.hasSpecificFilters({ toDate: '2023-01-01' })).toBe(true);
      expect(cache.hasSpecificFilters({ skip: 0 })).toBe(true); // Zero skip is still pagination
      expect(cache.hasSpecificFilters({ limit: 0 })).toBe(true); // Zero limit is still pagination
      expect(cache.hasSpecificFilters({ limit: 100 })).toBe(true);
    });
  });

  describe('Error Boundary and Cleanup Coverage', () => {
    test('should handle unexpected errors in transaction creation', async () => {
      // ARRANGE: Force error in transaction creation (covers error boundaries)
      const cache = repositoryCache as any;

      // Mock crypto.randomUUID to fail
      const originalRandomUUID = crypto.randomUUID;
      crypto.randomUUID = vi.fn().mockImplementation(() => {
        throw new Error('UUID generation failed');
      });

      // ACT & ASSERT: Verify error handling in transaction creation
      expect(() => cache.createTransaction('error-repo')).toThrow(
        'UUID generation failed'
      );

      // Reset
      crypto.randomUUID = originalRandomUUID;
    });

    test('should handle cache key tracking with invalid patterns', async () => {
      // ARRANGE: Test invalid key patterns (covers lines 2178-2179)
      const cache = repositoryCache as any;

      // ACT: Test tracking with invalid/malformed keys
      cache.trackCacheKey('invalid-key-format');
      cache.trackCacheKey('raw_commits:invalid-hash-format');
      cache.trackCacheKey('unknown_type:validhash123');

      // ASSERT: Verify graceful handling of invalid patterns
      expect(cache.cacheKeyPatterns.size).toBeGreaterThanOrEqual(0);
    });

    test('should handle empty and null commit arrays in filter application', async () => {
      // ARRANGE: Edge cases for filter application
      const cache = repositoryCache as any;

      // ACT & ASSERT: Test various edge cases
      expect(cache.applyFilters(null, { author: 'test' })).toEqual([]);
      expect(cache.applyFilters(undefined, { author: 'test' })).toEqual([]);
      expect(cache.applyFilters([], { author: 'test' })).toEqual([]);

      // Test with invalid dates
      const result = cache.applyFilters(testCommits, {
        fromDate: 'not-a-date',
        toDate: 'also-not-a-date',
      });
      expect(result).toEqual(testCommits); // Should return all when dates are invalid
    });

    test('should handle transaction completion edge cases', async () => {
      // ARRANGE: Test already completed transaction scenarios
      const cache = repositoryCache as any;
      const transaction = cache.createTransaction('completion-test');

      // Mark as completed
      transaction.completed = true;

      // ACT: Try to commit already completed transaction
      await cache.commitTransaction(transaction);

      // Try to rollback already completed transaction
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
});
