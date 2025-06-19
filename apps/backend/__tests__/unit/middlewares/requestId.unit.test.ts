// apps/backend/__tests__/unit/middlewares/requestId.unit.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware } from '../../../src/middlewares/requestId';

// Mock crypto module using vi.hoisted for better control
const mockRandomBytes = vi.hoisted(() => vi.fn());

vi.mock('crypto', () => ({
  randomBytes: mockRandomBytes,
}));

describe('Request ID Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockSetHeader: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // ARRANGE - Reset all mocks
    vi.clearAllMocks();

    // Setup mock response with setHeader spy
    mockSetHeader = vi.fn();
    mockResponse = {
      setHeader: mockSetHeader,
    };

    // Setup mock next function
    mockNext = vi.fn();

    // Setup default random bytes mock
    mockRandomBytes.mockReturnValue({
      toString: vi.fn().mockReturnValue('abc123def0'),
    });
  });

  test('should generate new request ID when no header provided', () => {
    // ARRANGE
    mockRequest = {
      headers: {},
    };

    // ACT
    requestIdMiddleware(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // ASSERT
    expect(mockRandomBytes).toHaveBeenCalledWith(5);
    expect(mockRequest.id).toBe('abc123def0');
    expect(mockSetHeader).toHaveBeenCalledWith('X-Request-ID', 'abc123def0');
    expect(mockNext).toHaveBeenCalledOnce();
  });

  test('should reuse existing request ID when header provided', () => {
    // ARRANGE
    mockRequest = {
      headers: {
        'x-request-id': 'existing-request-id-123',
      },
    };

    // ACT
    requestIdMiddleware(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // ASSERT
    expect(mockRandomBytes).not.toHaveBeenCalled();
    expect(mockRequest.id).toBe('existing-request-id-123');
    expect(mockSetHeader).toHaveBeenCalledWith(
      'X-Request-ID',
      'existing-request-id-123'
    );
    expect(mockNext).toHaveBeenCalledOnce();
  });

  test('should handle empty string header by generating new ID', () => {
    // ARRANGE
    mockRequest = {
      headers: {
        'x-request-id': '',
      },
    };

    // ACT
    requestIdMiddleware(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // ASSERT
    expect(mockRandomBytes).toHaveBeenCalledWith(5);
    expect(mockRequest.id).toBe('abc123def0');
    expect(mockSetHeader).toHaveBeenCalledWith('X-Request-ID', 'abc123def0');
    expect(mockNext).toHaveBeenCalledOnce();
  });

  test('should handle undefined headers object by generating new ID', () => {
    // ARRANGE
    mockRequest = {
      headers: undefined as any,
    };

    // ACT
    requestIdMiddleware(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // ASSERT
    expect(mockRandomBytes).toHaveBeenCalledWith(5);
    expect(mockRequest.id).toBe('abc123def0');
    expect(mockSetHeader).toHaveBeenCalledWith('X-Request-ID', 'abc123def0');
    expect(mockNext).toHaveBeenCalledOnce();
  });

  test('should handle different random bytes output formats', () => {
    // ARRANGE
    mockRequest = {
      headers: {},
    };
    mockRandomBytes.mockReturnValue({
      toString: vi.fn().mockReturnValue('deadbeef42'),
    });

    // ACT
    requestIdMiddleware(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // ASSERT
    expect(mockRandomBytes).toHaveBeenCalledWith(5);
    expect(mockRequest.id).toBe('deadbeef42');
    expect(mockSetHeader).toHaveBeenCalledWith('X-Request-ID', 'deadbeef42');
    expect(mockNext).toHaveBeenCalledOnce();
  });

  test('should handle array-type header by using first value', () => {
    // ARRANGE
    mockRequest = {
      headers: {
        'x-request-id': ['first-id', 'second-id'] as any,
      },
    };

    // ACT
    requestIdMiddleware(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // ASSERT
    expect(mockRandomBytes).not.toHaveBeenCalled();
    expect(mockRequest.id).toBe('first-id,second-id'); // Express joins arrays with comma
    expect(mockSetHeader).toHaveBeenCalledWith(
      'X-Request-ID',
      'first-id,second-id'
    );
    expect(mockNext).toHaveBeenCalledOnce();
  });
});
