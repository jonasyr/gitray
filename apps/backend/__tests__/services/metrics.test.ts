import { register } from 'prom-client';
import {
  updateCacheMetrics,
  cacheHybridMemoryUsage,
  cacheHybridMemoryEntries,
  cacheHybridDiskEntries,
  cacheActiveBackend,
} from '../../src/services/metrics';

// Mock the cache service
const mockGetStats = jest.fn();
jest.mock('../../src/services/cache', () => ({
  getCacheStats: mockGetStats,
}));

describe('Metrics Service', () => {
  beforeEach(() => {
    // Clear all metrics before each test
    register.clear();
    jest.clearAllMocks();

    // Re-register the metrics since they were cleared
    register.registerMetric(cacheHybridMemoryUsage);
    register.registerMetric(cacheHybridMemoryEntries);
    register.registerMetric(cacheHybridDiskEntries);
    register.registerMetric(cacheActiveBackend);
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
