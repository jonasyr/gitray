// apps/backend/__tests__/unit/routes/healthRoutes.unit.test.ts

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock all dependencies before importing the router
const mockIsServerShuttingDown = vi.fn();
const mockRedis = {
  getStats: vi.fn(),
  isHealthy: vi.fn(),
};
const mockSimpleGit = vi.fn();
const mockGetMemoryStats = vi.fn();
const mockGetMemoryMetrics = vi.fn();
const mockRecordFeatureUsage = vi.fn();
const mockGetUserType = vi.fn();
const mockRepositoryCoordinator = {
  getMetrics: vi.fn(),
};
const mockGetRepositoryCacheStats = vi.fn();

// Mock external dependencies
vi.mock('simple-git', () => ({
  __esModule: true,
  default: mockSimpleGit,
}));

vi.mock('../../../src/services/cache', () => ({
  __esModule: true,
  default: mockRedis,
}));

vi.mock('../../../src/services/logger', () => ({
  getLogger: () => global.mockLogger,
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

vi.mock('../../../src/config', () => ({
  config: {
    repositoryCache: {
      enabled: true,
      maxRepositories: 50,
      maxAgeHours: 24,
    },
    operationCoordination: {
      enabled: true,
    },
    cacheStrategy: {
      hierarchicalCaching: true,
    },
    memoryPressure: {
      warningThreshold: 0.75,
      criticalThreshold: 0.85,
      emergencyThreshold: 0.95,
    },
  },
}));

// Mock dynamic imports
vi.mock('../../../src/services/repositoryCoordinator', () => ({
  repositoryCoordinator: mockRepositoryCoordinator,
}));

vi.mock('../../../src/services/repositoryCache', () => ({
  getRepositoryCacheStats: mockGetRepositoryCacheStats,
}));

describe('HealthRoutes Unit Tests', () => {
  let app: express.Application;
  let healthRoutes: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Don't reset modules here as it clears our mocks

    // Override environment variables to ensure correct config values
    vi.stubEnv('REPO_CACHE_ENABLED', 'true');

    // Setup default successful mocks
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
    mockRecordFeatureUsage.mockReturnValue(undefined);

    // Setup successful git mock
    const mockGitInstance = {
      raw: vi.fn().mockResolvedValue('git version 2.34.1'),
    };
    mockSimpleGit.mockReturnValue(mockGitInstance);

    // Setup memory mocks with complete objects
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

    // Setup coordination mocks
    mockRepositoryCoordinator.getMetrics.mockReturnValue({
      cachedRepositories: 5,
      activeClones: 2,
      duplicateClonesPrevented: 10,
    });

    mockGetRepositoryCacheStats.mockReturnValue({
      hitRatios: { overall: 0.8 },
      entries: { total: 15 },
    });

    // Import router after mocks are set up
    const healthRoutesModule = await import('../../../src/routes/healthRoutes');
    healthRoutes = healthRoutesModule.default;

    // Override config values after import using spyOn
    const configModule = await import('../../../src/config');
    vi.spyOn(
      configModule.config.repositoryCache,
      'enabled',
      'get'
    ).mockReturnValue(true);

    app = express();
    app.use(express.json());
    app.use('/', healthRoutes);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // 🎯 TARGET: Lines 28-34 (Shutdown state)
  describe('Server Shutdown State', () => {
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

    test('should return healthy status when server is not shutting down', async () => {
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

  // 🎯 TARGET: Lines 103-105, 107-108, 110-113 (Cache error handling)
  describe('Cache Health Check Error Paths', () => {
    test('should handle cache health check failure', async () => {
      // ARRANGE
      mockRedis.getStats.mockImplementation(() => {
        throw new Error('Cache connection failed');
      });

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.status).toBe(503);
      expect(response.body.checks.cache).toBe('error');
      expect(global.mockLogger.error).toHaveBeenCalledWith(
        'Cache health check failed',
        expect.any(Error)
      );
    });

    test('should return unhealthy when cache is not healthy', async () => {
      // ARRANGE
      mockRedis.isHealthy.mockReturnValue(false);

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.status).toBe(503);
      expect(response.body.checks.cache).toBe('unhealthy');
    });

    test('should include detailed cache stats when healthy', async () => {
      // ARRANGE
      mockRedis.isHealthy.mockReturnValue(true);
      mockRedis.getStats.mockReturnValue({
        activeBackend: 'hybrid',
        hybrid: {
          memory: { usageBytes: 200 * 1024 * 1024, entries: 25 },
          disk: { entries: 15 },
        },
      });

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.checks.cache).toBe('healthy (hybrid)');
      expect(response.body.checks.cacheMemoryUsage).toBe('200MB');
      expect(response.body.checks.cacheMemoryEntries).toBe('25');
      expect(response.body.checks.cacheDiskEntries).toBe('15');
    });
  });

  // 🎯 TARGET: Lines 120-123 (Coordination error handling)
  describe('Coordination Health Check Error Paths', () => {
    test('should handle coordination health check failure', async () => {
      // ARRANGE
      mockRepositoryCoordinator.getMetrics.mockImplementation(() => {
        throw new Error('Coordination system unavailable');
      });

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.body.checks.coordination).toBe('error');
      expect(global.mockLogger.error).toHaveBeenCalledWith(
        'Coordination health check failed',
        expect.any(Error)
      );
      // Should not fail overall health for coordination issues
      expect(response.status).toBe(200);
    });

    test('should mark coordination unhealthy when metrics indicate problems', async () => {
      // ARRANGE
      mockRepositoryCoordinator.getMetrics.mockReturnValue({
        cachedRepositories: 15,
        activeClones: 12, // Too many active clones
        duplicateClonesPrevented: 5,
      });
      mockGetRepositoryCacheStats.mockReturnValue({
        hitRatios: { overall: 0.05 }, // Poor hit ratio
        entries: { total: 20 },
      });

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.status).toBe(503);
      expect(response.body.checks.coordination).toBe('unhealthy');
    });
  });

  // 🎯 TARGET: Git health check error path
  describe('Git Health Check Error Paths', () => {
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
      expect(global.mockLogger.error).toHaveBeenCalledWith(
        'Git health check failed',
        expect.any(Error)
      );
    });
  });

  // 🎯 TARGET: Lines 159-166 (Coordination endpoint error handling)
  describe('Coordination Endpoint Configuration', () => {
    test('should return disabled status when coordination is disabled', async () => {
      // ARRANGE
      vi.doMock('../../../src/config', () => ({
        config: {
          repositoryCache: { enabled: false },
        },
      }));

      // Re-import with new config
      vi.resetModules();
      const healthRoutesModule = await import(
        '../../../src/routes/healthRoutes'
      );
      const newHealthRoutes = healthRoutesModule.default;
      const newApp = express();
      newApp.use('/', newHealthRoutes);

      // ACT
      const response = await request(newApp).get('/coordination');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('disabled');
      expect(response.body.message).toBe('Repository coordination is disabled');
    });

    test('should return enabled status when coordination is enabled', async () => {
      // ARRANGE
      // Use default mocked config (coordination enabled)

      // ACT
      const response = await request(app).get('/coordination');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('enabled');
      expect(response.body.configuration.enabled).toBe(true);
    });
  });

  // 🎯 TARGET: Lines 187-248 (Memory health endpoint)
  describe('Memory Health Endpoint', () => {
    test('should return healthy memory status when pressure is normal', async () => {
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
      expect(response.body.memory.system.totalGB).toBe(8);
      expect(response.body.memory.process.heapUsedMB).toBe(100);
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

    test('should return healthy when memory pressure is warning level', async () => {
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

    test('should handle memory health check errors', async () => {
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
      expect(global.mockLogger.error).toHaveBeenCalledWith(
        'Memory health check failed',
        { error: expect.any(Error) }
      );
    });
  });

  // Test readiness probe with unhealthy cache
  describe('Readiness Probe Error Paths', () => {
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

    test('should return not ready when server is shutting down', async () => {
      // ARRANGE
      mockIsServerShuttingDown.mockReturnValue(true);
      mockRedis.isHealthy.mockReturnValue(true);

      // ACT
      const response = await request(app).get('/health/ready');

      // ASSERT
      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not_ready');
    });
  });

  // Test feature usage recording with different user types
  describe('Feature Usage Recording', () => {
    test('should record feature usage for authenticated users', async () => {
      // ARRANGE
      mockGetUserType.mockReturnValue('authenticated');

      // ACT
      await request(app).get('/health/live');

      // ASSERT
      expect(mockRecordFeatureUsage).toHaveBeenCalledWith(
        'liveness_probe',
        'authenticated',
        true,
        'api_call'
      );
    });

    test('should record failed feature usage on detailed health check failure', async () => {
      // ARRANGE
      mockRedis.isHealthy.mockReturnValue(false);
      mockGetUserType.mockReturnValue('premium');

      // ACT
      await request(app).get('/health/detailed');

      // ASSERT
      expect(mockRecordFeatureUsage).toHaveBeenCalledWith(
        'detailed_health_check',
        'premium',
        false,
        'api_call'
      );
    });
  });

  // Test edge cases for detailed health calculations
  describe('Detailed Health Edge Cases', () => {
    test('should handle hybrid cache stats without crashing when stats are missing', async () => {
      // ARRANGE
      mockRedis.getStats.mockReturnValue({
        activeBackend: 'memory',
        // No hybrid property
      });

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.checks.cache).toBe('healthy (memory)');
      // Should not have cache memory/disk entries
      expect(response.body.checks.cacheMemoryUsage).toBeUndefined();
    });

    test('should calculate coordination health correctly with edge case metrics', async () => {
      // ARRANGE
      mockRepositoryCoordinator.getMetrics.mockReturnValue({
        cachedRepositories: 0,
        activeClones: 0,
        duplicateClonesPrevented: 0,
      });
      mockGetRepositoryCacheStats.mockReturnValue({
        hitRatios: { overall: 0.11 }, // Just above threshold
        entries: { total: 0 },
      });

      // ACT
      const response = await request(app).get('/health/detailed');

      // ASSERT
      expect(response.status).toBe(200);
      expect(response.body.checks.coordination).toBe(
        'healthy (0 repos cached)'
      );
    });
  });
});
