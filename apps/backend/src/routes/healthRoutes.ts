import express, { Request, Response } from 'express';
import simpleGit from 'simple-git';
import redis from '../services/cache';
import logger from '../services/logger';
import { isServerShuttingDown } from '../utils/gracefulShutdown';

// Health check endpoints used by Kubernetes and monitoring tools
import os from 'os';

const router = express.Router();

// ---------------------------------------------------------------------------
// Liveness and readiness endpoints
// ---------------------------------------------------------------------------
router.get('/health', (req: Request, res: Response) => {
  if (isServerShuttingDown()) {
    res.status(503).json({
      status: 'shutting_down',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Detailed health information including system stats
router.get('/health/detailed', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {
    server: 'healthy',
    cache: 'unknown',
    git: 'unknown',
  };

  let overallStatus = 200;

  try {
    // NEW: Use the new Cache-Stats API to get detailed cache information
    const cacheStats = redis.getStats();

    if (redis.isHealthy()) {
      checks.cache = `healthy (${cacheStats.activeBackend})`;

      // Add detailed cache information
      checks.cacheBackend = cacheStats.activeBackend;
      if (cacheStats.hybrid) {
        checks.cacheMemoryUsage = `${Math.round(cacheStats.hybrid.memory.usageBytes / 1024 / 1024)}MB`;
        checks.cacheMemoryEntries = cacheStats.hybrid.memory.entries.toString();
        checks.cacheDiskEntries = cacheStats.hybrid.disk.entries.toString();
      }
    } else {
      checks.cache = 'unhealthy';
      overallStatus = 503;
    }
  } catch (error) {
    logger.error('Cache health check failed', error);
    checks.cache = 'error';
    overallStatus = 503;
  }

  try {
    const testGit = simpleGit();
    await testGit.raw(['--version']);
    checks.git = 'healthy';
  } catch (error) {
    logger.error('Git health check failed', error);
    checks.git = 'error';
    overallStatus = 503;
  }

  res.status(overallStatus).json({
    status: overallStatus === 200 ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
    system: {
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        percentage: (
          ((os.totalmem() - os.freemem()) / os.totalmem()) *
          100
        ).toFixed(2),
      },
      loadAverage: os.loadavg(),
      cpus: os.cpus().length,
    },
  });
});

// Kubernetes liveness probe
router.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

// Kubernetes readiness probe
router.get('/health/ready', (_req: Request, res: Response) => {
  if (isServerShuttingDown() || !redis.isHealthy()) {
    res.status(503).json({ status: 'not_ready' });
    return;
  }
  res.status(200).json({ status: 'ready' });
});

export default router;
