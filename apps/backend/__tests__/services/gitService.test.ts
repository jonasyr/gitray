import simpleGit from 'simple-git';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { gitService } from '../../src/services/gitService';

// Mock dependencies
jest.mock('simple-git');
jest.mock('fs/promises');

describe('GitService', () => {
  // Mock implementation of simpleGit
  const mockGit = {
    clone: jest.fn(),
    log: jest.fn(),
  };

  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    (simpleGit as jest.Mock).mockReturnValue(mockGit);
    (mkdtemp as jest.Mock).mockResolvedValue('/tmp/git-visualizer-test');
    (rm as jest.Mock).mockResolvedValue(undefined);
  });

  describe('cloneRepository', () => {
    test('should successfully clone a repository and return the temp directory path', async () => {
      // Arrange
      const repoUrl = 'https://github.com/user/repo.git';
      mockGit.clone.mockResolvedValue(undefined);
      
      // Act
      const result = await gitService.cloneRepository(repoUrl);
      
      // Assert
      expect(result).toBe('/tmp/git-visualizer-test');
      expect(mkdtemp).toHaveBeenCalledWith(expect.stringContaining(path.join(os.tmpdir(), 'git-visualizer-')));
      expect(simpleGit).toHaveBeenCalledWith('/tmp/git-visualizer-test');
      expect(mockGit.clone).toHaveBeenCalledWith(repoUrl, '.', { '--depth': 50 });
    });
  });

  describe('getCommits', () => {
    test('should retrieve and transform commits from a repository', async () => {
      // Arrange
      const localRepoPath = '/tmp/git-visualizer-test';
      const maxCount = 10;
      
      const mockLogResult = {
        all: [
          {
            hash: 'abc123',
            date: '2023-01-01T12:00:00Z',
            message: 'Initial commit',
            author_name: 'Test User',
            author_email: 'test@example.com',
          },
          {
            hash: 'def456',
            date: '2023-01-02T14:00:00Z',
            message: 'Add feature X',
            author_name: 'Another User',
            author_email: 'another@example.com',
          },
        ],
      };
      
      mockGit.log.mockResolvedValue(mockLogResult);
      
      // Act
      const commits = await gitService.getCommits(localRepoPath, maxCount);
      
      // Assert
      expect(commits).toHaveLength(2);
      expect(commits[0]).toEqual({
        sha: 'abc123',
        message: 'Initial commit',
        date: '2023-01-01T12:00:00Z',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
      });
      expect(simpleGit).toHaveBeenCalledWith(localRepoPath);
      expect(mockGit.log).toHaveBeenCalledWith({ maxCount });
    });
  });

  describe('cleanupRepository', () => {
    test('should remove the temporary repository directory', async () => {
      // Arrange
      const repoPath = '/tmp/git-visualizer-test';
      
      // Act
      await gitService.cleanupRepository(repoPath);
      
      // Assert
      expect(rm).toHaveBeenCalledWith(repoPath, { recursive: true, force: true });
    });
  });
});

describe('GitService Extended Tests', () => {
  const mockGit = {
    clone: jest.fn(),
    log: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (simpleGit as jest.Mock).mockReturnValue(mockGit);
    (mkdtemp as jest.Mock).mockResolvedValue('/tmp/git-visualizer-test');
    (rm as jest.Mock).mockResolvedValue(undefined);
  });

  describe('cloneRepository error handling', () => {
    test('should handle clone error and clean up successfully', async () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const mockError = new Error('Clone failed');
      const mockTempDir = '/tmp/git-visualizer-test';
      mockGit.clone.mockRejectedValue(mockError);
      await expect(gitService.cloneRepository(repoUrl)).rejects.toThrow('Failed to clone repository');
      expect(mkdtemp).toHaveBeenCalled();
      expect(mockGit.clone).toHaveBeenCalled();
      expect(rm).toHaveBeenCalledWith(mockTempDir, { recursive: true, force: true });
    });

    test('should handle clone error and cleanup error', async () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const mockCloneError = new Error('Clone failed');
      const mockCleanupError = new Error('Cleanup failed');
      const mockTempDir = '/tmp/git-visualizer-test';
      mockGit.clone.mockRejectedValue(mockCloneError);
      (rm as jest.Mock).mockRejectedValueOnce(mockCleanupError);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await expect(gitService.cloneRepository(repoUrl)).rejects.toThrow('Failed to clone repository');
      expect(mkdtemp).toHaveBeenCalled();
      expect(mockGit.clone).toHaveBeenCalled();
      expect(rm).toHaveBeenCalledWith(mockTempDir, { recursive: true, force: true });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('getCommits edge cases', () => {
    test('should handle errors when retrieving commits', async () => {
      const localRepoPath = '/tmp/git-visualizer-test';
      const mockError = new Error('Failed to get log');
      mockGit.log.mockRejectedValue(mockError);
      await expect(gitService.getCommits(localRepoPath)).rejects.toThrow('Failed to get commits from repository');
      expect(simpleGit).toHaveBeenCalledWith(localRepoPath);
      expect(mockGit.log).toHaveBeenCalled();
    });

    test('should filter out commits with missing data', async () => {
      const localRepoPath = '/tmp/git-visualizer-test';
      const mockLogResult = {
        all: [
          {
            hash: 'abc123',
            date: '2023-01-01T12:00:00Z',
            message: 'Complete commit',
            author_name: 'Test User',
            author_email: 'test@example.com',
          },
          {
            hash: 'def456',
            date: '2023-01-02T14:00:00Z',
            author_name: 'Another User',
            author_email: 'another@example.com',
          },
          {
            hash: 'ghi789',
            date: '2023-01-03T15:00:00Z',
            message: 'Missing author name',
            author_email: 'another@example.com',
          },
        ],
      };
      mockGit.log.mockResolvedValue(mockLogResult);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const commits = await gitService.getCommits(localRepoPath);
      expect(commits).toHaveLength(1);
      expect(commits[0].sha).toBe('abc123');
      expect(warnSpy).toHaveBeenCalledTimes(2);
      warnSpy.mockRestore();
    });

    test('should use default maxCount of 100 when not provided', async () => {
      const localRepoPath = '/tmp/git-visualizer-test';
      mockGit.log.mockResolvedValue({ all: [] });
      await gitService.getCommits(localRepoPath);
      expect(mockGit.log).toHaveBeenCalledWith({ maxCount: 100 });
    });

    test('should use provided maxCount when specified', async () => {
      const localRepoPath = '/tmp/git-visualizer-test';
      const maxCount = 50;
      mockGit.log.mockResolvedValue({ all: [] });
      await gitService.getCommits(localRepoPath, maxCount);
      expect(mockGit.log).toHaveBeenCalledWith({ maxCount: 50 });
    });
  });

  describe('cleanupRepository error handling', () => {
    test('should handle errors when cleaning up repository', async () => {
      const repoPath = '/tmp/git-visualizer-test';
      const mockError = new Error('Cleanup failed');
      (rm as jest.Mock).mockRejectedValue(mockError);
      await expect(gitService.cleanupRepository(repoPath)).rejects.toThrow('Failed to clean up repository directory');
      expect(rm).toHaveBeenCalledWith(repoPath, { recursive: true, force: true });
    });
  });
});