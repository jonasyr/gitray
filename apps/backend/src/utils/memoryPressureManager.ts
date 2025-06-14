// apps/backend/src/utils/memoryPressureManager.ts
import os from 'os';
import { getLogger } from '../services/logger';

const logger = getLogger();

/**
 * CRITICAL MEMORY PRESSURE HANDLING IMPLEMENTATION
 *
 * This completes the "safety triangle":
 * 1. ✅ Thread Safety (locks, atomic operations)
 * 2. ✅ Data Consistency (transactions, rollback)
 * 3. 🎯 Resource Safety (memory pressure) ← THIS MODULE
 */

export interface MemoryPressureStats {
  system: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usagePercentage: number;
  };
  process: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  pressure: {
    level: 'normal' | 'warning' | 'critical' | 'emergency';
    systemThreshold: number;
    processThreshold: number;
    action: string;
  };
}

export interface MemoryPressureConfig {
  // System memory thresholds
  warningThreshold: number; // 0.75 = 75%
  criticalThreshold: number; // 0.85 = 85%
  emergencyThreshold: number; // 0.95 = 95%

  // Process memory thresholds (relative to system)
  processWarningThreshold: number; // 0.50 = 50% of system memory
  processCriticalThreshold: number; // 0.70 = 70% of system memory

  // Response configuration
  enableCircuitBreaker: boolean;
  enableRequestThrottling: boolean;
  enableEmergencyEviction: boolean;

  // Monitoring configuration
  checkIntervalMs: number; // How often to check memory
  alertCooldownMs: number; // Prevent alert spam
}

class MemoryPressureManager {
  private config: MemoryPressureConfig;
  private circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private lastAlertTime = 0;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private pressureHistory: MemoryPressureStats[] = [];
  private emergencyEvictionCount = 0;

  // Metrics for monitoring
  private metrics = {
    pressureEvents: 0,
    circuitBreakerTrips: 0,
    throttledRequests: 0,
    emergencyEvictions: 0,
    gcTriggered: 0,
  };

  constructor(config?: Partial<MemoryPressureConfig>) {
    this.config = {
      // Default thresholds based on production experience
      warningThreshold: 0.75, // 75% system memory
      criticalThreshold: 0.85, // 85% system memory
      emergencyThreshold: 0.95, // 95% system memory
      processWarningThreshold: 0.5, // 50% of system memory
      processCriticalThreshold: 0.7, // 70% of system memory
      enableCircuitBreaker: true,
      enableRequestThrottling: true,
      enableEmergencyEviction: true,
      checkIntervalMs: 5000, // Check every 5 seconds
      alertCooldownMs: 60000, // Alert at most once per minute
      ...config,
    };

    this.startMonitoring();

    logger.info('MemoryPressureManager initialized', {
      config: this.config,
      systemMemoryGB: Math.round(os.totalmem() / 1024 ** 3),
    });
  }

  /**
   * Get current memory pressure statistics
   */
  getMemoryStats(): MemoryPressureStats {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const systemUsagePercentage = usedMemory / totalMemory;

    const processMemory = process.memoryUsage();
    const processUsagePercentage = processMemory.rss / totalMemory;

    // Determine pressure level
    let pressureLevel: 'normal' | 'warning' | 'critical' | 'emergency' =
      'normal';
    let action = 'none';

    if (systemUsagePercentage >= this.config.emergencyThreshold) {
      pressureLevel = 'emergency';
      action = 'emergency_eviction + throttling + circuit_breaker';
    } else if (
      systemUsagePercentage >= this.config.criticalThreshold ||
      processUsagePercentage >= this.config.processCriticalThreshold
    ) {
      pressureLevel = 'critical';
      action = 'throttling + circuit_breaker + gc';
    } else if (
      systemUsagePercentage >= this.config.warningThreshold ||
      processUsagePercentage >= this.config.processWarningThreshold
    ) {
      pressureLevel = 'warning';
      action = 'monitoring + gc';
    }

    return {
      system: {
        totalBytes: totalMemory,
        freeBytes: freeMemory,
        usedBytes: usedMemory,
        usagePercentage: systemUsagePercentage,
      },
      process: processMemory,
      pressure: {
        level: pressureLevel,
        systemThreshold: systemUsagePercentage,
        processThreshold: processUsagePercentage,
        action,
      },
    };
  }

  /**
   * CRITICAL: Circuit breaker for memory-intensive operations
   */
  async executeWithMemoryProtection<T>(
    operationName: string,
    operation: () => Promise<T>,
    options?: {
      skipCircuitBreaker?: boolean;
      estimatedMemoryMB?: number;
      priority?: 'low' | 'normal' | 'high';
    }
  ): Promise<T> {
    const stats = this.getMemoryStats();
    const skipBreaker = options?.skipCircuitBreaker || false;
    const priority = options?.priority || 'normal';

    // Circuit breaker logic
    if (!skipBreaker && this.config.enableCircuitBreaker) {
      if (this.circuitBreakerState === 'OPEN') {
        this.metrics.circuitBreakerTrips++;
        throw new MemoryPressureError(
          `Circuit breaker OPEN: Memory pressure too high (${Math.round(stats.system.usagePercentage * 100)}%)`,
          'CIRCUIT_BREAKER_OPEN'
        );
      }

      // Check if we should open the circuit breaker
      if (
        stats.pressure.level === 'emergency' ||
        (stats.pressure.level === 'critical' && priority === 'low')
      ) {
        this.openCircuitBreaker();
        this.metrics.circuitBreakerTrips++;
        throw new MemoryPressureError(
          `Circuit breaker activated: ${stats.pressure.level} memory pressure`,
          'MEMORY_PRESSURE_CRITICAL'
        );
      }
    }

    // Monitor memory during operation
    const startMemory = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    try {
      const result = await operation();

      // Check memory after operation
      const endMemory = process.memoryUsage().heapUsed;
      const memoryDelta = endMemory - startMemory;
      const duration = Date.now() - startTime;

      logger.debug('Memory-protected operation completed', {
        operationName,
        memoryDeltaMB: Math.round(memoryDelta / 1024 / 1024),
        duration,
        pressureLevel: stats.pressure.level,
      });

      // If half-open, consider closing the circuit breaker on success
      if (this.circuitBreakerState === 'HALF_OPEN') {
        this.closeCircuitBreaker();
      }

      return result;
    } catch (error) {
      // Check if error was due to memory pressure
      const currentStats = this.getMemoryStats();
      if (currentStats.pressure.level === 'emergency') {
        this.openCircuitBreaker();
      }

      throw error;
    }
  }

  /**
   * CRITICAL: Check if request should be throttled due to memory pressure
   */
  shouldThrottleRequest(requestInfo: {
    path: string;
    method: string;
    priority?: 'low' | 'normal' | 'high';
    userAgent?: string;
  }): { shouldThrottle: boolean; reason?: string; retryAfter?: number } {
    if (!this.config.enableRequestThrottling) {
      return { shouldThrottle: false };
    }

    const stats = this.getMemoryStats();
    const priority = requestInfo.priority || 'normal';

    // Emergency: Block all low priority requests
    if (stats.pressure.level === 'emergency') {
      if (priority === 'low') {
        this.metrics.throttledRequests++;
        return {
          shouldThrottle: true,
          reason:
            'Emergency memory pressure - only high priority requests allowed',
          retryAfter: 60,
        };
      }
    }

    // Critical: Block non-essential operations
    if (stats.pressure.level === 'critical') {
      const isExpensiveOperation =
        requestInfo.path.includes('/commits') &&
        requestInfo.method === 'GET' &&
        !requestInfo.path.includes('/cache/');

      if (isExpensiveOperation && priority !== 'high') {
        this.metrics.throttledRequests++;
        return {
          shouldThrottle: true,
          reason: 'Critical memory pressure - expensive operations throttled',
          retryAfter: 30,
        };
      }
    }

    return { shouldThrottle: false };
  }

  /**
   * CRITICAL: Trigger emergency memory cleanup
   */
  async performEmergencyMemoryCleanup(): Promise<void> {
    const stats = this.getMemoryStats();

    logger.warn('Performing emergency memory cleanup', {
      systemMemoryUsage: `${Math.round(stats.system.usagePercentage * 100)}%`,
      processMemoryMB: Math.round(stats.process.rss / 1024 / 1024),
      emergencyCount: ++this.emergencyEvictionCount,
    });

    try {
      // 1. Force garbage collection if available
      if (global.gc && typeof global.gc === 'function') {
        global.gc();
        this.metrics.gcTriggered++;
        logger.debug('Forced garbage collection triggered');
      }

      // 2. Emergency cache eviction
      if (this.config.enableEmergencyEviction) {
        await this.triggerEmergencyCacheEviction();
      }

      // 3. Clear large data structures (if accessible)
      this.clearInternalBuffers();

      // 4. Log memory state after cleanup
      const afterStats = this.getMemoryStats();
      logger.info('Emergency cleanup completed', {
        beforeMemoryMB: Math.round(stats.process.rss / 1024 / 1024),
        afterMemoryMB: Math.round(afterStats.process.rss / 1024 / 1024),
        freedMB: Math.round(
          (stats.process.rss - afterStats.process.rss) / 1024 / 1024
        ),
      });

      this.metrics.emergencyEvictions++;
    } catch (error) {
      logger.error('Emergency memory cleanup failed', { error });
    }
  }

  /**
   * Get current metrics for monitoring
   */
  getMetrics() {
    return {
      ...this.metrics,
      circuitBreakerState: this.circuitBreakerState,
      currentPressure: this.getMemoryStats().pressure.level,
      emergencyEvictionCount: this.emergencyEvictionCount,
    };
  }

  /**
   * Start continuous memory monitoring
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) return;

    this.monitoringInterval = setInterval(() => {
      this.checkMemoryPressure();
    }, this.config.checkIntervalMs);

    logger.info('Memory pressure monitoring started', {
      checkInterval: this.config.checkIntervalMs,
    });
  }

  /**
   * Continuous memory pressure checking
   */
  private checkMemoryPressure(): void {
    const stats = this.getMemoryStats();

    // Store history for trend analysis
    this.pressureHistory.push(stats);
    if (this.pressureHistory.length > 20) {
      this.pressureHistory.shift(); // Keep last 20 readings
    }

    // Handle pressure levels
    if (stats.pressure.level === 'emergency') {
      this.handleEmergencyPressure(stats);
    } else if (stats.pressure.level === 'critical') {
      this.handleCriticalPressure(stats);
    } else if (stats.pressure.level === 'warning') {
      this.handleWarningPressure(stats);
    } else {
      // Normal pressure - try to recover
      this.handleNormalPressure();
    }
  }

  private handleEmergencyPressure(stats: MemoryPressureStats): void {
    this.alertIfCooldownExpired('EMERGENCY', stats);
    this.openCircuitBreaker();

    // Immediate emergency actions
    setImmediate(() => {
      void this.performEmergencyMemoryCleanup();
    });
  }

  private handleCriticalPressure(stats: MemoryPressureStats): void {
    this.alertIfCooldownExpired('CRITICAL', stats);

    // Trigger GC more frequently
    if (global.gc && typeof global.gc === 'function') {
      global.gc();
      this.metrics.gcTriggered++;
    }
  }

  private handleWarningPressure(stats: MemoryPressureStats): void {
    this.alertIfCooldownExpired('WARNING', stats);

    // Proactive GC
    if (global.gc && typeof global.gc === 'function') {
      // Only trigger GC occasionally during warning state
      if (Math.random() < 0.1) {
        // 10% chance per check
        global.gc();
        this.metrics.gcTriggered++;
      }
    }
  }

  private handleNormalPressure(): void {
    // Try to close circuit breaker if it's half-open
    if (this.circuitBreakerState === 'HALF_OPEN') {
      this.closeCircuitBreaker();
    }
  }

  private openCircuitBreaker(): void {
    if (this.circuitBreakerState !== 'OPEN') {
      this.circuitBreakerState = 'OPEN';
      logger.warn('Memory pressure circuit breaker OPENED');

      // Auto-transition to half-open after a delay
      setTimeout(() => {
        if (this.circuitBreakerState === 'OPEN') {
          this.circuitBreakerState = 'HALF_OPEN';
          logger.info(
            'Memory pressure circuit breaker transitioned to HALF_OPEN'
          );
        }
      }, 30000); // 30 seconds
    }
  }

  private closeCircuitBreaker(): void {
    if (this.circuitBreakerState !== 'CLOSED') {
      this.circuitBreakerState = 'CLOSED';
      logger.info('Memory pressure circuit breaker CLOSED');
    }
  }

  private alertIfCooldownExpired(
    level: string,
    stats: MemoryPressureStats
  ): void {
    const now = Date.now();
    if (now - this.lastAlertTime > this.config.alertCooldownMs) {
      logger.warn(`Memory pressure: ${level}`, {
        systemUsage: `${Math.round(stats.system.usagePercentage * 100)}%`,
        processUsage: `${Math.round(stats.process.rss / 1024 / 1024)}MB`,
        freeMemory: `${Math.round(stats.system.freeBytes / 1024 / 1024)}MB`,
        action: stats.pressure.action,
        metrics: this.metrics,
      });

      this.lastAlertTime = now;
      this.metrics.pressureEvents++;
    }
  }

  private async triggerEmergencyCacheEviction(): Promise<void> {
    try {
      // Import cache service dynamically to avoid circular dependencies
      const { default: cache } = await import('../services/cache');
      const cacheStats = cache.getStats();

      logger.info('Triggering emergency cache eviction', {
        beforeState: cacheStats,
      });

      // This would need to be implemented in the cache service
      // For now, we log the intent
      logger.warn(
        'Emergency cache eviction requested - implement cache.emergencyEvict()'
      );
    } catch (error) {
      logger.error('Failed to trigger emergency cache eviction', { error });
    }
  }

  private clearInternalBuffers(): void {
    // Clear internal history to free memory
    if (this.pressureHistory.length > 5) {
      this.pressureHistory.splice(0, this.pressureHistory.length - 5);
    }
  }

  async shutdown(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info('MemoryPressureManager shutdown completed', {
      finalMetrics: this.metrics,
    });
  }
}

/**
 * Custom error class for memory pressure issues
 */
export class MemoryPressureError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'MemoryPressureError';
  }
}

// Singleton instance
export const memoryPressureManager = new MemoryPressureManager({
  // Production-ready defaults
  warningThreshold: Number(process.env.MEMORY_WARNING_THRESHOLD) || 0.75,
  criticalThreshold: Number(process.env.MEMORY_CRITICAL_THRESHOLD) || 0.85,
  emergencyThreshold: Number(process.env.MEMORY_EMERGENCY_THRESHOLD) || 0.95,
  enableCircuitBreaker: process.env.MEMORY_CIRCUIT_BREAKER !== 'false',
  enableRequestThrottling: process.env.MEMORY_REQUEST_THROTTLING !== 'false',
  enableEmergencyEviction: process.env.MEMORY_EMERGENCY_EVICTION !== 'false',
});

// Export helper functions
export const executeWithMemoryProtection =
  memoryPressureManager.executeWithMemoryProtection.bind(memoryPressureManager);
export const shouldThrottleRequest =
  memoryPressureManager.shouldThrottleRequest.bind(memoryPressureManager);
export const getMemoryStats = memoryPressureManager.getMemoryStats.bind(
  memoryPressureManager
);
export const getMemoryMetrics = memoryPressureManager.getMetrics.bind(
  memoryPressureManager
);

export default memoryPressureManager;
