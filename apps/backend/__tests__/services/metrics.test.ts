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
  // Enhanced metrics imports
  recordEnhancedCacheOperation,
  recordFeatureUsage,
  recordDetailedError,
  updateServiceHealthScore,
  serviceHealthScore,
  detailedErrors,
  featureUsage,
  cacheHitsEnhanced,
  cacheMissesEnhanced,
  getUserType,
  getRepositoryType,
  updateAllEnhancedMetrics,
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

  // ========================================================================
  // NEW: ENHANCED METRICS TESTS
  // ========================================================================

  describe('Enhanced Metrics Helper Functions', () => {
    test('should correctly categorize user types', () => {
      const mockReq = {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'x-api-key': 'test-key',
        },
        path: '/api/test',
      } as any;

      expect(getUserType(mockReq)).toBe('api'); // API key takes precedence

      const uiReq = {
        headers: { 'user-agent': 'Mozilla/5.0 browser' },
        path: '/dashboard',
      } as any;

      expect(getUserType(uiReq)).toBe('ui');
    });

    test('should correctly categorize repository types', () => {
      expect(getRepositoryType('https://github.com/user/repo.git')).toBe(
        'public'
      );
      expect(getRepositoryType('https://gitlab.com/user/repo.git')).toBe(
        'public'
      );
      expect(getRepositoryType('https://localhost:3000/repo.git')).toBe(
        'private'
      );
      expect(getRepositoryType('https://custom-domain.com/repo.git')).toBe(
        'unknown'
      );
    });
  });

  describe('Enhanced Cache Operations', () => {
    test('should record enhanced cache hit with full context', async () => {
      // Arrange
      const mockReq = {
        headers: { 'user-agent': 'api-client' },
        path: '/api/commits',
      } as any;

      // Act
      recordEnhancedCacheOperation(
        'commits',
        true,
        mockReq,
        'https://github.com/test/repo.git',
        5000
      );

      // Assert
      const enhancedHits = await cacheHitsEnhanced.get();
      expect(enhancedHits.values.length).toBeGreaterThan(0);

      const hitRecord = enhancedHits.values[0];
      expect(hitRecord.labels.operation).toBe('commits');
      expect(hitRecord.labels.tier).toBe('hybrid');
      expect(hitRecord.labels.repo_type).toBe('public');
      expect(hitRecord.labels.user_type).toBe('unknown');
      expect(hitRecord.labels.repo_size).toBe('medium');
    });

    test('should record enhanced cache miss with context', async () => {
      // Act
      recordEnhancedCacheOperation(
        'raw_commits',
        false,
        undefined,
        'https://private.com/repo.git',
        150000
      );

      // Assert
      const enhancedMisses = await cacheMissesEnhanced.get();
      expect(enhancedMisses.values.length).toBeGreaterThan(0);

      const missRecord = enhancedMisses.values[0];
      expect(missRecord.labels.operation).toBe('raw_commits');
      expect(missRecord.labels.repo_size).toBe('huge');
      expect(missRecord.labels.repo_type).toBe('unknown');
    });
  });

  describe('Feature Usage Tracking', () => {
    test('should record feature usage correctly', async () => {
      // Act
      recordFeatureUsage('heatmap_view', 'ui', true, 'click');

      // Assert
      const featureMetrics = await featureUsage.get();
      expect(featureMetrics.values.length).toBeGreaterThan(0);

      const usageRecord = featureMetrics.values[0];
      expect(usageRecord.labels.feature).toBe('heatmap_view');
      expect(usageRecord.labels.user_type).toBe('ui');
      expect(usageRecord.labels.success).toBe('true');
      expect(usageRecord.labels.interaction_type).toBe('click');
    });

    test('should record failed feature usage', async () => {
      // Act
      recordFeatureUsage('export_data', 'api', false, 'api_call');

      // Assert
      const featureMetrics = await featureUsage.get();
      const failureRecord = featureMetrics.values.find(
        (v) => v.labels.success === 'false'
      );
      expect(failureRecord).toBeDefined();
      expect(failureRecord!.labels.feature).toBe('export_data');
      expect(failureRecord!.labels.interaction_type).toBe('api_call');
    });
  });

  describe('Detailed Error Tracking', () => {
    test('should categorize and record network errors', async () => {
      // Arrange
      const networkError = new Error('Connection timeout');

      // Act
      recordDetailedError('git', networkError, {
        userImpact: 'blocking',
        recoveryAction: 'retry',
        repoType: 'public',
        severity: 'critical',
      });

      // Assert
      const errorMetrics = await detailedErrors.get();
      expect(errorMetrics.values.length).toBeGreaterThan(0);

      const errorRecord = errorMetrics.values[0];
      expect(errorRecord.labels.component).toBe('git');
      expect(errorRecord.labels.error_category).toBe('network');
      expect(errorRecord.labels.error_severity).toBe('critical');
      expect(errorRecord.labels.user_impact).toBe('blocking');
      expect(errorRecord.labels.recovery_action).toBe('retry');
      expect(errorRecord.labels.repo_type).toBe('public');
    });

    test('should categorize filesystem errors', async () => {
      // Arrange
      const fsError = new Error('ENOENT: no such file or directory');

      // Act
      recordDetailedError('cache', fsError, {
        severity: 'warning',
      });

      // Assert
      const errorMetrics = await detailedErrors.get();
      const fsErrorRecord = errorMetrics.values.find(
        (v) => v.labels.error_category === 'filesystem'
      );
      expect(fsErrorRecord).toBeDefined();
      expect(fsErrorRecord!.labels.component).toBe('cache');
      expect(fsErrorRecord!.labels.error_severity).toBe('warning');
    });
  });

  describe('Service Health Score', () => {
    test('should calculate and update service health score', async () => {
      // Act
      updateServiceHealthScore('api', {
        errorRate: 0.02, // 2% error rate
        responseTime: 1.5, // 1.5s response time
        cacheHitRate: 0.85, // 85% cache hit rate
        memoryUtilization: 0.7, // 70% memory usage
      });

      // Assert
      const healthMetrics = await serviceHealthScore.get();
      expect(healthMetrics.values.length).toBeGreaterThan(0);

      const healthRecord = healthMetrics.values[0];
      expect(healthRecord.labels.component).toBe('api');
      expect(healthRecord.labels.time_window).toBe('5m');
      expect(healthRecord.value).toBeGreaterThan(0);
      expect(healthRecord.value).toBeLessThanOrEqual(100);
    });

    test('should penalize high error rates in health score', async () => {
      // Act - High error rate scenario
      updateServiceHealthScore('cache', {
        errorRate: 0.1, // 10% error rate (high)
        responseTime: 0.5, // Fast response
        cacheHitRate: 0.9, // Good cache hit rate
        memoryUtilization: 0.5, // Normal memory usage
      });

      // Assert
      const healthMetrics = await serviceHealthScore.get();
      const cacheHealthRecord = healthMetrics.values.find(
        (v) => v.labels.component === 'cache'
      );
      expect(cacheHealthRecord).toBeDefined();
      expect(cacheHealthRecord!.value).toBeLessThan(90); // Should be penalized for high error rate
    });
  });

  describe('Enhanced Metrics Update', () => {
    test('should update all enhanced metrics without errors', async () => {
      // Mock repositoryCoordinator for coordination metrics
      vi.doMock('../../src/services/repositoryCoordinator', () => ({
        repositoryCoordinator: {
          getMetrics: () => ({
            cachedRepositories: 10,
            activeClones: 2,
            coalescedOperations: 5,
            duplicateClonesPrevented: 3,
            cacheHits: 100,
            cacheMisses: 20,
            totalDiskUsageBytes: 1024 * 1024 * 100,
          }),
        },
      }));

      // Act & Assert - should not throw
      await expect(updateAllEnhancedMetrics()).resolves.not.toThrow();
    });
  });
});
