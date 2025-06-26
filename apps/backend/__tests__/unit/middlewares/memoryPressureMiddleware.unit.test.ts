// apps/backend/__tests__/middlewares/memoryPressureMiddleware.test.ts
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  memoryPressureMiddleware,
  memoryAwareErrorHandler,
} from '../../../src/middlewares/memoryPressureMiddleware';
import { HTTP_STATUS } from '@gitray/shared-types';

// Mock the memory pressure manager using vi.hoisted
const mockShouldThrottleRequest = vi.hoisted(() => vi.fn());
const mockGetMemoryStats = vi.hoisted(() => vi.fn());

vi.mock('../../../src/utils/memoryPressureManager', () => ({
  shouldThrottleRequest: mockShouldThrottleRequest,
  getMemoryStats: mockGetMemoryStats,
}));

// Mock the logger service using vi.hoisted
const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../src/services/logger', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

describe('Memory Pressure Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock request
    mockRequest = {
      path: '/api/commits',
      method: 'GET',
      headers: {
        'user-agent': 'test-agent',
      },
      query: {},
    } as Partial<Request>;

    // Setup mock response
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
    };

    // Setup mock next function
    mockNext = vi.fn();

    // Default memory stats mock
    mockGetMemoryStats.mockReturnValue({
      pressure: {
        level: 'normal',
      },
      system: {
        usagePercentage: 0.5,
      },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('memoryPressureMiddleware', () => {
    test('should skip throttling when skipMemoryThrottling is true', () => {
      // Arrange
      mockRequest.skipMemoryThrottling = true;

      // Act
      memoryPressureMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
      expect(mockShouldThrottleRequest).not.toHaveBeenCalled();
    });

    test('should proceed normally when no throttling is needed', () => {
      // Arrange
      mockShouldThrottleRequest.mockReturnValue({
        shouldThrottle: false,
      });

      // Act
      memoryPressureMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockShouldThrottleRequest).toHaveBeenCalledWith({
        path: '/api/commits',
        method: 'GET',
        priority: 'normal',
        userAgent: 'test-agent',
      });
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Memory-Pressure',
        'normal'
      );
      expect(mockNext).toHaveBeenCalledOnce();
    });

    test('should throttle request when memory pressure is high', () => {
      // Arrange
      mockShouldThrottleRequest.mockReturnValue({
        shouldThrottle: true,
        reason: 'High memory usage',
        retryAfter: 30,
      });

      mockGetMemoryStats.mockReturnValue({
        pressure: {
          level: 'critical',
        },
        system: {
          usagePercentage: 0.9,
        },
      });

      // Act
      memoryPressureMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', 30);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Memory-Pressure',
        'critical'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Memory-Usage',
        '90%'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(
        HTTP_STATUS.SERVICE_UNAVAILABLE
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Service temporarily unavailable due to memory pressure',
        reason: 'High memory usage',
        retryAfter: 30,
        memoryPressure: {
          level: 'critical',
          systemUsage: '90%',
          suggestion:
            'Please retry in a few moments or contact support if this persists',
        },
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Request throttled due to memory pressure',
        expect.objectContaining({
          path: '/api/commits',
          method: 'GET',
          priority: 'normal',
          reason: 'High memory usage',
          memoryUsage: '90%',
          userAgent: 'test-agent',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should set high priority for health check endpoints', () => {
      // Arrange
      const healthRequest = {
        ...mockRequest,
        path: '/health',
      } as Request;
      mockShouldThrottleRequest.mockReturnValue({
        shouldThrottle: false,
      });

      // Act
      memoryPressureMiddleware(
        healthRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockShouldThrottleRequest).toHaveBeenCalledWith({
        path: '/health',
        method: 'GET',
        priority: 'high',
        userAgent: 'test-agent',
      });
      expect(healthRequest.memoryPriority).toBe('high');
    });

    test('should set high priority for metrics endpoints', () => {
      // Arrange
      const metricsRequest = {
        ...mockRequest,
        path: '/metrics',
      } as Request;
      mockShouldThrottleRequest.mockReturnValue({
        shouldThrottle: false,
      });

      // Act
      memoryPressureMiddleware(
        metricsRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockShouldThrottleRequest).toHaveBeenCalledWith({
        path: '/metrics',
        method: 'GET',
        priority: 'high',
        userAgent: 'test-agent',
      });
      expect(metricsRequest.memoryPriority).toBe('high');
    });

    test('should set high priority for cache endpoints', () => {
      // Arrange
      const cacheRequest = {
        ...mockRequest,
        path: '/api/cache/clear',
      } as Request;
      mockShouldThrottleRequest.mockReturnValue({
        shouldThrottle: false,
      });

      // Act
      memoryPressureMiddleware(
        cacheRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockShouldThrottleRequest).toHaveBeenCalledWith({
        path: '/api/cache/clear',
        method: 'GET',
        priority: 'high',
        userAgent: 'test-agent',
      });
      expect(cacheRequest.memoryPriority).toBe('high');
    });

    test('should set high priority for admin user agents', () => {
      // Arrange
      mockRequest.headers!['user-agent'] = 'admin-tool';
      mockShouldThrottleRequest.mockReturnValue({
        shouldThrottle: false,
      });

      // Act
      memoryPressureMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockShouldThrottleRequest).toHaveBeenCalledWith({
        path: '/api/commits',
        method: 'GET',
        priority: 'high',
        userAgent: 'admin-tool',
      });
      expect(mockRequest.memoryPriority).toBe('high');
    });

    test('should set high priority for admin authorization', () => {
      // Arrange
      mockRequest.headers!.authorization = 'Bearer admin-token';
      mockShouldThrottleRequest.mockReturnValue({
        shouldThrottle: false,
      });

      // Act
      memoryPressureMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockShouldThrottleRequest).toHaveBeenCalledWith({
        path: '/api/commits',
        method: 'GET',
        priority: 'high',
        userAgent: 'test-agent',
      });
      expect(mockRequest.memoryPriority).toBe('high');
    });

    test('should set low priority for large repository operations', () => {
      // Arrange
      const largeRepoRequest = {
        ...mockRequest,
        path: '/api/commits',
        query: {
          repoUrl: 'https://github.com/torvalds/linux',
        },
      } as Request;
      mockShouldThrottleRequest.mockReturnValue({
        shouldThrottle: false,
      });

      // Act
      memoryPressureMiddleware(
        largeRepoRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockShouldThrottleRequest).toHaveBeenCalledWith({
        path: '/api/commits',
        method: 'GET',
        priority: 'low',
        userAgent: 'test-agent',
      });
      expect(largeRepoRequest.memoryPriority).toBe('low');
    });

    test('should set low priority for streaming operations', () => {
      // Arrange
      const streamingRequest = {
        ...mockRequest,
        path: '/api/commits',
        query: {
          repoUrl: 'https://github.com/example/repo',
          useStreaming: 'true',
        },
      } as Request;
      mockShouldThrottleRequest.mockReturnValue({
        shouldThrottle: false,
      });

      // Act
      memoryPressureMiddleware(
        streamingRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockShouldThrottleRequest).toHaveBeenCalledWith({
        path: '/api/commits',
        method: 'GET',
        priority: 'low',
        userAgent: 'test-agent',
      });
      expect(streamingRequest.memoryPriority).toBe('low');
    });

    test('should respect explicit priority header', () => {
      // Arrange
      mockRequest.headers!['x-priority'] = 'high';
      mockShouldThrottleRequest.mockReturnValue({
        shouldThrottle: false,
      });

      // Act
      memoryPressureMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockShouldThrottleRequest).toHaveBeenCalledWith({
        path: '/api/commits',
        method: 'GET',
        priority: 'high',
        userAgent: 'test-agent',
      });
      expect(mockRequest.memoryPriority).toBe('high');
    });

    test('should set normal priority for repository POST operations', () => {
      // Arrange
      const repoPostRequest = {
        ...mockRequest,
        path: '/api/repositories',
        method: 'POST',
      } as Request;
      mockShouldThrottleRequest.mockReturnValue({
        shouldThrottle: false,
      });

      // Act
      memoryPressureMiddleware(
        repoPostRequest,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockShouldThrottleRequest).toHaveBeenCalledWith({
        path: '/api/repositories',
        method: 'POST',
        priority: 'normal',
        userAgent: 'test-agent',
      });
      expect(repoPostRequest.memoryPriority).toBe('normal');
    });
  });

  describe('memoryAwareErrorHandler', () => {
    test('should handle memory-related errors with critical pressure', () => {
      // Arrange
      const memoryError = new Error('ENOMEM: not enough memory');
      mockGetMemoryStats.mockReturnValue({
        pressure: {
          level: 'critical',
        },
      });

      // Act
      memoryAwareErrorHandler(
        memoryError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Memory-related error detected',
        expect.objectContaining({
          error: 'ENOMEM: not enough memory',
          path: '/api/commits',
          method: 'GET',
        })
      );
      expect(mockResponse.status).toHaveBeenCalledWith(
        HTTP_STATUS.SERVICE_UNAVAILABLE
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Service experiencing memory pressure',
        suggestion:
          'Please cache responses client-side and reduce request frequency',
        memoryPressure: { level: 'critical' },
        retryAfter: 60,
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should handle memory-related errors with emergency pressure', () => {
      // Arrange
      const memoryError = new Error('heap out of memory');
      mockGetMemoryStats.mockReturnValue({
        pressure: {
          level: 'emergency',
        },
      });

      // Act
      memoryAwareErrorHandler(
        memoryError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Memory-related error detected',
        expect.objectContaining({
          error: 'heap out of memory',
        })
      );
      expect(mockResponse.status).toHaveBeenCalledWith(
        HTTP_STATUS.SERVICE_UNAVAILABLE
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should pass non-critical memory errors to next handler', () => {
      // Arrange
      const memoryError = new Error('memory leak detected');
      mockGetMemoryStats.mockReturnValue({
        pressure: {
          level: 'warning',
        },
      });

      // Act
      memoryAwareErrorHandler(
        memoryError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Memory-related error detected',
        expect.objectContaining({
          error: 'memory leak detected',
        })
      );
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(memoryError);
    });

    test('should handle MemoryPressureError by name', () => {
      // Arrange
      const memoryError = new Error('Custom error');
      memoryError.name = 'MemoryPressureError';
      mockGetMemoryStats.mockReturnValue({
        pressure: {
          level: 'critical',
        },
      });

      // Act
      memoryAwareErrorHandler(
        memoryError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Memory-related error detected',
        expect.objectContaining({
          error: 'Custom error',
        })
      );
      expect(mockResponse.status).toHaveBeenCalledWith(
        HTTP_STATUS.SERVICE_UNAVAILABLE
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should pass non-memory errors to next handler', () => {
      // Arrange
      const normalError = new Error('Network timeout');

      // Act
      memoryAwareErrorHandler(
        normalError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(normalError);
    });
  });
});
