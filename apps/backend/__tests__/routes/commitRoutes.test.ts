import request from 'supertest';
import express, { Application } from 'express';
import { CommitHeatmapData } from '@gitray/shared-types';
import commitRoutes from '../../src/routes/commitRoutes';
import { gitService } from '../../src/services/gitService';
import errorHandler from '../../src/middlewares/errorHandler';
import { runCleanupQueue } from '../../src/utils/cleanupScheduler';

// Mock gitService methods used in the route
jest.mock('../../src/services/gitService', () => ({
  gitService: {
    cloneRepository: jest.fn(),
    getCommits: jest.fn(),
    getCommitCount: jest.fn(),
    shouldUseStreaming: jest.fn(),
    getCommitsStream: jest.fn(),
    aggregateCommitsByTime: jest.fn(),
    cleanupRepository: jest.fn(),
    clearStreamingResumeState: jest.fn(),
    getStreamingResumeState: jest.fn(),
  },
}));
jest.mock('../../src/services/cache', () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn() },
}));

const mockClone = gitService.cloneRepository as jest.MockedFunction<
  typeof gitService.cloneRepository
>;
const mockGetCommits = gitService.getCommits as jest.MockedFunction<
  typeof gitService.getCommits
>;
const mockShouldUseStreaming =
  gitService.shouldUseStreaming as jest.MockedFunction<
    typeof gitService.shouldUseStreaming
  >;
const mockAggregate = gitService.aggregateCommitsByTime as jest.MockedFunction<
  typeof gitService.aggregateCommitsByTime
>;
const mockCleanup = gitService.cleanupRepository as jest.MockedFunction<
  typeof gitService.cleanupRepository
>;

describe('commitRoutes /heatmap', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
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
    mockClone.mockResolvedValue(tempDir);
    mockGetCommits.mockResolvedValue([]);
    mockShouldUseStreaming.mockResolvedValue(false); // Mock streaming decision
    mockAggregate.mockResolvedValue(heatmap);
    mockCleanup.mockResolvedValue();

    // Act
    const res = await request(app)
      .get('/api/commits/heatmap')
      .query({ repoUrl });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual(heatmap);
    expect(mockClone).toHaveBeenCalledWith(repoUrl);
    expect(mockGetCommits).toHaveBeenCalledWith(tempDir);
    expect(mockAggregate).toHaveBeenCalled();
    await runCleanupQueue();
    expect(mockCleanup).toHaveBeenCalledWith(tempDir);
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
    mockClone.mockResolvedValue(tempDir);
    mockShouldUseStreaming.mockResolvedValue(false); // Mock streaming decision
    mockGetCommits.mockRejectedValue(new Error('fail'));
    mockCleanup.mockResolvedValue();

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
    jest.clearAllMocks();
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
    mockClone.mockResolvedValue(tempDir);
    mockShouldUseStreaming.mockResolvedValue(false); // Mock streaming decision
    mockGetCommits.mockResolvedValue(commits);
    mockCleanup.mockResolvedValue();

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
    });
    expect(mockGetCommits).toHaveBeenCalledWith(tempDir, { skip: 1, limit: 1 });
    await runCleanupQueue();
    expect(mockCleanup).toHaveBeenCalledWith(tempDir);
  });
});
