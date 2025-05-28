import request from 'supertest';
import express, { Application } from 'express';
import healthRoutes from '../../src/routes/healthRoutes';
import redis from '../../src/services/cache';

jest.mock('../../src/services/cache', () => ({
  __esModule: true,
  default: {
    isHealthy: jest.fn(),
    quit: jest.fn(),
  },
}));

jest.mock('../../src/utils/gracefulShutdown', () => ({
  isServerShuttingDown: jest.fn(() => false),
}));

describe('Health Routes', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
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
      (redis.isHealthy as jest.Mock).mockReturnValue(true);

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
          redis: 'healthy',
          git: expect.any(String),
        },
        system: {
          memory: expect.any(Object),
          loadAverage: expect.any(Array),
          cpus: expect.any(Number),
        },
      });
    });

    test('returns unhealthy status when Redis is down', async () => {
      // Arrange
      (redis.isHealthy as jest.Mock).mockReturnValue(false);

      // Act
      const res = await request(app).get('/health/detailed');

      // Assert
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unhealthy');
      expect(res.body.checks.redis).toBe('unhealthy');
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
      (redis.isHealthy as jest.Mock).mockReturnValue(true);

      // Act
      const res = await request(app).get('/health/ready');

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ready' });
    });

    test('returns not ready when Redis is unhealthy', async () => {
      // Arrange
      (redis.isHealthy as jest.Mock).mockReturnValue(false);

      // Act
      const res = await request(app).get('/health/ready');

      // Assert
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'not_ready' });
    });
  });
});
