import express from 'express';
import { gitService } from '../services/gitService';
import { CommitFilterOptions } from '@gitray/shared-types';

const router = express.Router();

// GET /api/commits/heatmap?repoUrl=...&author=...&fromDate=...&toDate=...
router.get('/heatmap', (async (req, res, next) => {
  const { repoUrl, author, authors, fromDate, toDate } = req.query as Record<
    string,
    string
  >;

  // Basic validation
  if (!repoUrl) {
    return res
      .status(400)
      .json({ error: 'repoUrl query parameter is required' });
  }

  let tempDir: string | undefined;
  try {
    tempDir = await gitService.cloneRepository(repoUrl);
    const commits = await gitService.getCommits(tempDir);
    const filters: CommitFilterOptions = {
      author: author || undefined,
      authors: authors ? authors.split(',') : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    };

    const heatmapData = await gitService.aggregateCommitsByTime(
      commits,
      filters
    );
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
