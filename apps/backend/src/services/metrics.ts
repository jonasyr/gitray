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

// EXISTING METRICS (from the current codebase)
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

export const cleanupQueueSize = new Gauge({
  name: 'cleanup_queue_size',
  help: 'Number of directories waiting for cleanup',
});

// HybridLRUCache metrics (existing)
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

// ========================================================================
// NEW: STREAMING METRICS FOR SUBISSUE 4
// ========================================================================

/**
 * Tracks streaming operations and their performance characteristics
 */
export const streamingOperations = new Counter({
  name: 'git_streaming_operations_total',
  help: 'Total number of git streaming operations',
  labelNames: ['repository_size', 'status'] as const, // repository_size: small|medium|large|huge
});

/**
 * Duration of complete streaming operations
 */
export const streamingOperationDuration = new Histogram({
  name: 'git_streaming_operation_duration_seconds',
  help: 'Duration of complete git streaming operations',
  labelNames: ['repository_size'] as const,
  buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1200], // Up to 20 minutes for very large repos
});

/**
 * Duration of individual streaming batches
 */
export const streamingBatchDuration = new Histogram({
  name: 'git_streaming_batch_duration_seconds',
  help: 'Duration of individual streaming batch operations',
  labelNames: ['batch_size_range'] as const, // small|medium|large
  buckets: [0.1, 0.5, 1, 2, 5, 10, 15, 30], // Batch operations should be much faster
});

/**
 * Number of commits processed through streaming
 */
export const streamingCommitsProcessed = new Counter({
  name: 'git_streaming_commits_processed_total',
  help: 'Total number of commits processed through streaming',
  labelNames: ['repository_size'] as const,
});

/**
 * Number of streaming batches processed
 */
export const streamingBatchesProcessed = new Counter({
  name: 'git_streaming_batches_processed_total',
  help: 'Total number of streaming batches processed',
  labelNames: ['repository_size', 'cache_status'] as const, // cache_status: hit|miss
});

/**
 * Memory usage during streaming operations
 */
export const streamingMemoryUsage = new Histogram({
  name: 'git_streaming_memory_usage_bytes',
  help: 'Memory usage during streaming operations',
  labelNames: ['operation_phase'] as const, // start|batch|peak|end
  buckets: [
    50 * 1024 * 1024, // 50MB
    100 * 1024 * 1024, // 100MB
    250 * 1024 * 1024, // 250MB
    500 * 1024 * 1024, // 500MB
    1 * 1024 * 1024 * 1024, // 1GB
    2 * 1024 * 1024 * 1024, // 2GB
  ],
});

/**
 * Cache hit rate for streaming operations
 */
export const streamingCacheHitRate = new Histogram({
  name: 'git_streaming_cache_hit_rate',
  help: 'Cache hit rate for streaming batch operations (0.0-1.0)',
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
});

/**
 * Number of active streaming operations
 */
export const activeStreamingOperations = new Gauge({
  name: 'git_streaming_operations_active',
  help: 'Number of currently active streaming operations',
});

/**
 * Streaming throughput (commits per second)
 */
export const streamingThroughput = new Histogram({
  name: 'git_streaming_throughput_commits_per_second',
  help: 'Throughput of streaming operations in commits per second',
  labelNames: ['repository_size'] as const,
  buckets: [10, 50, 100, 500, 1000, 2000, 5000, 10000],
});

/**
 * Repository size distribution for streaming decision making
 */
export const repositorySizeDistribution = new Histogram({
  name: 'git_repository_size_commits',
  help: 'Distribution of repository sizes in number of commits',
  buckets: [
    100, 500, 1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000,
  ],
});

/**
 * Streaming error types and frequency
 */
export const streamingErrors = new Counter({
  name: 'git_streaming_errors_total',
  help: 'Total number of streaming errors by type',
  labelNames: ['error_type', 'recovery_possible'] as const,
});

// ========================================================================
// HELPER FUNCTIONS FOR STREAMING METRICS
// ========================================================================

/**
 * Helper to categorize repository size for metrics
 */
export function getRepositorySizeCategory(
  commitCount: number
): 'small' | 'medium' | 'large' | 'huge' {
  if (commitCount < 1000) return 'small';
  if (commitCount < 10000) return 'medium';
  if (commitCount < 100000) return 'large';
  return 'huge';
}

/**
 * Helper to categorize batch size for metrics
 */
export function getBatchSizeCategory(batchSize: number): string {
  if (batchSize < 500) return 'small';
  if (batchSize < 2000) return 'medium';
  return 'large';
}

/**
 * Record streaming operation start
 */
export function recordStreamingStart(commitCount: number): void {
  const sizeCategory = getRepositorySizeCategory(commitCount);
  activeStreamingOperations.inc();
  repositorySizeDistribution.observe(commitCount);
  streamingOperations.inc({ repository_size: sizeCategory, status: 'started' });
}

/**
 * Record streaming operation completion
 */
export function recordStreamingCompletion(
  commitCount: number,
  duration: number,
  processedCommits: number,
  batchCount: number,
  cacheHitRate: number,
  peakMemoryMB: number
): void {
  const sizeCategory = getRepositorySizeCategory(commitCount);

  activeStreamingOperations.dec();
  streamingOperations.inc({
    repository_size: sizeCategory,
    status: 'completed',
  });
  streamingOperationDuration.observe(
    { repository_size: sizeCategory },
    duration / 1000
  );
  streamingCommitsProcessed.inc(
    { repository_size: sizeCategory },
    processedCommits
  );
  streamingCacheHitRate.observe(cacheHitRate);

  // Calculate and record throughput
  const throughput = processedCommits / (duration / 1000);
  streamingThroughput.observe({ repository_size: sizeCategory }, throughput);

  // Record peak memory usage
  streamingMemoryUsage.observe(
    { operation_phase: 'peak' },
    peakMemoryMB * 1024 * 1024
  );
}

/**
 * Record streaming batch metrics
 */
export function recordStreamingBatch(
  batchSize: number,
  duration: number,
  cacheHit: boolean,
  repositorySize: number
): void {
  const batchCategory = getBatchSizeCategory(batchSize);
  const sizeCategory = getRepositorySizeCategory(repositorySize);

  streamingBatchDuration.observe(
    { batch_size_range: batchCategory },
    duration / 1000
  );
  streamingBatchesProcessed.inc({
    repository_size: sizeCategory,
    cache_status: cacheHit ? 'hit' : 'miss',
  });
}

/**
 * Record streaming error
 */
export function recordStreamingError(
  errorType: string,
  recoverable: boolean,
  commitCount: number
): void {
  const sizeCategory = getRepositorySizeCategory(commitCount);
  activeStreamingOperations.dec(); // Operation is no longer active due to error
  streamingOperations.inc({ repository_size: sizeCategory, status: 'failed' });
  streamingErrors.inc({
    error_type: errorType,
    recovery_possible: recoverable ? 'yes' : 'no',
  });
}

// ========================================================================
// EXISTING FUNCTIONS (unchanged)
// ========================================================================

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
