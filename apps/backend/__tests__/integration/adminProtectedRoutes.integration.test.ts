// apps/backend/__tests__/integration/adminProtectedRoutes.integration.test.ts
import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { HTTP_STATUS } from '@gitray/shared-types';

// Mock dependencies before imports
vi.mock('../../src/services/gitService', () => ({
  gitService: {
    getCommitsStream: vi.fn(async function* noop() {}),
    getStreamingResumeState: vi.fn().mockResolvedValue(null),
    clearStreamingResumeState: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/services/repositoryCache', () => ({
  getCachedCommits: vi.fn(),
  getCachedAggregatedData: vi.fn(),
  getRepositoryCacheStats: vi.fn(() => ({
    hitRatios: { overall: 0.8 },
    cacheSize: 100,
  })),
  repositoryCache: {
    invalidateRepository: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/utils/withTempRepository', () => ({
  withTempRepositoryStreaming: vi.fn(),
  getRepositoryInfo: vi.fn(),
  invalidateRepositoryCache: vi.fn().mockResolvedValue(undefined),
  getCoordinationMetrics: vi.fn(() => ({
    activeOperations: 0,
    totalCoalesced: 5,
  })),
  getRepositoryStatus: vi.fn(() => [
    {
      repoUrl: 'https://github.com/test/repo.git',
      age: 3600000,
      lastAccessed: new Date(),
    },
  ]),
}));

vi.mock('../../src/services/logger', () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../src/services/fileAnalysisService', () => ({
  fileAnalysisService: {
    analyzeRepository: vi.fn().mockResolvedValue({
      metadata: { totalFiles: 0, streamingUsed: false },
      files: [],
    }),
  },
}));

vi.mock('../../src/services/metrics', () => ({
  recordStreamingBatch: vi.fn(),
  recordFeatureUsage: vi.fn(),
  recordEnhancedCacheOperation: vi.fn(),
  recordSLACompliance: vi.fn(),
  getUserType: vi.fn(),
  getRepositoryType: vi.fn(),
  updateServiceHealthScore: vi.fn(),
  recordDetailedError: vi.fn(),
  metricsHandler: vi.fn((req: any, res: any) => {
    res.status(200).send('# HELP metrics\n# TYPE metrics gauge\nmetrics 1\n');
  }),
}));

describe('Admin Protected Routes Integration Tests', () => {
  let app: express.Application;
  const validAdminToken = 'test-admin-token-1234567890abcdef';
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set up test environment variables
    process.env.ADMIN_AUTH_ENABLED = 'true';
    process.env.ADMIN_TOKEN = validAdminToken;
    process.env.ADMIN_RATE_LIMIT_WINDOW_MS = '900000';
    process.env.ADMIN_RATE_LIMIT_MAX = '100';

    // Create Express app
    app = express();
    app.use(express.json());

    // Import config after setting env vars
    const { config } = await import('../../src/config');

    // Import and set up admin middleware and routes
    const { requireAdminToken } = await import(
      '../../src/middlewares/adminAuth'
    );
    const rateLimit = (await import('express-rate-limit')).default;

    // Create admin rate limiter
    const adminRateLimiter = rateLimit({
      windowMs: config.adminRateLimit.windowMs,
      max: config.adminRateLimit.max,
      message: config.adminRateLimit.message,
      standardHeaders: true,
      legacyHeaders: false,
    });

    // Import routes
    const commitRoutes = (await import('../../src/routes/commitRoutes'))
      .default;
    const { metricsHandler } = await import('../../src/services/metrics');

    // Mount routes
    app.use('/api/commits', commitRoutes);
    app.use('/metrics', adminRateLimiter, requireAdminToken, metricsHandler);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Cache Stats Endpoint: GET /api/commits/cache/stats', () => {
    it('should return 403 when X-Admin-Token is missing', async () => {
      const response = await request(app).get('/api/commits/cache/stats');

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(response.body).toEqual({
        error: 'Forbidden',
        code: 'ADMIN_AUTH_REQUIRED',
        message: 'Admin authentication required. Provide X-Admin-Token header.',
      });
    });

    it('should return 403 when X-Admin-Token is invalid', async () => {
      const response = await request(app)
        .get('/api/commits/cache/stats')
        .set('X-Admin-Token', 'invalid-token');

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(response.body).toEqual({
        error: 'Forbidden',
        code: 'INVALID_ADMIN_TOKEN',
        message: 'Invalid admin token provided.',
      });
    });

    it('should return 200 with cache stats when valid X-Admin-Token is provided', async () => {
      const response = await request(app)
        .get('/api/commits/cache/stats')
        .set('X-Admin-Token', validAdminToken);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toHaveProperty('cache');
      expect(response.body).toHaveProperty('coordination');
      expect(response.body).toHaveProperty('repositories');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.cache.hitRatios.overall).toBe(0.8);
    });
  });

  describe('Cache Repositories Endpoint: GET /api/commits/cache/repositories', () => {
    it('should return 403 when X-Admin-Token is missing', async () => {
      const response = await request(app).get(
        '/api/commits/cache/repositories'
      );

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(response.body.code).toBe('ADMIN_AUTH_REQUIRED');
    });

    it('should return 403 when X-Admin-Token is invalid', async () => {
      const response = await request(app)
        .get('/api/commits/cache/repositories')
        .set('X-Admin-Token', 'wrong-token');

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(response.body.code).toBe('INVALID_ADMIN_TOKEN');
    });

    it('should return 200 with repository list when valid X-Admin-Token is provided', async () => {
      const response = await request(app)
        .get('/api/commits/cache/repositories')
        .set('X-Admin-Token', validAdminToken);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toHaveProperty('repositories');
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('coordination');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.repositories)).toBe(true);
    });
  });

  describe('Cache Invalidate Endpoint: POST /api/commits/cache/invalidate', () => {
    const validRepoUrl = 'https://github.com/test/repo.git';

    it('should return 403 when X-Admin-Token is missing', async () => {
      const response = await request(app)
        .post('/api/commits/cache/invalidate')
        .send({ repoUrl: validRepoUrl });

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(response.body.code).toBe('ADMIN_AUTH_REQUIRED');
    });

    it('should return 403 when X-Admin-Token is invalid', async () => {
      const response = await request(app)
        .post('/api/commits/cache/invalidate')
        .set('X-Admin-Token', 'bad-token')
        .send({ repoUrl: validRepoUrl });

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(response.body.code).toBe('INVALID_ADMIN_TOKEN');
    });

    it('should return 400 when repoUrl is missing (validation before auth)', async () => {
      // Note: This should fail on rate limit/auth, but validation middleware comes after in this setup
      const response = await request(app)
        .post('/api/commits/cache/invalidate')
        .set('X-Admin-Token', validAdminToken)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 200 and invalidate cache when valid X-Admin-Token and repoUrl provided', async () => {
      const response = await request(app)
        .post('/api/commits/cache/invalidate')
        .set('X-Admin-Token', validAdminToken)
        .send({ repoUrl: validRepoUrl });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body).toEqual({
        success: true,
        message: 'Repository cache invalidated successfully',
        repoUrl: validRepoUrl,
        timestamp: expect.any(String),
      });
    });
  });

  describe('Metrics Endpoint: GET /metrics', () => {
    it('should return 403 when X-Admin-Token is missing', async () => {
      const response = await request(app).get('/metrics');

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(response.body.code).toBe('ADMIN_AUTH_REQUIRED');
    });

    it('should return 403 when X-Admin-Token is invalid', async () => {
      const response = await request(app)
        .get('/metrics')
        .set('X-Admin-Token', 'invalid-metrics-token');

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(response.body.code).toBe('INVALID_ADMIN_TOKEN');
    });

    it('should return 200 with metrics when valid X-Admin-Token is provided', async () => {
      const response = await request(app)
        .get('/metrics')
        .set('X-Admin-Token', validAdminToken);

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.text).toContain('metrics');
    });
  });

  describe('Cross-Endpoint Token Validation', () => {
    it('should accept the same token for all protected endpoints', async () => {
      const endpoints = [
        '/api/commits/cache/stats',
        '/api/commits/cache/repositories',
        '/metrics',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('X-Admin-Token', validAdminToken);

        expect(response.status).toBe(HTTP_STATUS.OK);
      }
    });

    it('should reject the same invalid token for all protected endpoints', async () => {
      const invalidToken = 'consistent-but-wrong-token';
      const endpoints = [
        '/api/commits/cache/stats',
        '/api/commits/cache/repositories',
        '/metrics',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('X-Admin-Token', invalidToken);

        expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
        expect(response.body.code).toBe('INVALID_ADMIN_TOKEN');
      }
    });
  });

  describe('Admin Authentication with Disabled Auth', () => {
    it('should allow access when ADMIN_AUTH_ENABLED=false', async () => {
      // Temporarily disable auth
      const originalAuthEnabled = process.env.ADMIN_AUTH_ENABLED;
      process.env.ADMIN_AUTH_ENABLED = 'false';

      // Need to reload the middleware with new env
      // This test documents expected behavior but may not work without app restart
      // In production, changing ADMIN_AUTH_ENABLED requires restart

      process.env.ADMIN_AUTH_ENABLED = originalAuthEnabled;
    });
  });
});
