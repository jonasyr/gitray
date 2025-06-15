// apps/backend/__tests__/services/logger.test.ts

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import winston from 'winston';
import fs from 'fs';

// Mock winston and its transports
const mockWinstonLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  configure: vi.fn(),
  child: vi.fn(),
};

const mockDailyRotateFile = vi.fn();

vi.mock('winston', () => ({
  default: {
    createLogger: vi.fn(() => mockWinstonLogger),
    format: Object.assign(
      vi.fn((fn) => ({ customFormat: fn })), // winston.format as a function
      {
        combine: vi.fn((...args) => ({ combined: args })),
        timestamp: vi.fn((options) => ({ timestamp: options })),
        errors: vi.fn((options) => ({ errors: options })),
        colorize: vi.fn(() => ({ colorize: true })),
        printf: vi.fn((fn) => ({ printf: fn })),
        json: vi.fn(() => ({ json: true })),
        prettyPrint: vi.fn(() => ({ prettyPrint: true })),
      }
    ),
    transports: {
      Console: vi.fn().mockImplementation(() => ({ type: 'Console' })),
      File: vi.fn().mockImplementation(() => ({ type: 'File' })),
    },
  },
}));

vi.mock('winston-daily-rotate-file', () => ({
  default: mockDailyRotateFile,
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe('Logger Service', () => {
  let initializeLogger: any;
  let getLogger: any;
  let createRequestLogger: any;
  let createPerformanceLogger: any;
  let logCacheEvent: any;
  let logCoordinationEvent: any;
  let logRepositoryEvent: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock fs methods
    (fs.existsSync as any).mockReturnValue(true);
    (fs.mkdirSync as any).mockReturnValue(undefined);

    // Mock winston logger creation
    mockWinstonLogger.child.mockReturnValue(mockWinstonLogger);

    // Reset environment variables
    delete process.env.LOG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;

    // Reset modules to ensure fresh state
    vi.resetModules();

    // Import the logger module after mocks are set up
    const loggerModule = await import('../../../src/services/logger');
    initializeLogger = loggerModule.initializeLogger;
    getLogger = loggerModule.getLogger;
    createRequestLogger = loggerModule.createRequestLogger;
    createPerformanceLogger = loggerModule.createPerformanceLogger;
    logCacheEvent = loggerModule.logCacheEvent;
    logCoordinationEvent = loggerModule.logCoordinationEvent;
    logRepositoryEvent = loggerModule.logRepositoryEvent;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('initializeLogger', () => {
    test('should create logs directory if it does not exist', () => {
      (fs.existsSync as any).mockReturnValue(false);

      initializeLogger();

      expect(fs.mkdirSync).toHaveBeenCalledWith('./logs', { recursive: true });
    });

    test('should use custom log directory from environment', () => {
      process.env.LOG_DIR = '/custom/logs';
      (fs.existsSync as any).mockReturnValue(false);

      initializeLogger();

      expect(fs.mkdirSync).toHaveBeenCalledWith('/custom/logs', {
        recursive: true,
      });
    });

    test('should not create directory if it already exists', () => {
      (fs.existsSync as any).mockReturnValue(true);

      initializeLogger();

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    test('should create winston logger with correct configuration', () => {
      initializeLogger();

      expect(winston.createLogger).toHaveBeenCalled();
      const createLoggerCall = (winston.createLogger as any).mock.calls[0][0];

      expect(createLoggerCall).toMatchObject({
        level: expect.any(String),
        transports: expect.any(Array),
        defaultMeta: expect.any(Object),
      });
    });

    test('should use LOG_LEVEL environment variable', () => {
      process.env.LOG_LEVEL = 'debug';

      initializeLogger();

      const createLoggerCall = (winston.createLogger as any).mock.calls[0][0];
      expect(createLoggerCall.level).toBe('debug');
    });

    test('should default to info level when LOG_LEVEL not set', () => {
      initializeLogger();

      const createLoggerCall = (winston.createLogger as any).mock.calls[0][0];
      expect(createLoggerCall.level).toBe('info');
    });

    test('should add daily rotate file transports when LOG_TO_FILE is true', () => {
      process.env.LOG_TO_FILE = 'true';

      initializeLogger();

      // Should create multiple DailyRotateFile instances for different log types
      expect(mockDailyRotateFile).toHaveBeenCalledTimes(4); // combined, error, application, performance
    });

    test('should configure different formats for console vs file', () => {
      process.env.LOG_TO_FILE = 'true';

      initializeLogger();

      expect(winston.format.combine).toHaveBeenCalledTimes(3); // console, file, and performance formats
      expect(winston.format.colorize).toHaveBeenCalled(); // console format has colors
      expect(winston.format.json).toHaveBeenCalled(); // file format is JSON
    });
  });

  describe('getLogger', () => {
    test('should return logger instance after initialization', () => {
      initializeLogger();
      const logger = getLogger();

      expect(logger).toBeDefined();
      expect(logger).toBe(mockWinstonLogger);
    });

    test('should auto-initialize logger if called before manual initialization', () => {
      // Since getLogger auto-initializes, we test that it works without explicit init
      const logger = getLogger();

      expect(logger).toBeDefined();
      expect(logger).toBe(mockWinstonLogger);
      expect(winston.createLogger).toHaveBeenCalled();
    });

    test('should return the same logger instance on multiple calls', () => {
      initializeLogger();
      const logger1 = getLogger();
      const logger2 = getLogger();

      expect(logger1).toBe(logger2);
    });
  });

  describe('createRequestLogger', () => {
    test('should create request-specific logger with context', () => {
      initializeLogger();

      const mockReq = {
        headers: {
          'x-request-id': 'test-request-id',
        },
        method: 'GET',
        path: '/api/test',
        ip: '127.0.0.1',
      } as any;

      const requestLogger = createRequestLogger(mockReq);

      expect(mockWinstonLogger.child).toHaveBeenCalledWith({
        requestId: 'test-request-id',
        method: 'GET',
        path: '/api/test',
        ip: '127.0.0.1',
        userAgent: undefined,
      });
      expect(requestLogger).toBe(mockWinstonLogger);
    });

    test('should handle request without requestId', () => {
      initializeLogger();

      const mockReq = {
        headers: {},
        method: 'POST',
        path: '/api/data',
        ip: '192.168.1.1',
      } as any;

      createRequestLogger(mockReq);

      expect(mockWinstonLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/api/data',
          ip: '192.168.1.1',
          userAgent: undefined,
          requestId: expect.any(String),
        })
      );
    });
  });

  describe('createPerformanceLogger', () => {
    test('should create performance logger', () => {
      initializeLogger();

      const perfLogger = createPerformanceLogger();

      expect(perfLogger).toBeDefined();
      expect(typeof perfLogger.info).toBe('function');
    });
  });

  describe('Specialized Logging Functions', () => {
    beforeEach(() => {
      initializeLogger();
    });

    test('should log cache events', () => {
      const eventData = {
        operation: 'cache_hit',
        key: 'test-key',
        duration: 10,
      };

      logCacheEvent('Cache Hit', eventData);

      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Cache Cache Hit', {
        type: 'performance',
        category: 'cache',
        event: 'Cache Hit',
        operation: 'cache_hit',
        key: 'test-key',
        duration: 10,
      });
    });

    test('should log coordination events', () => {
      const eventData = {
        repository: 'test/repo',
        operation: 'acquire_lock',
        duration: 50,
      };

      logCoordinationEvent('Lock Acquired', eventData);

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Coordination Lock Acquired',
        {
          type: 'performance',
          category: 'coordination',
          event: 'Lock Acquired',
          repository: 'test/repo',
          operation: 'acquire_lock',
          duration: 50,
        }
      );
    });

    test('should log repository events', () => {
      const eventData = {
        repository: 'https://github.com/test/repo.git',
        operation: 'clone',
        status: 'success',
        duration: 1500,
      };

      logRepositoryEvent(
        'Repository Cloned',
        'https://github.com/test/repo.git',
        eventData
      );

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Repository Repository Cloned',
        {
          type: 'performance',
          category: 'repository',
          event: 'Repository Cloned',
          repoUrl: 'https://github.com/test/repo.git',
          repository: 'https://github.com/test/repo.git',
          operation: 'clone',
          status: 'success',
          duration: 1500,
        }
      );
    });
  });

  describe('Logger Methods', () => {
    test('should provide all standard logging methods', () => {
      initializeLogger();
      const logger = getLogger();

      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.debug).toBeDefined();
    });

    test('should handle structured logging data', () => {
      initializeLogger();
      const logger = getLogger();

      const logData = {
        userId: 123,
        action: 'login',
        timestamp: new Date().toISOString(),
      };

      logger.info('User action', logData);

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'User action',
        logData
      );
    });

    test('should create child loggers with context', () => {
      initializeLogger();
      const logger = getLogger();

      const childContext = { service: 'gitService', operation: 'clone' };
      logger.child(childContext);

      expect(mockWinstonLogger.child).toHaveBeenCalledWith(childContext);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      // Reset winston mock to normal behavior for error handling tests
      (winston.createLogger as any).mockImplementation(() => mockWinstonLogger);
    });

    test('should handle winston logger creation errors', () => {
      (winston.createLogger as any).mockImplementation(() => {
        throw new Error('Winston creation failed');
      });

      expect(() => initializeLogger()).toThrow('Winston creation failed');
    });

    test('should handle file system errors gracefully', () => {
      (fs.mkdirSync as any).mockImplementation(() => {
        throw new Error('Cannot create directory');
      });
      (fs.existsSync as any).mockReturnValue(false);

      expect(() => initializeLogger()).toThrow('Cannot create directory');
    });
  });

  describe('Environment Configuration', () => {
    beforeEach(() => {
      // Ensure winston mock is reset to normal behavior
      (winston.createLogger as any).mockImplementation(() => mockWinstonLogger);
    });

    test('should handle production environment settings', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_LEVEL = 'warn';

      initializeLogger();

      const createLoggerCall = (winston.createLogger as any).mock.calls[0][0];
      expect(createLoggerCall.level).toBe('warn');
    });

    test('should handle development environment settings', () => {
      process.env.NODE_ENV = 'development';
      process.env.LOG_LEVEL = 'debug';

      initializeLogger();

      const createLoggerCall = (winston.createLogger as any).mock.calls[0][0];
      expect(createLoggerCall.level).toBe('debug');
    });

    test('should handle test environment settings', () => {
      process.env.NODE_ENV = 'test';
      process.env.LOG_LEVEL = 'error';

      initializeLogger();

      const createLoggerCall = (winston.createLogger as any).mock.calls[0][0];
      expect(createLoggerCall.level).toBe('error');
    });
  });

  describe('Log Rotation Configuration', () => {
    beforeEach(() => {
      // Ensure winston mock is reset to normal behavior
      (winston.createLogger as any).mockImplementation(() => mockWinstonLogger);
      process.env.LOG_TO_FILE = 'true';
    });

    test('should configure daily rotation for all log files', () => {
      initializeLogger();

      // Verify that DailyRotateFile was called with correct configurations
      expect(mockDailyRotateFile).toHaveBeenCalledTimes(4);

      // Check that each call has the expected rotation configuration
      const dailyRotateFileCalls = mockDailyRotateFile.mock.calls;
      dailyRotateFileCalls.forEach((call) => {
        const config = call[0];
        expect(config).toMatchObject({
          datePattern: expect.any(String),
          maxSize: expect.any(Number),
          maxFiles: expect.any(Number),
        });
      });
    });

    test('should create separate files for different log levels', () => {
      // Clear any previous mock calls to ensure clean test
      mockDailyRotateFile.mockClear();

      initializeLogger();

      const dailyRotateFileCalls = mockDailyRotateFile.mock.calls;
      const filenames = dailyRotateFileCalls.map((call) => call[0].filename);

      // Use direct string checking instead of expect.stringContaining
      expect(filenames.some((f) => f.includes('application'))).toBe(true);
      expect(filenames.some((f) => f.includes('error'))).toBe(true);
      expect(filenames.some((f) => f.includes('combined'))).toBe(true);
      expect(filenames.some((f) => f.includes('performance'))).toBe(true);
    });
  });
});
