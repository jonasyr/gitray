// apps/backend/__tests__/unit/middlewares/adminAuth.unit.test.ts
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requireAdminToken } from '../../../src/middlewares/adminAuth';
import { HTTP_STATUS } from '@gitray/shared-types';

// Mock the logger service using vi.hoisted
const mockRequestLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../src/services/logger', () => ({
  createRequestLogger: vi.fn(() => mockRequestLogger),
}));

describe('Admin Authentication Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock request
    mockRequest = {
      path: '/api/commits/cache/stats',
      method: 'GET',
      headers: {},
      ip: '127.0.0.1',
      socket: {
        remoteAddress: '127.0.0.1',
      } as any,
    } as Partial<Request>;

    // Setup mock response
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    // Setup mock next function
    mockNext = vi.fn();

    // Set default environment variables
    process.env.ADMIN_AUTH_ENABLED = 'true';
    process.env.ADMIN_TOKEN = 'test-admin-token-12345678901234567890';
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.resetAllMocks();
  });

  describe('requireAdminToken', () => {
    test('should call next() when admin auth is disabled', () => {
      // Arrange
      process.env.ADMIN_AUTH_ENABLED = 'false';

      // Act
      requireAdminToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
      expect(mockRequestLogger.warn).toHaveBeenCalledWith(
        'Admin auth disabled - allowing request',
        expect.objectContaining({
          category: 'security',
          event: 'admin_auth_disabled',
        })
      );
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test('should return 500 when ADMIN_TOKEN is not configured but auth is enabled', () => {
      // Arrange
      delete process.env.ADMIN_TOKEN;

      // Act
      requireAdminToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Server misconfiguration',
        code: 'ADMIN_AUTH_NOT_CONFIGURED',
      });
      expect(mockRequestLogger.error).toHaveBeenCalledWith(
        'ADMIN_TOKEN not configured but admin auth enabled',
        expect.objectContaining({
          category: 'security',
          event: 'admin_auth_misconfigured',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should return 403 when X-Admin-Token header is missing', () => {
      // Act
      requireAdminToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        code: 'ADMIN_AUTH_REQUIRED',
        message: 'Admin authentication required. Provide X-Admin-Token header.',
      });
      expect(mockRequestLogger.warn).toHaveBeenCalledWith(
        'Admin endpoint accessed without token',
        expect.objectContaining({
          category: 'security',
          event: 'admin_auth_missing_token',
          path: '/api/commits/cache/stats',
          method: 'GET',
          ip: '127.0.0.1',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should return 403 when X-Admin-Token header is not a string', () => {
      // Arrange
      mockRequest.headers = {
        'x-admin-token': ['invalid', 'array'] as any,
      };

      // Act
      requireAdminToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        code: 'ADMIN_AUTH_REQUIRED',
        message: 'Admin authentication required. Provide X-Admin-Token header.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should return 403 when X-Admin-Token is invalid', () => {
      // Arrange
      mockRequest.headers = {
        'x-admin-token': 'invalid-token',
      };

      // Act
      requireAdminToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        code: 'INVALID_ADMIN_TOKEN',
        message: 'Invalid admin token provided.',
      });
      expect(mockRequestLogger.warn).toHaveBeenCalledWith(
        'Admin endpoint accessed with invalid token',
        expect.objectContaining({
          category: 'security',
          event: 'admin_auth_invalid_token',
          path: '/api/commits/cache/stats',
          method: 'GET',
          ip: '127.0.0.1',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should return 403 when token length does not match (timing attack prevention)', () => {
      // Arrange
      mockRequest.headers = {
        'x-admin-token': 'short',
      };

      // Act
      requireAdminToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        code: 'INVALID_ADMIN_TOKEN',
        message: 'Invalid admin token provided.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should call next() when valid X-Admin-Token is provided', () => {
      // Arrange
      mockRequest.headers = {
        'x-admin-token': 'test-admin-token-12345678901234567890',
      };

      // Act
      requireAdminToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
      expect(mockRequestLogger.info).toHaveBeenCalledWith(
        'Admin access granted',
        expect.objectContaining({
          category: 'security',
          event: 'admin_auth_success',
          path: '/api/commits/cache/stats',
          method: 'GET',
          ip: '127.0.0.1',
        })
      );
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test('should handle case-sensitive token matching', () => {
      // Arrange
      process.env.ADMIN_TOKEN = 'CaseSensitiveToken123456789012345';
      mockRequest.headers = {
        'x-admin-token': 'casesensitivetoken123456789012345', // Different case
      };

      // Act
      requireAdminToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should audit log successful admin access with all context', () => {
      // Arrange
      const customRequest = {
        ...mockRequest,
        path: '/metrics',
        method: 'GET',
        ip: '192.168.1.100',
        headers: {
          'x-admin-token': 'test-admin-token-12345678901234567890',
        },
      };

      // Act
      requireAdminToken(
        customRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockRequestLogger.info).toHaveBeenCalledWith(
        'Admin access granted',
        expect.objectContaining({
          category: 'security',
          event: 'admin_auth_success',
          path: '/metrics',
          method: 'GET',
          ip: '192.168.1.100',
        })
      );
    });

    test('should use socket.remoteAddress as fallback when req.ip is undefined', () => {
      // Arrange
      const customRequest = {
        ...mockRequest,
        headers: {
          'x-admin-token': 'invalid-token',
        },
        ip: undefined,
        socket: {
          remoteAddress: '10.0.0.5',
        } as any,
      };

      // Act
      requireAdminToken(
        customRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockRequestLogger.warn).toHaveBeenCalledWith(
        'Admin endpoint accessed with invalid token',
        expect.objectContaining({
          ip: '10.0.0.5',
        })
      );
    });

    test('should handle errors during token comparison gracefully', () => {
      // Arrange
      mockRequest.headers = {
        'x-admin-token': 'test-admin-token-12345678901234567890',
      };

      // Mock Buffer.from to throw an error
      const originalBufferFrom = Buffer.from;
      vi.spyOn(Buffer, 'from').mockImplementationOnce(() => {
        throw new Error('Buffer conversion failed');
      });

      // Act
      requireAdminToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(mockRequestLogger.error).toHaveBeenCalledWith(
        'Error during token comparison',
        expect.objectContaining({
          category: 'security',
          event: 'admin_auth_comparison_error',
          error: 'Buffer conversion failed',
        })
      );
      expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
      expect(mockNext).not.toHaveBeenCalled();

      // Restore original Buffer.from
      Buffer.from = originalBufferFrom;
    });
  });
});
