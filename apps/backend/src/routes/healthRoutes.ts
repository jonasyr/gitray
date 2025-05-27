import express, { Request, Response } from 'express';
import simpleGit from 'simple-git';
import redis from '../services/cache';
import logger from '../services/logger';
import { isServerShuttingDown } from '../utils/gracefulShutdown';
import os from 'os';

const router = express.Router();

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

router.get('/health/detailed', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {
    server: 'healthy',
    redis: 'unknown',
    git: 'unknown',
  };

  let overallStatus = 200;

  try {
    if (redis.isHealthy()) {
      checks.redis = 'healthy';
    } else {
      checks.redis = 'unhealthy';
      overallStatus = 503;
    }
  } catch (error) {
    logger.error('Redis health check failed', error);
    checks.redis = 'error';
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

router.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

router.get('/health/ready', (_req: Request, res: Response) => {
  if (isServerShuttingDown() || !redis.isHealthy()) {
    res.status(503).json({ status: 'not_ready' });
    return;
  }
  res.status(200).json({ status: 'ready' });
});

export default router;
