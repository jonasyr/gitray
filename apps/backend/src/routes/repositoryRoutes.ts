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
  ChurnFilterOptions,
} from '@gitray/shared-types';
import {
  recordFeatureUsage,
  recordEnhancedCacheOperation,
  recordDataFreshness,
  getUserType,
  getRepositorySizeCategory,
} from '../services/metrics';

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
  setRequestPriority('normal'), // Normal priority for basic commit data
  repoUrlValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl } = req.body;
    const userType = getUserType(req);

    try {
      const cacheKey = `commits:${repoUrl}`;
      let cached = null;
      let commits = null;

      // Try to get from cache, but handle cache failures gracefully
      try {
        cached = await redis.get(cacheKey);
        if (cached) {
          commits = JSON.parse(cached);
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
      } catch (cacheError) {
        // Cache operation failed, continue to fetch from repository
        console.warn(
          'Cache get operation failed:',
          (cacheError as Error).message
        );
      }

      commits ??= await withTempRepository(repoUrl, (tempDir) =>
        gitService.getCommits(tempDir)
      );

      // Record cache miss and successful operation
      recordEnhancedCacheOperation(
        'commits',
        false,
        req,
        repoUrl,
        commits ? commits.length : 0
      );
      recordFeatureUsage('repository_commits', userType, true, 'api_call');

      // Try to cache the result, but don't fail if cache operation fails
      if (commits) {
        try {
          await redis.set(
            cacheKey,
            JSON.stringify(commits),
            'EX',
            TIME.HOUR / 1000
          );
        } catch (cacheError) {
          console.warn(
            'Cache set operation failed:',
            (cacheError as Error).message
          );
        }
      }

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
  setRequestPriority('low'), // Low priority for heatmap data - memory intensive
  heatmapValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl, filterOptions } = req.body;
    const userType = getUserType(req);

    try {
      const cacheKey = `heatmap:${repoUrl}:${JSON.stringify(filterOptions)}`;
      let cached = null;
      let heatmapData = null;

      // Try to get from cache, but handle cache failures gracefully
      try {
        cached = await redis.get(cacheKey);
        if (cached) {
          heatmapData = JSON.parse(cached);
          // Record enhanced cache hit and feature usage
          recordEnhancedCacheOperation('heatmap', true, req, repoUrl);
          recordFeatureUsage('heatmap_view', userType, true, 'api_call');
          recordDataFreshness('heatmap', 0, 'hybrid');

          res.status(HTTP_STATUS.OK).json({ heatmapData });
          return;
        }
      } catch (cacheError) {
        // Cache operation failed, continue to fetch from repository
        console.warn(
          'Cache get operation failed:',
          (cacheError as Error).message
        );
      }

      heatmapData ??= await withTempRepository(repoUrl, async (tempDir) => {
        const commits = await gitService.getCommits(tempDir);
        return gitService.aggregateCommitsByTime(
          commits,
          filterOptions as CommitFilterOptions
        );
      });

      // Record cache miss and successful operation
      recordEnhancedCacheOperation('heatmap', false, req, repoUrl);
      recordFeatureUsage('heatmap_view', userType, true, 'api_call');

      // Try to cache the result, but don't fail if cache operation fails
      if (heatmapData) {
        try {
          await redis.set(
            cacheKey,
            JSON.stringify(heatmapData),
            'EX',
            TIME.HOUR / 1000
          );
        } catch (cacheError) {
          console.warn(
            'Cache set operation failed:',
            (cacheError as Error).message
          );
        }
      }

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
// POST endpoint to get repository top contributors
// ---------------------------------------------------------------------------
router.post(
  '/contributors',
  setRequestPriority('normal'), // Normal priority for contributor data
  repoUrlValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl, filterOptions } = req.body;
    const userType = getUserType(req);

    try {
      const cacheKey = `contributors:${repoUrl}:${JSON.stringify(filterOptions || {})}`;
      let cached = null;
      let contributors = null;

      // Try to get from cache, but handle cache failures gracefully
      try {
        cached = await redis.get(cacheKey);
        if (cached) {
          contributors = JSON.parse(cached);
          // Record enhanced cache operation and feature usage
          recordEnhancedCacheOperation(
            'contributors',
            true,
            req,
            repoUrl,
            contributors.length
          );
          recordFeatureUsage('contributors_view', userType, true, 'api_call');
          recordDataFreshness('contributors', 0, 'hybrid');

          res.status(HTTP_STATUS.OK).json({ contributors });
          return;
        }
      } catch (cacheError) {
        // Cache operation failed, continue to fetch from repository
        console.warn(
          'Cache get operation failed:',
          (cacheError as Error).message
        );
      }

      // Fetch contributors using the service layer
      contributors ??= await withTempRepository(repoUrl, (tempDir) =>
        gitService.getTopContributors(
          tempDir,
          filterOptions as CommitFilterOptions
        )
      );

      // Record cache miss and successful operation
      recordEnhancedCacheOperation(
        'contributors',
        false,
        req,
        repoUrl,
        contributors ? contributors.length : 0
      );
      recordFeatureUsage('contributors_view', userType, true, 'api_call');

      // Try to cache the result, but don't fail if cache operation fails
      if (contributors) {
        try {
          await redis.set(
            cacheKey,
            JSON.stringify(contributors),
            'EX',
            TIME.HOUR / 1000
          );
        } catch (cacheError) {
          console.warn(
            'Cache set operation failed:',
            (cacheError as Error).message
          );
        }
      }

      res.status(HTTP_STATUS.OK).json({ contributors });
      return;
    } catch (error) {
      // Record failed feature usage
      recordFeatureUsage('contributors_view', userType, false, 'api_call');
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST endpoint to get code churn analysis (file change frequency)
// ---------------------------------------------------------------------------
router.post(
  '/churn',
  setRequestPriority('normal'), // Normal priority for churn analysis
  repoUrlValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl, filterOptions } = req.body;
    const userType = getUserType(req);

    try {
      const cacheKey = `churn:${repoUrl}:${JSON.stringify(filterOptions || {})}`;
      let cached = null;
      let churnData = null;

      // Try to get from cache, but handle cache failures gracefully
      try {
        cached = await redis.get(cacheKey);
        if (cached) {
          churnData = JSON.parse(cached);
          // Mark as from cache
          churnData.metadata.fromCache = true;

          // Record enhanced cache operation and feature usage
          recordEnhancedCacheOperation(
            'churn',
            true,
            req,
            repoUrl,
            churnData.files.length
          );
          recordFeatureUsage('code_churn_view', userType, true, 'api_call');
          recordDataFreshness('churn', 0, 'hybrid');

          res.status(HTTP_STATUS.OK).json({ churnData });
          return;
        }
      } catch (cacheError) {
        // Cache operation failed, continue to fetch from repository
        console.warn(
          'Cache get operation failed:',
          (cacheError as Error).message
        );
      }

      // Fetch churn data using the service layer
      churnData ??= await withTempRepository(repoUrl, (tempDir) =>
        gitService.analyzeCodeChurn(
          tempDir,
          filterOptions as ChurnFilterOptions
        )
      );

      // Record cache miss and successful operation
      recordEnhancedCacheOperation(
        'churn',
        false,
        req,
        repoUrl,
        churnData ? churnData.files.length : 0
      );
      recordFeatureUsage('code_churn_view', userType, true, 'api_call');

      // Try to cache the result, but don't fail if cache operation fails
      if (churnData) {
        try {
          // Cache for 1 hour (code churn changes less frequently than commits)
          await redis.set(
            cacheKey,
            JSON.stringify(churnData),
            'EX',
            TIME.HOUR / 1000
          );
        } catch (cacheError) {
          console.warn(
            'Cache set operation failed:',
            (cacheError as Error).message
          );
        }
      }

      res.status(HTTP_STATUS.OK).json({ churnData });
      return;
    } catch (error) {
      // Record failed feature usage
      recordFeatureUsage('code_churn_view', userType, false, 'api_call');
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// POST endpoint to fetch both commits and heatmap data in a single request
// ---------------------------------------------------------------------------
router.post(
  '/full-data',
  setRequestPriority('low'), // Low priority for full data - very memory intensive
  fullDataValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const { repoUrl, filterOptions } = req.body;
    const userType = getUserType(req);

    try {
      const commitsKey = `commits:${repoUrl}`;
      const heatmapKey = `heatmap:${repoUrl}:${JSON.stringify(filterOptions)}`;
      let cachedCommits = null;
      let cachedHeatmap = null;

      // Try to get from cache, but handle cache failures gracefully
      try {
        cachedCommits = await redis.get(commitsKey);
        cachedHeatmap = await redis.get(heatmapKey);
      } catch (cacheError) {
        // Cache operation failed, continue to fetch from repository
        console.warn(
          'Cache get operation failed:',
          (cacheError as Error).message
        );
      }

      if (cachedCommits && cachedHeatmap) {
        let commits, heatmapData;
        try {
          commits = JSON.parse(cachedCommits);
          heatmapData = JSON.parse(cachedHeatmap);

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
        } catch (parseError) {
          // Corrupted cache data, continue to fetch from repository
          console.warn(
            'Cache data parsing failed:',
            (parseError as Error).message
          );
        }
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
        commits ? commits.length : 0
      );
      recordEnhancedCacheOperation('heatmap', false, req, repoUrl);
      recordFeatureUsage('full_data_view', userType, true, 'api_call');

      // Try to cache the results, but don't fail if cache operations fail
      if (commits) {
        try {
          await redis.set(
            commitsKey,
            JSON.stringify(commits),
            'EX',
            TIME.HOUR / 1000
          );
        } catch (cacheError) {
          console.warn(
            'Cache set operation failed for commits:',
            (cacheError as Error).message
          );
        }
      }

      if (heatmapData) {
        try {
          await redis.set(
            heatmapKey,
            JSON.stringify(heatmapData),
            'EX',
            TIME.HOUR / 1000
          );
        } catch (cacheError) {
          console.warn(
            'Cache set operation failed for heatmap:',
            (cacheError as Error).message
          );
        }
      }

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
