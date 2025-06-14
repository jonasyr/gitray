import express, { Request, Response, NextFunction } from 'express';
import {
  query,
  body,
  validationResult,
  ValidationChain,
} from 'express-validator';
import { gitService } from '../services/gitService';
import {
  getCachedCommits,
  getCachedAggregatedData,
  getRepositoryCacheStats,
  repositoryCache,
  type CommitCacheOptions,
} from '../services/repositoryCache';
import {
  withTempRepositoryStreaming,
  getRepositoryInfo,
  invalidateRepositoryCache,
  getCoordinationMetrics,
  getRepositoryStatus,
} from '../utils/withTempRepository';
import { createRequestLogger } from '../services/logger';
import {
  // cacheHits,
  // cacheMisses,
  recordStreamingBatch,
  // getRepositorySizeCategory,
} from '../services/metrics';
import {
  CommitFilterOptions,
  ERROR_MESSAGES,
  HTTP_STATUS,
  // TIME,
} from '@gitray/shared-types';
import { config } from '../config';

// Router serving commit related data with unified caching
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
// ENHANCED: GET / - paginated list of commits with unified caching
// ---------------------------------------------------------------------------
router.get(
  '/',
  [...repoUrlValidation(), ...paginationValidation()],
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    const logger = createRequestLogger(req);
    const { repoUrl, useStreaming } = req.query as Record<string, string>;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const forceStreaming = useStreaming === 'true';
    const skip = (page - 1) * limit;

    const startTime = Date.now();

    try {
      logger.info('Processing commits request with unified caching', {
        repoUrl,
        page,
        limit,
        forceStreaming,
        coordinationEnabled: config.repositoryCache?.enabled,
      });

      // Prepare cache options for hierarchical caching
      const cacheOptions: CommitCacheOptions = {
        skip,
        limit,
      };

      // Use unified cache manager (handles all three cache levels automatically)
      const commits = await getCachedCommits(repoUrl, cacheOptions);

      // Determine if streaming was used (check from repository info)
      let streamingUsed = false;
      let repositorySize = 'unknown';

      try {
        const repoInfo = await getRepositoryInfo(repoUrl);
        streamingUsed = repoInfo.shouldUseStreaming || forceStreaming;
        repositorySize = repoInfo.sizeCategory;

        // Set repository size header for client optimization
        res.setHeader('X-Repository-Size', repositorySize);
        res.setHeader(
          'X-Repository-Cached',
          repoInfo.cached ? 'true' : 'false'
        );
        res.setHeader(
          'X-Repository-Shared',
          repoInfo.isShared ? 'true' : 'false'
        );
      } catch (repoInfoError) {
        logger.warn('Failed to get repository info', {
          repoUrl,
          error: repoInfoError,
        });
      }

      const result = {
        commits,
        page,
        limit,
        streamingUsed,
        totalCommits: commits.length,
        metadata: {
          repositorySize,
          cacheStrategy: 'unified_hierarchical',
          processingTime: Date.now() - startTime,
        },
      };

      // Set cache status header based on cache performance
      const cacheStats = getRepositoryCacheStats() || {
        hitRatios: {
          rawCommits: 0,
          filteredCommits: 0,
          aggregatedData: 0,
          overall: 0,
        },
      };
      const overallHitRatio = cacheStats.hitRatios.overall;

      if (overallHitRatio > 0.8) {
        res.setHeader('X-Cache-Status', 'HIT');
        res.setHeader('X-Cache-Level', 'UNIFIED');
      } else if (overallHitRatio > 0.3) {
        res.setHeader('X-Cache-Status', 'PARTIAL');
        res.setHeader('X-Cache-Level', 'MULTI_TIER');
      } else {
        res.setHeader('X-Cache-Status', 'MISS');
        res.setHeader('X-Cache-Level', 'SOURCE');
      }

      res.setHeader('X-Cache-Hit-Ratio', overallHitRatio.toFixed(3));

      logger.info('Commits request completed via unified caching', {
        repoUrl,
        page,
        limit,
        commitsReturned: commits.length,
        streamingUsed,
        repositorySize,
        processingTime: Date.now() - startTime,
        hitRatio: overallHitRatio,
      });

      res.status(HTTP_STATUS.OK).json(result);
    } catch (error) {
      logger.error('Error fetching commits via unified cache', {
        error,
        repoUrl,
        page,
        limit,
      });
      console.error('Commits route error:', error); // DEBUG: print error in test
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// ENHANCED: GET /heatmap - aggregated commit activity with unified caching
// ---------------------------------------------------------------------------
router.get(
  '/heatmap',
  [...repoUrlValidation(), ...dateValidation(), ...authorValidation()],
  handleValidationErrors,
  async (req: Request, res: Response, next: NextFunction) => {
    const logger = createRequestLogger(req);
    const { repoUrl, author, authors, fromDate, toDate, useStreaming } =
      req.query as Record<string, string>;
    const forceStreaming = useStreaming === 'true';

    const startTime = Date.now();

    const filters: CommitFilterOptions = {
      author: author || undefined,
      authors: authors ? authors.split(',').map((a) => a.trim()) : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    };

    try {
      logger.info('Processing heatmap request with unified caching', {
        repoUrl,
        filters,
        forceStreaming,
        coordinationEnabled: config.repositoryCache?.enabled,
      });

      // Use unified cache manager for aggregated data (Level 3 cache)
      const heatmapData = await getCachedAggregatedData(repoUrl, filters);

      // Get repository information for metadata
      let repositoryInfo;
      try {
        repositoryInfo = await getRepositoryInfo(repoUrl);
        res.setHeader('X-Repository-Size', repositoryInfo.sizeCategory);
        res.setHeader(
          'X-Repository-Cached',
          repositoryInfo.cached ? 'true' : 'false'
        );
        res.setHeader(
          'X-Repository-Shared',
          repositoryInfo.isShared ? 'true' : 'false'
        );
      } catch (repoInfoError) {
        logger.warn('Failed to get repository info for heatmap', {
          repoUrl,
          error: repoInfoError,
        });
      }

      // Enhanced metadata with coordination information
      const enhancedHeatmapData = {
        ...heatmapData,
        metadata: {
          ...heatmapData.metadata,
          filterOptions: filters,
          streamingUsed:
            forceStreaming || (repositoryInfo?.shouldUseStreaming ?? false),
          repositorySize: repositoryInfo?.sizeCategory || 'unknown',
          cacheStrategy: 'unified_hierarchical',
          processingTime: Date.now() - startTime,
          coordinationMetrics: config.repositoryCache?.enabled
            ? getCoordinationMetrics()
            : null,
        },
      };

      // Set cache status headers
      const cacheStats = getRepositoryCacheStats() || {
        hitRatios: {
          aggregatedData: 0,
          filteredCommits: 0,
          rawCommits: 0,
          overall: 0,
        },
      };
      const aggregatedHitRatio = cacheStats.hitRatios.aggregatedData;

      if (aggregatedHitRatio > 0.8) {
        res.setHeader('X-Cache-Status', 'HIT');
        res.setHeader('X-Cache-Level', 'AGGREGATED');
      } else if (cacheStats.hitRatios.filteredCommits > 0.5) {
        res.setHeader('X-Cache-Status', 'PARTIAL');
        res.setHeader('X-Cache-Level', 'FILTERED');
      } else if (cacheStats.hitRatios.rawCommits > 0.3) {
        res.setHeader('X-Cache-Status', 'PARTIAL');
        res.setHeader('X-Cache-Level', 'RAW');
      } else {
        res.setHeader('X-Cache-Status', 'MISS');
        res.setHeader('X-Cache-Level', 'SOURCE');
      }

      res.setHeader(
        'X-Cache-Hit-Ratio',
        cacheStats.hitRatios.overall.toFixed(3)
      );

      logger.info('Heatmap request completed via unified caching', {
        repoUrl,
        filters,
        dataPoints: heatmapData.data.length,
        totalCommits: heatmapData.metadata?.totalCommits || 0,
        repositorySize: repositoryInfo?.sizeCategory,
        processingTime: Date.now() - startTime,
        hitRatio: cacheStats.hitRatios.overall,
      });

      res.status(HTTP_STATUS.OK).json(enhancedHeatmapData);
    } catch (error) {
      logger.error('Error generating heatmap via unified cache', {
        error,
        repoUrl,
        filters,
      });
      console.error('Heatmap route error:', error); // DEBUG: print error in test
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// ENHANCED: GET /info - Repository information with coordination metrics
// ---------------------------------------------------------------------------
router.get(
  '/info',
  [
    query('repoUrl')
      .isURL({ protocols: ['http', 'https'] })
      .withMessage(ERROR_MESSAGES.INVALID_REPO_URL),
    handleValidationErrors,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const logger = createRequestLogger(req);
    const { repoUrl } = req.query as Record<string, string>;

    try {
      const startTime = Date.now();

      // Get repository information (uses coordination)
      const info = await getRepositoryInfo(repoUrl);

      // Get current cache statistics
      const cacheStats = getRepositoryCacheStats();
      const coordinationMetrics = getCoordinationMetrics();

      const result = {
        ...info,
        streamingConfig: {
          enabled: config.streaming.enabled,
          threshold: config.streaming.commitThreshold,
          defaultBatchSize: config.streaming.batchSize,
        },
        cacheInfo: {
          hierarchicalCaching: config.cacheStrategy.hierarchicalCaching,
          coordination: {
            enabled: config.repositoryCache?.enabled,
            metrics: coordinationMetrics,
          },
          performance: {
            hitRatios: cacheStats.hitRatios,
            efficiency: cacheStats.efficiency,
          },
        },
        processingTime: Date.now() - startTime,
      };

      // Set response headers
      res.setHeader('X-Cache-Status', info.cached ? 'HIT' : 'MISS');
      res.setHeader(
        'X-Coordination-Enabled',
        config.repositoryCache?.enabled ? 'true' : 'false'
      );

      logger.info('Repository info request completed', {
        repoUrl,
        info: result,
        processingTime: Date.now() - startTime,
      });

      res.status(HTTP_STATUS.OK).json(result);
    } catch (error) {
      logger.error('Error getting repository info', { error, repoUrl });
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// NEW: Cache management endpoints
// ---------------------------------------------------------------------------

// GET /cache/stats - Get detailed cache statistics
router.get('/cache/stats', (req: Request, res: Response) => {
  const logger = createRequestLogger(req);

  const cacheStats = getRepositoryCacheStats();
  const coordinationMetrics = getCoordinationMetrics();
  const repositoryStatus = getRepositoryStatus();

  const result = {
    cache: cacheStats,
    coordination: coordinationMetrics,
    repositories: {
      cached: repositoryStatus.length,
      details: repositoryStatus.slice(0, 10), // Limit to first 10 for performance
    },
    timestamp: new Date().toISOString(),
  };

  logger.debug('Cache stats requested', {
    cachedRepositories: repositoryStatus.length,
    overallHitRatio: cacheStats.hitRatios.overall,
  });

  res.status(HTTP_STATUS.OK).json(result);
});

// POST /cache/invalidate - Invalidate repository cache
router.post(
  '/cache/invalidate',
  [
    body('repoUrl')
      .isURL({ protocols: ['http', 'https'] })
      .withMessage(ERROR_MESSAGES.INVALID_REPO_URL),
    handleValidationErrors,
  ],
  async (req: Request, res: Response) => {
    const logger = createRequestLogger(req);
    const { repoUrl } = req.body;

    try {
      // Invalidate both cache tiers
      await invalidateRepositoryCache(repoUrl);
      await repositoryCache.invalidateRepository(repoUrl);

      logger.info('Repository cache invalidated', { repoUrl });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Repository cache invalidated successfully',
        repoUrl,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error invalidating repository cache', { error, repoUrl });
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to invalidate repository cache',
      });
    }
  }
);

// GET /cache/repositories - List all cached repositories
router.get('/cache/repositories', (req: Request, res: Response) => {
  const logger = createRequestLogger(req);

  const repositoryStatus = getRepositoryStatus();
  const coordinationMetrics = getCoordinationMetrics();

  const result = {
    repositories: repositoryStatus.map((repo) => ({
      ...repo,
      ageMinutes: Math.round(repo.age / (60 * 1000)),
      lastAccessedFormatted: repo.lastAccessed.toISOString(),
    })),
    summary: {
      total: repositoryStatus.length,
      maxRepositories: config.repositoryCache?.maxRepositories || 50,
      utilizationPercent: Math.round(
        (repositoryStatus.length /
          (config.repositoryCache?.maxRepositories || 50)) *
          100
      ),
    },
    coordination: coordinationMetrics,
    timestamp: new Date().toISOString(),
  };

  logger.debug('Repository status requested', {
    totalRepositories: repositoryStatus.length,
  });

  res.status(HTTP_STATUS.OK).json(result);
});

// ---------------------------------------------------------------------------
// ENHANCED: Streaming endpoints (with coordination support)
// ---------------------------------------------------------------------------

// Streaming validation for POST /stream endpoint
const streamingOptionsValidation = [
  body('repoUrl')
    .notEmpty()
    .withMessage('repoUrl is required')
    .isURL({
      protocols: ['http', 'https'],
      require_protocol: true,
      require_valid_protocol: true,
    })
    .withMessage(ERROR_MESSAGES.INVALID_REPO_URL)
    .matches(/\.git$|github\.com|gitlab\.com|bitbucket\.org/)
    .withMessage(ERROR_MESSAGES.INVALID_REPO_URL),
  body('batchSize')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Batch size must be between 1 and 10000')
    .toInt(),
  body('maxCommits')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max commits must be a positive integer')
    .toInt(),
  body('resumeFromSha')
    .optional()
    .isString()
    .isLength({ min: 40, max: 40 })
    .withMessage('Resume SHA must be a valid 40-character hash'),
  handleValidationErrors,
];

// POST /stream - Enhanced streaming with coordination
router.post(
  '/stream',
  streamingOptionsValidation,
  async (req: Request, res: Response) => {
    const logger = createRequestLogger(req);
    const { repoUrl, batchSize, maxCommits, resumeFromSha } = req.body;

    try {
      // Get repository info first (may use cached data)
      const repoInfo = await getRepositoryInfo(repoUrl);

      // Set streaming response headers
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
        'X-Streaming-Mode': 'enabled',
        'X-Repository-Size': repoInfo.sizeCategory,
        'X-Repository-Cached': repoInfo.cached ? 'true' : 'false',
        'X-Repository-Shared': repoInfo.isShared ? 'true' : 'false',
        'X-Coordination-Enabled': config.repositoryCache?.enabled
          ? 'true'
          : 'false',
        'Cache-Control': 'no-cache',
      });

      let totalCommits = 0;
      let batchCount = 0;
      const operationStart = Date.now();

      // Send initial metadata with coordination info
      res.write(
        JSON.stringify({
          type: 'metadata',
          data: {
            totalCommits: repoInfo.commitCount,
            streamingOptions: {
              batchSize: batchSize || config.streaming.batchSize,
              maxCommits: maxCommits || repoInfo.commitCount,
              resumeFromSha,
            },
            repository: {
              sizeCategory: repoInfo.sizeCategory,
              cached: repoInfo.cached,
              shared: repoInfo.isShared,
              coordinationEnabled: config.repositoryCache?.enabled,
            },
            estimatedBatches: Math.ceil(
              repoInfo.commitCount / (batchSize || config.streaming.batchSize)
            ),
          },
        }) + '\n'
      );

      // Use coordination-aware streaming (implementation would use shared repositories)
      const streamingOptions = {
        batchSize: batchSize || config.streaming.batchSize,
        maxCommits: maxCommits || repoInfo.commitCount,
        ...(resumeFromSha && { startFromCommit: resumeFromSha }),
      };

      logger.info('Starting coordinated streaming response', {
        repoUrl,
        commitCount: repoInfo.commitCount,
        streamingOptions,
        coordinationEnabled: config.repositoryCache?.enabled,
      });

      // Use withTempRepositoryStreaming for actual streaming implementation
      await withTempRepositoryStreaming(
        repoUrl,
        async (tempDir, commitCount) => {
          // Stream batches
          for await (const batch of gitService.getCommitsStream(
            tempDir,
            streamingOptions
          )) {
            batchCount++;
            totalCommits += batch.length;

            const batchData = {
              type: 'batch',
              data: {
                batchNumber: batchCount,
                commits: batch,
                batchSize: batch.length,
                totalProcessed: totalCommits,
                timestamp: Date.now(),
              },
            };

            res.write(JSON.stringify(batchData) + '\n');

            // Record batch metrics
            recordStreamingBatch(
              batch.length,
              100, // Estimated batch time (actual time tracked in gitService)
              false, // Streaming batches are typically cache misses
              commitCount
            );

            logger.debug('Streamed batch', {
              repoUrl,
              batchNumber: batchCount,
              batchSize: batch.length,
              totalProcessed: totalCommits,
            });
          }
        }
      );

      // Send completion metadata
      const operationTime = Date.now() - operationStart;
      res.write(
        JSON.stringify({
          type: 'complete',
          data: {
            totalCommits,
            totalBatches: batchCount,
            operationTime,
            averageCommitsPerSecond: Math.round(
              totalCommits / (operationTime / 1000)
            ),
            cacheEfficiency: getRepositoryCacheStats().hitRatios.overall,
          },
        }) + '\n'
      );

      logger.info('Coordinated streaming completed', {
        repoUrl,
        totalCommits,
        totalBatches: batchCount,
        operationTime,
        coordinationEnabled: config.repositoryCache?.enabled,
      });

      res.end();
    } catch (error) {
      logger.error('Error in coordinated streaming commits', {
        error,
        repoUrl,
      });

      try {
        res.write(
          JSON.stringify({
            type: 'error',
            data: {
              message: error instanceof Error ? error.message : 'Unknown error',
              timestamp: Date.now(),
            },
          }) + '\n'
        );
        res.end();
      } catch {
        res.end();
      }
    }
  }
);

// ---------------------------------------------------------------------------
// NEW: GET /commits/resume/:repoPath - Get resume state for interrupted operations
// ---------------------------------------------------------------------------
router.get(
  '/resume/:repoPath',
  async (req: Request, res: Response, next: NextFunction) => {
    const logger = createRequestLogger(req);
    const repoPath = decodeURIComponent(req.params.repoPath);

    try {
      const resumeState = await gitService.getStreamingResumeState(repoPath);

      if (resumeState) {
        logger.info('Resume state found', { repoPath, resumeState });
        res.status(HTTP_STATUS.OK).json({
          hasResumeState: true,
          resumeState,
        });
      } else {
        logger.info('No resume state found', { repoPath });
        res.status(HTTP_STATUS.OK).json({
          hasResumeState: false,
          resumeState: null,
        });
      }
    } catch (error) {
      logger.error('Error getting resume state', { error, repoPath });
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// NEW: POST /commits/resume/clear - Clear resume state
// ---------------------------------------------------------------------------
router.post(
  '/resume/clear',
  body('repoPath').notEmpty().withMessage('Repository path is required'),
  handleValidationErrors,
  async (req: Request, res: Response) => {
    const logger = createRequestLogger(req);
    const { repoPath } = req.body;

    try {
      await gitService.clearStreamingResumeState(repoPath);

      logger.info('Resume state cleared', { repoPath });
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Resume state cleared successfully',
      });
    } catch (error) {
      logger.error('Error clearing resume state', { error, repoPath });
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to clear resume state',
      });
    }
  }
);

export default router;
