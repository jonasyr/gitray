import { Request, Response } from 'express';
import { CommitFilterOptions, HTTP_STATUS } from '@gitray/shared-types';
import { createRequestLogger } from '../services/logger';
import { getUserType, recordFeatureUsage } from '../services/metrics';

/**
 * Extracts common request initialization for route handlers.
 * Reduces duplication across all repository route endpoints.
 *
 * This helper consolidates the standard setup that every route handler needs:
 * - Request-scoped logger with correlation ID
 * - Repository URL from query parameters
 * - User type for metrics tracking
 *
 * @param req - Express request object
 * @returns Object containing logger, repoUrl, and userType
 *
 * @example
 * const { logger, repoUrl, userType } = setupRouteRequest(req);
 * logger.info('Processing request', { repoUrl });
 */
export function setupRouteRequest(req: Request) {
  const logger = createRequestLogger(req);
  const { repoUrl } = req.query as Record<string, string>;
  const userType = getUserType(req);

  return { logger, repoUrl, userType };
}

/**
 * Records successful route operation with metrics and logging.
 * Standardizes success path across all repository endpoints.
 *
 * This helper consolidates three common operations after successful data retrieval:
 * - Recording success metrics for monitoring
 * - Logging operation completion with context
 * - Sending HTTP 200 response with data
 *
 * @param featureName - Feature identifier for metrics (e.g., 'repository_commits')
 * @param userType - User type from metrics service
 * @param logger - Request-scoped logger instance
 * @param repoUrl - Repository URL for logging context
 * @param data - Response data to send to client
 * @param res - Express response object
 * @param additionalLogData - Optional extra fields for success log
 *
 * @example
 * recordRouteSuccess(
 *   'repository_commits',
 *   userType,
 *   logger,
 *   repoUrl,
 *   { commits, page, limit },
 *   res,
 *   { commitCount: commits.length, page, limit }
 * );
 */
export function recordRouteSuccess<T>(
  featureName: string,
  userType: string,
  logger: any,
  repoUrl: string,
  data: T,
  res: any,
  additionalLogData?: Record<string, any>
): void {
  // Record success metrics
  recordFeatureUsage(featureName, userType, true, 'api_call');

  // Log successful operation
  logger.info(`${featureName} retrieved successfully`, {
    repoUrl,
    ...additionalLogData,
  });

  // Send response
  res.status(HTTP_STATUS.OK).json(data);
}

/**
 * Records failed route operation with metrics and logging.
 * Standardizes error handling across all repository endpoints.
 *
 * This helper consolidates three common operations when errors occur:
 * - Recording failure metrics for monitoring
 * - Logging error details with context
 * - Propagating error to Express error handler middleware
 *
 * @param featureName - Feature identifier for metrics (e.g., 'repository_commits')
 * @param userType - User type from metrics service
 * @param logger - Request-scoped logger instance
 * @param repoUrl - Repository URL for logging context
 * @param error - The error that occurred
 * @param next - Express next function for error propagation
 *
 * @example
 * } catch (error) {
 *   recordRouteError('repository_commits', userType, logger, repoUrl, error, next);
 * }
 */
export function recordRouteError(
  featureName: string,
  userType: string,
  logger: any,
  repoUrl: string,
  error: unknown,
  next: any
): void {
  // Record failure metrics
  recordFeatureUsage(featureName, userType, false, 'api_call');

  // Log error with context
  logger.error(`Failed to retrieve ${featureName}`, {
    repoUrl,
    error: error instanceof Error ? error.message : String(error),
  });

  // Propagate error to Express error handler
  next(error);
}

/**
 * Builds CommitFilterOptions from Express query parameters.
 * Only includes defined properties to ensure consistent cache keys.
 *
 * This helper eliminates duplication across route handlers that need to
 * construct filter objects from query parameters. By excluding undefined
 * properties, it ensures that cache key generation is consistent regardless
 * of which optional filters are provided.
 *
 * @param query - Express request query object containing filter parameters
 * @returns CommitFilterOptions with only defined properties
 *
 * @example
 * const filters = buildCommitFilters({
 *   author: 'john',
 *   fromDate: '2024-01-01',
 *   toDate: '2024-12-31'
 * });
 * // Returns: { author: 'john', fromDate: '2024-01-01', toDate: '2024-12-31' }
 */
export function buildCommitFilters(query: {
  author?: string;
  authors?: string;
  fromDate?: string;
  toDate?: string;
}): CommitFilterOptions {
  const filters: CommitFilterOptions = {};

  if (query.author) {
    filters.author = query.author;
  }
  if (query.authors) {
    filters.authors = query.authors.split(',').map((a) => a.trim());
  }
  if (query.fromDate) {
    filters.fromDate = query.fromDate;
  }
  if (query.toDate) {
    filters.toDate = query.toDate;
  }

  return filters;
}
