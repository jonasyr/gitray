// Additional tests for apps/backend/__tests__/routes/repositoryRoutes.test.ts

import request from 'supertest';
import express, { Application } from 'express';
import { gitService } from '../../src/services/gitService';
import repositoryRoutes from '../../src/routes/repositoryRoutes';

// Mock des gitService
jest.mock('../../src/services/gitService', () => ({
  gitService: {
    cloneRepository: jest.fn(),
    getCommits: jest.fn(),
    cleanupRepository: jest.fn()
  }
}));

// Typ-Casting für gemockte Funktionen
const mockCloneRepository = gitService.cloneRepository as jest.MockedFunction<typeof gitService.cloneRepository>;
const mockGetCommits = gitService.getCommits as jest.MockedFunction<typeof gitService.getCommits>;
const mockCleanupRepository = gitService.cleanupRepository as jest.MockedFunction<typeof gitService.cleanupRepository>;

describe('Repository API Extended Tests', () => {
  let app: Application;
  
  beforeEach(() => {
    // Zurücksetzen aller Mocks für jeden Test
    jest.clearAllMocks();
    
    // Express App für Tests einrichten
    app = express();
    app.use(express.json());
    app.use('/', repositoryRoutes);
  });

  test('sollte Fehler bei getCommits korrekt behandeln', async () => {
    // Arrange
    const validRepoUrl = 'https://github.com/username/repo.git';
    const tempDir = '/tmp/repo-123';
    const mockError = new Error('Fehler beim Abrufen der Commits');
    
    mockCloneRepository.mockResolvedValue(tempDir);
    mockGetCommits.mockRejectedValue(mockError);
    mockCleanupRepository.mockResolvedValue();
    
    // Act
    const response = await request(app)
      .post('/')
      .send({ repoUrl: validRepoUrl });
    
    // Assert
    expect(response.status).toBe(500);
    expect(response.body.error).toBe(mockError.message);
    expect(mockCloneRepository).toHaveBeenCalledWith(validRepoUrl);
    expect(mockGetCommits).toHaveBeenCalledWith(tempDir, 1000);
    expect(mockCleanupRepository).toHaveBeenCalledWith(tempDir);
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
        authorEmail: 'test@example.com'
      }
    ];
    const cleanupError = new Error('Cleanup fehlgeschlagen');
    
    mockCloneRepository.mockResolvedValue(tempDir);
    mockGetCommits.mockResolvedValue(mockCommits);
    mockCleanupRepository.mockRejectedValue(cleanupError);
    
    // Spy on console.error to verify it's called
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Act
    const response = await request(app)
      .post('/')
      .send({ repoUrl: validRepoUrl });
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ commits: mockCommits });
    expect(mockCloneRepository).toHaveBeenCalledWith(validRepoUrl);
    expect(mockGetCommits).toHaveBeenCalledWith(tempDir, 1000);
    expect(mockCleanupRepository).toHaveBeenCalledWith(tempDir);
    expect(consoleSpy).toHaveBeenCalled();
    
    // Clean up
    consoleSpy.mockRestore();
  });

  test('sollte mit verschiedenen URL-Formaten umgehen können', async () => {
    // Spy on console.error to prevent output pollution during tests
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Test with empty string
    await request(app)
      .post('/')
      .send({ repoUrl: '' });
    
    // Test with obviously invalid URL
    await request(app)
      .post('/')
      .send({ repoUrl: 'not-a-url' });
    
    // Test with basic valid URL - only this should trigger cloneRepository
    const validUrl = 'https://github.com/user/repo.git';
    mockCloneRepository.mockResolvedValueOnce('/tmp/valid-repo');
    mockGetCommits.mockResolvedValueOnce([]);
    
    await request(app)
      .post('/')
      .send({ repoUrl: validUrl });
    
    // Assert that cloneRepository was called exactly once, and only with the valid URL
    expect(mockCloneRepository).toHaveBeenCalledTimes(1);
    expect(mockCloneRepository).toHaveBeenCalledWith(validUrl);
    
    // Clean up
    consoleSpy.mockRestore();
  });
});
