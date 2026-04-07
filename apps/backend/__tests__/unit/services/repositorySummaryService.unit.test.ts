import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SimpleGit } from 'simple-git';

// Mock dependencies BEFORE imports
vi.mock('../../../src/services/cache', () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    addRemote: vi.fn().mockResolvedValue(undefined),
    raw: vi.fn().mockResolvedValue(''),
  })),
  simpleGit: vi.fn(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    addRemote: vi.fn().mockResolvedValue(undefined),
    raw: vi.fn().mockResolvedValue(''),
  })),
}));

vi.mock('../../../src/services/repositoryCoordinator', () => ({
  coordinatedOperation: vi.fn((url, type, fn) => fn()),
}));

vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/gitray-summary-test123'),
  rm: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
import { repositorySummaryService } from '../../../src/services/repositorySummaryService';
import redis from '../../../src/services/cache';
import simpleGit from 'simple-git';
import { coordinatedOperation } from '../../../src/services/repositoryCoordinator';
import * as fsPromises from 'node:fs/promises';

const mockRedis = vi.mocked(redis);
const mockSimpleGit = vi.mocked(simpleGit);
const mockCoordinatedOperation = vi.mocked(coordinatedOperation);
const mockMkdtemp = vi.mocked(fsPromises.mkdtemp);
const mockRm = vi.mocked(fsPromises.rm);

describe('RepositorySummaryService', () => {
  let mockGitInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mock git instance for each test
    mockGitInstance = {
      init: vi.fn().mockResolvedValue(undefined),
      addRemote: vi.fn().mockResolvedValue(undefined),
      raw: vi.fn().mockResolvedValue(''),
      revparse: vi.fn().mockResolvedValue('abc123'),
    };

    // Make simpleGit return our mock instance
    mockSimpleGit.mockReturnValue(mockGitInstance);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getRepositorySummary - Cache hit', () => {
    it('should return cached summary when cache hit occurs', async () => {
      const cachedSummary = {
        repository: {
          name: 'Hello-World',
          owner: 'octocat',
          url: 'https://github.com/octocat/Hello-World.git',
          platform: 'github',
        },
        created: {
          date: '2011-03-22T00:00:00.000Z',
          source: 'first-commit' as const,
        },
        age: {
          years: 13,
          months: 8,
          formatted: '13.7y',
        },
        lastCommit: {
          date: '2025-11-15T10:30:00.000Z',
          relativeTime: '4 days ago',
          sha: 'abc123',
          author: 'Test Author',
        },
        stats: {
          totalCommits: 100,
          contributors: 5,
          status: 'active' as const,
        },
        metadata: {
          cached: false,
          dataSource: 'git-sparse-clone' as const,
          createdDateAccuracy: 'approximate' as const,
          bandwidthSaved: '95-99% vs full clone',
          lastUpdated: '2025-11-19T10:00:00.000Z',
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedSummary));

      const result = await repositorySummaryService.getRepositorySummary(
        'https://github.com/octocat/Hello-World.git'
      );

      expect(mockRedis.get).toHaveBeenCalled();
      expect(mockCoordinatedOperation).not.toHaveBeenCalled();
      expect(result.metadata.cached).toBe(true);
      expect(result.metadata.dataSource).toBe('cache');
      expect(result.repository.name).toBe('Hello-World');
    });
  });

  describe('getRepositorySummary - Cache miss', () => {
    it('should perform sparse clone and return summary when cache misses', async () => {
      mockRedis.get.mockResolvedValue(null);

      // Mock Git operations in sequence
      mockGitInstance.raw = vi
        .fn()
        .mockResolvedValueOnce(undefined) // config
        .mockResolvedValueOnce(undefined) // fetch
        .mockResolvedValueOnce(undefined) // checkout
        .mockResolvedValueOnce('100\n') // rev-list --count
        .mockResolvedValueOnce('2011-03-22T00:00:00.000Z\n') // log --reverse (first commit)
        .mockResolvedValueOnce(
          `${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}|abc123def|Test Author\n`
        ) // log -1 (last commit)
        .mockResolvedValueOnce('     10  Author One\n      5  Author Two\n'); // shortlog

      mockGitInstance.revparse = vi.fn().mockResolvedValue('abc123def456');

      const result = await repositorySummaryService.getRepositorySummary(
        'https://github.com/octocat/Hello-World.git'
      );

      expect(mockRedis.get).toHaveBeenCalled();
      expect(mockCoordinatedOperation).toHaveBeenCalled();
      expect(mockMkdtemp).toHaveBeenCalled();
      expect(mockRm).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled();

      expect(result.stats.totalCommits).toBe(100);
      expect(result.stats.contributors).toBe(2);
      expect(result.stats.status).toBe('active');
      expect(result.repository.platform).toBe('github');
      expect(result.metadata.cached).toBe(false);
      expect(result.metadata.dataSource).toBe('git-sparse-clone');
    });

    it('should handle empty repository gracefully', async () => {
      mockRedis.get.mockResolvedValue(null);

      // Mock empty repository
      mockGitInstance.raw
        .mockResolvedValueOnce('') // init
        .mockResolvedValueOnce('') // addRemote
        .mockResolvedValueOnce('') // config
        .mockResolvedValueOnce('') // fetch
        .mockResolvedValueOnce('') // checkout
        .mockRejectedValueOnce(new Error("bad revision 'HEAD'")); // rev-list fails on empty repo

      const result = await repositorySummaryService.getRepositorySummary(
        'https://github.com/test/empty-repo.git'
      );

      expect(result.stats.totalCommits).toBe(0);
      expect(result.stats.contributors).toBe(0);
      expect(result.stats.status).toBe('empty');
      expect(result.lastCommit.relativeTime).toBe('no commits');
      expect(mockRm).toHaveBeenCalled();
    });
  });

  describe('URL parsing', () => {
    it('should parse GitHub HTTPS URL correctly', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockGitInstance.raw
        .mockResolvedValue('') // init/config/fetch/checkout
        .mockResolvedValue('0\n'); // commit count for empty repo

      const result = await repositorySummaryService.getRepositorySummary(
        'https://github.com/octocat/Hello-World.git'
      );

      expect(result.repository.platform).toBe('github');
      expect(result.repository.owner).toBe('octocat');
      expect(result.repository.name).toBe('Hello-World');
    });

    it('should parse GitHub SSH URL correctly', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockGitInstance.raw
        .mockResolvedValue('') // init/config/fetch/checkout
        .mockResolvedValue('0\n'); // commit count for empty repo

      const result = await repositorySummaryService.getRepositorySummary(
        'git@github.com:octocat/Hello-World.git'
      );

      expect(result.repository.platform).toBe('github');
      expect(result.repository.owner).toBe('octocat');
      expect(result.repository.name).toBe('Hello-World');
    });

    it('should parse GitLab URL correctly', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockGitInstance.raw
        .mockResolvedValue('') // init/config/fetch/checkout
        .mockResolvedValue('0\n'); // commit count for empty repo

      const result = await repositorySummaryService.getRepositorySummary(
        'https://gitlab.com/test-org/test-project.git'
      );

      expect(result.repository.platform).toBe('gitlab');
      expect(result.repository.owner).toBe('test-org');
      expect(result.repository.name).toBe('test-project');
    });

    it('should throw ValidationError for invalid URL', async () => {
      await expect(
        repositorySummaryService.getRepositorySummary('not-a-valid-url')
      ).rejects.toThrow('Invalid repository URL');
    });

    it('should throw ValidationError for empty URL', async () => {
      await expect(
        repositorySummaryService.getRepositorySummary('')
      ).rejects.toThrow('Repository URL is required');
    });
  });

  describe('Status determination', () => {
    it('should mark repository as active when last commit is within 30 days', async () => {
      mockRedis.get.mockResolvedValue(null);

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10); // 10 days ago

      mockGitInstance.raw
        .mockResolvedValue('') // init/config/fetch/checkout
        .mockResolvedValueOnce('50\n') // commit count
        .mockResolvedValueOnce('2020-01-01T00:00:00.000Z\n') // first commit
        .mockResolvedValueOnce(`${recentDate.toISOString()}|abc123|Test\n`) // last commit (10 days ago)
        .mockResolvedValueOnce('     10  Author\n'); // contributors

      const result = await repositorySummaryService.getRepositorySummary(
        'https://github.com/test/active-repo.git'
      );

      expect(result.stats.status).toBe('active');
    });

    it('should mark repository as inactive when last commit is between 30-180 days', async () => {
      mockRedis.get.mockResolvedValue(null);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 90); // 90 days ago

      mockGitInstance.raw = vi
        .fn()
        .mockResolvedValueOnce(undefined) // config
        .mockResolvedValueOnce(undefined) // fetch
        .mockResolvedValueOnce(undefined) // checkout
        .mockResolvedValueOnce('50\n') // commit count
        .mockResolvedValueOnce('2020-01-01T00:00:00.000Z\n') // first commit
        .mockResolvedValueOnce(`${oldDate.toISOString()}|abc123|Test\n`) // last commit (90 days ago)
        .mockResolvedValueOnce('     10  Author\n'); // contributors

      const result = await repositorySummaryService.getRepositorySummary(
        'https://github.com/test/inactive-repo.git'
      );

      expect(result.stats.status).toBe('inactive');
    });

    it('should mark repository as archived when last commit is over 180 days', async () => {
      mockRedis.get.mockResolvedValue(null);

      const veryOldDate = new Date();
      veryOldDate.setDate(veryOldDate.getDate() - 200); // 200 days ago

      mockGitInstance.raw = vi
        .fn()
        .mockResolvedValueOnce(undefined) // config
        .mockResolvedValueOnce(undefined) // fetch
        .mockResolvedValueOnce(undefined) // checkout
        .mockResolvedValueOnce('50\n') // commit count
        .mockResolvedValueOnce('2020-01-01T00:00:00.000Z\n') // first commit
        .mockResolvedValueOnce(`${veryOldDate.toISOString()}|abc123|Test\n`) // last commit (200 days ago)
        .mockResolvedValueOnce('     10  Author\n'); // contributors

      const result = await repositorySummaryService.getRepositorySummary(
        'https://github.com/test/archived-repo.git'
      );

      expect(result.stats.status).toBe('archived');
    });
  });

  describe('Cleanup', () => {
    it('should clean up temp directory even on error', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockGitInstance.raw.mockRejectedValue(new Error('Clone failed'));

      await expect(
        repositorySummaryService.getRepositorySummary(
          'https://github.com/test/failing-repo.git'
        )
      ).rejects.toThrow('Clone failed');

      expect(mockRm).toHaveBeenCalled();
    });
  });
});
