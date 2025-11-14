import express, { Request, Response } from 'express';
import simpleGit from 'simple-git';
import redis from '../services/cache';
import { getLogger } from '../services/logger';
import { isServerShuttingDown } from '../utils/gracefulShutdown';
import { config } from '../config';
import { recordFeatureUsage, getUserType } from '../services/metrics';

// CRITICAL: Memory pressure monitoring imports
import {
  getMemoryStats,
  getMemoryMetrics,
} from '../utils/memoryPressureManager';

// Health check endpoints used by Kubernetes and monitoring tools
import os from 'node:os';

const router = express.Router();
const logger = getLogger();

// ---------------------------------------------------------------------------
// Liveness and readiness endpoints
// ---------------------------------------------------------------------------
router.get('/health', (req: Request, res: Response) => {
  const userType = getUserType(req);

  if (isServerShuttingDown()) {
    recordFeatureUsage('health_check', userType, false, 'api_call');
    res.status(503).json({
      status: 'shutting_down',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  recordFeatureUsage('health_check', userType, true, 'api_call');
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Detailed health information including system stats and coordination
router.get('/health/detailed', async (req: Request, res: Response) => {
  const userType = getUserType(req);
  const checks: Record<string, string | number> = {
    server: 'healthy',
    cache: 'unknown',
    git: 'unknown',
    coordination: 'unknown',
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

  // NEW: Repository coordination system health check
  try {
    if (config.repositoryCache?.enabled) {
      const { repositoryCoordinator } = await import(
        '../services/repositoryCoordinator'
      );
      const { getRepositoryCacheStats } = await import(
        '../services/repositoryCache'
      );

      const coordinationMetrics = repositoryCoordinator.getMetrics();
      const cacheStats = getRepositoryCacheStats();

      const isCoordinationHealthy =
        coordinationMetrics.activeClones < 10 &&
        cacheStats.hitRatios.overall > 0.1;

      if (isCoordinationHealthy) {
        checks.coordination = `healthy (${coordinationMetrics.cachedRepositories} repos cached)`;
        checks.coordinationCachedRepos = coordinationMetrics.cachedRepositories;
        checks.coordinationActiveClones = coordinationMetrics.activeClones;
        checks.coordinationDuplicatesPrevented =
          coordinationMetrics.duplicateClonesPrevented;
      } else {
        checks.coordination = 'unhealthy';
        overallStatus = 503;
      }
    } else {
      checks.coordination = 'disabled';
    }
  } catch (error) {
    logger.error('Coordination health check failed', error);
    checks.coordination = 'error';
    // Don't fail overall health for coordination issues
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

  // Record successful health check feature usage
  recordFeatureUsage(
    'detailed_health_check',
    userType,
    overallStatus === 200,
    'api_call'
  );

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

// NEW: Dedicated coordination health endpoint for Step 3 testing
router.get('/coordination', (req: Request, res: Response) => {
  const userType = getUserType(req);

  if (!config.repositoryCache?.enabled) {
    recordFeatureUsage('coordination_health_check', userType, true, 'api_call');
    res.status(200).json({
      status: 'disabled',
      message: 'Repository coordination is disabled',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Return basic coordination status even if modules aren't loaded yet
  recordFeatureUsage('coordination_health_check', userType, true, 'api_call');
  res.status(200).json({
    status: 'enabled',
    message: 'Repository coordination system is enabled',
    configuration: {
      enabled: config.repositoryCache?.enabled,
      maxRepositories: config.repositoryCache?.maxRepositories,
      maxAgeHours: config.repositoryCache?.maxAgeHours,
      operationCoordination: config.operationCoordination?.enabled,
      hierarchicalCaching: config.cacheStrategy?.hierarchicalCaching,
    },
    timestamp: new Date().toISOString(),
  });
});

// CRITICAL: Memory pressure health endpoint
// This endpoint is essential for production monitoring and alerting
router.get('/health/memory', (req: Request, res: Response) => {
  const userType = getUserType(req);

  try {
    const memoryStats = getMemoryStats();
    const memoryMetrics = getMemoryMetrics();

    // Determine if memory state is healthy
    const isHealthy =
      memoryStats.pressure.level === 'normal' ||
      memoryStats.pressure.level === 'warning';
    const httpStatus = isHealthy ? 200 : 503;

    recordFeatureUsage('memory_health_check', userType, isHealthy, 'api_call');

    res.status(httpStatus).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      memory: {
        pressure: {
          level: memoryStats.pressure.level,
          action: memoryStats.pressure.action,
        },
        system: {
          totalGB:
            Math.round((memoryStats.system.totalBytes / 1024 ** 3) * 100) / 100,
          freeGB:
            Math.round((memoryStats.system.freeBytes / 1024 ** 3) * 100) / 100,
          usedGB:
            Math.round((memoryStats.system.usedBytes / 1024 ** 3) * 100) / 100,
          usagePercentage: `${Math.round(memoryStats.system.usagePercentage * 100)}%`,
        },
        process: {
          heapUsedMB: Math.round(memoryStats.process.heapUsed / 1024 ** 2),
          heapTotalMB: Math.round(memoryStats.process.heapTotal / 1024 ** 2),
          rssMB: Math.round(memoryStats.process.rss / 1024 ** 2),
          externalMB: Math.round(memoryStats.process.external / 1024 ** 2),
        },
        thresholds: {
          warning: `${config.memoryPressure.warningThreshold * 100}%`,
          critical: `${config.memoryPressure.criticalThreshold * 100}%`,
          emergency: `${config.memoryPressure.emergencyThreshold * 100}%`,
        },
        metrics: {
          pressureEvents: memoryMetrics.pressureEvents,
          circuitBreakerTrips: memoryMetrics.circuitBreakerTrips,
          throttledRequests: memoryMetrics.throttledRequests,
          emergencyEvictions: memoryMetrics.emergencyEvictions,
          gcTriggered: memoryMetrics.gcTriggered,
        },
      },
    });
  } catch (error) {
    logger.error('Memory health check failed', { error });
    recordFeatureUsage('memory_health_check', userType, false, 'api_call');

    res.status(503).json({
      status: 'error',
      message: 'Failed to get memory health status',
      timestamp: new Date().toISOString(),
    });
  }
});

// Kubernetes liveness probe
router.get('/health/live', (req: Request, res: Response) => {
  const userType = getUserType(req);
  recordFeatureUsage('liveness_probe', userType, true, 'api_call');
  res.status(200).json({ status: 'alive' });
});

// Kubernetes readiness probe
router.get('/health/ready', (req: Request, res: Response) => {
  const userType = getUserType(req);
  const isReady = !isServerShuttingDown() && redis.isHealthy();

  recordFeatureUsage('readiness_probe', userType, isReady, 'api_call');

  if (!isReady) {
    res.status(503).json({ status: 'not_ready' });
    return;
  }
  res.status(200).json({ status: 'ready' });
});

export default router;
