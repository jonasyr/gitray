// apps/backend/__tests__/middlewares/errorHandler.test.ts
import { Request, Response, NextFunction } from 'express';
import errorHandler from '../../src/middlewares/errorHandler';

describe('Error Handler Middleware', () => {
  // Setup mock request, response, and next function
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Arrange
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
    
    // Spy on console.error to verify it's called and prevent actual console output during tests
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
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
    expect(consoleSpy).toHaveBeenCalledWith(mockError.stack);
    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Test error message',
    });
  });
});