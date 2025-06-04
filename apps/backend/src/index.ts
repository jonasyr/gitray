/**
 * Entry point for the backend Express server. The server configures common
 * middleware, sets up API routes and metrics endpoints, and registers graceful
 * shutdown handlers.
 *
 * INTEGRATION CHANGES:
 * - Added configuration validation on startup
 * - Enhanced graceful shutdown to handle HybridLRUCache and Lock Manager
 * - Added health checks for new cache system
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, validateConfig } from './config';
import logger from './services/logger';
import routes from './routes';
import repositoryRoutes from './routes/repositoryRoutes';
import commitRoutes from './routes/commitRoutes';
import healthRoutes from './routes/healthRoutes';
import errorHandler from './middlewares/errorHandler';
import { setupGracefulShutdown } from './utils/gracefulShutdown';
import { requestIdMiddleware } from './middlewares/requestId';
import {
  metricsMiddleware,
  metricsHandler,
  updateCacheMetrics,
} from './services/metrics';

// Load environment variables
dotenv.config();

/**
 * NEW: Validate configuration on startup
 * This ensures all environment variables are properly set
 * and provides early feedback about configuration issues
 */
try {
  validateConfig();
  logger.info('Configuration validated successfully');
} catch (error) {
  logger.error('Configuration validation failed', { error });
  process.exit(1);
}

// Initialize the Express application used for all API endpoints
const app = express();

// Security middlewares
app.use(helmet());
app.use(cors(config.cors));

// Rate limiting for all API routes
const limiter = rateLimit(config.rateLimit);
app.use('/api', limiter);

// Attach request ID and metrics collection
app.use(requestIdMiddleware);
app.use(metricsMiddleware);

// Parse incoming JSON bodies
app.use(express.json());

// Expose Prometheus metrics endpoint
app.use('/metrics', metricsHandler);

// Application routes
app.use('/api', routes);
app.use('/', healthRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api/commits', commitRoutes);

app.use(errorHandler);

// Start the server
const server = app.listen(config.port, () => {
  logger.info('Backend starting up', {
    port: config.port,
    nodeEnv: process.env.NODE_ENV,
    hybridCache: {
      enabled: config.hybridCache.enableRedis || config.hybridCache.enableDisk,
      maxEntries: config.hybridCache.maxEntries,
      memoryLimitMB: Math.round(
        config.hybridCache.memoryLimitBytes / 1024 ** 2
      ),
      diskPath: config.hybridCache.diskPath,
    },
    locks: {
      lockDir: config.locks.lockDir,
      defaultTimeoutMs: config.locks.defaultTimeoutMs,
    },
  });

  logger.info(`Backend running on port ${config.port}`);
});

// NEW: Log cache initialization status after startup
let metricsInterval: NodeJS.Timeout | null = null;

setTimeout(() => {
  import('./services/cache')
    .then(({ getCacheStats }) => {
      const stats = getCacheStats();
      logger.info('Cache system initialized', {
        activeBackend: stats.activeBackend,
        memoryEntries: stats.memory.entries,
        redisHealthy: stats.redis.healthy,
        hybridStats: stats.hybrid
          ? {
              memoryEntries: stats.hybrid.memory.entries,
              diskEntries: stats.hybrid.disk.entries,
              memoryUsageMB: Math.round(
                stats.hybrid.memory.usageBytes / 1024 ** 2
              ),
            }
          : null,
      });

      // NEW: Start metrics update scheduler
      metricsInterval = setInterval(async () => {
        await updateCacheMetrics();
      }, 30000); // Every 30 seconds

      logger.info('Cache metrics scheduler started');
    })
    .catch((err) => {
      logger.warn('Failed to get cache stats during startup', { err });
    });
}, 1000); // Wait 1 second for cache to initialize

// Handle graceful shutdown signals with metrics cleanup
setupGracefulShutdown(server, () => {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    logger.info('Cache metrics scheduler stopped');
  }
});
