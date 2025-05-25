import express, { Request, Response, NextFunction } from 'express';
import { gitService } from '../services/gitService';
import { body } from 'express-validator';
import { handleValidationErrors } from '../middlewares/validation';
import { withTempRepository } from '../utils/withTempRepository';
import {
  ERROR_MESSAGES,
  HTTP_STATUS,
  CommitFilterOptions,
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
      const commits = await withTempRepository(repoUrl, (tempDir) =>
        gitService.getCommits(tempDir)
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
      const heatmapData = await withTempRepository(repoUrl, async (tempDir) => {
        const commits = await gitService.getCommits(tempDir);
        return gitService.aggregateCommitsByTime(
          commits,
          filterOptions as CommitFilterOptions
        );
      });
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
      res.status(HTTP_STATUS.OK).json({ commits, heatmapData });
      return;
    } catch (error) {
      next(error);
    }
  }
);

export default router;
