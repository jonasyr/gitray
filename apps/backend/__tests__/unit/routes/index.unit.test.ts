// apps/backend/__tests__/unit/routes/index.unit.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import router from '../../../src/routes/index';

describe('Routes Index', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // ARRANGE - Reset all mocks
    vi.clearAllMocks();

    // Setup mock request
    mockRequest = {
      method: 'GET',
      path: '/',
    };

    // Setup mock response with json spy
    mockJson = vi.fn();
    mockResponse = {
      json: mockJson,
    };
  });

  test('should respond with hello message when GET request to root path', () => {
    // ARRANGE
    const expectedResponse = { message: 'Hello from Backend!' };

    // ACT
    // Extract the route handler from the router stack
    const routes = (router as any).stack;
    const rootRoute = routes.find(
      (layer: any) =>
        layer.route && layer.route.path === '/' && layer.route.methods.get
    );

    expect(rootRoute).toBeDefined();

    // Execute the GET handler
    const getHandler = rootRoute.route.stack[0].handle;
    getHandler(mockRequest as Request, mockResponse as Response);

    // ASSERT
    expect(mockJson).toHaveBeenCalledOnce();
    expect(mockJson).toHaveBeenCalledWith(expectedResponse);
  });

  test('should have GET route configured at root path', () => {
    // ARRANGE & ACT
    const routes = (router as any).stack;
    const rootRoute = routes.find(
      (layer: any) => layer.route && layer.route.path === '/'
    );

    // ASSERT
    expect(rootRoute).toBeDefined();
    expect(rootRoute.route.methods.get).toBe(true);
    expect(rootRoute.route.path).toBe('/');
  });

  test('should export router instance', () => {
    // ARRANGE & ACT & ASSERT
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
    expect(router.stack).toBeDefined();
  });

  test('should have exactly one route configured', () => {
    // ARRANGE & ACT
    const routes = (router as any).stack;

    // ASSERT
    expect(routes).toHaveLength(1);
    expect(routes[0].route).toBeDefined();
  });

  test('should handle request without using request parameters', () => {
    // ARRANGE
    const mockMinimalRequest = {} as Request;
    const expectedResponse = { message: 'Hello from Backend!' };

    // ACT
    const routes = (router as any).stack;
    const rootRoute = routes[0];
    const getHandler = rootRoute.route.stack[0].handle;

    // Execute handler with minimal request (underscore parameter indicates it's not used)
    getHandler(mockMinimalRequest, mockResponse as Response);

    // ASSERT
    expect(mockJson).toHaveBeenCalledWith(expectedResponse);
  });
});
