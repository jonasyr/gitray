/**
 * Repository Route Factory
 *
 * This module provides factory functions to reduce duplication in repository routes.
 * It extracts the common pattern of:
 * - Setting up request context (logger, repoUrl, userType)
 * - Executing a cache operation
 * - Recording success metrics and sending response
 * - Handling errors uniformly
 *
 * @module repositoryRouteFactory
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ValidationChain } from 'express-validator';
import {
  setupRouteRequest,
  recordRouteSuccess,
  recordRouteError,
} from './routeHelpers.js';

/**
 * Context provided to route processors, containing the essential
 * request information extracted by setupRouteRequest
 */
export interface RouteContext {
  req: Request;
  logger: ReturnType<typeof setupRouteRequest>['logger'];
  repoUrl: string;
  userType: string;
}

/**
 * Function that builds success metrics from the cache operation result.
 * These metrics are logged and can be used for monitoring.
 *
 * @template T The type of data returned by the cache operation
 * @param result The result from the cache operation
 * @returns Object with metric key-value pairs
 */
export type SuccessMetricsBuilder<T> = (
  result: T
) => Record<string, number | boolean | string | undefined>;

/**
 * Function that executes the core cache operation for a route.
 * It receives the route context and returns the cached data.
 *
 * @template T The type of data returned by the cache operation
 * @param ctx Route context with logger, repoUrl, and userType
 * @returns Promise resolving to the cached data
 */
export type RouteProcessor<T> = (ctx: RouteContext) => Promise<T>;

/**
 * Creates a route handler array with the unified cache pattern.
 *
 * This factory eliminates duplication by extracting the common structure:
 * 1. Setup request context (logger, repoUrl, userType)
 * 2. Execute cache operation via the processor function
 * 3. Record success with metrics
 * 4. Handle errors uniformly
 *
 * The returned array can be spread into router.get/post/etc calls.
 *
 * @template T The type of data returned by the cache operation
 * @param featureName Feature identifier for metrics (e.g., 'repository_commits')
 * @param processor Function that executes the cache operation
 * @param buildMetrics Function that extracts metrics from the result
 * @returns Array of Express request handlers (middleware)
 *
 * @example
 * router.get(
 *   '/commits',
 *   setRequestPriority('normal'),
 *   ...buildRepoValidationChain({ includePagination: true }),
 *   ...createCachedRouteHandler(
 *     'repository_commits',
 *     async ({ req, repoUrl }) => {
 *       const { page, limit, skip } = extractPaginationParams(req.query);
 *       const commits = await getCachedCommits(repoUrl, { skip, limit });
 *       return { commits, page, limit };
 *     },
 *     ({ commits, page, limit }) => ({ commitCount: commits.length, page, limit })
 *   )
 * );
 */
export function createCachedRouteHandler<T>(
  featureName: string,
  processor: RouteProcessor<T>,
  buildMetrics: SuccessMetricsBuilder<T>
): RequestHandler[] {
  return [
    async (req: Request, res: Response, next: NextFunction) => {
      // Setup request context using existing helper
      const { logger, repoUrl, userType } = setupRouteRequest(req);

      try {
        // Execute the cache operation via processor
        const result = await processor({
          req,
          logger,
          repoUrl,
          userType,
        });

        // Record success with extracted metrics
        recordRouteSuccess(
          featureName,
          userType,
          logger,
          repoUrl,
          result,
          res,
          buildMetrics(result)
        );
      } catch (error) {
        // Uniform error handling
        recordRouteError(featureName, userType, logger, repoUrl, error, next);
      }
    },
  ];
}

/**
 * Options for building repository validation chains.
 * Each boolean flag includes the corresponding validation middleware.
 */
export interface ValidationChainOptions {
  /** Include pagination validation (page, limit) */
  includePagination?: boolean;
  /** Include date validation (fromDate, toDate) */
  includeDates?: boolean;
  /** Include author validation (author, authors) */
  includeAuthors?: boolean;
  /** Include churn validation (minChanges, extensions) */
  includeChurn?: boolean;
}

/**
 * Builds a validation chain for repository routes based on the provided options.
 *
 * This helper consolidates the repetitive pattern of combining validation middlewares:
 * - `repoUrlValidation()` is always included (required for all routes)
 * - Additional validators are conditionally included based on options
 *
 * The order of validators matches the existing route patterns to maintain behavior.
 *
 * @param options Flags indicating which validators to include
 * @returns Array of ValidationChain middleware
 *
 * @example
 * // For /commits route (requires pagination):
 * router.get('/commits',
 *   setRequestPriority('normal'),
 *   ...buildRepoValidationChain({ includePagination: true }),
 *   handleValidationErrors,
 *   ...createCachedRouteHandler(...)
 * );
 *
 * @example
 * // For /heatmap route (requires dates and authors):
 * router.get('/heatmap',
 *   setRequestPriority('low'),
 *   ...buildRepoValidationChain({ includeDates: true, includeAuthors: true }),
 *   handleValidationErrors,
 *   ...createCachedRouteHandler(...)
 * );
 */
export function buildRepoValidationChain(
  options: ValidationChainOptions,
  validators: {
    repoUrlValidation: () => ValidationChain[];
    paginationValidation?: () => ValidationChain[];
    dateValidation?: () => ValidationChain[];
    authorValidation?: () => ValidationChain[];
    churnValidation?: () => ValidationChain[];
  }
): ValidationChain[] {
  const chain: ValidationChain[] = [...validators.repoUrlValidation()];

  // Add validators in the same order as existing routes to maintain behavior
  if (options.includePagination && validators.paginationValidation) {
    chain.push(...validators.paginationValidation());
  }

  if (options.includeDates && validators.dateValidation) {
    chain.push(...validators.dateValidation());
  }

  if (options.includeAuthors && validators.authorValidation) {
    chain.push(...validators.authorValidation());
  }

  if (options.includeChurn && validators.churnValidation) {
    chain.push(...validators.churnValidation());
  }

  return chain;
}
