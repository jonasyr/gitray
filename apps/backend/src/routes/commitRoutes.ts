import { Router, RequestHandler } from 'express';
import { gitService } from '../services/gitService';
import redis from '../services/cache';
import { withTempRepository } from '../utils/withTempRepository';
import { createRequestLogger } from '../services/logger';
import { cacheHits, cacheMisses } from '../services/metrics';
import { CommitFilterOptions, HTTP_STATUS, TIME } from '@gitray/shared-types';

// Router serving commit related data
const router = Router();

// Manual validation helper
const validateRepoUrl = (repoUrl: string | undefined): boolean => {
  if (!repoUrl) return false;
  try {
    const url = new URL(repoUrl);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      /\.git$|github\.com|gitlab\.com|bitbucket\.org/.test(repoUrl)
    );
  } catch {
    return false;
  }
};

// Validate ISO 8601 date string
const isValidISO8601 = (dateString: string | undefined): boolean => {
  if (!dateString) return true; // optional
  try {
    const date = new Date(dateString);
    return date.toISOString() === dateString;
  } catch {
    return false;
  }
};

// Validate integer within range
const isValidInt = (
  value: string | undefined,
  min: number,
  max?: number
): boolean => {
  if (!value) return true; // optional
  const num = parseInt(value, 10);
  if (isNaN(num) || num.toString() !== value) return false;
  if (num < min) return false;
  if (max !== undefined && num > max) return false;
  return true;
};

// ---------------------------------------------------------------------------
// GET / - paginated list of commits
// ---------------------------------------------------------------------------
const getCommits: RequestHandler = async (req, res, next) => {
  // Manual validation with proper error response
  const repoUrl = req.query.repoUrl as string;
  const pageStr = req.query.page as string;
  const limitStr = req.query.limit as string;

  // Validate all parameters
  if (
    !repoUrl ||
    !validateRepoUrl(repoUrl) ||
    !isValidInt(pageStr, 1) ||
    !isValidInt(limitStr, 1, 100)
  ) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  const logger = createRequestLogger(req);
  const page = parseInt(pageStr) || 1;
  const limit = parseInt(limitStr) || 100;
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
};

router.get('/', getCommits);

// ---------------------------------------------------------------------------
// GET /heatmap - aggregated commit activity
// ---------------------------------------------------------------------------
const getHeatmap: RequestHandler = async (req, res, next) => {
  // Manual validation
  const repoUrl = req.query.repoUrl as string;
  const fromDate = req.query.fromDate as string;
  const toDate = req.query.toDate as string;

  // Validate all parameters
  if (
    !repoUrl ||
    !validateRepoUrl(repoUrl) ||
    !isValidISO8601(fromDate) ||
    !isValidISO8601(toDate)
  ) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  const logger = createRequestLogger(req);
  const { author, authors } = req.query as Record<string, string>;

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
  } catch (error) {
    logger.error('Error generating heatmap', { error, repoUrl, filters });
    next(error);
  }
};

router.get('/heatmap', getHeatmap);

export default router;
