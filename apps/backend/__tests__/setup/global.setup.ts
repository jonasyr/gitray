// apps/backend/__tests__/setup/global.setup.ts
import { vi } from 'vitest';

// Global mock variables that can be used across all test files
declare global {
  // eslint-disable-next-line no-var
  var mockLogger: any;
  // eslint-disable-next-line no-var
  var getLogger: any;
  // eslint-disable-next-line no-var
  var mockMetrics: any;
}

// Create the global mock logger
global.mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  http: vi.fn(),
  verbose: vi.fn(),
  silly: vi.fn(),
};

// Create the global getLogger function
global.getLogger = vi.fn(() => global.mockLogger);

// Create the global metrics mock
global.mockMetrics = {
  requestsTotal: { inc: vi.fn() },
  requestDuration: { observe: vi.fn() },
  recordStreamingStart: vi.fn(),
  recordStreamingCompletion: vi.fn(),
  recordStreamingError: vi.fn(),
  recordStreamingBatch: vi.fn(),
  getRepositorySizeCategory: vi.fn(() => 'medium'),
  getBatchSizeCategory: vi.fn(() => 'medium'),
  updateCacheMetrics: vi.fn(),
  tempDirectories: { inc: vi.fn(), dec: vi.fn(), set: vi.fn() },
  cleanupQueueSize: { set: vi.fn(), inc: vi.fn(), dec: vi.fn() },
  cacheHits: { inc: vi.fn() },
  cacheMisses: vi.fn(),
  activeStreamingOperations: { inc: vi.fn(), dec: vi.fn() },
  streamingOperations: { inc: vi.fn() },
  repositorySizeDistribution: { observe: vi.fn() },
};
