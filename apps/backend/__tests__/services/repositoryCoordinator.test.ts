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

  describe('Operation Coordination', () => {
    test('should coordinate operations and coalesce duplicate requests', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      let operationCount = 0;
      const testOperation = vi.fn().mockImplementation(async () => {
        operationCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return `result-${operationCount}`;
      });

      // Act - Start multiple operations of same type concurrently
      const promises = [
        repositoryCoordinator.coordinateOperation(
          repoUrl,
          'test-op',
          testOperation
        ),
        repositoryCoordinator.coordinateOperation(
          repoUrl,
          'test-op',
          testOperation
        ),
        repositoryCoordinator.coordinateOperation(
          repoUrl,
          'test-op',
          testOperation
        ),
      ];

      const results = await Promise.all(promises);

      // Assert - Should coalesce and only run once
      expect(testOperation).toHaveBeenCalledTimes(1);
      expect(results).toEqual(['result-1', 'result-1', 'result-1']);
    });

    test('should handle different operation types independently', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      const operation1 = vi.fn().mockResolvedValue('op1-result');
      const operation2 = vi.fn().mockResolvedValue('op2-result');

      // Act
      const [result1, result2] = await Promise.all([
        repositoryCoordinator.coordinateOperation(repoUrl, 'type1', operation1),
        repositoryCoordinator.coordinateOperation(repoUrl, 'type2', operation2),
      ]);

      // Assert
      expect(operation1).toHaveBeenCalledTimes(1);
      expect(operation2).toHaveBeenCalledTimes(1);
      expect(result1).toBe('op1-result');
      expect(result2).toBe('op2-result');
    });

    test('should handle heatmap operation waiting for commits operation', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      let commitsResolved = false;

      const commitsOperation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        commitsResolved = true;
        return 'commits-result';
      });

      const heatmapOperation = vi.fn().mockImplementation(async () => {
        return `heatmap-result-${commitsResolved}`;
      });

      // Act - Start commits operation first, then heatmap
      const commitsPromise = repositoryCoordinator.coordinateOperation(
        repoUrl,
        'commits',
        commitsOperation
      );
      // Small delay to ensure commits operation starts first
      await new Promise((resolve) => setTimeout(resolve, 10));
      const heatmapPromise = repositoryCoordinator.coordinateOperation(
        repoUrl,
        'heatmap',
        heatmapOperation
      );

      const [commitsResult, heatmapResult] = await Promise.all([
        commitsPromise,
        heatmapPromise,
      ]);

      // Assert
      expect(commitsResult).toBe('commits-result');
      expect(heatmapResult).toBe('heatmap-result-true');
    });

    test('should handle heatmap operation when commits operation fails', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';

      const commitsOperation = vi.fn().mockImplementation(async () => {
        throw new Error('Commits failed');
      });
      const heatmapOperation = vi.fn().mockResolvedValue('heatmap-result');

      // Add a temporary handler for unhandled rejections during this test
      const testHandler = (reason: any) => {
        if (reason?.message === 'Commits failed') {
          // Expected error, ignore it
          return;
        }
        // Re-throw other errors
        throw reason;
      };
      process.on('unhandledRejection', testHandler);

      try {
        // Act - Start commits operation first, then heatmap
        const commitsPromise = repositoryCoordinator.coordinateOperation(
          repoUrl,
          'commits',
          commitsOperation
        );
        // Small delay to ensure commits operation starts first
        await new Promise((resolve) => setTimeout(resolve, 10));
        const heatmapPromise = repositoryCoordinator.coordinateOperation(
          repoUrl,
          'heatmap',
          heatmapOperation
        );

        // Assert - Handle both promises properly to avoid unhandled rejections
        const [commitsResult, heatmapResult] = await Promise.allSettled([
          commitsPromise,
          heatmapPromise,
        ]);

        expect(commitsResult.status).toBe('rejected');
        if (commitsResult.status === 'rejected') {
          expect(commitsResult.reason.message).toBe('Commits failed');
        }
        expect(heatmapResult.status).toBe('fulfilled');
        if (heatmapResult.status === 'fulfilled') {
          expect(heatmapResult.value).toBe('heatmap-result');
        }
      } finally {
        // Restore original handlers
        process.removeListener('unhandledRejection', testHandler);
      }
    });

    test('should disable coalescing when specified', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      let operationCount = 0;
      const testOperation = vi.fn().mockImplementation(async () => {
        return `result-${++operationCount}`;
      });

      // Act - Start operations with coalescing disabled
      const promises = [
        repositoryCoordinator.coordinateOperation(
          repoUrl,
          'test-op',
          testOperation,
          { allowCoalescing: false }
        ),
        repositoryCoordinator.coordinateOperation(
          repoUrl,
          'test-op',
          testOperation,
          { allowCoalescing: false }
        ),
      ];

      const results = await Promise.all(promises);

      // Assert - Should NOT coalesce and run separately
      expect(testOperation).toHaveBeenCalledTimes(2);
      expect(results).toEqual(['result-1', 'result-2']);
    });
  });

  describe('Repository Status and Management', () => {
    test('should provide repository status information', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(500);

      // Act
      await repositoryCoordinator.getSharedRepository(repoUrl);
      const status = repositoryCoordinator.getRepositoryStatus();

      // Assert
      expect(status).toHaveLength(1);
      expect(status[0]).toMatchObject({
        repoUrl,
        commitCount: 500,
        sizeCategory: 'medium',
        refCount: 1,
      });
      expect(status[0].lastAccessed).toBeInstanceOf(Date);
      expect(status[0].age).toBeGreaterThanOrEqual(0);

      // Cleanup
      await repositoryCoordinator.releaseRepository(repoUrl);
    });

    test('should invalidate repository and force cleanup', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);

      await repositoryCoordinator.getSharedRepository(repoUrl);
      expect(repositoryCoordinator.getMetrics().cachedRepositories).toBe(1);

      // Act
      await repositoryCoordinator.invalidateRepository(repoUrl);

      // Assert
      expect(repositoryCoordinator.getMetrics().cachedRepositories).toBe(0);
      expect(mockGitService.cleanupRepository).toHaveBeenCalledWith(
        '/tmp/repo-1'
      );
    });

    test('should handle invalidation of non-existent repository', async () => {
      // Act & Assert - Should not throw
      await expect(
        repositoryCoordinator.invalidateRepository(
          'https://github.com/nonexistent/repo.git'
        )
      ).resolves.toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle clone failures properly', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/failing-repo.git';
      const cloneError = new Error('Clone failed');
      mockGitService.cloneRepository.mockRejectedValue(cloneError);

      // Act & Assert
      await expect(
        repositoryCoordinator.getSharedRepository(repoUrl)
      ).rejects.toThrow('Clone failed');
      expect(repositoryCoordinator.getMetrics().cacheMisses).toBe(1);
      expect(repositoryCoordinator.getMetrics().cachedRepositories).toBe(0);
    });

    test('should handle cleanup failures during clone rollback', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/failing-repo.git';
      const cloneError = new Error('Clone failed');
      mockGitService.cloneRepository.mockResolvedValue('/tmp/failing-repo');
      mockGitService.getCommitCount.mockRejectedValue(cloneError);
      mockGitService.cleanupRepository.mockRejectedValue(
        new Error('Cleanup failed')
      );

      // Act & Assert
      await expect(
        repositoryCoordinator.getSharedRepository(repoUrl)
      ).rejects.toThrow('Clone failed');
    });

    test('should handle release of non-existent repository', async () => {
      // Act & Assert - Should not throw
      await expect(
        repositoryCoordinator.releaseRepository(
          'https://github.com/nonexistent/repo.git'
        )
      ).resolves.toBeUndefined();
    });

    test('should handle cleanup failures gracefully', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);
      mockGitService.cleanupRepository.mockRejectedValue(
        new Error('Cleanup failed')
      );

      await repositoryCoordinator.getSharedRepository(repoUrl);

      // Act
      await repositoryCoordinator.releaseRepository(repoUrl);

      // Assert - Should still remove from internal state despite cleanup failure
      expect(repositoryCoordinator.getMetrics().cachedRepositories).toBe(0);
    });
  });

  describe('Handle Validation', () => {
    test('should detect invalid handles due to missing directory', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);

      // Get initial handle
      await repositoryCoordinator.getSharedRepository(repoUrl);
      await repositoryCoordinator.releaseRepository(repoUrl);

      // Simulate directory disappearing
      const mockAccess = await import('fs/promises');
      vi.mocked(mockAccess.access).mockRejectedValue(
        new Error('Directory not found')
      );

      // Reset for second clone
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-2');

      // Act - Try to get repository again
      const handle2 = await repositoryCoordinator.getSharedRepository(repoUrl);

      // Assert - Should have cloned again
      expect(mockGitService.cloneRepository).toHaveBeenCalledTimes(2);
      expect(handle2.localPath).toBe('/tmp/repo-2');

      // Cleanup
      await repositoryCoordinator.releaseRepository(repoUrl);
    });

    test('should detect expired handles', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);

      // Mock config for short TTL
      vi.doMock('../../src/config', () => ({
        config: {
          repositoryCache: {
            maxAgeHours: 0.001, // Very short TTL
          },
        },
      }));

      await repositoryCoordinator.getSharedRepository(repoUrl);
      await repositoryCoordinator.releaseRepository(repoUrl);

      // Wait for handle to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Reset for second clone
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-2');

      // Act
      await repositoryCoordinator.getSharedRepository(repoUrl);

      // Assert - Should have cloned again due to expiration
      expect(mockGitService.cloneRepository).toHaveBeenCalledTimes(2);

      // Cleanup
      await repositoryCoordinator.releaseRepository(repoUrl);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown coordinator and cleanup all resources', async () => {
      // Arrange
      const repoUrl1 = 'https://github.com/test/repo1.git';
      const repoUrl2 = 'https://github.com/test/repo2.git';

      mockGitService.cloneRepository
        .mockResolvedValueOnce('/tmp/repo-1')
        .mockResolvedValueOnce('/tmp/repo-2');
      mockGitService.getCommitCount
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(200);

      // Create some cached repositories
      await repositoryCoordinator.getSharedRepository(repoUrl1);
      await repositoryCoordinator.getSharedRepository(repoUrl2);

      expect(repositoryCoordinator.getMetrics().cachedRepositories).toBe(2);

      // Act
      await repositoryCoordinator.shutdown();

      // Assert
      expect(repositoryCoordinator.getMetrics().cachedRepositories).toBe(0);
      expect(repositoryCoordinator.getMetrics().cacheHits).toBe(0);
      expect(repositoryCoordinator.getMetrics().cacheMisses).toBe(0);
      // Note: shutdown uses direct rm() instead of gitService.cleanupRepository
      expect(mockGitService.cleanupRepository).toHaveBeenCalledTimes(0);
    });

    test('should handle cleanup failures during shutdown gracefully', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);
      mockGitService.cleanupRepository.mockRejectedValue(
        new Error('Cleanup failed')
      );

      await repositoryCoordinator.getSharedRepository(repoUrl);

      // Act & Assert - Should not throw despite cleanup failure
      await expect(repositoryCoordinator.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('Helper Functions', () => {
    test('withSharedRepository should handle operation and cleanup automatically', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);

      const operation = vi.fn().mockResolvedValue('operation-result');

      // Act
      const result = await repositoryCoordinator.withRepository(
        repoUrl,
        operation
      );

      // Assert
      expect(result).toBe('operation-result');
      expect(operation).toHaveBeenCalledWith('/tmp/repo-1');
      expect(mockGitService.cleanupRepository).toHaveBeenCalledWith(
        '/tmp/repo-1'
      );
    });

    test('withSharedRepository should cleanup even when operation fails', async () => {
      // Arrange
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-1');
      mockGitService.getCommitCount.mockResolvedValue(100);

      const operation = vi
        .fn()
        .mockRejectedValue(new Error('Operation failed'));

      // Act & Assert
      await expect(
        repositoryCoordinator.withRepository(repoUrl, operation)
      ).rejects.toThrow('Operation failed');
      expect(mockGitService.cleanupRepository).toHaveBeenCalledWith(
        '/tmp/repo-1'
      );
    });
  });
});
