import express, { Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import { gitService } from '../services/gitService';
import redis from '../services/cache';
import { withTempRepository } from '../utils/withTempRepository';
import { handleValidationErrors } from '../middlewares/validation';
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
// Query parameter validation
// ---------------------------------------------------------------------------
const repoUrlValidation = [
  query('repoUrl')
    .isURL({ protocols: ['http', 'https'] })
    .withMessage(ERROR_MESSAGES.INVALID_REPO_URL)
    .matches(/\.git$|github\.com|gitlab\.com|bitbucket\.org/)
    .withMessage(ERROR_MESSAGES.INVALID_REPO_URL),
  query('fromDate').optional().isISO8601(),
  query('toDate').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidationErrors,
];

// ---------------------------------------------------------------------------
// GET /commits - paginated list of commits
// ---------------------------------------------------------------------------
router.get(
  '/',
  repoUrlValidation,
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
      return;
    } catch (error) {
      logger.error('Error fetching commits', { error, repoUrl });
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /commits/heatmap - aggregated commit activity
// ---------------------------------------------------------------------------
router.get(
  '/heatmap',
  repoUrlValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const logger = createRequestLogger(req);
    const { repoUrl, author, authors, fromDate, toDate } = req.query as Record<
      string,
      string
    >;

    const filters: CommitFilterOptions = {
      author: author || undefined,
      authors: authors ? authors.split(',') : undefined,
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
      return;
    } catch (error) {
      logger.error('Error generating heatmap', { error, repoUrl, filters });
      next(error);
    }
  }
);

export default router;
