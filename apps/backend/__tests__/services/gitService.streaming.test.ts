import { describe, test, expect, beforeEach, vi } from 'vitest';
import simpleGit from 'simple-git';
import { gitService } from '../../src/services/gitService';
import redis from '../../src/services/cache';
import { config } from '../../src/config';

vi.mock('simple-git');
vi.mock('ioredis');
vi.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: global.mockLogger,
  getLogger: global.getLogger,
}));

vi.mock('../../src/services/metrics', () => ({
  recordStreamingStart: vi.fn(),
  recordStreamingCompletion: vi.fn(),
  recordStreamingBatch: vi.fn(),
  recordStreamingError: vi.fn(),
  recordEnhancedCacheOperation: vi.fn(),
  recordDetailedError: vi.fn(),
  updateServiceHealthScore: vi.fn(),
  getRepositoryType: vi.fn(() => 'public'),
}));

vi.mock('../../src/services/cache', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

describe('GitService Streaming Functionality', () => {
  const mockGit = {
    raw: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (simpleGit as any).mockReturnValue(mockGit);
    vi.spyOn(global.mockLogger, 'info').mockReset();
    vi.spyOn(global.mockLogger, 'warn').mockReset();
    vi.spyOn(global.mockLogger, 'debug').mockReset();
    (redis.get as any).mockResolvedValue(null);
    (redis.set as any).mockResolvedValue('OK');
    (redis.del as any).mockResolvedValue(1);
  });

  describe('getCommitCount', () => {
    test('should return commit count for repository', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw.mockResolvedValue('50000\n');

      // Act
      const count = await gitService.getCommitCount(localRepoPath);

      // Assert
      expect(count).toBe(50000);
      expect(mockGit.raw).toHaveBeenCalledWith(['rev-list', '--count', 'HEAD']);
    });

    test('should handle invalid count output', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw.mockResolvedValue('invalid\n');

      // Act & Assert
      await expect(gitService.getCommitCount(localRepoPath)).rejects.toThrow(
        'Failed to fetch commits from repository'
      );
    });

    test('should handle git command errors', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw.mockRejectedValue(new Error('git command failed'));

      // Act & Assert
      await expect(gitService.getCommitCount(localRepoPath)).rejects.toThrow(
        'Failed to fetch commits from repository'
      );
    });
  });

  describe('shouldUseStreaming', () => {
    test('should return true for large repositories when streaming is enabled', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw.mockResolvedValue('60000\n'); // Above threshold
      config.streaming.enabled = true;
      config.streaming.commitThreshold = 50000;

      // Act
      const shouldStream = await gitService.shouldUseStreaming(localRepoPath);

      // Assert
      expect(shouldStream).toBe(true);
    });

    test('should return false for small repositories', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw.mockResolvedValue('1000\n'); // Below threshold
      config.streaming.enabled = true;
      config.streaming.commitThreshold = 50000;

      // Act
      const shouldStream = await gitService.shouldUseStreaming(localRepoPath);

      // Assert
      expect(shouldStream).toBe(false);
    });

    test('should return false when streaming is disabled', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw.mockResolvedValue('60000\n'); // Above threshold
      config.streaming.enabled = false;

      // Act
      const shouldStream = await gitService.shouldUseStreaming(localRepoPath);

      // Assert
      expect(shouldStream).toBe(false);
    });

    test('should handle errors gracefully and return false', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw.mockRejectedValue(new Error('git error'));
      config.streaming.enabled = true;

      // Act
      const shouldStream = await gitService.shouldUseStreaming(localRepoPath);

      // Assert
      expect(shouldStream).toBe(false);
      expect(global.mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('getCommitsStream', () => {
    test('should stream commits in batches', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      const streamingOptions = { batchSize: 2 };

      // Mock total count
      mockGit.raw
        .mockResolvedValueOnce('4\n') // getCommitCount call
        .mockResolvedValueOnce(
          // First batch
          'abc123|2023-01-01T12:00:00Z|User1|user1@example.com|Commit 1\n' +
            'def456|2023-01-02T12:00:00Z|User2|user2@example.com|Commit 2'
        )
        .mockResolvedValueOnce(
          // Second batch
          'ghi789|2023-01-03T12:00:00Z|User3|user3@example.com|Commit 3\n' +
            'jkl012|2023-01-04T12:00:00Z|User4|user4@example.com|Commit 4'
        );

      // Act
      const batches = [];
      for await (const batch of gitService.getCommitsStream(
        localRepoPath,
        streamingOptions
      )) {
        batches.push(batch);
      }

      // Assert
      expect(batches).toHaveLength(2);
      expect(batches[0]).toHaveLength(2);
      expect(batches[1]).toHaveLength(2);
      expect(batches[0][0].sha).toBe('abc123');
      expect(batches[1][0].sha).toBe('ghi789');
    });

    test('should handle caching of batches', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      const streamingOptions = { batchSize: 1 };

      mockGit.raw.mockResolvedValueOnce('2\n'); // getCommitCount call

      // Mock cached batch
      (redis.get as any).mockResolvedValueOnce(
        JSON.stringify([
          {
            sha: 'cached123',
            message: 'Cached commit',
            date: '2023-01-01T12:00:00Z',
            authorName: 'Cached User',
            authorEmail: 'cached@example.com',
          },
        ])
      );

      // Act
      const batches = [];
      for await (const batch of gitService.getCommitsStream(
        localRepoPath,
        streamingOptions
      )) {
        batches.push(batch);
        break; // Only test first batch
      }

      // Assert
      expect(batches[0][0].sha).toBe('cached123');
      expect(redis.get).toHaveBeenCalled();
      expect(mockGit.raw).toHaveBeenCalledTimes(1); // Only getCommitCount, no git log
    });

    test('should handle resume state', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      const resumeState = {
        lastProcessedSha: 'abc123',
        processedCount: 1,
        totalEstimatedCount: 3,
        startTime: Date.now() - 1000,
      };
      const streamingOptions = {
        batchSize: 1,
        resumeState,
      };

      mockGit.raw
        .mockResolvedValueOnce('3\n') // getCommitCount call
        .mockResolvedValueOnce(
          // Resume from second commit
          'def456|2023-01-02T12:00:00Z|User2|user2@example.com|Commit 2'
        );

      // Act
      const batches = [];
      for await (const batch of gitService.getCommitsStream(
        localRepoPath,
        streamingOptions
      )) {
        batches.push(batch);
        break; // Only test first batch after resume
      }

      // Assert
      expect(batches[0][0].sha).toBe('def456');
      expect(mockGit.raw).toHaveBeenCalledWith([
        'log',
        '--pretty=format:%H|%cI|%an|%ae|%s',
        '--skip=1', // Should skip to resume point
        '-n',
        '1',
      ]);
    });

    test('should handle memory pressure warnings', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      const streamingOptions = { batchSize: 1 };

      mockGit.raw
        .mockResolvedValueOnce('1\n') // getCommitCount call
        .mockResolvedValueOnce(
          'abc123|2023-01-01T12:00:00Z|User1|user1@example.com|Commit 1'
        );

      // Mock high memory usage
      const originalMemoryUsage = process.memoryUsage;
      const mockMemoryUsage = vi.fn(() => ({
        heapUsed: 600 * 1024 * 1024, // 600MB - above threshold
        heapTotal: 1024 * 1024 * 1024,
        external: 0,
        rss: 1024 * 1024 * 1024,
        arrayBuffers: 0,
      }));
      process.memoryUsage = mockMemoryUsage as any;

      // Act
      const batches = [];
      for await (const batch of gitService.getCommitsStream(
        localRepoPath,
        streamingOptions
      )) {
        batches.push(batch);
      }

      // Assert
      expect(global.mockLogger.warn).toHaveBeenCalledWith(
        'High memory usage detected during streaming',
        expect.objectContaining({
          memoryMB: 600,
          suggestion: expect.stringContaining('smaller batch sizes'),
        })
      );

      // Restore
      process.memoryUsage = originalMemoryUsage;
    });

    test('should handle batch processing errors gracefully', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      const streamingOptions = { batchSize: 1 };

      mockGit.raw
        .mockResolvedValueOnce('2\n') // getCommitCount call
        .mockRejectedValueOnce(new Error('git log failed')) // First batch fails
        .mockResolvedValueOnce(
          // Second batch succeeds
          'def456|2023-01-02T12:00:00Z|User2|user2@example.com|Commit 2'
        );

      // Act
      const batches = [];
      for await (const batch of gitService.getCommitsStream(
        localRepoPath,
        streamingOptions
      )) {
        batches.push(batch);
      }

      // Assert
      expect(batches).toHaveLength(1); // Only successful batch
      expect(batches[0][0].sha).toBe('def456');
      expect(global.mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing batch'),
        expect.any(Object)
      );
    });
  });

  describe('resume state management', () => {
    test('should save and retrieve resume state', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      const resumeState = {
        lastProcessedSha: 'abc123',
        processedCount: 100,
        totalEstimatedCount: 1000,
        startTime: Date.now(),
      };

      (redis.get as any).mockResolvedValue(JSON.stringify(resumeState));

      // Act
      const retrieved = await gitService.getStreamingResumeState(localRepoPath);

      // Assert
      expect(retrieved).toEqual(resumeState);
      expect(redis.get).toHaveBeenCalledWith(`stream_resume:${localRepoPath}`);
    });

    test('should clear resume state', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';

      // Act
      await gitService.clearStreamingResumeState(localRepoPath);

      // Assert
      expect(redis.del).toHaveBeenCalledWith(`stream_resume:${localRepoPath}`);
    });

    test('should handle missing resume state', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      (redis.get as any).mockResolvedValue(null);

      // Act
      const retrieved = await gitService.getStreamingResumeState(localRepoPath);

      // Assert
      expect(retrieved).toBeNull();
    });

    test('should handle resume state errors gracefully', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      (redis.get as any).mockRejectedValue(new Error('Redis error'));

      // Act
      const retrieved = await gitService.getStreamingResumeState(localRepoPath);

      // Assert
      expect(retrieved).toBeNull();
      expect(global.mockLogger.warn).toHaveBeenCalledWith(
        'Failed to get resume state',
        expect.any(Object)
      );
    });
  });

  describe('integration with existing getCommits method', () => {
    test('should use original method for small repositories', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw
        .mockResolvedValueOnce('1000\n') // Below threshold
        .mockResolvedValueOnce(
          // Original getCommits call
          'abc123|2023-01-01T12:00:00Z|User1|user1@example.com|Commit 1'
        );

      config.streaming.enabled = true;
      config.streaming.commitThreshold = 50000;

      // Act
      const commits = await gitService.getCommits(localRepoPath);

      // Assert
      expect(commits).toHaveLength(1);
      expect(commits[0].sha).toBe('abc123');
      expect(global.mockLogger.info).toHaveBeenCalledWith(
        'Using original getCommits for small repository'
      );
    });

    test('should use streaming for large repositories', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      mockGit.raw
        .mockResolvedValueOnce('60000\n') // Above threshold - shouldUseStreaming check
        .mockResolvedValueOnce('60000\n') // getCommitCount in streaming
        .mockResolvedValueOnce(
          // First streaming batch
          'abc123|2023-01-01T12:00:00Z|User1|user1@example.com|Commit 1'
        );

      config.streaming.enabled = true;
      config.streaming.commitThreshold = 50000;
      config.streaming.batchSize = 1;

      // Act
      const commits = await gitService.getCommits(localRepoPath);

      // Assert
      expect(commits).toHaveLength(1);
      expect(commits[0].sha).toBe('abc123');
      expect(global.mockLogger.info).toHaveBeenCalledWith(
        'Using streaming getCommits for large repository'
      );
    });

    test('should respect pagination options and use original method', async () => {
      // Arrange
      const localRepoPath = '/tmp/test-repo';
      const options = { skip: 10, limit: 5 };

      mockGit.raw.mockResolvedValue(
        'abc123|2023-01-01T12:00:00Z|User1|user1@example.com|Commit 1'
      );

      // Act
      const commits = await gitService.getCommits(localRepoPath, options);

      // Assert
      expect(commits).toHaveLength(1);
      expect(mockGit.raw).toHaveBeenCalledWith([
        'log',
        '--pretty=format:%H|%cI|%an|%ae|%s',
        '--skip=10',
        '-n',
        '5',
      ]);
    });
  });
});
