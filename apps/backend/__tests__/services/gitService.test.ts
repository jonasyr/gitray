import simpleGit from 'simple-git';
import { mkdtemp, rm } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { gitService } from '../../src/services/gitService';
import logger from '../../src/services/logger';
import { GIT_SERVICE } from '@gitray/shared-types';

jest.mock('simple-git');
jest.mock('fs/promises');
jest.mock('ioredis');
jest.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('GitService', () => {
  const mockGit = {
    clone: jest.fn(),
    log: jest.fn(),
    raw: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (simpleGit as jest.Mock).mockReturnValue(mockGit);
    (mkdtemp as jest.Mock).mockResolvedValue('/tmp/git-visualizer-test');
    (rm as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(logger, 'error').mockReset();
    jest.spyOn(logger, 'warn').mockReset();
    jest.spyOn(logger, 'info').mockReset();
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
      expect(mkdtemp).toHaveBeenCalledWith(
        expect.stringContaining(path.join(os.tmpdir(), 'git-visualizer-'))
      );
      expect(simpleGit).toHaveBeenCalledWith('/tmp/git-visualizer-test');
      expect(mockGit.clone).toHaveBeenCalledWith(repoUrl, '.', [
        '--depth',
        GIT_SERVICE.CLONE_DEPTH.toString(),
        '--no-single-branch',
      ]);
    });
  });

  describe('getCommits', () => {
    test('should retrieve and transform commits from a repository', async () => {
      // Arrange
      const localRepoPath = '/tmp/git-visualizer-test';

      const mockRaw =
        `abc123|2023-01-01T12:00:00Z|Test User|test@example.com|Initial commit\n` +
        `def456|2023-01-02T14:00:00Z|Another User|another@example.com|Add feature X`;
      mockGit.raw.mockResolvedValue(mockRaw);

      // Act
      const commits = await gitService.getCommits(localRepoPath);

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
      expect(mockGit.raw).toHaveBeenCalledWith([
        'log',
        '--pretty=format:%H|%cI|%an|%ae|%s',
      ]);
    });

    test('should support pagination arguments', async () => {
      const localRepoPath = '/tmp/git-visualizer-test';
      mockGit.raw.mockResolvedValue('');
      await gitService.getCommits(localRepoPath, { skip: 10, limit: 5 });
      expect(mockGit.raw).toHaveBeenCalledWith([
        'log',
        '--pretty=format:%H|%cI|%an|%ae|%s',
        '--skip=10',
        '-n',
        '5',
      ]);
    });
  });

  describe('cleanupRepository', () => {
    test('should remove the temporary repository directory', async () => {
      // Arrange
      const repoPath = '/tmp/git-visualizer-test';

      // Act
      await gitService.cleanupRepository(repoPath);

      // Assert
      expect(rm).toHaveBeenCalledWith(repoPath, {
        recursive: true,
        force: true,
      });
    });
  });
});

describe('GitService Extended Tests', () => {
  const mockGit = {
    clone: jest.fn(),
    log: jest.fn(),
    raw: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (simpleGit as jest.Mock).mockReturnValue(mockGit);
    (mkdtemp as jest.Mock).mockResolvedValue('/tmp/git-visualizer-test');
    (rm as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(logger, 'error').mockReset();
    jest.spyOn(logger, 'warn').mockReset();
    jest.spyOn(logger, 'info').mockReset();
  });

  describe('cloneRepository error handling', () => {
    test('should handle clone error and clean up successfully', async () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const mockError = new Error('Clone failed');
      const mockTempDir = '/tmp/git-visualizer-test';
      mockGit.clone.mockRejectedValue(mockError);
      await expect(gitService.cloneRepository(repoUrl)).rejects.toThrow(
        'Failed to clone repository'
      );
      expect(mkdtemp).toHaveBeenCalled();
      expect(mockGit.clone).toHaveBeenCalled();
      expect(rm).toHaveBeenCalledWith(mockTempDir, {
        recursive: true,
        force: true,
      });
    });

    test('should handle clone error and cleanup error', async () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const mockCloneError = new Error('Clone failed');
      const mockCleanupError = new Error('Cleanup failed');
      const mockTempDir = '/tmp/git-visualizer-test';
      mockGit.clone.mockRejectedValue(mockCloneError);
      (rm as jest.Mock).mockRejectedValueOnce(mockCleanupError);
      const errorSpy = jest.spyOn(logger, 'error');
      await expect(gitService.cloneRepository(repoUrl)).rejects.toThrow(
        'Failed to clone repository'
      );
      expect(mkdtemp).toHaveBeenCalled();
      expect(mockGit.clone).toHaveBeenCalled();
      expect(rm).toHaveBeenCalledWith(mockTempDir, {
        recursive: true,
        force: true,
      });
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('getCommits edge cases', () => {
    test('should handle errors when retrieving commits', async () => {
      const localRepoPath = '/tmp/git-visualizer-test';
      const mockError = new Error('Failed to get log');
      mockGit.raw.mockRejectedValue(mockError);
      await expect(gitService.getCommits(localRepoPath)).rejects.toThrow(
        'Failed to fetch commits from repository'
      );
      expect(simpleGit).toHaveBeenCalledWith(localRepoPath);
      expect(mockGit.raw).toHaveBeenCalled();
    });

    test('should filter out commits with missing data', async () => {
      const localRepoPath = '/tmp/git-visualizer-test';
      const mockRaw = [
        'abc123|2023-01-01T12:00:00Z|Test User|test@example.com|Complete commit',
        'def456|2023-01-02T14:00:00Z||another@example.com|No author',
        'ghi789|2023-01-03T15:00:00Z|Another User|another@example.com|',
      ].join('\n');
      mockGit.raw.mockResolvedValue(mockRaw);
      const warnSpy = jest.spyOn(logger, 'warn');
      const commits = await gitService.getCommits(localRepoPath);
      expect(commits).toHaveLength(1);
      expect(commits[0].sha).toBe('abc123');
      expect(warnSpy).toHaveBeenCalledTimes(2);
      warnSpy.mockRestore();
    });

    test('should handle commit messages containing pipe characters', async () => {
      const localRepoPath = '/tmp/git-visualizer-test';
      const mockRaw =
        'abc123|2023-01-01T12:00:00Z|Test User|test@example.com|feat: use A | B';
      mockGit.raw.mockResolvedValue(mockRaw);
      const commits = await gitService.getCommits(localRepoPath);
      expect(commits).toHaveLength(1);
      expect(commits[0]).toEqual({
        sha: 'abc123',
        message: 'feat: use A | B',
        date: '2023-01-01T12:00:00Z',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
      });
    });
  });

  describe('cleanupRepository error handling', () => {
    test('should handle errors when cleaning up repository', async () => {
      const repoPath = '/tmp/git-visualizer-test';
      const mockError = new Error('Cleanup failed');
      (rm as jest.Mock).mockRejectedValue(mockError);
      await expect(gitService.cleanupRepository(repoPath)).rejects.toThrow(
        'Failed to clean up repository directory'
      );
      expect(rm).toHaveBeenCalledWith(repoPath, {
        recursive: true,
        force: true,
      });
    });
  });
});
