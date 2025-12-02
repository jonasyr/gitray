import express, { Request, Response, NextFunction } from 'express';
import {
  getCachedCommits,
  getCachedAggregatedData,
  getCachedContributors,
  getCachedChurnData,
  getCachedSummary,
  type CommitCacheOptions,
} from '../services/repositoryCache.js';
import { createRequestLogger } from '../services/logger.js';
import {
  recordFeatureUsage,
  recordEnhancedCacheOperation,
  getUserType,
  getRepositorySizeCategory,
} from '../services/metrics.js';
import {
  CommitFilterOptions,
  ChurnFilterOptions,
  HTTP_STATUS,
} from '@gitray/shared-types';
import {
  handleValidationErrorsWithResponse as handleValidationErrors,
  repoUrlValidation,
  paginationValidation,
  dateValidation,
  authorValidation,
  churnValidation,
} from '../middlewares/validation.js';
import {
  buildCommitFilters,
  buildChurnFilters,
  extractPaginationParams,
  extractFilterParams,
  setupRouteRequest,
  recordRouteSuccess,
  recordRouteError,
} from '../utils/routeHelpers.js';
import {
  createCachedRouteHandler,
  buildRepoValidationChain,
} from '../utils/repositoryRouteFactory.js';

// Remove unused imports: redis, gitService, withTempRepository, repositorySummaryService

// Middleware to set request priority based on route
const setRequestPriority = (priority: 'low' | 'normal' | 'high') => {
  return (req: Request, res: Response, next: NextFunction) => {
    req.memoryPriority = priority;
    next();
  };
};

// Router handling repository related endpoints
const router = express.Router();

// ---------------------------------------------------------------------------
// GET endpoint to get repository commits with pagination (unified cache)
// ---------------------------------------------------------------------------
router.get(
  '/commits',
  setRequestPriority('normal'),
  ...buildRepoValidationChain(
    { includePagination: true },
    {
      repoUrlValidation,
      paginationValidation,
    }
  ),
  handleValidationErrors,
  ...createCachedRouteHandler(
    'repository_commits',
    async ({ req, repoUrl, logger }) => {
      const { page, limit, skip } = extractPaginationParams(req.query);

      logger.info('Processing commits request with unified caching', {
        repoUrl,
        page,
        limit,
      });

      // Use unified cache manager (handles all three cache levels automatically)
      const cacheOptions: CommitCacheOptions = {
        skip,
        limit,
      };

      const commits = await getCachedCommits(repoUrl, cacheOptions);

      return { commits, page, limit };
    },
    ({ commits, page, limit }) => ({
      commitCount: commits.length,
      page,
      limit,
    })
  )
);

// ---------------------------------------------------------------------------
// GET endpoint to get commit heatmap data with filters (unified cache)
// ---------------------------------------------------------------------------
router.get(
  '/heatmap',
  setRequestPriority('low'),
  ...buildRepoValidationChain(
    { includeDates: true, includeAuthors: true },
    {
      repoUrlValidation,
      dateValidation,
      authorValidation,
    }
  ),
  handleValidationErrors,
  ...createCachedRouteHandler(
    'heatmap_view',
    async ({ req, repoUrl, logger }) => {
      const { author, authors, fromDate, toDate } = extractFilterParams(
        req.query as Record<string, string>
      );

      logger.info('Processing heatmap request with unified caching', {
        repoUrl,
        hasFilters: !!(author || authors || fromDate || toDate),
      });

      // Build filter options from query parameters using helper function
      const filters = buildCommitFilters({ author, authors, fromDate, toDate });

      // Use unified cache manager for aggregated data (Level 3 cache)
      const heatmapData = await getCachedAggregatedData(repoUrl, filters);

      return { heatmapData };
    },
    ({ heatmapData }) => ({ dataPoints: heatmapData.data.length })
  )
);

// ---------------------------------------------------------------------------
// GET endpoint to get repository top contributors with filters (unified cache)
// ---------------------------------------------------------------------------
router.get(
  '/contributors',
  setRequestPriority('normal'),
  ...buildRepoValidationChain(
    { includeDates: true, includeAuthors: true },
    {
      repoUrlValidation,
      dateValidation,
      authorValidation,
    }
  ),
  handleValidationErrors,
  ...createCachedRouteHandler(
    'contributors_view',
    async ({ req, repoUrl, logger }) => {
      const { author, authors, fromDate, toDate } = extractFilterParams(
        req.query as Record<string, string>
      );

      logger.info('Processing contributors request with unified caching', {
        repoUrl,
        hasFilters: !!(author || authors || fromDate || toDate),
      });

      // Build filter options from query parameters using helper function
      const filters = buildCommitFilters({ author, authors, fromDate, toDate });

      // Use unified cache manager for contributors data
      const contributors = await getCachedContributors(repoUrl, filters);

      return { contributors };
    },
    ({ contributors }) => ({ contributorCount: contributors.length })
  )
);

// ---------------------------------------------------------------------------
// GET endpoint to get code churn analysis with filters (unified cache)
// ---------------------------------------------------------------------------
router.get(
  '/churn',
  setRequestPriority('normal'),
  ...buildRepoValidationChain(
    { includeDates: true, includeChurn: true },
    {
      repoUrlValidation,
      dateValidation,
      churnValidation,
    }
  ),
  handleValidationErrors,
  ...createCachedRouteHandler(
    'code_churn_view',
    async ({ req, repoUrl, logger }) => {
      const { fromDate, toDate, minChanges, extensions } = req.query as Record<
        string,
        string
      >;

      logger.info('Processing churn analysis request with unified caching', {
        repoUrl,
        hasFilters: !!(fromDate || toDate || minChanges || extensions),
      });

      // Build filter options from query parameters using helper
      const filters = buildChurnFilters({
        fromDate,
        toDate,
        minChanges,
        extensions,
      });

      // Use unified cache manager for churn data
      const churnData = await getCachedChurnData(repoUrl, filters);

      return { churnData };
    },
    ({ churnData }) => ({ fileCount: churnData.files.length })
  )
);

// ---------------------------------------------------------------------------
// GET endpoint to get repository summary statistics (unified cache)
// ---------------------------------------------------------------------------
router.get(
  '/summary',
  setRequestPriority('normal'),
  ...buildRepoValidationChain({}, { repoUrlValidation }),
  handleValidationErrors,
  ...createCachedRouteHandler(
    'repository_summary',
    async ({ repoUrl, logger }) => {
      logger.info(
        'Processing repository summary request with unified caching',
        {
          repoUrl,
        }
      );

      // Use unified cache manager for summary data
      const summary = await getCachedSummary(repoUrl);

      return { summary };
    },
    ({ summary }) => ({ repositoryName: summary.repository.name })
  )
);

// ---------------------------------------------------------------------------
// GET endpoint to fetch both commits and heatmap data with pagination and filters (unified cache)
// ---------------------------------------------------------------------------
router.get(
  '/full-data',
  setRequestPriority('low'),
  ...buildRepoValidationChain(
    {
      includePagination: true,
      includeDates: true,
      includeAuthors: true,
    },
    {
      repoUrlValidation,
      paginationValidation,
      dateValidation,
      authorValidation,
    }
  ),
  handleValidationErrors,
  ...createCachedRouteHandler(
    'full_data_view',
    async ({ req, repoUrl, logger }) => {
      const { author, authors, fromDate, toDate } = extractFilterParams(
        req.query as Record<string, string>
      );
      const { page, limit, skip } = extractPaginationParams(req.query);

      logger.info('Processing full-data request with unified caching', {
        repoUrl,
        page,
        limit,
        hasFilters: !!(author || authors || fromDate || toDate),
      });

      // Build filter options from query parameters using helper function
      const filters = buildCommitFilters({ author, authors, fromDate, toDate });

      const cacheOptions: CommitCacheOptions = {
        skip,
        limit,
        ...filters,
      };

      // FIX: Fetch sequentially instead of parallel to avoid lock contention
      // When both functions try to acquire overlapping locks in parallel,
      // it can cause cache corruption where commits end up in heatmapData
      const commits = await getCachedCommits(repoUrl, cacheOptions);
      const heatmapData = await getCachedAggregatedData(repoUrl, filters);

      // Defensive check: Ensure heatmapData is actually CommitHeatmapData
      const isValidHeatmap =
        heatmapData &&
        typeof heatmapData === 'object' &&
        !Array.isArray(heatmapData) &&
        'timePeriod' in heatmapData &&
        'data' in heatmapData;

      if (!isValidHeatmap) {
        logger.warn(
          'Invalid heatmap data structure detected, expected CommitHeatmapData',
          {
            repoUrl,
            heatmapDataType: typeof heatmapData,
            isArray: Array.isArray(heatmapData),
            actualType: Array.isArray(heatmapData) ? 'Commit[]' : 'unknown',
          }
        );
      }

      return { commits, heatmapData, page, limit, isValidHeatmap };
    },
    ({ commits, heatmapData, page, limit, isValidHeatmap }) => ({
      commitCount: commits?.length ?? 0,
      dataPoints: isValidHeatmap ? heatmapData.data.length : 0,
      page,
      limit,
      heatmapIsValid: isValidHeatmap,
    })
  )
);

export default router;
