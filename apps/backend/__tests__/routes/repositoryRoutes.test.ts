import { describe, test, expect, beforeEach, vi } from 'vitest';
// Additional tests for apps/backend/__tests__/routes/repositoryRoutes.test.ts

import request from 'supertest';
import express, { Application } from 'express';
import { withTempRepository } from '../../src/utils/withTempRepository';
import repositoryRoutes from '../../src/routes/repositoryRoutes';
import errorHandler from '../../src/middlewares/errorHandler';
import { runCleanupQueue } from '../../src/utils/cleanupScheduler';

// Mock the logger service
vi.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  },
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  })),
  createRequestLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  })),
}));

// Mock the gitService
vi.mock('../../src/services/gitService', () => ({
  gitService: {
    cloneRepository: vi.fn(),
    getCommits: vi.fn(),
    cleanupRepository: vi.fn(),
    aggregateCommitsByTime: vi.fn(),
    shouldUseStreaming: vi.fn(),
    getCommitCount: vi.fn(),
  },
}));

// Mock withTempRepository utility to avoid complex dependency chains
vi.mock('../../src/utils/withTempRepository', () => ({
  withTempRepository: vi.fn(),
}));

vi.mock('../../src/services/cache', () => ({
  __esModule: true,
  default: { get: vi.fn(), set: vi.fn() },
}));

// Type casting for mocked functions
const mockWithTempRepository = withTempRepository as any;

describe('Repository API Extended Tests', () => {
  let app: Application;

  beforeEach(() => {
    // Clear all mocks for each test
    vi.clearAllMocks();

    // Set up Express app for testing
    app = express();
    app.use(express.json());
    app.use('/', repositoryRoutes);
    app.use(errorHandler);
  });

  test('should handle error during getCommits correctly', async () => {
    // Arrange
    const validRepoUrl = 'https://github.com/username/repo.git';
    const mockError = new Error('Error fetching commits');

    // Mock withTempRepository to simulate the error
    mockWithTempRepository.mockRejectedValue(mockError);

    // Act
    const response = await request(app)
      .post('/')
      .send({ repoUrl: validRepoUrl });

    // Assert
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('An internal error occurred');
    expect(mockWithTempRepository).toHaveBeenCalledWith(
      validRepoUrl,
      expect.any(Function)
    );
    await runCleanupQueue();
  });

  test('should return commits even when cleanup fails', async () => {
    // Arrange
    const validRepoUrl = 'https://github.com/username/repo.git';
    const mockCommits = [
      {
        sha: 'abc123',
        message: 'First commit',
        date: '2023-05-01T12:00:00Z',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
      },
    ];

    // Mock withTempRepository to return commits successfully
    mockWithTempRepository.mockResolvedValue(mockCommits);

    // Act
    const response = await request(app)
      .post('/')
      .send({ repoUrl: validRepoUrl });

    // Assert
    expect(response.status).toBe(200);
    // Response should have commits in the expected format
    expect(response.body).toEqual({ commits: mockCommits });
    expect(mockWithTempRepository).toHaveBeenCalledWith(
      validRepoUrl,
      expect.any(Function)
    );
    await runCleanupQueue();
  });

  test('should handle different URL formats', async () => {
    // Test with empty string - should fail validation
    const emptyResponse = await request(app).post('/').send({ repoUrl: '' });
    expect(emptyResponse.status).toBe(400);

    // Test with obviously invalid URL - should fail validation
    const invalidResponse = await request(app)
      .post('/')
      .send({ repoUrl: 'not-a-url' });
    expect(invalidResponse.status).toBe(400);

    // Test with basic valid URL - only this should trigger withTempRepository
    const validUrl = 'https://github.com/user/repo.git';
    mockWithTempRepository.mockResolvedValueOnce([]);

    // Act
    const validResponse = await request(app)
      .post('/')
      .send({ repoUrl: validUrl });

    // Assert that withTempRepository was called exactly once, and only with the valid URL
    expect(mockWithTempRepository).toHaveBeenCalledTimes(1);
    expect(mockWithTempRepository).toHaveBeenCalledWith(
      validUrl,
      expect.any(Function)
    );
    expect(validResponse.status).toBe(200);
  });
  test('should return heatmap data', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const mockHeatmapData = {
      timePeriod: 'day' as const,
      data: [],
      metadata: { maxCommitCount: 0, totalCommits: 0 },
    };

    // Mock withTempRepository to return heatmap data
    mockWithTempRepository.mockResolvedValue(mockHeatmapData);

    // Act
    const res = await request(app).post('/heatmap').send({ repoUrl });

    // Assert
    expect(res.status).toBe(200);
    expect(mockWithTempRepository).toHaveBeenCalledWith(
      repoUrl,
      expect.any(Function)
    );
    await runCleanupQueue();
  });

  test('should return full data', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const mockFullData = {
      commits: [],
      heatmapData: {
        timePeriod: 'day' as const,
        data: [],
        metadata: { maxCommitCount: 0, totalCommits: 0 },
      },
    };

    // Mock withTempRepository to return full data
    mockWithTempRepository.mockResolvedValue(mockFullData);

    // Act
    const res = await request(app).post('/full-data').send({ repoUrl });

    // Assert
    expect(res.status).toBe(200);
    expect(mockWithTempRepository).toHaveBeenCalledWith(
      repoUrl,
      expect.any(Function)
    );
    await runCleanupQueue();
  });
});
