import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

vi.mock('../../../src/services/gitService', () => ({
  gitService: {
    getCommitsStream: vi.fn(async function* noop() {}),
    getStreamingResumeState: vi.fn().mockResolvedValue(null),
    clearStreamingResumeState: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/services/repositoryCache', () => ({
  getCachedCommits: vi.fn(),
  getCachedAggregatedData: vi.fn(),
  getRepositoryCacheStats: vi.fn(),
  repositoryCache: {
    invalidateRepository: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/utils/withTempRepository', () => ({
  withTempRepositoryStreaming: vi.fn(),
  getRepositoryInfo: vi.fn(),
  invalidateRepositoryCache: vi.fn().mockResolvedValue(undefined),
  getCoordinationMetrics: vi.fn(),
  getRepositoryStatus: vi.fn(),
}));

vi.mock('../../../src/services/logger', () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../../src/services/fileAnalysisService', () => ({
  fileAnalysisService: {
    analyzeRepository: vi.fn().mockResolvedValue({
      metadata: { totalFiles: 0, streamingUsed: false },
      files: [],
    }),
  },
}));

type MockFn = ReturnType<typeof vi.fn>;

let router: express.Router;
let getRepositoryCacheStats: MockFn;
let repositoryCache: any;
let getCoordinationMetrics: MockFn;
let getRepositoryStatus: MockFn;
let invalidateRepositoryCache: MockFn;

describe('commitRoutes cache endpoints', () => {
  const app = express();
  app.use(express.json());

  beforeAll(async () => {
    router = (await import('../../../src/routes/commitRoutes')).default;
    const repositoryCacheModule = await import(
      '../../../src/services/repositoryCache'
    );
    getRepositoryCacheStats =
      repositoryCacheModule.getRepositoryCacheStats as unknown as MockFn;
    repositoryCache = repositoryCacheModule.repositoryCache;
    const tempRepositoryModule = await import(
      '../../../src/utils/withTempRepository'
    );
    getCoordinationMetrics =
      tempRepositoryModule.getCoordinationMetrics as unknown as MockFn;
    getRepositoryStatus =
      tempRepositoryModule.getRepositoryStatus as unknown as MockFn;
    invalidateRepositoryCache =
      tempRepositoryModule.invalidateRepositoryCache as unknown as MockFn;
    app.use('/commits', router);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns validation errors when repoUrl is missing', async () => {
    const response = await request(app).get('/commits');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns cache statistics with coordination details', async () => {
    getRepositoryCacheStats.mockReturnValue({
      entries: { rawCommits: 1, filteredCommits: 2, aggregatedData: 3 },
      memoryUsage: {
        rawCommits: 10,
        filteredCommits: 20,
        aggregatedData: 30,
        total: 60,
      },
      hitRatios: {
        rawCommits: 0.5,
        filteredCommits: 0.6,
        aggregatedData: 0.7,
        overall: 0.6,
      },
      efficiency: {
        duplicateClonesPrevented: 2,
        totalCacheOperations: 10,
        averageHitTime: 5,
        averageMissTime: 20,
      },
    });
    getCoordinationMetrics.mockReturnValue({ activeLocks: 1 });
    const now = new Date();
    getRepositoryStatus.mockReturnValue([
      {
        repoUrl: 'https://github.com/test/repo.git',
        lastAccessed: now,
        age: 60 * 1000,
      },
    ]);

    const response = await request(app).get('/commits/cache/stats');

    expect(response.status).toBe(200);
    expect(response.body.cache.hitRatios.overall).toBe(0.6);
    expect(response.body.repositories.cached).toBe(1);
    expect(response.body.repositories.details[0].repoUrl).toBe(
      'https://github.com/test/repo.git'
    );
  });

  it('invalidates repository cache across tiers', async () => {
    const repoUrl = 'https://github.com/test/repo.git';
    const response = await request(app)
      .post('/commits/cache/invalidate')
      .send({ repoUrl });

    expect(response.status).toBe(200);
    expect(invalidateRepositoryCache).toHaveBeenCalledWith(repoUrl);
    expect(repositoryCache.invalidateRepository).toHaveBeenCalledWith(repoUrl);
  });
});
