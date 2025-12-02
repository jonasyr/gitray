import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import express, { Application } from 'express';

// Mock all external dependencies BEFORE imports
const mockRepositoryCache = {
  getCachedCommits: vi.fn(),
  getCachedAggregatedData: vi.fn(),
  getCachedContributors: vi.fn(),
  getCachedChurnData: vi.fn(),
  getCachedSummary: vi.fn(),
};

const mockMetrics = {
  recordFeatureUsage: vi.fn(),
  recordEnhancedCacheOperation: vi.fn(),
  getUserType: vi.fn(),
  getRepositorySizeCategory: vi.fn(),
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

// Mock modules
vi.mock('../../../src/services/repositoryCache', () => mockRepositoryCache);

vi.mock('../../../src/services/metrics', () => mockMetrics);

vi.mock('../../../src/services/logger', () => ({
  getLogger: () => mockLogger,
  createRequestLogger: vi.fn(() => mockLogger),
}));

vi.mock('../../../src/middlewares/validation', () => ({
  isSecureGitUrl: vi.fn(() => Promise.resolve(true)),
  handleValidationErrorsWithResponse: vi.fn((req: any, res: any, next: any) =>
    next()
  ),
  repoUrlValidation: vi.fn(() => []),
  paginationValidation: vi.fn(() => []),
  dateValidation: vi.fn(() => []),
  authorValidation: vi.fn(() => []),
  churnValidation: vi.fn(() => []),
}));

// Mock utility modules
vi.mock('../../../src/utils/routeHelpers', () => ({
  buildCommitFilters: vi.fn((query) => {
    const filters: any = {};
    if (query.author) filters.author = query.author;
    if (query.authors) filters.authors = query.authors;
    if (query.fromDate) filters.fromDate = query.fromDate;
    if (query.toDate) filters.toDate = query.toDate;
    return filters;
  }),
  buildChurnFilters: vi.fn((query) => {
    const filters: any = {};
    if (query.minChanges !== undefined)
      filters.minChanges = parseInt(query.minChanges);
    if (query.extensions) filters.extensions = query.extensions;
    if (query.since) filters.since = query.since;
    if (query.until) filters.until = query.until;
    return filters;
  }),
  extractPaginationParams: vi.fn((query) => ({
    page: parseInt(query.page as string) || 1,
    limit: parseInt(query.limit as string) || 100,
    skip:
      ((parseInt(query.page as string) || 1) - 1) *
      (parseInt(query.limit as string) || 100),
  })),
  extractFilterParams: vi.fn((query) => ({
    author: query.author,
    authors: query.authors,
    fromDate: query.fromDate,
    toDate: query.toDate,
  })),
  setupRouteRequest: vi.fn((req) => ({
    logger: mockLogger,
    repoUrl: req.query.repoUrl as string,
    userType: 'anonymous',
  })),
  recordRouteSuccess: vi.fn(),
  recordRouteError: vi.fn(),
}));

vi.mock('../../../src/utils/repositoryRouteFactory', () => ({
  createCachedRouteHandler: vi.fn((featureName, processor, buildMetrics) => [
    async (req: any, res: any, next: any) => {
      try {
        const logger = mockLogger;
        const repoUrl = req.query.repoUrl as string;
        const userType = 'anonymous';

        // Validate repoUrl is present (simple validation for testing)
        if (!repoUrl) {
          return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            errors: [
              { msg: 'repoUrl query parameter is required', param: 'repoUrl' },
            ],
          });
        }

        const result = await processor({ req, logger, repoUrl, userType });
        const metrics = buildMetrics ? buildMetrics(result) : {};

        mockMetrics.recordFeatureUsage(featureName, userType, true, 'api_call');
        res.status(200).json(result);
      } catch (error: any) {
        mockMetrics.recordFeatureUsage(
          featureName,
          'anonymous',
          false,
          'api_call'
        );
        next(error);
      }
    },
  ]),
  buildRepoValidationChain: vi.fn(() => []),
}));

vi.mock('@gitray/shared-types', () => {
  class ValidationError extends Error {
    constructor(
      message: string,
      public readonly errors?: any[]
    ) {
      super(message);
      this.name = 'ValidationError';
    }
  }

  return {
    __esModule: true,
    ERROR_MESSAGES: {
      INVALID_REPO_URL: 'Invalid repository URL',
    },
    HTTP_STATUS: {
      OK: 200,
      BAD_REQUEST: 400,
      INTERNAL_SERVER_ERROR: 500,
    },
    ValidationError,
    CommitFilterOptions: {},
    ChurnFilterOptions: {},
    GIT_SERVICE: {
      MAX_CONCURRENT_PROCESSES: 3,
      CLONE_DEPTH: 50,
      TIMEOUT_MS: 30000,
    },
  };
});

describe('RepositoryRoutes Unit Tests (Refactored with Unified Cache)', () => {
  let app: Application;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up default mock returns
    mockMetrics.getUserType.mockReturnValue('anonymous');
    mockMetrics.getRepositorySizeCategory.mockReturnValue('medium');

    // Set up Express app
    app = express();
    app.use(express.json());

    // Import and mount the router after mocks are configured
    const { default: repositoryRoutes } = await import(
      '../../../src/routes/repositoryRoutes'
    );
    app.use('/api/repositories', repositoryRoutes);

    // Add error handler
    app.use((err: any, req: any, res: any, next: any) => {
      if (!res.headersSent) {
        res.status(err.statusCode || 500).json({
          error: err.message || 'Internal server error',
          code: err.code || 'INTERNAL_ERROR',
        });
      }
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('GET /commits - Repository Commits with Unified Cache', () => {
    test('should return commits using unified cache service', async () => {
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

      mockRepositoryCache.getCachedCommits.mockResolvedValue(mockCommits);

      // ACT
      const response = await request(app).get(
        '/api/repositories/commits?repoUrl=https://github.com/test/repo&page=1&limit=100'
      );

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('commits');
      expect(response.body.commits).toEqual(mockCommits);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(100);

      // Verify unified cache was called with correct parameters
      expect(mockRepositoryCache.getCachedCommits).toHaveBeenCalledWith(
        'https://github.com/test/repo',
        { skip: 0, limit: 100 }
      );

      // Verify metrics were recorded
      expect(mockMetrics.recordFeatureUsage).toHaveBeenCalledWith(
        'repository_commits',
        'anonymous',
        true,
        'api_call'
      );
    });

    test('should validate repoUrl is required', async () => {
      // ACT
      const response = await request(app).get('/api/repositories/commits');

      // ASSERT
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    test('should handle pagination parameters', async () => {
      mockRepositoryCache.getCachedCommits.mockResolvedValue([]);

      // ACT
      const response = await request(app).get(
        '/api/repositories/commits?repoUrl=https://github.com/test/repo&page=3&limit=50'
      );

      // ASSERT
      expect(response.status).toBe(200);
      expect(mockRepositoryCache.getCachedCommits).toHaveBeenCalledWith(
        'https://github.com/test/repo',
        { skip: 100, limit: 50 } // (page-1) * limit = (3-1) * 50 = 100
      );
    });
  });

  describe('GET /heatmap - Commit Heatmap with Unified Cache', () => {
    test('should return heatmap data using unified cache service', async () => {
      // ARRANGE
      const mockHeatmapData = {
        timePeriod: 'month',
        data: [
          { date: '2023-01', count: 10 },
          { date: '2023-02', count: 15 },
        ],
        metadata: { totalCommits: 25 },
      };

      mockRepositoryCache.getCachedAggregatedData.mockResolvedValue(
        mockHeatmapData
      );

      // ACT
      const response = await request(app).get(
        '/api/repositories/heatmap?repoUrl=https://github.com/test/repo'
      );

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('heatmapData');
      expect(response.body.heatmapData).toEqual(mockHeatmapData);

      // Verify unified cache was called
      expect(mockRepositoryCache.getCachedAggregatedData).toHaveBeenCalledWith(
        'https://github.com/test/repo',
        {
          author: undefined,
          authors: undefined,
          fromDate: undefined,
          toDate: undefined,
        }
      );
    });

    test('should apply filter options from query parameters', async () => {
      mockRepositoryCache.getCachedAggregatedData.mockResolvedValue({
        timePeriod: 'month',
        data: [],
        metadata: {},
      });

      // ACT
      const response = await request(app).get(
        '/api/repositories/heatmap?repoUrl=https://github.com/test/repo&author=john&fromDate=2023-01-01&toDate=2023-12-31'
      );

      // ASSERT
      expect(response.status).toBe(200);
      expect(mockRepositoryCache.getCachedAggregatedData).toHaveBeenCalledWith(
        'https://github.com/test/repo',
        {
          author: 'john',
          authors: undefined,
          fromDate: '2023-01-01',
          toDate: '2023-12-31',
        }
      );
    });
  });

  describe('GET /contributors - All Unique Contributors with Unified Cache', () => {
    test('should return all unique contributors using unified cache service', async () => {
      // ARRANGE
      const mockContributors = [
        { login: 'Alice' },
        { login: 'Bob' },
        { login: 'Charlie' },
      ];

      mockRepositoryCache.getCachedContributors.mockResolvedValue(
        mockContributors
      );

      // ACT
      const response = await request(app).get(
        '/api/repositories/contributors?repoUrl=https://github.com/test/repo'
      );

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('contributors');
      expect(response.body.contributors).toEqual(mockContributors);
      expect(response.body.contributors).toHaveLength(3);

      // Verify no statistics in response
      response.body.contributors.forEach((contributor: any) => {
        expect(contributor).toHaveProperty('login');
        expect(contributor).not.toHaveProperty('commitCount');
        expect(contributor).not.toHaveProperty('linesAdded');
        expect(contributor).not.toHaveProperty('linesDeleted');
        expect(contributor).not.toHaveProperty('contributionPercentage');
      });

      expect(mockRepositoryCache.getCachedContributors).toHaveBeenCalledWith(
        'https://github.com/test/repo',
        {
          author: undefined,
          authors: undefined,
          fromDate: undefined,
          toDate: undefined,
        }
      );
    });
  });

  describe('GET /churn - Code Churn Analysis with Unified Cache', () => {
    test('should return churn data using unified cache service', async () => {
      // ARRANGE
      const mockChurnData = {
        files: [
          {
            path: 'src/index.ts',
            changes: 25,
            risk: 'high',
          },
        ],
        metadata: {
          totalFiles: 1,
          totalChanges: 25,
          riskThresholds: { high: 30, medium: 15, low: 0 },
          dateRange: { from: '2023-01-01', to: '2023-12-31' },
          highRiskCount: 1,
          mediumRiskCount: 0,
          lowRiskCount: 0,
          analyzedAt: '2023-12-31T23:59:59Z',
        },
      };

      mockRepositoryCache.getCachedChurnData.mockResolvedValue(mockChurnData);

      // ACT
      const response = await request(app).get(
        '/api/repositories/churn?repoUrl=https://github.com/test/repo&minChanges=10'
      );

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('churnData');
      expect(response.body.churnData).toEqual(mockChurnData);

      expect(mockRepositoryCache.getCachedChurnData).toHaveBeenCalledWith(
        'https://github.com/test/repo',
        {
          since: undefined,
          until: undefined,
          minChanges: 10,
          extensions: undefined,
        }
      );
    });
  });

  describe('GET /summary - Repository Summary with Unified Cache', () => {
    test('should return repository summary using unified cache service', async () => {
      // ARRANGE
      const mockSummary = {
        repository: {
          name: 'test-repo',
          owner: 'test-owner',
          url: 'https://github.com/test/repo',
          platform: 'github',
        },
        created: {
          date: '2020-01-01T00:00:00Z',
          source: 'first-commit',
        },
        age: {
          years: 4,
          months: 0,
          formatted: '4.0y',
        },
        lastCommit: {
          date: '2023-12-31T23:59:59Z',
          relativeTime: '1 day ago',
          sha: 'xyz789',
          author: 'Test User',
        },
        stats: {
          totalCommits: 500,
          contributors: 10,
          status: 'active',
        },
        metadata: {
          cached: true,
          dataSource: 'cache',
        },
      };

      mockRepositoryCache.getCachedSummary.mockResolvedValue(mockSummary);

      // ACT
      const response = await request(app).get(
        '/api/repositories/summary?repoUrl=https://github.com/test/repo'
      );

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary).toEqual(mockSummary);

      expect(mockRepositoryCache.getCachedSummary).toHaveBeenCalledWith(
        'https://github.com/test/repo'
      );
    });
  });

  describe('GET /full-data - Combined Data with Unified Cache', () => {
    test('should return both commits and heatmap using parallel cache calls', async () => {
      // ARRANGE
      const mockCommits = [{ sha: 'abc123', message: 'Test' }];
      const mockHeatmapData = {
        timePeriod: 'month',
        data: [{ date: '2023-01', count: 10 }],
        metadata: {},
      };

      mockRepositoryCache.getCachedCommits.mockResolvedValue(mockCommits);
      mockRepositoryCache.getCachedAggregatedData.mockResolvedValue(
        mockHeatmapData
      );

      // ACT
      const response = await request(app).get(
        '/api/repositories/full-data?repoUrl=https://github.com/test/repo&page=1&limit=100'
      );

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('commits');
      expect(response.body).toHaveProperty('heatmapData');
      expect(response.body.commits).toEqual(mockCommits);
      expect(response.body.heatmapData).toEqual(mockHeatmapData);

      // Verify both cache services were called
      expect(mockRepositoryCache.getCachedCommits).toHaveBeenCalledTimes(1);
      expect(mockRepositoryCache.getCachedAggregatedData).toHaveBeenCalledTimes(
        1
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle cache service errors gracefully', async () => {
      // ARRANGE
      mockRepositoryCache.getCachedCommits.mockRejectedValue(
        new Error('Cache service error')
      );

      // ACT
      const response = await request(app).get(
        '/api/repositories/commits?repoUrl=https://github.com/test/repo'
      );

      // ASSERT
      expect(response.status).toBe(500);
      expect(mockMetrics.recordFeatureUsage).toHaveBeenCalledWith(
        'repository_commits',
        'anonymous',
        false,
        'api_call'
      );
    });
  });
});
