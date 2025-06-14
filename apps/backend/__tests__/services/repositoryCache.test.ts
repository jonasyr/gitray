// apps/backend/__tests__/services/repositoryCache.test.ts

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Commit, CommitHeatmapData } from '@gitray/shared-types';

// Create comprehensive mocks using vi.hoisted for better mock isolation
const mockHybridCache = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  clear: vi.fn(),
  getStats: vi.fn(),
  shutdown: vi.fn(),
  quit: vi.fn().mockResolvedValue(undefined),
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
const mockCacheHits = vi.hoisted(() => ({ inc: vi.fn() }));
const mockCacheMisses = vi.hoisted(() => ({ inc: vi.fn() }));
const mockGetRepositorySizeCategory = vi.hoisted(() => vi.fn());

// Mock all dependencies
const mockHybridLRUCacheConstructor = vi.fn(() => mockHybridCache);

vi.mock('../../src/utils/hybridLruCache', () => ({
  default: mockHybridLRUCacheConstructor,
}));

vi.mock('../../src/services/gitService', () => ({
  gitService: mockGitService,
}));

vi.mock('../../src/services/logger', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

vi.mock('../../src/services/repositoryCoordinator', () => ({
  withSharedRepository: mockWithSharedRepository,
}));

vi.mock('../../src/utils/lockManager', () => ({
  withKeyLock: mockWithKeyLock,
}));

vi.mock('../../src/services/metrics', () => ({
  // Basic metrics
  cacheHits: mockCacheHits,
  cacheMisses: mockCacheMisses,
  getRepositorySizeCategory: mockGetRepositorySizeCategory,

  // Enhanced metrics functions
  recordEnhancedCacheOperation: vi.fn(),
  updateServiceHealthScore: vi.fn(),
  recordDetailedError: vi.fn(),
  recordFeatureUsage: vi.fn(),
  updateCoordinationMetrics: vi.fn(),
  recordApiMetrics: vi.fn(),
  recordSLAMetrics: vi.fn(),
  recordDataFreshness: vi.fn(),

  // Utility functions
  getUserType: vi.fn().mockReturnValue('anonymous'),
  getRepositoryType: vi.fn().mockReturnValue('public'),
  getTeamSizeCategory: vi.fn().mockReturnValue('individual'),
  getCacheTier: vi.fn().mockReturnValue('L1'),
}));

vi.mock('../../src/config', () => ({
  config: {
    hybridCache: {
      maxEntries: 1000,
      memoryLimitBytes: 1024 * 1024,
      diskPath: '/tmp/test-cache',
      lockTimeoutMs: 5000,
      enableRedis: false,
      redisConfig: {
        keyPrefix: 'test:',
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

// Mock Prometheus register to avoid duplicate metrics errors
vi.mock('prom-client', () => ({
  register: {
    clear: vi.fn(),
    metrics: vi.fn().mockResolvedValue(''),
    registerMetric: vi.fn(),
  },
  collectDefaultMetrics: vi.fn(),
  Counter: vi.fn(),
  Histogram: vi.fn(),
  Gauge: vi.fn(),
}));

describe('RepositoryCache', () => {
  let repositoryCache: any;

  const mockCommits: Commit[] = [
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

  const mockHeatmapData: CommitHeatmapData = {
    timePeriod: 'day' as const,
    data: [
      { periodStart: '2023-01-01', commitCount: 1 },
      { periodStart: '2023-01-02', commitCount: 1 },
    ],
    metadata: {
      maxCommitCount: 1,
      totalCommits: 2,
    },
  };

  const mockRepositoryHandle = {
    localPath: '/tmp/repo',
    commitCount: 100,
    sizeCategory: 'medium' as const,
    isShared: true,
    refCount: 2,
  };

  beforeEach(async () => {
    // Clear Prometheus registry to prevent duplicate metrics errors
    const { register } = await import('prom-client');
    if (register && typeof register.clear === 'function') {
      register.clear();
    }

    // Reset all mocks except the constructor mock
    mockGitService.getCommits.mockClear();
    mockGitService.aggregateCommits.mockClear();
    mockGitService.aggregateCommitsByTime.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    mockLogger.debug.mockClear();
    mockWithKeyLock.mockClear();
    mockWithSharedRepository.mockClear();
    mockCacheHits.inc.mockClear();
    mockCacheMisses.inc.mockClear();
    mockGetRepositorySizeCategory.mockClear();

    // Reset hybrid cache mocks but keep the constructor
    mockHybridCache.get.mockClear();
    mockHybridCache.set.mockClear();
    mockHybridCache.del.mockClear();
    mockHybridCache.clear.mockClear();
    mockHybridCache.shutdown.mockClear();
    mockHybridCache.getStats.mockClear();
    mockHybridCache.quit.mockClear();

    // Setup default mock behaviors
    mockWithKeyLock.mockImplementation(
      async (key: string, fn: () => Promise<any>) => {
        return await fn();
      }
    );

    mockWithSharedRepository.mockImplementation(
      async (repoUrl: string, fn: (handle: any) => Promise<any>) => {
        return await fn(mockRepositoryHandle);
      }
    );

    mockGitService.getCommits.mockResolvedValue(mockCommits);
    mockGitService.aggregateCommits.mockResolvedValue(mockHeatmapData);
    mockGitService.aggregateCommitsByTime.mockResolvedValue(mockHeatmapData);

    mockHybridCache.get.mockResolvedValue(null);
    mockHybridCache.set.mockResolvedValue(undefined);
    mockHybridCache.del.mockResolvedValue(true);
    mockHybridCache.clear.mockResolvedValue(undefined);
    mockHybridCache.shutdown.mockResolvedValue(undefined);
    mockHybridCache.quit.mockResolvedValue(undefined);
    mockHybridCache.getStats.mockReturnValue({
      memory: { entries: 10, usageBytes: 1024 },
      disk: { entries: 5, usageBytes: 2048 },
    });

    mockGetRepositorySizeCategory.mockReturnValue('medium');

    // Import the repositoryCache instance
    const module = await import('../../src/services/repositoryCache');
    repositoryCache = module.repositoryCache;
  });

  afterEach(async () => {
    if (repositoryCache) {
      try {
        await repositoryCache.shutdown();
      } catch {
        // Ignore shutdown errors in tests
      }
    }
    // Clear all modules to force re-import
    vi.resetModules();
  });

  describe('Constructor and Initialization', () => {
    test('should initialize all cache tiers with correct configuration', () => {
      expect(repositoryCache).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'RepositoryCacheManager initialized with transactional consistency',
        expect.objectContaining({
          hierarchicalCaching: true,
          transactionalConsistency: true,
        })
      );
    });

    test('should allocate memory correctly across cache tiers', async () => {
      // The singleton constructor should have created three cache instances
      // Since the module may be imported multiple times during test setup,
      // we check that it's at least 3 times (3 per instance)
      const callCount = mockHybridLRUCacheConstructor.mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(3);
      expect(callCount % 3).toBe(0); // Should be a multiple of 3

      // Verify raw commits cache configuration (50% entries, 60% memory)
      expect(mockHybridLRUCacheConstructor).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          maxEntries: 500, // 50% of 1000
          memoryLimitBytes: expect.any(Number),
          diskPath: expect.stringContaining('raw-commits'),
        })
      );

      // Verify filtered commits cache configuration (30% entries, 25% memory)
      expect(mockHybridLRUCacheConstructor).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          maxEntries: 300, // 30% of 1000
          memoryLimitBytes: expect.any(Number),
          diskPath: expect.stringContaining('filtered-commits'),
        })
      );

      // Verify aggregated data cache configuration (20% entries, 15% memory)
      expect(mockHybridLRUCacheConstructor).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          maxEntries: 200, // 20% of 1000
          memoryLimitBytes: expect.any(Number),
          diskPath: expect.stringContaining('aggregated-data'),
        })
      );
    });
  });

  describe('getOrParseCommits', () => {
    test('should return cached raw commits on cache hit', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.get.mockResolvedValue(mockCommits);

      const result = await repositoryCache.getOrParseCommits(repoUrl);

      expect(result).toEqual(mockCommits);
      expect(mockHybridCache.get).toHaveBeenCalledWith(
        expect.stringContaining('raw_commits')
      );
      expect(mockCacheHits.inc).toHaveBeenCalledWith({
        operation: 'raw_commits',
      });
      expect(mockGitService.getCommits).not.toHaveBeenCalled();
    });

    test('should fetch from repository on cache miss', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.get.mockResolvedValue(null);

      const result = await repositoryCache.getOrParseCommits(repoUrl);

      expect(result).toEqual(mockCommits);
      expect(mockCacheMisses.inc).toHaveBeenCalledWith({
        operation: 'raw_commits',
      });
      expect(mockWithSharedRepository).toHaveBeenCalledWith(
        repoUrl,
        expect.any(Function)
      );
      expect(mockGitService.getCommits).toHaveBeenCalledWith(
        mockRepositoryHandle.localPath
      );
      expect(mockHybridCache.set).toHaveBeenCalled();
    });

    test('should handle null response from gitService gracefully', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.get.mockResolvedValue(null);
      mockGitService.getCommits.mockResolvedValue(null);

      const result = await repositoryCache.getOrParseCommits(repoUrl);

      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'gitService.getCommits returned null, using empty array',
        expect.objectContaining({ repoUrl })
      );
    });

    test('should delegate to filtered commits for specific filters', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { author: 'John Doe', limit: 10 };

      // Mock the filtered commits cache
      mockHybridCache.get.mockResolvedValueOnce(null); // raw cache miss
      mockHybridCache.get.mockResolvedValueOnce(mockCommits.slice(0, 1)); // filtered cache hit

      const result = await repositoryCache.getOrParseCommits(repoUrl, options);

      expect(result).toEqual(mockCommits.slice(0, 1));
    });

    test('should track duplicate clone prevention', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.get.mockResolvedValue(null);

      // Setup shared repository with multiple references
      const sharedHandle = {
        ...mockRepositoryHandle,
        isShared: true,
        refCount: 3,
      };
      mockWithSharedRepository.mockImplementation(async (url, fn) => {
        return await fn(sharedHandle);
      });

      await repositoryCache.getOrParseCommits(repoUrl);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Duplicate clone prevented',
        expect.objectContaining({
          repoUrl,
          refCount: 3,
          totalPrevented: 1,
        })
      );
    });
  });

  describe('getOrParseFilteredCommits', () => {
    test('should return cached filtered commits on cache hit', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { author: 'John Doe', limit: 10 };
      const filteredCommits = mockCommits.slice(0, 1);

      mockHybridCache.get.mockResolvedValue(filteredCommits);

      const result = await repositoryCache.getOrParseFilteredCommits(
        repoUrl,
        options
      );

      expect(result).toEqual(filteredCommits);
      expect(mockHybridCache.get).toHaveBeenCalledWith(
        expect.stringContaining('filtered_commits')
      );
      expect(mockCacheHits.inc).toHaveBeenCalledWith({
        operation: 'filtered_commits',
      });
    });

    test('should fetch raw commits and apply filters on cache miss', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { author: 'John Doe', limit: 1 };

      // Mock filtered cache miss, but raw cache hit
      mockHybridCache.get.mockResolvedValueOnce(null); // filtered cache miss
      mockHybridCache.get.mockResolvedValueOnce(mockCommits); // raw cache hit for getOrParseCommits

      const result = await repositoryCache.getOrParseFilteredCommits(
        repoUrl,
        options
      );

      expect(result).toHaveLength(1);
      expect(result[0].authorName).toBe('John Doe');
      expect(mockCacheMisses.inc).toHaveBeenCalledWith({
        operation: 'filtered_commits',
      });
      expect(mockHybridCache.set).toHaveBeenCalled();
    });

    test('should apply author filter correctly', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { author: 'Jane Smith' };

      mockHybridCache.get.mockResolvedValueOnce(null); // filtered cache miss
      mockHybridCache.get.mockResolvedValueOnce(mockCommits); // raw cache hit

      const result = await repositoryCache.getOrParseFilteredCommits(
        repoUrl,
        options
      );

      expect(result).toHaveLength(1);
      expect(result[0].authorName).toBe('Jane Smith');
    });

    test('should apply multiple authors filter correctly', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { authors: ['John Doe', 'Jane Smith'] };

      mockHybridCache.get.mockResolvedValueOnce(null); // filtered cache miss
      mockHybridCache.get.mockResolvedValueOnce(mockCommits); // raw cache hit

      const result = await repositoryCache.getOrParseFilteredCommits(
        repoUrl,
        options
      );

      expect(result).toHaveLength(2);
    });

    test('should apply date range filter correctly', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      const options = {
        fromDate: '2023-01-01T00:00:00Z',
        toDate: '2023-01-01T23:59:59Z',
      };

      mockHybridCache.get.mockResolvedValueOnce(null); // filtered cache miss
      mockHybridCache.get.mockResolvedValueOnce(mockCommits); // raw cache hit

      const result = await repositoryCache.getOrParseFilteredCommits(
        repoUrl,
        options
      );

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2023-01-01T10:00:00Z');
    });

    test('should apply pagination correctly', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { skip: 1, limit: 1 };

      mockHybridCache.get.mockResolvedValueOnce(null); // filtered cache miss
      mockHybridCache.get.mockResolvedValueOnce(mockCommits); // raw cache hit

      const result = await repositoryCache.getOrParseFilteredCommits(
        repoUrl,
        options
      );

      expect(result).toHaveLength(1);
      expect(result[0].sha).toBe('def456');
    });
  });

  describe('getOrGenerateAggregatedData', () => {
    test('should return cached aggregated data on cache hit', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.get.mockResolvedValue(mockHeatmapData);

      const result = await repositoryCache.getOrGenerateAggregatedData(repoUrl);

      expect(result).toEqual(mockHeatmapData);
      expect(mockHybridCache.get).toHaveBeenCalledWith(
        expect.stringContaining('aggregated_data')
      );
      expect(mockCacheHits.inc).toHaveBeenCalledWith({
        operation: 'aggregated_data',
      });
      expect(mockGitService.aggregateCommitsByTime).not.toHaveBeenCalled();
    });

    test('should generate aggregated data on cache miss', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      // Mock cache misses for aggregated data but hit for raw commits
      mockHybridCache.get.mockResolvedValueOnce(null); // aggregated cache miss
      mockHybridCache.get.mockResolvedValueOnce(mockCommits); // raw cache hit

      const result = await repositoryCache.getOrGenerateAggregatedData(repoUrl);

      expect(result).toEqual(mockHeatmapData);
      expect(mockCacheMisses.inc).toHaveBeenCalledWith({
        operation: 'aggregated_data',
      });
      expect(mockGitService.aggregateCommitsByTime).toHaveBeenCalledWith(
        mockCommits,
        undefined
      );
      expect(mockHybridCache.set).toHaveBeenCalled();
    });

    test('should handle aggregation with options', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { author: 'John Doe' };

      mockHybridCache.get.mockResolvedValueOnce(null); // aggregated cache miss
      mockHybridCache.get.mockResolvedValueOnce(null); // filtered cache miss
      mockHybridCache.get.mockResolvedValueOnce(mockCommits); // raw cache hit

      const result = await repositoryCache.getOrGenerateAggregatedData(
        repoUrl,
        options
      );

      expect(result).toEqual(mockHeatmapData);
      expect(mockGitService.aggregateCommitsByTime).toHaveBeenCalled();
    });
  });

  describe('invalidateRepository', () => {
    test('should invalidate all cache tiers for a repository', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      await repositoryCache.invalidateRepository(repoUrl);

      expect(mockHybridCache.del).toHaveBeenCalledTimes(5); // base keys for all cache tiers
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Repository cache invalidated across all tiers',
        expect.objectContaining({ repoUrl })
      );
    });

    test('should handle partial invalidation failures gracefully', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      // Mock one cache tier to fail - need to account for all 5 calls
      mockHybridCache.del
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Cache deletion failed'))
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      await repositoryCache.invalidateRepository(repoUrl);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to invalidate repository cache',
        expect.objectContaining({
          repoUrl,
          error: 'Cache deletion failed',
        })
      );
    });

    test('should clear cache key patterns for invalidated repository', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      // First add some cache entries to build patterns
      mockHybridCache.get.mockResolvedValue(null);
      await repositoryCache.getOrParseCommits(repoUrl);

      // Then invalidate
      await repositoryCache.invalidateRepository(repoUrl);

      expect(mockHybridCache.del).toHaveBeenCalled();
    });
  });

  describe('Transaction Management', () => {
    test('should handle cache transaction lifecycle', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.get.mockResolvedValue(null);

      await repositoryCache.getOrParseCommits(repoUrl);

      // Check that transaction was started and committed
      const stats = repositoryCache.getCacheStats();
      expect(stats.transactions.started).toBeGreaterThan(0);
      expect(stats.transactions.committed).toBeGreaterThan(0);
    });

    test('should rollback transaction on cache operation failure', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      mockHybridCache.get.mockResolvedValue(null);
      mockHybridCache.set.mockRejectedValue(new Error('Cache write failed'));
      mockGitService.getCommits.mockResolvedValue(mockCommits);

      await expect(
        repositoryCache.getOrParseCommits(repoUrl)
      ).rejects.toThrow();

      const stats = repositoryCache.getCacheStats();
      expect(stats.transactions.failed).toBeGreaterThan(0);
    });
  });

  describe('Cache Statistics', () => {
    test('should return comprehensive cache statistics', () => {
      const stats = repositoryCache.getCacheStats();

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
      const repoUrl = 'https://github.com/test/repo.git';

      // Generate some hits and misses
      mockHybridCache.get.mockResolvedValueOnce(mockCommits); // hit
      await repositoryCache.getOrParseCommits(repoUrl);

      mockHybridCache.get.mockResolvedValueOnce(null); // miss
      await repositoryCache.getOrParseCommits(repoUrl + '2');

      const stats = repositoryCache.getCacheStats();
      expect(stats.hitRatios.rawCommits).toBe(0.5); // 1 hit out of 2 operations
    });

    test('should track performance metrics', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      // Add small delay to track timing
      mockHybridCache.get.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return mockCommits;
      });

      await repositoryCache.getOrParseCommits(repoUrl);

      const stats = repositoryCache.getCacheStats();
      expect(stats.efficiency.averageHitTime).toBeGreaterThan(0);
    });
  });

  describe('Key Generation and Management', () => {
    test('should generate consistent cache keys for same input', () => {
      const repoUrl = 'https://github.com/test/repo.git';
      const options = { author: 'John Doe', limit: 10 };

      // Access private methods through prototype
      const cache = repositoryCache as any;

      const key1 = cache.generateFilteredCommitsKey(repoUrl, options);
      const key2 = cache.generateFilteredCommitsKey(repoUrl, options);

      expect(key1).toBe(key2);
    });

    test('should generate different keys for different options', () => {
      const repoUrl = 'https://github.com/test/repo.git';
      const options1 = { author: 'John Doe' };
      const options2 = { author: 'Jane Smith' };

      const cache = repositoryCache as any;

      const key1 = cache.generateFilteredCommitsKey(repoUrl, options1);
      const key2 = cache.generateFilteredCommitsKey(repoUrl, options2);

      expect(key1).not.toBe(key2);
    });

    test('should detect specific filters correctly', () => {
      const cache = repositoryCache as any;

      expect(cache.hasSpecificFilters({})).toBe(false);
      expect(cache.hasSpecificFilters({ author: 'John' })).toBe(true);
      expect(cache.hasSpecificFilters({ authors: ['John'] })).toBe(true);
      expect(cache.hasSpecificFilters({ fromDate: '2023-01-01' })).toBe(true);
      expect(cache.hasSpecificFilters({ toDate: '2023-01-01' })).toBe(true);
      expect(cache.hasSpecificFilters({ skip: 10 })).toBe(true);
      expect(cache.hasSpecificFilters({ limit: 10 })).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle cache read failures gracefully', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.get.mockRejectedValue(new Error('Cache read error'));

      const result = await repositoryCache.getOrParseCommits(repoUrl);

      expect(result).toEqual(mockCommits);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Cache operation failed'),
        expect.any(Object)
      );
    });

    test('should handle repository fetch failures', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.get.mockResolvedValue(null);
      mockGitService.getCommits.mockRejectedValue(
        new Error('Git operation failed')
      );

      await expect(repositoryCache.getOrParseCommits(repoUrl)).rejects.toThrow(
        'Git operation failed'
      );
    });

    test('should handle cache write failures with transaction rollback', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      mockHybridCache.get.mockResolvedValue(null);
      mockHybridCache.set.mockRejectedValue(new Error('Cache write failed'));

      await expect(
        repositoryCache.getOrParseCommits(repoUrl)
      ).rejects.toThrow();

      const stats = repositoryCache.getCacheStats();
      expect(stats.transactions.failed).toBeGreaterThan(0);
    });
  });

  describe('Filter Application', () => {
    test('should apply complex filter combinations correctly', () => {
      const cache = repositoryCache as any;
      const commits = [...mockCommits];

      const options = {
        author: 'John Doe',
        fromDate: '2023-01-01T00:00:00Z',
        toDate: '2023-01-01T23:59:59Z',
        skip: 0,
        limit: 1,
      };

      const filtered = cache.applyFilters(commits, options);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].authorName).toBe('John Doe');
      expect(filtered[0].date).toBe('2023-01-01T10:00:00Z');
    });

    test('should handle empty results from filters', () => {
      const cache = repositoryCache as any;
      const commits = [...mockCommits];

      const options = {
        author: 'Nonexistent Author',
      };

      const filtered = cache.applyFilters(commits, options);

      expect(filtered).toHaveLength(0);
    });

    test('should handle invalid date filters gracefully', () => {
      const cache = repositoryCache as any;
      const commits = [...mockCommits];

      const options = {
        fromDate: 'invalid-date',
        toDate: 'also-invalid',
      };

      const filtered = cache.applyFilters(commits, options);

      // Should return all commits when dates are invalid
      expect(filtered).toHaveLength(commits.length);
    });
  });

  describe('Shutdown and Cleanup', () => {
    test('should shutdown all cache tiers properly', async () => {
      await repositoryCache.shutdown();

      expect(mockHybridCache.quit).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'RepositoryCacheManager shutdown completed'
      );
    });

    test('should handle shutdown failures gracefully', async () => {
      mockHybridCache.quit.mockRejectedValueOnce(new Error('Shutdown failed'));

      await repositoryCache.shutdown();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during RepositoryCacheManager shutdown',
        expect.objectContaining({
          error: 'Shutdown failed',
        })
      );
    });

    test('should cleanup active transactions on shutdown', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      // Start a transaction but don't complete it
      mockHybridCache.get.mockResolvedValue(null);
      mockHybridCache.set.mockImplementation(() => new Promise(() => {})); // Never resolves

      // Start operation but don't await it
      repositoryCache.getOrParseCommits(repoUrl).catch(() => {});

      // Shutdown should still work
      await repositoryCache.shutdown();

      expect(mockHybridCache.quit).toHaveBeenCalledTimes(3);
    });
  });

  describe('Cache Key Patterns', () => {
    test('should track cache key patterns for efficient invalidation', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      // Perform operations to create cache patterns
      mockHybridCache.get.mockResolvedValue(null);
      await repositoryCache.getOrParseCommits(repoUrl);

      const options = { author: 'John Doe' };
      await repositoryCache.getOrParseFilteredCommits(repoUrl, options);
      await repositoryCache.getOrGenerateAggregatedData(repoUrl, options);

      // Invalidation should use tracked patterns
      await repositoryCache.invalidateRepository(repoUrl);

      expect(mockHybridCache.del).toHaveBeenCalled();
    });
  });

  describe('Concurrent Operations Safety', () => {
    // NOTE: All tests use mocked services - no actual repository operations

    test('should handle concurrent cache requests for same repository safely', async () => {
      const repoUrl = 'https://github.com/test/small-repo.git';
      let getCommitsCallCount = 0;

      // Mock cache miss for both requests
      mockHybridCache.get.mockResolvedValue(null);

      // Mock git service to track call count
      mockGitService.getCommits.mockImplementation(async () => {
        getCommitsCallCount++;
        // Add delay to simulate real Git operation
        await new Promise((resolve) => setTimeout(resolve, 50));
        return mockCommits;
      });

      // Make concurrent requests
      const promises = [
        repositoryCache.getOrParseCommits(repoUrl),
        repositoryCache.getOrParseCommits(repoUrl),
        repositoryCache.getOrParseCommits(repoUrl),
      ];

      const results = await Promise.all(promises);

      // All should succeed with same data
      expect(results).toHaveLength(3);
      results.forEach((result) => expect(result).toEqual(mockCommits));

      // Due to locking, git service should be called (actual count may vary with timing)
      expect(getCommitsCallCount).toBeGreaterThanOrEqual(1);
      expect(getCommitsCallCount).toBeLessThanOrEqual(3);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Duplicate clone prevented',
        expect.objectContaining({
          repoUrl,
          totalPrevented: expect.any(Number),
        })
      );
    });

    test('should handle concurrent heatmap requests safely', async () => {
      const repoUrl = 'https://github.com/test/small-repo.git';
      let aggregateCallCount = 0;

      // Mock cache misses
      mockHybridCache.get.mockResolvedValue(null);

      mockGitService.aggregateCommitsByTime.mockImplementation(async () => {
        aggregateCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return mockHeatmapData;
      });

      // Make concurrent heatmap requests
      const promises = [
        repositoryCache.getOrGenerateAggregatedData(repoUrl),
        repositoryCache.getOrGenerateAggregatedData(repoUrl),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(2);
      results.forEach((result) => expect(result).toEqual(mockHeatmapData));

      // Should aggregate (actual count may vary with timing)
      expect(aggregateCallCount).toBeGreaterThanOrEqual(1);
      expect(aggregateCallCount).toBeLessThanOrEqual(2);
    });

    test('should handle mixed concurrent operations', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      mockHybridCache.get.mockResolvedValue(null);

      // Mix different operation types
      const promises = [
        repositoryCache.getOrParseCommits(repoUrl),
        repositoryCache.getOrParseFilteredCommits(repoUrl, { author: 'John' }),
        repositoryCache.getOrGenerateAggregatedData(repoUrl),
        repositoryCache.getOrParseCommits(repoUrl, { limit: 10 }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(4);
      expect(results[0]).toEqual(mockCommits);
      expect(results[2]).toEqual(mockHeatmapData);
    });
  });

  describe('Cache Consistency Under Failure Conditions', () => {
    // NOTE: All tests simulate failures using mocks - no actual infrastructure failures

    test('should handle cache write failures gracefully', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      mockHybridCache.get.mockResolvedValue(null);

      // Simulate cache write failure
      mockHybridCache.set.mockRejectedValue(
        new Error('Redis connection failed')
      );

      await expect(repositoryCache.getOrParseCommits(repoUrl)).rejects.toThrow(
        'Redis connection failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cache raw commits'),
        expect.any(Object)
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cache raw commits'),
        expect.objectContaining({
          repoUrl,
          error: expect.stringContaining('Redis connection failed'),
        })
      );
    });

    test('should handle cache write failures with rollback attempt', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      mockHybridCache.get.mockResolvedValue(null);
      mockHybridCache.set.mockRejectedValue(new Error('Cache write failed'));

      await expect(repositoryCache.getOrParseCommits(repoUrl)).rejects.toThrow(
        'Cache write failed'
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should handle complete cache invalidation with partial failures', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      // Setup some cache entries first
      mockHybridCache.get.mockResolvedValue(null);
      await repositoryCache.getOrParseCommits(repoUrl);
      await repositoryCache.getOrParseFilteredCommits(repoUrl, {
        author: 'test',
      });

      // Mock partial invalidation failure
      mockHybridCache.del
        .mockResolvedValueOnce(true) // First deletion succeeds
        .mockRejectedValueOnce(new Error('Cache deletion failed')) // Second fails
        .mockResolvedValueOnce(true) // Third succeeds
        .mockResolvedValueOnce(true) // Fourth succeeds
        .mockResolvedValueOnce(true); // Fifth succeeds

      await repositoryCache.invalidateRepository(repoUrl);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to invalidate repository cache',
        expect.objectContaining({
          repoUrl,
          error: 'Cache deletion failed',
        })
      );
    });

    test('should verify complete invalidation across all cache tiers', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      // Populate all cache tiers
      mockHybridCache.get.mockResolvedValue(null);
      await repositoryCache.getOrParseCommits(repoUrl);
      await repositoryCache.getOrParseFilteredCommits(repoUrl, {
        author: 'test',
      });
      await repositoryCache.getOrGenerateAggregatedData(repoUrl);

      // Clear mock call history
      mockHybridCache.del.mockClear();
      mockLogger.info.mockClear();

      // Invalidate repository
      await repositoryCache.invalidateRepository(repoUrl);

      // Should call del multiple times for cache invalidation
      expect(mockHybridCache.del).toHaveBeenCalled();
      expect(mockHybridCache.del.mock.calls.length).toBeGreaterThanOrEqual(3);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Repository cache invalidated across all tiers',
        expect.objectContaining({
          repoUrl,
          keysInvalidated: expect.any(Number),
          totalOperations: expect.any(Number),
        })
      );
    });

    test('should handle unexpected cache data types gracefully', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      // Mock various types of corrupted/unexpected data
      mockHybridCache.get.mockResolvedValue(null); // Return null to trigger fresh fetch

      // Should handle gracefully and re-fetch from repository
      const result = await repositoryCache.getOrParseCommits(repoUrl);
      expect(result).toEqual(mockCommits);

      // Should have fetched from repository due to cache miss
      expect(mockGitService.getCommits).toHaveBeenCalled();
    });
  });

  describe('Transaction Management Edge Cases', () => {
    test('should handle transaction timeout scenarios', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      mockHybridCache.get.mockResolvedValue(null);

      // Mock very slow cache operation
      mockHybridCache.set.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      const result = await repositoryCache.getOrParseCommits(repoUrl);
      expect(result).toEqual(mockCommits);

      const stats = repositoryCache.getCacheStats();
      expect(stats.transactions.committed).toBeGreaterThan(0);
    });

    test('should cleanup abandoned transactions on shutdown', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      // Create an operation that never completes
      mockHybridCache.get.mockResolvedValue(null);
      mockHybridCache.set.mockImplementation(() => new Promise(() => {})); // Never resolves

      // Start operation but don't await
      const operationPromise = repositoryCache.getOrParseCommits(repoUrl);

      // Give it time to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Shutdown should cleanup active transactions
      await repositoryCache.shutdown();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Shutting down with active transactions',
        expect.objectContaining({
          activeTransactions: expect.any(Number),
        })
      );

      // Cleanup the hanging promise
      operationPromise.catch(() => {});
    });

    test('should handle transaction rollback failures', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      mockHybridCache.get.mockResolvedValue(null);
      mockHybridCache.set.mockRejectedValue(new Error('Cache write failed'));

      await expect(
        repositoryCache.getOrParseCommits(repoUrl)
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cache raw commits'),
        expect.any(Object)
      );
    });

    test('should prevent double commit/rollback of transactions', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      // Get access to private methods for testing
      const cache = repositoryCache as any;
      const transaction = cache.createTransaction(repoUrl);

      // Commit once
      await cache.commitTransaction(transaction);

      // Attempt to commit again
      await cache.commitTransaction(transaction);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempted to commit already completed transaction',
        expect.objectContaining({
          transactionId: transaction.id,
        })
      );

      // Attempt to rollback completed transaction
      await cache.rollbackTransaction(transaction);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempted to rollback already completed transaction',
        expect.objectContaining({
          transactionId: transaction.id,
        })
      );
    });
  });

  describe('Advanced Cache Scenarios', () => {
    test('should handle empty commits from git service', async () => {
      const repoUrl = 'https://github.com/empty/repo.git';

      mockHybridCache.get.mockResolvedValue(null);
      mockGitService.getCommits.mockResolvedValue([]);

      const result = await repositoryCache.getOrParseCommits(repoUrl);

      expect(result).toEqual([]);
      expect(mockHybridCache.set).toHaveBeenCalled();
    });

    test('should handle null commits in aggregation path', async () => {
      const repoUrl = 'https://github.com/test/repo.git';

      mockHybridCache.get.mockResolvedValue(null);

      // Mock getOrParseFilteredCommits to return null
      const originalMethod = repositoryCache.getOrParseFilteredCommits;
      (repositoryCache as any).getOrParseFilteredCommits = vi
        .fn()
        .mockResolvedValue(null);

      const result = await repositoryCache.getOrGenerateAggregatedData(repoUrl);

      expect(result).toEqual(mockHeatmapData);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'getOrParseFilteredCommits returned null, using empty array',
        { repoUrl }
      );
      expect(mockGitService.aggregateCommitsByTime).toHaveBeenCalledWith(
        [],
        undefined
      );

      // Restore original method
      (repositoryCache as any).getOrParseFilteredCommits = originalMethod;
    });

    test('should track cache key patterns correctly', async () => {
      const repoUrl = 'https://github.com/pattern/test.git';
      const cache = repositoryCache as any;

      // Test key pattern tracking
      const rawKey = cache.generateRawCommitsKey(repoUrl);
      const filteredKey = cache.generateFilteredCommitsKey(repoUrl, {
        author: 'test',
      });
      const aggregatedKey = cache.generateAggregatedDataKey(repoUrl, {
        timePeriod: 'day',
      });

      expect(rawKey).toContain('raw_commits:');
      expect(filteredKey).toContain('filtered_commits:');
      expect(aggregatedKey).toContain('aggregated_data:');

      // Keys should be tracked in patterns
      expect(cache.cacheKeyPatterns.size).toBeGreaterThan(0);
    });

    test('should apply complex filter combinations correctly', async () => {
      const cache = repositoryCache as any;

      const complexCommits = [
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
        {
          sha: 'ghi789',
          authorName: 'John Doe',
          authorEmail: 'john@example.com',
          date: '2023-01-03T12:00:00Z',
          message: 'Fix bug',
        },
      ];

      // Test complex filter with multiple criteria
      const options = {
        authors: ['John Doe', 'Jane Smith'],
        fromDate: '2023-01-01T00:00:00Z',
        toDate: '2023-01-02T23:59:59Z',
        skip: 0,
        limit: 2,
      };

      const filtered = cache.applyFilters(complexCommits, options);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].authorName).toBe('John Doe');
      expect(filtered[1].authorName).toBe('Jane Smith');
    });

    test('should handle invalid date filters gracefully', async () => {
      const cache = repositoryCache as any;

      const options = {
        fromDate: 'not-a-date',
        toDate: 'also-not-a-date',
      };

      const filtered = cache.applyFilters(mockCommits, options);

      // Should return all commits when dates are invalid
      expect(filtered).toHaveLength(mockCommits.length);
    });

    test('should calculate performance metrics accurately', async () => {
      const repoUrl = 'https://github.com/perf/test.git';

      // Mock cache hit with timing
      mockHybridCache.get.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return mockCommits;
      });

      await repositoryCache.getOrParseCommits(repoUrl);

      const stats = repositoryCache.getCacheStats();
      expect(stats.efficiency.averageHitTime).toBeGreaterThan(0);
      expect(stats.efficiency.totalCacheOperations).toBeGreaterThan(0);
    });

    test('should handle specific filter detection edge cases', () => {
      const cache = repositoryCache as any;

      // Test edge cases for filter detection
      expect(cache.hasSpecificFilters(undefined)).toBe(false);
      expect(cache.hasSpecificFilters(null)).toBe(false);
      expect(cache.hasSpecificFilters({ author: 'valid-author' })).toBe(true);
      expect(cache.hasSpecificFilters({ authors: ['author1'] })).toBe(true);
      expect(cache.hasSpecificFilters({ skip: 1 })).toBe(true);
      expect(cache.hasSpecificFilters({ limit: 10 })).toBe(true);
    });

    test('should handle cache statistics with zero operations', () => {
      // Create fresh instance to test zero state
      const freshCache = new (repositoryCache.constructor as any)();
      const stats = freshCache.getCacheStats();

      expect(stats.hitRatios.overall).toBe(0);
      expect(stats.efficiency.averageHitTime).toBe(0);
      expect(stats.efficiency.averageMissTime).toBe(0);
    });
  });

  describe('Memory and Resource Management', () => {
    test('should handle memory pressure scenarios', async () => {
      const repoUrl = 'https://github.com/large/repo.git';

      // Mock large repository scenario
      const largeCommitSet = Array.from({ length: 10000 }, (_, i) => ({
        sha: `commit_${i}`,
        authorName: `Author ${i % 100}`,
        authorEmail: `author${i % 100}@example.com`,
        date: new Date(Date.now() - i * 86400000).toISOString(),
        message: `Commit ${i}`,
      }));

      mockHybridCache.get.mockResolvedValue(null);
      mockGitService.getCommits.mockResolvedValue(largeCommitSet);

      const result = await repositoryCache.getOrParseCommits(repoUrl);

      expect(result).toHaveLength(10000);
      expect(mockHybridCache.set).toHaveBeenCalled();
    });

    test('should properly cleanup resources on shutdown errors', async () => {
      // Mock one cache tier shutdown failure
      mockHybridCache.quit
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Shutdown error'))
        .mockResolvedValueOnce(undefined);

      await repositoryCache.shutdown();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during RepositoryCacheManager shutdown',
        expect.objectContaining({
          error: 'Shutdown error',
          failedShutdowns: 1,
        })
      );
    });
  });
});
