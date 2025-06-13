import { describe, test, expect } from 'vitest';
import request from 'supertest';
import express, { Application } from 'express';
import { CommitHeatmapData, Commit } from '@gitray/shared-types';
import commitRoutes from '../../src/routes/commitRoutes';
import { gitService } from '../../src/services/gitService';
import redis from '../../src/services/cache';
import errorHandler from '../../src/middlewares/errorHandler';
import { runCleanupQueue } from '../../src/utils/cleanupScheduler';

// any gitService methods used in the route
vi.mock('../../src/services/gitService', () => ({
  gitService: {
    cloneRepository: vi.fn(),
    getCommits: vi.fn(),
    aggregateCommitsByTime: vi.fn(),
    cleanupRepository: vi.fn(),
  },
}));
vi.mock('../../src/services/cache', () => ({
  __esModule: true,
  default: { get: vi.fn(), set: vi.fn() },
}));

const mockClone = gitService.cloneRepository as ReturnType<typeof vi.fn>;
const mockGetCommits = gitService.getCommits as ReturnType<typeof vi.fn>;
const mockAggregate = gitService.aggregateCommitsByTime as ReturnType<
  typeof vi.fn
>;
const mockCleanup = gitService.cleanupRepository as ReturnType<typeof vi.fn>;
const mockRedisGet = redis.get as ReturnType<typeof vi.fn>;
const mockRedisSet = redis.set as ReturnType<typeof vi.fn>;

describe('commitRoutes /heatmap', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use('/api/commits', commitRoutes);
    app.use(errorHandler);
  });

  test('returns heatmap data for a valid request', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const tempDir = '/tmp/repo';
    const heatmap: CommitHeatmapData = {
      timePeriod: 'day',
      data: [],
      metadata: { maxCommitCount: 0, totalCommits: 0 },
    };
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockClone.mockResolvedValue(tempDir);
    mockGetCommits.mockResolvedValue([]);
    mockShouldUseStreaming.mockResolvedValue(false); // Mock streaming decision
    mockAggregate.mockResolvedValue(heatmap);
    mockCleanup.mockResolvedValue(undefined);

    // Act
    const res = await request(app)
      .get('/api/commits/heatmap')
      .query({ repoUrl });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual(heatmap);
    expect(res.headers['x-cache-status']).toBe('MISS');
    expect(mockClone).toHaveBeenCalledWith(repoUrl);
    expect(mockGetCommits).toHaveBeenCalledWith(tempDir);
    expect(mockAggregate).toHaveBeenCalled();
    expect(mockRedisSet).toHaveBeenCalled();
    await runCleanupQueue();
    expect(mockCleanup).toHaveBeenCalledWith(tempDir);
  });

  test('returns cached heatmap data when available', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const heatmap: CommitHeatmapData = {
      timePeriod: 'day',
      data: [],
      metadata: { maxCommitCount: 0, totalCommits: 0 },
    };
    mockRedisGet.mockResolvedValue(JSON.stringify(heatmap));

    // Act
    const res = await request(app)
      .get('/api/commits/heatmap')
      .query({ repoUrl });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual(heatmap);
    expect(res.headers['x-cache-status']).toBe('HIT');
    expect(mockClone).not.toHaveBeenCalled();
    expect(mockGetCommits).not.toHaveBeenCalled();
    expect(mockAggregate).not.toHaveBeenCalled();
  });

  test('handles heatmap with filters', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const author = 'testuser';
    const fromDate = '2023-01-01T00:00:00Z';
    const toDate = '2023-12-31T23:59:59Z';
    const tempDir = '/tmp/repo';
    const heatmap: CommitHeatmapData = {
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

    // Act
    const res = await request(app)
      .get('/api/commits/heatmap')
      .query({ repoUrl, author, fromDate, toDate });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual(heatmap);
    expect(mockAggregate).toHaveBeenCalledWith([], {
      author,
      authors: undefined,
      fromDate,
      toDate,
    });
  });

  test('handles multiple authors in heatmap', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const authors = 'user1,user2,user3';
    const tempDir = '/tmp/repo';
    const heatmap: CommitHeatmapData = {
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
    mockGetCommits.mockResolvedValue(commits);
    mockCleanup.mockResolvedValue(undefined);

    // Act
    const res = await request(app)
      .get('/api/commits')
      .query({ repoUrl, page: 2, limit: 1 });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ commits, page: 2, limit: 1 });
    expect(res.headers['x-cache-status']).toBe('MISS');
    expect(mockGetCommits).toHaveBeenCalledWith(tempDir, { skip: 1, limit: 1 });
    expect(mockRedisSet).toHaveBeenCalled();
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
    const cachedResult = { commits, page: 1, limit: 100 };
    mockRedisGet.mockResolvedValue(JSON.stringify(cachedResult));

    // Act
    const res = await request(app).get('/api/commits').query({ repoUrl });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedResult);
    expect(res.headers['x-cache-status']).toBe('HIT');
    expect(mockClone).not.toHaveBeenCalled();
    expect(mockGetCommits).not.toHaveBeenCalled();
  });

  test('uses default pagination values', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const tempDir = '/tmp/repo';
    const commits: any[] = [];
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockClone.mockResolvedValue(tempDir);
    mockGetCommits.mockResolvedValue(commits);
    mockCleanup.mockResolvedValue(undefined);

    // Act
    const res = await request(app).get('/api/commits').query({ repoUrl });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ commits, page: 1, limit: 100 });
    expect(mockGetCommits).toHaveBeenCalledWith(tempDir, {
      skip: 0,
      limit: 100,
    });
  });

  test('handles service errors during commits fetch', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const tempDir = '/tmp/repo';
    mockRedisGet.mockResolvedValue(null);
    mockClone.mockResolvedValue(tempDir);
    mockGetCommits.mockRejectedValue(new Error('Git error'));
    mockCleanup.mockResolvedValue(undefined);

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
