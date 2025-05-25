import request from 'supertest';
import express, { Application } from 'express';
import { CommitHeatmapData } from '@gitray/shared-types';
import commitRoutes from '../../src/routes/commitRoutes';
import { gitService } from '../../src/services/gitService';

// Mock gitService methods used in the route
jest.mock('../../src/services/gitService', () => ({
  gitService: {
    cloneRepository: jest.fn(),
    getCommits: jest.fn(),
    aggregateCommitsByTime: jest.fn(),
    cleanupRepository: jest.fn(),
  },
}));

const mockClone = gitService.cloneRepository as jest.MockedFunction<
  typeof gitService.cloneRepository
>;
const mockGetCommits = gitService.getCommits as jest.MockedFunction<
  typeof gitService.getCommits
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
    expect(mockCleanup).toHaveBeenCalledWith(tempDir);
  });

  test('returns 400 when repoUrl is missing', async () => {
    // Act
    const res = await request(app).get('/api/commits/heatmap');

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/repoUrl/);
    expect(mockClone).not.toHaveBeenCalled();
  });

  test('handles service errors and cleans up', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const tempDir = '/tmp/repo';
    mockClone.mockResolvedValue(tempDir);
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
    expect(mockCleanup).toHaveBeenCalledWith(tempDir);
  });
});
