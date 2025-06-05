import express, { Request, Response, NextFunction } from 'express';
import { query, body } from 'express-validator';
import { gitService } from '../services/gitService';
import redis from '../services/cache';
import {
  withTempRepository,
  withTempRepositoryStreaming,
  getRepositoryInfo,
} from '../utils/withTempRepository';
import { handleValidationErrors } from '../middlewares/validation';
import { createRequestLogger } from '../services/logger';
import {
  cacheHits,
  cacheMisses,
  recordStreamingBatch,
  getRepositorySizeCategory,
} from '../services/metrics';
import {
  CommitFilterOptions,
  ERROR_MESSAGES,
  HTTP_STATUS,
  TIME,
} from '@gitray/shared-types';
import { config } from '../config';

// Router serving commit related data with streaming support
const router = express.Router();

// ---------------------------------------------------------------------------
// Validation schemas
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
  query('useStreaming').optional().isBoolean().toBoolean(),
  query('batchSize').optional().isInt({ min: 100, max: 5000 }).toInt(),
  handleValidationErrors,
];

const streamingOptionsValidation = [
  body('repoUrl')
    .isURL({ protocols: ['http', 'https'] })
    .withMessage(ERROR_MESSAGES.INVALID_REPO_URL),
  body('batchSize').optional().isInt({ min: 100, max: 5000 }),
  body('maxCommits').optional().isInt({ min: 1 }),
  body('resumeFromSha').optional().isString(),
  handleValidationErrors,
];

// ---------------------------------------------------------------------------
// GET /commits - Enhanced paginated list of commits with streaming detection
// ---------------------------------------------------------------------------
router.get(
  '/',
  repoUrlValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const logger = createRequestLogger(req);
    const { repoUrl, useStreaming } = req.query as Record<string, string>;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const forceStreaming = useStreaming === 'true';
    const skip = (page - 1) * limit;

    try {
      const cacheKey = `commits:${repoUrl}:${page}:${limit}:${forceStreaming}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        cacheHits.inc({ operation: 'commits' });
        res.setHeader('X-Cache-Status', 'HIT');
        logger.info('Cache hit for commits', {
          repoUrl,
          page,
          limit,
          forceStreaming,
        });
        res.status(HTTP_STATUS.OK).json(JSON.parse(cached));
        return;
      }

      cacheMisses.inc({ operation: 'commits' });
      res.setHeader('X-Cache-Status', 'MISS');

      let commits;
      let streamingUsed = false;

      if (forceStreaming) {
        // Force streaming mode for testing/debugging
        commits = await withTempRepositoryStreaming(
          repoUrl,
          async (tempDir) => {
            streamingUsed = true;
            return await gitService.getCommits(tempDir, { skip, limit });
          }
        );
      } else {
        // Use intelligent detection
        commits = await withTempRepository(repoUrl, async (tempDir) => {
          const shouldUseStreaming =
            await gitService.shouldUseStreaming(tempDir);
          streamingUsed = shouldUseStreaming;

          if (shouldUseStreaming) {
            logger.info('Using streaming for large repository', {
              repoUrl,
              page,
              limit,
            });
          }

          return await gitService.getCommits(tempDir, { skip, limit });
        });
      }

      const result = {
        commits,
        page,
        limit,
        streamingUsed,
        totalCommits: commits.length,
      };

      await redis.set(cacheKey, JSON.stringify(result), 'EX', TIME.HOUR / 1000);

      logger.info('Fetched commits from repository', {
        repoUrl,
        page,
        limit,
        count: commits.length,
        streamingUsed,
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
// GET /commits/heatmap - Enhanced with streaming support for large repos
// ---------------------------------------------------------------------------
router.get(
  '/heatmap',
  repoUrlValidation,
  async (req: Request, res: Response, next: NextFunction) => {
    const logger = createRequestLogger(req);
    const { repoUrl, author, authors, fromDate, toDate, useStreaming } =
      req.query as Record<string, string>;
    const forceStreaming = useStreaming === 'true';

    const filters: CommitFilterOptions = {
      author: author || undefined,
      authors: authors ? authors.split(',') : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    };

    try {
      const cacheKey = `heatmap:${repoUrl}:${JSON.stringify(filters)}:${forceStreaming}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        cacheHits.inc({ operation: 'heatmap' });
        res.setHeader('X-Cache-Status', 'HIT');
        logger.info('Cache hit for heatmap', {
          repoUrl,
          filters,
          forceStreaming,
        });
        res.status(HTTP_STATUS.OK).json(JSON.parse(cached));
        return;
      }

      cacheMisses.inc({ operation: 'heatmap' });
      res.setHeader('X-Cache-Status', 'MISS');

      let heatmapData;
      let streamingUsed = false;

      if (forceStreaming) {
        // Force streaming mode
        heatmapData = await withTempRepositoryStreaming(
          repoUrl,
          async (tempDir, commitCount) => {
            streamingUsed = true;
            res.setHeader(
              'X-Repository-Size',
              getRepositorySizeCategory(commitCount)
            );

            const commits = await gitService.getCommits(tempDir);
            return gitService.aggregateCommitsByTime(commits, filters);
          }
        );
      } else {
        // Use intelligent detection
        heatmapData = await withTempRepository(repoUrl, async (tempDir) => {
          const shouldUseStreaming =
            await gitService.shouldUseStreaming(tempDir);
          streamingUsed = shouldUseStreaming;

          if (shouldUseStreaming) {
            const commitCount = await gitService.getCommitCount(tempDir);
            res.setHeader(
              'X-Repository-Size',
              getRepositorySizeCategory(commitCount)
            );
            logger.info('Using streaming for large repository heatmap', {
              repoUrl,
              commitCount,
            });
          }

          const commits = await gitService.getCommits(tempDir);
          return gitService.aggregateCommitsByTime(commits, filters);
        });
      }

      // Add streaming metadata to response
      heatmapData.metadata = {
        maxCommitCount: heatmapData.metadata?.maxCommitCount || 0,
        totalCommits: heatmapData.metadata?.totalCommits || 0,
        filterOptions: filters,
        streamingUsed,
      };

      await redis.set(
        cacheKey,
        JSON.stringify(heatmapData),
        'EX',
        TIME.HOUR / 1000
      );

      logger.info('Generated heatmap data', {
        repoUrl,
        filters,
        streamingUsed,
      });
      res.status(HTTP_STATUS.OK).json(heatmapData);
      return;
    } catch (error) {
      logger.error('Error generating heatmap', { error, repoUrl, filters });
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// NEW: GET /commits/info - Repository information endpoint
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
      const cacheKey = `repo_info:${repoUrl}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        cacheHits.inc({ operation: 'repo_info' });
        res.setHeader('X-Cache-Status', 'HIT');
        logger.info('Cache hit for repository info', { repoUrl });
        res.status(HTTP_STATUS.OK).json(JSON.parse(cached));
        return;
      }

      cacheMisses.inc({ operation: 'repo_info' });
      res.setHeader('X-Cache-Status', 'MISS');

      const info = await getRepositoryInfo(repoUrl);

      const result = {
        ...info,
        streamingConfig: {
          enabled: config.streaming.enabled,
          threshold: config.streaming.commitThreshold,
          defaultBatchSize: config.streaming.batchSize,
        },
        sizeCategory: getRepositorySizeCategory(info.commitCount),
      };

      await redis.set(cacheKey, JSON.stringify(result), 'EX', TIME.HOUR / 1000);

      logger.info('Generated repository info', { repoUrl, info: result });
      res.status(HTTP_STATUS.OK).json(result);
      return;
    } catch (error) {
      logger.error('Error getting repository info', { error, repoUrl });
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// NEW: POST /commits/stream - Streaming commits endpoint
// ---------------------------------------------------------------------------
router.post(
  '/stream',
  streamingOptionsValidation,
  async (req: Request, res: Response) => {
    const logger = createRequestLogger(req);
    const { repoUrl, batchSize, maxCommits, resumeFromSha } = req.body;

    try {
      // Set streaming response headers
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
        'X-Streaming-Mode': 'enabled',
        'Cache-Control': 'no-cache',
      });

      let totalCommits = 0;
      let batchCount = 0;
      const operationStart = Date.now();

      await withTempRepositoryStreaming(
        repoUrl,
        async (tempDir, commitCount) => {
          const streamingOptions = {
            batchSize: batchSize || config.streaming.batchSize,
            maxCommits: maxCommits || commitCount,
            ...(resumeFromSha && { startFromCommit: resumeFromSha }),
          };

          logger.info('Starting streaming response', {
            repoUrl,
            commitCount,
            streamingOptions,
          });

          // Send initial metadata
          res.write(
            JSON.stringify({
              type: 'metadata',
              data: {
                totalCommits: commitCount,
                streamingOptions,
                sizeCategory: getRepositorySizeCategory(commitCount),
                estimatedBatches: Math.ceil(
                  commitCount / streamingOptions.batchSize
                ),
              },
            }) + '\n'
          );

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
              },
            }) + '\n'
          );

          logger.info('Streaming completed', {
            repoUrl,
            totalCommits,
            totalBatches: batchCount,
            operationTime,
          });
        }
      );

      res.end();
    } catch (error) {
      logger.error('Error in streaming commits', { error, repoUrl });

      // Try to send error in streaming format
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
        // If we can't write the error, just end the response
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
