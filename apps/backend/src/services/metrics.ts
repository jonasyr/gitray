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
