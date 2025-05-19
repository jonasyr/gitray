// apps/backend/__tests__/index.test.ts
import dotenv from 'dotenv';

// Define Express mock types
type MockApp = {
  use: jest.Mock;
  listen: jest.Mock;
};

type MockExpress = jest.Mock<MockApp> & {
  json: jest.Mock;
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
  
  const mockExpress = jest.fn(() => mockApp) as MockExpress;
  mockExpress.json = jest.fn(() => mockJson);
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
  let express: MockExpress;
  let cors: jest.Mock;
  
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Get the mocked modules
    express = require('express');
    cors = require('cors');
    
    // Setup process.env
    process.env = { ...originalEnv };
    process.env.PORT = '3001';
  });

  afterEach(() => {
    // Restore process.env
    process.env = originalEnv;
    
    // Clear require cache to ensure fresh imports in each test
    jest.resetModules();
  });

  test('should configure the Express app with correct middlewares and routes', () => {
    // Act - Import the index module to trigger the app initialization
    require('../src/index');
    
    // Get the mock Express app
    const mockApp = express();
    
    // Assert
    expect(dotenv.config).toHaveBeenCalled();
    expect(express).toHaveBeenCalled();
    expect(cors).toHaveBeenCalled();
    expect(mockApp.use).toHaveBeenCalledWith('mockedCors');
    expect(express.json).toHaveBeenCalled();
    expect(mockApp.use).toHaveBeenCalledWith(express.json());
    expect(mockApp.use).toHaveBeenCalledWith('/api', 'mockedRoutes');
    expect(mockApp.use).toHaveBeenCalledWith('/api/repositories', 'mockedRepositoryRoutes');
    expect(mockApp.use).toHaveBeenCalledWith('mockedErrorHandler');
    expect(mockApp.listen).toHaveBeenCalledWith('3001', expect.any(Function));
  });

  test('should use default port 3001 if PORT environment variable is not set', () => {
    // Arrange
    delete process.env.PORT;
    
    // Act - Import the index module to trigger the app initialization
    require('../src/index');
    
    // Get the mock Express app
    const mockApp = express();
    
    // Assert
    expect(mockApp.listen).toHaveBeenCalledWith(3001, expect.any(Function));
  });

  test('should log when server starts', () => {
    // Arrange
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    // Act - Import the index module to trigger the app initialization
    require('../src/index');
    
    // Get the mock Express app
    const mockApp = express();
    const listenCallback = mockApp.listen.mock.calls[0][1];
    
    // Manually call the listen callback to simulate server start
    listenCallback();
    
    // Assert
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('3001'));
    
    // Clean up
    consoleSpy.mockRestore();
  });
});