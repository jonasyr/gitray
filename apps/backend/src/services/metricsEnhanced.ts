/**
 * Enhanced Metrics Integration Examples and Utilities
 *
 * This file provides integration examples and utilities for the enhanced metrics system.
 * It demonstrates how to use the new metrics capabilities throughout the application.
 */

import { Request } from 'express';
import {
  recordEnhancedCacheOperation,
  recordFeatureUsage,
  recordDetailedError,
  recordCoalescingEffectiveness,
  recordCacheWarmingEffectiveness,
  recordDataFreshness,
  updateServiceHealthScore,
  reliabilityIndicators,
  anomalyDetection,
  pageLoadTime,
  apiResponseQuality,
  errorRecovery,
  getUserType,
  getRepositoryType,
  getRepositorySizeCategory,
} from './metrics';

// ========================================================================
// INTEGRATION EXAMPLES
// ========================================================================

/**
 * Example: Enhanced cache operation recording in gitService
 */
export function exampleCacheOperationRecording(
  operation: string,
  hit: boolean,
  req?: Request,
  repoUrl?: string,
  commitCount?: number
) {
  // Use the enhanced cache recording function
  recordEnhancedCacheOperation(operation, hit, req, repoUrl, commitCount);

  // Also record data freshness if it's a cache hit
  if (hit && commitCount) {
    const ageSeconds = Math.random() * 3600; // Placeholder - would be real age
    recordDataFreshness(
      'commits',
      ageSeconds,
      'hybrid',
      getRepositorySizeCategory(commitCount)
    );
  }
}

/**
 * Example: Feature usage tracking in UI components
 */
export function exampleFeatureUsageTracking() {
  // Track different types of feature usage
  recordFeatureUsage('heatmap_view', 'ui', true, 'click');
  recordFeatureUsage('commit_search', 'api', true, 'api_call');
  recordFeatureUsage('repository_clone', 'admin', false, 'auto');
}

/**
 * Example: Error handling with detailed metrics
 */
export function exampleErrorHandling(
  error: Error,
  context: { component: string; repoUrl?: string }
) {
  const startTime = Date.now();

  // Record the detailed error
  recordDetailedError(context.component, error, {
    userImpact: error.name === 'TimeoutError' ? 'degraded' : 'blocking',
    recoveryAction: 'retry',
    repoType: context.repoUrl
      ? getRepositoryType(context.repoUrl) === 'unknown'
        ? undefined
        : (getRepositoryType(context.repoUrl) as 'public' | 'private')
      : undefined,
    severity: error.name === 'ValidationError' ? 'warning' : 'critical',
  });

  // Simulate recovery attempt
  const recovered = Math.random() > 0.3; // 70% success rate
  const recoveryTime = (Date.now() - startTime) / 1000;

  errorRecovery.observe(
    {
      error_type: error.name,
      recovery_method: 'automatic_retry',
      success: recovered ? 'true' : 'false',
    },
    recoveryTime
  );
}

/**
 * Example: Request coalescing metrics
 */
export function exampleCoalescingMetrics(
  operationType: string,
  repoUrl: string,
  concurrentRequests: number
) {
  const commitCount = Math.floor(Math.random() * 100000); // Placeholder
  const repoSize = getRepositorySizeCategory(commitCount);
  const timeSaved = concurrentRequests * 0.5; // Placeholder calculation

  recordCoalescingEffectiveness(
    operationType,
    repoSize,
    concurrentRequests,
    timeSaved
  );
}

/**
 * Example: Page load time tracking for frontend
 */
export function recordPageLoadMetrics(
  pageType: string,
  loadTime: number,
  req: Request,
  repoSize: string = 'medium',
  cacheHit: boolean = false
) {
  const userType = getUserType(req);
  const cacheStatus = cacheHit ? 'hit' : 'miss';

  pageLoadTime.observe(
    {
      page_type: pageType,
      user_type: userType,
      repo_size: repoSize,
      cache_status: cacheStatus,
    },
    loadTime
  );
}

/**
 * Example: API response quality assessment
 */
export function assessAPIResponseQuality(
  endpoint: string,
  dataCompleteness: number, // 0-1
  dataFreshness: number // seconds
): number {
  let qualityScore = 100;

  // Reduce score based on data completeness
  qualityScore *= dataCompleteness;

  // Reduce score based on data freshness
  if (dataFreshness > 3600) qualityScore *= 0.8; // 1 hour
  if (dataFreshness > 86400) qualityScore *= 0.6; // 1 day

  const freshnessCategory =
    dataFreshness < 60 ? 'fresh' : dataFreshness < 3600 ? 'recent' : 'stale';
  const completenessCategory =
    dataCompleteness > 0.9
      ? 'complete'
      : dataCompleteness > 0.7
        ? 'partial'
        : 'incomplete';

  apiResponseQuality.observe(
    {
      endpoint,
      data_completeness: completenessCategory,
      freshness_tier: freshnessCategory,
    },
    qualityScore
  );

  return qualityScore;
}

// ========================================================================
// ALERTING HELPERS
// ========================================================================

/**
 * Check if service health is below threshold and needs alerting
 */
export function checkServiceHealthAlerts(): boolean {
  // This would be implemented with proper metric querying in production
  // For now, it's a placeholder that demonstrates the concept

  // In real implementation, you would query the serviceHealthScore metric

  return false; // Placeholder
}

/**
 * Detect anomalies based on recent metrics
 */
export function detectAnomalies() {
  // Placeholder for anomaly detection logic
  // In production, this would analyze metric trends and patterns

  const anomalies = [
    { type: 'response_time_spike', severity: 'warning', component: 'api' },
    { type: 'cache_hit_rate_drop', severity: 'critical', component: 'cache' },
  ];

  anomalies.forEach((anomaly) => {
    anomalyDetection.inc({
      anomaly_type: anomaly.type,
      severity: anomaly.severity,
      component: anomaly.component,
      detection_method: 'statistical',
    });
  });
}

/**
 * Update reliability indicators for SRE monitoring
 */
export function updateReliabilityIndicators() {
  // Example SLI calculations (Service Level Indicators)
  const indicators = {
    availability: 99.9, // Percentage uptime
    error_budget: 95.5, // Remaining error budget
    latency_p99: 2.1, // 99th percentile latency in seconds
    throughput: 1250, // Requests per minute
  };

  Object.entries(indicators).forEach(([indicator, value]) => {
    reliabilityIndicators.set(
      {
        indicator_type: indicator,
        service: 'gitray',
        measurement_window: '1h',
      },
      value
    );
  });
}

// ========================================================================
// BUSINESS METRICS HELPERS
// ========================================================================

/**
 * Track user session metrics
 */
export function trackUserSession(
  sessionType: 'new' | 'returning' | 'anonymous',
  durationMinutes: number,
  featuresUsed: string[]
) {
  const durationBucket =
    durationMinutes < 1 ? 'short' : durationMinutes < 10 ? 'medium' : 'long';

  const featureUsage =
    featuresUsed.length > 3
      ? 'high'
      : featuresUsed.length > 1
        ? 'medium'
        : 'low';

  // This would use the userSessions metric from metrics.ts
  console.log(
    `Session tracked: ${sessionType}, duration: ${durationBucket}, features: ${featureUsage}`
  );
  // userSessions.inc({ session_type: sessionType, duration_bucket: durationBucket, feature_usage: featureUsage, user_type: userType });
}

/**
 * Calculate and record cache warming effectiveness
 */
export function calculateCacheWarmingEffectiveness(
  strategy: 'predictive' | 'scheduled' | 'reactive',
  requestsServed: number,
  cacheHits: number,
  repoCategory: string
) {
  const effectiveness = cacheHits / requestsServed;
  const hitWithinWindow = effectiveness > 0.5;

  recordCacheWarmingEffectiveness(strategy, hitWithinWindow, repoCategory);
}

// ========================================================================
// CAPACITY PLANNING HELPERS
// ========================================================================

/**
 * Predict capacity needs based on current metrics
 */
export function predictCapacityNeeds(): {
  memory: { current: number; predicted: number; recommendation: string };
  storage: { current: number; predicted: number; recommendation: string };
  network: { current: number; predicted: number; recommendation: string };
} {
  // Placeholder for capacity prediction logic
  // In production, this would analyze trends and growth patterns

  return {
    memory: {
      current: 70, // percentage
      predicted: 85, // percentage in next week
      recommendation: 'Consider increasing memory allocation',
    },
    storage: {
      current: 45,
      predicted: 55,
      recommendation: 'Storage levels are healthy',
    },
    network: {
      current: 30,
      predicted: 40,
      recommendation: 'Network capacity is sufficient',
    },
  };
}

/**
 * Example integration with existing cache operations
 */
export function enhancedCacheIntegration(
  operation: string,
  result: any,
  req?: Request,
  repoUrl?: string
) {
  const hit = !!result;
  const commitCount = result?.length || 0;

  // Record enhanced cache metrics
  recordEnhancedCacheOperation(operation, hit, req, repoUrl, commitCount);

  // Record data freshness if available
  if (hit && result.timestamp) {
    const ageSeconds =
      (Date.now() - new Date(result.timestamp).getTime()) / 1000;
    recordDataFreshness(operation, ageSeconds);
  }

  // Update service health
  updateServiceHealthScore('cache', {
    cacheHitRate: hit ? 1 : 0,
  });
}

export default {
  exampleCacheOperationRecording,
  exampleFeatureUsageTracking,
  exampleErrorHandling,
  recordPageLoadMetrics,
  assessAPIResponseQuality,
  checkServiceHealthAlerts,
  detectAnomalies,
  updateReliabilityIndicators,
  trackUserSession,
  predictCapacityNeeds,
  enhancedCacheIntegration,
};
