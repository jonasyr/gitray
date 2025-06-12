import { describe, test, expect } from 'vitest';
import dotenv from 'dotenv';

// anying the modules
vi.mock('express', () => {
  const mockJson = vi.fn();
  const mockApp = {
    use: vi.fn(),
    listen: vi.fn().mockImplementation((port: any, callback?: any) => {
      if (callback) callback();
      return mockApp;
    }),
  };
  const mockRouter = { get: vi.fn(), post: vi.fn(), use: vi.fn() };

  const mockExpress = vi.fn(() => mockApp);
  Object.assign(mockExpress, {
    json: mockJson,
    Router: vi.fn(() => mockRouter),
  });

  return {
    default: mockExpress,
  };
});

vi.mock('cors', () => ({
  default: vi.fn(() => 'mockedCors'),
}));
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));
vi.mock('../src/routes', () => ({
  default: 'mockedRoutes',
}));
vi.mock('../src/routes/repositoryRoutes', () => ({
  default: 'mockedRepositoryRoutes',
}));
vi.mock('../src/middlewares/errorHandler', () => ({
  default: 'mockedErrorHandler',
}));
vi.mock('../src/middlewares/requestId', () => ({
  requestIdMiddleware: vi.fn((req: any, res: any, next: any) => next()),
}));
vi.mock('express-rate-limit', () => ({
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));
vi.mock('../src/services/logger', () => ({
  __esModule: true,
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('../src/services/metrics', () => ({
  httpRequestsTotal: { inc: vi.fn() },
  httpRequestDuration: { observe: vi.fn() },
  metricsMiddleware: vi.fn((req: any, res: any, next: any) => next()),
  metricsHandler: vi.fn((req: any, res: any) =>
    res.status(200).send('mocked metrics')
  ),
}));

// anying process.env
const originalEnv = process.env;

describe('Express App Initialization', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Setup process.env
    process.env = { ...originalEnv };
    process.env.PORT = '3001';
  });

  afterEach(() => {
    // Restore process.env
    process.env = originalEnv;

    // Clear require cache to ensure fresh imports in each test
    vi.resetModules();
  });

  test('should configure the Express app with correct middlewares and routes', async () => {
    // Act - Import the index module to trigger the app initialization
    // Using dynamic import instead of require
    await import('../src/index');

    // Get the mocked modules
    const express = await import('express');
    const cors = await import('cors');
    const mockExpress = express.default as any;
    const mockCors = cors.default as any;
    const mockApp = mockExpress();

    // Assert
    expect(dotenv.config).toHaveBeenCalled();
    expect(mockExpress).toHaveBeenCalled();
    expect(mockCors).toHaveBeenCalled();
    expect(mockApp.use).toHaveBeenCalledWith('mockedCors');
    expect(mockExpress.json).toHaveBeenCalled();
    expect(mockApp.use).toHaveBeenCalledWith(mockExpress.json());
    expect(mockApp.use).toHaveBeenCalledWith('/api', 'mockedRoutes');
    expect(mockApp.use).toHaveBeenCalledWith(
      '/api/repositories',
      'mockedRepositoryRoutes'
    );
    expect(mockApp.use).toHaveBeenCalledWith('mockedErrorHandler');
    expect(mockApp.listen).toHaveBeenCalledWith('3001', expect.any(Function));
  });

  test('should use default port 3001 if PORT environment variable is not set', async () => {
    // Arrange
    delete process.env.PORT;

    // Act - Import the index module to trigger the app initialization
    // Using dynamic import instead of require
    await import('../src/index');

    // Get the mocked modules
    const express = await import('express');
    const mockExpress = express.default as any;
    const mockApp = mockExpress();

    // Assert
    expect(mockApp.listen).toHaveBeenCalledWith(3001, expect.any(Function));
  });

  test('should log when server starts', async () => {
    // Arrange
    const logger = (await import('../src/services/logger')).default;
    const infoSpy = vi.spyOn(logger, 'info');

    // Act - Import the index module to trigger the app initialization
    // Using dynamic import instead of require
    await import('../src/index');

    // Get the mocked modules
    const express = await import('express');
    const mockExpress = express.default as any;
    const mockApp = mockExpress();
    const listenCallback = mockApp.listen.mock.calls[0][1];

    // Manually call the listen callback to simulate server start
    listenCallback();

    // Assert
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('3001'));

    // Clean up
    infoSpy.mockRestore();
  });
});
