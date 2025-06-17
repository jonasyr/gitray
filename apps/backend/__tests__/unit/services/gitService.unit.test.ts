import { describe, expect, beforeEach, vi, test } from 'vitest';
import { gitService } from '../../../src/services/gitService';
import simpleGit from 'simple-git';
import { mkdtemp, rm } from 'fs/promises';
import { config } from '../../../src/config';
import redis from '../../../src/services/cache';
import * as memoryManager from '../../../src/utils/memoryPressureManager';

// Mock external dependencies only - not our business logic
vi.mock('simple-git');
vi.mock('fs/promises');
vi.mock('../../../src/services/cache');
vi.mock('../../../src/utils/memoryPressureManager');
vi.mock('../../../src/services/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock('../../../src/services/metrics', () => ({
  recordStreamingStart: vi.fn(),
  recordStreamingCompletion: vi.fn(),
  recordStreamingBatch: vi.fn(),
  recordStreamingError: vi.fn(),
  recordEnhancedCacheOperation: vi.fn(),
  recordDetailedError: vi.fn(),
  updateServiceHealthScore: vi.fn(),
  getRepositoryType: vi.fn(() => 'public'),
}));

describe('GitService Unit Tests', () => {
  const mockGit = {
    clone: vi.fn(),
    raw: vi.fn(),
  };

  const mockMemoryStats = {
    system: {
      free: 1024 * 1024 * 1024,
      total: 4 * 1024 * 1024 * 1024,
      usagePercentage: 0.25,
    },
    process: {
      heapUsed: 100 * 1024 * 1024,
      heapTotal: 200 * 1024 * 1024,
      rss: 150 * 1024 * 1024,
    },
    pressure: { level: 'normal', factor: 0.0 },
    gc: { forced: 0, full: 0 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mockGit methods
    mockGit.raw.mockReset();

    // Mock simpleGit to return the same mockGit instance for any path
    (simpleGit as any).mockImplementation(() => mockGit);
    (mkdtemp as any).mockResolvedValue('/tmp/test-repo');
    (rm as any).mockResolvedValue(undefined);
    (redis.get as any).mockResolvedValue(null);
    (redis.set as any).mockResolvedValue('OK');
    (redis.del as any).mockResolvedValue(1);
    (memoryManager.getMemoryStats as any).mockReturnValue(mockMemoryStats);
    (memoryManager.executeWithMemoryProtection as any).mockImplementation(
      async (_: any, fn: () => Promise<any>) => fn()
    );

    // Reset config to defaults
    config.streaming = {
      enabled: true,
      commitThreshold: 1000,
      batchSize: 1000,
    };
    config.git = { maxConcurrentProcesses: 1, cloneDepth: 50 };
  });

  describe('getCommitCount', () => {
    test('should parse valid commit count output correctly', async () => {
      // Arrange
      mockGit.raw.mockResolvedValue('42\n');

      // Act
      const count = await gitService.getCommitCount('/test/repo');

      // Assert
      expect(count).toBe(42);
      expect(mockGit.raw).toHaveBeenCalledWith(['rev-list', '--count', 'HEAD']);
    });

    test('should handle commit count with extra whitespace', async () => {
      // Arrange
      mockGit.raw.mockResolvedValue('  123  \n\n');

      // Act
      const count = await gitService.getCommitCount('/test/repo');

      // Assert
      expect(count).toBe(123);
    });

    test('should throw error when git raw fails', async () => {
      // Arrange
      const gitError = new Error('Git command failed');
      mockGit.raw.mockRejectedValue(gitError);

      // Act & Assert
      await expect(gitService.getCommitCount('/test/repo')).rejects.toThrow(
        'Failed to fetch commits from repository'
      );
    });

    test('should throw error when count output is invalid', async () => {
      // Arrange
      mockGit.raw.mockResolvedValue('not-a-number\n');

      // Act & Assert
      await expect(gitService.getCommitCount('/test/repo')).rejects.toThrow(
        'Failed to fetch commits from repository'
      );
    });

    test('should throw error when count output is empty', async () => {
      // Arrange
      mockGit.raw.mockResolvedValue('');

      // Act & Assert
      await expect(gitService.getCommitCount('/test/repo')).rejects.toThrow(
        'Failed to fetch commits from repository'
      );
    });
  });

  describe('shouldUseStreaming', () => {
    test('should return false when streaming is disabled in config', async () => {
      // Arrange
      config.streaming.enabled = false;
      mockGit.raw.mockResolvedValue('2000\n'); // Above threshold but disabled

      // Act
      const result = await gitService.shouldUseStreaming('/test/repo');

      // Assert
      expect(result).toBe(false);
      expect(mockGit.raw).not.toHaveBeenCalled(); // Should not check count when disabled
    });

    test('should return true when memory pressure is warning level', async () => {
      // Arrange
      config.streaming.enabled = true;
      config.streaming.commitThreshold = 1000;
      const warningMemoryStats = {
        ...mockMemoryStats,
        pressure: { level: 'warning', factor: 0.7 },
      };
      (memoryManager.getMemoryStats as any).mockReturnValue(warningMemoryStats);

      // Act
      const result = await gitService.shouldUseStreaming('/test/repo');

      // Assert
      expect(result).toBe(true);
      expect(mockGit.raw).not.toHaveBeenCalled(); // Should force streaming without checking count
    });

    test('should return true when memory pressure is critical level', async () => {
      // Arrange
      config.streaming.enabled = true;
      const criticalMemoryStats = {
        ...mockMemoryStats,
        pressure: { level: 'critical', factor: 0.9 },
      };
      (memoryManager.getMemoryStats as any).mockReturnValue(
        criticalMemoryStats
      );

      // Act
      const result = await gitService.shouldUseStreaming('/test/repo');

      // Assert
      expect(result).toBe(true);
    });

    test('should return true when memory pressure is emergency level', async () => {
      // Arrange
      config.streaming.enabled = true;
      const emergencyMemoryStats = {
        ...mockMemoryStats,
        pressure: { level: 'emergency', factor: 1.0 },
      };
      (memoryManager.getMemoryStats as any).mockReturnValue(
        emergencyMemoryStats
      );

      // Act
      const result = await gitService.shouldUseStreaming('/test/repo');

      // Assert
      expect(result).toBe(true);
    });

    test('should return true when commit count exceeds threshold', async () => {
      // Arrange
      config.streaming.enabled = true;
      config.streaming.commitThreshold = 1000;
      mockGit.raw.mockResolvedValue('1500\n'); // Above threshold

      // Act
      const result = await gitService.shouldUseStreaming('/test/repo');

      // Assert
      expect(result).toBe(true);
      expect(mockGit.raw).toHaveBeenCalledWith(['rev-list', '--count', 'HEAD']);
    });

    test('should return false when commit count is below threshold', async () => {
      // Arrange
      config.streaming.enabled = true;
      config.streaming.commitThreshold = 1000;
      mockGit.raw.mockResolvedValue('500\n'); // Below threshold

      // Act
      const result = await gitService.shouldUseStreaming('/test/repo');

      // Assert
      expect(result).toBe(false);
    });

    test('should return false when getCommitCount fails', async () => {
      // Arrange
      config.streaming.enabled = true;
      mockGit.raw.mockRejectedValue(new Error('Git failed'));

      // Act
      const result = await gitService.shouldUseStreaming('/test/repo');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('cloneRepository', () => {
    test('should successfully clone repository and return temp directory', async () => {
      // Arrange
      const repoUrl = 'https://github.com/user/repo.git';
      mockGit.clone = vi.fn().mockResolvedValue(undefined);

      // Act
      const result = await gitService.cloneRepository(repoUrl);

      // Assert
      expect(result).toBe('/tmp/test-repo');
      expect(mkdtemp).toHaveBeenCalled();
      expect(mockGit.clone).toHaveBeenCalled();
    });

    test('should cleanup temp directory when clone fails', async () => {
      // Arrange
      const repoUrl = 'https://github.com/user/repo.git';
      const cloneError = new Error('Clone failed');
      mockGit.clone = vi.fn().mockRejectedValue(cloneError);

      // Act & Assert
      await expect(gitService.cloneRepository(repoUrl)).rejects.toThrow(
        'Failed to clone repository'
      );
      expect(rm).toHaveBeenCalledWith('/tmp/test-repo', {
        recursive: true,
        force: true,
      });
    });

    test('should handle cleanup failure after clone failure', async () => {
      // Arrange
      const repoUrl = 'https://github.com/user/repo.git';
      mockGit.clone = vi.fn().mockRejectedValue(new Error('Clone failed'));
      (rm as any).mockRejectedValue(new Error('Cleanup failed'));

      // Act & Assert
      await expect(gitService.cloneRepository(repoUrl)).rejects.toThrow(
        'Failed to clone repository'
      );
      expect(rm).toHaveBeenCalled();
    });
  });

  describe('getCommits - routing logic', () => {
    test('should use original method when pagination options provided', async () => {
      // Arrange
      const validCommitOutput =
        'abc123|2023-01-01T12:00:00Z|User|user@example.com|Test commit';
      mockGit.raw.mockResolvedValue(validCommitOutput);

      // Act
      const result = await gitService.getCommits('/test/repo', {
        skip: 10,
        limit: 5,
      });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].sha).toBe('abc123');
      expect(mockGit.raw).toHaveBeenCalledWith([
        'log',
        '--pretty=format:%H|%cI|%an|%ae|%s',
        '--skip=10',
        '-n',
        '5',
      ]);
    });

    test('should use original method for small repositories', async () => {
      // Arrange
      config.streaming.enabled = true;
      config.streaming.commitThreshold = 1000;
      mockGit.raw
        .mockResolvedValueOnce('500\n') // Below threshold
        .mockResolvedValueOnce(
          'abc123|2023-01-01T12:00:00Z|User|user@example.com|Test commit'
        );

      // Act
      const result = await gitService.getCommits('/test/repo');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].sha).toBe('abc123');
    });

    test('should force streaming when memory pressure is high', async () => {
      // Arrange
      config.streaming.enabled = true;
      config.streaming.commitThreshold = 1000;
      const warningMemoryStats = {
        ...mockMemoryStats,
        pressure: { level: 'warning', factor: 0.7 },
      };
      (memoryManager.getMemoryStats as any).mockReturnValue(warningMemoryStats);

      // Mock streaming behavior - first call for count, second for log batch
      mockGit.raw
        .mockResolvedValueOnce('1\n') // rev-list --count HEAD (1 commit total)
        .mockResolvedValueOnce(
          'abc123|2023-01-01T12:00:00Z|User|user@example.com|Test commit'
        ); // log command

      // Act
      const result = await gitService.getCommits('/test/repo');

      // Assert
      expect(result).toHaveLength(1);
    });
  });

  describe('getCommits - data parsing logic', () => {
    test('should parse valid commit data correctly', async () => {
      // Arrange
      const commitData = [
        'abc123|2023-01-01T12:00:00Z|Alice|alice@example.com|Initial commit',
        'def456|2023-01-02T14:00:00Z|Bob|bob@example.com|Add feature',
      ].join('\n');
      mockGit.raw.mockResolvedValue(commitData);

      // Act
      const result = await gitService.getCommits('/test/repo', { limit: 10 });

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        sha: 'abc123',
        message: 'Initial commit',
        date: '2023-01-01T12:00:00Z',
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
      });
      expect(result[1]).toEqual({
        sha: 'def456',
        message: 'Add feature',
        date: '2023-01-02T14:00:00Z',
        authorName: 'Bob',
        authorEmail: 'bob@example.com',
      });
    });

    test('should handle commit messages with pipe characters', async () => {
      // Arrange
      const commitData =
        'abc123|2023-01-01T12:00:00Z|Alice|alice@example.com|feat: use A | B | C pattern';
      mockGit.raw.mockResolvedValue(commitData);

      // Act
      const result = await gitService.getCommits('/test/repo', { limit: 1 });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].message).toBe('feat: use A | B | C pattern');
    });

    test('should filter out commits with missing required fields', async () => {
      // Arrange
      const commitData = [
        'abc123|2023-01-01T12:00:00Z|Alice|alice@example.com|Valid commit',
        'def456|2023-01-02T14:00:00Z||bob@example.com|Missing author name',
        'ghi789|2023-01-03T15:00:00Z|Charlie|charlie@example.com|', // Missing message
        '||||||', // All missing
        'jkl012|2023-01-04T16:00:00Z|Dave|dave@example.com|Another valid commit',
      ].join('\n');
      mockGit.raw.mockResolvedValue(commitData);

      // Act
      const result = await gitService.getCommits('/test/repo', { limit: 10 });

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].sha).toBe('abc123');
      expect(result[1].sha).toBe('jkl012');
    });

    test('should handle empty git output', async () => {
      // Arrange
      mockGit.raw.mockResolvedValue('');

      // Act
      const result = await gitService.getCommits('/test/repo', { limit: 10 });

      // Assert
      expect(result).toHaveLength(0);
    });

    test('should handle git output with only empty lines', async () => {
      // Arrange
      mockGit.raw.mockResolvedValue('\n\n\n');

      // Act
      const result = await gitService.getCommits('/test/repo', { limit: 10 });

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('getCommits - error handling', () => {
    test('should throw RepositoryError when git command fails', async () => {
      // Arrange
      const gitError = new Error('Git command failed');
      mockGit.raw.mockRejectedValue(gitError);

      // Act & Assert
      await expect(
        gitService.getCommits('/test/repo', { limit: 10 })
      ).rejects.toThrow('Failed to fetch commits from repository');
    });

    test('should wrap non-Error exceptions in RepositoryError', async () => {
      // Arrange
      mockGit.raw.mockRejectedValue('String error');

      // Act & Assert
      await expect(
        gitService.getCommits('/test/repo', { limit: 10 })
      ).rejects.toThrow('Failed to fetch commits from repository');
    });
  });

  describe('cleanupRepository', () => {
    test('should successfully remove repository directory', async () => {
      // Arrange
      const repoPath = '/tmp/test-repo';

      // Act
      await gitService.cleanupRepository(repoPath);

      // Assert
      expect(rm).toHaveBeenCalledWith(repoPath, {
        recursive: true,
        force: true,
      });
    });

    test('should throw RepositoryError when cleanup fails', async () => {
      // Arrange
      const repoPath = '/tmp/test-repo';
      const cleanupError = new Error('Permission denied');
      (rm as any).mockRejectedValue(cleanupError);

      // Act & Assert
      await expect(gitService.cleanupRepository(repoPath)).rejects.toThrow(
        'Failed to clean up repository directory'
      );
    });
  });

  describe('streaming resume state management', () => {
    test('should return null when no resume state exists', async () => {
      // Arrange
      (redis.get as any).mockResolvedValue(null);

      // Act
      const result = await gitService.getStreamingResumeState('/test/repo');

      // Assert
      expect(result).toBeNull();
      expect(redis.get).toHaveBeenCalledWith('stream_resume:/test/repo');
    });

    test('should parse and return valid resume state', async () => {
      // Arrange
      const resumeState = {
        lastProcessedSha: 'abc123',
        processedCount: 100,
        totalEstimatedCount: 1000,
        startTime: 1234567890,
      };
      (redis.get as any).mockResolvedValue(JSON.stringify(resumeState));

      // Act
      const result = await gitService.getStreamingResumeState('/test/repo');

      // Assert
      expect(result).toEqual(resumeState);
    });

    test('should return null when redis get fails', async () => {
      // Arrange
      (redis.get as any).mockRejectedValue(new Error('Redis error'));

      // Act
      const result = await gitService.getStreamingResumeState('/test/repo');

      // Assert
      expect(result).toBeNull();
    });

    test('should successfully clear resume state', async () => {
      // Arrange - nothing special needed

      // Act
      await gitService.clearStreamingResumeState('/test/repo');

      // Assert
      expect(redis.del).toHaveBeenCalledWith('stream_resume:/test/repo');
    });

    test('should handle redis delete failure gracefully', async () => {
      // Arrange
      (redis.del as any).mockRejectedValue(new Error('Redis error'));

      // Act - should not throw
      await gitService.clearStreamingResumeState('/test/repo');

      // Assert
      expect(redis.del).toHaveBeenCalled();
    });
  });

  describe('memory pressure batch size adjustments', () => {
    test('should use original batch size under normal memory pressure', async () => {
      // Arrange
      config.streaming.enabled = true;
      config.streaming.commitThreshold = 100;
      config.streaming.batchSize = 1000;

      // Create a small set of commit data for the test
      const commitData =
        'commit0|2023-01-01T12:00:00Z|User0|user0@example.com|Test commit 0\ncommit1|2023-01-01T12:00:00Z|User1|user1@example.com|Test commit 1';

      mockGit.raw
        .mockResolvedValueOnce('2\n') // rev-list --count HEAD (above threshold, triggers streaming)
        .mockResolvedValueOnce(commitData); // log command returns commits

      // Act
      const result = await gitService.getCommits('/test/repo');

      // Assert - The method should proceed with normal batch size
      expect(memoryManager.getMemoryStats).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    test('should adjust batch size under warning memory pressure', async () => {
      // Arrange
      config.streaming.enabled = true;
      config.streaming.commitThreshold = 100;
      config.streaming.batchSize = 1000;
      const warningMemoryStats = {
        ...mockMemoryStats,
        pressure: { level: 'warning', factor: 0.7 },
      };
      (memoryManager.getMemoryStats as any).mockReturnValue(warningMemoryStats);
      mockGit.raw
        .mockResolvedValueOnce('200\n') // Above threshold
        .mockResolvedValueOnce(
          'abc123|2023-01-01T12:00:00Z|User|user@example.com|Test commit'
        );

      // Act
      await gitService.getCommits('/test/repo');

      // Assert - Should use reduced batch size (tested via memory manager call)
      expect(memoryManager.getMemoryStats).toHaveBeenCalled();
    });

    test('should use minimum batch size under emergency memory pressure', async () => {
      // Arrange
      config.streaming.enabled = true;
      config.streaming.commitThreshold = 100;
      const emergencyMemoryStats = {
        ...mockMemoryStats,
        pressure: { level: 'emergency', factor: 1.0 },
      };
      (memoryManager.getMemoryStats as any).mockReturnValue(
        emergencyMemoryStats
      );
      mockGit.raw
        .mockResolvedValueOnce('200\n') // rev-list --count HEAD (above threshold, triggers streaming)
        .mockResolvedValueOnce(
          'abc123|2023-01-01T12:00:00Z|User|user@example.com|Test commit'
        ); // log command (won't be reached due to emergency pressure)

      // Act & Assert - Should throw due to emergency memory pressure
      await expect(gitService.getCommits('/test/repo')).rejects.toThrow(
        'Streaming stopped due to emergency memory pressure'
      );
      expect(memoryManager.getMemoryStats).toHaveBeenCalled();
    });
  });

  describe('configuration edge cases', () => {
    test('should handle undefined streaming config gracefully', async () => {
      // Arrange
      (config as any).streaming = undefined;
      mockGit.raw.mockResolvedValue(
        'abc123|2023-01-01T12:00:00Z|User|user@example.com|Test'
      );

      // Act & Assert - should not throw
      const result = await gitService.getCommits('/test/repo', { limit: 1 });
      expect(result).toHaveLength(1);
    });

    test('should handle zero commit threshold', async () => {
      // Arrange
      config.streaming.enabled = true;
      config.streaming.commitThreshold = 0;
      mockGit.raw
        .mockResolvedValueOnce('1\n') // Any count should trigger streaming
        .mockResolvedValueOnce(
          'abc123|2023-01-01T12:00:00Z|User|user@example.com|Test'
        );

      // Act
      const shouldStream = await gitService.shouldUseStreaming('/test/repo');

      // Assert
      expect(shouldStream).toBe(true);
    });

    test('should handle negative commit threshold', async () => {
      // Arrange
      config.streaming.enabled = true;
      config.streaming.commitThreshold = -100;
      // Ensure normal memory pressure so the test checks commit count logic
      const normalMemoryStats = {
        ...mockMemoryStats,
        pressure: { level: 'normal', factor: 0.0 },
      };
      (memoryManager.getMemoryStats as any).mockReturnValue(normalMemoryStats);

      // Clear any previous mocks and set up fresh mock
      mockGit.raw.mockClear();
      mockGit.raw.mockResolvedValueOnce('1\n'); // commit count

      // Act
      const shouldStream = await gitService.shouldUseStreaming('/test/repo');

      // Assert
      expect(shouldStream).toBe(true); // Any positive count > negative threshold
    });
  });
});
