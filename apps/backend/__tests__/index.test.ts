// apps/backend/__tests__/index.test.ts
import dotenv from 'dotenv';

// Define Express mock types
type MockApp = {
  use: jest.Mock;
  listen: jest.Mock;
};

type MockExpress = jest.Mock<MockApp> & {
  json: jest.Mock;
  Router?: jest.Mock;
};

// Mocking the modules
jest.mock('express', () => {
  const mockJson = jest.fn();
  const mockApp = {
    use: jest.fn(),
    listen: jest.fn().mockImplementation((port, callback) => {
      if (callback) callback();
      return mockApp;
    }),
  };
  const mockRouter = { get: jest.fn(), post: jest.fn(), use: jest.fn() };

  const mockExpress = jest.fn(() => mockApp) as MockExpress;
  mockExpress.json = jest.fn(() => mockJson);
  mockExpress.Router = jest.fn(() => mockRouter);
  return mockExpress;
});

jest.mock('cors', () => jest.fn(() => 'mockedCors'));
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../src/routes', () => 'mockedRoutes');
jest.mock('../src/routes/repositoryRoutes', () => 'mockedRepositoryRoutes');
jest.mock('../src/middlewares/errorHandler', () => 'mockedErrorHandler');

// Mocking process.env
const originalEnv = process.env;

describe('Express App Initialization', () => {
  let mockExpress: MockExpress;
  let mockCors: jest.Mock;
  
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Setup process.env
    process.env = { ...originalEnv };
    process.env.PORT = '3001';
    
    // Import the mocked modules after resetting mocks
    // Using jest.requireMock to avoid require() style imports
    mockExpress = jest.requireMock('express');
    mockCors = jest.requireMock('cors');
  });

  afterEach(() => {
    // Restore process.env
    process.env = originalEnv;
    
    // Clear require cache to ensure fresh imports in each test
    jest.resetModules();
  });

  test('should configure the Express app with correct middlewares and routes', async () => {
    // Act - Import the index module to trigger the app initialization
    // Using dynamic import instead of require
    await import('../src/index');
    
    // Get the mock Express app
    const mockApp = mockExpress();
    
    // Assert
    expect(dotenv.config).toHaveBeenCalled();
    expect(mockExpress).toHaveBeenCalled();
    expect(mockCors).toHaveBeenCalled();
    expect(mockApp.use).toHaveBeenCalledWith('mockedCors');
    expect(mockExpress.json).toHaveBeenCalled();
    expect(mockApp.use).toHaveBeenCalledWith(mockExpress.json());
    expect(mockApp.use).toHaveBeenCalledWith('/api', 'mockedRoutes');
    expect(mockApp.use).toHaveBeenCalledWith('/api/repositories', 'mockedRepositoryRoutes');
    expect(mockApp.use).toHaveBeenCalledWith('mockedErrorHandler');
    expect(mockApp.listen).toHaveBeenCalledWith('3001', expect.any(Function));
  });

  test('should use default port 3001 if PORT environment variable is not set', async () => {
    // Arrange
    delete process.env.PORT;
    
    // Act - Import the index module to trigger the app initialization
    // Using dynamic import instead of require
    await import('../src/index');
    
    // Get the mock Express app
    const mockApp = mockExpress();
    
    // Assert
    expect(mockApp.listen).toHaveBeenCalledWith(3001, expect.any(Function));
  });

  test('should log when server starts', async () => {
    // Arrange
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    // Act - Import the index module to trigger the app initialization
    // Using dynamic import instead of require
    await import('../src/index');
    
    // Get the mock Express app
    const mockApp = mockExpress();
    const listenCallback = mockApp.listen.mock.calls[0][1];
    
    // Manually call the listen callback to simulate server start
    listenCallback();
    
    // Assert
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('3001'));
    
    // Clean up
    consoleSpy.mockRestore();
  });
});