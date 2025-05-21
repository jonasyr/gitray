import express from 'express';
import { gitService } from '../services/gitService';
import { TimePeriod, CommitFilterOptions } from '../../../../packages/shared-types/src';

const router = express.Router();

// GET /api/commits/heatmap?repoUrl=...&timePeriod=day&author=...&fromDate=...&toDate=...&fileExtension=...
router.get('/heatmap', (async (req, res, next) => {
  const { repoUrl, timePeriod, author, fromDate, toDate, fileExtension } = req.query as Record<string, string>;

  // Basic validation
  if (!repoUrl) {
    return res.status(400).json({ error: 'repoUrl query parameter is required' });
  }

  if (!timePeriod || !['day', 'week', 'month', 'year'].includes(timePeriod)) {
    return res.status(400).json({ error: 'Invalid timePeriod. Must be day, week, month, or year.' });
  }

  let tempDir: string | undefined;
  try {
    tempDir = await gitService.cloneRepository(repoUrl);
    const commits = await gitService.getCommits(tempDir, 1000);
    const filters: CommitFilterOptions = {
      author: author || undefined,
      fileExtension: fileExtension || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    };

    const heatmapData = await gitService.aggregateCommitsByTime(commits, timePeriod as TimePeriod, filters);
    res.json(heatmapData);
  } catch (error) {
    next(error);
  } finally {
    if (tempDir) {
      try {
        await gitService.cleanupRepository(tempDir);
      } catch (cleanupError) {
        console.error('Error during repository cleanup:', cleanupError);
      }
    }
  }
}) as express.RequestHandler);

export default router;
