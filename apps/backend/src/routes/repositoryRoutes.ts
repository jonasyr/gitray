import express from 'express';
import { gitService } from '../services/gitService';
import { TimePeriod, CommitFilterOptions, Commit } from '../../../../packages/shared-types/src';

const router = express.Router();

// Simple URL validation function
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return url.startsWith('http://') || url.startsWith('https://');
  } catch {
    return false;
  }
}

// POST endpoint to get repository data (commits and heatmap in a single call)
router.post('/', async (req, res, next) => {
  const { repoUrl } = req.body;
  
  // Validate the repository URL
  if (!repoUrl || !isValidUrl(repoUrl)) {
    res.status(400).json({ error: 'Invalid repository URL. Please provide a valid Git repository URL.' });
    return;
  }
  
  let tempDir: string | undefined;
  
  try {
    // Clone the repository
    tempDir = await gitService.cloneRepository(repoUrl);
    
    // Get the commits
    const commits = await gitService.getCommits(tempDir, 1000);
    
    // Send the response with the commits
    res.status(200).json({ commits });
    
    // Clean up after response is sent
    if (tempDir) {
      await gitService.cleanupRepository(tempDir);
    }
  } catch (error) {
    // Pass error to the error handler middleware
    next(error);
    
    // Still try to clean up if tempDir exists
    if (tempDir) {
      try {
        await gitService.cleanupRepository(tempDir);
      } catch (cleanupError) {
        console.error('Error during repository cleanup:', cleanupError);
      }
    }
    
    // Send error response if not already sent
    if (!res.headersSent) {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

// POST endpoint to get commit heatmap data
router.post('/heatmap', async (req, res, next) => {
  const { repoUrl, timePeriod, filterOptions } = req.body;
  
  // Validate inputs
  if (!repoUrl || !isValidUrl(repoUrl)) {
    res.status(400).json({ error: 'Invalid repository URL. Please provide a valid Git repository URL.' });
    return;
  }
  
  if (!timePeriod || !['day', 'week', 'month', 'year'].includes(timePeriod)) {
    res.status(400).json({ error: 'Invalid time period. Must be one of: day, week, month, year.' });
    return;
  }
  
  let tempDir: string | undefined;
  
  try {
    // Clone the repository
    tempDir = await gitService.cloneRepository(repoUrl);
    
    // Get all commits (with a high maxCount to ensure we get enough data)
    const commits = await gitService.getCommits(tempDir, 1000);
    
    // Aggregate the commits by time period
    const heatmapData = await gitService.aggregateCommitsByTime(
      commits, 
      timePeriod as TimePeriod, 
      filterOptions as CommitFilterOptions
    );
    
    // Send the response with the heatmap data
    res.status(200).json({ heatmapData });
    
    // Clean up after response is sent
    if (tempDir) {
      await gitService.cleanupRepository(tempDir);
    }
  } catch (error) {
    // Pass error to the error handler middleware
    next(error);
    
    // Still try to clean up if tempDir exists
    if (tempDir) {
      try {
        await gitService.cleanupRepository(tempDir);
      } catch (cleanupError) {
        console.error('Error during repository cleanup:', cleanupError);
      }
    }
    
    // Send error response if not already sent
    if (!res.headersSent) {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

// NEW ENDPOINT: Get both commits and heatmap data in a single request
router.post('/full-data', async (req, res, next) => {
  const { repoUrl, timePeriod, filterOptions } = req.body;
  
  // Validate the repository URL
  if (!repoUrl || !isValidUrl(repoUrl)) {
    res.status(400).json({ error: 'Invalid repository URL. Please provide a valid Git repository URL.' });
    return;
  }
  
  const validTimePeriod = timePeriod && ['day', 'week', 'month', 'year'].includes(timePeriod) 
    ? timePeriod as TimePeriod 
    : 'month';
  
  let tempDir: string | undefined;
  
  try {
    // Clone the repository only once
    tempDir = await gitService.cloneRepository(repoUrl);
    
    // Get all commits with a high limit
    const commits = await gitService.getCommits(tempDir, 1000);
    
    // Generate heatmap data from the same commits
    const heatmapData = await gitService.aggregateCommitsByTime(
      commits,
      validTimePeriod,
      filterOptions as CommitFilterOptions
    );
    
    // Send both datasets in a single response
    res.status(200).json({ 
      commits,
      heatmapData
    });
    
    // Clean up after response is sent
    if (tempDir) {
      await gitService.cleanupRepository(tempDir);
    }
  } catch (error) {
    // Pass error to the error handler middleware
    next(error);
    
    // Still try to clean up if tempDir exists
    if (tempDir) {
      try {
        await gitService.cleanupRepository(tempDir);
      } catch (cleanupError) {
        console.error('Error during repository cleanup:', cleanupError);
      }
    }
    
    // Send error response if not already sent
    if (!res.headersSent) {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

export default router;