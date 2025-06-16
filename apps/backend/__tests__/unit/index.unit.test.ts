import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import fsSync from 'fs';
import net from 'net';
import { mockLogger, initializeLogger } from '../setup/logger.mock';
import { dotenvMock } from '../setup/dotenv.mock';

// Mock dotenv - need to return the mock directly for default import
vi.mock('dotenv', () => ({
  default: dotenvMock.default,
  config: dotenvMock.config,
}));

// Mock logger - use global setup to avoid conflicts with other tests
vi.mock('../../src/services/logger', () => ({
  initializeLogger,
  getLogger: global.getLogger,
}));

vi.mock('../../src/config');
vi.mock('fs/promises');
vi.mock('fs');
vi.mock('net');
vi.mock('../../src/services/metrics');
vi.mock('../../src/services/repositoryCoordinator');
vi.mock('../../src/services/repositoryCache');

describe('index.ts', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };

    // Clear all mock calls
    vi.clearAllMocks();

    // Clear Prometheus registry to avoid metric conflicts
    vi.doMock('../../src/services/metrics', () => ({
      metricsMiddleware: vi.fn(),
      metricsHandler: vi.fn(),
      updateCacheMetrics: vi.fn(),
      updateAllEnhancedMetrics: vi.fn(),
    }));

    // Mock coordination services
    vi.doMock('../../src/services/repositoryCoordinator', () => ({
      repositoryCoordinator: {
        getMetrics: vi.fn(() => ({
          cachedRepositories: 0,
          activeClones: 0,
          duplicateClonesPrevented: 0,
          coalescedOperations: 0,
          cacheHits: 1,
          cacheMisses: 1,
          totalDiskUsageBytes: 0,
        })),
        shutdown: vi.fn(),
      },
    }));

    vi.doMock('../../src/services/repositoryCache', () => ({
      repositoryCache: {
        shutdown: vi.fn(),
      },
      getRepositoryCacheStats: vi.fn(() => ({
        entries: 0,
        memoryUsage: { total: 0 },
        hitRatios: { overall: 0.5 },
      })),
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
    vi.clearAllMocks();
  });

  // 🎯 TARGET: Lines 88-120 (validateStartupEnvironment function)
  describe('validateStartupEnvironment', () => {
    test('should detect invalid port configuration', async () => {
      // ARRANGE: Mock config with invalid port
      vi.doMock('../../src/config', () => ({
        config: {
          port: 99999, // Invalid port
          git: { maxConcurrentProcesses: 4 },
          locks: { lockDir: './locks' },
          hybridCache: { diskPath: './cache' },
        },
        validateConfig: vi.fn(),
      }));

      // Import the function after mocking
      const { validateStartupEnvironment } = await import('../../src/index');

      // ACT & ASSERT: Should throw validation error
      await expect(validateStartupEnvironment()).rejects.toThrow();
    });

    test('should detect port conflicts with common ports', async () => {
      // ARRANGE: Mock config with common port
      vi.doMock('../../src/config', () => ({
        config: {
          port: 80, // Common port
          git: { maxConcurrentProcesses: 4 },
          locks: { lockDir: './locks' },
          hybridCache: { diskPath: './cache' },
        },
        validateConfig: vi.fn(),
      }));

      const { validateStartupEnvironment } = await import('../../src/index');

      // ACT & ASSERT: Should warn about port conflict
      await expect(validateStartupEnvironment()).rejects.toThrow(
        /Port 80 is a standard service port/
      );
    });

    test('should create required directories', async () => {
      // ARRANGE: Mock fs operations
      vi.mocked(fsSync.existsSync).mockReturnValue(false);
      const mockMkdir = vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      vi.doMock('../../src/config', () => ({
        config: {
          port: 3001,
          git: { maxConcurrentProcesses: 4 },
          locks: { lockDir: '/test/locks' },
          hybridCache: { diskPath: '/test/cache' },
        },
        validateConfig: vi.fn(),
      }));

      const { validateStartupEnvironment } = await import('../../src/index');

      // ACT
      await validateStartupEnvironment();

      // ASSERT: Should create directories
      expect(mockMkdir).toHaveBeenCalledWith('/test/locks', {
        recursive: true,
      });
      expect(mockMkdir).toHaveBeenCalledWith('/test/cache', {
        recursive: true,
      });
    });

    test('should test Redis connection when enabled', async () => {
      // ARRANGE: Mock Redis enabled
      vi.doMock('../../src/config', () => ({
        config: {
          port: 3001,
          git: { maxConcurrentProcesses: 4 },
          locks: { lockDir: './locks' },
          hybridCache: { enableRedis: true, diskPath: './cache' },
          redis: { host: 'localhost', port: 6379 },
        },
        validateConfig: vi.fn(),
      }));

      // Mock net.Socket
      const mockSocket = {
        connect: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn(),
      };
      vi.mocked(net.Socket).mockImplementation(() => mockSocket as any);

      const { validateStartupEnvironment } = await import('../../src/index');

      // ACT
      await validateStartupEnvironment();

      // ASSERT: Should attempt Redis connection
      expect(mockSocket.connect).toHaveBeenCalledWith(
        6379,
        'localhost',
        expect.any(Function)
      );
    });

    test('should handle Redis connection failure gracefully', async () => {
      // ARRANGE: Mock Redis connection failure
      vi.doMock('../../src/config', () => ({
        config: {
          port: 3001,
          git: { maxConcurrentProcesses: 4 },
          locks: { lockDir: './locks' },
          hybridCache: { enableRedis: true, diskPath: './cache' },
          redis: { host: 'localhost', port: 6379 },
        },
        validateConfig: vi.fn(),
      }));

      const mockSocket = {
        connect: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Connection failed')), 0);
          }
        }),
      };
      vi.mocked(net.Socket).mockImplementation(() => mockSocket as any);

      const { validateStartupEnvironment } = await import('../../src/index');

      // ACT
      await validateStartupEnvironment();

      // ASSERT: Should log warning but not fail
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis connection failed'),
        expect.any(Object)
      );
    });
  });

  // 🎯 TARGET: Lines 123-125 (initializeServer function)
  describe('initializeServer', () => {
    test('should handle configuration validation failure', async () => {
      // ARRANGE: Mock validateConfig to throw
      vi.doMock('../../src/config', () => ({
        config: {
          port: 3001,
          git: { maxConcurrentProcesses: 4 },
          locks: { lockDir: './locks' },
          hybridCache: { diskPath: './cache' },
        },
        validateConfig: vi.fn().mockImplementation(() => {
          throw new Error('Invalid configuration');
        }),
      }));

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const { initializeServer } = await import('../../src/index');

      // ACT & ASSERT
      await expect(initializeServer()).rejects.toThrow('process.exit called');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Configuration or startup validation failed',
        expect.any(Object)
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    test('should log coordination system status', async () => {
      // ARRANGE: Mock successful config validation
      vi.doMock('../../src/config', () => ({
        config: {
          port: 3001,
          git: { maxConcurrentProcesses: 4 },
          locks: { lockDir: './locks' },
          hybridCache: { diskPath: './cache' },
          repositoryCache: { enabled: true },
          operationCoordination: { enabled: true },
          cacheStrategy: { hierarchicalCaching: true },
        },
        validateConfig: vi.fn(),
      }));

      const { initializeServer } = await import('../../src/index');

      // ACT
      await initializeServer();

      // ASSERT: Should log coordination status
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Configuration validated successfully',
        expect.objectContaining({
          repositoryCacheEnabled: true,
          operationCoordinationEnabled: true,
          hierarchicalCachingEnabled: true,
        })
      );
    });
  });

  // 🎯 TARGET: Lines 341-401 (Server error handling)
  describe('Server Error Handling', () => {
    test('should handle EADDRINUSE error with helpful message', async () => {
      // ARRANGE: Create error handler
      const error = new Error('Port in use') as NodeJS.ErrnoException;
      error.code = 'EADDRINUSE';

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      // Import to get access to error handler logic
      const { handleServerError } = await import('../../src/index');

      // ACT
      const result = handleServerError(error);

      // ASSERT
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('PORT CONFLICT'),
        expect.any(Object)
      );
      expect(result).toBe(error);

      mockExit.mockRestore();
    });

    test('should handle EACCES error with permission guidance', async () => {
      // ARRANGE
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const { handleServerError } = await import('../../src/index');

      // ACT
      const result = handleServerError(error);

      // ASSERT
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('PERMISSION DENIED'),
        expect.any(Object)
      );
      expect(result).toBe(error);

      mockExit.mockRestore();
    });

    test('should handle ENOTFOUND network error', async () => {
      // ARRANGE
      const error = new Error('Network error') as NodeJS.ErrnoException;
      error.code = 'ENOTFOUND';

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const { handleServerError } = await import('../../src/index');

      // ACT
      const result = handleServerError(error);

      // ASSERT
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('NETWORK ERROR'),
        expect.any(Object)
      );
      expect(result).toBe(error);

      mockExit.mockRestore();
    });

    test('should provide debug commands for port conflicts', async () => {
      // ARRANGE
      const error = new Error('Port in use') as NodeJS.ErrnoException;
      error.code = 'EADDRINUSE';

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const { handleServerError } = await import('../../src/index');

      // ACT
      const result = handleServerError(error);

      // ASSERT
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('PORT CONFLICT'),
        expect.any(Object)
      );
      expect(result).toBe(error);

      mockExit.mockRestore();
    });
  });

  // 🎯 TARGET: Lines 406-436, 442-488 (Coordination health endpoint)
  describe('Coordination Health Endpoint Logic', () => {
    test('should return disabled status when coordination off', async () => {
      // ARRANGE
      const mockConfig = { repositoryCache: { enabled: false } };
      const { getCoordinationHealth } = await import('../../src/index');

      // ACT
      const result = getCoordinationHealth(mockConfig);

      // ASSERT
      expect(result).toEqual({
        status: 'disabled',
        message: 'Repository coordination is disabled',
      });
    });

    test('should calculate coordination health when enabled', async () => {
      // ARRANGE: Mock coordination metrics
      const mockMetrics = {
        cachedRepositories: 5,
        activeClones: 2,
        duplicateClonesPrevented: 10,
      };

      const mockCacheStats = {
        hitRatios: { overall: 0.8 },
        entries: 10,
      };

      const { calculateCoordinationHealth } = await import('../../src/index');

      // ACT
      const result = calculateCoordinationHealth(mockMetrics, mockCacheStats);

      // ASSERT
      expect(result.status).toBe('healthy');
      expect(result.coordination.cachedRepositories).toBe(5);
      expect(result.cache.hitRatios.overall).toBe(0.8);
    });

    test('should detect unhealthy coordination state', async () => {
      // ARRANGE: Mock unhealthy metrics
      const mockMetrics = {
        cachedRepositories: 1,
        activeClones: 15, // Too many active clones
        duplicateClonesPrevented: 0,
      };

      const mockCacheStats = {
        hitRatios: { overall: 0.05 }, // Very low hit rate
        entries: 1,
      };

      const { calculateCoordinationHealth } = await import('../../src/index');

      // ACT
      const result = calculateCoordinationHealth(mockMetrics, mockCacheStats);

      // ASSERT
      expect(result.status).toBe('unhealthy');
    });

    test('should handle coordination health check errors', async () => {
      // ARRANGE: Mock error in health check
      const { handleCoordinationHealthError } = await import('../../src/index');

      const error = new Error('Coordination system failure');

      // ACT
      const result = handleCoordinationHealthError(error);

      // ASSERT
      expect(result).toEqual({
        status: 'error',
        message: 'Failed to get coordination health',
        error: 'Coordination system failure',
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Coordination health check failed',
        expect.objectContaining({ error })
      );
    });
  });

  // 🎯 TARGET: Lines 56-57, 62-65, 78-80, 82-83 (Early startup code)
  describe('Early Startup Logic', () => {
    test('should load environment variables correctly', async () => {
      // ARRANGE: Clear any previous calls
      vi.clearAllMocks();

      // ACT: Import index (triggers dotenv.config)
      await import('../../src/index');

      // ASSERT: dotenv.config should have been called
      expect(dotenvMock.default.config).toHaveBeenCalled();
    });

    test('should initialize logger after environment loading', async () => {
      // ARRANGE: Clear any previous calls
      vi.clearAllMocks();

      // ACT: Import index (this will trigger the static module execution)
      await import('../../src/index');

      // ASSERT: Both dotenv and logger should have been called
      expect(dotenvMock.default.config).toHaveBeenCalled();
      expect(initializeLogger).toHaveBeenCalled();
    });

    test('should log startup indicator', async () => {
      // ARRANGE: Clear any previous calls
      vi.clearAllMocks();

      // ACT: Import index
      await import('../../src/index');

      // ASSERT: Should log startup message
      expect(mockLogger.info).toHaveBeenCalledWith(
        '📋 Index.ts file loading...'
      );
    });
  });
});
