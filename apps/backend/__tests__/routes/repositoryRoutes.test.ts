// Additional tests for apps/backend/__tests__/routes/repositoryRoutes.test.ts

import request from 'supertest';
import express, { Application } from 'express';
import { gitService } from '../../src/services/gitService';
import repositoryRoutes from '../../src/routes/repositoryRoutes';
import errorHandler from '../../src/middlewares/errorHandler';
import logger from '../../src/services/logger';
import { runCleanupQueue } from '../../src/utils/cleanupScheduler';

// Mock des gitService
jest.mock('../../src/services/gitService', () => ({
  gitService: {
    cloneRepository: jest.fn(),
    getCommits: jest.fn(),
    getCommitCount: jest.fn(),
    shouldUseStreaming: jest.fn(),
    getCommitsStream: jest.fn(),
    cleanupRepository: jest.fn(),
    aggregateCommitsByTime: jest.fn(),
    clearStreamingResumeState: jest.fn(),
    getStreamingResumeState: jest.fn(),
  },
}));
jest.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../../src/services/cache', () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn() },
}));

// Typ-Casting für gemockte Funktionen
const mockCloneRepository = gitService.cloneRepository as jest.MockedFunction<
  typeof gitService.cloneRepository
>;
const mockGetCommits = gitService.getCommits as jest.MockedFunction<
  typeof gitService.getCommits
>;
const mockShouldUseStreaming =
  gitService.shouldUseStreaming as jest.MockedFunction<
    typeof gitService.shouldUseStreaming
  >;
const mockAggregateCommitsByTime =
  gitService.aggregateCommitsByTime as jest.MockedFunction<
    typeof gitService.aggregateCommitsByTime
  >;
const mockCleanupRepository =
  gitService.cleanupRepository as jest.MockedFunction<
    typeof gitService.cleanupRepository
  >;

describe('Repository API Extended Tests', () => {
  let app: Application;

  beforeEach(() => {
    // Zurücksetzen aller Mocks für jeden Test
    jest.clearAllMocks();

    // Express App für Tests einrichten
    app = express();
    app.use(express.json());
    app.use('/', repositoryRoutes);
    app.use(errorHandler);
    jest.spyOn(logger, 'error').mockReset();
  });

  test('sollte Fehler bei getCommits korrekt behandeln', async () => {
    // Arrange
    const validRepoUrl = 'https://github.com/username/repo.git';
    const tempDir = '/tmp/repo-123';
    const mockError = new Error('Fehler beim Abrufen der Commits');

    mockCloneRepository.mockResolvedValue(tempDir);
    mockShouldUseStreaming.mockResolvedValue(false); // Mock streaming decision
    mockGetCommits.mockRejectedValue(mockError);
    mockCleanupRepository.mockResolvedValue();

    // Act
    const response = await request(app)
      .post('/')
      .send({ repoUrl: validRepoUrl });

    // Assert
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('An internal error occurred');
    expect(mockCloneRepository).toHaveBeenCalledWith(validRepoUrl);
    expect(mockGetCommits).toHaveBeenCalledWith(tempDir);
    await runCleanupQueue();
    expect(mockCleanupRepository).toHaveBeenCalledWith(tempDir);
    expect(logger.error).toHaveBeenCalled();
  });

  test('sollte Commits zurückgeben, auch wenn Cleanup fehlschlägt', async () => {
    // Arrange
    const validRepoUrl = 'https://github.com/username/repo.git';
    const tempDir = '/tmp/repo-123';
    const mockCommits = [
      {
        sha: 'abc123',
        message: 'Erster Commit',
        date: '2023-05-01T12:00:00Z',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
      },
    ];
    const cleanupError = new Error('Cleanup fehlgeschlagen');

    mockCloneRepository.mockResolvedValue(tempDir);
    mockShouldUseStreaming.mockResolvedValue(false); // Mock streaming decision
    mockGetCommits.mockResolvedValue(mockCommits);
    mockCleanupRepository.mockRejectedValue(cleanupError);

    const errorSpy = jest.spyOn(logger, 'error');

    // Act
    const response = await request(app)
      .post('/')
      .send({ repoUrl: validRepoUrl });

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ commits: mockCommits });
    expect(mockCloneRepository).toHaveBeenCalledWith(validRepoUrl);
    expect(mockGetCommits).toHaveBeenCalledWith(tempDir);
    await runCleanupQueue();
    expect(mockCleanupRepository).toHaveBeenCalledWith(tempDir);
    expect(errorSpy).toHaveBeenCalled();

    // Clean up
    errorSpy.mockRestore();
  });

  test('sollte mit verschiedenen URL-Formaten umgehen können', async () => {
    // Arrange
    const errorSpy = jest.spyOn(logger, 'error');

    // Test with empty string
    await request(app).post('/').send({ repoUrl: '' });

    // Test with obviously invalid URL
    await request(app).post('/').send({ repoUrl: 'not-a-url' });

    // Test with basic valid URL - only this should trigger cloneRepository
    const validUrl = 'https://github.com/user/repo.git';
    mockCloneRepository.mockResolvedValueOnce('/tmp/valid-repo');
    mockShouldUseStreaming.mockResolvedValueOnce(false); // Mock streaming decision
    mockGetCommits.mockResolvedValueOnce([]);

    // Act
    await request(app).post('/').send({ repoUrl: validUrl });

    // Assert that cloneRepository was called exactly once, and only with the valid URL
    // Assert
    expect(mockCloneRepository).toHaveBeenCalledTimes(1);
    expect(mockCloneRepository).toHaveBeenCalledWith(validUrl);

    // Clean up
    errorSpy.mockRestore();
  });
  test('should return heatmap data', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const tempDir = '/tmp/repo';
    const mockHeatmapData = {
      timePeriod: 'day' as const,
      data: [],
      metadata: { maxCommitCount: 0, totalCommits: 0 },
    };
    mockCloneRepository.mockResolvedValue(tempDir);
    mockShouldUseStreaming.mockResolvedValue(false); // Mock streaming decision
    mockGetCommits.mockResolvedValue([]);
    mockAggregateCommitsByTime.mockResolvedValue(mockHeatmapData);
    mockCleanupRepository.mockResolvedValue();

    // Act
    const res = await request(app).post('/heatmap').send({ repoUrl });

    // Assert
    expect(res.status).toBe(200);
    await runCleanupQueue();
    expect(mockCleanupRepository).toHaveBeenCalledWith(tempDir);
  });

  test('should return full data', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const tempDir = '/tmp/repo';
    const mockHeatmapData = {
      timePeriod: 'day' as const,
      data: [],
      metadata: { maxCommitCount: 0, totalCommits: 0 },
    };
    mockCloneRepository.mockResolvedValue(tempDir);
    mockShouldUseStreaming.mockResolvedValue(false); // Mock streaming decision
    mockGetCommits.mockResolvedValue([]);
    mockAggregateCommitsByTime.mockResolvedValue(mockHeatmapData);
    (gitService.aggregateCommitsByTime as jest.Mock).mockResolvedValue({});
    mockCleanupRepository.mockResolvedValue();

    // Act
    const res = await request(app).post('/full-data').send({ repoUrl });

    // Assert
    expect(res.status).toBe(200);
    await runCleanupQueue();
    expect(mockCleanupRepository).toHaveBeenCalledWith(tempDir);
  });
});
