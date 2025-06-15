import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Application } from 'express';
import healthRoutes from '../../src/routes/healthRoutes';
import redis from '../../src/services/cache';

vi.mock('../../src/services/cache', () => ({
  __esModule: true,
  default: {
    isHealthy: vi.fn(),
    quit: vi.fn(),
    getStats: vi.fn(),
  },
}));

vi.mock('../../src/utils/gracefulShutdown', () => ({
  isServerShuttingDown: vi.fn(() => false),
}));

// Mock the coordination modules
vi.mock('../../src/services/repositoryCoordinator', () => ({
  repositoryCoordinator: {
    getMetrics: vi.fn(() => ({
      cachedRepositories: 5,
      activeClones: 1,
      coalescedOperations: 10,
      duplicateClonesPrevented: 3,
      cacheHits: 25,
      cacheMisses: 5,
      totalDiskUsageBytes: 1024 * 1024 * 100, // 100MB
    })),
  },
}));

vi.mock('../../src/services/repositoryCache', () => ({
  getRepositoryCacheStats: vi.fn(() => ({
    hitRatios: {
      overall: 0.8,
      rawCommits: 0.7,
      filteredCommits: 0.8,
      aggregatedData: 0.9,
    },
    efficiency: 0.85,
    entries: {
      total: 150,
      byLevel: { l1: 50, l2: 60, l3: 40 },
    },
  })),
}));

// Mock config
vi.mock('../../src/config', () => ({
  config: {
    repositoryCache: {
      enabled: true,
      maxRepositories: 20,
      maxAgeHours: 2,
    },
    operationCoordination: {
      enabled: true,
    },
    cacheStrategy: {
      hierarchicalCaching: true,
    },
  },
}));

describe('Health Routes', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup cache mock with proper getStats return value
    vi.mocked(redis.getStats).mockReturnValue({
      activeBackend: 'hybrid',
      redis: {
        healthy: true,
        connected: true,
      },
      memory: {
        entries: 0,
      },
      hybrid: {
        memory: {
          usageBytes: 5 * 1024 * 1024, // 5MB
          entries: 100,
          limitBytes: 10 * 1024 * 1024, // 10MB limit
        },
        disk: {
          entries: 50,
          limitEntries: 100, // 100 entries limit
        },
        redis: {
          healthy: true,
          connected: true,
        },
        serialization: {
          poolSize: 4,
          activeWorkers: 4,
          queueLength: 0,
          isDestroyed: false,
        },
      },
    });

    app = express();
    app.use('/', healthRoutes);
  });

  describe('GET /health', () => {
    test('returns healthy status', async () => {
      // Act
      const res = await request(app).get('/health');

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      });
    });
  });

  describe('GET /health/detailed', () => {
    test('returns detailed health status when all services are healthy', async () => {
      // Arrange
      vi.mocked(redis.isHealthy).mockReturnValue(true);

      // Act
      const res = await request(app).get('/health/detailed');

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        checks: {
          server: 'healthy',
          cache: 'healthy (hybrid)',
          cacheBackend: 'hybrid',
          cacheMemoryUsage: '5MB',
          cacheMemoryEntries: '100',
          cacheDiskEntries: '50',
          git: expect.any(String),
          coordination: expect.stringContaining('healthy'),
          coordinationCachedRepos: expect.any(Number),
          coordinationActiveClones: expect.any(Number),
          coordinationDuplicatesPrevented: expect.any(Number),
        },
        system: {
          memory: expect.any(Object),
          loadAverage: expect.any(Array),
          cpus: expect.any(Number),
        },
      });
    });

    test('returns detailed health status with memory-only cache', async () => {
      // Arrange
      (redis.isHealthy as any).mockReturnValue(true);
      (redis.getStats as any).mockReturnValue({
        activeBackend: 'memory',
        memory: { entries: 75 },
        redis: { healthy: false },
        hybrid: null,
      });

      // Act
      const res = await request(app).get('/health/detailed');

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.checks.cache).toBe('healthy (memory)');
      expect(res.body.checks.cacheBackend).toBe('memory');
      expect(res.body.checks.cacheMemoryUsage).toBeUndefined();
      expect(res.body.checks.cacheMemoryEntries).toBeUndefined();
      expect(res.body.checks.cacheDiskEntries).toBeUndefined();
    });

    test('returns unhealthy status when Redis is down', async () => {
      // Arrange
      vi.mocked(redis.isHealthy).mockReturnValue(false);

      // Act
      const res = await request(app).get('/health/detailed');

      // Assert
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unhealthy');
      expect(res.body.checks.cache).toBe('unhealthy');
    });

    test('handles cache stats error gracefully', async () => {
      // Arrange
      (redis.isHealthy as any).mockReturnValue(true);
      (redis.getStats as any).mockImplementation(() => {
        throw new Error('Cache stats unavailable');
      });

      // Act
      const res = await request(app).get('/health/detailed');

      // Assert
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unhealthy');
      expect(res.body.checks.cache).toBe('error');
    });
  });

  describe('GET /health/live', () => {
    test('returns alive status', async () => {
      // Act
      const res = await request(app).get('/health/live');

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'alive' });
    });
  });

  describe('GET /health/ready', () => {
    test('returns ready when Redis is healthy', async () => {
      // Arrange
      vi.mocked(redis.isHealthy).mockReturnValue(true);

      // Act
      const res = await request(app).get('/health/ready');

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ready' });
    });

    test('returns not ready when Redis is unhealthy', async () => {
      // Arrange
      vi.mocked(redis.isHealthy).mockReturnValue(false);

      // Act
      const res = await request(app).get('/health/ready');

      // Assert
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'not_ready' });
    });
  });

  describe('GET /coordination', () => {
    test('returns coordination status when enabled', async () => {
      // Act
      const res = await request(app).get('/coordination');

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'enabled',
        message: 'Repository coordination system is enabled',
        configuration: {
          enabled: true,
          maxRepositories: 20,
          maxAgeHours: 2,
          operationCoordination: true,
          hierarchicalCaching: true,
        },
        timestamp: expect.any(String),
      });
    });
  });
});
