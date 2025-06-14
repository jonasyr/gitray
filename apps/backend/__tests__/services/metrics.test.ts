import { describe, test, expect, beforeEach, vi } from 'vitest';
import { register } from 'prom-client';
import {
  updateCacheMetrics,
  cacheHybridMemoryUsage,
  cacheHybridMemoryEntries,
  cacheHybridDiskEntries,
  cacheActiveBackend,
  // Add streaming metrics imports
  getRepositorySizeCategory,
  getBatchSizeCategory,
  recordStreamingStart,
  recordStreamingCompletion,
  recordStreamingBatch,
  recordStreamingError,
  metricsMiddleware,
  metricsHandler,
  activeStreamingOperations,
  streamingOperations,
  streamingOperationDuration,
  streamingCommitsProcessed,
  streamingBatchDuration,
  streamingBatchesProcessed,
  streamingCacheHitRate,
  streamingThroughput,
  repositorySizeDistribution,
  streamingErrors,
  streamingMemoryUsage,
} from '../../src/services/metrics';

// Mock the cache service
const mockGetStats = vi.fn();
vi.mock('../../src/services/cache', () => ({
  getCacheStats: mockGetStats,
}));

describe('Metrics Service', () => {
  beforeEach(() => {
    // Clear mocks
    vi.clearAllMocks();

    // Reset metrics instead of clearing the entire registry
    activeStreamingOperations.reset();
    streamingOperations.reset();
    streamingOperationDuration.reset();
    streamingCommitsProcessed.reset();
    streamingBatchDuration.reset();
    streamingBatchesProcessed.reset();
    streamingCacheHitRate.reset();
    streamingThroughput.reset();
    repositorySizeDistribution.reset();
    streamingErrors.reset();
    streamingMemoryUsage.reset();
    cacheHybridMemoryUsage.reset();
    cacheHybridMemoryEntries.reset();
    cacheHybridDiskEntries.reset();
    cacheActiveBackend.reset();

    // Mock cache service stats
    mockGetStats.mockResolvedValue({
      memory: {
        memoryUsage: 1024 * 1024 * 100, // 100MB
        entries: 500,
      },
      disk: {
        entries: 1000,
      },
      activeBackend: 'hybrid',
    });
  });

  describe('Repository Size Categorization', () => {
    test('should categorize small repositories correctly', () => {
      expect(getRepositorySizeCategory(100)).toBe('small');
      expect(getRepositorySizeCategory(500)).toBe('small');
      expect(getRepositorySizeCategory(999)).toBe('small');
    });

    test('should categorize medium repositories correctly', () => {
      expect(getRepositorySizeCategory(1000)).toBe('medium');
      expect(getRepositorySizeCategory(5000)).toBe('medium');
      expect(getRepositorySizeCategory(9999)).toBe('medium');
    });

    test('should categorize large repositories correctly', () => {
      expect(getRepositorySizeCategory(10000)).toBe('large');
      expect(getRepositorySizeCategory(50000)).toBe('large');
      expect(getRepositorySizeCategory(99999)).toBe('large');
    });

    test('should categorize huge repositories correctly', () => {
      expect(getRepositorySizeCategory(100000)).toBe('huge');
      expect(getRepositorySizeCategory(500000)).toBe('huge');
      expect(getRepositorySizeCategory(1000000)).toBe('huge');
    });
  });

  describe('Batch Size Categorization', () => {
    test('should categorize small batches correctly', () => {
      expect(getBatchSizeCategory(100)).toBe('small');
      expect(getBatchSizeCategory(499)).toBe('small');
    });

    test('should categorize medium batches correctly', () => {
      expect(getBatchSizeCategory(500)).toBe('medium');
      expect(getBatchSizeCategory(1999)).toBe('medium');
    });

    test('should categorize large batches correctly', () => {
      expect(getBatchSizeCategory(2000)).toBe('large');
      expect(getBatchSizeCategory(5000)).toBe('large');
    });
  });

  describe('Streaming Metrics Recording', () => {
    test('should record streaming start correctly', async () => {
      // Act
      recordStreamingStart(5000);

      // Assert
      const activeOps = await activeStreamingOperations.get();
      const repoSize = await repositorySizeDistribution.get();
      const operations = await streamingOperations.get();

      expect(activeOps.values[0].value).toBe(1);
      expect(repoSize.values.some((v) => v.value === 1)).toBe(true);
      expect(
        operations.values.some(
          (v) =>
            v.labels.repository_size === 'medium' &&
            v.labels.status === 'started'
        )
      ).toBe(true);
    });

    test('should record streaming completion correctly', async () => {
      // Arrange
      recordStreamingStart(5000);

      // Act
      recordStreamingCompletion(
        5000, // commitCount
        30000, // duration in ms
        4500, // processedCommits
        10, // batchCount
        0.8, // cacheHitRate
        128 // peakMemoryMB
      );

      // Assert
      const activeOps = await activeStreamingOperations.get();
      const operations = await streamingOperations.get();
      const duration = await streamingOperationDuration.get();
      const commits = await streamingCommitsProcessed.get();
      const hitRate = await streamingCacheHitRate.get();
      const throughput = await streamingThroughput.get();
      const memory = await streamingMemoryUsage.get();

      expect(activeOps.values[0].value).toBe(0); // Decremented
      expect(
        operations.values.some(
          (v) =>
            v.labels.repository_size === 'medium' &&
            v.labels.status === 'completed'
        )
      ).toBe(true);
      expect(duration.values.some((v) => v.value === 30)).toBe(true); // 30 seconds
      expect(commits.values.some((v) => v.value === 4500)).toBe(true);
      expect(hitRate.values.some((v) => v.value === 0.8)).toBe(true);
      expect(throughput.values.some((v) => v.value === 150)).toBe(true); // 4500/30
      expect(memory.values.some((v) => v.value === 128 * 1024 * 1024)).toBe(
        true
      );
    });

    test('should record streaming batch correctly', async () => {
      // Act
      recordStreamingBatch(1000, 2000, true, 5000);

      // Assert
      const batchDuration = await streamingBatchDuration.get();
      const batches = await streamingBatchesProcessed.get();

      expect(batchDuration.values.some((v) => v.value === 2)).toBe(true); // 2 seconds
      expect(
        batches.values.some(
          (v) =>
            v.labels.repository_size === 'medium' &&
            v.labels.cache_status === 'hit'
        )
      ).toBe(true);
    });

    test('should record streaming batch with cache miss', async () => {
      // Act
      recordStreamingBatch(500, 1500, false, 800);

      // Assert
      const batches = await streamingBatchesProcessed.get();

      expect(
        batches.values.some(
          (v) =>
            v.labels.repository_size === 'small' &&
            v.labels.cache_status === 'miss'
        )
      ).toBe(true);
    });

    test('should record streaming error correctly', async () => {
      // Arrange
      recordStreamingStart(15000);

      // Act
      recordStreamingError('timeout', true, 15000);

      // Assert
      const activeOps = await activeStreamingOperations.get();
      const operations = await streamingOperations.get();
      const errors = await streamingErrors.get();

      expect(activeOps.values[0].value).toBe(0); // Decremented due to error
      expect(
        operations.values.some(
          (v) =>
            v.labels.repository_size === 'large' && v.labels.status === 'failed'
        )
      ).toBe(true);
      expect(
        errors.values.some(
          (v) =>
            v.labels.error_type === 'timeout' &&
            v.labels.recovery_possible === 'yes'
        )
      ).toBe(true);
    });

    test('should record non-recoverable streaming error', async () => {
      // Act
      recordStreamingError('corruption', false, 2000);

      // Assert
      const errors = await streamingErrors.get();

      expect(
        errors.values.some(
          (v) =>
            v.labels.error_type === 'corruption' &&
            v.labels.recovery_possible === 'no'
        )
      ).toBe(true);
    });
  });

  describe('HTTP Metrics Middleware', () => {
    test('should record HTTP request metrics', async () => {
      // Arrange
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        route: { path: '/api/test' },
      } as any;

      let finishCallback: () => void = () => {};
      const mockRes = {
        statusCode: 200,
        on: vi.fn((event, callback) => {
          if (event === 'finish') {
            finishCallback = callback;
          }
        }),
      } as any;

      const mockNext = vi.fn();

      // Act
      metricsMiddleware(mockReq, mockRes, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));

      // Simulate response finishing
      finishCallback();
    });

    test('should handle requests without route', async () => {
      // Arrange
      const mockReq = {
        method: 'POST',
        path: '/unknown',
        route: undefined,
      } as any;

      let finishCallback: () => void = () => {};
      const mockRes = {
        statusCode: 404,
        on: vi.fn((event, callback) => {
          if (event === 'finish') {
            finishCallback = callback;
          }
        }),
      } as any;

      const mockNext = vi.fn();

      // Act
      metricsMiddleware(mockReq, mockRes, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));

      // Simulate response finishing
      finishCallback();
    });
  });

  describe('Metrics Handler', () => {
    test('should return metrics in Prometheus format', async () => {
      // Arrange
      const mockReq = {} as any;
      const mockRes = {
        set: vi.fn(),
        end: vi.fn(),
      } as any;

      // Act
      await metricsHandler(mockReq, mockRes);

      // Assert
      expect(mockRes.set).toHaveBeenCalledWith(
        'Content-Type',
        register.contentType
      );
      expect(mockRes.end).toHaveBeenCalledWith(expect.any(String));
    });
  });

  describe('updateCacheMetrics', () => {
    test('should update hybrid cache metrics when hybrid cache is active', async () => {
      // Arrange
      const mockStats = {
        activeBackend: 'hybrid',
        hybrid: {
          memory: {
            usageBytes: 10485760, // 10MB
            entries: 150,
          },
          disk: {
            entries: 75,
          },
        },
      };
      mockGetStats.mockReturnValue(mockStats);

      // Act
      await updateCacheMetrics();

      // Assert
      expect(cacheHybridMemoryUsage).toBeDefined();
      expect(cacheHybridMemoryEntries).toBeDefined();
      expect(cacheHybridDiskEntries).toBeDefined();
      expect(cacheActiveBackend).toBeDefined();

      // Check metric values
      const memoryUsageValue = await cacheHybridMemoryUsage.get();
      const memoryEntriesValue = await cacheHybridMemoryEntries.get();
      const diskEntriesValue = await cacheHybridDiskEntries.get();
      const activeBackendValue = await cacheActiveBackend.get();

      expect(memoryUsageValue.values[0].value).toBe(10485760);
      expect(memoryEntriesValue.values[0].value).toBe(150);
      expect(diskEntriesValue.values[0].value).toBe(75);
      expect(activeBackendValue.values[0].value).toBe(2); // hybrid = 2
      expect(activeBackendValue.values[0].labels.backend).toBe('hybrid');
    });

    test('should update memory cache metrics when memory cache is active', async () => {
      // Arrange
      const mockStats = {
        activeBackend: 'memory',
        hybrid: null,
      };
      mockGetStats.mockReturnValue(mockStats);

      // Act
      await updateCacheMetrics();

      // Assert
      const activeBackendValue = await cacheActiveBackend.get();
      expect(activeBackendValue.values[0].value).toBe(0); // memory = 0
      expect(activeBackendValue.values[0].labels.backend).toBe('memory');

      // Hybrid-specific metrics should be set to 0
      const memoryUsageValue = await cacheHybridMemoryUsage.get();
      const memoryEntriesValue = await cacheHybridMemoryEntries.get();
      const diskEntriesValue = await cacheHybridDiskEntries.get();

      expect(memoryUsageValue.values[0].value).toBe(0);
      expect(memoryEntriesValue.values[0].value).toBe(0);
      expect(diskEntriesValue.values[0].value).toBe(0);
    });

    test('should update redis cache metrics when redis cache is active', async () => {
      // Arrange
      const mockStats = {
        activeBackend: 'redis',
        hybrid: null,
      };
      mockGetStats.mockReturnValue(mockStats);

      // Act
      await updateCacheMetrics();

      // Assert
      const activeBackendValue = await cacheActiveBackend.get();
      expect(activeBackendValue.values[0].value).toBe(1); // redis = 1
      expect(activeBackendValue.values[0].labels.backend).toBe('redis');
    });

    test('should handle missing cache stats gracefully', async () => {
      // Arrange
      mockGetStats.mockImplementation(() => {
        throw new Error('Cache not available');
      });

      // Act & Assert - should not throw
      await expect(updateCacheMetrics()).resolves.toBeUndefined();
    });

    test('should handle partial cache stats', async () => {
      // Arrange
      const mockStats = {
        activeBackend: 'hybrid',
        hybrid: {
          memory: {
            usageBytes: 5242880,
            entries: 50,
          },
          // Missing disk stats
        },
      };
      mockGetStats.mockReturnValue(mockStats);

      // Act
      await updateCacheMetrics();

      // Assert
      const diskEntriesValue = await cacheHybridDiskEntries.get();

      // Should default to 0 when disk stats are missing
      expect(diskEntriesValue.values[0].value).toBe(0);
    });

    test('should reset metrics for inactive backends', async () => {
      // Arrange - First set hybrid metrics
      const hybridStats = {
        activeBackend: 'hybrid',
        hybrid: {
          memory: { usageBytes: 1048576, entries: 25 },
          disk: { entries: 15 },
        },
      };
      mockGetStats.mockReturnValue(hybridStats);
      await updateCacheMetrics();

      // Then switch to memory backend
      const memoryStats = {
        activeBackend: 'memory',
        hybrid: null,
      };
      mockGetStats.mockReturnValue(memoryStats);

      // Act
      await updateCacheMetrics();

      // Assert - hybrid metrics should be reset to 0
      const memoryUsageValue = await cacheHybridMemoryUsage.get();
      const memoryEntriesValue = await cacheHybridMemoryEntries.get();
      const diskEntriesValue = await cacheHybridDiskEntries.get();

      expect(memoryUsageValue.values[0].value).toBe(0);
      expect(memoryEntriesValue.values[0].value).toBe(0);
      expect(diskEntriesValue.values[0].value).toBe(0);
    });
  });
});
