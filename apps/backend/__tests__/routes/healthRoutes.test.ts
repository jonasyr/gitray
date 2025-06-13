import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from 'vitest';
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

describe('Health Routes', () => {
  let app: Application;

  beforeEach(() => {
    vi.clearAllMocks();
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
});
