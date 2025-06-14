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
    const app: any = {
      use: vi.fn(),
      get: vi.fn(),
      listen: vi.fn().mockImplementation((port: any, callback?: any) => {
        if (callback) callback();
        return {
          on: vi.fn().mockImplementation((event: string, handler: any) => {
            // Store the error handler for testing
            if (event === 'error') {
              app._errorHandler = handler;
            }
          }),
        };
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

  test('should handle server startup errors - EADDRINUSE', async () => {
    // Mock the server error handling by directly calling error handler
    const errorSpy = vi.spyOn(mockLogger, 'error');

    // Import the module first to get access to the error handler
    vi.resetModules();
    await import('../src/index');

    const mockApp = lastMockApp;
    expect(mockApp.listen).toHaveBeenCalled();

    // Get the server mock from the listen call
    const listenCall = mockApp.listen.mock.calls[0];
    const server = listenCall ? mockApp.listen.mock.results[0].value : null;

    if (server && server.on) {
      // Find the error handler
      const errorHandler = server.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      if (errorHandler) {
        const error = new Error('Port in use') as NodeJS.ErrnoException;
        error.code = 'EADDRINUSE';
        errorHandler(error);

        // Assert
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('PORT CONFLICT'),
          expect.any(Object)
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      }
    }

    errorSpy.mockRestore();
  });

  test('should handle server startup errors - EACCES', async () => {
    // Mock the server error handling by directly calling error handler
    const errorSpy = vi.spyOn(mockLogger, 'error');

    // Import the module first to get access to the error handler
    vi.resetModules();
    await import('../src/index');

    const mockApp = lastMockApp;
    expect(mockApp.listen).toHaveBeenCalled();

    // Get the server mock from the listen call
    const listenCall = mockApp.listen.mock.calls[0];
    const server = listenCall ? mockApp.listen.mock.results[0].value : null;

    if (server && server.on) {
      // Find the error handler
      const errorHandler = server.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      if (errorHandler) {
        const error = new Error('Permission denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        errorHandler(error);

        // Assert
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('PERMISSION DENIED'),
          expect.any(Object)
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      }
    }

    errorSpy.mockRestore();
  });

  test('should handle server startup errors - ENOTFOUND', async () => {
    // Mock the server error handling by directly calling error handler
    const errorSpy = vi.spyOn(mockLogger, 'error');

    // Import the module first to get access to the error handler
    vi.resetModules();
    await import('../src/index');

    const mockApp = lastMockApp;
    expect(mockApp.listen).toHaveBeenCalled();

    // Get the server mock from the listen call
    const listenCall = mockApp.listen.mock.calls[0];
    const server = listenCall ? mockApp.listen.mock.results[0].value : null;

    if (server && server.on) {
      // Find the error handler
      const errorHandler = server.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      if (errorHandler) {
        const error = new Error('Network error') as NodeJS.ErrnoException;
        error.code = 'ENOTFOUND';
        errorHandler(error);

        // Assert
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('NETWORK ERROR'),
          expect.any(Object)
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      }
    }

    errorSpy.mockRestore();
  });

  test('should handle generic server startup errors', async () => {
    // Mock the server error handling by directly calling error handler
    const errorSpy = vi.spyOn(mockLogger, 'error');

    // Import the module first to get access to the error handler
    vi.resetModules();
    await import('../src/index');

    const mockApp = lastMockApp;
    expect(mockApp.listen).toHaveBeenCalled();

    // Get the server mock from the listen call
    const listenCall = mockApp.listen.mock.calls[0];
    const server = listenCall ? mockApp.listen.mock.results[0].value : null;

    if (server && server.on) {
      // Find the error handler
      const errorHandler = server.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      if (errorHandler) {
        const error = new Error('Generic error') as NodeJS.ErrnoException;
        error.code = 'EGENERIC';
        errorHandler(error);

        // Assert
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('SERVER STARTUP ERROR'),
          expect.any(Object)
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      }
    }

    errorSpy.mockRestore();
  });

  test('should handle coordination health endpoint when disabled', async () => {
    // Mock config with coordination disabled
    vi.doMock('../src/config', () => ({
      config: {
        port: 3001,
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

    // Act - Import the index module
    await import('../src/index');

    const mockApp = lastMockApp;

    // Find the coordination health endpoint
    const getHealthCalls = mockApp.get.mock.calls.filter(
      (call: any[]) => call[0] === '/health/coordination'
    );
    expect(getHealthCalls).toHaveLength(1);

    const handler = getHealthCalls[0][1];
    const mockReq = {};
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    // Call the handler
    await handler(mockReq, mockRes);

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      status: 'disabled',
      message: 'Repository coordination is disabled',
    });
  });

  test('should handle coordination health endpoint when enabled and healthy', async () => {
    // Act - Import the index module first
    await import('../src/index');

    const mockApp = lastMockApp;

    // Find the coordination health endpoint
    const getHealthCalls = mockApp.get.mock.calls.filter(
      (call: any[]) => call[0] === '/health/coordination'
    );
    expect(getHealthCalls).toHaveLength(1);

    const handler = getHealthCalls[0][1];

    // Create a mock response that tracks what was called
    const mockReq = {};
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    // Temporarily override the config to enable coordination
    const originalConfig = await import('../src/config');
    const configSpy = vi
      .spyOn(originalConfig, 'config', 'get')
      .mockReturnValue({
        ...originalConfig.config,
        repositoryCache: { enabled: true },
      } as any);

    // Mock the repository coordinator to return healthy metrics
    const { repositoryCoordinator } = await import(
      '../src/services/repositoryCoordinator'
    );
    const getMetricsSpy = vi
      .spyOn(repositoryCoordinator, 'getMetrics')
      .mockReturnValue({
        cachedRepositories: 5,
        activeClones: 2,
        duplicateClonesPrevented: 10,
        totalDiskUsageBytes: 1024 * 1024,
        coalescedOperations: 5,
        cacheHits: 50,
        cacheMisses: 10,
      });

    // Mock the repository cache stats
    const repositoryCacheModule = await import(
      '../src/services/repositoryCache'
    );
    const getStatsSpy = vi
      .spyOn(repositoryCacheModule, 'getRepositoryCacheStats')
      .mockReturnValue({
        hitRatios: {
          overall: 0.8,
          rawCommits: 0.7,
          filteredCommits: 0.8,
          aggregatedData: 0.9,
        },
        entries: {
          rawCommits: 5,
          filteredCommits: 3,
          aggregatedData: 2,
        },
        memoryUsage: {
          total: 1024,
          rawCommits: 400,
          filteredCommits: 300,
          aggregatedData: 324,
        },
        efficiency: {
          duplicateClonesPrevented: 10,
          totalCacheOperations: 100,
          averageHitTime: 50,
          averageMissTime: 200,
        },
      });

    // Call the handler
    await handler(mockReq, mockRes);

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'healthy',
        coordination: expect.any(Object),
        cache: expect.any(Object),
        timestamp: expect.any(String),
      })
    );

    // Restore spies
    configSpy.mockRestore();
    getMetricsSpy.mockRestore();
    getStatsSpy.mockRestore();
  });

  test('should handle coordination health endpoint errors', async () => {
    // Act - Import the index module first
    await import('../src/index');

    const mockApp = lastMockApp;

    // Find the coordination health endpoint
    const getHealthCalls = mockApp.get.mock.calls.filter(
      (call: any[]) => call[0] === '/health/coordination'
    );
    expect(getHealthCalls).toHaveLength(1);

    const handler = getHealthCalls[0][1];

    // Create a mock response that tracks what was called
    const mockReq = {};
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    // Temporarily override the config to enable coordination
    const originalConfig = await import('../src/config');
    const configSpy = vi
      .spyOn(originalConfig, 'config', 'get')
      .mockReturnValue({
        ...originalConfig.config,
        repositoryCache: { enabled: true },
      } as any);

    // Mock the repository coordinator to throw an error
    const { repositoryCoordinator } = await import(
      '../src/services/repositoryCoordinator'
    );
    const getMetricsSpy = vi
      .spyOn(repositoryCoordinator, 'getMetrics')
      .mockImplementation(() => {
        throw new Error('Coordination system failure');
      });

    const errorSpy = vi.spyOn(mockLogger, 'error');

    // Call the handler
    await handler(mockReq, mockRes);

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Failed to get coordination health',
    });
    expect(errorSpy).toHaveBeenCalledWith(
      'Coordination health check failed',
      expect.any(Object)
    );

    // Restore spies
    configSpy.mockRestore();
    getMetricsSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('Startup Environment Validation', () => {
  test('should validate port configuration', async () => {
    // Set invalid port
    process.env.PORT = '99999';

    vi.doMock('../src/config', () => ({
      config: {
        port: 99999,
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
      validateConfig: vi.fn().mockImplementation(() => {
        throw new Error('Invalid port configuration');
      }),
    }));

    const errorSpy = vi.spyOn(mockLogger, 'error');

    // Act - Import the index module
    await import('../src/index');

    // Assert
    expect(errorSpy).toHaveBeenCalledWith(
      'Configuration or startup validation failed',
      expect.any(Object)
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
  });

  test('should handle application startup failure', async () => {
    // Clear modules first
    vi.resetModules();

    // Mock config validation to throw BEFORE importing
    vi.doMock('../src/config', () => ({
      config: {
        port: 3001,
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
      validateConfig: vi.fn().mockImplementation(() => {
        throw new Error('Startup failure');
      }),
    }));

    const errorSpy = vi.spyOn(mockLogger, 'error');

    // Act - Import the index module
    await import('../src/index');

    // Assert
    expect(errorSpy).toHaveBeenCalledWith(
      'Configuration or startup validation failed',
      expect.any(Object)
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
  });

  test('should use default port when environment variable is not set', async () => {
    // Arrange
    delete process.env.PORT;

    // Act - Import config to check default port
    const { config } = await import('../src/config');

    // Assert - Should use default port 3001
    expect(config.port).toBe(3001);
  });
});

describe('Server Error Handling', () => {
  test('should create server successfully', async () => {
    // Act
    await import('../src/index');

    // Assert - Check that express app was created and listen was called
    expect(lastMockApp.listen).toHaveBeenCalled();
  });

  test('should register middleware', async () => {
    // Act
    await import('../src/index');

    // Assert - Check that middleware was registered
    expect(lastMockApp.use).toHaveBeenCalled();
  });
});

describe('Coordination Health Endpoint', () => {
  test('should register health coordination endpoint', async () => {
    // Act
    await import('../src/index');

    // Assert - Check that the coordination health endpoint was registered
    expect(lastMockApp.get).toHaveBeenCalledWith(
      '/health/coordination',
      expect.any(Function)
    );
  });

  test('should handle coordination health endpoint when disabled', async () => {
    // Act
    await import('../src/index');

    // Get the coordination handler
    const coordinationHandler = lastMockApp.get.mock.calls.find(
      (call: any) => call[0] === '/health/coordination'
    )?.[1];

    expect(coordinationHandler).toBeDefined();

    // Test the endpoint handler
    const mockReq = {};
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await coordinationHandler(mockReq, mockRes);

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({
      status: 'disabled',
      message: 'Repository coordination is disabled',
    });
  });
});

// Export lastMockApp for use in tests
export { lastMockApp };
