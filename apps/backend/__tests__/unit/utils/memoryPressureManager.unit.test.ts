// apps/backend/__tests__/utils/memoryPressureManager.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import os from 'os';
import {
  MemoryPressureError,
  executeWithMemoryProtection,
  shouldThrottleRequest,
  getMemoryStats,
  getMemoryMetrics,
} from '../../../src/utils/memoryPressureManager';

// Mock dependencies using vi.hoisted
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../src/services/logger', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

// Mock os module
vi.mock('os', () => ({
  default: {
    totalmem: vi.fn(),
    freemem: vi.fn(),
  },
}));

// Mock process.memoryUsage using vi.hoisted
const mockMemoryUsage = vi.hoisted(() => vi.fn());
Object.defineProperty(process, 'memoryUsage', {
  value: mockMemoryUsage,
  writable: true,
});

// Mock global.gc using vi.hoisted
const mockGc = vi.hoisted(() => vi.fn());
Object.defineProperty(global, 'gc', {
  value: mockGc,
  writable: true,
});

describe('MemoryPressureManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default OS memory values (8GB total, 4GB free)
    (os.totalmem as any).mockReturnValue(8 * 1024 * 1024 * 1024);
    (os.freemem as any).mockReturnValue(4 * 1024 * 1024 * 1024);

    // Setup default process memory values
    mockMemoryUsage.mockReturnValue({
      heapUsed: 100 * 1024 * 1024, // 100MB
      heapTotal: 200 * 1024 * 1024, // 200MB
      external: 50 * 1024 * 1024, // 50MB
      rss: 300 * 1024 * 1024, // 300MB
    });
  });

  describe('getMemoryStats', () => {
    test('should return memory stats with normal pressure', () => {
      // Act
      const stats = getMemoryStats();

      // Assert
      expect(stats.system.totalBytes).toBe(8 * 1024 * 1024 * 1024);
      expect(stats.system.freeBytes).toBe(4 * 1024 * 1024 * 1024);
      expect(stats.system.usedBytes).toBe(4 * 1024 * 1024 * 1024);
      expect(stats.system.usagePercentage).toBe(0.5);
      expect(stats.pressure.level).toBe('normal');
      expect(stats.pressure.action).toBe('none');
    });

    test('should return warning pressure when threshold exceeded', () => {
      // Arrange - Set memory to 80% usage (warning threshold is 75%)
      (os.freemem as any).mockReturnValue(1.6 * 1024 * 1024 * 1024); // 1.6GB free = 80% used

      // Act
      const stats = getMemoryStats();

      // Assert
      expect(stats.system.usagePercentage).toBe(0.8);
      expect(stats.pressure.level).toBe('warning');
      expect(stats.pressure.action).toBe('monitoring + gc');
    });

    test('should return critical pressure when threshold exceeded', () => {
      // Arrange - Set memory to 90% usage (critical threshold is 85%)
      (os.freemem as any).mockReturnValue(0.8 * 1024 * 1024 * 1024); // 0.8GB free = 90% used

      // Act
      const stats = getMemoryStats();

      // Assert
      expect(stats.system.usagePercentage).toBe(0.9);
      expect(stats.pressure.level).toBe('critical');
      expect(stats.pressure.action).toBe('throttling + circuit_breaker + gc');
    });

    test('should return emergency pressure when threshold exceeded', () => {
      // Arrange - Set memory to 96% usage (emergency threshold is 95%)
      (os.freemem as any).mockReturnValue(0.32 * 1024 * 1024 * 1024); // 0.32GB free = 96% used

      // Act
      const stats = getMemoryStats();

      // Assert
      expect(stats.system.usagePercentage).toBe(0.96);
      expect(stats.pressure.level).toBe('emergency');
      expect(stats.pressure.action).toBe(
        'emergency_eviction + throttling + circuit_breaker'
      );
    });

    test('should detect critical pressure based on process memory usage', () => {
      // Arrange - Process using 75% of system memory (critical process threshold is 70%)
      mockMemoryUsage.mockReturnValue({
        heapUsed: 100 * 1024 * 1024,
        heapTotal: 200 * 1024 * 1024,
        external: 50 * 1024 * 1024,
        rss: 6 * 1024 * 1024 * 1024, // 6GB RSS = 75% of 8GB system
      });

      // Act
      const stats = getMemoryStats();

      // Assert
      expect(stats.pressure.level).toBe('critical');
      expect(stats.pressure.processThreshold).toBe(0.75);
    });
  });

  describe('shouldThrottleRequest', () => {
    test('should not throttle under normal conditions', () => {
      // Act
      const result = shouldThrottleRequest({
        path: '/api/commits',
        method: 'GET',
        priority: 'normal',
      });

      // Assert
      expect(result.shouldThrottle).toBe(false);
    });

    test('should throttle low priority requests during emergency', () => {
      // Arrange - Set emergency memory conditions
      (os.freemem as any).mockReturnValue(0.32 * 1024 * 1024 * 1024); // 96% used

      // Act
      const result = shouldThrottleRequest({
        path: '/api/commits',
        method: 'GET',
        priority: 'low',
      });

      // Assert
      expect(result.shouldThrottle).toBe(true);
      expect(result.reason).toBe(
        'Emergency memory pressure - only high priority requests allowed'
      );
      expect(result.retryAfter).toBe(60);
    });

    test('should not throttle high priority requests during emergency', () => {
      // Arrange - Set emergency memory conditions
      (os.freemem as any).mockReturnValue(0.32 * 1024 * 1024 * 1024); // 96% used

      // Act
      const result = shouldThrottleRequest({
        path: '/api/commits',
        method: 'GET',
        priority: 'high',
      });

      // Assert
      expect(result.shouldThrottle).toBe(false);
    });

    test('should throttle expensive operations during critical pressure', () => {
      // Arrange - Set critical memory conditions
      (os.freemem as any).mockReturnValue(0.8 * 1024 * 1024 * 1024); // 90% used

      // Act
      const result = shouldThrottleRequest({
        path: '/api/commits',
        method: 'GET',
        priority: 'normal',
      });

      // Assert
      expect(result.shouldThrottle).toBe(true);
      expect(result.reason).toBe(
        'Critical memory pressure - expensive operations throttled'
      );
      expect(result.retryAfter).toBe(30);
    });

    test('should not throttle expensive operations with high priority during critical pressure', () => {
      // Arrange - Set critical memory conditions
      (os.freemem as any).mockReturnValue(0.8 * 1024 * 1024 * 1024); // 90% used

      // Act
      const result = shouldThrottleRequest({
        path: '/api/commits',
        method: 'GET',
        priority: 'high',
      });

      // Assert
      expect(result.shouldThrottle).toBe(false);
    });

    test('should not throttle cache operations during critical pressure', () => {
      // Arrange - Set critical memory conditions
      (os.freemem as any).mockReturnValue(0.8 * 1024 * 1024 * 1024); // 90% used

      // Act
      const result = shouldThrottleRequest({
        path: '/api/cache/clear',
        method: 'GET',
        priority: 'normal',
      });

      // Assert
      expect(result.shouldThrottle).toBe(false);
    });
  });

  describe('executeWithMemoryProtection', () => {
    test('should execute operation successfully under normal conditions', async () => {
      // Arrange
      const mockOperation = vi.fn().mockResolvedValue('success');

      // Act
      const result = await executeWithMemoryProtection(
        'test-operation',
        mockOperation
      );

      // Assert
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledOnce();
    });

    test('should handle operation failures gracefully', async () => {
      // Arrange
      const error = new Error('Operation failed');
      const mockOperation = vi.fn().mockRejectedValue(error);

      // Act & Assert
      await expect(
        executeWithMemoryProtection('test-operation', mockOperation)
      ).rejects.toThrow('Operation failed');
    });
  });

  describe('getMemoryMetrics', () => {
    test('should return current metrics', () => {
      // Act
      const metrics = getMemoryMetrics();

      // Assert
      expect(metrics).toHaveProperty('pressureEvents');
      expect(metrics).toHaveProperty('circuitBreakerTrips');
      expect(metrics).toHaveProperty('throttledRequests');
      expect(metrics).toHaveProperty('emergencyEvictions');
      expect(metrics).toHaveProperty('gcTriggered');
      expect(metrics).toHaveProperty('circuitBreakerState');
      expect(metrics).toHaveProperty('currentPressure');
      expect(metrics.circuitBreakerState).toBe('CLOSED');
      expect(metrics.currentPressure).toBe('normal');
    });
  });

  describe('MemoryPressureError', () => {
    test('should create error with correct properties', () => {
      // Act
      const error = new MemoryPressureError('Test message', 'TEST_CODE');

      // Assert
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('MemoryPressureError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('exported helper functions', () => {
    test('should export working helper functions', () => {
      // Act & Assert
      expect(typeof executeWithMemoryProtection).toBe('function');
      expect(typeof shouldThrottleRequest).toBe('function');
      expect(typeof getMemoryStats).toBe('function');
      expect(typeof getMemoryMetrics).toBe('function');
    });

    test('should return memory stats through helper function', () => {
      // Act
      const stats = getMemoryStats();

      // Assert
      expect(stats).toHaveProperty('system');
      expect(stats).toHaveProperty('process');
      expect(stats).toHaveProperty('pressure');
    });

    test('should return throttle decisions through helper function', () => {
      // Act
      const result = shouldThrottleRequest({
        path: '/api/test',
        method: 'GET',
      });

      // Assert
      expect(result).toHaveProperty('shouldThrottle');
      expect(result.shouldThrottle).toBe(false);
    });
  });
});
