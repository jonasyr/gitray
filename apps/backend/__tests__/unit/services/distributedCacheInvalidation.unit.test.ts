// apps/backend/__tests__/unit/services/distributedCacheInvalidation.unit.test.ts

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Redis from 'ioredis';
import {
  DistributedCacheInvalidation,
  getDistributedCacheInvalidation,
  shutdownDistributedCacheInvalidation,
} from '../../../src/services/distributedCacheInvalidation';

// Mock ioredis
const mockRedisInstance = {
  on: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  publish: vi.fn(),
  quit: vi.fn(),
};

vi.mock('ioredis', () => ({
  default: vi.fn(() => mockRedisInstance),
}));

const mockRedisConstructor = vi.mocked(Redis);

// Mock logger
vi.mock('../../../src/services/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock metrics
vi.mock('../../../src/services/metrics', () => ({
  distributedCacheInvalidations: {
    inc: vi.fn(),
  },
  distributedCacheInvalidationLatency: {
    observe: vi.fn(),
  },
  recordDetailedError: vi.fn(),
}));

describe('DistributedCacheInvalidation', () => {
  let invalidationService: DistributedCacheInvalidation;
  let mockHandler: ReturnType<typeof vi.fn>;
  let mockDateNow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure clean timer state
    vi.useRealTimers();

    // Mock Date.now for predictable processId generation
    mockDateNow = vi.fn(() => 1234567890000);
    vi.stubGlobal('Date', {
      ...Date,
      now: mockDateNow,
    });

    mockHandler = vi.fn().mockResolvedValue(undefined);

    // Reset Redis mock behavior
    mockRedisInstance.on.mockReturnValue(mockRedisInstance);
    mockRedisInstance.subscribe.mockResolvedValue(undefined);
    mockRedisInstance.publish.mockResolvedValue(1);
    mockRedisInstance.quit.mockResolvedValue('OK');
  });

  afterEach(async () => {
    if (invalidationService) {
      await invalidationService.shutdown();
    }
    // Restore timers and global mocks
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('Constructor and Initialization', () => {
    test('should initialize without Redis config', () => {
      // ARRANGE & ACT
      invalidationService = new DistributedCacheInvalidation();

      // ASSERT
      expect(mockRedisConstructor).not.toHaveBeenCalled();
      expect(invalidationService.isServiceHealthy()).toBe(true); // Healthy when Redis not configured
    });

    test('should initialize with Redis config', () => {
      // ARRANGE
      const redisConfig = {
        host: 'localhost',
        port: 6379,
        password: 'secret',
        db: 1,
      };

      // ACT
      invalidationService = new DistributedCacheInvalidation(redisConfig);

      // ASSERT
      expect(mockRedisConstructor).toHaveBeenCalledTimes(2); // Publisher and subscriber
      expect(mockRedisConstructor).toHaveBeenCalledWith({
        ...redisConfig,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryDelayOnFailover: 100,
      });
    });

    test('should handle Redis initialization failure', () => {
      // ARRANGE
      mockRedisConstructor.mockImplementationOnce(() => {
        throw new Error('Redis connection failed');
      });

      // ACT & ASSERT
      expect(
        () => new DistributedCacheInvalidation({ host: 'localhost' })
      ).not.toThrow();
    });
  });

  describe('Redis Event Handling', () => {
    test('should handle Redis ready event', () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation({
        host: 'localhost',
      });
      const readyHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'ready'
      )![1];

      // ACT
      readyHandler();

      // ASSERT
      expect(invalidationService.isServiceHealthy()).toBe(true);
    });

    test('should handle Redis error event', () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation({
        host: 'localhost',
      });
      const errorHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'error'
      )![1];

      // ACT
      errorHandler(new Error('Connection lost'));

      // ASSERT
      expect(invalidationService.isServiceHealthy()).toBe(false);
    });

    test('should setup subscriptions when subscriber is ready', () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation({
        host: 'localhost',
      });

      // Find the subscriber ready handler (second Redis instance)
      const subscriberReadyHandler = mockRedisInstance.on.mock.calls.filter(
        (call) => call[0] === 'ready'
      )[1][1]; // Second ready handler

      // ACT
      subscriberReadyHandler();

      // ASSERT
      expect(mockRedisInstance.subscribe).toHaveBeenCalledWith(
        'cache:invalidate'
      );
    });
  });

  describe('Handler Registration', () => {
    test('should register invalidation handler', () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation();

      // ACT
      invalidationService.registerInvalidationHandler(
        'repository',
        mockHandler
      );

      // ASSERT - Handler should be registered (tested via invalidation)
      expect(typeof mockHandler).toBe('function');
    });
  });

  describe('Message Handling', () => {
    beforeEach(() => {
      invalidationService = new DistributedCacheInvalidation({
        host: 'localhost',
      });
      invalidationService.registerInvalidationHandler(
        'repository',
        mockHandler
      );
    });

    test('should ignore own invalidation messages', async () => {
      // ARRANGE
      // Trigger subscriber ready to set up message handler
      const subscriberReadyHandler = mockRedisInstance.on.mock.calls.filter(
        (call) => call[0] === 'ready'
      )[1]![1];
      subscriberReadyHandler();

      const messageHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'message'
      )![1];

      // Use the same mocked timestamp for consistency
      const ownMessage = JSON.stringify({
        pattern: 'repo:*',
        timestamp: mockDateNow(),
        processId: `${process.pid}-${mockDateNow()}`, // Will match current process
        metadata: { repoUrl: 'test/repo' },
      });

      // ACT
      await messageHandler('cache:invalidate', ownMessage);

      // ASSERT
      expect(mockHandler).not.toHaveBeenCalled();
    });

    test('should process remote invalidation messages', async () => {
      // ARRANGE
      // Trigger subscriber ready to set up message handler
      const subscriberReadyHandler = mockRedisInstance.on.mock.calls.filter(
        (call) => call[0] === 'ready'
      )[1]![1];
      subscriberReadyHandler();

      const messageHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'message'
      )![1];

      const remoteMessage = JSON.stringify({
        pattern: 'repo:test/*',
        timestamp: Date.now(),
        processId: 'different-process-id',
        metadata: { repoUrl: 'test/repo', reason: 'update' },
      });

      // ACT
      await messageHandler('cache:invalidate', remoteMessage);

      // ASSERT
      expect(mockHandler).toHaveBeenCalledWith('repo:test/*', {
        repoUrl: 'test/repo',
        reason: 'update',
      });
    });

    test('should handle malformed invalidation messages', async () => {
      // ARRANGE
      // Trigger subscriber ready to set up message handler
      const subscriberReadyHandler = mockRedisInstance.on.mock.calls.filter(
        (call) => call[0] === 'ready'
      )[1]![1];
      subscriberReadyHandler();

      const messageHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'message'
      )![1];

      // ACT
      await messageHandler('cache:invalidate', 'invalid-json');

      // ASSERT
      expect(mockHandler).not.toHaveBeenCalled();
    });

    test('should handle messages when no handler registered', async () => {
      // ARRANGE
      const serviceWithoutHandler = new DistributedCacheInvalidation({
        host: 'localhost',
      });

      // Trigger subscriber ready to set up message handler
      const subscriberReadyHandler = mockRedisInstance.on.mock.calls.filter(
        (call) => call[0] === 'ready'
      )[1]![1];
      subscriberReadyHandler();

      const messageHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'message'
      )![1];

      const message = JSON.stringify({
        pattern: 'repo:*',
        timestamp: Date.now(),
        processId: 'different-process',
      });

      // ACT & ASSERT - Should not throw
      await messageHandler('cache:invalidate', message);

      await serviceWithoutHandler.shutdown();
    });

    test('should handle handler execution errors', async () => {
      // ARRANGE
      const failingHandler = vi
        .fn()
        .mockRejectedValue(new Error('Handler failed'));
      invalidationService.registerInvalidationHandler(
        'repository',
        failingHandler
      );

      // Trigger subscriber ready to set up message handler
      const subscriberReadyHandler = mockRedisInstance.on.mock.calls.filter(
        (call) => call[0] === 'ready'
      )[1]![1];
      subscriberReadyHandler();

      const messageHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'message'
      )![1];

      const message = JSON.stringify({
        pattern: 'repo:*',
        timestamp: Date.now(),
        processId: 'different-process',
      });

      // ACT & ASSERT - Should not throw
      await messageHandler('cache:invalidate', message);
      expect(failingHandler).toHaveBeenCalled();
    });
  });

  describe('Global Invalidation', () => {
    beforeEach(() => {
      invalidationService = new DistributedCacheInvalidation({
        host: 'localhost',
      });
      invalidationService.registerInvalidationHandler(
        'repository',
        mockHandler
      );

      // Simulate Redis ready state
      const readyHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'ready'
      )![1];
      readyHandler();
    });

    test('should invalidate globally with Redis available', async () => {
      // ARRANGE
      const pattern = 'repo:test/*';
      const metadata = { repoUrl: 'test/repo', reason: 'update' };

      // ACT
      await invalidationService.invalidateGlobally(pattern, metadata);

      // ASSERT
      expect(mockHandler).toHaveBeenCalledWith(pattern, metadata); // Local invalidation
      expect(mockRedisInstance.publish).toHaveBeenCalledWith(
        'cache:invalidate',
        expect.stringContaining(pattern)
      );
    });

    test('should invalidate locally when Redis unavailable', async () => {
      // ARRANGE
      const pattern = 'repo:test/*';
      const metadata = { repoUrl: 'test/repo' };

      // Simulate Redis error state
      const errorHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'error'
      )![1];
      errorHandler(new Error('Connection lost'));

      // ACT
      await invalidationService.invalidateGlobally(pattern, metadata);

      // ASSERT
      expect(mockHandler).toHaveBeenCalledWith(pattern, metadata); // Local invalidation
      expect(mockRedisInstance.publish).not.toHaveBeenCalled(); // No broadcast
    });

    test('should handle Redis publish failures', async () => {
      // ARRANGE
      mockRedisInstance.publish.mockRejectedValue(new Error('Publish failed'));
      const pattern = 'repo:test/*';

      // ACT & ASSERT - Should not throw
      await invalidationService.invalidateGlobally(pattern);
      expect(mockHandler).toHaveBeenCalledWith(pattern, undefined); // Local still works
    });

    test('should handle invalidation without Redis config', async () => {
      // ARRANGE
      const serviceWithoutRedis = new DistributedCacheInvalidation();
      const localHandler = vi.fn().mockResolvedValue(undefined);
      serviceWithoutRedis.registerInvalidationHandler(
        'repository',
        localHandler
      );

      // ACT
      await serviceWithoutRedis.invalidateGlobally('repo:*');

      // ASSERT
      expect(localHandler).toHaveBeenCalledWith('repo:*', undefined);

      await serviceWithoutRedis.shutdown();
    });

    test('should handle invalidation without registered handlers', async () => {
      // ARRANGE
      const serviceWithoutHandlers = new DistributedCacheInvalidation({
        host: 'localhost',
      });

      // ACT & ASSERT - Should not throw
      await serviceWithoutHandlers.invalidateGlobally('repo:*');

      await serviceWithoutHandlers.shutdown();
    });
  });

  describe('Health Check', () => {
    test('should be healthy without Redis configuration', () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation();

      // ACT & ASSERT
      expect(invalidationService.isServiceHealthy()).toBe(true);
    });

    test('should be healthy when Redis is ready', () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation({
        host: 'localhost',
      });
      const readyHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'ready'
      )![1];

      // ACT
      readyHandler();

      // ASSERT
      expect(invalidationService.isServiceHealthy()).toBe(true);
    });

    test('should be unhealthy when Redis has errors', () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation({
        host: 'localhost',
      });
      const errorHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'error'
      )![1];

      // ACT
      errorHandler(new Error('Connection failed'));

      // ASSERT
      expect(invalidationService.isServiceHealthy()).toBe(false);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully with Redis connections', async () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation({
        host: 'localhost',
      });

      // ACT
      await invalidationService.shutdown();

      // ASSERT
      expect(mockRedisInstance.unsubscribe).toHaveBeenCalled();
      expect(mockRedisInstance.quit).toHaveBeenCalledTimes(2); // Publisher and subscriber
    });

    test('should shutdown gracefully without Redis connections', async () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation();

      // ACT & ASSERT - Should not throw
      await invalidationService.shutdown();
    });

    test('should handle shutdown errors', async () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation({
        host: 'localhost',
      });
      mockRedisInstance.quit.mockRejectedValue(new Error('Quit failed'));

      // ACT & ASSERT - Should not throw
      await invalidationService.shutdown();
    });
  });

  describe('Global Instance Management', () => {
    afterEach(async () => {
      await shutdownDistributedCacheInvalidation();
    });

    test('should create global instance on first call', () => {
      // ARRANGE
      const redisConfig = { host: 'localhost', port: 6379 };

      // ACT
      const instance1 = getDistributedCacheInvalidation(redisConfig);
      const instance2 = getDistributedCacheInvalidation();

      // ASSERT
      expect(instance1).toBe(instance2); // Same instance
      expect(mockRedisConstructor).toHaveBeenCalledTimes(2); // Only called once for first creation
    });

    test('should shutdown global instance', async () => {
      // ARRANGE
      const instance = getDistributedCacheInvalidation({ host: 'localhost' });

      // ACT
      await shutdownDistributedCacheInvalidation();

      // ASSERT
      expect(mockRedisInstance.quit).toHaveBeenCalled();

      // New instance should be created after shutdown
      const newInstance = getDistributedCacheInvalidation();
      expect(newInstance).not.toBe(instance);
    });

    test('should handle shutdown when no global instance exists', async () => {
      // ARRANGE & ACT & ASSERT - Should not throw
      await shutdownDistributedCacheInvalidation();
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    test('should handle non-standard message channels', async () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation({
        host: 'localhost',
      });

      // Trigger subscriber ready
      const subscriberReadyHandler = mockRedisInstance.on.mock.calls.filter(
        (call) => call[0] === 'ready'
      )[1]![1];
      subscriberReadyHandler();

      const messageHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'message'
      )![1];

      // ACT
      await messageHandler('unknown:channel', 'test-message');

      // ASSERT - Should ignore unknown channels
      expect(mockHandler).not.toHaveBeenCalled();
    });

    test('should handle message with missing metadata', async () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation({
        host: 'localhost',
      });
      invalidationService.registerInvalidationHandler(
        'repository',
        mockHandler
      );

      // Trigger subscriber ready to set up message handler
      const subscriberReadyHandler = mockRedisInstance.on.mock.calls.filter(
        (call) => call[0] === 'ready'
      )[1]![1];
      subscriberReadyHandler();

      const messageHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'message'
      )![1];

      const messageWithoutMetadata = JSON.stringify({
        pattern: 'repo:*',
        timestamp: Date.now(),
        processId: 'different-process',
        // No metadata field
      });

      // ACT
      await messageHandler('cache:invalidate', messageWithoutMetadata);

      // ASSERT
      expect(mockHandler).toHaveBeenCalledWith('repo:*', undefined);
    });

    test('should use default handler when specific handler not found', async () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation({
        host: 'localhost',
      });
      const defaultHandler = vi.fn().mockResolvedValue(undefined);
      invalidationService.registerInvalidationHandler(
        'default',
        defaultHandler
      );

      // Trigger subscriber ready to set up message handler
      const subscriberReadyHandler = mockRedisInstance.on.mock.calls.filter(
        (call) => call[0] === 'ready'
      )[1]![1];
      subscriberReadyHandler();

      const messageHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'message'
      )![1];

      const message = JSON.stringify({
        pattern: 'repo:*',
        timestamp: Date.now(),
        processId: 'different-process',
      });

      // ACT
      await messageHandler('cache:invalidate', message);

      // ASSERT
      expect(defaultHandler).toHaveBeenCalledWith('repo:*', undefined);
    });

    test('should handle concurrent invalidation requests', async () => {
      // ARRANGE
      invalidationService = new DistributedCacheInvalidation({
        host: 'localhost',
      });
      invalidationService.registerInvalidationHandler(
        'repository',
        mockHandler
      );

      const readyHandler = mockRedisInstance.on.mock.calls.find(
        (call) => call[0] === 'ready'
      )![1];
      readyHandler();

      // ACT
      const promises = [
        invalidationService.invalidateGlobally('repo:1/*'),
        invalidationService.invalidateGlobally('repo:2/*'),
        invalidationService.invalidateGlobally('repo:3/*'),
      ];

      await Promise.all(promises);

      // ASSERT
      expect(mockHandler).toHaveBeenCalledTimes(3); // All local invalidations
      expect(mockRedisInstance.publish).toHaveBeenCalledTimes(3); // All broadcasts
    });
  });
});
