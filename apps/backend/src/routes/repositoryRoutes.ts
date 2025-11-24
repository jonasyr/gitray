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
    const logger = createRequestLogger(req);
    const { repoUrl } = req.query as Record<string, string>;
    const page = Number.parseInt(req.query.page as string) || 1;
    const limit = Number.parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const userType = getUserType(req);

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

      // Record successful operation
      recordFeatureUsage('repository_commits', userType, true, 'api_call');

      logger.info('Commits retrieved successfully', {
        repoUrl,
        commitCount: commits.length,
        page,
        limit,
      });

      res.status(HTTP_STATUS.OK).json({ commits, page, limit });
    } catch (error) {
      recordFeatureUsage('repository_commits', userType, false, 'api_call');
      logger.error('Failed to retrieve commits', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
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
    const logger = createRequestLogger(req);
    const { repoUrl, author, authors, fromDate, toDate } = req.query as Record<
      string,
      string
    >;
    const userType = getUserType(req);

    try {
      logger.info('Processing heatmap request with unified caching', {
        repoUrl,
        hasFilters: !!(author || authors || fromDate || toDate),
      });

      // Build filter options from query parameters
      const filters: CommitFilterOptions = {
        author: author || undefined,
        authors: authors ? authors.split(',').map((a) => a.trim()) : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      };

      // Use unified cache manager for aggregated data (Level 3 cache)
      const heatmapData = await getCachedAggregatedData(repoUrl, filters);

      // Record successful operation
      recordFeatureUsage('heatmap_view', userType, true, 'api_call');

      logger.info('Heatmap data retrieved successfully', {
        repoUrl,
        dataPoints: heatmapData.data.length,
      });

      res.status(HTTP_STATUS.OK).json({ heatmapData });
    } catch (error) {
      recordFeatureUsage('heatmap_view', userType, false, 'api_call');
      logger.error('Failed to retrieve heatmap data', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
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
    const logger = createRequestLogger(req);
    const { repoUrl, author, authors, fromDate, toDate } = req.query as Record<
      string,
      string
    >;
    const userType = getUserType(req);

    try {
      logger.info('Processing contributors request with unified caching', {
        repoUrl,
        hasFilters: !!(author || authors || fromDate || toDate),
      });

      // Build filter options from query parameters
      const filters: CommitFilterOptions = {
        author: author || undefined,
        authors: authors ? authors.split(',').map((a) => a.trim()) : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      };

      // Use unified cache manager for contributors data
      const contributors = await getCachedContributors(repoUrl, filters);

      // Record successful operation
      recordFeatureUsage('contributors_view', userType, true, 'api_call');

      logger.info('Contributors retrieved successfully', {
        repoUrl,
        contributorCount: contributors.length,
      });

      res.status(HTTP_STATUS.OK).json({ contributors });
    } catch (error) {
      recordFeatureUsage('contributors_view', userType, false, 'api_call');
      logger.error('Failed to retrieve contributors', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
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
    const logger = createRequestLogger(req);
    const { repoUrl, fromDate, toDate, minChanges, extensions } =
      req.query as Record<string, string>;
    const userType = getUserType(req);

    try {
      logger.info('Processing churn analysis request with unified caching', {
        repoUrl,
        hasFilters: !!(fromDate || toDate || minChanges || extensions),
      });

      // Build filter options from query parameters
      const filters: ChurnFilterOptions = {
        since: fromDate || undefined,
        until: toDate || undefined,
        minChanges: minChanges ? Number.parseInt(minChanges) : undefined,
        extensions: extensions
          ? extensions.split(',').map((e) => e.trim())
          : undefined,
      };

      // Use unified cache manager for churn data
      const churnData = await getCachedChurnData(repoUrl, filters);

      // Record successful operation
      recordFeatureUsage('code_churn_view', userType, true, 'api_call');

      logger.info('Churn data retrieved successfully', {
        repoUrl,
        fileCount: churnData.files.length,
      });

      res.status(HTTP_STATUS.OK).json({ churnData });
    } catch (error) {
      recordFeatureUsage('code_churn_view', userType, false, 'api_call');
      logger.error('Failed to retrieve churn data', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
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
    const logger = createRequestLogger(req);
    const { repoUrl } = req.query as Record<string, string>;
    const userType = getUserType(req);

    try {
      logger.info(
        'Processing repository summary request with unified caching',
        {
          repoUrl,
        }
      );

      // Use unified cache manager for summary data
      const summary = await getCachedSummary(repoUrl);

      // Record successful operation
      recordFeatureUsage('repository_summary', userType, true, 'api_call');

      logger.info('Repository summary retrieved successfully', {
        repoUrl,
        repositoryName: summary.repository.name,
      });

      res.status(HTTP_STATUS.OK).json({ summary });
    } catch (error) {
      recordFeatureUsage('repository_summary', userType, false, 'api_call');
      logger.error('Failed to retrieve repository summary', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
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
    const logger = createRequestLogger(req);
    const { repoUrl, author, authors, fromDate, toDate } = req.query as Record<
      string,
      string
    >;
    const page = Number.parseInt(req.query.page as string) || 1;
    const limit = Number.parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const userType = getUserType(req);

    try {
      logger.info('Processing full-data request with unified caching', {
        repoUrl,
        page,
        limit,
        hasFilters: !!(author || authors || fromDate || toDate),
      });

      // Build filter options from query parameters
      const filters: CommitFilterOptions = {
        author: author || undefined,
        authors: authors ? authors.split(',').map((a) => a.trim()) : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      };

      const cacheOptions: CommitCacheOptions = {
        skip,
        limit,
      };

      // Fetch both commits and heatmap data in parallel using unified cache
      const [commits, heatmapData] = await Promise.all([
        getCachedCommits(repoUrl, cacheOptions),
        getCachedAggregatedData(repoUrl, filters),
      ]);

      // Record successful operation
      recordFeatureUsage('full_data_view', userType, true, 'api_call');

      logger.info('Full data retrieved successfully', {
        repoUrl,
        commitCount: commits.length,
        dataPoints: heatmapData.data.length,
        page,
        limit,
      });

      res.status(HTTP_STATUS.OK).json({ commits, heatmapData, page, limit });
    } catch (error) {
      recordFeatureUsage('full_data_view', userType, false, 'api_call');
      logger.error('Failed to retrieve full data', {
        repoUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  }
);

export default router;
