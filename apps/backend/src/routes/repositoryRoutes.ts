import express, { Request, Response, NextFunction } from 'express';
import { query, validationResult, ValidationChain } from 'express-validator';
import {
  getCachedCommits,
  getCachedAggregatedData,
  getCachedContributors,
  getCachedChurnData,
  getCachedSummary,
  type CommitCacheOptions,
} from '../services/repositoryCache';
import { createRequestLogger } from '../services/logger';
import {
  recordFeatureUsage,
  recordEnhancedCacheOperation,
  getUserType,
  getRepositorySizeCategory,
} from '../services/metrics';
import {
  CommitFilterOptions,
  ChurnFilterOptions,
  ERROR_MESSAGES,
  HTTP_STATUS,
  ValidationError,
} from '@gitray/shared-types';
import { isSecureGitUrl } from '../middlewares/validation';
import {
  buildCommitFilters,
  buildChurnFilters,
  extractPaginationParams,
  extractFilterParams,
  setupRouteRequest,
  recordRouteSuccess,
  recordRouteError,
} from '../utils/routeHelpers';

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
// Custom validation error handler
// ---------------------------------------------------------------------------
const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const logger = createRequestLogger(req);
    logger.warn('Validation failed', {
      errors: errors.array(),
      query: req.query,
      path: req.path,
    });

    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: errors.array(),
    });
    return;
  }
  next();
};

// ---------------------------------------------------------------------------
// Reusable validation chains
// ---------------------------------------------------------------------------
const repoUrlValidation = (): ValidationChain[] => [
  query('repoUrl')
    .notEmpty()
    .withMessage('repoUrl query parameter is required')
    .isURL({
      protocols: ['http', 'https'],
      require_protocol: true,
      require_valid_protocol: true,
    })
    .withMessage(ERROR_MESSAGES.INVALID_REPO_URL)
    .custom(isSecureGitUrl)
    .withMessage('Invalid or potentially unsafe repository URL'),
];

const paginationValidation = (): ValidationChain[] => [
  query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Page must be between 1 and 1000')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
];

const dateValidation = (): ValidationChain[] => [
  query('fromDate')
    .optional()
    .isISO8601({ strict: true })
    .withMessage('fromDate must be a valid ISO 8601 date')
    .custom((value) => {
      if (value && new Date(value) > new Date()) {
        return false;
      }
      return true;
    })
    .withMessage('fromDate cannot be in the future'),
  query('toDate')
    .optional()
    .isISO8601({ strict: true })
    .withMessage('toDate must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      if (value && new Date(value) > new Date()) {
        return false;
      }
      const fromDate = req.query?.fromDate as string;
      if (value && fromDate && new Date(value) < new Date(fromDate)) {
        return false;
      }
      return true;
    })
    .withMessage('toDate must be after fromDate and not in the future'),
];

const authorValidation = (): ValidationChain[] => [
  query('author')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Author must be between 1 and 100 characters')
    .escape(),
  query('authors')
    .optional()
    .isString()
    .custom((value) => {
      const authors = value.split(',');
      return (
        authors.length <= 10 &&
        authors.every((a: string) => a.trim().length > 0)
      );
    })
    .withMessage(
      'Authors must be comma-separated and maximum 10 authors allowed'
    ),
];

const churnValidation = (): ValidationChain[] => [
  query('minChanges')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('minChanges must be between 1 and 1000')
    .toInt(),
  query('extensions')
    .optional()
    .isString()
    .custom((value) => {
      const exts = value.split(',');
      return (
        exts.length <= 20 && exts.every((e: string) => e.trim().length > 0)
      );
    })
    .withMessage('Extensions must be comma-separated and maximum 20 allowed'),
];

// ---------------------------------------------------------------------------
// GET endpoint to get repository commits with pagination (unified cache)
// ---------------------------------------------------------------------------
router.get(
  '/commits',
  setRequestPriority('normal'),
  [...repoUrlValidation(), ...paginationValidation()],
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    const { logger, repoUrl, userType } = setupRouteRequest(req);
    const { page, limit, skip } = extractPaginationParams(req.query);

    try {
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

      // Record successful operation with helper
      recordRouteSuccess(
        'repository_commits',
        userType,
        logger,
        repoUrl,
        { commits, page, limit },
        res,
        { commitCount: commits.length, page, limit }
      );
    } catch (error) {
      recordRouteError(
        'repository_commits',
        userType,
        logger,
        repoUrl,
        error,
        next
      );
    }
  }
);

// ---------------------------------------------------------------------------
// GET endpoint to get commit heatmap data with filters (unified cache)
// ---------------------------------------------------------------------------
router.get(
  '/heatmap',
  setRequestPriority('low'),
  [...repoUrlValidation(), ...dateValidation(), ...authorValidation()],
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    const { logger, repoUrl, userType } = setupRouteRequest(req);
    const { author, authors, fromDate, toDate } = extractFilterParams(
      req.query as Record<string, string>
    );

    try {
      logger.info('Processing heatmap request with unified caching', {
        repoUrl,
        hasFilters: !!(author || authors || fromDate || toDate),
      });

      // Build filter options from query parameters using helper function
      const filters = buildCommitFilters({ author, authors, fromDate, toDate });

      // Use unified cache manager for aggregated data (Level 3 cache)
      const heatmapData = await getCachedAggregatedData(repoUrl, filters);

      // Record successful operation with helper
      recordRouteSuccess(
        'heatmap_view',
        userType,
        logger,
        repoUrl,
        { heatmapData },
        res,
        { dataPoints: heatmapData.data.length }
      );
    } catch (error) {
      recordRouteError('heatmap_view', userType, logger, repoUrl, error, next);
    }
  }
);

// ---------------------------------------------------------------------------
// GET endpoint to get repository top contributors with filters (unified cache)
// ---------------------------------------------------------------------------
router.get(
  '/contributors',
  setRequestPriority('normal'),
  [...repoUrlValidation(), ...dateValidation(), ...authorValidation()],
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    const { logger, repoUrl, userType } = setupRouteRequest(req);
    const { author, authors, fromDate, toDate } = extractFilterParams(
      req.query as Record<string, string>
    );

    try {
      logger.info('Processing contributors request with unified caching', {
        repoUrl,
        hasFilters: !!(author || authors || fromDate || toDate),
      });

      // Build filter options from query parameters using helper function
      const filters = buildCommitFilters({ author, authors, fromDate, toDate });

      // Use unified cache manager for contributors data
      const contributors = await getCachedContributors(repoUrl, filters);

      // Record successful operation with helper
      recordRouteSuccess(
        'contributors_view',
        userType,
        logger,
        repoUrl,
        { contributors },
        res,
        { contributorCount: contributors.length }
      );
    } catch (error) {
      recordRouteError(
        'contributors_view',
        userType,
        logger,
        repoUrl,
        error,
        next
      );
    }
  }
);

// ---------------------------------------------------------------------------
// GET endpoint to get code churn analysis with filters (unified cache)
// ---------------------------------------------------------------------------
router.get(
  '/churn',
  setRequestPriority('normal'),
  [...repoUrlValidation(), ...dateValidation(), ...churnValidation()],
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    const { logger, repoUrl, userType } = setupRouteRequest(req);
    const { fromDate, toDate, minChanges, extensions } = req.query as Record<
      string,
      string
    >;

    try {
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

      // Record successful operation with helper
      recordRouteSuccess(
        'code_churn_view',
        userType,
        logger,
        repoUrl,
        { churnData },
        res,
        { fileCount: churnData.files.length }
      );
    } catch (error) {
      recordRouteError(
        'code_churn_view',
        userType,
        logger,
        repoUrl,
        error,
        next
      );
    }
  }
);

// ---------------------------------------------------------------------------
// GET endpoint to get repository summary statistics (unified cache)
// ---------------------------------------------------------------------------
router.get(
  '/summary',
  setRequestPriority('normal'),
  [...repoUrlValidation()],
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    const { logger, repoUrl, userType } = setupRouteRequest(req);

    try {
      logger.info(
        'Processing repository summary request with unified caching',
        {
          repoUrl,
        }
      );

      // Use unified cache manager for summary data
      const summary = await getCachedSummary(repoUrl);

      // Record successful operation with helper
      recordRouteSuccess(
        'repository_summary',
        userType,
        logger,
        repoUrl,
        { summary },
        res,
        { repositoryName: summary.repository.name }
      );
    } catch (error) {
      recordRouteError(
        'repository_summary',
        userType,
        logger,
        repoUrl,
        error,
        next
      );
    }
  }
);

// ---------------------------------------------------------------------------
// GET endpoint to fetch both commits and heatmap data with pagination and filters (unified cache)
// ---------------------------------------------------------------------------
router.get(
  '/full-data',
  setRequestPriority('low'),
  [
    ...repoUrlValidation(),
    ...paginationValidation(),
    ...dateValidation(),
    ...authorValidation(),
  ],
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    const { logger, repoUrl, userType } = setupRouteRequest(req);
    const { author, authors, fromDate, toDate } = extractFilterParams(
      req.query as Record<string, string>
    );
    const { page, limit, skip } = extractPaginationParams(req.query);

    try {
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

      // Record successful operation with helper
      recordRouteSuccess(
        'full_data_view',
        userType,
        logger,
        repoUrl,
        { commits, heatmapData, page, limit },
        res,
        {
          commitCount: commits?.length ?? 0,
          dataPoints: isValidHeatmap ? heatmapData.data.length : 0,
          page,
          limit,
          heatmapIsValid: isValidHeatmap,
        }
      );
    } catch (error) {
      recordRouteError(
        'full_data_view',
        userType,
        logger,
        repoUrl,
        error,
        next
      );
    }
  }
);

export default router;
