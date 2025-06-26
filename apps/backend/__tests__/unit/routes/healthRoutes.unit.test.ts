// apps/backend/__tests__/unit/routes/healthRoutes.unit.test.ts

import { describe, test, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock modules before any imports
const mockRedis = { getStats: vi.fn(), isHealthy: vi.fn() };
const mockLogger = { error: vi.fn() };
const mockSimpleGit = vi.fn();
const mockIsServerShuttingDown = vi.fn();
const mockGetMemoryStats = vi.fn();
const mockGetMemoryMetrics = vi.fn();
const mockRecordFeatureUsage = vi.fn();
const mockGetUserType = vi.fn();
const mockRepositoryCoordinator = { getMetrics: vi.fn() };
const mockGetRepositoryCacheStats = vi.fn();

vi.mock('simple-git', () => ({ __esModule: true, default: mockSimpleGit }));
vi.mock('../../../src/services/cache', () => ({
  __esModule: true,
  default: mockRedis,
}));
vi.mock('../../../src/services/logger', () => ({
  getLogger: () => mockLogger,
}));
vi.mock('../../../src/utils/gracefulShutdown', () => ({
  isServerShuttingDown: mockIsServerShuttingDown,
}));
vi.mock('../../../src/utils/memoryPressureManager', () => ({
  getMemoryStats: mockGetMemoryStats,
  getMemoryMetrics: mockGetMemoryMetrics,
}));
vi.mock('../../../src/services/metrics', () => ({
  recordFeatureUsage: mockRecordFeatureUsage,
  getUserType: mockGetUserType,
}));
vi.mock('../../../src/services/repositoryCoordinator', () => ({
  repositoryCoordinator: mockRepositoryCoordinator,
}));
vi.mock('../../../src/services/repositoryCache', () => ({
  getRepositoryCacheStats: mockGetRepositoryCacheStats,
}));
vi.mock('../../../src/config', () => ({
  config: {
    repositoryCache: { enabled: true, maxRepositories: 50, maxAgeHours: 24 },
    operationCoordination: { enabled: true },
    cacheStrategy: { hierarchicalCaching: true },
    memoryPressure: {
      warningThreshold: 0.75,
      criticalThreshold: 0.85,
      emergencyThreshold: 0.95,
    },
  },
}));

// Helper for setting up test context
function setupDefaultMocks() {
  // Reset all mocks
  vi.clearAllMocks();

  // Default successful states
  mockIsServerShuttingDown.mockReturnValue(false);
  mockRedis.isHealthy.mockReturnValue(true);
  mockRedis.getStats.mockReturnValue({
    activeBackend: 'hybrid',
    hybrid: {
      memory: { usageBytes: 100 * 1024 * 1024, entries: 10 },
      disk: { entries: 5 },
    },
  });
  mockGetUserType.mockReturnValue('anonymous');
  mockRecordFeatureUsage.mockResolvedValue(undefined);

  // Git mock
  const mockGitInstance = {
    raw: vi.fn().mockResolvedValue('git version 2.34.1'),
  };
  mockSimpleGit.mockReturnValue(mockGitInstance);

  // Memory mocks
  mockGetMemoryStats.mockReturnValue({
    pressure: {
      level: 'normal',
      action: 'none',
      systemThreshold: 0.75,
      processThreshold: 0.85,
    },
    system: {
      totalBytes: 8 * 1024 ** 3,
      freeBytes: 4 * 1024 ** 3,
      usedBytes: 4 * 1024 ** 3,
      usagePercentage: 0.5,
    },
    process: {
      heapUsed: 100 * 1024 ** 2,
      heapTotal: 200 * 1024 ** 2,
      rss: 300 * 1024 ** 2,
      external: 50 * 1024 ** 2,
    },
  });
  mockGetMemoryMetrics.mockReturnValue({
    pressureEvents: 0,
    circuitBreakerTrips: 0,
    throttledRequests: 0,
    emergencyEvictions: 0,
    gcTriggered: 0,
  });

  // Coordination mocks
  mockRepositoryCoordinator.getMetrics.mockReturnValue({
    cachedRepositories: 5,
    activeClones: 2,
    duplicateClonesPrevented: 10,
  });
  mockGetRepositoryCacheStats.mockReturnValue({
    hitRatios: { overall: 0.8 },
    entries: { total: 15 },
  });
}

describe('HealthRoutes Unit Tests', () => {
  let app: express.Application;
  let healthRoutes: any;

  beforeEach(async () => {
    setupDefaultMocks();

    // Import router after mocks are set up
    const healthRoutesModule = await import('../../../src/routes/healthRoutes');
    healthRoutes = healthRoutesModule.default;

    app = express();
    app.use(express.json());
    app.use('/', healthRoutes);
  });

  describe('Server State Management', () => {
    test('should return shutting_down status when server is shutting down', async () => {
      // ARRANGE
      mockIsServerShuttingDown.mockReturnValue(true);

      // ACT
      const response = await request(app).get('/health');

      // ASSERT
      expect(response.status).toBe(503);
      expect(response.body.status).toBe('shutting_down');
      expect(mockRecordFeatureUsage).toHaveBeenCalledWith(
        'health_check',
        'anonymous',
        false,
        'api_call'
      );
    });

    test('should return healthy status when server is operational', async () => {
      // ARRANGE
      mockIsServerShuttingDown.mockReturnValue(false);

      // ACT
      const response = await request(app).get('/health');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(mockRecordFeatureUsage).toHaveBeenCalledWith(
        'health_check',
        'anonymous',
        true,
        'api_call'
      );
    });
  });

  describe('Memory Pressure Monitoring', () => {
    test('should return healthy when memory pressure is normal', async () => {
      // ARRANGE
      mockGetMemoryStats.mockReturnValue({
        pressure: { level: 'normal', action: 'none' },
        system: {
          totalBytes: 8 * 1024 ** 3,
          freeBytes: 4 * 1024 ** 3,
          usedBytes: 4 * 1024 ** 3,
          usagePercentage: 0.5,
        },
        process: {
          heapUsed: 100 * 1024 ** 2,
          heapTotal: 200 * 1024 ** 2,
          rss: 300 * 1024 ** 2,
          external: 50 * 1024 ** 2,
        },
      });

      // ACT
      const response = await request(app).get('/health/memory');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.memory.pressure.level).toBe('normal');
    });

    test('should return healthy when memory pressure is at warning level', async () => {
      // ARRANGE
      mockGetMemoryStats.mockReturnValue({
        pressure: { level: 'warning', action: 'start_eviction' },
        system: {
          totalBytes: 4 * 1024 ** 3,
          freeBytes: 1 * 1024 ** 3,
          usedBytes: 3 * 1024 ** 3,
          usagePercentage: 0.75,
        },
        process: {
          heapUsed: 200 * 1024 ** 2,
          heapTotal: 250 * 1024 ** 2,
          rss: 400 * 1024 ** 2,
          external: 75 * 1024 ** 2,
        },
      });

      // ACT
      const response = await request(app).get('/health/memory');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.memory.pressure.level).toBe('warning');
    });

    test('should return unhealthy when memory pressure is critical', async () => {
      // ARRANGE
      mockGetMemoryStats.mockReturnValue({
        pressure: { level: 'critical', action: 'throttle_requests' },
        system: {
          totalBytes: 8 * 1024 ** 3,
          freeBytes: 1 * 1024 ** 3,
          usedBytes: 7 * 1024 ** 3,
          usagePercentage: 0.875,
        },
        process: {
          heapUsed: 500 * 1024 ** 2,
          heapTotal: 600 * 1024 ** 2,
          rss: 700 * 1024 ** 2,
          external: 100 * 1024 ** 2,
        },
      });
      mockGetMemoryMetrics.mockReturnValue({
        pressureEvents: 5,
        circuitBreakerTrips: 2,
        throttledRequests: 10,
        emergencyEvictions: 3,
        gcTriggered: 8,
      });

      // ACT
      const response = await request(app).get('/health/memory');

      // ASSERT
      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.memory.pressure.level).toBe('critical');
      expect(response.body.memory.metrics.pressureEvents).toBe(5);
    });

    test('should handle memory stats failure gracefully', async () => {
      // ARRANGE
      mockGetMemoryStats.mockImplementation(() => {
        throw new Error('Memory stats unavailable');
      });

      // ACT
      const response = await request(app).get('/health/memory');

      // ASSERT
      expect(response.status).toBe(503);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Failed to get memory health status');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Memory health check failed',
        { error: expect.any(Error) }
      );
    });
  });

  describe('Cache System Health', () => {
    test('should return healthy cache status with hybrid backend', async () => {
      // ARRANGE
      mockRedis.isHealthy.mockReturnValue(true);
      mockRedis.getStats.mockReturnValue({
        activeBackend: 'hybrid',
        hybrid: {
          memory: { usageBytes: 100 * 1024 * 1024, entries: 25 },
          disk: { entries: 15 },
        },
      });

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.checks.cache).toBe('healthy (hybrid)');
      expect(response.body.checks.cacheMemoryUsage).toBe('100MB');
    });

    test('should handle cache connection failure', async () => {
      // ARRANGE
      mockRedis.getStats.mockImplementation(() => {
        throw new Error('Cache connection failed');
      });

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.status).toBe(503);
      expect(response.body.checks.cache).toBe('error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cache health check failed',
        expect.any(Error)
      );
    });

    test('should detect unhealthy cache state', async () => {
      // ARRANGE
      mockRedis.isHealthy.mockReturnValue(false);

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.status).toBe(503);
      expect(response.body.checks.cache).toBe('unhealthy');
    });
  });

  describe('Repository Coordination Health', () => {
    test('should report healthy coordination when metrics are good', async () => {
      // ARRANGE
      mockRepositoryCoordinator.getMetrics.mockReturnValue({
        cachedRepositories: 5,
        activeClones: 2,
        duplicateClonesPrevented: 10,
      });
      mockGetRepositoryCacheStats.mockReturnValue({
        hitRatios: { overall: 0.8 },
        entries: { total: 15 },
      });

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.checks.coordination).toBe(
        'healthy (5 repos cached)'
      );
    });

    test('should detect unhealthy coordination when too many active clones', async () => {
      // ARRANGE
      mockRepositoryCoordinator.getMetrics.mockReturnValue({
        cachedRepositories: 15,
        activeClones: 12,
        duplicateClonesPrevented: 5,
      });
      mockGetRepositoryCacheStats.mockReturnValue({
        hitRatios: { overall: 0.05 },
        entries: { total: 20 },
      });

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.status).toBe(503);
      expect(response.body.checks.coordination).toBe('unhealthy');
    });

    test('should handle coordination system failure gracefully', async () => {
      // ARRANGE
      mockRepositoryCoordinator.getMetrics.mockImplementation(() => {
        throw new Error('Coordination system unavailable');
      });

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.body.checks.coordination).toBe('error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Coordination health check failed',
        expect.any(Error)
      );
      // Should not fail overall health for coordination issues
      expect(response.status).toBe(200);
    });
  });

  describe('Git System Health', () => {
    test('should verify git availability', async () => {
      // ARRANGE
      const mockGitInstance = {
        raw: vi.fn().mockResolvedValue('git version 2.34.1'),
      };
      mockSimpleGit.mockReturnValue(mockGitInstance);

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.checks.git).toBe('healthy');
    });

    test('should handle git command failure', async () => {
      // ARRANGE
      const mockGitInstance = {
        raw: vi.fn().mockRejectedValue(new Error('Git not found')),
      };
      mockSimpleGit.mockReturnValue(mockGitInstance);

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.status).toBe(503);
      expect(response.body.checks.git).toBe('error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Git health check failed',
        expect.any(Error)
      );
    });
  });

  describe('Readiness and Liveness Probes', () => {
    test('should return ready when all systems operational', async () => {
      // ARRANGE
      mockIsServerShuttingDown.mockReturnValue(false);
      mockRedis.isHealthy.mockReturnValue(true);

      // ACT
      const response = await request(app).get('/health/ready');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
      expect(mockRecordFeatureUsage).toHaveBeenCalledWith(
        'readiness_probe',
        'anonymous',
        true,
        'api_call'
      );
    });

    test('should return not ready when cache is unhealthy', async () => {
      // ARRANGE
      mockRedis.isHealthy.mockReturnValue(false);

      // ACT
      const response = await request(app).get('/health/ready');

      // ASSERT
      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not_ready');
      expect(mockRecordFeatureUsage).toHaveBeenCalledWith(
        'readiness_probe',
        'anonymous',
        false,
        'api_call'
      );
    });

    test('should always return alive for liveness probe', async () => {
      // ARRANGE
      mockGetUserType.mockReturnValue('authenticated');

      // ACT
      const response = await request(app).get('/health/live');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('alive');
      expect(mockRecordFeatureUsage).toHaveBeenCalledWith(
        'liveness_probe',
        'authenticated',
        true,
        'api_call'
      );
    });
  });

  describe('Configuration and Environment Scenarios', () => {
    test('should handle cache disabled configuration', async () => {
      // ARRANGE - Import and access the mocked config
      const { config } = await import('../../../src/config');
      const originalEnabled = config.repositoryCache.enabled;
      vi.mocked(config.repositoryCache).enabled = false;

      // ACT
      const response = await request(app).get('/coordination');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('disabled');
      expect(response.body.message).toBe('Repository coordination is disabled');

      // CLEANUP
      vi.mocked(config.repositoryCache).enabled = originalEnabled;
    });

    test('should report coordination status when enabled', async () => {
      // ACT
      const response = await request(app).get('/coordination');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('enabled');
      expect(response.body.configuration.enabled).toBe(true);
    });
  });

  describe('Feature Usage Tracking', () => {
    test('should record feature usage for different user types', async () => {
      // ARRANGE
      mockGetUserType.mockReturnValue('premium');

      // ACT
      await request(app).get('/health');

      // ASSERT
      expect(mockRecordFeatureUsage).toHaveBeenCalledWith(
        'health_check',
        'premium',
        true,
        'api_call'
      );
    });

    test('should record failed feature usage on health check failure', async () => {
      // ARRANGE
      mockRedis.isHealthy.mockReturnValue(false);
      mockGetUserType.mockReturnValue('authenticated');

      // ACT
      await request(app).get('/health/detailed');

      // ASSERT
      expect(mockRecordFeatureUsage).toHaveBeenCalledWith(
        'detailed_health_check',
        'authenticated',
        false,
        'api_call'
      );
    });
  });
});
