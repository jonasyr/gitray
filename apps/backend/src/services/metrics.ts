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

// ========================================================================
// METRICS ENHANCEMENT: Utility Functions
// ========================================================================

/**
 * Helper to categorize user types from request headers
 */
export function getUserType(req: Request): 'api' | 'ui' | 'admin' | 'unknown' {
  if (!req?.headers) return 'unknown';

  const userAgent = req.headers['user-agent']?.toLowerCase() ?? '';
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;

  if (apiKey || authHeader?.includes('Bearer')) return 'api';
  if (userAgent.includes('admin') || req.path?.includes('/admin'))
    return 'admin';
  if (userAgent.includes('browser') || userAgent.includes('mozilla'))
    return 'ui';
  return 'unknown';
}

/**
 * Helper to determine repository type
 */
export function getRepositoryType(
  repoUrl: string
): 'public' | 'private' | 'unknown' {
  if (repoUrl.includes('github.com') || repoUrl.includes('gitlab.com'))
    return 'public';
  if (repoUrl.includes('localhost') || repoUrl.includes('127.0.0.1'))
    return 'private';
  return 'unknown';
}

/**
 * Helper to categorize team size based on commit patterns
 */
export function getTeamSizeCategory(
  commitCount: number,
  days: number = 30
): 'small' | 'medium' | 'large' {
  const commitsPerDay = commitCount / days;
  if (commitsPerDay < 2) return 'small';
  if (commitsPerDay < 10) return 'medium';
  return 'large';
}

/**
 * Helper to determine cache tier
 */
export function getCacheTier(): 'memory' | 'disk' | 'redis' | 'hybrid' {
  // This would be enhanced based on actual cache implementation details
  return 'hybrid'; // Default for now
}

// ========================================================================
// ENHANCED EXISTING METRICS (maintaining compatibility)
// ========================================================================

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: [
    'method',
    'route',
    'status_code',
    'user_type',
    'cache_status',
  ] as const,
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: [
    'method',
    'route',
    'status_code',
    'user_type',
    'sla_tier',
  ] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60], // Enhanced granularity
});

export const gitOperations = new Counter({
  name: 'git_operations_total',
  help: 'Total number of git operations',
  labelNames: ['operation', 'status', 'repo_type', 'repo_size'] as const,
});

export const gitOperationDuration = new Histogram({
  name: 'git_operation_duration_seconds',
  help: 'Duration of git operations in seconds',
  labelNames: ['operation', 'repo_type', 'repo_size'] as const,
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300], // Extended range
});

// Enhanced cache metrics with granular labeling
export const cacheHitsEnhanced = new Counter({
  name: 'cache_hits_enhanced_total',
  help: 'Enhanced cache hits with detailed context',
  labelNames: [
    'operation',
    'tier', // memory, disk, redis, hybrid
    'repo_type', // public, private
    'user_type', // api, ui, admin
    'repo_size', // small, medium, large, huge
  ] as const,
});

export const cacheMissesEnhanced = new Counter({
  name: 'cache_misses_enhanced_total',
  help: 'Enhanced cache misses with detailed context',
  labelNames: [
    'operation',
    'tier',
    'repo_type',
    'user_type',
    'repo_size',
  ] as const,
});

// Backward compatibility - keep existing simple metrics
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

// Distributed cache invalidation metrics (minimal essential set)
export const distributedCacheInvalidations = new Counter({
  name: 'distributed_cache_invalidations_total',
  help: 'Cross-process cache invalidation operations',
  labelNames: ['source', 'status'] as const, // 'local'/'remote', 'success'/'failed'
});

export const distributedCacheInvalidationLatency = new Histogram({
  name: 'distributed_cache_invalidation_duration_seconds',
  help: 'Time taken for cross-process cache invalidation',
  buckets: [0.001, 0.01, 0.1, 0.5, 1.0, 5.0],
});

export const tempDirectories = new Gauge({
  name: 'temp_directories_count',
  help: 'Number of temporary directories currently in use',
});

export const cleanupQueueSize = new Gauge({
  name: 'cleanup_queue_size',
  help: 'Number of directories waiting for cleanup',
});

// ========================================================================
// NEW: BUSINESS & USER EXPERIENCE METRICS
// ========================================================================

/**
 * User behavior tracking
 */
export const userSessions = new Counter({
  name: 'gitray_user_sessions_total',
  help: 'Total user sessions by type and characteristics',
  labelNames: [
    'session_type',
    'duration_bucket',
    'feature_usage',
    'user_type',
  ] as const,
});

/**
 * Feature adoption and usage
 */
export const featureUsage = new Counter({
  name: 'gitray_feature_usage_total',
  help: 'Usage of specific features by user type and success rate',
  labelNames: ['feature', 'user_type', 'success', 'interaction_type'] as const,
});

/**
 * Data freshness tracking
 */
export const dataFreshness = new Histogram({
  name: 'gitray_data_age_seconds',
  help: 'Age of data when served to users',
  labelNames: ['data_type', 'cache_tier', 'repo_size'] as const,
  buckets: [1, 10, 60, 300, 1800, 3600, 86400, 604800], // 1s to 1week
});

/**
 * User experience - page load times
 */
export const pageLoadTime = new Histogram({
  name: 'gitray_page_load_duration_seconds',
  help: 'Time for pages to load completely',
  labelNames: ['page_type', 'user_type', 'repo_size', 'cache_status'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 20, 30],
});

/**
 * API response quality
 */
export const apiResponseQuality = new Histogram({
  name: 'gitray_api_response_quality_score',
  help: 'Quality score of API responses (0-100)',
  labelNames: ['endpoint', 'data_completeness', 'freshness_tier'] as const,
  buckets: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
});

// ========================================================================
// NEW: DETAILED ERROR CATEGORIZATION & DEBUGGING
// ========================================================================

/**
 * Enhanced error tracking with detailed categorization
 */
export const detailedErrors = new Counter({
  name: 'gitray_errors_detailed_total',
  help: 'Detailed error tracking with comprehensive context',
  labelNames: [
    'component', // cache, git, coordinator, api, frontend
    'error_category', // network, filesystem, memory, validation, auth
    'error_severity', // critical, warning, info
    'user_impact', // blocking, degraded, none
    'recovery_action', // retry, fallback, manual
    'repo_type', // public, private
    'tenant_id', // For multi-tenant scenarios
  ] as const,
});

/**
 * Error correlation tracking
 */
export const errorCorrelation = new Counter({
  name: 'gitray_error_correlation_total',
  help: 'Errors that occur together within time windows',
  labelNames: [
    'primary_error',
    'secondary_error',
    'time_window',
    'correlation_strength',
  ] as const,
});

/**
 * System error recovery effectiveness
 */
export const errorRecovery = new Histogram({
  name: 'gitray_error_recovery_duration_seconds',
  help: 'Time taken to recover from different error types',
  labelNames: ['error_type', 'recovery_method', 'success'] as const,
  buckets: [0.1, 1, 5, 15, 30, 60, 300, 600], // 0.1s to 10min
});

// ========================================================================
// NEW: PERFORMANCE PERCENTILES & SLA TRACKING
// ========================================================================

/**
 * Enhanced response time tracking with finer granularity
 */
export const responseTimeDetailed = new Histogram({
  name: 'gitray_response_time_detailed_seconds',
  help: 'Detailed response time distribution for SLA tracking',
  labelNames: [
    'operation',
    'cache_status',
    'repo_size',
    'complexity',
    'user_type',
  ] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
});

/**
 * SLA compliance tracking
 */
export const slaCompliance = new Gauge({
  name: 'gitray_sla_compliance_ratio',
  help: 'Percentage of requests meeting SLA targets by tier and operation',
  labelNames: [
    'sla_tier',
    'time_window',
    'operation_type',
    'user_segment',
  ] as const,
});

/**
 * Performance degradation detection
 */
export const performanceDegradation = new Gauge({
  name: 'gitray_performance_degradation_ratio',
  help: 'Performance degradation compared to baseline',
  labelNames: [
    'metric',
    'comparison_window',
    'degradation_level',
    'component',
  ] as const,
});

// ========================================================================
// NEW: RESOURCE UTILIZATION & CAPACITY PLANNING
// ========================================================================

/**
 * Memory utilization breakdown by component
 */
export const memoryUtilization = new Gauge({
  name: 'gitray_memory_utilization_bytes',
  help: 'Memory usage by component and allocation type',
  labelNames: ['component', 'allocation_type', 'process_id'] as const,
});

/**
 * Disk I/O patterns and performance
 */
export const diskOperations = new Counter({
  name: 'gitray_disk_operations_total',
  help: 'Disk operations by type, device, and performance characteristics',
  labelNames: ['operation', 'device', 'latency_bucket', 'io_pattern'] as const,
});

/**
 * Connection pool metrics
 */
export const connectionPools = new Gauge({
  name: 'gitray_connection_pool_status',
  help: 'Connection pool utilization and health',
  labelNames: ['pool_type', 'status', 'endpoint'] as const,
});

/**
 * CPU utilization patterns
 */
export const cpuUtilization = new Gauge({
  name: 'gitray_cpu_utilization_percentage',
  help: 'CPU utilization by process and operation type',
  labelNames: ['process_type', 'operation_category', 'core_id'] as const,
});

/**
 * Network bandwidth utilization
 */
export const networkBandwidth = new Histogram({
  name: 'gitray_network_bandwidth_bytes_per_second',
  help: 'Network bandwidth utilization patterns',
  labelNames: ['direction', 'protocol', 'endpoint', 'data_type'] as const,
  buckets: [1024, 10240, 102400, 1048576, 10485760, 104857600], // 1KB to 100MB/s
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
// NEW: ADVANCED CACHE INTELLIGENCE & OPTIMIZATION
// ========================================================================

/**
 * Cache access pattern analysis
 */
export const cacheAccessPatterns = new Histogram({
  name: 'gitray_cache_access_patterns',
  help: 'Cache access pattern analysis for optimization',
  labelNames: [
    'pattern_type',
    'time_of_day',
    'user_behavior',
    'data_type',
  ] as const,
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000], // Access frequency
});

/**
 * Cache warming effectiveness
 */
export const cacheWarming = new Counter({
  name: 'gitray_cache_warming_effectiveness_total',
  help: 'Effectiveness of cache warming strategies',
  labelNames: [
    'strategy',
    'hit_within_window',
    'repo_category',
    'data_size',
  ] as const,
});

/**
 * Cache eviction impact analysis
 */
export const evictionImpact = new Histogram({
  name: 'gitray_cache_eviction_impact_seconds',
  help: 'Time until evicted data is requested again',
  labelNames: ['cache_tier', 'data_type', 'eviction_reason'] as const,
  buckets: [60, 300, 1800, 3600, 86400, 604800, 2592000], // 1min to 30days
});

/**
 * Cache efficiency by repository characteristics
 */
export const cacheEfficiencyByRepo = new Histogram({
  name: 'gitray_cache_efficiency_by_repository',
  help: 'Cache efficiency patterns by repository characteristics',
  labelNames: ['repo_size', 'language', 'activity_level', 'team_size'] as const,
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
});

/**
 * Cache prediction accuracy
 */
export const cachePredictionAccuracy = new Histogram({
  name: 'gitray_cache_prediction_accuracy_ratio',
  help: 'Accuracy of cache prediction algorithms',
  labelNames: ['prediction_type', 'time_horizon', 'data_category'] as const,
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
});

// ========================================================================
// NEW: TRANSACTION & ROLLBACK METRICS
// ========================================================================

/**
 * Cache transaction operations
 */
export const cacheTransactions = new Counter({
  name: 'gitray_cache_transactions_total',
  help: 'Total number of cache transactions by outcome',
  labelNames: ['outcome', 'cache_tier', 'operation_count'] as const,
});

/**
 * Transaction rollback operations
 */
export const transactionRollbacks = new Counter({
  name: 'gitray_transaction_rollbacks_total',
  help: 'Total number of transaction rollback operations',
  labelNames: [
    'rollback_outcome',
    'cache_tier',
    'operation_type',
    'retry_count',
  ] as const,
});

/**
 * Transaction rollback duration
 */
export const rollbackDuration = new Histogram({
  name: 'gitray_transaction_rollback_duration_seconds',
  help: 'Duration of transaction rollback operations',
  labelNames: ['cache_tier', 'operation_count', 'retry_attempts'] as const,
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10, 30], // 1ms to 30s
});

/**
 * Rollback verification success rate
 */
export const rollbackVerification = new Counter({
  name: 'gitray_rollback_verification_total',
  help: 'Success rate of rollback verification operations',
  labelNames: ['cache_tier', 'verification_result', 'attempt_number'] as const,
});

/**
 * Critical rollback failures requiring manual intervention
 */
export const criticalRollbackFailures = new Counter({
  name: 'gitray_critical_rollback_failures_total',
  help: 'Number of rollback failures requiring manual intervention',
  labelNames: [
    'transaction_type',
    'failed_operations_count',
    'severity',
  ] as const,
});

// ========================================================================
// NEW: COORDINATION & CONCURRENCY METRICS
// ========================================================================

/**
 * Request coalescing effectiveness
 */
export const coalescingEffectiveness = new Histogram({
  name: 'gitray_request_coalescing_savings',
  help: 'Time and resources saved through request coalescing',
  labelNames: [
    'operation_type',
    'repo_size',
    'concurrent_requests',
    'savings_type',
  ] as const,
  buckets: [1, 5, 10, 25, 50, 100, 250, 500], // Number of coalesced requests or time saved
});

/**
 * Lock contention detailed analysis
 */
export const lockContentionDetailed = new Histogram({
  name: 'gitray_lock_contention_analysis',
  help: 'Detailed lock contention patterns and resolution',
  labelNames: [
    'lock_type',
    'resource',
    'contention_level',
    'wait_reason',
  ] as const,
  buckets: [0.001, 0.01, 0.1, 1, 10, 60, 300], // Wait time in seconds
});

/**
 * Coordination system health
 */
export const coordinationHealth = new Gauge({
  name: 'gitray_coordination_health_score',
  help: 'Overall health score of coordination system (0-100)',
  labelNames: ['component', 'metric_type'] as const,
});

/**
 * Operation queue metrics
 */
export const operationQueueMetrics = new Gauge({
  name: 'gitray_operation_queue_status',
  help: 'Status and performance of operation queues',
  labelNames: ['queue_type', 'repo_url_hash', 'metric_name'] as const,
});

// ========================================================================
// NEW: ALERTING-READY METRICS
// ========================================================================

/**
 * Service health score for alerting
 */
export const serviceHealthScore = new Gauge({
  name: 'gitray_service_health_score',
  help: 'Overall service health score (0-100) for alerting',
  labelNames: ['component', 'time_window', 'criticality'] as const,
});

/**
 * Capacity utilization warnings
 */
export const capacityWarnings = new Gauge({
  name: 'gitray_capacity_utilization_percentage',
  help: 'Resource utilization approaching limits',
  labelNames: [
    'resource_type',
    'threshold_level',
    'component',
    'trend',
  ] as const,
});

/**
 * Anomaly detection metrics
 */
export const anomalyDetection = new Counter({
  name: 'gitray_anomalies_detected_total',
  help: 'Anomalies detected in system behavior',
  labelNames: [
    'anomaly_type',
    'severity',
    'component',
    'detection_method',
  ] as const,
});

/**
 * System reliability indicators
 */
export const reliabilityIndicators = new Gauge({
  name: 'gitray_reliability_indicators',
  help: 'Key reliability indicators for SRE monitoring',
  labelNames: ['indicator_type', 'service', 'measurement_window'] as const,
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

// ========================================================================
// CRITICAL: MEMORY PRESSURE METRICS
// ========================================================================

/**
 * Current memory pressure level
 */
export const memoryPressureLevel = new Gauge({
  name: 'gitray_memory_pressure_level',
  help: 'Current memory pressure level (0=normal, 1=warning, 2=critical, 3=emergency)',
});

/**
 * System memory usage percentage
 */
export const systemMemoryUsage = new Gauge({
  name: 'gitray_system_memory_usage_percent',
  help: 'Current system memory usage percentage',
});

/**
 * Process memory usage in bytes
 */
export const processMemoryUsage = new Gauge({
  name: 'gitray_process_memory_usage_bytes',
  help: 'Current process memory usage in bytes',
  labelNames: ['type'] as const, // heap_used, heap_total, rss, external
});

/**
 * Memory pressure circuit breaker state
 */
export const memoryCircuitBreakerState = new Gauge({
  name: 'gitray_memory_circuit_breaker_state',
  help: 'Memory pressure circuit breaker state (0=closed, 1=half-open, 2=open)',
});

/**
 * Memory pressure events counter
 */
export const memoryPressureEvents = new Counter({
  name: 'gitray_memory_pressure_events_total',
  help: 'Total number of memory pressure events',
  labelNames: ['level'] as const, // warning, critical, emergency
});

/**
 * Throttled requests due to memory pressure
 */
export const throttledRequests = new Counter({
  name: 'gitray_throttled_requests_total',
  help: 'Total number of requests throttled due to memory pressure',
  labelNames: ['reason'] as const,
});

/**
 * Emergency memory evictions
 */
export const emergencyEvictions = new Counter({
  name: 'gitray_emergency_evictions_total',
  help: 'Total number of emergency cache evictions due to memory pressure',
});

/**
 * Garbage collection triggers
 */
export const gcTriggered = new Counter({
  name: 'gitray_gc_triggered_total',
  help: 'Total number of garbage collection triggers due to memory pressure',
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
// ENHANCED HELPER FUNCTIONS FOR NEW METRICS
// ========================================================================

/**
 * Record enhanced cache operation with detailed context
 */
export function recordEnhancedCacheOperation(
  operation: string,
  hit: boolean,
  req?: Request,
  repoUrl?: string,
  commitCount?: number
): void {
  const tier = getCacheTier();
  const repoType = repoUrl ? getRepositoryType(repoUrl) : 'unknown';
  const userType = req ? getUserType(req) : 'unknown';
  const repoSize = commitCount
    ? getRepositorySizeCategory(commitCount)
    : 'unknown';

  if (hit) {
    cacheHitsEnhanced.inc({
      operation,
      tier,
      repo_type: repoType,
      user_type: userType,
      repo_size: repoSize,
    });
    cacheHits.inc({ operation }); // Backward compatibility
  } else {
    cacheMissesEnhanced.inc({
      operation,
      tier,
      repo_type: repoType,
      user_type: userType,
      repo_size: repoSize,
    });
    cacheMisses.inc({ operation }); // Backward compatibility
  }
}

/**
 * Record feature usage with enhanced context
 */
export function recordFeatureUsage(
  feature: string,
  userType: string,
  success: boolean,
  interactionType: 'click' | 'api_call' | 'auto' | 'navigation' = 'click'
): void {
  featureUsage.inc({
    feature,
    user_type: userType,
    success: success ? 'true' : 'false',
    interaction_type: interactionType,
  });
}

/**
 * Record detailed error with comprehensive context
 */
export function recordDetailedError(
  component: string,
  error: Error,
  context: {
    userImpact?: 'blocking' | 'degraded' | 'none';
    recoveryAction?: 'retry' | 'fallback' | 'manual';
    repoType?: 'public' | 'private';
    severity?: 'critical' | 'warning' | 'info';
  } = {}
): void {
  const errorCategory = categorizeError(error);

  detailedErrors.inc({
    component,
    error_category: errorCategory,
    error_severity: context.severity ?? 'warning',
    user_impact: context.userImpact ?? 'degraded',
    recovery_action: context.recoveryAction ?? 'retry',
    repo_type: context.repoType ?? 'unknown',
    tenant_id: 'default', // Could be enhanced for multi-tenant
  });
}

/**
 * Categorize error types for better analysis
 */
function categorizeError(error: Error): string {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (message.includes('network') || message.includes('connection'))
    return 'network';
  if (message.includes('permission') || message.includes('enoent'))
    return 'filesystem';
  if (message.includes('memory') || message.includes('heap')) return 'memory';
  if (message.includes('validation') || message.includes('invalid'))
    return 'validation';
  if (message.includes('auth') || message.includes('unauthorized'))
    return 'auth';
  if (name.includes('timeout')) return 'timeout';

  return 'unknown';
}

/**
 * Record SLA compliance for alerting
 */
export function recordSLACompliance(
  operationType: string,
  responseTime: number,
  userSegment: string = 'general'
): void {
  const slaTargets = {
    api: { p95: 2.0, p99: 5.0 },
    ui: { p95: 1.0, p99: 3.0 },
    admin: { p95: 5.0, p99: 10.0 },
  };

  const target =
    slaTargets[userSegment as keyof typeof slaTargets] || slaTargets.api;
  let slaStatus = 1.0; // 100% compliance by default

  if (responseTime > target.p99) slaStatus = 0.0;
  else if (responseTime > target.p95) slaStatus = 0.8;

  slaCompliance.set(
    {
      sla_tier: userSegment,
      time_window: '5m',
      operation_type: operationType,
      user_segment: userSegment,
    },
    slaStatus
  );
}

/**
 * Update service health score for alerting
 */
export function updateServiceHealthScore(
  component: string,
  metrics: {
    errorRate?: number;
    responseTime?: number;
    throughput?: number;
    cacheHitRate?: number;
    memoryUtilization?: number;
  }
): void {
  let healthScore = 100;

  // Reduce score based on various factors
  if (metrics.errorRate && metrics.errorRate > 0.01)
    healthScore -= Math.min(30, metrics.errorRate * 3000);
  if (metrics.responseTime && metrics.responseTime > 2)
    healthScore -= Math.min(20, (metrics.responseTime - 2) * 10);
  if (metrics.cacheHitRate && metrics.cacheHitRate < 0.8)
    healthScore -= (0.8 - metrics.cacheHitRate) * 50;
  if (metrics.memoryUtilization && metrics.memoryUtilization > 0.8)
    healthScore -= (metrics.memoryUtilization - 0.8) * 100;

  healthScore = Math.max(0, Math.min(100, healthScore));

  serviceHealthScore.set(
    {
      component,
      time_window: '5m',
      criticality: healthScore < 50 ? 'high' : 'low',
    },
    healthScore
  );
}

/**
 * Record coalescing effectiveness
 */
export function recordCoalescingEffectiveness(
  operationType: string,
  repoSize: string,
  concurrentRequests: number,
  timeSaved: number
): void {
  coalescingEffectiveness.observe(
    {
      operation_type: operationType,
      repo_size: repoSize,
      concurrent_requests: `${Math.min(concurrentRequests, 100)}+`,
      savings_type: 'time_seconds',
    },
    timeSaved
  );
}

/**
 * Record cache warming effectiveness
 */
export function recordCacheWarmingEffectiveness(
  strategy: string,
  hitWithinWindow: boolean,
  repoCategory: string,
  dataSize: string = 'medium'
): void {
  cacheWarming.inc({
    strategy,
    hit_within_window: hitWithinWindow ? 'yes' : 'no',
    repo_category: repoCategory,
    data_size: dataSize,
  });
}

/**
 * Record data freshness
 */
export function recordDataFreshness(
  dataType: string,
  ageSeconds: number,
  cacheTier: string = 'hybrid',
  repoSize: string = 'medium'
): void {
  dataFreshness.observe(
    { data_type: dataType, cache_tier: cacheTier, repo_size: repoSize },
    ageSeconds
  );
}

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
// TRANSACTION & ROLLBACK METRICS FUNCTIONS
// ========================================================================

/**
 * Record cache transaction outcome
 */
export function recordCacheTransaction(
  outcome: 'started' | 'committed' | 'rolled_back' | 'failed',
  cacheTier: 'raw' | 'filtered' | 'aggregated' | 'all',
  operationCount: number = 1
): void {
  let operationCountRange: string;
  if (operationCount === 1) {
    operationCountRange = '1';
  } else if (operationCount <= 5) {
    operationCountRange = '2-5';
  } else if (operationCount <= 10) {
    operationCountRange = '6-10';
  } else {
    operationCountRange = '10+';
  }

  cacheTransactions.inc({
    outcome,
    cache_tier: cacheTier,
    operation_count: operationCountRange,
  });
}

/**
 * Record transaction rollback operation
 */
export function recordTransactionRollback(
  outcome: 'success' | 'failed' | 'verified' | 'retry',
  cacheTier: 'raw' | 'filtered' | 'aggregated',
  operationType: 'set' | 'delete' | 'update',
  retryCount: number = 0
): void {
  let retryRange: string;
  if (retryCount === 0) {
    retryRange = '0';
  } else if (retryCount <= 2) {
    retryRange = '1-2';
  } else if (retryCount <= 5) {
    retryRange = '3-5';
  } else {
    retryRange = '5+';
  }

  transactionRollbacks.inc({
    rollback_outcome: outcome,
    cache_tier: cacheTier,
    operation_type: operationType,
    retry_count: retryRange,
  });
}

/**
 * Record rollback duration
 */
export function recordRollbackDuration(
  duration: number,
  cacheTier: 'raw' | 'filtered' | 'aggregated',
  operationCount: number,
  retryAttempts: number
): void {
  let operationCountRange: string;
  if (operationCount === 1) {
    operationCountRange = '1';
  } else if (operationCount <= 5) {
    operationCountRange = '2-5';
  } else if (operationCount <= 10) {
    operationCountRange = '6-10';
  } else {
    operationCountRange = '10+';
  }

  let retryRange: string;
  if (retryAttempts === 0) {
    retryRange = '0';
  } else if (retryAttempts <= 2) {
    retryRange = '1-2';
  } else if (retryAttempts <= 5) {
    retryRange = '3-5';
  } else {
    retryRange = '5+';
  }

  rollbackDuration.observe(
    {
      cache_tier: cacheTier,
      operation_count: operationCountRange,
      retry_attempts: retryRange,
    },
    duration / 1000 // Convert to seconds
  );
}

/**
 * Record rollback verification result
 */
export function recordRollbackVerification(
  cacheTier: 'raw' | 'filtered' | 'aggregated',
  verificationResult: 'success' | 'failed',
  attemptNumber: number
): void {
  let attemptRange: string;
  if (attemptNumber === 1) {
    attemptRange = '1';
  } else if (attemptNumber <= 3) {
    attemptRange = '2-3';
  } else {
    attemptRange = '3+';
  }

  rollbackVerification.inc({
    cache_tier: cacheTier,
    verification_result: verificationResult,
    attempt_number: attemptRange,
  });
}

/**
 * Record critical rollback failure requiring manual intervention
 */
export function recordCriticalRollbackFailure(
  transactionType: 'cache_write' | 'cache_delete' | 'cache_update',
  failedOperationsCount: number,
  severity: 'high' | 'critical' = 'critical'
): void {
  let failureCountRange: string;
  if (failedOperationsCount === 1) {
    failureCountRange = '1';
  } else if (failedOperationsCount <= 3) {
    failureCountRange = '2-3';
  } else if (failedOperationsCount <= 5) {
    failureCountRange = '4-5';
  } else {
    failureCountRange = '5+';
  }

  criticalRollbackFailures.inc({
    transaction_type: transactionType,
    failed_operations_count: failureCountRange,
    severity,
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

// Enhanced Express middleware that records comprehensive metrics about each HTTP request
export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path ?? req.path ?? 'unknown';
    const userType = getUserType(req);
    const cacheStatus =
      (res.getHeader && (res.getHeader('X-Cache-Status') as string)) ??
      'unknown';

    // Enhanced HTTP metrics with additional context
    httpRequestsTotal.inc({
      method: req.method ?? 'UNKNOWN',
      route,
      status_code: res.statusCode ?? 500,
      user_type: userType,
      cache_status: cacheStatus,
    });

    // Enhanced duration tracking with SLA context
    const slaStatus =
      duration < 2 ? 'met' : duration < 5 ? 'degraded' : 'violated';
    httpRequestDuration.observe(
      {
        method: req.method ?? 'UNKNOWN',
        route,
        status_code: res.statusCode ?? 500,
        user_type: userType,
        sla_tier: slaStatus,
      },
      duration
    );

    // Record SLA compliance
    recordSLACompliance(route, duration, userType);

    // Update service health score
    updateServiceHealthScore('api', {
      errorRate: (res.statusCode ?? 500) >= 400 ? 1 : 0,
      responseTime: duration,
    });
  });

  next();
};

// Endpoint that exposes all collected metrics in Prometheus format
export const metricsHandler = async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};

// ========================================================================
// COMPREHENSIVE METRICS UPDATE FUNCTIONS
// ========================================================================

/**
 * Enhanced cache metrics update with additional context
 */
export const updateEnhancedCacheMetrics = async () => {
  try {
    const { getCacheStats } = await import('./cache');
    const stats = getCacheStats();

    // Update existing metrics
    await updateCacheMetrics();

    // Update memory utilization with component breakdown
    if (stats.hybrid) {
      memoryUtilization.set(
        {
          component: 'cache',
          allocation_type: 'heap',
          process_id: process.pid.toString(),
        },
        stats.hybrid.memory.usageBytes
      );
    }

    // Update cache access patterns (placeholder - would be enhanced with real pattern detection)
    const currentHour = new Date().getHours();
    const timeOfDay =
      currentHour < 6
        ? 'night'
        : currentHour < 12
          ? 'morning'
          : currentHour < 18
            ? 'afternoon'
            : 'evening';

    cacheAccessPatterns.observe(
      {
        pattern_type: 'temporal',
        time_of_day: timeOfDay,
        user_behavior: 'normal',
        data_type: 'mixed',
      },
      // TODO: Replace with real access frequency data when implementing cache pattern detection
      // This Math.random() is safe for metrics placeholder data (not security-sensitive)
      Math.random() * 100 // Placeholder - would be real access frequency
    );
  } catch (err) {
    console.warn('Failed to update enhanced cache metrics', { err });
  }
};

/**
 * Update coordination system metrics
 */
export const updateCoordinationMetrics = async () => {
  try {
    const { repositoryCoordinator } = await import('./repositoryCoordinator');
    const metrics = repositoryCoordinator.getMetrics();

    // Update coordination health score
    const healthScore = calculateCoordinationHealthScore(metrics);
    coordinationHealth.set(
      { component: 'coordinator', metric_type: 'overall' },
      healthScore
    );

    // Update capacity warnings
    const maxRepos = 50; // From config
    const utilizationPercentage = (metrics.cachedRepositories / maxRepos) * 100;

    capacityWarnings.set(
      {
        resource_type: 'repository_cache',
        threshold_level:
          utilizationPercentage > 90
            ? 'critical'
            : utilizationPercentage > 75
              ? 'warning'
              : 'normal',
        component: 'coordinator',
        trend: 'stable', // Would be calculated from historical data
      },
      utilizationPercentage
    );
  } catch (err) {
    console.warn('Failed to update coordination metrics', { err });
  }
};

/**
 * Calculate coordination system health score
 */
function calculateCoordinationHealthScore(metrics: any): number {
  let score = 100;

  // Reduce score based on various factors
  if (metrics.activeClones > 5)
    score -= Math.min(20, (metrics.activeClones - 5) * 4);
  if (metrics.cachedRepositories > 45)
    score -= Math.min(15, (metrics.cachedRepositories - 45) * 3);

  const cacheHitRate =
    metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses + 1);
  if (cacheHitRate < 0.8) score -= (0.8 - cacheHitRate) * 50;

  return Math.max(0, Math.min(100, score));
}

/**
 * Update system resource metrics
 */
export const updateSystemResourceMetrics = () => {
  try {
    const memUsage = process.memoryUsage();

    // Update memory utilization metrics
    memoryUtilization.set(
      {
        component: 'nodejs',
        allocation_type: 'heap_used',
        process_id: process.pid.toString(),
      },
      memUsage.heapUsed
    );
    memoryUtilization.set(
      {
        component: 'nodejs',
        allocation_type: 'heap_total',
        process_id: process.pid.toString(),
      },
      memUsage.heapTotal
    );
    memoryUtilization.set(
      {
        component: 'nodejs',
        allocation_type: 'external',
        process_id: process.pid.toString(),
      },
      memUsage.external
    );

    // Update CPU utilization (placeholder - would use proper CPU monitoring)
    const cpuUsage = process.cpuUsage();
    cpuUtilization.set(
      { process_type: 'nodejs', operation_category: 'mixed', core_id: '0' },
      (cpuUsage.user + cpuUsage.system) / 1000000 // Convert to percentage approximation
    );
  } catch (err) {
    console.warn('Failed to update system resource metrics', { err });
  }
};

// ========================================================================
// CRITICAL: MEMORY PRESSURE METRICS UPDATES
// ========================================================================

/**
 * Update memory pressure metrics from memory pressure manager
 */
export function updateMemoryPressureMetrics(): void {
  // Use dynamic import to avoid circular dependencies
  import('../utils/memoryPressureManager')
    .then((memoryPressureManager) => {
      const stats = memoryPressureManager.getMemoryStats();
      const metrics = memoryPressureManager.getMemoryMetrics();

      // Update pressure level gauge
      const levelMap: Record<string, number> = {
        normal: 0,
        warning: 1,
        critical: 2,
        emergency: 3,
      };
      memoryPressureLevel.set(levelMap[stats.pressure.level] || 0);

      // Update system memory usage
      systemMemoryUsage.set(stats.system.usagePercentage * 100);

      // Update process memory usage
      processMemoryUsage.set({ type: 'heap_used' }, stats.process.heapUsed);
      processMemoryUsage.set({ type: 'heap_total' }, stats.process.heapTotal);
      processMemoryUsage.set({ type: 'rss' }, stats.process.rss);
      processMemoryUsage.set({ type: 'external' }, stats.process.external);

      // Update metrics counters using the metrics variable
      memoryPressureEvents.inc({ level: 'warning' }, metrics.pressureEvents);
      throttledRequests.inc(
        { reason: 'memory_pressure' },
        metrics.throttledRequests
      );
      emergencyEvictions.inc(metrics.emergencyEvictions);
      gcTriggered.inc(metrics.gcTriggered);
      processMemoryUsage.set({ type: 'heap_used' }, stats.process.heapUsed);
      processMemoryUsage.set({ type: 'heap_total' }, stats.process.heapTotal);
      processMemoryUsage.set({ type: 'rss' }, stats.process.rss);
      processMemoryUsage.set({ type: 'external' }, stats.process.external);

      // Update circuit breaker state
      const cbStateMap: Record<string, number> = {
        normal: 0,
        warning: 0,
        critical: 1,
        emergency: 2,
      };
      memoryCircuitBreakerState.set(cbStateMap[stats.pressure.level] || 0);
    })
    .catch((error) => {
      console.warn('Failed to update memory pressure metrics', { error });
    });
}

/**
 * Record memory pressure event
 */
export function recordMemoryPressureEvent(
  level: 'warning' | 'critical' | 'emergency'
): void {
  memoryPressureEvents.inc({ level });
}

/**
 * Record throttled request
 */
export function recordThrottledRequest(reason: string): void {
  throttledRequests.inc({ reason });
}

/**
 * Record emergency eviction
 */
export function recordEmergencyEviction(): void {
  emergencyEvictions.inc();
}

/**
 * Record GC trigger
 */
export function recordGCTrigger(): void {
  gcTriggered.inc();
}

/**
 * Comprehensive metrics update function
 */
export const updateAllEnhancedMetrics = async () => {
  await Promise.allSettled([
    updateCacheMetrics(), // Existing function
    updateEnhancedCacheMetrics(),
    updateCoordinationMetrics(),
    updateSystemResourceMetrics(),
  ]);

  // Update memory pressure metrics synchronously since it doesn't return a Promise
  updateMemoryPressureMetrics();
};
