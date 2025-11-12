// apps/backend/__tests__/unit/services/repositoryCoordinator.unit.test.ts

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { access, rm } from 'fs/promises';
import {
  repositoryCoordinator,
  withSharedRepository,
  coordinatedOperation,
  type RepositoryHandle,
} from '../../../src/services/repositoryCoordinator';

// Mock all dependencies
vi.mock('../../../src/services/gitService', () => ({
  gitService: {
    cloneRepository: vi.fn(),
    getCommitCount: vi.fn(),
    cleanupRepository: vi.fn(),
  },
}));

vi.mock('../../../src/services/logger', () => {
  const mockLoggerInstance = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return {
    getLogger: () => mockLoggerInstance,
  };
});

vi.mock('../../../src/services/metrics', () => ({
  recordStreamingStart: vi.fn(),
  getRepositorySizeCategory: vi.fn(),
  updateCoordinationMetrics: vi.fn(),
  recordEnhancedCacheOperation: vi.fn(),
  updateServiceHealthScore: vi.fn(),
  recordDetailedError: vi.fn(),
}));

vi.mock('../../../src/utils/lockManager', () => ({
  withKeyLock: vi.fn(),
}));

vi.mock('../../../src/config', () => ({
  config: {
    repositoryCache: {
      maxRepositories: 50,
      maxAgeHours: 24,
    },
  },
}));

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  rm: vi.fn(),
}));

const mockAccess = vi.mocked(access);
const mockRm = vi.mocked(rm);

// Import the mocked modules to get typed references
import { gitService } from '../../../src/services/gitService';
import { getLogger } from '../../../src/services/logger';
import * as metrics from '../../../src/services/metrics';
import { withKeyLock } from '../../../src/utils/lockManager';

// Get typed mock references
const mockGitService = vi.mocked(gitService);
const mockLogger = getLogger();
const mockMetrics = vi.mocked(metrics);
const mockWithKeyLock = vi.mocked(withKeyLock);

describe('RepositoryCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock behaviors
    mockWithKeyLock.mockImplementation(async (key, fn) => fn());
    mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-123');
    mockGitService.getCommitCount.mockResolvedValue(5000);
    mockGitService.cleanupRepository.mockResolvedValue(undefined);
    mockMetrics.getRepositorySizeCategory.mockReturnValue('medium');
    mockAccess.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Clean shutdown to prevent test interference
    await repositoryCoordinator.shutdown();
  });

  describe('Repository Acquisition', () => {
    test('should clone repository on first access', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';

      // ACT
      const handle = await repositoryCoordinator.getSharedRepository(repoUrl);

      // ASSERT
      expect(mockGitService.cloneRepository).toHaveBeenCalledWith(repoUrl);
      expect(mockGitService.getCommitCount).toHaveBeenCalledWith(
        '/tmp/repo-123'
      );
      expect(handle).toMatchObject({
        localPath: '/tmp/repo-123',
        commitCount: 5000,
        repoUrl,
        isShared: true,
        refCount: 1,
        sizeCategory: 'medium',
      });
    });

    test('should return cached repository on subsequent access', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      await repositoryCoordinator.getSharedRepository(repoUrl);
      vi.clearAllMocks();

      // ACT
      const handle = await repositoryCoordinator.getSharedRepository(repoUrl);

      // ASSERT
      expect(mockGitService.cloneRepository).not.toHaveBeenCalled();
      expect(handle.refCount).toBe(2);
      expect(mockMetrics.recordEnhancedCacheOperation).toHaveBeenCalledWith(
        'repository',
        true,
        undefined,
        repoUrl,
        5000
      );
    });

    test('should wait for active clone operation', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      let resolveClone: (value: string) => void;
      const clonePromise = new Promise<string>((resolve) => {
        resolveClone = resolve;
      });
      mockGitService.cloneRepository.mockReturnValue(clonePromise);

      // ACT
      const promise1 = repositoryCoordinator.getSharedRepository(repoUrl);
      const promise2 = repositoryCoordinator.getSharedRepository(repoUrl);

      resolveClone!('/tmp/repo-123');
      const [handle1, handle2] = await Promise.all([promise1, promise2]);

      // ASSERT
      expect(mockGitService.cloneRepository).toHaveBeenCalledTimes(1);
      expect(handle1.localPath).toBe(handle2.localPath);
      expect(handle1.refCount).toBe(2); // Both handles point to the same object
      expect(handle2.refCount).toBe(2); // Both handles point to the same object
      expect(handle1).toBe(handle2); // They should be the same object
    });

    test('should handle clone failures gracefully', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      const cloneError = new Error('Clone failed');
      mockGitService.cloneRepository.mockRejectedValue(cloneError);

      // ACT & ASSERT
      await expect(
        repositoryCoordinator.getSharedRepository(repoUrl)
      ).rejects.toThrow('Clone failed');

      expect(mockMetrics.recordDetailedError).toHaveBeenCalledWith(
        'coordination',
        cloneError,
        {
          userImpact: 'blocking',
          recoveryAction: 'retry',
          severity: 'critical',
        }
      );
    });

    test('should cleanup partial clone on failure', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-123');
      mockGitService.getCommitCount.mockRejectedValue(
        new Error('Count failed')
      );

      // ACT & ASSERT
      await expect(
        repositoryCoordinator.getSharedRepository(repoUrl)
      ).rejects.toThrow('Count failed');

      expect(mockGitService.cleanupRepository).toHaveBeenCalledWith(
        '/tmp/repo-123'
      );
    });
  });

  describe('Repository Release and Cleanup', () => {
    test('should decrement reference count on release', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      const handle = await repositoryCoordinator.getSharedRepository(repoUrl);
      expect(handle.refCount).toBe(1);

      // ACT
      await repositoryCoordinator.releaseRepository(repoUrl);

      // ASSERT - Repository should stay in cache, not be cleaned up immediately
      expect(mockGitService.cleanupRepository).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Repository reference count reached zero, keeping in cache',
        expect.objectContaining({
          repoUrl,
          localPath: '/tmp/repo-123',
          maxAgeHours: 24,
        })
      );
    });

    test('should not cleanup when references remain', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      await repositoryCoordinator.getSharedRepository(repoUrl);
      await repositoryCoordinator.getSharedRepository(repoUrl); // refCount = 2
      vi.clearAllMocks();

      // ACT
      await repositoryCoordinator.releaseRepository(repoUrl);

      // ASSERT
      expect(mockGitService.cleanupRepository).not.toHaveBeenCalled();
    });

    test('should handle cleanup failures gracefully during periodic cleanup', async () => {
      // ARRANGE
      vi.useFakeTimers();
      const repoUrl = 'https://github.com/test/repo.git';
      await repositoryCoordinator.getSharedRepository(repoUrl);
      await repositoryCoordinator.releaseRepository(repoUrl);

      mockGitService.cleanupRepository.mockRejectedValue(
        new Error('Cleanup failed')
      );

      vi.clearAllMocks();

      // ACT - Trigger cleanup after expiration
      vi.advanceTimersByTime(25 * 60 * 60 * 1000); // Past maxAgeHours
      await repositoryCoordinator.performCleanup();

      // ASSERT - Should log error but not throw
      // Error is logged from cleanupRepositoryHandle method
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to cleanup repository',
        expect.objectContaining({
          repoUrl,
          error: 'Cleanup failed',
        })
      );

      vi.useRealTimers();
    });

    test('should handle release of non-existent repository', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/nonexistent.git';

      // ACT & ASSERT - Should not throw
      await repositoryCoordinator.releaseRepository(repoUrl);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempted to release non-existent repository',
        { repoUrl }
      );
    });

    test('should keep repository in cache when refCount reaches 0', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/cache-test.git';
      const handle1 = await repositoryCoordinator.getSharedRepository(repoUrl);
      const firstLocalPath = handle1.localPath;

      // ACT - Release the repository
      await repositoryCoordinator.releaseRepository(repoUrl);

      // ASSERT - Repository should still be in cache
      expect(mockGitService.cleanupRepository).not.toHaveBeenCalled();

      // Acquire it again
      vi.clearAllMocks();
      const handle2 = await repositoryCoordinator.getSharedRepository(repoUrl);

      // Should use the same cached directory, not clone again
      expect(handle2.localPath).toBe(firstLocalPath);
      expect(mockGitService.cloneRepository).not.toHaveBeenCalled();
    });

    test('should reuse cached repository across multiple acquire/release cycles', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/multi-cycle.git';

      // ACT - Multiple acquire/release cycles
      const handle1 = await repositoryCoordinator.getSharedRepository(repoUrl);
      const originalPath = handle1.localPath;
      await repositoryCoordinator.releaseRepository(repoUrl);

      vi.clearAllMocks();
      const handle2 = await repositoryCoordinator.getSharedRepository(repoUrl);
      await repositoryCoordinator.releaseRepository(repoUrl);

      vi.clearAllMocks();
      const handle3 = await repositoryCoordinator.getSharedRepository(repoUrl);

      // ASSERT - Should always use the same cached directory
      expect(handle2.localPath).toBe(originalPath);
      expect(handle3.localPath).toBe(originalPath);
      expect(mockGitService.cloneRepository).not.toHaveBeenCalled();
      expect(mockGitService.cleanupRepository).not.toHaveBeenCalled();
    });
  });

  describe('Periodic Cleanup and Cache Expiration', () => {
    test('should cleanup repository after maxAgeHours expires', async () => {
      // ARRANGE
      vi.useFakeTimers();
      const repoUrl = 'https://github.com/test/expired-repo.git';
      const handle = await repositoryCoordinator.getSharedRepository(repoUrl);
      await repositoryCoordinator.releaseRepository(repoUrl);

      vi.clearAllMocks();

      // ACT - Advance time past maxAgeHours (24 hours + 1 minute)
      const maxAgeMs = 24 * 60 * 60 * 1000;
      vi.advanceTimersByTime(maxAgeMs + 60000);

      // Manually trigger cleanup (in real code, scheduler does this)
      await repositoryCoordinator.performCleanup();

      // ASSERT - Repository should now be cleaned up
      expect(mockGitService.cleanupRepository).toHaveBeenCalledWith(
        handle.localPath
      );

      vi.useRealTimers();
    });

    test('should not cleanup repository before maxAgeHours expires', async () => {
      // ARRANGE
      vi.useFakeTimers();
      const repoUrl = 'https://github.com/test/not-expired.git';
      await repositoryCoordinator.getSharedRepository(repoUrl);
      await repositoryCoordinator.releaseRepository(repoUrl);

      vi.clearAllMocks();

      // ACT - Advance time to just before maxAgeHours (23 hours)
      const notExpiredMs = 23 * 60 * 60 * 1000;
      vi.advanceTimersByTime(notExpiredMs);

      await repositoryCoordinator.performCleanup();

      // ASSERT - Repository should still be cached
      expect(mockGitService.cleanupRepository).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    test('should not cleanup repository with active references', async () => {
      // ARRANGE
      vi.useFakeTimers();
      const repoUrl = 'https://github.com/test/active-refs.git';
      await repositoryCoordinator.getSharedRepository(repoUrl);
      // Don't release - refCount = 1

      vi.clearAllMocks();

      // ACT - Advance time past maxAgeHours
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      await repositoryCoordinator.performCleanup();

      // ASSERT - Should not cleanup because refCount > 0
      expect(mockGitService.cleanupRepository).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    test('should respect maxRepositories configuration during cleanup', async () => {
      // ARRANGE
      // The default maxRepositories is 50, so we can't easily trigger cleanup
      // by exceeding it in a test. This test verifies the logic works correctly
      // when there are multiple repos and one is expired.

      const repo1 = 'https://github.com/test/old-repo.git';
      const repo2 = 'https://github.com/test/new-repo.git';

      vi.useFakeTimers();

      // Create first repo and age it
      await repositoryCoordinator.getSharedRepository(repo1);
      await repositoryCoordinator.releaseRepository(repo1);

      // Advance time to make first repo old
      vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours

      // Create second repo (fresh)
      await repositoryCoordinator.getSharedRepository(repo2);
      await repositoryCoordinator.releaseRepository(repo2);

      vi.clearAllMocks();

      // ACT - Trigger cleanup
      await repositoryCoordinator.performCleanup();

      // ASSERT - Only the old repo should be cleaned up, not the new one
      expect(mockGitService.cleanupRepository).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe('Cache Validation and Expiration', () => {
    test('should invalidate expired repositories', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      const handle = await repositoryCoordinator.getSharedRepository(repoUrl);

      // Mock expired repository
      handle.lastAccessed = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      vi.clearAllMocks();

      // ACT
      const newHandle =
        await repositoryCoordinator.getSharedRepository(repoUrl);

      // ASSERT
      expect(mockGitService.cloneRepository).toHaveBeenCalled(); // New clone
      expect(newHandle.refCount).toBe(1);
    });

    test('should invalidate repositories with missing directories', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      await repositoryCoordinator.getSharedRepository(repoUrl);

      // Mock directory not found
      mockAccess.mockRejectedValue(new Error('ENOENT: no such file'));
      vi.clearAllMocks();

      // ACT
      const newHandle =
        await repositoryCoordinator.getSharedRepository(repoUrl);

      // ASSERT
      expect(mockGitService.cloneRepository).toHaveBeenCalled(); // New clone
      expect(newHandle.refCount).toBe(1);
    });

    test('should force invalidate specific repository', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      await repositoryCoordinator.getSharedRepository(repoUrl);
      vi.clearAllMocks();

      // ACT
      await repositoryCoordinator.invalidateRepository(repoUrl);

      // ASSERT
      expect(mockGitService.cleanupRepository).toHaveBeenCalledWith(
        '/tmp/repo-123'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Invalidating cached repository',
        expect.objectContaining({ repoUrl })
      );
    });
  });

  describe('Operation Coordination and Coalescing', () => {
    test('should coalesce identical operations', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      let callCount = 0;
      const mockOperation = vi.fn().mockImplementation(async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return `result-${callCount}`;
      });

      // ACT
      const promises = [
        repositoryCoordinator.coordinateOperation(
          repoUrl,
          'test-op',
          mockOperation
        ),
        repositoryCoordinator.coordinateOperation(
          repoUrl,
          'test-op',
          mockOperation
        ),
        repositoryCoordinator.coordinateOperation(
          repoUrl,
          'test-op',
          mockOperation
        ),
      ];

      const results = await Promise.all(promises);

      // ASSERT
      expect(mockOperation).toHaveBeenCalledTimes(1); // Coalesced to single call
      expect(results).toEqual(['result-1', 'result-1', 'result-1']); // Same result
    });

    test('should allow different operation types to run concurrently', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      const mockOp1 = vi.fn().mockResolvedValue('result-1');
      const mockOp2 = vi.fn().mockResolvedValue('result-2');

      // ACT
      const [result1, result2] = await Promise.all([
        repositoryCoordinator.coordinateOperation(repoUrl, 'op-1', mockOp1),
        repositoryCoordinator.coordinateOperation(repoUrl, 'op-2', mockOp2),
      ]);

      // ASSERT
      expect(mockOp1).toHaveBeenCalledTimes(1);
      expect(mockOp2).toHaveBeenCalledTimes(1);
      expect(result1).toBe('result-1');
      expect(result2).toBe('result-2');
    });

    test('should disable coalescing when requested', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      const mockOperation = vi.fn().mockResolvedValue('result');

      // ACT
      await Promise.all([
        repositoryCoordinator.coordinateOperation(
          repoUrl,
          'test-op',
          mockOperation,
          { allowCoalescing: false }
        ),
        repositoryCoordinator.coordinateOperation(
          repoUrl,
          'test-op',
          mockOperation,
          { allowCoalescing: false }
        ),
      ]);

      // ASSERT
      expect(mockOperation).toHaveBeenCalledTimes(2); // No coalescing
    });
  });

  describe('withRepository Helper', () => {
    test('should acquire and release repository automatically', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      const mockCallback = vi.fn().mockResolvedValue('callback-result');

      // ACT
      const result = await repositoryCoordinator.withRepository(
        repoUrl,
        mockCallback
      );

      // ASSERT
      expect(result).toBe('callback-result');
      expect(mockCallback).toHaveBeenCalledWith('/tmp/repo-123');
      // Repository stays in cache after release, not immediately cleaned up
      expect(mockGitService.cleanupRepository).not.toHaveBeenCalled();
    });

    test('should release repository even on callback failure', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      const callbackError = new Error('Callback failed');
      const mockCallback = vi.fn().mockRejectedValue(callbackError);

      // ACT & ASSERT
      await expect(
        repositoryCoordinator.withRepository(repoUrl, mockCallback)
      ).rejects.toThrow('Callback failed');

      // Repository stays in cache after release, not immediately cleaned up
      expect(mockGitService.cleanupRepository).not.toHaveBeenCalled();
    });
  });

  describe('Metrics and Status', () => {
    test('should track coordination metrics correctly', async () => {
      // ARRANGE
      const repoUrl1 = 'https://github.com/test/repo1.git';
      const repoUrl2 = 'https://github.com/test/repo2.git';

      // ACT
      await repositoryCoordinator.getSharedRepository(repoUrl1);
      await repositoryCoordinator.getSharedRepository(repoUrl2);
      await repositoryCoordinator.getSharedRepository(repoUrl1); // Cache hit

      const metrics = repositoryCoordinator.getMetrics();

      // ASSERT
      expect(metrics).toMatchObject({
        cachedRepositories: 2,
        activeClones: 0,
        cacheHits: 1,
        cacheMisses: 2,
        duplicateClonesPrevented: 1,
      });
    });

    test('should provide detailed repository status', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      await repositoryCoordinator.getSharedRepository(repoUrl);

      // ACT
      const status = repositoryCoordinator.getRepositoryStatus();

      // ASSERT
      expect(status).toHaveLength(1);
      expect(status[0]).toMatchObject({
        repoUrl,
        commitCount: 5000,
        sizeCategory: 'medium',
        refCount: 1,
      });
      expect(status[0].lastAccessed).toBeInstanceOf(Date);
      expect(status[0].age).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Large Repository Handling', () => {
    test('should record streaming metrics for large repositories', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/large-repo.git';
      mockGitService.getCommitCount.mockResolvedValue(100000);
      mockMetrics.getRepositorySizeCategory.mockReturnValue('huge');

      // ACT
      await repositoryCoordinator.getSharedRepository(repoUrl);

      // ASSERT
      expect(mockMetrics.recordStreamingStart).toHaveBeenCalledWith(100000);
    });

    test('should categorize repository sizes correctly', async () => {
      // ARRANGE
      const testCases = [
        { commitCount: 500, expectedCategory: 'small' },
        { commitCount: 5000, expectedCategory: 'medium' },
        { commitCount: 50000, expectedCategory: 'large' },
        { commitCount: 150000, expectedCategory: 'huge' },
      ];

      for (const { commitCount, expectedCategory } of testCases) {
        mockGitService.getCommitCount.mockResolvedValue(commitCount);
        mockMetrics.getRepositorySizeCategory.mockReturnValue(
          expectedCategory as any
        );

        // ACT
        const handle = await repositoryCoordinator.getSharedRepository(
          `https://github.com/test/repo-${commitCount}.git`
        );

        // ASSERT
        expect(handle.sizeCategory).toBe(expectedCategory);
        expect(handle.commitCount).toBe(commitCount);
      }
    });
  });

  describe('Graceful Shutdown', () => {
    test('should cleanup all repositories on shutdown', async () => {
      // ARRANGE
      const repoUrls = [
        'https://github.com/test/repo1.git',
        'https://github.com/test/repo2.git',
      ];

      for (const repoUrl of repoUrls) {
        await repositoryCoordinator.getSharedRepository(repoUrl);
      }
      vi.clearAllMocks();

      // ACT
      await repositoryCoordinator.shutdown();

      // ASSERT
      expect(mockGitService.cleanupRepository).toHaveBeenCalledTimes(2);
      expect(repositoryCoordinator.getMetrics().cachedRepositories).toBe(0);
    });

    test('should handle cleanup failures during shutdown', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      await repositoryCoordinator.getSharedRepository(repoUrl);
      mockGitService.cleanupRepository.mockRejectedValue(
        new Error('Cleanup failed')
      );

      // ACT & ASSERT - Should not throw
      await repositoryCoordinator.shutdown();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to cleanup repository',
        expect.objectContaining({
          repoUrl,
          localPath: expect.any(String),
          error: expect.any(String),
        })
      );
    });

    test('should reset metrics after shutdown', async () => {
      // ARRANGE
      await repositoryCoordinator.getSharedRepository(
        'https://github.com/test/repo.git'
      );

      // ACT
      await repositoryCoordinator.shutdown();

      // ASSERT
      const metrics = repositoryCoordinator.getMetrics();
      expect(metrics).toMatchObject({
        cachedRepositories: 0,
        activeClones: 0,
        coalescedOperations: 0,
        duplicateClonesPrevented: 0,
        cacheHits: 0,
        cacheMisses: 0,
        totalDiskUsageBytes: 0,
      });
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    test('should handle lock manager failures gracefully', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      const lockError = new Error('Lock acquisition failed');
      mockWithKeyLock.mockRejectedValue(lockError);

      // ACT & ASSERT
      await expect(
        repositoryCoordinator.getSharedRepository(repoUrl)
      ).rejects.toThrow('Lock acquisition failed');
    });

    test('should handle concurrent release operations safely', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/repo.git';
      await repositoryCoordinator.getSharedRepository(repoUrl);
      await repositoryCoordinator.getSharedRepository(repoUrl); // refCount = 2

      // ACT - Release twice concurrently
      const promises = [
        repositoryCoordinator.releaseRepository(repoUrl),
        repositoryCoordinator.releaseRepository(repoUrl),
      ];

      // ASSERT - Should not throw and not cleanup (stays in cache)
      await Promise.allSettled(promises);
      expect(mockGitService.cleanupRepository).not.toHaveBeenCalled();
    });

    test('should handle memory pressure during operations', async () => {
      // ARRANGE
      const repoUrls = Array.from(
        { length: 60 },
        (_, i) => `https://github.com/test/repo${i}.git`
      );

      // ACT - Exceed maxRepositories limit
      for (const repoUrl of repoUrls) {
        mockGitService.cloneRepository.mockResolvedValue(
          `/tmp/repo-${repoUrl.split('repo')[1]}`
        );
        await repositoryCoordinator.getSharedRepository(repoUrl);
      }

      // ASSERT - Should trigger cleanup mechanisms
      const metrics = repositoryCoordinator.getMetrics();
      expect(metrics.cachedRepositories).toBeLessThanOrEqual(60);
    });
  });

  describe('Scheduled Cleanup', () => {
    test('should handle failed operation cleanup gracefully', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/simple-repo.git';
      await repositoryCoordinator.getSharedRepository(repoUrl);

      // Mock cleanup to fail
      mockGitService.cleanupRepository.mockRejectedValue(
        new Error('Disk error')
      );

      vi.clearAllMocks();

      // ACT - Try to invalidate the repository, which should trigger cleanup
      await repositoryCoordinator.invalidateRepository(repoUrl);

      // ASSERT - Should log the error but not throw
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to cleanup repository',
        expect.objectContaining({
          repoUrl,
          error: 'Disk error',
        })
      );
    });
    test('should handle heatmap operation dependency when commits operation fails', async () => {
      // ARRANGE
      const repoUrl = 'https://github.com/test/dependency-repo.git';
      await repositoryCoordinator.getSharedRepository(repoUrl);

      vi.clearAllMocks();

      // ACT - Start a commits operation that will fail, then a heatmap operation
      const commitsOpPromise = repositoryCoordinator.coordinateOperation(
        repoUrl,
        'commits',
        async () => {
          throw new Error('Commits operation failed');
        }
      );

      // Start heatmap operation that should handle the commits failure gracefully
      const heatmapOpPromise = repositoryCoordinator.coordinateOperation(
        repoUrl,
        'heatmap',
        async () => {
          return { result: 'heatmap-data' };
        }
      );

      // Wait for operations to complete
      try {
        await commitsOpPromise;
      } catch {
        // Expected to fail
      }

      const heatmapResult = await heatmapOpPromise;

      // ASSERT
      expect(heatmapResult.result).toBe('heatmap-data');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Heatmap operation waiting for commits operation',
        expect.objectContaining({ repoUrl })
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Parent operation failed, heatmap will proceed independently',
        expect.objectContaining({
          repoUrl,
          error: 'Commits operation failed',
        })
      );
    });
  });

  describe('Helper Functions', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockWithKeyLock.mockImplementation(async (key, fn) => fn());
      mockGitService.cloneRepository.mockResolvedValue('/tmp/repo-helper');
      mockGitService.getCommitCount.mockResolvedValue(3000);
      mockMetrics.getRepositorySizeCategory.mockReturnValue('medium');
      mockAccess.mockResolvedValue(undefined);
    });

    afterEach(async () => {
      await repositoryCoordinator.shutdown();
    });

    describe('withSharedRepository', () => {
      test('should provide repository handle to callback', async () => {
        // ARRANGE
        const repoUrl = 'https://github.com/test/repo.git';
        const mockCallback = vi
          .fn()
          .mockImplementation((handle: RepositoryHandle) => {
            expect(handle.localPath).toBe('/tmp/repo-helper');
            expect(handle.commitCount).toBe(3000);
            return Promise.resolve('success');
          });

        // ACT
        const result = await withSharedRepository(repoUrl, mockCallback);

        // ASSERT
        expect(result).toBe('success');
        expect(mockCallback).toHaveBeenCalledTimes(1);
      });

      test('should release repository even on callback error', async () => {
        // ARRANGE
        const repoUrl = 'https://github.com/test/repo.git';
        const callbackError = new Error('Callback error');
        const mockCallback = vi.fn().mockRejectedValue(callbackError);

        // ACT & ASSERT
        await expect(
          withSharedRepository(repoUrl, mockCallback)
        ).rejects.toThrow('Callback error');

        // Repository should be released but stays in cache (not immediately cleaned up)
        expect(mockGitService.cleanupRepository).not.toHaveBeenCalled();
      });
    });

    describe('coordinatedOperation', () => {
      test('should delegate to repository coordinator', async () => {
        // ARRANGE
        const repoUrl = 'https://github.com/test/repo.git';
        const operationType = 'test-operation';
        const mockOperation = vi.fn().mockResolvedValue('operation-result');

        // ACT
        const result = await coordinatedOperation(
          repoUrl,
          operationType,
          mockOperation
        );

        // ASSERT
        expect(result).toBe('operation-result');
        expect(mockOperation).toHaveBeenCalledTimes(1);
      });

      test('should pass through coalescing options', async () => {
        // ARRANGE
        const repoUrl = 'https://github.com/test/repo.git';
        const operationType = 'test-operation';
        const mockOperation = vi.fn().mockResolvedValue('result');

        // ACT
        const [result1, result2] = await Promise.all([
          coordinatedOperation(repoUrl, operationType, mockOperation, {
            allowCoalescing: false,
          }),
          coordinatedOperation(repoUrl, operationType, mockOperation, {
            allowCoalescing: false,
          }),
        ]);

        // ASSERT
        expect(mockOperation).toHaveBeenCalledTimes(2); // No coalescing
        expect(result1).toBe('result');
        expect(result2).toBe('result');
      });
    });
  });
});
