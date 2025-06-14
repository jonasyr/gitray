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
import {
  recordFeatureUsage,
  recordEnhancedCacheOperation,
  recordDataFreshness,
  getUserType,
  getRepositorySizeCategory,
} from '../services/metrics';

// Router handling repository related endpoints
const router = express.Router();

// ---------------------------------------------------------------------------
// Validation rules
// ---------------------------------------------------------------------------
const repoUrlValidation = [
  body('repoUrl')
    .isURL({ protocols: ['http', 'https'] })
    .withMessage(ERROR_MESSAGES.INVALID_REPO_URL)
    .matches(/\.git$|github\.com|gitlab\.com|bitbucket\.org/)
    .withMessage(ERROR_MESSAGES.INVALID_REPO_URL),
  handleValidationErrors,
];

// Additional validation for heatmap and full-data routes
const heatmapValidation = [
  ...repoUrlValidation,
  body('filterOptions')
    .optional()
    .isObject()
    .withMessage('filterOptions must be an object'),
  handleValidationErrors,
];
const fullDataValidation = heatmapValidation;

// ---------------------------------------------------------------------------
// POST endpoint to get repository commit data only
// ---------------------------------------------------------------------------
router.post(
  '/',
  repoUrlValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl } = req.body;
    const userType = getUserType(req);

    try {
      const cacheKey = `commits:${repoUrl}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        const commits = JSON.parse(cached);
        // Record enhanced cache operation and feature usage
        recordEnhancedCacheOperation(
          'commits',
          true,
          req,
          repoUrl,
          commits.length
        );
        recordFeatureUsage('repository_commits', userType, true, 'api_call');
        recordDataFreshness(
          'commits',
          0,
          'hybrid',
          getRepositorySizeCategory(commits.length)
        );

        res.status(HTTP_STATUS.OK).json({ commits });
        return;
      }

      const commits = await withTempRepository(repoUrl, (tempDir) =>
        gitService.getCommits(tempDir)
      );

      // Record cache miss and successful operation
      recordEnhancedCacheOperation(
        'commits',
        false,
        req,
        repoUrl,
        commits.length
      );
      recordFeatureUsage('repository_commits', userType, true, 'api_call');

      await redis.set(
        cacheKey,
        JSON.stringify(commits),
        'EX',
        TIME.HOUR / 1000
      );
      res.status(HTTP_STATUS.OK).json({ commits });
      return;
    } catch (error) {
      // Record failed feature usage
      recordFeatureUsage('repository_commits', userType, false, 'api_call');
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST endpoint to get commit heatmap data
// ---------------------------------------------------------------------------
router.post(
  '/heatmap',
  heatmapValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl, filterOptions } = req.body;
    const userType = getUserType(req);

    try {
      const cacheKey = `heatmap:${repoUrl}:${JSON.stringify(filterOptions)}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        const heatmapData = JSON.parse(cached);
        // Record enhanced cache hit and feature usage
        recordEnhancedCacheOperation('heatmap', true, req, repoUrl);
        recordFeatureUsage('heatmap_view', userType, true, 'api_call');
        recordDataFreshness('heatmap', 0, 'hybrid');

        res.status(HTTP_STATUS.OK).json({ heatmapData });
        return;
      }

      const heatmapData = await withTempRepository(repoUrl, async (tempDir) => {
        const commits = await gitService.getCommits(tempDir);
        return gitService.aggregateCommitsByTime(
          commits,
          filterOptions as CommitFilterOptions
        );
      });

      // Record cache miss and successful operation
      recordEnhancedCacheOperation('heatmap', false, req, repoUrl);
      recordFeatureUsage('heatmap_view', userType, true, 'api_call');

      await redis.set(
        cacheKey,
        JSON.stringify(heatmapData),
        'EX',
        TIME.HOUR / 1000
      );
      res.status(HTTP_STATUS.OK).json({ heatmapData });
      return;
    } catch (error) {
      // Record failed feature usage
      recordFeatureUsage('heatmap_view', userType, false, 'api_call');
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST endpoint to fetch both commits and heatmap data in a single request
// ---------------------------------------------------------------------------
router.post(
  '/full-data',
  fullDataValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl, filterOptions } = req.body;
    const userType = getUserType(req);

    try {
      const commitsKey = `commits:${repoUrl}`;
      const heatmapKey = `heatmap:${repoUrl}:${JSON.stringify(filterOptions)}`;
      const cachedCommits = await redis.get(commitsKey);
      const cachedHeatmap = await redis.get(heatmapKey);

      if (cachedCommits && cachedHeatmap) {
        const commits = JSON.parse(cachedCommits);
        const heatmapData = JSON.parse(cachedHeatmap);

        // Record enhanced cache operations for both data types
        recordEnhancedCacheOperation(
          'commits',
          true,
          req,
          repoUrl,
          commits.length
        );
        recordEnhancedCacheOperation('heatmap', true, req, repoUrl);
        recordFeatureUsage('full_data_view', userType, true, 'api_call');
        recordDataFreshness(
          'combined',
          0,
          'hybrid',
          getRepositorySizeCategory(commits.length)
        );

        res.status(HTTP_STATUS.OK).json({ commits, heatmapData });
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

      // Record cache miss and successful operation
      recordEnhancedCacheOperation(
        'commits',
        false,
        req,
        repoUrl,
        commits.length
      );
      recordEnhancedCacheOperation('heatmap', false, req, repoUrl);
      recordFeatureUsage('full_data_view', userType, true, 'api_call');

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
      // Record failed feature usage
      recordFeatureUsage('full_data_view', userType, false, 'api_call');
      next(error);
    }
  }
);

export default router;
