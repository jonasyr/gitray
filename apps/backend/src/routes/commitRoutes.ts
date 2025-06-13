import express, { Request, Response, NextFunction } from 'express';
import { query, validationResult, ValidationChain } from 'express-validator';
import { gitService } from '../services/gitService';
import redis from '../services/cache';
import { withTempRepository } from '../utils/withTempRepository';
import { createRequestLogger } from '../services/logger';
import { cacheHits, cacheMisses } from '../services/metrics';
import {
  CommitFilterOptions,
  ERROR_MESSAGES,
  HTTP_STATUS,
  TIME,
} from '@gitray/shared-types';

// Router serving commit related data
const router = express.Router();

// ---------------------------------------------------------------------------
// Custom validation error handler that formats errors correctly
// ---------------------------------------------------------------------------
const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Log validation errors for debugging
    const logger = createRequestLogger(req);
    logger.warn('Validation failed', {
      errors: errors.array(),
      query: req.query,
      path: req.path,
    });

    // Return the expected error format
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
    });
    return;
  }
  next();
};

// ---------------------------------------------------------------------------
// Reusable validation chains with comprehensive security checks
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
    .matches(/\.git$|github\.com|gitlab\.com|bitbucket\.org/)
    .withMessage(ERROR_MESSAGES.INVALID_REPO_URL)
    // Additional security: prevent URL injection attacks
    .custom((value) => {
      try {
        const url = new URL(value);
        // Prevent localhost/private network access in production
        if (process.env.NODE_ENV === 'production') {
          const hostname = url.hostname.toLowerCase();
          if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('172.')
          ) {
            return false;
          }
        }
        return true;
      } catch {
        return false;
      }
    })
    .withMessage('Invalid repository URL'),
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
      // Ensure fromDate is not in the future
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
      // Ensure toDate is not in the future
      if (value && new Date(value) > new Date()) {
        return false;
      }
      // Ensure toDate is after fromDate if both are provided
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
    // Sanitize to prevent XSS
    .escape(),
  query('authors')
    .optional()
    .isString()
    .custom((value) => {
      // Validate comma-separated authors
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

// ---------------------------------------------------------------------------
// GET / - paginated list of commits
// ---------------------------------------------------------------------------
router.get(
  '/',
  [...repoUrlValidation(), ...paginationValidation()],
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    const logger = createRequestLogger(req);
    const { repoUrl } = req.query as Record<string, string>;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    try {
      const cacheKey = `commits:${repoUrl}:${page}:${limit}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        cacheHits.inc({ operation: 'commits' });
        res.setHeader('X-Cache-Status', 'HIT');
        logger.info('Cache hit for commits', { repoUrl, page, limit });
        res.status(HTTP_STATUS.OK).json(JSON.parse(cached));
        return;
      }

      cacheMisses.inc({ operation: 'commits' });
      res.setHeader('X-Cache-Status', 'MISS');

      const commits = await withTempRepository(repoUrl, (tempDir) =>
        gitService.getCommits(tempDir, { skip, limit })
      );

      const result = { commits, page, limit };
      await redis.set(cacheKey, JSON.stringify(result), 'EX', TIME.HOUR / 1000);

      logger.info('Fetched commits from repository', {
        repoUrl,
        page,
        limit,
        count: commits.length,
      });
      res.status(HTTP_STATUS.OK).json(result);
    } catch (error) {
      logger.error('Error fetching commits', { error, repoUrl });
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /heatmap - aggregated commit activity
// ---------------------------------------------------------------------------
router.get(
  '/heatmap',
  [...repoUrlValidation(), ...dateValidation(), ...authorValidation()],
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    const logger = createRequestLogger(req);
    const { repoUrl, author, authors, fromDate, toDate } = req.query as Record<
      string,
      string
    >;

    const filters: CommitFilterOptions = {
      author: author || undefined,
      authors: authors ? authors.split(',').map((a) => a.trim()) : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    };

    try {
      const cacheKey = `heatmap:${repoUrl}:${JSON.stringify(filters)}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        cacheHits.inc({ operation: 'heatmap' });
        res.setHeader('X-Cache-Status', 'HIT');
        logger.info('Cache hit for heatmap', { repoUrl, filters });
        res.status(HTTP_STATUS.OK).json(JSON.parse(cached));
        return;
      }

      cacheMisses.inc({ operation: 'heatmap' });
      res.setHeader('X-Cache-Status', 'MISS');

      const heatmapData = await withTempRepository(repoUrl, async (tempDir) => {
        const commits = await gitService.getCommits(tempDir);
        return gitService.aggregateCommitsByTime(commits, filters);
      });

      await redis.set(
        cacheKey,
        JSON.stringify(heatmapData),
        'EX',
        TIME.HOUR / 1000
      );

      logger.info('Generated heatmap data', { repoUrl, filters });
      res.status(HTTP_STATUS.OK).json(heatmapData);
    } catch (error) {
      logger.error('Error generating heatmap', { error, repoUrl, filters });
      next(error);
    }
  }
);

export default router;
