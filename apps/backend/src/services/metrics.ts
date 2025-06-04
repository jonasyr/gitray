import {
  register,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';
import { Request, Response, NextFunction } from 'express';

// Initialize default Prometheus metrics
collectDefaultMetrics({ register });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

export const gitOperations = new Counter({
  name: 'git_operations_total',
  help: 'Total number of git operations',
  labelNames: ['operation', 'status'] as const,
});

export const gitOperationDuration = new Histogram({
  name: 'git_operation_duration_seconds',
  help: 'Duration of git operations in seconds',
  labelNames: ['operation'] as const,
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
});

export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['operation'] as const,
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['operation'] as const,
});

export const tempDirectories = new Gauge({
  name: 'temp_directories_count',
  help: 'Number of temporary directories currently in use',
});

// Tracks how many directories are queued for cleanup operations
export const cleanupQueueSize = new Gauge({
  name: 'cleanup_queue_size',
  help: 'Number of directories waiting for cleanup',
});

// NEW: HybridLRUCache metrics
export const cacheHybridMemoryUsage = new Gauge({
  name: 'cache_hybrid_memory_usage_bytes',
  help: 'Memory usage of hybrid cache in bytes',
});

export const cacheHybridMemoryEntries = new Gauge({
  name: 'cache_hybrid_memory_entries',
  help: 'Number of entries in hybrid cache memory tier',
});

export const cacheHybridDiskEntries = new Gauge({
  name: 'cache_hybrid_disk_entries',
  help: 'Number of entries in hybrid cache disk tier',
});

export const cacheActiveBackend = new Gauge({
  name: 'cache_active_backend',
  help: 'Active cache backend (0=memory, 1=redis, 2=hybrid)',
  labelNames: ['backend'] as const,
});

// Cache metrics update function
export const updateCacheMetrics = async () => {
  try {
    // Dynamic import to avoid circular dependency
    const { getCacheStats } = await import('./cache');
    const stats = getCacheStats();

    // Backend tracking
    cacheActiveBackend.reset();
    const backendMap: Record<string, number> = {
      memory: 0,
      redis: 1,
      hybrid: 2,
    };
    cacheActiveBackend.set(
      { backend: stats.activeBackend },
      backendMap[stats.activeBackend] || 0
    );

    // Hybrid cache metrics
    if (stats.hybrid) {
      cacheHybridMemoryUsage.set(stats.hybrid.memory.usageBytes);
      cacheHybridMemoryEntries.set(stats.hybrid.memory.entries);
      cacheHybridDiskEntries.set(stats.hybrid.disk?.entries || 0);
    } else {
      // Reset hybrid cache metrics when not using hybrid cache
      cacheHybridMemoryUsage.set(0);
      cacheHybridMemoryEntries.set(0);
      cacheHybridDiskEntries.set(0);
    }
  } catch (err) {
    // Use a logger import that doesn't cause circular dependency
    console.warn('Failed to update cache metrics', { err });
  }
};

// Express middleware that records metrics about each HTTP request
export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });
    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode,
      },
      duration
    );
  });
  next();
};

// Endpoint that exposes all collected metrics in Prometheus format
export const metricsHandler = async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};
