import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  withTempRepository,
  withTempRepositoryStreaming,
  getRepositoryInfo,
  invalidateRepositoryCache,
  getCoordinationMetrics,
  getRepositoryStatus,
} from '../../../src/utils/withTempRepository';

// Mock all dependencies
vi.mock('../../../src/services/gitService', () => ({
  gitService: {
    cloneRepository: vi.fn(),
    getCommitCount: vi.fn(),
    cleanupRepository: vi.fn(),
  },
}));

vi.mock('../../../src/utils/cleanupScheduler', () => ({
  scheduleCleanup: vi.fn(),
}));

vi.mock('../../../src/utils/lockManager', () => ({
  withKeyLock: vi.fn(),
}));

vi.mock('../../../src/services/repositoryCoordinator', () => ({
  repositoryCoordinator: {
    invalidateRepository: vi.fn(),
    getMetrics: vi.fn(),
    getRepositoryStatus: vi.fn(),
    shutdown: vi.fn(),
  },
  withSharedRepository: vi.fn(),
  coordinatedOperation: vi.fn(),
}));

vi.mock('../../../src/services/metrics', () => ({
  recordStreamingStart: vi.fn(),
  recordStreamingCompletion: vi.fn(),
  recordStreamingError: vi.fn(),
  getRepositorySizeCategory: vi.fn(),
}));

vi.mock('../../../src/services/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../../src/config', () => ({
  config: {
    repositoryCache: {
      enabled: true,
    },
    streaming: {
      enabled: true,
      commitThreshold: 50000,
      batchSize: 1000,
    },
  },
}));

// Import mocked dependencies for assertions
import { gitService } from '../../../src/services/gitService';
import { scheduleCleanup } from '../../../src/utils/cleanupScheduler';
import { withKeyLock } from '../../../src/utils/lockManager';
import {
  repositoryCoordinator,
  withSharedRepository,
  coordinatedOperation,
} from '../../../src/services/repositoryCoordinator';
import {
  recordStreamingStart,
  recordStreamingCompletion,
  recordStreamingError,
  getRepositorySizeCategory,
} from '../../../src/services/metrics';
import { config } from '../../../src/config';

describe('withTempRepository', () => {
  const mockRepoUrl = 'https://github.com/test/repo.git';
  const mockTempDir = '/tmp/test-repo-123';
  const mockCallback = vi.fn();
  const mockRepositoryHandle = {
    localPath: mockTempDir,
    commitCount: 1000,
    sizeCategory: 'small' as const,
    isShared: true,
    refCount: 1,
    lastAccessed: new Date(),
    repoUrl: mockRepoUrl,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default success mocks
    mockCallback.mockResolvedValue('test-result');
    vi.mocked(coordinatedOperation).mockImplementation(
      async (_url, _type, fn) => await fn()
    );
    vi.mocked(withSharedRepository).mockImplementation(
      async (_url, fn) => await fn(mockRepositoryHandle)
    );
    vi.mocked(withKeyLock).mockImplementation(async (_key, fn) => await fn());
    vi.mocked(gitService.cloneRepository).mockResolvedValue(mockTempDir);
    vi.mocked(gitService.getCommitCount).mockResolvedValue(1000);
    vi.mocked(getRepositorySizeCategory).mockReturnValue('small');

    // Ensure coordination is enabled by default
    config.repositoryCache.enabled = true;
    config.streaming.enabled = true;
  });

  describe('Repository Coordination Path', () => {
    test('should use coordination when enabled', async () => {
      // ARRANGE
      config.repositoryCache.enabled = true;

      // ACT
      const result = await withTempRepository(mockRepoUrl, mockCallback);

      // ASSERT
      expect(result).toBe('test-result');
      expect(coordinatedOperation).toHaveBeenCalledWith(
        mockRepoUrl,
        'generic',
        expect.any(Function),
        { allowCoalescing: true }
      );
      expect(withSharedRepository).toHaveBeenCalledWith(
        mockRepoUrl,
        expect.any(Function)
      );
      expect(mockCallback).toHaveBeenCalledWith(mockTempDir);
    });

    test('should use legacy when coordination disabled', async () => {
      // ARRANGE
      config.repositoryCache.enabled = false;

      // ACT
      const result = await withTempRepository(mockRepoUrl, mockCallback);

      // ASSERT
      expect(result).toBe('test-result');
      expect(withKeyLock).toHaveBeenCalledWith(
        mockRepoUrl,
        expect.any(Function)
      );
      expect(gitService.cloneRepository).toHaveBeenCalledWith(mockRepoUrl);
      expect(scheduleCleanup).toHaveBeenCalledWith(mockTempDir);

      // Should not use coordination
      expect(coordinatedOperation).not.toHaveBeenCalled();
    });

    test('should use legacy when forceLegacy option is true', async () => {
      // ARRANGE
      config.repositoryCache.enabled = true;

      // ACT
      await withTempRepository(mockRepoUrl, mockCallback, {
        forceLegacy: true,
      });

      // ASSERT
      expect(withKeyLock).toHaveBeenCalled();
      expect(coordinatedOperation).not.toHaveBeenCalled();
    });

    test('should pass operation type to coordination', async () => {
      // ARRANGE
      const options = { operationType: 'custom-operation' };

      // ACT
      await withTempRepository(mockRepoUrl, mockCallback, options);

      // ASSERT
      expect(coordinatedOperation).toHaveBeenCalledWith(
        mockRepoUrl,
        'custom-operation',
        expect.any(Function),
        { allowCoalescing: true }
      );
    });

    test('should disable coalescing when allowCoalescing is false', async () => {
      // ARRANGE
      const options = { allowCoalescing: false };

      // ACT
      await withTempRepository(mockRepoUrl, mockCallback, options);

      // ASSERT
      expect(coordinatedOperation).toHaveBeenCalledWith(
        mockRepoUrl,
        'generic',
        expect.any(Function),
        { allowCoalescing: false }
      );
    });
  });

  describe('Streaming Metrics Logic', () => {
    test('should start streaming metrics for large repositories', async () => {
      // ARRANGE
      const largeRepoHandle = { ...mockRepositoryHandle, commitCount: 75000 };
      vi.mocked(withSharedRepository).mockImplementation(
        async (_url, fn) => await fn(largeRepoHandle)
      );
      config.streaming.commitThreshold = 50000;
      config.streaming.enabled = true;

      // ACT
      await withTempRepository(mockRepoUrl, mockCallback);

      // ASSERT
      expect(recordStreamingStart).toHaveBeenCalledWith(75000);
      expect(recordStreamingCompletion).toHaveBeenCalledWith(
        75000,
        expect.any(Number), // duration
        75000, // processed commits
        expect.any(Number), // batches
        0.6, // cache hit rate
        expect.any(Number) // memory usage
      );
    });

    test('should not start streaming metrics for small repositories', async () => {
      // ARRANGE
      const smallRepoHandle = { ...mockRepositoryHandle, commitCount: 1000 };
      vi.mocked(withSharedRepository).mockImplementation(
        async (_url, fn) => await fn(smallRepoHandle)
      );
      config.streaming.commitThreshold = 50000;

      // ACT
      await withTempRepository(mockRepoUrl, mockCallback);

      // ASSERT
      expect(recordStreamingStart).not.toHaveBeenCalled();
      expect(recordStreamingCompletion).not.toHaveBeenCalled();
    });

    test('should not collect metrics when streaming disabled', async () => {
      // ARRANGE
      const largeRepoHandle = { ...mockRepositoryHandle, commitCount: 75000 };
      vi.mocked(withSharedRepository).mockImplementation(
        async (_url, fn) => await fn(largeRepoHandle)
      );
      config.streaming.enabled = false;

      // ACT
      await withTempRepository(mockRepoUrl, mockCallback);

      // ASSERT
      expect(recordStreamingStart).not.toHaveBeenCalled();
    });

    test('should skip metrics when skipMetrics option is true', async () => {
      // ARRANGE
      const largeRepoHandle = { ...mockRepositoryHandle, commitCount: 75000 };
      vi.mocked(withSharedRepository).mockImplementation(
        async (_url, fn) => await fn(largeRepoHandle)
      );
      const options = { skipMetrics: true };

      // ACT
      await withTempRepository(mockRepoUrl, mockCallback, options);

      // ASSERT
      expect(recordStreamingStart).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling Paths', () => {
    test('should record streaming error when callback fails', async () => {
      // ARRANGE
      const largeRepoHandle = { ...mockRepositoryHandle, commitCount: 75000 };
      vi.mocked(withSharedRepository).mockImplementation(
        async (_url, fn) => await fn(largeRepoHandle)
      );
      const callbackError = new Error('Callback failed');
      mockCallback.mockRejectedValue(callbackError);

      // ACT & ASSERT
      await expect(
        withTempRepository(mockRepoUrl, mockCallback)
      ).rejects.toThrow('Callback failed');

      expect(recordStreamingStart).toHaveBeenCalledWith(75000);
      expect(recordStreamingError).toHaveBeenCalledWith('Error', false, 75000);
    });

    test('should handle non-Error objects in streaming error recording', async () => {
      // ARRANGE
      const largeRepoHandle = { ...mockRepositoryHandle, commitCount: 75000 };
      vi.mocked(withSharedRepository).mockImplementation(
        async (_url, fn) => await fn(largeRepoHandle)
      );
      mockCallback.mockRejectedValue('String error');

      // ACT & ASSERT
      await expect(withTempRepository(mockRepoUrl, mockCallback)).rejects.toBe(
        'String error'
      );

      expect(recordStreamingError).toHaveBeenCalledWith(
        'UnknownError',
        false,
        75000
      );
    });

    test('should cleanup temp directory on legacy error', async () => {
      // ARRANGE
      config.repositoryCache.enabled = false;
      const cloneError = new Error('Clone failed');
      vi.mocked(gitService.cloneRepository).mockRejectedValue(cloneError);

      // ACT & ASSERT
      await expect(
        withTempRepository(mockRepoUrl, mockCallback)
      ).rejects.toThrow('Clone failed');

      expect(scheduleCleanup).not.toHaveBeenCalled(); // No temp dir created to cleanup
    });

    test('should cleanup temp directory when legacy callback fails', async () => {
      // ARRANGE
      config.repositoryCache.enabled = false;
      const callbackError = new Error('Callback failed');
      mockCallback.mockRejectedValue(callbackError);

      // ACT & ASSERT
      await expect(
        withTempRepository(mockRepoUrl, mockCallback)
      ).rejects.toThrow('Callback failed');

      expect(scheduleCleanup).toHaveBeenCalledWith(mockTempDir);
    });
  });

  describe('Legacy Implementation Error Handling', () => {
    test('should handle commit count error gracefully in legacy mode', async () => {
      // ARRANGE
      config.repositoryCache.enabled = false;
      config.streaming.enabled = true;
      vi.mocked(gitService.getCommitCount).mockRejectedValue(
        new Error('Count failed')
      );

      // ACT
      const result = await withTempRepository(mockRepoUrl, mockCallback);

      // ASSERT
      expect(result).toBe('test-result');
      expect(recordStreamingStart).not.toHaveBeenCalled(); // Should not start metrics due to error
    });

    test('should record streaming error in legacy mode when metrics started', async () => {
      // ARRANGE
      config.repositoryCache.enabled = false;
      config.streaming.enabled = true;
      vi.mocked(gitService.getCommitCount).mockResolvedValue(75000);
      mockCallback.mockRejectedValue(new Error('Legacy callback failed'));

      // ACT & ASSERT
      await expect(
        withTempRepository(mockRepoUrl, mockCallback)
      ).rejects.toThrow('Legacy callback failed');

      expect(recordStreamingStart).toHaveBeenCalledWith(75000);
      expect(recordStreamingError).toHaveBeenCalledWith('Error', false, 75000);
    });
  });
});

describe('withTempRepositoryStreaming', () => {
  const mockRepoUrl = 'https://github.com/test/streaming-repo.git';
  const mockTempDir = '/tmp/streaming-repo-456';
  const mockStreamingCallback = vi.fn();
  const mockRepositoryHandle = {
    localPath: mockTempDir,
    commitCount: 75000,
    sizeCategory: 'large' as const,
    isShared: true,
    refCount: 2,
    lastAccessed: new Date(),
    repoUrl: mockRepoUrl,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamingCallback.mockResolvedValue('streaming-result');
    vi.mocked(coordinatedOperation).mockImplementation(
      async (_url, _type, fn) => await fn()
    );
    vi.mocked(withSharedRepository).mockImplementation(
      async (_url, fn) => await fn(mockRepositoryHandle)
    );
    config.repositoryCache.enabled = true;
    config.streaming.enabled = true;
  });

  test('should use coordination for streaming operations', async () => {
    // ARRANGE & ACT
    const result = await withTempRepositoryStreaming(
      mockRepoUrl,
      mockStreamingCallback
    );

    // ASSERT
    expect(result).toBe('streaming-result');
    expect(coordinatedOperation).toHaveBeenCalledWith(
      mockRepoUrl,
      'streaming:streaming',
      expect.any(Function),
      { allowCoalescing: true }
    );
    expect(mockStreamingCallback).toHaveBeenCalledWith(mockTempDir, 75000);
  });

  test('should fallback to legacy when coordination disabled', async () => {
    // ARRANGE
    config.repositoryCache.enabled = false;
    vi.mocked(withKeyLock).mockImplementation(async (_key, fn) => await fn());
    vi.mocked(gitService.cloneRepository).mockResolvedValue(mockTempDir);
    vi.mocked(gitService.getCommitCount).mockResolvedValue(75000);

    // ACT
    const result = await withTempRepositoryStreaming(
      mockRepoUrl,
      mockStreamingCallback
    );

    // ASSERT
    expect(result).toBe('streaming-result');
    expect(withKeyLock).toHaveBeenCalled();
    expect(mockStreamingCallback).toHaveBeenCalledWith(mockTempDir, 75000);
  });

  test('should use custom operation type for streaming', async () => {
    // ARRANGE
    const options = { operationType: 'data-analysis' };

    // ACT
    await withTempRepositoryStreaming(
      mockRepoUrl,
      mockStreamingCallback,
      options
    );

    // ASSERT
    expect(coordinatedOperation).toHaveBeenCalledWith(
      mockRepoUrl,
      'data-analysis:streaming',
      expect.any(Function),
      { allowCoalescing: true }
    );
  });

  test('should calculate recommended batch size based on streaming options', async () => {
    // ARRANGE
    const options = {
      streamingOptions: { batchSize: 500 },
    };

    // ACT
    await withTempRepositoryStreaming(
      mockRepoUrl,
      mockStreamingCallback,
      options
    );

    // ASSERT
    expect(recordStreamingCompletion).toHaveBeenCalledWith(
      75000,
      expect.any(Number),
      75000,
      Math.ceil(75000 / 500), // Uses custom batch size
      0.7,
      expect.any(Number)
    );
  });

  test('should handle estimated commits from options in legacy mode', async () => {
    // ARRANGE
    config.repositoryCache.enabled = false;
    const options = { estimatedCommits: 100000 };
    vi.mocked(withKeyLock).mockImplementation(async (_key, fn) => await fn());
    vi.mocked(gitService.cloneRepository).mockResolvedValue(mockTempDir);

    // ACT
    await withTempRepositoryStreaming(
      mockRepoUrl,
      mockStreamingCallback,
      options
    );

    // ASSERT
    expect(recordStreamingStart).toHaveBeenCalledWith(100000);
    expect(mockStreamingCallback).toHaveBeenCalledWith(mockTempDir, 100000);
  });
});

describe('getRepositoryInfo', () => {
  const mockRepoUrl = 'https://github.com/test/info-repo.git';
  const mockRepositoryHandle = {
    localPath: '/tmp/info-repo',
    commitCount: 25000,
    sizeCategory: 'medium' as const,
    isShared: true,
    refCount: 1,
    lastAccessed: new Date(),
    repoUrl: mockRepoUrl,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(coordinatedOperation).mockImplementation(
      async (_url, _type, fn) => await fn()
    );
    vi.mocked(withSharedRepository).mockImplementation(
      async (_url, fn) => await fn(mockRepositoryHandle)
    );
    config.repositoryCache.enabled = true;
    config.streaming.commitThreshold = 50000;
    config.streaming.batchSize = 1000;
  });

  test('should return repository info using coordination', async () => {
    // ARRANGE & ACT
    const info = await getRepositoryInfo(mockRepoUrl);

    // ASSERT
    expect(info).toEqual({
      commitCount: 25000,
      shouldUseStreaming: false, // Below threshold
      estimatedProcessingTime: 25, // 25000 * 0.001
      recommendedBatchSize: 1000, // Medium repo batch size
      sizeCategory: 'medium',
      isShared: true,
      cached: true,
    });
  });

  test('should recommend streaming for large repositories', async () => {
    // ARRANGE
    const largeRepoHandle = { ...mockRepositoryHandle, commitCount: 75000 };
    vi.mocked(withSharedRepository).mockImplementation(
      async (_url, fn) => await fn(largeRepoHandle)
    );
    config.streaming.enabled = true;

    // ACT
    const info = await getRepositoryInfo(mockRepoUrl);

    // ASSERT
    expect(info.shouldUseStreaming).toBe(true);
    expect(info.estimatedProcessingTime).toBe(37.5); // 75000 * 0.0005
  });

  test('should adjust batch size for very large repositories', async () => {
    // ARRANGE
    const veryLargeRepoHandle = {
      ...mockRepositoryHandle,
      commitCount: 600000,
    };
    vi.mocked(withSharedRepository).mockImplementation(
      async (_url, fn) => await fn(veryLargeRepoHandle)
    );

    // ACT
    const info = await getRepositoryInfo(mockRepoUrl);

    // ASSERT
    expect(info.recommendedBatchSize).toBe(2000); // Doubled for large repos
  });

  test('should use legacy implementation when coordination disabled', async () => {
    // ARRANGE
    config.repositoryCache.enabled = false;
    vi.mocked(withKeyLock).mockImplementation(async (_key, fn) => await fn());
    vi.mocked(gitService.cloneRepository).mockResolvedValue('/tmp/legacy-repo');
    vi.mocked(gitService.getCommitCount).mockResolvedValue(30000);
    vi.mocked(getRepositorySizeCategory).mockReturnValue('medium');

    // ACT
    const info = await getRepositoryInfo(mockRepoUrl);

    // ASSERT
    expect(info).toEqual({
      commitCount: 30000,
      shouldUseStreaming: false,
      estimatedProcessingTime: 60, // Legacy uses slower rate
      recommendedBatchSize: 1000,
      sizeCategory: 'medium',
      isShared: false,
      cached: false,
    });
  });
});

describe('Cache Management Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('invalidateRepositoryCache', () => {
    test('should invalidate repository when coordination enabled', async () => {
      // ARRANGE
      config.repositoryCache.enabled = true;

      // ACT
      await invalidateRepositoryCache('https://github.com/test/repo.git');

      // ASSERT
      expect(repositoryCoordinator.invalidateRepository).toHaveBeenCalledWith(
        'https://github.com/test/repo.git'
      );
    });

    test('should do nothing when coordination disabled', async () => {
      // ARRANGE
      config.repositoryCache.enabled = false;

      // ACT
      await invalidateRepositoryCache('https://github.com/test/repo.git');

      // ASSERT
      expect(repositoryCoordinator.invalidateRepository).not.toHaveBeenCalled();
    });
  });

  describe('getCoordinationMetrics', () => {
    test('should return metrics when coordination enabled', () => {
      // ARRANGE
      config.repositoryCache.enabled = true;
      const mockMetrics = {
        cachedRepositories: 5,
        activeClones: 2,
        coalescedOperations: 3,
        duplicateClonesPrevented: 4,
        cacheHits: 10,
        cacheMisses: 2,
        totalDiskUsageBytes: 1024000,
      };
      vi.mocked(repositoryCoordinator.getMetrics).mockReturnValue(mockMetrics);

      // ACT
      const metrics = getCoordinationMetrics();

      // ASSERT
      expect(metrics).toBe(mockMetrics);
    });

    test('should return null when coordination disabled', () => {
      // ARRANGE
      config.repositoryCache.enabled = false;

      // ACT
      const metrics = getCoordinationMetrics();

      // ASSERT
      expect(metrics).toBeNull();
    });
  });

  describe('getRepositoryStatus', () => {
    test('should return status when coordination enabled', () => {
      // ARRANGE
      config.repositoryCache.enabled = true;
      const mockStatus = [
        {
          repoUrl: 'https://github.com/test/repo1.git',
          commitCount: 1000,
          sizeCategory: 'small',
          refCount: 1,
          lastAccessed: new Date(),
          age: 3600000,
        },
      ];
      vi.mocked(repositoryCoordinator.getRepositoryStatus).mockReturnValue(
        mockStatus
      );

      // ACT
      const status = getRepositoryStatus();

      // ASSERT
      expect(status).toBe(mockStatus);
    });

    test('should return empty array when coordination disabled', () => {
      // ARRANGE
      config.repositoryCache.enabled = false;

      // ACT
      const status = getRepositoryStatus();

      // ASSERT
      expect(status).toEqual([]);
    });
  });
});

describe('Environment Configuration Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should handle missing config.repositoryCache gracefully', async () => {
    // ARRANGE
    // @ts-expect-error - Intentionally test undefined config
    config.repositoryCache = undefined;
    const mockCallback = vi.fn().mockResolvedValue('result');
    vi.mocked(withKeyLock).mockImplementation(async (_key, fn) => await fn());
    vi.mocked(gitService.cloneRepository).mockResolvedValue('/tmp/test');

    // ACT
    const result = await withTempRepository(
      'https://github.com/test/repo.git',
      mockCallback
    );

    // ASSERT
    expect(result).toBe('result');
    expect(withKeyLock).toHaveBeenCalled(); // Uses legacy path
  });

  test('should handle missing config.streaming gracefully', async () => {
    // ARRANGE
    // @ts-expect-error - Intentionally test undefined config
    config.streaming = undefined;
    // Ensure repositoryCache exists
    config.repositoryCache = config.repositoryCache || {};
    config.repositoryCache.enabled = true;
    const mockCallback = vi.fn().mockResolvedValue('result');
    const mockHandle = {
      localPath: '/tmp/test',
      commitCount: 1000,
      sizeCategory: 'small' as const,
      isShared: true,
      refCount: 1,
      lastAccessed: new Date(),
      repoUrl: 'https://github.com/test/repo.git',
    };
    vi.mocked(coordinatedOperation).mockImplementation(
      async (_url, _type, fn) => await fn()
    );
    vi.mocked(withSharedRepository).mockImplementation(
      async (_url, fn) => await fn(mockHandle)
    );

    // ACT
    const result = await withTempRepository(
      'https://github.com/test/repo.git',
      mockCallback
    );

    // ASSERT
    expect(result).toBe('result');
    expect(recordStreamingStart).not.toHaveBeenCalled(); // No streaming when config missing
  });
});
