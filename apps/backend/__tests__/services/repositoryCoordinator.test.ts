import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { repositoryCoordinator } from '../../src/services/repositoryCoordinator';
import { gitService } from '../../src/services/gitService';

// Mock dependencies
vi.mock('../../src/services/gitService', () => ({
  gitService: {
    cloneRepository: vi.fn(),
    getCommits: vi.fn(),
    cleanupRepository: vi.fn(),
    getCommitCount: vi.fn(),
  },
}));

vi.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: global.mockLogger,
  getLogger: global.getLogger,
}));

vi.mock('../../src/utils/lockManager', () => ({
  withKeyLock: vi.fn((key: string, fn: () => Promise<any>) => fn()),
}));

vi.mock('../../src/config', () => ({
  config: {
    coordination: {
      cacheEvictionIntervalMs: 60000,
      maxCachedRepositories: 10,
      repositoryTtlMs: 3600000,
    },
  },
}));

vi.mock('../../src/services/metrics', () => ({
  recordStreamingStart: vi.fn(),
  getRepositorySizeCategory: vi.fn().mockReturnValue('medium'),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  rm: vi.fn(),
  access: vi.fn().mockResolvedValue(true), // Always return success for access checks
  mkdtemp: vi.fn().mockResolvedValue('/tmp/test-repo-123'),
}));

const mockGitService = gitService as any;

describe('RepositoryCoordinator - Caching & Concurrency Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mock implementations to ensure clean state
    mockGitService.cloneRepository.mockReset();
    mockGitService.getCommitCount.mockReset();
    mockGitService.cleanupRepository.mockReset();
  });

  afterEach(async () => {
    await repositoryCoordinator.shutdown();
  });

  describe('Cache Management', () => {
    test('should cache repository handles to prevent duplicate clones', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      const mockLocalPath = '/tmp/repo-1';
      const mockCommitCount = 100;

      mockGitService.cloneRepository.mockResolvedValue(mockLocalPath);
      mockGitService.getCommitCount.mockResolvedValue(mockCommitCount);

      // Act - Call getSharedRepository twice
      const handle1 = await repositoryCoordinator.getSharedRepository(repoUrl);
      const handle2 = await repositoryCoordinator.getSharedRepository(repoUrl);

      // Assert
      expect(handle1).toBe(handle2); // Same handle instance
      expect(handle1.localPath).toBe(mockLocalPath);
      expect(handle1.commitCount).toBe(mockCommitCount);
      expect(handle1.repoUrl).toBe(repoUrl);
      expect(handle1.isShared).toBe(true);
      expect(handle1.refCount).toBe(2);

      // Clone should only be called once
      expect(mockGitService.cloneRepository).toHaveBeenCalledTimes(1);
      expect(mockGitService.getCommitCount).toHaveBeenCalledTimes(1);
    });

    test('should handle concurrent requests for same repository', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      const mockLocalPath = '/tmp/repo-1';
      const mockCommitCount = 50;

      mockGitService.cloneRepository.mockResolvedValue(mockLocalPath);
      mockGitService.getCommitCount.mockResolvedValue(mockCommitCount);

      // Act - Simulate concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        repositoryCoordinator.getSharedRepository(repoUrl)
      );
      const handles = await Promise.all(promises);

      // Assert
      // All handles should be identical
      const firstHandle = handles[0];
      handles.forEach((handle) => {
        expect(handle).toBe(firstHandle);
        expect(handle.refCount).toBe(5);
        expect(handle.isShared).toBe(true);
      });

      // Clone should only be called once despite concurrent requests
      expect(mockGitService.cloneRepository).toHaveBeenCalledTimes(1);
      expect(mockGitService.getCommitCount).toHaveBeenCalledTimes(1);
    });

    test('should provide cache hit metrics', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);

      // Act
      await repositoryCoordinator.getSharedRepository(repoUrl); // Cache miss
      await repositoryCoordinator.getSharedRepository(repoUrl); // Cache hit
      await repositoryCoordinator.getSharedRepository(repoUrl); // Cache hit

      const metrics = repositoryCoordinator.getMetrics();

      // Assert
      expect(metrics.cacheHits).toBe(2);
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.duplicateClonesPrevented).toBe(2);
      expect(metrics.cachedRepositories).toBe(1);
    });

    test('should cache different repositories separately', async () => {
      // Arrange
      const repoUrl1 = 'https://github.com/test/repo1.git';
      const repoUrl2 = 'https://github.com/test/repo2.git';

      mockGitService.cloneRepository
        .mockResolvedValueOnce('/tmp/repo-1')
        .mockResolvedValueOnce('/tmp/repo-2');
      mockGitService.getCommitCount
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(200);

      // Act
      const handle1 = await repositoryCoordinator.getSharedRepository(repoUrl1);
      const handle2 = await repositoryCoordinator.getSharedRepository(repoUrl2);

      // Assert
      expect(handle1).not.toBe(handle2);
      expect(handle1.localPath).toBe('/tmp/repo-1');
      expect(handle2.localPath).toBe('/tmp/repo-2');
      expect(handle1.commitCount).toBe(100);
      expect(handle2.commitCount).toBe(200);

      expect(mockGitService.cloneRepository).toHaveBeenCalledTimes(2);
      expect(mockGitService.getCommitCount).toHaveBeenCalledTimes(2);

      const metrics = repositoryCoordinator.getMetrics();
      expect(metrics.cachedRepositories).toBe(2);
      expect(metrics.cacheMisses).toBe(2);
      expect(metrics.cacheHits).toBe(0);
    });
  });

  describe('Reference Counting & Cleanup', () => {
    test('should increment reference count correctly', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);

      // Act
      const handle1 = await repositoryCoordinator.getSharedRepository(repoUrl);
      const handle2 = await repositoryCoordinator.getSharedRepository(repoUrl);
      const handle3 = await repositoryCoordinator.getSharedRepository(repoUrl);

      // Assert
      expect(handle1.refCount).toBe(3);
      expect(handle2.refCount).toBe(3);
      expect(handle3.refCount).toBe(3);
      expect(handle1).toBe(handle2);
      expect(handle2).toBe(handle3);
    });

    test('should decrement reference count on release', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);
      mockGitService.cleanupRepository.mockResolvedValue(undefined);

      const handle1 = await repositoryCoordinator.getSharedRepository(repoUrl);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const handle2 = await repositoryCoordinator.getSharedRepository(repoUrl);

      expect(handle1.refCount).toBe(2);

      // Act
      await repositoryCoordinator.releaseRepository(repoUrl);

      // Assert
      expect(handle1.refCount).toBe(1);
      expect(mockGitService.cleanupRepository).not.toHaveBeenCalled();
    });

    test('should cleanup repository when reference count reaches zero', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);
      mockGitService.cleanupRepository.mockResolvedValue(undefined);

      const handle = await repositoryCoordinator.getSharedRepository(repoUrl);
      expect(handle.refCount).toBe(1);

      // Act
      await repositoryCoordinator.releaseRepository(repoUrl);

      // Assert
      expect(mockGitService.cleanupRepository).toHaveBeenCalledWith(
        '/tmp/repo-1'
      );

      const metrics = repositoryCoordinator.getMetrics();
      expect(metrics.cachedRepositories).toBe(0);
    });

    test('should handle multiple releases correctly', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);
      mockGitService.cleanupRepository.mockResolvedValue(undefined);

      // Get 3 references
      await repositoryCoordinator.getSharedRepository(repoUrl);
      await repositoryCoordinator.getSharedRepository(repoUrl);
      const handle = await repositoryCoordinator.getSharedRepository(repoUrl);

      expect(handle.refCount).toBe(3);

      // Act - Release twice
      await repositoryCoordinator.releaseRepository(repoUrl);
      expect(handle.refCount).toBe(2);
      expect(mockGitService.cleanupRepository).not.toHaveBeenCalled();

      await repositoryCoordinator.releaseRepository(repoUrl);
      expect(handle.refCount).toBe(1);
      expect(mockGitService.cleanupRepository).not.toHaveBeenCalled();

      // Final release should trigger cleanup
      await repositoryCoordinator.releaseRepository(repoUrl);
      expect(mockGitService.cleanupRepository).toHaveBeenCalledWith(
        '/tmp/repo-1'
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle clone failures gracefully', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/invalid-repo.git';
      const cloneError = new Error('Repository not found');
      mockGitService.cloneRepository.mockRejectedValue(cloneError);

      // Act & Assert
      await expect(
        repositoryCoordinator.getSharedRepository(repoUrl)
      ).rejects.toThrow('Repository not found');

      // Should not cache failed attempts
      const metrics = repositoryCoordinator.getMetrics();
      expect(metrics.cachedRepositories).toBe(0);
      expect(metrics.cacheMisses).toBe(1);
    });

    test('should handle commit count failures gracefully', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockRejectedValue(
        new Error('Cannot count commits')
      );
      mockGitService.cleanupRepository.mockResolvedValue(undefined);

      // Act & Assert
      await expect(
        repositoryCoordinator.getSharedRepository(repoUrl)
      ).rejects.toThrow('Cannot count commits');

      // Should cleanup on failure
      expect(mockGitService.cleanupRepository).toHaveBeenCalledWith(
        '/tmp/repo-1'
      );

      const metrics = repositoryCoordinator.getMetrics();
      expect(metrics.cachedRepositories).toBe(0);
    });

    test('should handle cleanup failures gracefully', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);
      mockGitService.cleanupRepository.mockRejectedValue(
        new Error('Cleanup failed')
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const handle = await repositoryCoordinator.getSharedRepository(repoUrl);

      // Act - Release should not throw even if cleanup fails
      await expect(
        repositoryCoordinator.releaseRepository(repoUrl)
      ).resolves.not.toThrow();

      // Should still remove from cache despite cleanup failure
      const metrics = repositoryCoordinator.getMetrics();
      expect(metrics.cachedRepositories).toBe(0);
      expect(global.mockLogger.error).toHaveBeenCalledWith(
        'Failed to cleanup repository',
        expect.objectContaining({
          repoUrl,
          localPath: '/tmp/repo-1',
          error: 'Cleanup failed',
        })
      );
    });
  });

  describe('Repository Operations', () => {
    test('should execute repository operations safely', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);
      mockGitService.cleanupRepository.mockResolvedValue(undefined);

      const mockOperation = vi.fn().mockResolvedValue('operation result');

      // Act
      const result = await repositoryCoordinator.withRepository(
        repoUrl,
        mockOperation
      );

      // Assert
      expect(result).toBe('operation result');
      expect(mockOperation).toHaveBeenCalledWith('/tmp/repo-1');

      // Repository should be cleaned up after operation
      expect(mockGitService.cleanupRepository).toHaveBeenCalledWith(
        '/tmp/repo-1'
      );
    });

    test('should handle operation errors and still cleanup', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);
      mockGitService.cleanupRepository.mockResolvedValue(undefined);

      const operationError = new Error('Operation failed');
      const mockOperation = vi.fn().mockRejectedValue(operationError);

      // Act & Assert
      await expect(
        repositoryCoordinator.withRepository(repoUrl, mockOperation)
      ).rejects.toThrow('Operation failed');

      // Repository should still be cleaned up
      expect(mockGitService.cleanupRepository).toHaveBeenCalledWith(
        '/tmp/repo-1'
      );
    });

    test('should share repository during overlapping operations', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);
      mockGitService.cleanupRepository.mockResolvedValue(undefined);

      let operationResolve1: (value: any) => void;
      let operationResolve2: (value: any) => void;

      const operation1 = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          operationResolve1 = resolve;
        });
      });

      const operation2 = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          operationResolve2 = resolve;
        });
      });

      // Act - Start operations concurrently
      const promise1 = repositoryCoordinator.withRepository(
        repoUrl,
        operation1
      );
      const promise2 = repositoryCoordinator.withRepository(
        repoUrl,
        operation2
      );

      // Let operations complete
      setTimeout(() => {
        operationResolve1('result1');
        operationResolve2('result2');
      }, 10);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Assert
      expect(result1).toBe('result1');
      expect(result2).toBe('result2');

      // Should only clone once
      expect(mockGitService.cloneRepository).toHaveBeenCalledTimes(1);

      // Both operations should use same path
      expect(operation1).toHaveBeenCalledWith('/tmp/repo-1');
      expect(operation2).toHaveBeenCalledWith('/tmp/repo-1');

      // Should cleanup once after both operations complete
      expect(mockGitService.cleanupRepository).toHaveBeenCalledTimes(1);
      expect(mockGitService.cleanupRepository).toHaveBeenCalledWith(
        '/tmp/repo-1'
      );
    });
  });

  describe('Performance Metrics', () => {
    test('should track coordination metrics accurately', async () => {
      // Arrange
      const repoUrl1 = 'https://github.com/test/repo1.git';
      const repoUrl2 = 'https://github.com/test/repo2.git';

      mockGitService.cloneRepository
        .mockResolvedValueOnce('/tmp/repo-1')
        .mockResolvedValueOnce('/tmp/repo-2');
      mockGitService.getCommitCount
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(200);

      // Act - Various operations to generate metrics
      await repositoryCoordinator.getSharedRepository(repoUrl1); // Miss
      await repositoryCoordinator.getSharedRepository(repoUrl1); // Hit
      await repositoryCoordinator.getSharedRepository(repoUrl1); // Hit

      await repositoryCoordinator.getSharedRepository(repoUrl2); // Miss
      await repositoryCoordinator.getSharedRepository(repoUrl2); // Hit

      const metrics = repositoryCoordinator.getMetrics();

      // Assert
      expect(metrics.cachedRepositories).toBe(2);
      expect(metrics.cacheHits).toBe(3);
      expect(metrics.cacheMisses).toBe(2);
      expect(metrics.duplicateClonesPrevented).toBe(3);
      expect(metrics.activeClones).toBe(0); // No active operations
      expect(metrics.coalescedOperations).toBeGreaterThanOrEqual(0);
    });
  });
});
