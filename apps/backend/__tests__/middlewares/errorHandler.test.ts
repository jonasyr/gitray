// apps/backend/__tests__/middlewares/errorHandler.test.ts
import { Request, Response, NextFunction } from 'express';
import errorHandler from '../../src/middlewares/errorHandler';
import logger from '../../src/services/logger';

jest.mock('../../src/services/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
  },
}));

describe('Error Handler Middleware', () => {
  // Setup mock request, response, and next function
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Arrange
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();

    errorSpy = jest.spyOn(logger, 'error');
  });

  afterEach(() => {
    errorSpy.mockRestore();
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

    // Assert
    expect(errorSpy).toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'An internal error occurred',
    });
  });
});
