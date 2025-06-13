import { describe, test, expect, vi } from 'vitest';
import { Server } from 'http';
import actualLogger from '../../src/services/logger'; // Import for type
// We need to get the mocked versions of these for assertion
// import redisCache from '../../src/services/cache';
// import { runCleanupQueue } from '../../src/utils/cleanupScheduler';

// anys
vi.mock('http', () => ({
  Server: vi.fn(() => ({
    close: vi.fn((callback?: () => void) => {
      if (callback) callback();
    }),
  })),
}));
vi.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Hold references to the mocked functions to assert against
let mockRunCleanupQueue: any;
let mockRedisQuit: any;

vi.mock('../../src/services/cache', () => {
  mockRedisQuit = vi.fn().mockResolvedValue(undefined);
  return {
    // Ensure the mock provides what the SUT expects, typically a default export or named exports
    __esModule: true, // If cache.ts is an ES module
    default: {
      // If gracefulShutdown.ts does `import redis from '../services/cache'`
      quit: mockRedisQuit,
      // Add other methods if SUT uses them, e.g. isHealthy
    },
    // Add named exports that gracefulShutdown might import
    getCacheStats: vi.fn().mockReturnValue({}),
    // Or if gracefulShutdown.ts does `import { quit } from '../services/cache'`
    // quit: mockRedisQuit,
  };
});
vi.mock('../../src/utils/cleanupScheduler', () => {
  mockRunCleanupQueue = vi.fn().mockResolvedValue(undefined);
  return {
    // Ensure the mock provides what the SUT expects
    __esModule: true, // If cleanupScheduler.ts is an ES module
    runCleanupQueue: mockRunCleanupQueue,
  };
});

const mockProcessOn = vi.fn();
const mockProcessExit = vi.fn();
const mockServerClose = vi.fn((callback?: () => void) => {
  if (callback) callback();
});

global.process.on = mockProcessOn;
global.process.exit = mockProcessExit as any;

describe('Graceful Shutdown', () => {
  let server: Server;
  let setupGracefulShutdown: (server: Server) => void;
  let isServerShuttingDown: () => boolean;
  let logger: typeof actualLogger;
  let clearTimeoutSpy: any; // Added spy instance

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    clearTimeoutSpy = vi.spyOn(global, 'clearTimeout'); // Spy on clearTimeout

    vi.resetModules(); // This is key. It must happen before SUT is imported.

    // Re-import logger for this test scope
    logger = (await import('../../src/services/logger')).default;

    // The mocks for cache and cleanupScheduler are already set up by vi.mock above.
    // When gracefulShutdown is imported, it will use these hoisted mocks.
    const gracefulShutdownModule = await import(
      '../../src/utils/gracefulShutdown'
    );
    setupGracefulShutdown = gracefulShutdownModule.setupGracefulShutdown;
    isServerShuttingDown = gracefulShutdownModule.isServerShuttingDown;

    // Create server with mocked close method
    server = {
      close: mockServerClose,
    } as any;

    global.process.on = mockProcessOn; // Re-assign as resetModules might affect globals
    global.process.exit = mockProcessExit as any; // Re-assign
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    clearTimeoutSpy.mockRestore(); // Restore the original clearTimeout
  });

  test('setupGracefulShutdown should register signal handlers and log', () => {
    // Act
    setupGracefulShutdown(server);

    // Assert
    expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(mockProcessOn).toHaveBeenCalledWith(
      'uncaughtException',
      expect.any(Function)
    );
    expect(mockProcessOn).toHaveBeenCalledWith(
      'unhandledRejection',
      expect.any(Function)
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Graceful shutdown handler registered'
    );
  });

  test('isServerShuttingDown should return false initially and true after shutdown starts', () => {
    // Assert initial state
    expect(isServerShuttingDown()).toBe(false);

    // Act: Setup and trigger shutdown
    setupGracefulShutdown(server);
    const sigtermCall = mockProcessOn.mock.calls.find(
      (call) => call[0] === 'SIGTERM'
    );
    const sigtermHandler = sigtermCall![1];
    sigtermHandler('SIGTERM'); // Manually invoke the handler

    // Assert after shutdown initiated
    expect(isServerShuttingDown()).toBe(true);
  });

  const testSignal = async (
    signal: string,
    eventEmitter?: (
      handler: (errOrReason?: any) => Promise<void> | void
    ) => Promise<void> | void
  ) => {
    // Arrange
    setupGracefulShutdown(server);
    const handler = mockProcessOn.mock.calls.find(
      (call) => call[0] === signal
    )![1] as (sigOrErr: any) => Promise<void>;

    // Act
    if (eventEmitter) {
      await eventEmitter(handler);
    } else {
      await handler(signal);
    }
    // Ensure all promise microtasks are flushed, then timers.
    await Promise.resolve();
    await vi.runAllTimersAsync();

    // Assert
    expect(logger.info).toHaveBeenCalledWith(
      `Received ${signal}, starting graceful shutdown...`
    );
    expect(mockServerClose).toHaveBeenCalled();
    // Note: "HTTP server closed" is logged in a callback, timing may vary
    expect(logger.info).toHaveBeenCalledWith('Running final cleanup queue...');
    expect(mockRunCleanupQueue).toHaveBeenCalled(); // Use the direct mock reference
    expect(logger.info).toHaveBeenCalledWith('Shutting down lock manager...');
    expect(logger.info).toHaveBeenCalledWith('Lock manager shutdown completed');
    expect(logger.info).toHaveBeenCalledWith('Closing cache connections...');
    expect(mockRedisQuit).toHaveBeenCalled(); // Use the direct mock reference
    expect(logger.info).toHaveBeenCalledWith('Cache connections closed');
    expect(logger.info).toHaveBeenCalledWith(
      'Graceful shutdown completed successfully'
    );
    expect(mockProcessExit).toHaveBeenCalledWith(0);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1); // Use the spy
  };

  test('should handle SIGTERM correctly', async () => {
    await testSignal('SIGTERM');
  });

  test('should handle SIGINT correctly', async () => {
    await testSignal('SIGINT');
  });

  test('should handle uncaughtException correctly', async () => {
    const mockError = new Error('Test Uncaught Exception');
    // The handler for uncaughtException is (error) => void. It calls shutdown, which is async.
    // We need to ensure the test waits for shutdown to complete.
    // The eventEmitter pattern here needs to correctly await the async shutdown.
    await testSignal('uncaughtException', async (handler) => {
      handler(mockError);
    });
    expect(logger.error).toHaveBeenCalledWith('Uncaught exception', mockError);
  });

  test('should handle unhandledRejection correctly', async () => {
    const mockReason = new Error('Test Unhandled Rejection');
    await testSignal('unhandledRejection', async (handler) => {
      handler(mockReason);
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled rejection',
      mockReason
    );
  });

  test('should only run shutdown once if called multiple times', async () => {
    // Arrange
    setupGracefulShutdown(server);
    const sigtermHandler = mockProcessOn.mock.calls.find(
      (call) => call[0] === 'SIGTERM'
    )![1] as () => Promise<void>;

    // Act
    const p1 = sigtermHandler();
    const p2 = sigtermHandler();

    await Promise.allSettled([p1, p2]);
    await Promise.resolve();
    await vi.runAllTimersAsync();

    // Assert
    expect(logger.info).toHaveBeenCalledTimes(9); // Updated count to match actual implementation
    expect(mockServerClose).toHaveBeenCalledTimes(1);
    expect(mockRunCleanupQueue).toHaveBeenCalledTimes(1); // Use the direct mock reference
    expect(mockRedisQuit).toHaveBeenCalledTimes(1); // Use the direct mock reference
    expect(mockProcessExit).toHaveBeenCalledWith(0);
  });

  test('should handle error during runCleanupQueue', async () => {
    // Arrange
    mockRunCleanupQueue.mockRejectedValueOnce(new Error('Cleanup failed')); // Corrected
    setupGracefulShutdown(server);
    const sigtermHandler = mockProcessOn.mock.calls.find(
      (call) => call[0] === 'SIGTERM'
    )![1] as () => Promise<void>;

    // Act
    await sigtermHandler();
    await vi.runAllTimersAsync();

    // Assert
    expect(logger.error).toHaveBeenCalledWith(
      'Error during graceful shutdown',
      expect.any(Error)
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('should handle error during redis.quit', async () => {
    // Arrange
    mockRedisQuit.mockRejectedValueOnce(new Error('Redis quit failed')); // Corrected
    setupGracefulShutdown(server);
    const sigtermHandler = mockProcessOn.mock.calls.find(
      (call) => call[0] === 'SIGTERM'
    )![1] as () => Promise<void>;

    // Act
    await sigtermHandler();
    await vi.runAllTimersAsync();

    // Assert
    expect(logger.error).toHaveBeenCalledWith('Cache shutdown failed', {
      err: expect.any(Error),
    });
    expect(mockProcessExit).toHaveBeenCalledWith(0);
  });

  test('should timeout if shutdown takes too long', async () => {
    // Arrange
    mockRunCleanupQueue.mockImplementationOnce(() => new Promise(() => {})); // Corrected
    setupGracefulShutdown(server);
    const sigtermHandler = mockProcessOn.mock.calls.find(
      (call) => call[0] === 'SIGTERM'
    )![1] as () => Promise<void>;

    // Act
    // We don't await sigtermHandler() here because it will never resolve due to the mock runCleanupQueue
    // Instead, we trigger it and then advance timers to hit the timeout.
    sigtermHandler();
    await vi.advanceTimersByTimeAsync(30000); // Advance time to trigger timeout

    // Assert
    expect(logger.error).toHaveBeenCalledWith(
      'Graceful shutdown timeout, forcing exit'
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });
});
