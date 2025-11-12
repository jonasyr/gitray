import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import express, { Application } from 'express';

// Mock all external dependencies BEFORE imports
const mockGitService = {
  getCommits: vi.fn(),
  aggregateCommitsByTime: vi.fn(),
  getTopContributors: vi.fn(),
  analyzeCodeChurn: vi.fn(),
};

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
};

const mockWithTempRepository = vi.fn();

const mockMetrics = {
  recordFeatureUsage: vi.fn(),
  recordEnhancedCacheOperation: vi.fn(),
  recordDataFreshness: vi.fn(),
  getUserType: vi.fn(),
  getRepositorySizeCategory: vi.fn(),
};

// Create middleware function that can be chained
const createValidationMiddleware = () => {
  const middleware = vi.fn((req: any, res: any, next: any) => next()) as any;
  middleware.isURL = vi.fn(() => middleware);
  middleware.withMessage = vi.fn(() => middleware);
  middleware.matches = vi.fn(() => middleware);
  middleware.optional = vi.fn(() => middleware);
  middleware.isObject = vi.fn(() => middleware);
  return middleware;
};

// Mock modules with proper middleware functions
vi.mock('../../../src/services/gitService', () => ({
  __esModule: true,
  gitService: mockGitService,
}));

vi.mock('../../../src/services/cache', () => ({
  __esModule: true,
  default: mockRedis,
}));

vi.mock('../../../src/utils/withTempRepository', () => ({
  __esModule: true,
  withTempRepository: mockWithTempRepository,
}));

vi.mock('../../../src/services/metrics', () => ({
  __esModule: true,
  ...mockMetrics,
}));

vi.mock('express-validator', () => ({
  __esModule: true,
  body: vi.fn(() => createValidationMiddleware()),
}));

vi.mock('../../../src/middlewares/validation', () => ({
  __esModule: true,
  handleValidationErrors: vi.fn((req: any, res: any, next: any) => next()),
}));

vi.mock('@gitray/shared-types', () => ({
  __esModule: true,
  ERROR_MESSAGES: {
    INVALID_REPO_URL: 'Invalid repository URL',
  },
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
  },
  TIME: {
    HOUR: 3600000,
  },
  CommitFilterOptions: {},
  ChurnFilterOptions: {},
}));

describe('RepositoryRoutes Unit Tests', () => {
  let app: Application;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up default mock returns
    mockMetrics.getUserType.mockReturnValue('anonymous');
    mockMetrics.getRepositorySizeCategory.mockReturnValue('medium');
    mockMetrics.recordFeatureUsage.mockResolvedValue(undefined);
    mockMetrics.recordEnhancedCacheOperation.mockResolvedValue(undefined);
    mockMetrics.recordDataFreshness.mockResolvedValue(undefined);

    // Set up Express app
    app = express();
    app.use(express.json());

    // Import and mount the router after mocks are configured
    const { default: repositoryRoutes } = await import(
      '../../../src/routes/repositoryRoutes'
    );
    app.use('/', repositoryRoutes);

    // Add error handler
    app.use((err: any, req: any, res: any) => {
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
      });
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('POST / - Get Repository Commits', () => {
    test('should return cached commits when cache hit occurs', async () => {
      // ARRANGE
      const mockCommits = [
        {
          sha: 'abc123',
          message: 'Test commit',
          date: '2023-01-01T00:00:00Z',
          authorName: 'Test User',
          authorEmail: 'test@example.com',
        },
      ];
      const repoUrl = 'https://github.com/user/repo.git';

      mockRedis.get.mockResolvedValue(JSON.stringify(mockCommits));

      // ACT
      const response = await request(app).post('/').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ commits: mockCommits });
      expect(mockRedis.get).toHaveBeenCalledWith(`commits:${repoUrl}`);
      expect(mockWithTempRepository).not.toHaveBeenCalled();
      expect(mockMetrics.recordEnhancedCacheOperation).toHaveBeenCalledWith(
        'commits',
        true,
        expect.any(Object),
        repoUrl,
        mockCommits.length
      );
      expect(mockMetrics.recordFeatureUsage).toHaveBeenCalledWith(
        'repository_commits',
        'anonymous',
        true,
        'api_call'
      );
    });

    test('should fetch and cache commits when cache miss occurs', async () => {
      // ARRANGE
      const mockCommits = [
        {
          sha: 'def456',
          message: 'New commit',
          date: '2023-01-02T00:00:00Z',
          authorName: 'Developer',
          authorEmail: 'dev@example.com',
        },
      ];
      const repoUrl = 'https://github.com/user/repo.git';

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockResolvedValue(mockCommits);
      mockRedis.set.mockResolvedValue('OK');

      // ACT
      const response = await request(app).post('/').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ commits: mockCommits });
      expect(mockWithTempRepository).toHaveBeenCalledWith(
        repoUrl,
        expect.any(Function)
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        `commits:${repoUrl}`,
        JSON.stringify(mockCommits),
        'EX',
        3600
      );
      expect(mockMetrics.recordEnhancedCacheOperation).toHaveBeenCalledWith(
        'commits',
        false,
        expect.any(Object),
        repoUrl,
        mockCommits.length
      );
    });

    test('should handle repository fetch errors and record failed feature usage', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      const fetchError = new Error('Repository not found');

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockRejectedValue(fetchError);

      // ACT
      const response = await request(app).post('/').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(500);
      expect(mockMetrics.recordFeatureUsage).toHaveBeenCalledWith(
        'repository_commits',
        'anonymous',
        false,
        'api_call'
      );
    });

    test('should handle different user types for metrics', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      mockMetrics.getUserType.mockReturnValue('premium');
      mockRedis.get.mockResolvedValue(JSON.stringify([]));

      // ACT
      await request(app).post('/').send({ repoUrl });

      // ASSERT
      expect(mockMetrics.recordFeatureUsage).toHaveBeenCalledWith(
        'repository_commits',
        'premium',
        true,
        'api_call'
      );
    });
  });

  describe('POST /heatmap - Get Heatmap Data', () => {
    test('should return cached heatmap data when cache hit occurs', async () => {
      // ARRANGE
      const mockHeatmapData = {
        timePeriod: 'day',
        data: [{ date: '2023-01-01', commits: 5 }],
        metadata: { maxCommitCount: 5, totalCommits: 5 },
      };
      const repoUrl = 'https://github.com/user/repo.git';
      const filterOptions = { author: 'testuser' };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockHeatmapData));

      // ACT
      const response = await request(app)
        .post('/heatmap')
        .send({ repoUrl, filterOptions });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ heatmapData: mockHeatmapData });
      expect(mockRedis.get).toHaveBeenCalledWith(
        `heatmap:${repoUrl}:${JSON.stringify(filterOptions)}`
      );
      expect(mockMetrics.recordFeatureUsage).toHaveBeenCalledWith(
        'heatmap_view',
        'anonymous',
        true,
        'api_call'
      );
    });

    test('should generate and cache heatmap data when cache miss occurs', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      const filterOptions = { fromDate: '2023-01-01' };
      const mockCommits = [{ sha: 'abc123', date: '2023-01-01T12:00:00Z' }];
      const mockHeatmapData = {
        timePeriod: 'day',
        data: [{ date: '2023-01-01', commits: 1 }],
        metadata: { maxCommitCount: 1, totalCommits: 1 },
      };

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockImplementation(async (url, callback) => {
        return await callback('/tmp/repo');
      });
      mockGitService.getCommits.mockResolvedValue(mockCommits);
      mockGitService.aggregateCommitsByTime.mockResolvedValue(mockHeatmapData);
      mockRedis.set.mockResolvedValue('OK');

      // ACT
      const response = await request(app)
        .post('/heatmap')
        .send({ repoUrl, filterOptions });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ heatmapData: mockHeatmapData });
      expect(mockGitService.aggregateCommitsByTime).toHaveBeenCalledWith(
        mockCommits,
        filterOptions
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        `heatmap:${repoUrl}:${JSON.stringify(filterOptions)}`,
        JSON.stringify(mockHeatmapData),
        'EX',
        3600
      );
    });

    test('should handle aggregation errors and record failed metrics', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      const aggregationError = new Error('Aggregation failed');

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockRejectedValue(aggregationError);

      // ACT
      const response = await request(app).post('/heatmap').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(500);
      expect(mockMetrics.recordFeatureUsage).toHaveBeenCalledWith(
        'heatmap_view',
        'anonymous',
        false,
        'api_call'
      );
    });

    test('should handle undefined filter options gracefully', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      const mockHeatmapData = { timePeriod: 'day', data: [], metadata: {} };

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockImplementation(async (url, callback) => {
        return await callback('/tmp/repo');
      });
      mockGitService.getCommits.mockResolvedValue([]);
      mockGitService.aggregateCommitsByTime.mockResolvedValue(mockHeatmapData);

      // ACT
      const response = await request(app).post('/heatmap').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      expect(mockGitService.aggregateCommitsByTime).toHaveBeenCalledWith(
        [],
        undefined
      );
    });
  });

  describe('POST /full-data - Get Combined Data', () => {
    test('should return cached data when both commits and heatmap are cached', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      const filterOptions = { author: 'testuser' };
      const mockCommits = [{ sha: 'abc123', message: 'Test' }];
      const mockHeatmapData = { timePeriod: 'day', data: [] };

      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(mockCommits))
        .mockResolvedValueOnce(JSON.stringify(mockHeatmapData));

      // ACT
      const response = await request(app)
        .post('/full-data')
        .send({ repoUrl, filterOptions });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        commits: mockCommits,
        heatmapData: mockHeatmapData,
      });
      expect(mockRedis.get).toHaveBeenCalledWith(`commits:${repoUrl}`);
      expect(mockRedis.get).toHaveBeenCalledWith(
        `heatmap:${repoUrl}:${JSON.stringify(filterOptions)}`
      );
      expect(mockWithTempRepository).not.toHaveBeenCalled();
      expect(mockMetrics.recordFeatureUsage).toHaveBeenCalledWith(
        'full_data_view',
        'anonymous',
        true,
        'api_call'
      );
    });

    test('should fetch and cache both data types when cache miss occurs', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      const filterOptions = { fromDate: '2023-01-01' };
      const mockCommits = [{ sha: 'def456', message: 'New commit' }];
      const mockHeatmapData = { timePeriod: 'day', data: [{ commits: 1 }] };

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockImplementation(async (url, callback) => {
        return await callback('/tmp/repo');
      });
      mockGitService.getCommits.mockResolvedValue(mockCommits);
      mockGitService.aggregateCommitsByTime.mockResolvedValue(mockHeatmapData);
      mockRedis.set.mockResolvedValue('OK');

      // ACT
      const response = await request(app)
        .post('/full-data')
        .send({ repoUrl, filterOptions });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        commits: mockCommits,
        heatmapData: mockHeatmapData,
      });
      expect(mockRedis.set).toHaveBeenCalledWith(
        `commits:${repoUrl}`,
        JSON.stringify(mockCommits),
        'EX',
        3600
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        `heatmap:${repoUrl}:${JSON.stringify(filterOptions)}`,
        JSON.stringify(mockHeatmapData),
        'EX',
        3600
      );
      expect(mockMetrics.recordEnhancedCacheOperation).toHaveBeenCalledTimes(2);
    });

    test('should handle partial cache hits correctly', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      const mockCommits = [{ sha: 'cached', message: 'From cache' }];

      // Only commits are cached, heatmap is not
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(mockCommits))
        .mockResolvedValueOnce(null);

      mockWithTempRepository.mockImplementation(async (url, callback) => {
        return await callback('/tmp/repo');
      });
      mockGitService.getCommits.mockResolvedValue(mockCommits);
      mockGitService.aggregateCommitsByTime.mockResolvedValue({
        timePeriod: 'day',
        data: [],
      });

      // ACT
      const response = await request(app).post('/full-data').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      expect(mockWithTempRepository).toHaveBeenCalled();
      expect(mockMetrics.recordEnhancedCacheOperation).toHaveBeenCalledWith(
        'commits',
        false,
        expect.any(Object),
        repoUrl,
        mockCommits.length
      );
    });

    test('should handle data processing errors and record failures', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      const processingError = new Error('Data processing failed');

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockRejectedValue(processingError);

      // ACT
      const response = await request(app).post('/full-data').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(500);
      expect(mockMetrics.recordFeatureUsage).toHaveBeenCalledWith(
        'full_data_view',
        'anonymous',
        false,
        'api_call'
      );
    });
  });

  describe('Cache Operations', () => {
    test('should handle cache get failures gracefully', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      const cacheError = new Error('Cache connection failed');

      mockRedis.get.mockRejectedValue(cacheError);
      mockWithTempRepository.mockResolvedValue([]);

      // ACT
      const response = await request(app).post('/').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      expect(mockWithTempRepository).toHaveBeenCalled();
    });

    test('should handle cache set failures without affecting response', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      const mockCommits = [{ sha: 'abc123' }];

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockResolvedValue(mockCommits);
      mockRedis.set.mockRejectedValue(new Error('Cache write failed'));

      // ACT
      const response = await request(app).post('/').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ commits: mockCommits });
    });

    test('should handle corrupted cache data gracefully', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';

      mockRedis.get.mockResolvedValue('invalid json data');
      mockWithTempRepository.mockResolvedValue([]);

      // ACT
      const response = await request(app).post('/').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      expect(mockWithTempRepository).toHaveBeenCalled();
    });
  });

  describe('Metrics Recording', () => {
    test('should record different repository size categories', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/large-repo.git';
      const largeCommitSet = Array(5000).fill({ sha: 'abc' });

      mockMetrics.getRepositorySizeCategory.mockReturnValue('large');
      mockRedis.get.mockResolvedValue(JSON.stringify(largeCommitSet));

      // ACT
      await request(app).post('/').send({ repoUrl });

      // ASSERT
      expect(mockMetrics.recordDataFreshness).toHaveBeenCalledWith(
        'commits',
        0,
        'hybrid',
        'large'
      );
    });

    test('should record authenticated user metrics correctly', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';

      mockMetrics.getUserType.mockReturnValue('authenticated');
      mockRedis.get.mockResolvedValue(JSON.stringify([]));

      // ACT
      await request(app).post('/heatmap').send({ repoUrl });

      // ASSERT
      expect(mockMetrics.recordFeatureUsage).toHaveBeenCalledWith(
        'heatmap_view',
        'authenticated',
        true,
        'api_call'
      );
    });

    test('should handle metrics recording failures silently', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';

      mockMetrics.recordFeatureUsage.mockRejectedValue(
        new Error('Metrics service down')
      );
      mockRedis.get.mockResolvedValue(JSON.stringify([]));

      // ACT
      const response = await request(app).post('/').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      // Metrics failure should not affect the main operation
    });
  });

  describe('Error Boundary Tests', () => {
    test('should handle unexpected errors in middleware chain', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';

      // Force an unexpected error in the middleware chain
      mockMetrics.getUserType.mockImplementation(() => {
        throw new Error('Unexpected middleware error');
      });

      // ACT
      const response = await request(app).post('/').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(500);
    });

    test('should handle empty response data gracefully', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockResolvedValue(undefined);

      // ACT
      const response = await request(app).post('/').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ commits: undefined });
    });
  });

  describe('POST /churn - Get Code Churn Analysis', () => {
    test('should return cached churn data when cache hit occurs', async () => {
      // ARRANGE
      const mockChurnData = {
        files: [
          {
            path: 'src/api/auth.ts',
            changes: 47,
            risk: 'high',
            extension: '.ts',
            firstChange: '2023-01-01T12:00:00Z',
            lastChange: '2023-12-31T12:00:00Z',
            authorCount: 5,
          },
          {
            path: 'src/components/Dashboard.tsx',
            changes: 38,
            risk: 'high',
            extension: '.tsx',
            firstChange: '2023-02-01T12:00:00Z',
            lastChange: '2023-12-15T12:00:00Z',
            authorCount: 3,
          },
        ],
        metadata: {
          totalFiles: 2,
          totalChanges: 85,
          riskThresholds: { high: 30, medium: 15, low: 0 },
          dateRange: { from: '2023-01-01', to: '2023-12-31' },
          highRiskCount: 2,
          mediumRiskCount: 0,
          lowRiskCount: 0,
          analyzedAt: '2024-01-01T00:00:00Z',
          processingTime: 150,
        },
      };
      const repoUrl = 'https://github.com/user/repo.git';

      mockRedis.get.mockResolvedValue(JSON.stringify(mockChurnData));

      // ACT
      const response = await request(app).post('/churn').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.churnData).toEqual({
        ...mockChurnData,
        metadata: { ...mockChurnData.metadata, fromCache: true },
      });
      expect(mockRedis.get).toHaveBeenCalledWith(`churn:${repoUrl}:{}`);
      expect(mockWithTempRepository).not.toHaveBeenCalled();
      expect(mockMetrics.recordEnhancedCacheOperation).toHaveBeenCalledWith(
        'churn',
        true,
        expect.any(Object),
        repoUrl,
        mockChurnData.files.length
      );
      expect(mockMetrics.recordFeatureUsage).toHaveBeenCalledWith(
        'code_churn_view',
        'anonymous',
        true,
        'api_call'
      );
    });

    test('should analyze and cache churn data when cache miss occurs', async () => {
      // ARRANGE
      const mockChurnData = {
        files: [
          {
            path: 'src/utils/helpers.ts',
            changes: 32,
            risk: 'high',
            extension: '.ts',
            firstChange: '2023-03-01T12:00:00Z',
            lastChange: '2023-11-20T12:00:00Z',
            authorCount: 8,
          },
        ],
        metadata: {
          totalFiles: 1,
          totalChanges: 32,
          riskThresholds: { high: 30, medium: 15, low: 0 },
          dateRange: { from: '2023-01-01', to: '2023-12-31' },
          highRiskCount: 1,
          mediumRiskCount: 0,
          lowRiskCount: 0,
          analyzedAt: '2024-01-01T00:00:00Z',
          processingTime: 200,
        },
      };
      const repoUrl = 'https://github.com/user/repo.git';

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockResolvedValue(mockChurnData);
      mockRedis.set.mockResolvedValue('OK');

      // ACT
      const response = await request(app).post('/churn').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ churnData: mockChurnData });
      expect(mockWithTempRepository).toHaveBeenCalledWith(
        repoUrl,
        expect.any(Function)
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        `churn:${repoUrl}:{}`,
        JSON.stringify(mockChurnData),
        'EX',
        3600
      );
      expect(mockMetrics.recordEnhancedCacheOperation).toHaveBeenCalledWith(
        'churn',
        false,
        expect.any(Object),
        repoUrl,
        mockChurnData.files.length
      );
    });

    test('should apply filter options to churn analysis', async () => {
      // ARRANGE
      const filterOptions = {
        since: '2023-01-01',
        until: '2023-12-31',
        extensions: ['ts', 'tsx'],
        minChanges: 10,
      };
      const mockChurnData = {
        files: [
          {
            path: 'src/index.ts',
            changes: 25,
            risk: 'medium',
            extension: '.ts',
          },
        ],
        metadata: {
          totalFiles: 1,
          totalChanges: 25,
          riskThresholds: { high: 30, medium: 15, low: 0 },
          dateRange: { from: '2023-01-01', to: '2023-12-31' },
          highRiskCount: 0,
          mediumRiskCount: 1,
          lowRiskCount: 0,
          analyzedAt: '2024-01-01T00:00:00Z',
          filterOptions,
        },
      };
      const repoUrl = 'https://github.com/user/repo.git';

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockImplementation(async (url, callback) => {
        return await callback('/tmp/repo');
      });
      mockGitService.analyzeCodeChurn.mockResolvedValue(mockChurnData);
      mockRedis.set.mockResolvedValue('OK');

      // ACT
      const response = await request(app)
        .post('/churn')
        .send({ repoUrl, filterOptions });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ churnData: mockChurnData });
      expect(mockGitService.analyzeCodeChurn).toHaveBeenCalledWith(
        '/tmp/repo',
        filterOptions
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        `churn:${repoUrl}:${JSON.stringify(filterOptions)}`,
        JSON.stringify(mockChurnData),
        'EX',
        3600
      );
    });

    test('should handle analysis errors and record failed feature usage', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      const analysisError = new Error('Churn analysis failed');

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockRejectedValue(analysisError);

      // ACT
      const response = await request(app).post('/churn').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(500);
      expect(mockMetrics.recordFeatureUsage).toHaveBeenCalledWith(
        'code_churn_view',
        'anonymous',
        false,
        'api_call'
      );
    });

    test('should handle different user types for churn metrics', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      mockMetrics.getUserType.mockReturnValue('premium');
      mockRedis.get.mockResolvedValue(
        JSON.stringify({ files: [], metadata: {} })
      );

      // ACT
      await request(app).post('/churn').send({ repoUrl });

      // ASSERT
      expect(mockMetrics.recordFeatureUsage).toHaveBeenCalledWith(
        'code_churn_view',
        'premium',
        true,
        'api_call'
      );
    });

    test('should handle cache failures gracefully and fetch from repository', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      const cacheError = new Error('Cache connection failed');
      const mockChurnData = { files: [], metadata: {} };

      mockRedis.get.mockRejectedValue(cacheError);
      mockWithTempRepository.mockResolvedValue(mockChurnData);

      // ACT
      const response = await request(app).post('/churn').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      expect(mockWithTempRepository).toHaveBeenCalled();
    });

    test('should handle cache set failures without affecting response', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/repo.git';
      const mockChurnData = {
        files: [{ path: 'test.ts', changes: 5, risk: 'low' }],
        metadata: { totalFiles: 1 },
      };

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockResolvedValue(mockChurnData);
      mockRedis.set.mockRejectedValue(new Error('Cache write failed'));

      // ACT
      const response = await request(app).post('/churn').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ churnData: mockChurnData });
    });

    test('should handle empty churn results', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/user/empty-repo.git';
      const emptyChurnData = {
        files: [],
        metadata: {
          totalFiles: 0,
          totalChanges: 0,
          riskThresholds: { high: 30, medium: 15, low: 0 },
          dateRange: { from: '2023-01-01', to: '2023-12-31' },
          highRiskCount: 0,
          mediumRiskCount: 0,
          lowRiskCount: 0,
          analyzedAt: '2024-01-01T00:00:00Z',
        },
      };

      mockRedis.get.mockResolvedValue(null);
      mockWithTempRepository.mockResolvedValue(emptyChurnData);

      // ACT
      const response = await request(app).post('/churn').send({ repoUrl });

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.churnData.files).toHaveLength(0);
      expect(response.body.churnData.metadata.totalFiles).toBe(0);
    });
  });
});
