import { describe, expect, beforeEach, vi } from 'vitest';
import simpleGit from 'simple-git';
import { mkdtemp, rm } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { gitService } from '../../../src/services/gitService';
import { GIT_SERVICE } from '@gitray/shared-types';

vi.mock('simple-git');

vi.mock('fs/promises');
vi.mock('ioredis');
vi.mock('../../../src/services/logger', () => ({
  __esModule: true,
  default: global.mockLogger,
  getLogger: global.getLogger,
}));

vi.mock('../../../src/utils/memoryPressureManager', () => ({
  getMemoryStats: vi.fn(() => ({
    system: {
      free: 1024 * 1024 * 1024, // 1GB
      total: 4 * 1024 * 1024 * 1024, // 4GB
      usagePercentage: 0.25,
    },
    process: {
      heapUsed: 100 * 1024 * 1024, // 100MB
      heapTotal: 200 * 1024 * 1024, // 200MB
      rss: 150 * 1024 * 1024, // 150MB
    },
    pressure: {
      level: 'normal',
      factor: 0.0,
    },
    gc: {
      forced: 0,
      full: 0,
    },
  })),
  shouldThrottleRequest: vi.fn(() => false),
  executeWithMemoryProtection: vi.fn(async (operationId, fn) => {
    if (typeof fn === 'function') {
      return await fn();
    }
    throw new Error('executeWithMemoryProtection requires a function');
  }),
  getMemoryMetrics: vi.fn(() => ({})),
}));

describe('GitService', () => {
  const mockGit = {
    clone: vi.fn(),
    log: vi.fn(),
    raw: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (simpleGit as any).mockReturnValue(mockGit);
    (mkdtemp as any).mockResolvedValue('/tmp/git-visualizer-test');
    (rm as any).mockResolvedValue(undefined);

    // Default intelligent git.raw mock (can be overridden in individual tests)
    mockGit.raw.mockImplementation((args: string[]) => {
      if (args.includes('--count')) {
        // For commit count queries, return a number
        return Promise.resolve('2\n');
      } else {
        // For other queries, return empty by default (will be overridden in tests)
        return Promise.resolve('');
      }
    });
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

      // Override the mock for this specific test
      mockGit.raw.mockImplementation((args: string[]) => {
        if (args.includes('--count')) {
          return Promise.resolve('2\n'); // Return count for the commits
        } else if (args.includes('log')) {
          return Promise.resolve(mockRaw); // Return commit data for log command
        }
        return Promise.resolve('');
      });

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
    clone: vi.fn(),
    log: vi.fn(),
    raw: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (simpleGit as any).mockReturnValue(mockGit);
    (mkdtemp as any).mockResolvedValue('/tmp/git-visualizer-test');
    (rm as any).mockResolvedValue(undefined);
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
      (rm as any).mockRejectedValueOnce(mockCleanupError);
      const errorSpy = vi.spyOn(global.mockLogger, 'error');
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

      // Override the mock for this specific test
      mockGit.raw.mockImplementation((args: string[]) => {
        if (args.includes('--count')) {
          return Promise.resolve('3\n'); // Return count for the commits
        } else if (args.includes('log')) {
          return Promise.resolve(mockRaw); // Return commit data for log command
        }
        return Promise.resolve('');
      });

      const warnSpy = vi.spyOn(global.mockLogger, 'warn');
      const commits = await gitService.getCommits(localRepoPath);
      expect(commits).toHaveLength(1);
      expect(commits[0].sha).toBe('abc123');
      expect(warnSpy).toHaveBeenCalledTimes(2); // Should be 2 warnings for missing data
      warnSpy.mockRestore();
    });

    test('should handle commit messages containing pipe characters', async () => {
      const localRepoPath = '/tmp/git-visualizer-test';
      const mockRaw =
        'abc123|2023-01-01T12:00:00Z|Test User|test@example.com|feat: use A | B';

      // Override the mock for this specific test
      mockGit.raw.mockImplementation((args: string[]) => {
        if (args.includes('--count')) {
          return Promise.resolve('1\n'); // Return count for the commits
        } else if (args.includes('log')) {
          return Promise.resolve(mockRaw); // Return commit data for log command
        }
        return Promise.resolve('');
      });

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
      (rm as any).mockRejectedValue(mockError);
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
