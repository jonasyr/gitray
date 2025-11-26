import { Request } from 'express';
import { CommitFilterOptions } from '@gitray/shared-types';
import { createRequestLogger } from '../services/logger';
import { getUserType } from '../services/metrics';

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
