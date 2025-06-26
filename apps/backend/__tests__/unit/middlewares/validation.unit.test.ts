// apps/backend/__tests__/unit/middlewares/validation.unit.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { handleValidationErrors } from '../../../src/middlewares/validation';
import { ValidationError } from '@gitray/shared-types';

// Mock express-validator
const mockValidationResult = vi.hoisted(() => vi.fn());
vi.mock('express-validator', () => ({
  validationResult: mockValidationResult,
}));

// Mock ValidationError from shared-types
vi.mock('@gitray/shared-types', () => ({
  ValidationError: vi.fn().mockImplementation((message, errors) => {
    const error = new Error(message);
    error.name = 'ValidationError';
    (error as any).errors = errors;
    return error;
  }),
}));

describe('Validation Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    // ARRANGE - Reset all mocks
    vi.clearAllMocks();

    // Setup mock request, response, and next function
    mockRequest = {};
    mockResponse = {};
    mockNext = vi.fn();
  });

  test('should call next when no validation errors exist', () => {
    // ARRANGE
    const mockErrors = {
      isEmpty: vi.fn().mockReturnValue(true),
      array: vi.fn().mockReturnValue([]),
    };
    mockValidationResult.mockReturnValue(mockErrors);

    // ACT
    handleValidationErrors(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // ASSERT
    expect(mockValidationResult).toHaveBeenCalledWith(mockRequest);
    expect(mockErrors.isEmpty).toHaveBeenCalledOnce();
    expect(mockErrors.array).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledOnce();
    expect(ValidationError).not.toHaveBeenCalled();
  });

  test('should throw ValidationError when validation errors exist', () => {
    // ARRANGE
    const validationErrors = [
      {
        type: 'field',
        location: 'body',
        path: 'email',
        value: 'invalid-email',
        msg: 'Invalid email format',
      },
      {
        type: 'field',
        location: 'body',
        path: 'password',
        value: '',
        msg: 'Password is required',
      },
    ];

    const mockErrors = {
      isEmpty: vi.fn().mockReturnValue(false),
      array: vi.fn().mockReturnValue(validationErrors),
    };
    mockValidationResult.mockReturnValue(mockErrors);

    // ACT & ASSERT
    expect(() => {
      handleValidationErrors(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
    }).toThrow();

    expect(mockValidationResult).toHaveBeenCalledWith(mockRequest);
    expect(mockErrors.isEmpty).toHaveBeenCalledOnce();
    expect(mockErrors.array).toHaveBeenCalledOnce();
    expect(ValidationError).toHaveBeenCalledWith(
      'Validation failed',
      validationErrors
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should throw ValidationError with single validation error', () => {
    // ARRANGE
    const singleError = [
      {
        type: 'field',
        location: 'params',
        path: 'id',
        value: 'invalid-id',
        msg: 'ID must be a valid UUID',
      },
    ];

    const mockErrors = {
      isEmpty: vi.fn().mockReturnValue(false),
      array: vi.fn().mockReturnValue(singleError),
    };
    mockValidationResult.mockReturnValue(mockErrors);

    // ACT & ASSERT
    expect(() => {
      handleValidationErrors(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
    }).toThrow();

    expect(ValidationError).toHaveBeenCalledWith(
      'Validation failed',
      singleError
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should throw ValidationError with complex validation errors', () => {
    // ARRANGE
    const complexErrors = [
      {
        type: 'field',
        location: 'body',
        path: 'user.profile.age',
        value: -1,
        msg: 'Age must be a positive number',
      },
      {
        type: 'field',
        location: 'query',
        path: 'page',
        value: 'abc',
        msg: 'Page must be a number',
      },
      {
        type: 'field',
        location: 'headers',
        path: 'authorization',
        value: undefined,
        msg: 'Authorization header is required',
      },
    ];

    const mockErrors = {
      isEmpty: vi.fn().mockReturnValue(false),
      array: vi.fn().mockReturnValue(complexErrors),
    };
    mockValidationResult.mockReturnValue(mockErrors);

    // ACT & ASSERT
    expect(() => {
      handleValidationErrors(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
    }).toThrow();

    expect(ValidationError).toHaveBeenCalledWith(
      'Validation failed',
      complexErrors
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  test('should handle empty errors array as no errors', () => {
    // ARRANGE
    const mockErrors = {
      isEmpty: vi.fn().mockReturnValue(true),
      array: vi.fn().mockReturnValue([]),
    };
    mockValidationResult.mockReturnValue(mockErrors);

    // ACT
    handleValidationErrors(
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // ASSERT
    expect(mockErrors.isEmpty).toHaveBeenCalledOnce();
    expect(mockNext).toHaveBeenCalledOnce();
    expect(ValidationError).not.toHaveBeenCalled();
  });

  test('should handle validation result with different request objects', () => {
    // ARRANGE
    const requestWithData = {
      body: { email: 'test@example.com' },
      params: { id: '123' },
      query: { page: '1' },
    } as Partial<Request>;

    const mockErrors = {
      isEmpty: vi.fn().mockReturnValue(true),
      array: vi.fn().mockReturnValue([]),
    };
    mockValidationResult.mockReturnValue(mockErrors);

    // ACT
    handleValidationErrors(
      requestWithData as Request,
      mockResponse as Response,
      mockNext
    );

    // ASSERT
    expect(mockValidationResult).toHaveBeenCalledWith(requestWithData);
    expect(mockNext).toHaveBeenCalledOnce();
  });

  test('should preserve validation error structure when throwing', () => {
    // ARRANGE
    const specificErrors = [
      {
        type: 'field',
        location: 'body',
        path: 'email',
        value: 'not-an-email',
        msg: 'Must be a valid email address',
        nestedProperty: 'customValue',
      },
    ];

    const mockErrors = {
      isEmpty: vi.fn().mockReturnValue(false),
      array: vi.fn().mockReturnValue(specificErrors),
    };
    mockValidationResult.mockReturnValue(mockErrors);

    // ACT & ASSERT
    expect(() => {
      handleValidationErrors(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
    }).toThrow();

    expect(ValidationError).toHaveBeenCalledWith(
      'Validation failed',
      specificErrors
    );
    expect(mockErrors.array).toHaveBeenCalledOnce();
  });

  test('should handle when validationResult returns null or undefined array', () => {
    // ARRANGE
    const mockErrors = {
      isEmpty: vi.fn().mockReturnValue(false),
      array: vi.fn().mockReturnValue(null),
    };
    mockValidationResult.mockReturnValue(mockErrors);

    // ACT & ASSERT
    expect(() => {
      handleValidationErrors(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
    }).toThrow();

    expect(ValidationError).toHaveBeenCalledWith('Validation failed', null);
  });
});
