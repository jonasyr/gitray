import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextFunction, Request, Response } from 'express';
import { strictContentType } from '../../../src/middlewares/strictContentType';

describe('strictContentType middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: 'POST',
      get: vi.fn(),
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    next = vi.fn();
  });

  it('allows JSON requests with the custom header', () => {
    (mockRequest.get as ReturnType<typeof vi.fn>).mockImplementation(
      (header) => {
        if (header === 'Content-Type') return 'application/json; charset=utf-8';
        if (header === 'X-Requested-With') return 'XMLHttpRequest';
        return null;
      }
    );

    strictContentType(mockRequest as Request, mockResponse as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('rejects missing or unsupported content types', () => {
    (mockRequest.get as ReturnType<typeof vi.fn>).mockImplementation(
      (header) => {
        if (header === 'Content-Type') return 'text/plain';
        if (header === 'X-Requested-With') return 'XMLHttpRequest';
        return null;
      }
    );

    strictContentType(mockRequest as Request, mockResponse as Response, next);

    expect(mockResponse.status).toHaveBeenCalledWith(415);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_CONTENT_TYPE' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests missing the custom header', () => {
    (mockRequest.get as ReturnType<typeof vi.fn>).mockImplementation(
      (header) => {
        if (header === 'Content-Type') return 'application/json';
        return null;
      }
    );

    strictContentType(mockRequest as Request, mockResponse as Response, next);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'MISSING_CUSTOM_HEADER' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('bypasses validation for non state-changing methods', () => {
    mockRequest.method = 'GET';
    strictContentType(mockRequest as Request, mockResponse as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });
});
