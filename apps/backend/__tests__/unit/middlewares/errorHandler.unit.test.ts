import { describe, test, expect, vi, beforeEach } from 'vitest';
// apps/backend/__tests__/middlewares/errorHandler.test.ts
import { Request, Response, NextFunction } from 'express';
import errorHandler from '../../../src/middlewares/errorHandler';
import { GitrayError, HTTP_STATUS } from '@gitray/shared-types';

// Mock the logger service using inline factory without variables
vi.mock('../../../src/services/logger', () => ({
  __esModule: true,
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  },
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  })),
  initializeLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  })),
  createRequestLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
  })),
}));

describe('Error Handler Middleware', () => {
  // Setup mock request, response, and next function
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    // Arrange
    mockRequest = {
      path: '/test',
      method: 'GET',
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
    };
    mockNext = vi.fn();

    // Clear all mocks
    vi.clearAllMocks();
  });

  test('should log error stack and respond with 500 status and error message', () => {
    // Arrange
    const mockError = new Error('Test error message');
    mockError.stack = 'Test error stack';

    // Act
    errorHandler(
      mockError,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert - The middleware should respond with appropriate status and message
    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'An internal error occurred',
    });
  });

  test('should handle GitrayError and respond with custom status and message', () => {
    // Arrange
    const gitrayError = new GitrayError(
      'Custom error message',
      HTTP_STATUS.BAD_REQUEST,
      'VALIDATION_ERROR'
    );

    // Act
    errorHandler(
      gitrayError,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert - The middleware should respond with GitrayError status and message
    expect(mockResponse.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Custom error message',
      code: 'VALIDATION_ERROR',
    });
  });

  describe('Security Headers', () => {
    beforeEach(() => {
      mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
      };
    });

    test('should set strict security headers on generic errors', () => {
      // Arrange
      const mockError = new Error('Test error');

      // Act
      errorHandler(
        mockError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert - Verify all security headers are set
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("default-src 'none'")
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("script-src 'none'")
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Content-Type-Options',
        'nosniff'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Frame-Options',
        'DENY'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'inline'
      );
    });

    test('should set strict security headers on GitrayError', () => {
      // Arrange
      const gitrayError = new GitrayError(
        'Custom error',
        HTTP_STATUS.BAD_REQUEST,
        'VALIDATION_ERROR'
      );

      // Act
      errorHandler(
        gitrayError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert - Verify all security headers are set
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("default-src 'none'")
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Content-Type-Options',
        'nosniff'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Frame-Options',
        'DENY'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'inline'
      );
    });

    test('should set complete strict CSP policy', () => {
      // Arrange
      const mockError = new Error('Test error');

      // Act
      errorHandler(
        mockError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert - Verify the complete CSP includes all required directives
      const cspCall = (mockResponse.setHeader as any).mock.calls.find(
        (call: any[]) => call[0] === 'Content-Security-Policy'
      );
      expect(cspCall).toBeDefined();
      const cspValue = cspCall[1];

      // Verify all CSP directives are present
      expect(cspValue).toContain("default-src 'none'");
      expect(cspValue).toContain("script-src 'none'");
      expect(cspValue).toContain("style-src 'none'");
      expect(cspValue).toContain("img-src 'none'");
      expect(cspValue).toContain("object-src 'none'");
      expect(cspValue).toContain("base-uri 'none'");
      expect(cspValue).toContain("form-action 'none'");
      expect(cspValue).toContain("frame-ancestors 'none'");
    });
  });
});
