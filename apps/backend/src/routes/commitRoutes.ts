import express, { Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import { gitService } from '../services/gitService';
import redis from '../services/cache';
import { withTempRepository } from '../utils/withTempRepository';
import { handleValidationErrors } from '../middlewares/validation';
import {
  CommitFilterOptions,
  ERROR_MESSAGES,
  HTTP_STATUS,
  TIME,
} from '@gitray/shared-types';

const router = express.Router();

// Validation rules for query parameters
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

// GET /api/commits?repoUrl=...&page=...&limit=...
router.get(
  '/',
  repoUrlValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl } = req.query as Record<string, string>;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    try {
      const cacheKey = `commits:${repoUrl}:${page}:${limit}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.status(HTTP_STATUS.OK).json(JSON.parse(cached));
        return;
      }
      const commits = await withTempRepository(repoUrl, (tempDir) =>
        gitService.getCommits(tempDir, { skip, limit })
      );
      const result = { commits, page, limit };
      await redis.set(cacheKey, JSON.stringify(result), 'EX', TIME.HOUR / 1000);
      res.status(HTTP_STATUS.OK).json(result);
      return;
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/commits/heatmap?repoUrl=...&author=...&fromDate=...&toDate=...
router.get(
  '/heatmap',
  repoUrlValidation,
  async (req: Request, res: Response, next: NextFunction) => {
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
        res.status(HTTP_STATUS.OK).json(JSON.parse(cached));
        return;
      }
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
      res.status(HTTP_STATUS.OK).json(heatmapData);
      return;
    } catch (error) {
      next(error);
    }
  }
);

export default router;
