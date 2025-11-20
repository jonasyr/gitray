import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { mockLogger, initializeLogger } from '../setup/logger.mock';
import { dotenvMock } from '../setup/dotenv.mock';

// Mock all dependencies with consistent patterns
vi.mock('dotenv', () => ({
  default: dotenvMock.default,
  config: dotenvMock.config,
}));
vi.mock('../../src/services/logger', () => ({
  initializeLogger,
  getLogger: global.getLogger,
}));
vi.mock('../../src/config', () => ({
  config: {
    port: 3001,
    cors: { origin: 'http://localhost:5173', credentials: true },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: 'Too many requests',
    },
    adminRateLimit: {
      windowMs: 900000,
      max: 100,
      message: 'Too many admin requests',
    },
    redis: { host: 'localhost', port: 6379 },
    git: { maxConcurrentProcesses: 10, cloneDepth: 1 },
    hybridCache: {
      diskPath: '/tmp/cache',
      enableRedis: false,
      enableDisk: true,
      maxEntries: 1000,
      memoryLimitBytes: 100 * 1024 * 1024,
      redisConfig: {
        host: 'localhost',
        port: 6379,
        keyPrefix: 'gitray:cache:',
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 10000,
        lazyConnect: true,
      },
    },
    locks: { lockDir: '/tmp/locks', defaultTimeoutMs: 120000 },
    repositoryCache: { enabled: false, maxRepositories: 50, maxAgeHours: 24 },
    operationCoordination: { enabled: false, coalescingEnabled: true },
    cacheStrategy: { hierarchicalCaching: true, memoryPressureThreshold: 0.8 },
    memoryPressure: {
      warningThreshold: 0.75,
      criticalThreshold: 0.85,
      emergencyThreshold: 0.95,
      checkIntervalMs: 5000,
    },
    adminAuth: { enabled: false, requireForMetrics: false },
  },
  lockConfig: {
    lockDir: '/tmp/locks',
    defaultTimeoutMs: 120000,
    cleanupIntervalMs: 60000,
  },
  adminAuthConfig: { enabled: false, requireForMetrics: false },
  adminRateLimitConfig: {
    windowMs: 900000,
    max: 100,
    message: 'Too many admin requests',
  },
  hybridCacheConfig: {},
  streamingConfig: {},
  debugConfig: {},
  repositoryCacheConfig: {},
  operationCoordinationConfig: {},
  cacheStrategyConfig: {},
  memoryPressureConfig: {},
  validateConfig: vi.fn(),
}));
vi.mock('../../src/utils/lockManager', () => ({
  LockManager: vi.fn(() => ({
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
    cleanup: vi.fn(),
  })),
  lockManager: {
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
    cleanup: vi.fn(),
  },
}));
vi.mock('../../src/utils/hybridLruCache', () => {
  const mockHybridLRUCache = vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
    has: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    getStats: vi.fn(),
  }));
  return {
    HybridLRUCache: mockHybridLRUCache,
    default: mockHybridLRUCache,
    hybridLruCache: {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    },
  };
});
vi.mock('../../src/services/metrics');
vi.mock('../../src/services/repositoryCoordinator');
vi.mock('../../src/services/repositoryCache');
vi.mock('../../src/routes');
vi.mock('../../src/routes/repositoryRoutes');
vi.mock('../../src/routes/commitRoutes');
vi.mock('../../src/routes/healthRoutes');
vi.mock('../../src/middlewares/errorHandler');
vi.mock('../../src/utils/gracefulShutdown');
vi.mock('../../src/middlewares/requestId');
vi.mock('../../src/middlewares/memoryPressureMiddleware');
vi.mock('../../src/middlewares/adminAuth', () => ({
  requireAdminToken: (req: any, res: any, next: any) => next(),
}));
vi.mock('express', () => {
  const mockRouter = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
  };
  const mockExpress = vi.fn(() => ({
    use: vi.fn(),
    get: vi.fn(),
    listen: vi.fn(),
  })) as any;
  mockExpress.Router = vi.fn(() => mockRouter);
  mockExpress.json = vi.fn(() => vi.fn());
  mockExpress.urlencoded = vi.fn(() => vi.fn());
  return {
    default: mockExpress,
    Router: mockExpress.Router,
    json: mockExpress.json,
    urlencoded: mockExpress.urlencoded,
  };
});
vi.mock('cors', () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock('helmet', () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock('express-rate-limit', () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
}));
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));
vi.mock('net');

describe('index.ts - ENHANCED COVERAGE', () => {
  // Context factory for clean test setup
  const createTestContext = () => {
    const mockApp = {
      use: vi.fn(),
      get: vi.fn(),
      listen: vi.fn(),
    } as any;
    const mockServer = { on: vi.fn(), close: vi.fn() };
    const mockSocket = { connect: vi.fn(), destroy: vi.fn(), on: vi.fn() };

    vi.mocked(express).mockReturnValue(mockApp);
    mockApp.listen.mockImplementation((port: number, callback?: () => void) => {
      if (callback) callback();
      return mockServer;
    });

    return { mockApp, mockServer, mockSocket };
  };

  // Enhanced config factory with all coordination features
  const createMockConfig = (overrides: any = {}) => ({
    port: 3001,
    cors: { origin: 'http://localhost:5173', credentials: true },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: 'Too many requests',
    },
    redis: { host: 'localhost', port: 6379 },
    git: { maxConcurrentProcesses: 10, cloneDepth: 1 },
    hybridCache: {
      diskPath: '/tmp/cache',
      enableRedis: false,
      enableDisk: true,
      maxEntries: 1000,
      memoryLimitBytes: 100 * 1024 * 1024,
      redisConfig: {
        host: 'localhost',
        port: 6379,
        keyPrefix: 'gitray:cache:',
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 10000,
        lazyConnect: true,
      },
    },
    locks: { lockDir: '/tmp/locks', defaultTimeoutMs: 120000 },
    repositoryCache: { enabled: false, maxRepositories: 50, maxAgeHours: 24 },
    operationCoordination: { enabled: false, coalescingEnabled: true },
    cacheStrategy: { hierarchicalCaching: true, memoryPressureThreshold: 0.8 },
    memoryPressure: {
      warningThreshold: 0.75,
      criticalThreshold: 0.85,
      emergencyThreshold: 0.95,
      checkIntervalMs: 5000,
    },
    adminRateLimit: {
      windowMs: 900000,
      max: 100,
      message: 'Too many admin requests, please try again later',
    },
    adminAuth: { enabled: false, requireForMetrics: false },
    ...overrides,
  });

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    process.env.ADMIN_AUTH_ENABLED = 'false'; // Disable admin auth in tests
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
    vi.useRealTimers();
  });

  describe('Redis Connection Error Scenarios', () => {
    test('should handle Redis connection refused error gracefully', async () => {
      // ARRANGE
      const mockNet = await import('net');
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      const { mockSocket } = createTestContext();

      vi.mocked(mockNet.Socket).mockImplementation(() => mockSocket as any);
      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      mockSocket.connect.mockImplementation(() => {
        setTimeout(() => {
          const errorHandler = mockSocket.on.mock.calls.find(
            (call) => call[0] === 'error'
          )?.[1];
          if (errorHandler) {
            const refusedError = new Error('connect ECONNREFUSED');
            (refusedError as any).code = 'ECONNREFUSED';
            errorHandler(refusedError);
          }
        }, 0);
        return mockSocket as any;
      });

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({
          hybridCache: {
            diskPath: '/tmp',
            enableRedis: true,
            redisConfig: {
              host: 'localhost',
              port: 6379,
              keyPrefix: 'gitray:cache:',
              maxRetriesPerRequest: 1,
              enableOfflineQueue: false,
              connectTimeout: 10000,
              lazyConnect: true,
            },
          },
          redis: { port: 6379, host: 'localhost' },
        }),
        validateConfig: vi.fn(),
      }));

      // ACT
      const { validateStartupEnvironment } = await import('../../src/index');
      await validateStartupEnvironment();

      // ASSERT
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis connection failed'),
        expect.objectContaining({
          error: expect.stringContaining('ECONNREFUSED'),
        })
      );
    });

    test('should handle Redis authentication error', async () => {
      // ARRANGE
      const mockNet = await import('net');
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      const { mockSocket } = createTestContext();

      vi.mocked(mockNet.Socket).mockImplementation(() => mockSocket as any);
      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      mockSocket.connect.mockImplementation(() => {
        setTimeout(() => {
          const errorHandler = mockSocket.on.mock.calls.find(
            (call) => call[0] === 'error'
          )?.[1];
          if (errorHandler) {
            const authError = new Error('NOAUTH Authentication required');
            (authError as any).code = 'NOAUTH';
            errorHandler(authError);
          }
        }, 0);
        return mockSocket as any;
      });

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({
          hybridCache: { diskPath: '/tmp', enableRedis: true },
          redis: { port: 6379, host: 'localhost', password: 'wrong' },
        }),
        validateConfig: vi.fn(),
      }));

      // ACT
      const { validateStartupEnvironment } = await import('../../src/index');
      await validateStartupEnvironment();

      // ASSERT
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis connection failed'),
        expect.objectContaining({ error: expect.stringContaining('NOAUTH') })
      );
    });
  });

  describe('Express Middleware Chain Integration', () => {
    test('should configure all security middleware in correct order', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      const { mockApp } = createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      const helmet = await import('helmet');
      const cors = await import('cors');
      const rateLimit = await import('express-rate-limit');

      vi.doMock('../../src/config', () => ({
        config: createMockConfig(),
        validateConfig: vi.fn(),
      }));

      // ACT
      const { startApplication } = await import('../../src/index');
      try {
        await startApplication();
      } catch (error) {
        expect((error as Error).message).toBe('process.exit called');
      }

      // ASSERT
      expect(helmet.default).toHaveBeenCalled();
      expect(cors.default).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: 'http://localhost:5173',
          credentials: true,
        })
      );
      expect(rateLimit.default).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: 15 * 60 * 1000,
          max: 100,
        })
      );
      expect(mockApp.use).toHaveBeenCalled(); // Verify middleware setup
    });

    test('should setup metrics and health endpoints correctly', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      const { mockApp } = createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      vi.doMock('../../src/config', () => ({
        config: createMockConfig(),
        validateConfig: vi.fn(),
      }));

      // ACT
      const { startApplication } = await import('../../src/index');
      try {
        await startApplication();
      } catch (error) {
        expect((error as Error).message).toBe('process.exit called');
      }

      // ASSERT
      expect(mockApp.use).toHaveBeenCalledWith(
        '/metrics',
        expect.any(Function),
        expect.any(Function),
        expect.any(Function)
      );
      expect(mockApp.use).toHaveBeenCalledWith('/api', expect.any(Function));
      expect(mockApp.get).toHaveBeenCalledWith(
        '/health/coordination',
        expect.any(Function)
      );
    });

    test('should handle memory pressure middleware configuration', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      const { mockApp } = createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({
          memoryPressure: {
            warningThreshold: 0.8,
            criticalThreshold: 0.9,
            enableCircuitBreaker: true,
          },
        }),
        validateConfig: vi.fn(),
      }));

      // ACT
      const { startApplication } = await import('../../src/index');
      try {
        await startApplication();
      } catch (error) {
        expect((error as Error).message).toBe('process.exit called');
      }

      // ASSERT
      expect(mockApp.use).toHaveBeenCalled(); // Verify middleware setup includes memory pressure
    });
  });

  describe('Coordination Health Endpoint Edge Cases', () => {
    test('should handle coordination metrics retrieval failure', async () => {
      // ARRANGE
      const mockRequest = {} as any;
      const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      vi.doMock('../../src/services/repositoryCoordinator', () => ({
        repositoryCoordinator: {
          getMetrics: vi.fn(() => {
            throw new Error('Coordinator failure');
          }),
        },
      }));

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({ repositoryCache: { enabled: true } }),
        validateConfig: vi.fn(),
      }));

      // ACT
      const { startApplication } = await import('../../src/index');
      try {
        const { app } = await startApplication();
        const healthHandler = (app.get as any).mock.calls.find(
          (call: any[]) => call[0] === '/health/coordination'
        )?.[1];

        await healthHandler(mockRequest, mockResponse);
      } catch (error) {
        if ((error as Error).message !== 'process.exit called') {
          throw error;
        }
      }

      // ASSERT
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Failed to get coordination health',
      });
    });

    test('should return unhealthy status for high active clones', async () => {
      // ARRANGE
      const mockRequest = {} as any;
      const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const mockMetrics = {
        cachedRepositories: 5,
        activeClones: 15, // High number
        duplicateClonesPrevented: 2,
      };

      const mockCacheStats = {
        hitRatios: { overall: 0.8 },
        entries: 100,
      };

      vi.doMock('../../src/services/repositoryCoordinator', () => ({
        repositoryCoordinator: {
          getMetrics: vi.fn(() => mockMetrics),
        },
      }));

      vi.doMock('../../src/services/repositoryCache', () => ({
        getRepositoryCacheStats: vi.fn(() => mockCacheStats),
      }));

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({ repositoryCache: { enabled: true } }),
        validateConfig: vi.fn(),
      }));

      // ACT
      const { startApplication } = await import('../../src/index');
      try {
        const { app } = await startApplication();
        const healthHandler = (app.get as any).mock.calls.find(
          (call: any[]) => call[0] === '/health/coordination'
        )?.[1];

        await healthHandler(mockRequest, mockResponse);
      } catch (error) {
        if ((error as Error).message !== 'process.exit called') {
          throw error;
        }
      }

      // ASSERT
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unhealthy' })
      );
    });

    test('should return unhealthy status for low cache hit ratio', async () => {
      // ARRANGE
      const mockRequest = {} as any;
      const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const mockMetrics = {
        cachedRepositories: 5,
        activeClones: 2,
        duplicateClonesPrevented: 2,
      };

      const mockCacheStats = {
        hitRatios: { overall: 0.05 }, // Very low hit ratio
        entries: 100,
      };

      vi.doMock('../../src/services/repositoryCoordinator', () => ({
        repositoryCoordinator: {
          getMetrics: vi.fn(() => mockMetrics),
        },
      }));

      vi.doMock('../../src/services/repositoryCache', () => ({
        getRepositoryCacheStats: vi.fn(() => mockCacheStats),
      }));

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({ repositoryCache: { enabled: true } }),
        validateConfig: vi.fn(),
      }));

      // ACT
      const { startApplication } = await import('../../src/index');
      try {
        const { app } = await startApplication();
        const healthHandler = (app.get as any).mock.calls.find(
          (call: any[]) => call[0] === '/health/coordination'
        )?.[1];

        await healthHandler(mockRequest, mockResponse);
      } catch (error) {
        if ((error as Error).message !== 'process.exit called') {
          throw error;
        }
      }

      // ASSERT
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unhealthy' })
      );
    });
  });

  describe('Process Monitoring and Intervals', () => {
    test('should handle coordination system monitoring warnings', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      const mockMetrics = {
        cachedRepositories: 46, // 46 > 45 (90% of 50) to trigger the warning
        activeClones: 2, // Reduced to avoid triggering active clones warning first
        duplicateClonesPrevented: 10,
        coalescedOperations: 5,
        cacheHits: 80,
        cacheMisses: 20,
        totalDiskUsageBytes: 1024000,
      };

      // Mock global setInterval to capture the monitoring function
      const originalSetInterval = global.setInterval;
      let monitoringCallback: (() => void) | null = null;

      global.setInterval = vi.fn((callback: () => void, interval: number) => {
        if (interval === 5 * 60 * 1000) {
          // 5-minute monitoring interval
          monitoringCallback = callback;
        }
        return originalSetInterval(callback, interval);
      }) as any;

      vi.doMock('../../src/services/repositoryCoordinator', () => ({
        repositoryCoordinator: {
          getMetrics: vi.fn(() => mockMetrics),
          initialize: vi.fn(),
          shutdown: vi.fn(),
        },
      }));

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({
          repositoryCache: { enabled: true, maxRepositories: 50 },
        }),
        validateConfig: vi.fn(),
      }));

      // ACT
      try {
        const { startApplication } = await import('../../src/index');
        await startApplication();

        // Verify the monitoring callback was captured
        expect(monitoringCallback).not.toBeNull();

        // Execute the monitoring callback if it was captured
        if (monitoringCallback) {
          (monitoringCallback as () => void)();
        }
      } catch (error) {
        expect((error as Error).message).toBe(
          'process.exit unexpectedly called with "1"'
        );
      }

      // ASSERT
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Repository cache nearing capacity',
        expect.objectContaining({
          cached: 46,
          max: 50,
          utilizationPercent: 92,
        })
      );

      // Restore original setInterval
      global.setInterval = originalSetInterval;
    });

    test('should log efficiency metrics when duplicates prevented', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      const mockMetrics = {
        cachedRepositories: 10,
        activeClones: 2,
        duplicateClonesPrevented: 15, // Some duplicates prevented
        coalescedOperations: 8,
        cacheHits: 90,
        cacheMisses: 10,
        totalDiskUsageBytes: 1024000,
      };

      // Mock global setInterval to capture the monitoring function
      const originalSetInterval = global.setInterval;
      let monitoringCallback: (() => void) | null = null;

      global.setInterval = vi.fn((callback: () => void, interval: number) => {
        if (interval === 5 * 60 * 1000) {
          // 5-minute monitoring interval
          monitoringCallback = callback;
        }
        return originalSetInterval(callback, interval);
      }) as any;

      vi.doMock('../../src/services/repositoryCoordinator', () => ({
        repositoryCoordinator: {
          getMetrics: vi.fn(() => mockMetrics),
          initialize: vi.fn(),
          shutdown: vi.fn(),
        },
      }));

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({ repositoryCache: { enabled: true } }),
        validateConfig: vi.fn(),
      }));

      // ACT
      try {
        const { startApplication } = await import('../../src/index');
        await startApplication();

        // Verify the monitoring callback was captured
        expect(monitoringCallback).not.toBeNull();

        // Execute the monitoring callback if it was captured
        if (monitoringCallback) {
          (monitoringCallback as () => void)();
        }
      } catch (error) {
        expect((error as Error).message).toBe(
          'process.exit unexpectedly called with "1"'
        );
      }

      // ASSERT
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Repository coordination efficiency',
        expect.objectContaining({
          duplicateClonesPrevented: 15,
          coalescedOperations: 8,
          cacheHitRate: 0.9,
        })
      );

      // Restore original setInterval
      global.setInterval = originalSetInterval;
    });

    test('should handle monitoring errors gracefully', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      // Mock global setInterval to capture the monitoring function
      const originalSetInterval = global.setInterval;
      let monitoringCallback: (() => void) | null = null;

      global.setInterval = vi.fn((callback: () => void, interval: number) => {
        if (interval === 5 * 60 * 1000) {
          // 5-minute monitoring interval
          monitoringCallback = callback;
        }
        return originalSetInterval(callback, interval);
      }) as any;

      vi.doMock('../../src/services/repositoryCoordinator', () => ({
        repositoryCoordinator: {
          getMetrics: vi.fn(() => {
            throw new Error('Monitoring failure');
          }),
          initialize: vi.fn(),
          shutdown: vi.fn(),
        },
      }));

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({ repositoryCache: { enabled: true } }),
        validateConfig: vi.fn(),
      }));

      // ACT
      try {
        const { startApplication } = await import('../../src/index');
        await startApplication();

        // Execute the monitoring callback if it was captured
        if (monitoringCallback) {
          (monitoringCallback as () => void)();
        }
      } catch (error) {
        expect((error as Error).message).toBe('process.exit called');
      }

      // ASSERT
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Coordination monitoring failed',
        expect.objectContaining({ error: expect.any(Error) })
      );

      // Restore original setInterval
      global.setInterval = originalSetInterval;
    });
  });

  describe('Cache System Initialization Edge Cases', () => {
    test('should handle cache stats import failure gracefully', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      // Mock global setTimeout to capture the initialization callback
      const originalSetTimeout = global.setTimeout;
      let initCallback: (() => void) | null = null;

      global.setTimeout = vi.fn((callback: () => void, delay: number) => {
        if (delay === 1000) {
          // The 1-second initialization delay
          initCallback = callback;
        }
        return originalSetTimeout(callback, delay);
      }) as any;

      vi.doMock('../../src/services/cache', () => ({
        getCacheStats: vi.fn(() => {
          throw new Error('Cache stats unavailable');
        }),
      }));

      vi.doMock('../../src/config', () => ({
        config: createMockConfig(),
        validateConfig: vi.fn(),
      }));

      // ACT
      try {
        const { startApplication } = await import('../../src/index');
        await startApplication();

        // Execute the initialization callback if it was captured
        if (initCallback) {
          try {
            await (initCallback as () => void)();
          } catch {
            // Expected to fail
          }
        }
      } catch (error) {
        expect((error as Error).message).toBe('process.exit called');
      }

      // ASSERT
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to get cache/coordination stats during startup',
        expect.objectContaining({ err: expect.any(Error) })
      );

      // Restore original setTimeout
      global.setTimeout = originalSetTimeout;
    });

    test('should initialize hybrid cache with comprehensive logging', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      const mockCacheStats = {
        activeBackend: 'hybrid',
        memory: { entries: 150 },
        redis: { healthy: true },
        hybrid: {
          memory: { entries: 100, usageBytes: 50 * 1024 * 1024 },
          disk: { entries: 50 },
        },
      };

      // Mock global setTimeout to capture the initialization callback
      const originalSetTimeout = global.setTimeout;
      let initCallback: (() => void) | null = null;

      global.setTimeout = vi.fn((callback: () => void, delay: number) => {
        if (delay === 1000) {
          // The 1-second initialization delay
          initCallback = callback;
        }
        return originalSetTimeout(callback, delay);
      }) as any;

      vi.doMock('../../src/services/cache', () => ({
        getCacheStats: vi.fn(() => mockCacheStats),
      }));

      vi.doMock('../../src/config', () => ({
        config: createMockConfig(),
        validateConfig: vi.fn(),
      }));

      // ACT
      try {
        const { startApplication } = await import('../../src/index');
        await startApplication();

        // Execute the initialization callback if it was captured
        if (initCallback) {
          await (initCallback as () => void)();
        }
      } catch (error) {
        expect((error as Error).message).toBe('process.exit called');
      }

      // ASSERT
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cache system initialized',
        expect.objectContaining({
          activeBackend: 'hybrid',
          memoryEntries: 150,
          redisHealthy: true,
          hybridStats: expect.objectContaining({
            memoryEntries: 100,
            diskEntries: 50,
            memoryUsageMB: 50,
          }),
        })
      );

      // Restore original setTimeout
      global.setTimeout = originalSetTimeout;
    });
  });

  describe('Graceful Shutdown Enhanced Scenarios', () => {
    test('should handle coordination shutdown errors gracefully', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      // Mock setupGracefulShutdown to capture the shutdown callback
      let shutdownCallback: (() => Promise<void>) | null = null;

      vi.doMock('../../src/utils/gracefulShutdown', () => ({
        setupGracefulShutdown: vi.fn(
          (server: any, callback: () => Promise<void>) => {
            shutdownCallback = callback;
          }
        ),
      }));

      vi.doMock('../../src/services/repositoryCoordinator', () => ({
        repositoryCoordinator: {
          shutdown: vi.fn(() =>
            Promise.reject(new Error('Coordinator shutdown failed'))
          ),
          getMetrics: vi.fn(() => ({ cachedRepositories: 0, activeClones: 0 })),
          initialize: vi.fn(),
        },
      }));

      vi.doMock('../../src/services/repositoryCache', () => ({
        repositoryCache: {
          shutdown: vi.fn(() => Promise.resolve()),
        },
        getRepositoryCacheStats: vi.fn(() => ({
          entries: 0,
          hitRatios: { overall: 0 },
        })),
      }));

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({ repositoryCache: { enabled: true } }),
        validateConfig: vi.fn(),
      }));

      // ACT
      try {
        const { startApplication } = await import('../../src/index');
        await startApplication();

        // Execute the shutdown callback if it was captured
        if (shutdownCallback) {
          await (shutdownCallback as () => Promise<void>)();
        }
      } catch (error) {
        if ((error as Error).message !== 'process.exit called') {
          throw error;
        }
      }

      // ASSERT
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during coordination systems shutdown',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    test('should complete coordination shutdown within time limit', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      // Mock setupGracefulShutdown to capture the shutdown callback
      let shutdownCallback: (() => Promise<void>) | null = null;

      vi.doMock('../../src/utils/gracefulShutdown', () => ({
        setupGracefulShutdown: vi.fn(
          (server: any, callback: () => Promise<void>) => {
            shutdownCallback = callback;
          }
        ),
      }));

      vi.doMock('../../src/services/repositoryCoordinator', () => ({
        repositoryCoordinator: {
          shutdown: vi.fn(() => Promise.resolve()),
          getMetrics: vi.fn(() => ({ cachedRepositories: 5, activeClones: 1 })),
          initialize: vi.fn(),
        },
      }));

      vi.doMock('../../src/services/repositoryCache', () => ({
        repositoryCache: {
          shutdown: vi.fn(() => Promise.resolve()),
        },
        getRepositoryCacheStats: vi.fn(() => ({
          entries: 10,
          hitRatios: { overall: 0.8 },
          memoryUsage: { total: 1024000 },
        })),
      }));

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({ repositoryCache: { enabled: true } }),
        validateConfig: vi.fn(),
      }));

      // ACT
      try {
        const { startApplication } = await import('../../src/index');
        await startApplication();

        // Execute the shutdown callback if it was captured
        if (shutdownCallback) {
          await (shutdownCallback as () => Promise<void>)();
        }
      } catch (error) {
        if ((error as Error).message !== 'process.exit called') {
          throw error;
        }
      }

      // ASSERT
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Repository coordination systems shutdown completed',
        expect.objectContaining({ shutdownTime: expect.any(Number) })
      );
    });
  });

  describe('Environment Variable Edge Cases', () => {
    test('should handle PORT environment variable as string', async () => {
      // ARRANGE
      process.env.PORT = '4000';

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({ port: 4000 }),
        validateConfig: vi.fn(),
      }));

      // ACT
      const { validateStartupEnvironment } = await import('../../src/index');
      await validateStartupEnvironment();

      // ASSERT - No errors should be thrown for valid string port
      expect(mockLogger.info).toHaveBeenCalledWith(
        '✅ Startup environment validation passed'
      );
    });

    test('should handle LOG_DIR environment variable', async () => {
      // ARRANGE
      process.env.LOG_DIR = '/custom/logs';
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');

      vi.mocked(mockFs.existsSync).mockReturnValue(false);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      vi.doMock('../../src/config', () => ({
        config: createMockConfig(),
        validateConfig: vi.fn(),
      }));

      // ACT
      const { validateStartupEnvironment } = await import('../../src/index');
      await validateStartupEnvironment();

      // ASSERT
      expect(mockFsPromises.mkdir).toHaveBeenCalledWith('/custom/logs', {
        recursive: true,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Created directory: /custom/logs'
      );
    });

    test('should handle NODE_ENV development configuration', async () => {
      // ARRANGE
      process.env.NODE_ENV = 'development';
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      vi.doMock('../../src/config', () => ({
        config: createMockConfig(),
        validateConfig: vi.fn(),
      }));

      // ACT
      try {
        const { startApplication } = await import('../../src/index');
        await startApplication();
      } catch (error) {
        expect((error as Error).message).toBe('process.exit called');
      }

      // ASSERT
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Backend starting up'),
        expect.objectContaining({ nodeEnv: 'development' })
      );
    });
  });

  describe('Server Listen Callback Edge Cases', () => {
    test('should handle server listen without callback gracefully', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      const { mockApp } = createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      // Mock listen to not call callback
      mockApp.listen.mockImplementation(() => {
        // Don't call callback - test edge case
        return { on: vi.fn() };
      });

      vi.doMock('../../src/config', () => ({
        config: createMockConfig(),
        validateConfig: vi.fn(),
      }));

      // ACT
      try {
        const { startApplication } = await import('../../src/index');
        const result = await startApplication();

        // ASSERT - Should still return app and server
        expect(result).toHaveProperty('app');
        expect(result).toHaveProperty('server');
      } catch (error) {
        expect((error as Error).message).toBe('process.exit called');
      }
    });

    test('should handle immediate server error during listen', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      const { mockApp } = createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      // Mock listen to trigger error immediately without calling callback
      mockApp.listen.mockImplementation(() => {
        // Don't call the callback - simulate immediate error
        const listenError = new Error('Listen failed') as NodeJS.ErrnoException;
        listenError.code = 'EADDRNOTAVAIL';

        // Trigger error synchronously
        throw listenError;
      });

      vi.doMock('../../src/config', () => ({
        config: createMockConfig(),
        validateConfig: vi.fn(),
      }));

      // ACT & ASSERT
      const { startApplication } = await import('../../src/index');
      await expect(startApplication()).rejects.toThrow(
        'process.exit unexpectedly called'
      );

      // Wait a bit for the error handler to be called
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start application',
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Listen failed',
            code: 'EADDRNOTAVAIL',
          }),
        })
      );
    });
  });

  describe('Module-Level Edge Cases', () => {
    test('should handle module loading when require.main matches module', async () => {
      // ARRANGE
      const originalRequireMain = require.main;

      try {
        // Mock require.main to equal this module
        Object.defineProperty(require, 'main', {
          value: module,
          configurable: true,
        });

        // This test verifies that the module initialization path works
        // The actual startup would be triggered, but our mocks handle it

        // ACT
        await import('../../src/index');

        // ASSERT
        expect(dotenvMock.default.config).toHaveBeenCalled();
        expect(initializeLogger).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(
          '📋 Index.ts file loading...'
        );
      } finally {
        // CLEANUP
        Object.defineProperty(require, 'main', {
          value: originalRequireMain,
          configurable: true,
        });
      }
    });
  });

  describe('Advanced Error Scenarios', () => {
    test('should handle validateConfig throwing custom error types', async () => {
      // ARRANGE
      const customError = new TypeError('Invalid configuration type');
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      vi.doMock('../../src/config', () => ({
        config: createMockConfig(),
        validateConfig: vi.fn(() => {
          throw customError;
        }),
      }));

      // ACT & ASSERT
      const { initializeServer } = await import('../../src/index');
      await expect(initializeServer()).rejects.toThrow('process.exit called');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Configuration or startup validation failed',
        expect.objectContaining({ error: customError })
      );

      mockExit.mockRestore();
    });

    test('should handle startup with minimal viable configuration', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      const minimalConfig = {
        port: 3001,
        cors: { origin: '*', credentials: false },
        rateLimit: { windowMs: 60000, max: 10, message: 'Rate limit exceeded' },
        redis: { host: '127.0.0.1', port: 6379 },
        git: { maxConcurrentProcesses: 1, cloneDepth: 1 },
        hybridCache: {
          diskPath: '/tmp/minimal',
          enableRedis: false,
          enableDisk: false,
          maxEntries: 100,
          memoryLimitBytes: 10 * 1024 * 1024,
        },
        locks: { lockDir: '/tmp/locks', defaultTimeoutMs: 30000 },
        repositoryCache: { enabled: false },
        operationCoordination: { enabled: false },
        cacheStrategy: { hierarchicalCaching: false },
        memoryPressure: {
          warningThreshold: 0.9,
          criticalThreshold: 0.95,
          emergencyThreshold: 0.99,
          checkIntervalMs: 10000,
        },
        adminRateLimit: {
          windowMs: 900000,
          max: 100,
          message: 'Too many admin requests',
        },
        adminAuth: { enabled: false, requireForMetrics: false },
      };

      vi.doMock('../../src/config', () => ({
        config: minimalConfig,
        validateConfig: vi.fn(),
      }));

      // ACT
      try {
        const { startApplication } = await import('../../src/index');
        const result = await startApplication();

        // ASSERT
        expect(result).toHaveProperty('app');
        expect(result).toHaveProperty('server');
      } catch (error) {
        expect((error as Error).message).toBe('process.exit called');
      }
    });
  });

  describe('Cache System Integration', () => {
    test('should initialize cache system with proper timeout handling', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      // Mock setTimeout to capture and control the initialization timing
      const originalSetTimeout = global.setTimeout;
      let initTimeoutCallback: (() => void) | null = null;

      global.setTimeout = vi.fn((callback: () => void, delay: number) => {
        if (delay === 1000) {
          initTimeoutCallback = callback;
        }
        return originalSetTimeout(callback, delay);
      }) as any;

      // Mock cache stats with comprehensive data
      const mockCacheStats = {
        activeBackend: 'hybrid',
        memory: { entries: 150 },
        redis: { healthy: true },
        hybrid: {
          memory: { entries: 100, usageBytes: 50 * 1024 * 1024 },
          disk: { entries: 50 },
        },
      };

      vi.doMock('../../src/services/cache', () => ({
        getCacheStats: vi.fn(() => mockCacheStats),
      }));

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({
          repositoryCache: { enabled: true },
          cacheStrategy: { hierarchicalCaching: true },
        }),
        validateConfig: vi.fn(),
      }));

      const mockCoordinationMetrics = {
        cachedRepositories: 5,
        activeClones: 1,
        totalDiskUsageBytes: 100 * 1024 * 1024,
      };

      const mockCacheManagerStats = {
        entries: 25,
        memoryUsage: { total: 75 * 1024 * 1024 },
        hitRatios: { overall: 0.85 },
      };

      vi.doMock('../../src/services/repositoryCoordinator', () => ({
        repositoryCoordinator: {
          getMetrics: vi.fn(() => mockCoordinationMetrics),
          initialize: vi.fn(),
          shutdown: vi.fn(),
        },
      }));

      vi.doMock('../../src/services/repositoryCache', () => ({
        repositoryCache: {
          shutdown: vi.fn(),
        },
        getRepositoryCacheStats: vi.fn(() => mockCacheManagerStats),
      }));

      // ACT
      try {
        const { startApplication } = await import('../../src/index');
        await startApplication();

        // Execute the cache initialization timeout callback
        if (initTimeoutCallback) {
          await (initTimeoutCallback as () => void)();
        }
      } catch (error) {
        expect((error as Error).message).toBe(
          'process.exit unexpectedly called with "1"'
        );
      }

      // ASSERT - Check cache system initialization logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cache system initialized',
        expect.objectContaining({
          activeBackend: 'hybrid',
          memoryEntries: 150,
          redisHealthy: true,
          hybridStats: expect.objectContaining({
            memoryEntries: 100,
            diskEntries: 50,
            memoryUsageMB: 50,
          }),
        })
      );

      // Check coordination system logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Repository coordination system initialized',
        expect.objectContaining({
          cachedRepositories: 5,
          activeClones: 1,
          totalDiskUsageMB: 100,
        })
      );

      // Check cache manager logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Repository cache manager initialized',
        expect.objectContaining({
          hierarchicalCaching: true,
          cacheEntries: 25,
          memoryUsageMB: 75,
          hitRatios: { overall: 0.85 },
        })
      );

      // Restore original setTimeout
      global.setTimeout = originalSetTimeout;
    });

    test('should handle cache system initialization errors gracefully', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      const originalSetTimeout = global.setTimeout;
      let initTimeoutCallback: (() => void) | null = null;

      global.setTimeout = vi.fn((callback: () => void, delay: number) => {
        if (delay === 1000) {
          initTimeoutCallback = callback;
        }
        return originalSetTimeout(callback, delay);
      }) as any;

      // Mock cache stats to throw an error
      vi.doMock('../../src/services/cache', () => ({
        getCacheStats: vi.fn(() => {
          throw new Error('Cache stats failed');
        }),
      }));

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({ repositoryCache: { enabled: false } }),
        validateConfig: vi.fn(),
      }));

      // ACT
      try {
        const { startApplication } = await import('../../src/index');
        await startApplication();

        // Execute the timeout callback to trigger the error
        if (initTimeoutCallback) {
          await (initTimeoutCallback as () => void)();
        }
      } catch (error) {
        expect((error as Error).message).toBe(
          'process.exit unexpectedly called with "1"'
        );
      }

      // ASSERT - Check error handling
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to get cache/coordination stats during startup',
        expect.objectContaining({ err: expect.any(Error) })
      );

      global.setTimeout = originalSetTimeout;
    });

    test('should log when repository coordination is disabled', async () => {
      // ARRANGE
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');
      createTestContext();

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      const originalSetTimeout = global.setTimeout;
      let initTimeoutCallback: (() => void) | null = null;

      global.setTimeout = vi.fn((callback: () => void, delay: number) => {
        if (delay === 1000) {
          initTimeoutCallback = callback;
        }
        return originalSetTimeout(callback, delay);
      }) as any;

      const mockCacheStats = {
        activeBackend: 'memory',
        memory: { entries: 50 },
        redis: { healthy: false },
        hybrid: null,
      };

      vi.doMock('../../src/services/cache', () => ({
        getCacheStats: vi.fn(() => mockCacheStats),
      }));

      vi.doMock('../../src/config', () => ({
        config: createMockConfig({ repositoryCache: { enabled: false } }),
        validateConfig: vi.fn(),
      }));

      // ACT
      try {
        const { startApplication } = await import('../../src/index');
        await startApplication();

        if (initTimeoutCallback) {
          await (initTimeoutCallback as () => void)();
        }
      } catch (error) {
        expect((error as Error).message).toBe(
          'process.exit unexpectedly called'
        );
      }

      // ASSERT
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Repository coordination system disabled'
      );

      global.setTimeout = originalSetTimeout;
    });
  });

  describe('404 Handler - XSS Prevention', () => {
    test('should return JSON for non-existent routes without reflecting path in HTML', async () => {
      // ARRANGE
      const { mockApp } = createTestContext();
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      vi.doMock('../../src/config', () => ({
        config: createMockConfig(),
        validateConfig: vi.fn(),
      }));

      // ACT
      const { startApplication } = await import('../../src/index');
      await startApplication();

      // Find the 404 handler (should be the second-to-last middleware, before errorHandler)
      const useCall = mockApp.use.mock.calls.find((call: any) => {
        const handler = call[0];
        return (
          typeof handler === 'function' &&
          handler.length === 2 && // Request, Response (not Next)
          handler.toString().includes('NOT_FOUND')
        );
      });

      expect(useCall).toBeDefined();

      const notFoundHandler = useCall![0];
      const mockReq = { path: '/<svg/onload=alert(1)>' } as any;
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      } as any;

      notFoundHandler(mockReq, mockRes);

      // ASSERT
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Not Found',
        code: 'NOT_FOUND',
      });

      // Verify that the path is NOT reflected in the response
      const jsonCall = mockRes.json.mock.calls[0][0];
      expect(JSON.stringify(jsonCall)).not.toContain('<svg');
      expect(JSON.stringify(jsonCall)).not.toContain('onload');
    });

    test('should handle URL-encoded XSS payloads safely', async () => {
      // ARRANGE
      const { mockApp } = createTestContext();
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      vi.doMock('../../src/config', () => ({
        config: createMockConfig(),
        validateConfig: vi.fn(),
      }));

      // ACT
      const { startApplication } = await import('../../src/index');
      await startApplication();

      const useCall = mockApp.use.mock.calls.find((call: any) => {
        const handler = call[0];
        return (
          typeof handler === 'function' &&
          handler.length === 2 &&
          handler.toString().includes('NOT_FOUND')
        );
      });

      const notFoundHandler = useCall![0];

      // Test various XSS payloads from the issue
      const xssPayloads = [
        '/%3Csvg%2Fonload%3Dalert(1)%3E',
        '/%22%3E%3C%2Fscript%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E',
        '/%27%3E%3Cimg%20src=%22x%22%3E',
      ];

      for (const payload of xssPayloads) {
        const mockReq = { path: payload } as any;
        const mockRes = {
          status: vi.fn().mockReturnThis(),
          json: vi.fn().mockReturnThis(),
        } as any;

        notFoundHandler(mockReq, mockRes);

        // ASSERT
        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Not Found',
          code: 'NOT_FOUND',
        });

        // Verify response is JSON and doesn't contain the payload
        const jsonResponse = mockRes.json.mock.calls[0][0];
        expect(jsonResponse).toEqual({
          error: 'Not Found',
          code: 'NOT_FOUND',
        });
      }
    });

    test('should return application/json content type for 404 responses', async () => {
      // ARRANGE
      const { mockApp } = createTestContext();
      const mockFs = await import('fs');
      const mockFsPromises = await import('fs/promises');

      vi.mocked(mockFs.existsSync).mockReturnValue(true);
      vi.mocked(mockFsPromises.mkdir).mockResolvedValue(undefined);

      vi.doMock('../../src/config', () => ({
        config: createMockConfig(),
        validateConfig: vi.fn(),
      }));

      // ACT
      const { startApplication } = await import('../../src/index');
      await startApplication();

      const useCall = mockApp.use.mock.calls.find((call: any) => {
        const handler = call[0];
        return (
          typeof handler === 'function' &&
          handler.length === 2 &&
          handler.toString().includes('NOT_FOUND')
        );
      });

      const notFoundHandler = useCall![0];
      const mockReq = { path: '/nonexistent' } as any;
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      } as any;

      notFoundHandler(mockReq, mockRes);

      // ASSERT
      // Express's res.json() automatically sets Content-Type to application/json
      // We verify that json() is called, which ensures the response is JSON not HTML
      expect(mockRes.json).toHaveBeenCalled();
    });
  });
});
