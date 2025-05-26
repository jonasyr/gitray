import express, { Request, Response, NextFunction } from 'express';
import { gitService } from '../services/gitService';
import redis from '../services/cache';
import { body } from 'express-validator';
import { handleValidationErrors } from '../middlewares/validation';
import { withTempRepository } from '../utils/withTempRepository';
import {
  ERROR_MESSAGES,
  HTTP_STATUS,
  CommitFilterOptions,
  TIME,
} from '@gitray/shared-types';

const router = express.Router();

// Validation rules
const repoUrlValidation = [
  body('repoUrl')
    .isURL({ protocols: ['http', 'https'] })
    .withMessage(ERROR_MESSAGES.INVALID_REPO_URL)
    .matches(/\.git$|github\.com|gitlab\.com|bitbucket\.org/)
    .withMessage(ERROR_MESSAGES.INVALID_REPO_URL),
  handleValidationErrors,
];

const heatmapValidation = [
  ...repoUrlValidation,
  body('filterOptions')
    .optional()
    .isObject()
    .withMessage('filterOptions must be an object'),
  handleValidationErrors,
];
const fullDataValidation = heatmapValidation;

// POST endpoint to get repository data (commits and heatmap in a single call)
router.post(
  '/',
  repoUrlValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl } = req.body;
    try {
      const cacheKey = `commits:${repoUrl}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.status(HTTP_STATUS.OK).json({ commits: JSON.parse(cached) });
        return;
      }
      const commits = await withTempRepository(repoUrl, (tempDir) =>
        gitService.getCommits(tempDir)
      );
      await redis.set(
        cacheKey,
        JSON.stringify(commits),
        'EX',
        TIME.HOUR / 1000
      );
      res.status(HTTP_STATUS.OK).json({ commits });
      return;
    } catch (error) {
      next(error);
    }
  }
);

// POST endpoint to get commit heatmap data
router.post(
  '/heatmap',
  heatmapValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl, filterOptions } = req.body;

    try {
      const cacheKey = `heatmap:${repoUrl}:${JSON.stringify(filterOptions)}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.status(HTTP_STATUS.OK).json({ heatmapData: JSON.parse(cached) });
        return;
      }
      const heatmapData = await withTempRepository(repoUrl, async (tempDir) => {
        const commits = await gitService.getCommits(tempDir);
        return gitService.aggregateCommitsByTime(
          commits,
          filterOptions as CommitFilterOptions
        );
      });
      await redis.set(
        cacheKey,
        JSON.stringify(heatmapData),
        'EX',
        TIME.HOUR / 1000
      );
      res.status(HTTP_STATUS.OK).json({ heatmapData });
      return;
    } catch (error) {
      next(error);
    }
  }
);

// NEW ENDPOINT: Get both commits and heatmap data in a single request
router.post(
  '/full-data',
  fullDataValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl, filterOptions } = req.body;

    try {
      const commitsKey = `commits:${repoUrl}`;
      const heatmapKey = `heatmap:${repoUrl}:${JSON.stringify(filterOptions)}`;
      const cachedCommits = await redis.get(commitsKey);
      const cachedHeatmap = await redis.get(heatmapKey);
      if (cachedCommits && cachedHeatmap) {
        res.status(HTTP_STATUS.OK).json({
          commits: JSON.parse(cachedCommits),
          heatmapData: JSON.parse(cachedHeatmap),
        });
        return;
      }
      const { commits, heatmapData } = await withTempRepository(
        repoUrl,
        async (tempDir) => {
          const commits = await gitService.getCommits(tempDir);
          const heatmapData = await gitService.aggregateCommitsByTime(
            commits,
            filterOptions as CommitFilterOptions
          );
          return { commits, heatmapData };
        }
      );
      await redis.set(
        commitsKey,
        JSON.stringify(commits),
        'EX',
        TIME.HOUR / 1000
      );
      await redis.set(
        heatmapKey,
        JSON.stringify(heatmapData),
        'EX',
        TIME.HOUR / 1000
      );
      res.status(HTTP_STATUS.OK).json({ commits, heatmapData });
      return;
    } catch (error) {
      next(error);
    }
  }
);

export default router;
