import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { Application } from 'express';

// Mock all external dependencies BEFORE any imports
const mockGitService = {
  cloneRepository: vi.fn(),
  getCommits: vi.fn(),
  getCommitCount: vi.fn(),
  shouldUseStreaming: vi.fn(),
  getCommitsStream: vi.fn(),
  aggregateCommitsByTime: vi.fn(),
  cleanupRepository: vi.fn(),
  clearStreamingResumeState: vi.fn(),
  getStreamingResumeState: vi.fn(),
};

const mockRepositoryCache = {
  getCachedCommits: vi.fn(),
  getCachedAggregatedData: vi.fn(),
  getRepositoryCacheStats: vi.fn(),
  repositoryCache: {
    get: vi.fn(),
    set: vi.fn(),
    invalidateRepository: vi.fn(),
  },
};

const mockWithTempRepository = {
  withTempRepositoryStreaming: vi.fn(),
  getRepositoryInfo: vi.fn(),
  invalidateRepositoryCache: vi.fn(),
  getCoordinationMetrics: vi.fn(),
  getRepositoryStatus: vi.fn(),
};

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
};

const mockConfig = {
  repositoryCache: { enabled: true },
  operationCoordination: { enabled: true },
  streaming: {
    enabled: true,
    commitThreshold: 1000,
    batchSize: 100,
  },
  cacheStrategy: { hierarchicalCaching: true },
};

const mockMetrics = {
  requestsTotal: { inc: vi.fn() },
  requestDuration: { observe: vi.fn() },
  recordStreamingStart: vi.fn(),
  recordStreamingCompletion: vi.fn(),
  recordStreamingError: vi.fn(),
  recordStreamingBatch: vi.fn(),
  getRepositorySizeCategory: vi.fn(() => 'medium'),
  getBatchSizeCategory: vi.fn(() => 'medium'),
  updateCacheMetrics: vi.fn(),
  tempDirectories: { inc: vi.fn(), dec: vi.fn() },
  cleanupQueueSize: { set: vi.fn() },
  recordFeatureUsage: vi.fn(),
  recordEnhancedCacheOperation: vi.fn(),
  recordSLACompliance: vi.fn(),
  getUserType: vi.fn(() => 'api'),
  getRepositoryType: vi.fn(() => 'public'),
  updateServiceHealthScore: vi.fn(),
};

// Mock modules
vi.mock('../../../src/services/gitService', () => ({
  gitService: mockGitService,
}));

vi.mock('../../../src/services/repositoryCache', () => mockRepositoryCache);

vi.mock('../../../src/utils/withTempRepository', () => mockWithTempRepository);

vi.mock('../../../src/services/cache', () => ({
  __esModule: true,
  default: mockRedis,
}));

vi.mock('../../../src/config', () => ({
  config: mockConfig,
}));

vi.mock('../../../src/services/metrics', () => mockMetrics);

vi.mock('../../../src/services/logger', () => ({
  default: global.mockLogger,
  getLogger: () => global.mockLogger,
  createRequestLogger: vi.fn(() => global.mockLogger),
}));

vi.mock('../../../src/utils/cleanupScheduler', () => ({
  runCleanupQueue: vi.fn(),
}));

describe('CommitRoutes Unit Tests', () => {
  let app: Application;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = process.env.NODE_ENV;

    // Reset config to defaults
    Object.assign(mockConfig, {
      repositoryCache: { enabled: true },
      operationCoordination: { enabled: true },
      streaming: { enabled: true, commitThreshold: 1000, batchSize: 100 },
      cacheStrategy: { hierarchicalCaching: true },
    });

    // Set up fresh Express app for each test
    app = express();
    app.use(express.json());

    // Import and mount the router AFTER mocks are configured
    const { default: commitRoutes } = await import(
      '../../../src/routes/commitRoutes'
    );
    app.use('/api/commits', commitRoutes);

    // Add a simple error handler for testing
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: any, req: any, res: any, next: any) => {
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        code: err.code || 'INTERNAL_ERROR',
      });
    });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.resetModules();
  });

  describe('GET /heatmap - Business Logic Tests', () => {
    test('should process valid heatmap request with filters', async () => {
      // ARRANGE
      const mockHeatmap = {
        timePeriod: 'day',
        data: [{ date: '2023-01-01', commits: 5 }],
        metadata: { maxCommitCount: 5, totalCommits: 5 },
      };

      mockRepositoryCache.getCachedAggregatedData.mockResolvedValue(
        mockHeatmap
      );
      mockWithTempRepository.getRepositoryInfo.mockResolvedValue({
        name: 'repo',
        url: 'https://github.com/user/repo.git',
        branch: 'main',
      });
      mockRepositoryCache.getRepositoryCacheStats.mockReturnValue({
        hitRatios: { overall: 0.8 },
        entries: { total: 10 },
        memoryUsage: { total: 1000 },
        efficiency: { duplicateClonesPrevented: 5 },
      });

      // ACT
      const response = await request(app).get('/api/commits/heatmap').query({
        repoUrl: 'https://github.com/user/repo.git',
        author: 'testuser',
        fromDate: '2023-01-01T00:00:00Z',
        toDate: '2023-12-31T23:59:59Z',
      });

      // ASSERT
      expect(response.status).toBe(200);
      expect(mockRepositoryCache.getCachedAggregatedData).toHaveBeenCalledWith(
        'https://github.com/user/repo.git',
        {
          author: 'testuser',
          authors: undefined,
          fromDate: '2023-01-01T00:00:00Z',
          toDate: '2023-12-31T23:59:59Z',
        }
      );
      expect(response.body).toMatchObject(mockHeatmap);
    });

    test('should handle multiple authors by splitting comma-separated list', async () => {
      // ARRANGE
      const mockHeatmap = {
        timePeriod: 'day',
        data: [],
        metadata: { maxCommitCount: 0, totalCommits: 0 },
      };

      mockRepositoryCache.getCachedAggregatedData.mockResolvedValue(
        mockHeatmap
      );
      mockWithTempRepository.getRepositoryInfo.mockResolvedValue({
        name: 'repo',
      });
      mockRepositoryCache.getRepositoryCacheStats.mockReturnValue({
        hitRatios: { overall: 0.5 },
        entries: { total: 0 },
        memoryUsage: { total: 0 },
        efficiency: { duplicateClonesPrevented: 0 },
      });

      // ACT
      const response = await request(app).get('/api/commits/heatmap').query({
        repoUrl: 'https://github.com/user/repo.git',
        authors: 'user1,user2,user3',
      });

      // ASSERT
      expect(response.status).toBe(200);
      expect(mockRepositoryCache.getCachedAggregatedData).toHaveBeenCalledWith(
        'https://github.com/user/repo.git',
        {
          author: undefined,
          authors: ['user1', 'user2', 'user3'],
          fromDate: undefined,
          toDate: undefined,
        }
      );
    });

    test('should return 500 when cache operation fails', async () => {
      // ARRANGE
      const cacheError = new Error('Cache operation failed');
      mockRepositoryCache.getCachedAggregatedData.mockRejectedValue(cacheError);

      // ACT
      const response = await request(app)
        .get('/api/commits/heatmap')
        .query({ repoUrl: 'https://github.com/user/repo.git' });

      // ASSERT
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Cache operation failed'),
      });
    });

    test('should set cache headers based on hit ratio', async () => {
      // ARRANGE
      mockRepositoryCache.getCachedAggregatedData.mockResolvedValue({
        timePeriod: 'day',
        data: [],
        metadata: { maxCommitCount: 0, totalCommits: 0 },
      });
      mockWithTempRepository.getRepositoryInfo.mockResolvedValue({
        name: 'repo',
        cached: true,
      });
      mockRepositoryCache.getRepositoryCacheStats.mockReturnValue({
        hitRatios: {
          aggregatedData: 0.95,
          filteredCommits: 0.85,
          rawCommits: 0.8,
          overall: 0.9,
        },
        entries: { total: 10 },
        memoryUsage: { total: 1000 },
        efficiency: { duplicateClonesPrevented: 5 },
      });

      // ACT
      const response = await request(app)
        .get('/api/commits/heatmap')
        .query({ repoUrl: 'https://github.com/user/repo.git' });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.headers['x-cache-status']).toBe('HIT');
      expect(response.headers['x-cache-level']).toBe('AGGREGATED');
      expect(response.headers['x-cache-hit-ratio']).toBe('0.900');
    });
  });

  describe('GET /commits - List Commits Business Logic', () => {
    test('should handle paginated commit requests with default values', async () => {
      // ARRANGE
      const mockCommits = [
        {
          sha: 'abc123',
          message: 'Test commit',
          date: '2023-01-01T00:00:00Z',
          authorName: 'User',
          authorEmail: 'user@test.com',
        },
      ];

      mockRepositoryCache.getCachedCommits.mockResolvedValue(mockCommits);
      mockWithTempRepository.getRepositoryInfo.mockResolvedValue({
        name: 'repo',
        cached: false,
      });
      mockRepositoryCache.getRepositoryCacheStats.mockReturnValue({
        hitRatios: { overall: 0.1 },
        entries: { total: 5 },
        memoryUsage: { total: 500 },
        efficiency: { duplicateClonesPrevented: 0 },
      });

      // ACT
      const response = await request(app)
        .get('/api/commits')
        .query({ repoUrl: 'https://github.com/user/repo.git' });

      // ASSERT
      expect(response.status).toBe(200);
      expect(mockRepositoryCache.getCachedCommits).toHaveBeenCalledWith(
        'https://github.com/user/repo.git',
        { skip: 0, limit: 100 }
      );
      expect(response.body).toMatchObject({
        commits: mockCommits,
        page: 1,
        limit: 100,
        streamingUsed: false,
        totalCommits: 1,
      });
    });

    test('should calculate correct skip value for pagination', async () => {
      // ARRANGE
      mockRepositoryCache.getCachedCommits.mockResolvedValue([]);
      mockWithTempRepository.getRepositoryInfo.mockResolvedValue({
        name: 'repo',
      });
      mockRepositoryCache.getRepositoryCacheStats.mockReturnValue({
        hitRatios: { overall: 0.5 },
        entries: { total: 0 },
        memoryUsage: { total: 0 },
        efficiency: { duplicateClonesPrevented: 0 },
      });

      // ACT
      const response = await request(app).get('/api/commits').query({
        repoUrl: 'https://github.com/user/repo.git',
        page: '3',
        limit: '25',
      });

      // ASSERT
      expect(response.status).toBe(200);
      expect(mockRepositoryCache.getCachedCommits).toHaveBeenCalledWith(
        'https://github.com/user/repo.git',
        { skip: 50, limit: 25 } // (3-1) * 25 = 50
      );
    });

    test('should determine cache status from hit ratio ranges', async () => {
      // ARRANGE
      mockRepositoryCache.getCachedCommits.mockResolvedValue([]);
      mockWithTempRepository.getRepositoryInfo.mockResolvedValue({
        name: 'repo',
      });
      mockRepositoryCache.getRepositoryCacheStats.mockReturnValue({
        hitRatios: { overall: 0.6 },
        entries: { total: 0 },
        memoryUsage: { total: 0 },
        efficiency: { duplicateClonesPrevented: 0 },
      });

      // ACT
      const response = await request(app)
        .get('/api/commits')
        .query({ repoUrl: 'https://github.com/user/repo.git' });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.headers['x-cache-status']).toBe('PARTIAL');
      expect(response.headers['x-cache-level']).toBe('MULTI_TIER');
    });
  });

  describe('GET /info - Repository Info Business Logic', () => {
    test('should return repository information with coordination metrics', async () => {
      // ARRANGE
      const mockRepoInfo = {
        name: 'repo',
        url: 'https://github.com/user/repo.git',
        branch: 'main',
        cached: true,
        commitCount: 150,
      };

      mockWithTempRepository.getRepositoryInfo.mockResolvedValue(mockRepoInfo);
      mockRepositoryCache.getRepositoryCacheStats.mockReturnValue({
        hitRatios: {
          rawCommits: 0.8,
          filteredCommits: 0.7,
          aggregatedData: 0.9,
          overall: 0.8,
        },
        entries: { rawCommits: 10, filteredCommits: 5, aggregatedData: 3 },
        memoryUsage: {
          rawCommits: 1000,
          filteredCommits: 500,
          aggregatedData: 200,
          total: 1700,
        },
        efficiency: { duplicateClonesPrevented: 5, totalCacheOperations: 20 },
      });
      mockWithTempRepository.getCoordinationMetrics.mockReturnValue({
        cachedRepositories: 3,
        activeClones: 1,
        coalescedOperations: 5,
      });

      // ACT
      const response = await request(app)
        .get('/api/commits/info')
        .query({ repoUrl: 'https://github.com/user/repo.git' });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'repo',
        url: 'https://github.com/user/repo.git',
        branch: 'main',
        cached: true,
        streamingConfig: expect.objectContaining({
          enabled: true,
        }),
        cacheInfo: expect.objectContaining({
          coordination: expect.objectContaining({
            enabled: true,
          }),
          performance: expect.objectContaining({
            hitRatios: expect.any(Object),
          }),
        }),
      });
    });

    test('should handle repository info fetch failures', async () => {
      // ARRANGE
      const fetchError = new Error('Repository not found');
      mockWithTempRepository.getRepositoryInfo.mockRejectedValue(fetchError);

      // ACT
      const response = await request(app)
        .get('/api/commits/info')
        .query({ repoUrl: 'https://github.com/user/repo.git' });

      // ASSERT
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Repository not found'),
      });
    });
  });

  describe('Validation Logic Tests', () => {
    test('should return 400 for missing repoUrl', async () => {
      // ACT
      const response = await request(app).get('/api/commits/heatmap');

      // ASSERT
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Validation failed'),
        code: 'VALIDATION_ERROR',
      });
      expect(
        mockRepositoryCache.getCachedAggregatedData
      ).not.toHaveBeenCalled();
    });

    test('should validate URLs in production environment', async () => {
      // ARRANGE
      process.env.NODE_ENV = 'production';

      // ACT
      const response = await request(app)
        .get('/api/commits/heatmap')
        .query({ repoUrl: 'http://localhost/repo.git' });

      // ASSERT
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Validation failed'),
      });
    });

    test('should reject invalid page parameter', async () => {
      // ACT
      const response = await request(app).get('/api/commits').query({
        repoUrl: 'https://github.com/user/repo.git',
        page: '0',
      });

      // ASSERT
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Validation failed'),
        code: 'VALIDATION_ERROR',
      });
    });

    test('should reject invalid limit parameter', async () => {
      // ACT
      const response = await request(app).get('/api/commits').query({
        repoUrl: 'https://github.com/user/repo.git',
        limit: '101',
      });

      // ASSERT
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Validation failed'),
        code: 'VALIDATION_ERROR',
      });
    });

    test('should reject future dates in filters', async () => {
      // ARRANGE
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      // ACT
      const response = await request(app).get('/api/commits/heatmap').query({
        repoUrl: 'https://github.com/user/repo.git',
        fromDate: futureDate.toISOString(),
      });

      // ASSERT
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Validation failed'),
      });
    });

    test('should reject toDate before fromDate', async () => {
      // ACT
      const response = await request(app).get('/api/commits/heatmap').query({
        repoUrl: 'https://github.com/user/repo.git',
        fromDate: '2023-12-31T00:00:00Z',
        toDate: '2023-01-01T00:00:00Z',
      });

      // ASSERT
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Validation failed'),
      });
    });
  });

  describe('Configuration Dependency Tests', () => {
    test('should behave when cache is disabled', async () => {
      // ARRANGE
      mockConfig.repositoryCache.enabled = false;

      mockRepositoryCache.getCachedAggregatedData.mockResolvedValue({
        timePeriod: 'day',
        data: [],
        metadata: { maxCommitCount: 0, totalCommits: 0 },
      });
      mockWithTempRepository.getRepositoryInfo.mockResolvedValue({
        name: 'repo',
      });
      mockRepositoryCache.getRepositoryCacheStats.mockReturnValue({
        hitRatios: { overall: 0 },
        entries: { total: 0 },
        memoryUsage: { total: 0 },
        efficiency: { duplicateClonesPrevented: 0 },
      });

      // ACT
      const response = await request(app)
        .get('/api/commits/heatmap')
        .query({ repoUrl: 'https://github.com/user/repo.git' });

      // ASSERT
      expect(response.status).toBe(200);
      expect(mockRepositoryCache.getCachedAggregatedData).toHaveBeenCalled();
    });

    test('should handle streaming disabled configuration', async () => {
      // ARRANGE
      mockConfig.streaming.enabled = false;

      // ACT
      const response = await request(app)
        .post('/api/commits/stream')
        .send({ repoUrl: 'https://github.com/user/repo.git' });

      // ASSERT
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Streaming is disabled'),
      });
    });
  });

  describe('Error Handling Tests', () => {
    test('should handle service timeout scenarios', async () => {
      // ARRANGE
      const timeoutError = new Error('Operation timed out');
      timeoutError.name = 'TimeoutError';
      mockRepositoryCache.getCachedAggregatedData.mockRejectedValue(
        timeoutError
      );

      // ACT
      const response = await request(app)
        .get('/api/commits/heatmap')
        .query({ repoUrl: 'https://github.com/user/repo.git' });

      // ASSERT
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('Operation timed out'),
      });
    });

    test('should handle empty repository scenarios', async () => {
      // ARRANGE
      mockRepositoryCache.getCachedAggregatedData.mockResolvedValue({
        timePeriod: 'day',
        data: [],
        metadata: { maxCommitCount: 0, totalCommits: 0 },
      });
      mockWithTempRepository.getRepositoryInfo.mockResolvedValue({
        name: 'empty-repo',
        commitCount: 0,
      });
      mockRepositoryCache.getRepositoryCacheStats.mockReturnValue({
        hitRatios: { overall: 1 },
        entries: { total: 0 },
        memoryUsage: { total: 0 },
        efficiency: { duplicateClonesPrevented: 0 },
      });

      // ACT
      const response = await request(app)
        .get('/api/commits/heatmap')
        .query({ repoUrl: 'https://github.com/user/empty-repo.git' });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        data: [],
        metadata: expect.objectContaining({ totalCommits: 0 }),
      });
    });
  });

  describe('Cache Management Endpoints', () => {
    test('should return cache statistics', async () => {
      // ARRANGE
      mockRepositoryCache.getRepositoryCacheStats.mockReturnValue({
        hitRatios: { overall: 0.85 },
        entries: { total: 20 },
        memoryUsage: { total: 2000 },
        efficiency: { duplicateClonesPrevented: 10 },
      });
      mockWithTempRepository.getCoordinationMetrics.mockReturnValue({
        cachedRepositories: 5,
        activeClones: 2,
      });
      mockWithTempRepository.getRepositoryStatus.mockReturnValue([
        {
          repoUrl: 'https://github.com/user/repo1.git',
          commitCount: 100,
          sizeCategory: 'medium',
          refCount: 1,
          age: 30000,
          lastAccessed: new Date('2023-01-01T12:00:00Z'),
        },
      ]);

      // ACT
      const response = await request(app).get('/api/commits/cache/stats');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        cache: expect.objectContaining({ hitRatios: { overall: 0.85 } }),
        coordination: expect.objectContaining({ cachedRepositories: 5 }),
        repositories: expect.objectContaining({
          cached: 1,
          details: expect.arrayContaining([
            expect.objectContaining({
              repoUrl: 'https://github.com/user/repo1.git',
            }),
          ]),
        }),
      });
    });

    test('should invalidate repository cache', async () => {
      // ARRANGE
      mockWithTempRepository.invalidateRepositoryCache.mockResolvedValue(
        undefined
      );
      mockRepositoryCache.repositoryCache.invalidateRepository.mockResolvedValue(
        undefined
      );

      // ACT
      const response = await request(app)
        .post('/api/commits/cache/invalidate')
        .send({ repoUrl: 'https://github.com/user/repo.git' });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Repository cache invalidated successfully',
        repoUrl: 'https://github.com/user/repo.git',
      });
      expect(
        mockWithTempRepository.invalidateRepositoryCache
      ).toHaveBeenCalledWith('https://github.com/user/repo.git');
    });

    test('should handle cache invalidation errors', async () => {
      // ARRANGE
      const error = new Error('Cache invalidation failed');
      mockWithTempRepository.invalidateRepositoryCache.mockRejectedValue(error);

      // ACT
      const response = await request(app)
        .post('/api/commits/cache/invalidate')
        .send({ repoUrl: 'https://github.com/user/repo.git' });

      // ASSERT
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: 'Failed to invalidate repository cache',
      });
    });

    test('should list cached repositories', async () => {
      // ARRANGE
      mockWithTempRepository.getRepositoryStatus.mockReturnValue([
        {
          repoUrl: 'https://github.com/user/repo1.git',
          commitCount: 100,
          sizeCategory: 'medium',
          refCount: 1,
          age: 120000, // 2 minutes
          lastAccessed: new Date('2023-01-01T12:00:00Z'),
        },
        {
          repoUrl: 'https://github.com/user/repo2.git',
          commitCount: 50,
          sizeCategory: 'small',
          refCount: 2,
          age: 300000, // 5 minutes
          lastAccessed: new Date('2023-01-01T11:55:00Z'),
        },
      ]);
      mockWithTempRepository.getCoordinationMetrics.mockReturnValue({
        cachedRepositories: 2,
        activeClones: 1,
        totalCacheHits: 15,
        totalCacheMisses: 3,
      });

      // ACT
      const response = await request(app).get(
        '/api/commits/cache/repositories'
      );

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        repositories: expect.arrayContaining([
          expect.objectContaining({
            repoUrl: 'https://github.com/user/repo1.git',
            ageMinutes: 2,
            lastAccessedFormatted: '2023-01-01T12:00:00.000Z',
          }),
          expect.objectContaining({
            repoUrl: 'https://github.com/user/repo2.git',
            ageMinutes: 5,
            lastAccessedFormatted: '2023-01-01T11:55:00.000Z',
          }),
        ]),
        summary: expect.objectContaining({
          total: 2,
          maxRepositories: 50,
          utilizationPercent: 4,
        }),
        coordination: expect.objectContaining({
          cachedRepositories: 2,
          activeClones: 1,
        }),
        timestamp: expect.any(String),
      });
    });
  });

  describe('Streaming Endpoints', () => {
    test('should handle streaming with valid options', async () => {
      // ARRANGE
      mockWithTempRepository.getRepositoryInfo.mockResolvedValue({
        name: 'test-repo',
        commitCount: 150,
        sizeCategory: 'medium',
        cached: false,
        isShared: true,
      });

      const mockCommitBatch = [
        {
          sha: 'abc123',
          message: 'Commit 1',
          author: 'User',
          date: new Date(),
        },
        {
          sha: 'def456',
          message: 'Commit 2',
          author: 'User',
          date: new Date(),
        },
      ];

      // Mock the async generator for getCommitsStream
      const mockStreamGenerator = async function* () {
        yield mockCommitBatch;
        yield mockCommitBatch;
      };
      mockGitService.getCommitsStream.mockReturnValue(mockStreamGenerator());

      mockWithTempRepository.withTempRepositoryStreaming.mockImplementation(
        async (repoUrl, callback) => {
          await callback('/tmp/repo', 150);
        }
      );

      mockRepositoryCache.getRepositoryCacheStats.mockReturnValue({
        hitRatios: { overall: 0.75 },
      });

      // ACT
      const response = await request(app)
        .post('/api/commits/stream')
        .send({
          repoUrl: 'https://github.com/user/repo.git',
          batchSize: 50,
          maxCommits: 100,
        })
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            callback(null, data);
          });
        });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/x-ndjson');
      expect(response.headers['x-streaming-mode']).toBe('enabled');
      expect(response.headers['x-repository-size']).toBe('medium');
      expect(response.headers['x-repository-cached']).toBe('false');
      expect(response.headers['x-repository-shared']).toBe('true');

      // Verify that the response contains streaming data
      expect(response.body).toContain('"type":"metadata"');
      expect(response.body).toContain('"type":"batch"');
      expect(response.body).toContain('"type":"complete"');
    });

    test('should handle streaming error scenarios', async () => {
      // ARRANGE
      const streamError = new Error('Streaming failed');
      mockWithTempRepository.getRepositoryInfo.mockResolvedValue({
        name: 'test-repo',
        commitCount: 100,
        sizeCategory: 'small',
        cached: false,
        isShared: false,
      });
      mockWithTempRepository.withTempRepositoryStreaming.mockRejectedValue(
        streamError
      );

      // ACT
      const response = await request(app)
        .post('/api/commits/stream')
        .send({
          repoUrl: 'https://github.com/user/repo.git',
          batchSize: 25,
        })
        .buffer(true)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            callback(null, data);
          });
        });

      // ASSERT
      expect(response.status).toBe(200); // Streaming starts with 200, then handles error in stream
      expect(
        mockWithTempRepository.withTempRepositoryStreaming
      ).toHaveBeenCalled();
      // Check that error is included in the streaming response
      expect(response.body).toContain('"type":"error"');
      expect(response.body).toContain('Streaming failed');
    });

    test('should validate streaming request parameters', async () => {
      // ACT - Invalid URL
      const response1 = await request(app).post('/api/commits/stream').send({
        repoUrl: 'invalid-url',
        batchSize: 50,
      });

      // ASSERT
      expect(response1.status).toBe(400);
      expect(response1.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: expect.stringContaining('Invalid repository URL'),
          }),
        ])
      );

      // ACT - Invalid batch size
      const response2 = await request(app).post('/api/commits/stream').send({
        repoUrl: 'https://github.com/user/repo.git',
        batchSize: 15000, // Too large
      });

      // ASSERT
      expect(response2.status).toBe(400);
      expect(response2.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: expect.stringContaining('between 1 and 10000'),
          }),
        ])
      );

      // ACT - Invalid resume SHA
      const response3 = await request(app).post('/api/commits/stream').send({
        repoUrl: 'https://github.com/user/repo.git',
        resumeFromSha: 'invalid-sha', // Too short
      });

      // ASSERT
      expect(response3.status).toBe(400);
      expect(response3.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: expect.stringContaining('40-character'),
          }),
        ])
      );
    });
  });

  describe('Resume State Endpoints', () => {
    test('should get resume state when it exists', async () => {
      // ARRANGE
      const mockResumeState = {
        lastProcessedSha: 'abc123def456',
        processedCount: 50,
        totalCommits: 200,
        timestamp: new Date().toISOString(),
      };
      mockGitService.getStreamingResumeState.mockResolvedValue(mockResumeState);

      // ACT
      const response = await request(app).get(
        '/api/commits/resume/user%2Frepo'
      );

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        hasResumeState: true,
        resumeState: mockResumeState,
      });
      expect(mockGitService.getStreamingResumeState).toHaveBeenCalledWith(
        'user/repo'
      );
    });

    test('should handle no resume state found', async () => {
      // ARRANGE
      mockGitService.getStreamingResumeState.mockResolvedValue(null);

      // ACT
      const response = await request(app).get(
        '/api/commits/resume/user%2Frepo'
      );

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        hasResumeState: false,
        resumeState: null,
      });
    });

    test('should handle resume state retrieval errors', async () => {
      // ARRANGE
      const error = new Error('Failed to get resume state');
      mockGitService.getStreamingResumeState.mockRejectedValue(error);

      // ACT & ASSERT - Error is passed to next() middleware
      await request(app).get('/api/commits/resume/user%2Frepo');

      expect(mockGitService.getStreamingResumeState).toHaveBeenCalledWith(
        'user/repo'
      );
    });

    test('should clear resume state successfully', async () => {
      // ARRANGE
      mockGitService.clearStreamingResumeState.mockResolvedValue(undefined);

      // ACT
      const response = await request(app)
        .post('/api/commits/resume/clear')
        .send({ repoPath: 'user/repo' });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Resume state cleared successfully',
      });
      expect(mockGitService.clearStreamingResumeState).toHaveBeenCalledWith(
        'user/repo'
      );
    });

    test('should handle resume state clearing errors', async () => {
      // ARRANGE
      const error = new Error('Failed to clear resume state');
      mockGitService.clearStreamingResumeState.mockRejectedValue(error);

      // ACT
      const response = await request(app)
        .post('/api/commits/resume/clear')
        .send({ repoPath: 'user/repo' });

      // ASSERT
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: 'Failed to clear resume state',
      });
    });

    test('should validate resume clear request parameters', async () => {
      // ACT
      const response = await request(app)
        .post('/api/commits/resume/clear')
        .send({}); // Missing repoPath

      // ASSERT
      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: expect.stringContaining('required'),
          }),
        ])
      );
    });
  });
});
