import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Application } from 'express';
import { CommitHeatmapData } from '@gitray/shared-types';
import commitRoutes from '../../src/routes/commitRoutes';
import { gitService } from '../../src/services/gitService';
import redis from '../../src/services/cache';
import errorHandler from '../../src/middlewares/errorHandler';
import { runCleanupQueue } from '../../src/utils/cleanupScheduler';

// Use the global mockLogger from setup
const mockRequestLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  http: vi.fn(),
  verbose: vi.fn(),
  silly: vi.fn(),
};

// Mock logger with better handling
vi.mock('../../src/services/logger', () => ({
  default: global.mockLogger,
  getLogger: () => global.mockLogger,
  createRequestLogger: vi.fn(() => mockRequestLogger),
}));

// Mock config
vi.mock('../../src/config', () => ({
  config: {
    repositoryCache: { enabled: true },
    operationCoordination: { enabled: true },
  },
}));

// Mock metrics
vi.mock('../../src/services/metrics', () => ({
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
}));

// Mock the repository cache
vi.mock('../../src/services/repositoryCache', () => ({
  getCachedCommits: vi.fn(),
  getCachedAggregatedData: vi.fn(),
  getRepositoryCacheStats: vi.fn(),
  repositoryCache: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

// Mock withTempRepository utilities
vi.mock('../../src/utils/withTempRepository', () => ({
  withTempRepositoryStreaming: vi.fn(),
  getRepositoryInfo: vi.fn(),
  invalidateRepositoryCache: vi.fn(),
  getCoordinationMetrics: vi.fn(),
  getRepositoryStatus: vi.fn(),
}));

// Mock gitService methods used in the route
vi.mock('../../src/services/gitService', () => ({
  gitService: {
    cloneRepository: vi.fn(),
    getCommits: vi.fn(),
    getCommitCount: vi.fn(),
    shouldUseStreaming: vi.fn(),
    getCommitsStream: vi.fn(),
    aggregateCommitsByTime: vi.fn(),
    cleanupRepository: vi.fn(),
    clearStreamingResumeState: vi.fn(),
    getStreamingResumeState: vi.fn(),
  },
}));

vi.mock('../../src/services/cache', () => ({
  __esModule: true,
  default: { get: vi.fn(), set: vi.fn() },
}));

// Mock cleanup scheduler
vi.mock('../../src/utils/cleanupScheduler', () => ({
  runCleanupQueue: vi.fn(),
}));

import {
  getCachedAggregatedData,
  getCachedCommits,
} from '../../src/services/repositoryCache';
import * as withTempRepository from '../../src/utils/withTempRepository';
import * as repositoryCacheModule from '../../src/services/repositoryCache';

const mockClone = gitService.cloneRepository as ReturnType<typeof vi.fn>;
const mockGetCommits = gitService.getCommits as ReturnType<typeof vi.fn>;
const mockShouldUseStreaming = gitService.shouldUseStreaming as ReturnType<
  typeof vi.fn
>;
const mockAggregate = gitService.aggregateCommitsByTime as ReturnType<
  typeof vi.fn
>;
const mockCleanup = gitService.cleanupRepository as ReturnType<typeof vi.fn>;
const mockRedisGet = redis.get as ReturnType<typeof vi.fn>;
const mockRedisSet = redis.set as ReturnType<typeof vi.fn>;

// Mocks for new services
const mockGetCachedAggregatedData = getCachedAggregatedData as ReturnType<
  typeof vi.fn
>;
const mockGetCachedCommits = getCachedCommits as ReturnType<typeof vi.fn>;
const mockGetRepositoryInfo =
  withTempRepository.getRepositoryInfo as ReturnType<typeof vi.fn>;

describe('commitRoutes /heatmap', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use('/api/commits', commitRoutes);
    app.use(errorHandler);
    // Reset cache stats for each test
    vi.spyOn(repositoryCacheModule, 'getRepositoryCacheStats').mockReturnValue({
      hitRatios: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        overall: 0,
      },
      entries: { rawCommits: 0, filteredCommits: 0, aggregatedData: 0 },
      memoryUsage: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        total: 0,
      },
      efficiency: {
        duplicateClonesPrevented: 0,
        totalCacheOperations: 0,
        averageHitTime: 0,
        averageMissTime: 0,
      },
    });
  });

  test('returns heatmap data for a valid request', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const heatmap: CommitHeatmapData = {
      timePeriod: 'day',
      data: [],
      metadata: { maxCommitCount: 0, totalCommits: 0 },
    };

    // Mock the new cache function
    mockGetCachedAggregatedData.mockResolvedValue(heatmap);
    mockGetRepositoryInfo.mockResolvedValue({
      name: 'repo',
      url: repoUrl,
      branch: 'main',
      lastCommit: {
        hash: 'abc123',
        message: 'Test commit',
        timestamp: '2023-01-01T00:00:00Z',
      },
    });

    // Act
    const res = await request(app)
      .get('/api/commits/heatmap')
      .query({ repoUrl });

    // Assert
    if (res.status !== 200) {
      console.log('First test - Response status:', res.status);
      console.log('First test - Response body:', res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ...heatmap,
      metadata: expect.objectContaining({
        maxCommitCount: 0,
        totalCommits: 0,
      }),
    });
    expect(mockGetCachedAggregatedData).toHaveBeenCalledWith(repoUrl, {
      author: undefined,
      authors: undefined,
      fromDate: undefined,
      toDate: undefined,
    });
    expect(mockGetRepositoryInfo).toHaveBeenCalledWith(repoUrl);
  });

  test('returns cached heatmap data when available', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const heatmap: CommitHeatmapData = {
      timePeriod: 'day',
      data: [],
      metadata: { maxCommitCount: 0, totalCommits: 0 },
    };

    // Mock cached data available
    mockGetCachedAggregatedData.mockResolvedValue(heatmap);
    mockGetRepositoryInfo.mockResolvedValue({
      name: 'repo',
      url: repoUrl,
      branch: 'main',
      lastCommit: {
        hash: 'abc123',
        message: 'Test commit',
        timestamp: '2023-01-01T00:00:00Z',
      },
    });
    vi.spyOn(repositoryCacheModule, 'getRepositoryCacheStats').mockReturnValue({
      hitRatios: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        overall: 1,
      },
      entries: { rawCommits: 0, filteredCommits: 0, aggregatedData: 0 },
      memoryUsage: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        total: 0,
      },
      efficiency: {
        duplicateClonesPrevented: 0,
        totalCacheOperations: 0,
        averageHitTime: 0,
        averageMissTime: 0,
      },
    });

    // Act
    const res = await request(app)
      .get('/api/commits/heatmap')
      .query({ repoUrl });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ...heatmap,
      metadata: expect.objectContaining({
        maxCommitCount: 0,
        totalCommits: 0,
      }),
    });
    expect(mockGetCachedAggregatedData).toHaveBeenCalledWith(repoUrl, {
      author: undefined,
      authors: undefined,
      fromDate: undefined,
      toDate: undefined,
    });
  });

  test('handles heatmap with filters', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const author = 'testuser';
    const fromDate = '2023-01-01T00:00:00Z';
    const toDate = '2023-12-31T23:59:59Z';
    const heatmap: CommitHeatmapData = {
      timePeriod: 'day',
      data: [],
      metadata: { maxCommitCount: 0, totalCommits: 0 },
    };

    mockGetCachedAggregatedData.mockResolvedValue(heatmap);
    mockGetRepositoryInfo.mockResolvedValue({
      name: 'repo',
      url: repoUrl,
      branch: 'main',
      lastCommit: {
        hash: 'abc123',
        message: 'Test commit',
        timestamp: '2023-01-01T00:00:00Z',
      },
    });

    // Act
    const res = await request(app)
      .get('/api/commits/heatmap')
      .query({ repoUrl, author, fromDate, toDate });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ...heatmap,
      metadata: expect.objectContaining({
        maxCommitCount: 0,
        totalCommits: 0,
      }),
    });
    expect(mockGetCachedAggregatedData).toHaveBeenCalledWith(repoUrl, {
      author,
      authors: undefined,
      fromDate,
      toDate,
    });
  });

  test('handles multiple authors in heatmap', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const tempDir = '/tmp/repo';
    const authors = 'user1,user2,user3';
    const heatmap = {
      timePeriod: 'day',
      data: [],
      metadata: { maxCommitCount: 0, totalCommits: 0 },
    };
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockClone.mockResolvedValue(tempDir);
    mockGetCommits.mockResolvedValue([]);
    mockAggregate.mockResolvedValue(heatmap);
    mockCleanup.mockResolvedValue(undefined);
    // Set cache stats to MISS for this test
    vi.spyOn(repositoryCacheModule, 'getRepositoryCacheStats').mockReturnValue({
      hitRatios: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        overall: 0,
      },
      entries: { rawCommits: 0, filteredCommits: 0, aggregatedData: 0 },
      memoryUsage: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        total: 0,
      },
      efficiency: {
        duplicateClonesPrevented: 0,
        totalCacheOperations: 0,
        averageHitTime: 0,
        averageMissTime: 0,
      },
    });
    // Explicitly mock getCachedAggregatedData to call through to aggregate with correct args
    mockGetCachedAggregatedData.mockImplementation(
      async (repoUrlArg, filtersArg) => {
        await mockClone(repoUrlArg);
        const commits = await mockGetCommits(tempDir);
        return await mockAggregate(commits, filtersArg);
      }
    );
    // Act
    const res = await request(app)
      .get('/api/commits/heatmap')
      .query({ repoUrl, authors });
    // Assert
    expect(res.status).toBe(200);
    expect(mockAggregate).toHaveBeenCalledWith([], {
      author: undefined,
      authors: ['user1', 'user2', 'user3'],
      fromDate: undefined,
      toDate: undefined,
    });
  });

  test('returns 400 when repoUrl is missing', async () => {
    // Act
    const res = await request(app).get('/api/commits/heatmap');

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockClone).not.toHaveBeenCalled();
  });

  test('handles service errors and cleans up', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const tempDir = '/tmp/repo';
    mockRedisGet.mockResolvedValue(null);
    mockClone.mockResolvedValue(tempDir);
    mockShouldUseStreaming.mockResolvedValue(false); // Mock streaming decision
    mockGetCommits.mockRejectedValue(new Error('fail'));
    mockCleanup.mockResolvedValue(undefined);
    // Set cache stats to MISS for this test
    vi.spyOn(repositoryCacheModule, 'getRepositoryCacheStats').mockReturnValue({
      hitRatios: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        overall: 0,
      },
      entries: { rawCommits: 0, filteredCommits: 0, aggregatedData: 0 },
      memoryUsage: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        total: 0,
      },
      efficiency: {
        duplicateClonesPrevented: 0,
        totalCacheOperations: 0,
        averageHitTime: 0,
        averageMissTime: 0,
      },
    });
    // Explicitly mock getCachedAggregatedData to throw, with correct args
    mockGetCachedAggregatedData.mockImplementation(async (repoUrlArg) => {
      await mockClone(repoUrlArg);
      try {
        await mockGetCommits(tempDir); // will throw
      } finally {
        await mockCleanup(tempDir);
      }
    });
    // Act
    const res = await request(app)
      .get('/api/commits/heatmap')
      .query({ repoUrl });
    // Assert
    expect(res.status).toBe(500);
    expect(mockClone).toHaveBeenCalledWith(repoUrl);
    expect(mockGetCommits).toHaveBeenCalledWith(tempDir);
    await runCleanupQueue();
    expect(mockCleanup).toHaveBeenCalledWith(tempDir);
  });
});

describe('commitRoutes / list commits', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use('/api/commits', commitRoutes);
    app.use(errorHandler);
    // Reset cache stats for each test
    vi.spyOn(repositoryCacheModule, 'getRepositoryCacheStats').mockReturnValue({
      hitRatios: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        overall: 0,
      },
      entries: { rawCommits: 0, filteredCommits: 0, aggregatedData: 0 },
      memoryUsage: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        total: 0,
      },
      efficiency: {
        duplicateClonesPrevented: 0,
        totalCacheOperations: 0,
        averageHitTime: 0,
        averageMissTime: 0,
      },
    });
  });

  test('returns paginated commits', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const tempDir = '/tmp/repo';
    const commits = [
      {
        sha: 'a',
        message: 'msg',
        date: '2020-01-01T00:00:00Z',
        authorName: 'User',
        authorEmail: 'u@example.com',
      },
    ];
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockClone.mockResolvedValue(tempDir);
    mockShouldUseStreaming.mockResolvedValue(false); // Mock streaming decision
    mockGetCachedCommits.mockImplementation(async (_repoUrl, opts) => {
      await mockClone(_repoUrl);
      const result = await mockGetCommits(tempDir, opts);
      await mockCleanup(tempDir);
      return result;
    });
    mockGetCommits.mockResolvedValue(commits);
    mockCleanup.mockResolvedValue(undefined);
    // Set cache stats to MISS for this test
    vi.spyOn(repositoryCacheModule, 'getRepositoryCacheStats').mockReturnValue({
      hitRatios: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        overall: 0,
      },
      entries: { rawCommits: 0, filteredCommits: 0, aggregatedData: 0 },
      memoryUsage: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        total: 0,
      },
      efficiency: {
        duplicateClonesPrevented: 0,
        totalCacheOperations: 0,
        averageHitTime: 0,
        averageMissTime: 0,
      },
    });
    // Act
    const res = await request(app)
      .get('/api/commits')
      .query({ repoUrl, page: 2, limit: 1 });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      commits,
      page: 2,
      limit: 1,
      streamingUsed: false,
      totalCommits: 1,
      metadata: expect.any(Object),
    });
    expect(res.headers['x-cache-status']).toBe('MISS');
    await runCleanupQueue();
    expect(mockCleanup).toHaveBeenCalledWith(tempDir);
  });

  test('returns cached commits when available', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const commits = [
      {
        sha: 'cached',
        message: 'cached msg',
        date: '2020-01-01T00:00:00Z',
        authorName: 'User',
        authorEmail: 'u@example.com',
      },
    ];
    mockRedisGet.mockResolvedValue(JSON.stringify(commits));
    // Set cache stats to HIT for this test
    vi.spyOn(repositoryCacheModule, 'getRepositoryCacheStats').mockReturnValue({
      hitRatios: {
        rawCommits: 1,
        filteredCommits: 1,
        aggregatedData: 1,
        overall: 1,
      },
      entries: { rawCommits: 1, filteredCommits: 1, aggregatedData: 1 },
      memoryUsage: {
        rawCommits: 1,
        filteredCommits: 1,
        aggregatedData: 1,
        total: 3,
      },
      efficiency: {
        duplicateClonesPrevented: 1,
        totalCacheOperations: 1,
        averageHitTime: 1,
        averageMissTime: 0,
      },
    });
    mockGetCachedCommits.mockImplementation(async () => commits);
    // Act
    const res = await request(app).get('/api/commits').query({ repoUrl });
    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      commits,
      page: 1,
      limit: 100,
      streamingUsed: false,
      totalCommits: 1,
      metadata: expect.any(Object),
    });
    expect(res.headers['x-cache-status']).toBe('HIT');
    expect(mockClone).not.toHaveBeenCalled();
    // Should not call underlying service for cache hit
    expect(mockGetCachedCommits).toHaveBeenCalledTimes(1);
  });

  test('uses default pagination values', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const tempDir = '/tmp/repo';
    const commits: any[] = [];
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockClone.mockResolvedValue(tempDir);
    mockGetCachedCommits.mockResolvedValue(commits);
    mockCleanup.mockResolvedValue(undefined);

    // Act
    const res = await request(app).get('/api/commits').query({ repoUrl });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      commits,
      page: 1,
      limit: 100,
      streamingUsed: false,
      totalCommits: 0,
      metadata: expect.any(Object),
    });
  });

  test('handles service errors during commits fetch', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const tempDir = '/tmp/repo';
    mockRedisGet.mockResolvedValue(null);
    mockClone.mockResolvedValue(tempDir);
    mockGetCachedCommits.mockImplementation(async (_repoUrl, optsArg) => {
      await mockClone(_repoUrl);
      try {
        await mockGetCommits(tempDir, optsArg); // will throw
      } finally {
        await mockCleanup(tempDir);
      }
      throw new Error('Git error');
    });
    mockGetCommits.mockImplementation(() => {
      throw new Error('Git error');
    });
    mockCleanup.mockResolvedValue(undefined);
    // Set cache stats to MISS for this test
    vi.spyOn(repositoryCacheModule, 'getRepositoryCacheStats').mockReturnValue({
      hitRatios: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        overall: 0,
      },
      entries: { rawCommits: 0, filteredCommits: 0, aggregatedData: 0 },
      memoryUsage: {
        rawCommits: 0,
        filteredCommits: 0,
        aggregatedData: 0,
        total: 0,
      },
      efficiency: {
        duplicateClonesPrevented: 0,
        totalCacheOperations: 0,
        averageHitTime: 0,
        averageMissTime: 0,
      },
    });
    // Act
    const res = await request(app).get('/api/commits').query({ repoUrl });
    // Assert
    expect(res.status).toBe(500);
    expect(mockClone).toHaveBeenCalledWith(repoUrl);
    expect(mockGetCommits).toHaveBeenCalledWith(tempDir, {
      skip: 0,
      limit: 100,
    });
    await runCleanupQueue();
    expect(mockCleanup).toHaveBeenCalledWith(tempDir);
  });

  test('returns 400 for invalid page parameter', async () => {
    const res = await request(app)
      .get('/api/commits')
      .query({ repoUrl: 'https://github.com/user/repo.git', page: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 for invalid limit parameter', async () => {
    const res = await request(app)
      .get('/api/commits')
      .query({ repoUrl: 'https://github.com/user/repo.git', limit: 101 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 for missing repoUrl', async () => {
    const res = await request(app).get('/api/commits');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('commitRoutes validation', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use('/api/commits', commitRoutes);
    app.use(errorHandler);
  });

  describe('repoUrl validation', () => {
    test('rejects non-git URLs', async () => {
      const res = await request(app)
        .get('/api/commits/heatmap')
        .query({ repoUrl: 'https://example.com/not-a-repo' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('rejects localhost URLs in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .get('/api/commits/heatmap')
        .query({ repoUrl: 'https://localhost/repo.git' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');

      process.env.NODE_ENV = originalEnv;
    });

    test('rejects private network URLs in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .get('/api/commits/heatmap')
        .query({ repoUrl: 'https://192.168.1.1/repo.git' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');

      process.env.NODE_ENV = originalEnv;
    });

    test('rejects invalid URL format', async () => {
      const res = await request(app)
        .get('/api/commits/heatmap')
        .query({ repoUrl: 'not-a-url' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('date validation', () => {
    test('rejects future fromDate', async () => {
      const futureDate = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString();

      const res = await request(app).get('/api/commits/heatmap').query({
        repoUrl: 'https://github.com/user/repo.git',
        fromDate: futureDate,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('rejects future toDate', async () => {
      const futureDate = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString();

      const res = await request(app).get('/api/commits/heatmap').query({
        repoUrl: 'https://github.com/user/repo.git',
        toDate: futureDate,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('rejects toDate before fromDate', async () => {
      const fromDate = '2023-01-02T00:00:00Z';
      const toDate = '2023-01-01T00:00:00Z';

      const res = await request(app).get('/api/commits/heatmap').query({
        repoUrl: 'https://github.com/user/repo.git',
        fromDate,
        toDate,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('rejects invalid ISO date format', async () => {
      const res = await request(app).get('/api/commits/heatmap').query({
        repoUrl: 'https://github.com/user/repo.git',
        fromDate: 'invalid-date',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('author validation', () => {
    test('rejects empty author', async () => {
      const res = await request(app).get('/api/commits/heatmap').query({
        repoUrl: 'https://github.com/user/repo.git',
        author: '',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('rejects too long author name', async () => {
      const longAuthor = 'a'.repeat(101);

      const res = await request(app).get('/api/commits/heatmap').query({
        repoUrl: 'https://github.com/user/repo.git',
        author: longAuthor,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('rejects too many authors in comma-separated list', async () => {
      const manyAuthors = Array.from(
        { length: 11 },
        (_, i) => `author${i}`
      ).join(',');

      const res = await request(app).get('/api/commits/heatmap').query({
        repoUrl: 'https://github.com/user/repo.git',
        authors: manyAuthors,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('rejects authors list with empty values', async () => {
      const res = await request(app).get('/api/commits/heatmap').query({
        repoUrl: 'https://github.com/user/repo.git',
        authors: 'user1,,user3',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('pagination validation', () => {
    test('rejects page over 1000', async () => {
      const res = await request(app).get('/api/commits').query({
        repoUrl: 'https://github.com/user/repo.git',
        page: 1001,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('rejects negative page', async () => {
      const res = await request(app).get('/api/commits').query({
        repoUrl: 'https://github.com/user/repo.git',
        page: -1,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('rejects limit over 100', async () => {
      const res = await request(app).get('/api/commits').query({
        repoUrl: 'https://github.com/user/repo.git',
        limit: 101,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('rejects negative limit', async () => {
      const res = await request(app).get('/api/commits').query({
        repoUrl: 'https://github.com/user/repo.git',
        limit: 0,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });
});
