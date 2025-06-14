import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock variable to track dotenv.config calls
const mockDotenvConfig = vi.fn();

// Mock process.exit to prevent actual process termination during tests
const mockProcessExit = vi.fn();

// Mock the logger module using the shared mock from setup/logger.mock.ts
import { mockLogger, getLogger, initializeLogger } from './setup/logger.mock';
vi.mock('../src/services/logger', () => ({
  default: mockLogger,
  getLogger,
  initializeLogger,
}));

// Mock config module to prevent actual configuration loading
vi.mock('../src/config', () => ({
  config: {
    get port() {
      // Dynamically read process.env.PORT for each test
      return process.env.PORT ? Number(process.env.PORT) : 3001;
    },
    cors: {},
    rateLimit: {},
    repositoryCache: { enabled: false },
    operationCoordination: { enabled: false },
    cacheStrategy: { hierarchicalCaching: false },
    hybridCache: {
      enableRedis: false,
      enableDisk: false,
      maxEntries: 100,
      memoryLimitBytes: 1024 * 1024,
      diskPath: '/tmp/test',
    },
    locks: {
      lockDir: '/tmp/locks',
      defaultTimeoutMs: 5000,
    },
  },
  validateConfig: vi.fn(),
}));

// Mock repository coordination modules
vi.mock('../src/services/repositoryCoordinator', () => ({
  repositoryCoordinator: {
    getMetrics: () => ({
      cachedRepositories: 0,
      activeClones: 0,
      duplicateClonesPrevented: 0,
      totalDiskUsageBytes: 0,
    }),
    shutdown: vi.fn(),
  },
}));

vi.mock('../src/services/repositoryCache', () => ({
  repositoryCache: {
    shutdown: vi.fn(),
  },
  getRepositoryCacheStats: () => ({
    hitRatios: { overall: 0.5 },
    entries: 0,
    memoryUsage: { total: 0 },
  }),
}));

// Mock graceful shutdown
vi.mock('../src/utils/gracefulShutdown', () => ({
  setupGracefulShutdown: vi.fn(),
}));

// Mock cache services
vi.mock('../src/services/cache', () => ({
  getCacheStats: () => ({
    activeBackend: 'memory',
    memory: { entries: 0 },
    redis: { healthy: false },
    hybrid: null,
  }),
}));

// Store the last created mock app globally for test assertions
let lastMockApp: any = null;
vi.mock('express', () => {
  const mockJson = vi.fn();
  const createMockApp = () => {
    const app = {
      use: vi.fn(),
      get: vi.fn(),
      listen: vi.fn().mockImplementation((port: any, callback?: any) => {
        if (callback) callback();
        return { on: vi.fn() };
      }),
    };
    lastMockApp = app;
    return app;
  };
  const mockRouter = { get: vi.fn(), post: vi.fn(), use: vi.fn() };
  const mockExpress = vi.fn(() => createMockApp());
  Object.assign(mockExpress, {
    json: mockJson,
    Router: vi.fn(() => mockRouter),
  });
  return { default: mockExpress };
});

vi.mock('cors', () => ({
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

vi.mock('helmet', () => ({
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

vi.mock('dotenv', () => ({
  default: { config: mockDotenvConfig },
  config: mockDotenvConfig,
}));

vi.mock('../src/routes', () => ({
  default: 'mockedRoutes',
}));

vi.mock('../src/routes/repositoryRoutes', () => ({
  default: 'mockedRepositoryRoutes',
}));

vi.mock('../src/routes/commitRoutes', () => ({
  default: 'mockedCommitRoutes',
}));

vi.mock('../src/routes/healthRoutes', () => ({
  default: 'mockedHealthRoutes',
}));

vi.mock('../src/middlewares/errorHandler', () => ({
  default: 'mockedErrorHandler',
}));

vi.mock('../src/middlewares/requestId', () => ({
  requestIdMiddleware: vi.fn((req: any, res: any, next: any) => next()),
}));

vi.mock('express-rate-limit', () => ({
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

vi.mock('../src/services/metrics', () => ({
  httpRequestsTotal: { inc: vi.fn() },
  httpRequestDuration: { observe: vi.fn() },
  metricsMiddleware: vi.fn((req: any, res: any, next: any) => next()),
  metricsHandler: vi.fn((req: any, res: any) =>
    res.status(200).send('mocked metrics')
  ),
  updateCacheMetrics: vi.fn(),
}));

// Mock process.exit
Object.defineProperty(process, 'exit', {
  value: mockProcessExit,
  writable: true,
});

// Store original environment
const originalEnv = process.env;

describe('Express App Initialization', () => {
  beforeEach(() => {
    // Reset call history but preserve mock implementations
    mockDotenvConfig.mockClear();
    mockProcessExit.mockClear();

    // Setup process.env
    process.env = { ...originalEnv };
    process.env.PORT = '3001';
  });

  afterEach(() => {
    // Restore process.env
    process.env = originalEnv;

    // Clear require cache to ensure fresh imports in each test
    vi.resetModules();
  });

  test('should configure the Express app with correct middlewares and routes', async () => {
    // Act - Import the index module to trigger the app initialization
    await import('../src/index');

    // Get the mocked modules
    const express = await import('express');
    const cors = await import('cors');
    const helmet = await import('helmet');
    const mockExpress = express.default as any;
    const mockCors = cors.default as any;
    const mockHelmet = helmet.default as any;
    // Use the actual app instance created by the mock
    const mockApp = lastMockApp;

    // Assert
    expect(mockDotenvConfig).toHaveBeenCalled();
    expect(mockExpress).toHaveBeenCalled();
    expect(mockCors).toHaveBeenCalled();
    expect(mockHelmet).toHaveBeenCalled();
    // Check that helmet and cors middleware functions were used
    expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // helmet
    expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // cors
    expect(mockExpress.json).toHaveBeenCalled();
    expect(mockApp.use).toHaveBeenCalledWith(mockExpress.json());
    expect(mockApp.use).toHaveBeenCalledWith('/api', 'mockedRoutes');
    expect(mockApp.use).toHaveBeenCalledWith('/', 'mockedHealthRoutes');
    expect(mockApp.use).toHaveBeenCalledWith(
      '/api/repositories',
      'mockedRepositoryRoutes'
    );
    expect(mockApp.use).toHaveBeenCalledWith(
      '/api/commits',
      'mockedCommitRoutes'
    );
    expect(mockApp.use).toHaveBeenCalledWith('mockedErrorHandler');
    expect(mockApp.listen).toHaveBeenCalledWith(3001, expect.any(Function));
  });

  test('should use default port 3001 if PORT environment variable is not set', async () => {
    // Arrange
    delete process.env.PORT;

    // Act - Import the index module to trigger the app initialization
    await import('../src/index');

    // Use the actual app instance created by the mock
    const mockApp = lastMockApp;

    // Assert
    expect(mockApp.listen).toHaveBeenCalledWith(3001, expect.any(Function));
  });

  test('should log when server starts', async () => {
    // Arrange
    const infoSpy = vi.spyOn(mockLogger, 'info');

    // Act - Import the index module to trigger the app initialization
    await import('../src/index');

    // Use the actual app instance created by the mock
    const mockApp = lastMockApp;

    // Check if listen was called and get the callback
    expect(mockApp.listen).toHaveBeenCalled();
    const listenCalls = mockApp.listen.mock.calls;
    if (listenCalls.length > 0 && listenCalls[0][1]) {
      const listenCallback = listenCalls[0][1];
      // Manually call the listen callback to simulate server start
      listenCallback();
    }

    // Assert that info was called (the server should log during startup)
    expect(infoSpy).toHaveBeenCalled();

    // Clean up
    infoSpy.mockRestore();
  });
});

// Export lastMockApp for use in tests
export { lastMockApp };
