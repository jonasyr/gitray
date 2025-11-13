// apps/backend/src/index.ts - IMMEDIATE INTEGRATION

/**
 * Entry point for the backend Express server. The server configures common
 * middleware, sets up API routes and metrics endpoints, and registers graceful
 * shutdown handlers.
 *
 * COORDINATION INTEGRATION:
 * - Added repository coordination system initialization
 * - Enhanced graceful shutdown to handle new cache systems
 * - Added startup validation for coordination features
 */
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, validateConfig } from './config';
import { initializeLogger } from './services/logger';
import routes from './routes';
import repositoryRoutes from './routes/repositoryRoutes';
import commitRoutes from './routes/commitRoutes';
import healthRoutes from './routes/healthRoutes';
import errorHandler from './middlewares/errorHandler';
import { setupGracefulShutdown } from './utils/gracefulShutdown';
import { requestIdMiddleware } from './middlewares/requestId';
import { memoryPressureMiddleware } from './middlewares/memoryPressureMiddleware';
import {
  metricsMiddleware,
  metricsHandler,
  updateCacheMetrics,
  updateAllEnhancedMetrics,
} from './services/metrics';

// NEW IMPORTS: Repository coordination system
import { repositoryCoordinator } from './services/repositoryCoordinator';
import { repositoryCache } from './services/repositoryCache';

// Load environment variables
dotenv.config();

// Initialize logger after environment variables are loaded
const logger = initializeLogger();

// Add a simple startup indicator
logger.info('📋 Index.ts file loading...');

/**
 * Startup validation function to check for common issues
 */
export async function validateStartupEnvironment() {
  const issues: string[] = [];

  // Check if port is a valid number
  if (Number.isNaN(config.port) || config.port < 1 || config.port > 65535) {
    issues.push(`Invalid port number: ${config.port}. Must be between 1-65535`);
  }

  // Check if port is likely to cause conflicts (common ports)
  const commonPorts = [80, 443, 22, 21, 25, 53, 110, 143, 993, 995];
  if (commonPorts.includes(config.port)) {
    issues.push(
      `Port ${config.port} is a standard service port and may require admin privileges`
    );
  }

  // Check if required directories exist or can be created
  const requiredDirs = [
    config.locks.lockDir,
    config.hybridCache.diskPath,
    process.env.LOG_DIR ?? './logs',
  ];

  for (const dir of requiredDirs) {
    try {
      const fsSync = await import('node:fs');
      const fsAsync = await import('node:fs/promises');
      if (!fsSync.existsSync(dir)) {
        await fsAsync.mkdir(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    } catch (error) {
      issues.push(`Cannot create required directory: ${dir} - ${error}`);
    }
  }

  // Check Redis connection if enabled
  if (config.hybridCache.enableRedis) {
    try {
      // Try to connect to Redis to validate configuration
      const net = await import('node:net');
      const socket = new net.Socket();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error('Connection timeout'));
        }, 5000);

        socket.connect(config.redis.port, config.redis.host, () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve();
        });

        socket.on('error', (err) => {
          clearTimeout(timeout);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
      });

      logger.info('✅ Redis connection test successful');
    } catch (error) {
      logger.warn(
        `⚠️  Redis connection failed - falling back to memory-only cache`,
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  if (issues.length > 0) {
    logger.error('❌ Startup validation failed:', { issues });
    throw new Error(`Startup validation failed: ${issues.join(', ')}`);
  }

  logger.info('✅ Startup environment validation passed');
  logger.info('🔧 About to initialize Express app...');
}

/**
 * ENHANCED: Validate configuration with new coordination settings
 */
export async function initializeServer() {
  try {
    validateConfig();
    logger.info('Configuration validated successfully', {
      repositoryCacheEnabled: config.repositoryCache?.enabled,
      operationCoordinationEnabled: config.operationCoordination?.enabled,
      hierarchicalCachingEnabled: config.cacheStrategy?.hierarchicalCaching,
    });

    // Run startup environment validation
    await validateStartupEnvironment();
  } catch (error) {
    logger.error('Configuration or startup validation failed', { error });
    process.exit(1);
  }
}

/**
 * Main startup function that initializes and starts the server
 */
export async function startApplication() {
  logger.info('🚀 Starting application initialization...');
  try {
    // First, validate configuration and environment
    await initializeServer();

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

    // CRITICAL: Memory pressure protection middleware
    // This MUST be early in the middleware chain to protect against OOM crashes
    app.use(memoryPressureMiddleware);

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

    // Add coordination health endpoint
    app.get(
      '/health/coordination',
      async (req: Request, res: Response): Promise<void> => {
        if (!config.repositoryCache?.enabled) {
          res.status(200).json({
            status: 'disabled',
            message: 'Repository coordination is disabled',
          });
          return;
        }

        try {
          const metrics = repositoryCoordinator.getMetrics();
          const { getRepositoryCacheStats } = await import(
            './services/repositoryCache'
          );
          const cacheStats = getRepositoryCacheStats();

          const isHealthy =
            metrics.activeClones < 10 && // Not too many active operations
            cacheStats.hitRatios.overall > 0.1; // Some cache efficiency

          res.status(isHealthy ? 200 : 503).json({
            status: isHealthy ? 'healthy' : 'unhealthy',
            coordination: {
              cachedRepositories: metrics.cachedRepositories,
              activeClones: metrics.activeClones,
              duplicateClonesPrevented: metrics.duplicateClonesPrevented,
            },
            cache: {
              hitRatios: cacheStats.hitRatios,
              entries: cacheStats.entries,
            },
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          logger.error('Coordination health check failed', { error });
          res.status(503).json({
            status: 'error',
            message: 'Failed to get coordination health',
          });
        }
      }
    );

    // Start the server with proper error handling
    logger.info('🔧 Starting Express server...');
    const server = app.listen(config.port, () => {
      logger.info('Backend starting up', {
        port: config.port,
        nodeEnv: process.env.NODE_ENV,
        hybridCache: {
          enabled:
            config.hybridCache.enableRedis || config.hybridCache.enableDisk,
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
        // NEW: Repository coordination info
        repositoryCoordination: {
          enabled: config.repositoryCache?.enabled,
          maxRepositories: config.repositoryCache?.maxRepositories,
          maxAgeHours: config.repositoryCache?.maxAgeHours,
          operationCoalescing: config.operationCoordination?.coalescingEnabled,
        },
      });

      logger.info(`🚀 Backend running on port ${config.port}`);
      logger.info(`📊 Health check: http://localhost:${config.port}/health`);
      logger.info(
        `🔄 Coordination health: http://localhost:${config.port}/health/coordination`
      );
    });

    // Handle server startup errors (port conflicts, permission issues, etc.)
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(
          `❌ PORT CONFLICT: Port ${config.port} is already in use!`,
          {
            port: config.port,
            error: error.message,
            solution: `Please check if another process is using port ${config.port} or set a different PORT in your .env file`,
          }
        );

        // Provide helpful commands for debugging
        logger.error(`🔍 Debug commands to find what's using the port:`, {
          commands: [
            `netstat -tlnp | grep :${config.port}`,
            `lsof -i :${config.port}`,
            `sudo kill -9 <PID>`, // Replace <PID> with the process ID
          ],
        });
      } else if (error.code === 'EACCES') {
        logger.error(
          `❌ PERMISSION DENIED: Cannot bind to port ${config.port}`,
          {
            port: config.port,
            error: error.message,
            solution: `Ports below 1024 require sudo privileges. Try using a port >= 1024 or run with sudo (not recommended)`,
          }
        );
      } else if (error.code === 'ENOTFOUND') {
        logger.error(`❌ NETWORK ERROR: Cannot resolve hostname`, {
          error: error.message,
          solution: `Check your network configuration and DNS settings`,
        });
      } else {
        logger.error(
          `❌ SERVER STARTUP ERROR: ${error.code ?? 'Unknown error'}`,
          {
            error: error.message,
            stack: error.stack,
            solution: `Check the error details above and server configuration`,
          }
        );
      }

      logger.error(
        `💡 TIP: Make sure no other instance of the backend is running!`
      );
      process.exit(1);
    });

    // NEW: Process monitoring for coordination system health
    if (config.repositoryCache?.enabled) {
      // Monitor every 5 minutes
      setInterval(
        () => {
          try {
            const coordinationMetrics = repositoryCoordinator.getMetrics();

            // Warn if too many repositories cached
            const maxRepos = config.repositoryCache?.maxRepositories || 50;
            if (coordinationMetrics.cachedRepositories > maxRepos * 0.9) {
              logger.warn('Repository cache nearing capacity', {
                cached: coordinationMetrics.cachedRepositories,
                max: maxRepos,
                utilizationPercent: Math.round(
                  (coordinationMetrics.cachedRepositories / maxRepos) * 100
                ),
              });
            }

            // Warn if too many active clones
            if (coordinationMetrics.activeClones > 5) {
              logger.warn('High number of active clone operations', {
                activeClones: coordinationMetrics.activeClones,
                suggestion:
                  'Consider increasing coordination timeouts or reducing concurrent requests',
              });
            }

            // Log efficiency metrics
            if (coordinationMetrics.duplicateClonesPrevented > 0) {
              logger.info('Repository coordination efficiency', {
                duplicateClonesPrevented:
                  coordinationMetrics.duplicateClonesPrevented,
                coalescedOperations: coordinationMetrics.coalescedOperations,
                cacheHitRate:
                  coordinationMetrics.cacheHits /
                  (coordinationMetrics.cacheHits +
                    coordinationMetrics.cacheMisses),
              });
            }
          } catch (monitorError) {
            logger.debug('Coordination monitoring failed', {
              error: monitorError,
            });
          }
        },
        5 * 60 * 1000
      ); // Every 5 minutes
    }

    // Initialize cache stats logging (moved from .then() callback)
    setTimeout(async () => {
      try {
        // Import cache stats for logging
        const { getCacheStats } = await import('./services/cache');
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

        // NEW: Log repository coordination system status
        if (config.repositoryCache?.enabled) {
          const coordinationMetrics = repositoryCoordinator.getMetrics();
          logger.info('Repository coordination system initialized', {
            cachedRepositories: coordinationMetrics.cachedRepositories,
            activeClones: coordinationMetrics.activeClones,
            totalDiskUsageMB: Math.round(
              coordinationMetrics.totalDiskUsageBytes / 1024 ** 2
            ),
          });

          // Log repository cache manager status
          const { getRepositoryCacheStats } = await import(
            './services/repositoryCache'
          );
          const cacheStats = getRepositoryCacheStats();
          logger.info('Repository cache manager initialized', {
            hierarchicalCaching: config.cacheStrategy?.hierarchicalCaching,
            cacheEntries: cacheStats.entries,
            memoryUsageMB: Math.round(cacheStats.memoryUsage.total / 1024 ** 2),
            hitRatios: cacheStats.hitRatios,
          });
        } else {
          logger.info('Repository coordination system disabled');
        }

        // Start enhanced metrics update scheduler
        const metricsInterval = setInterval(async () => {
          await updateCacheMetrics(); // Backward compatibility
          await updateAllEnhancedMetrics(); // New comprehensive metrics

          // Note: Coordination metrics are updated automatically by the coordinator
          // No need for separate updateCoordinationMetrics function
        }, 30000); // Every 30 seconds

        logger.info('Enhanced metrics scheduler started');

        // Store metricsInterval for cleanup during shutdown
        (server as any)._metricsInterval = metricsInterval;
      } catch (err) {
        logger.warn('Failed to get cache/coordination stats during startup', {
          err,
        });
      }
    }, 1000); // Wait 1 second for all systems to initialize

    // Setup graceful shutdown (moved from .then() callback)
    setupGracefulShutdown(server, async () => {
      try {
        // Stop metrics scheduler
        const metricsInterval = (server as any)._metricsInterval;
        if (metricsInterval) {
          clearInterval(metricsInterval);
          logger.info('Enhanced metrics scheduler stopped');
        }

        // NEW: Shutdown repository coordination systems
        if (config.repositoryCache?.enabled) {
          logger.info('Shutting down repository coordination systems...');

          const shutdownStart = Date.now();

          // Shutdown in order: coordinator → cache manager
          await repositoryCoordinator.shutdown();
          logger.info('Repository coordinator shutdown completed');

          await repositoryCache.shutdown();
          logger.info('Repository cache manager shutdown completed');

          const shutdownTime = Date.now() - shutdownStart;
          logger.info('Repository coordination systems shutdown completed', {
            shutdownTime,
          });
        }
      } catch (coordShutdownError) {
        logger.error('Error during coordination systems shutdown', {
          error: coordShutdownError,
        });
        // Don't throw - continue with other cleanup
      }
    });

    return { app, server };
  } catch (error) {
    logger.error('Failed to start application', { error });
    process.exit(1);
  }
}

// Only start the application if this file is run directly (not imported in tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  // Start the application with error handling
  logger.info('📋 About to call startApplication()...');
  startApplication()
    .then(() => {
      logger.info('✅ Application started successfully!');
    })
    .catch((error) => {
      logger.error('❌ Failed to start application:', { error });
      process.exit(1);
    });
}

/**
 * Helper function to handle server errors (for testing)
 */
export function handleServerError(error: NodeJS.ErrnoException) {
  if (error.code === 'EADDRINUSE') {
    logger.error(`❌ PORT CONFLICT: Port ${config.port} is already in use!`, {
      port: config.port,
      error: error.message,
      solution: `Please check if another process is using port ${config.port} or set a different PORT in your .env file`,
    });

    // Provide helpful commands for debugging
    logger.error(`🔍 Debug commands to find what's using the port:`, {
      commands: [
        `netstat -tlnp | grep :${config.port}`,
        `lsof -i :${config.port}`,
        `sudo kill -9 <PID>`, // Replace <PID> with the process ID
      ],
    });
  } else if (error.code === 'EACCES') {
    logger.error(`❌ PERMISSION DENIED: Cannot bind to port ${config.port}`, {
      port: config.port,
      error: error.message,
      solution: `Ports below 1024 require sudo privileges. Try using a port >= 1024 or run with sudo (not recommended)`,
    });
  } else if (error.code === 'ENOTFOUND') {
    logger.error(`❌ NETWORK ERROR: Cannot resolve hostname`, {
      error: error.message,
      solution: `Check your network configuration and DNS settings`,
    });
  } else {
    logger.error(`❌ SERVER STARTUP ERROR: ${error.code ?? 'Unknown error'}`, {
      error: error.message,
      stack: error.stack,
      solution: `Check the error details above and server configuration`,
    });
  }

  logger.error(
    `💡 TIP: Make sure no other instance of the backend is running!`
  );
  return error;
}

/**
 * Helper function to get coordination health (for testing)
 */
export function getCoordinationHealth(config: any) {
  if (!config.repositoryCache?.enabled) {
    return {
      status: 'disabled',
      message: 'Repository coordination is disabled',
    };
  }

  // This would normally get real coordination health
  return {
    status: 'healthy',
    coordination: {
      cachedRepositories: 0,
      activeClones: 0,
      duplicateClonesPrevented: 0,
    },
  };
}

/**
 * Helper function to calculate coordination health (for testing)
 */
export function calculateCoordinationHealth(metrics: any, cacheStats: any) {
  const isHealthy =
    metrics.activeClones < 10 && // Not too many active operations
    cacheStats.hitRatios.overall > 0.1; // Some cache efficiency

  return {
    status: isHealthy ? 'healthy' : 'unhealthy',
    coordination: {
      cachedRepositories: metrics.cachedRepositories,
      activeClones: metrics.activeClones,
      duplicateClonesPrevented: metrics.duplicateClonesPrevented,
    },
    cache: {
      hitRatios: cacheStats.hitRatios,
      entries: cacheStats.entries,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper function to handle coordination health errors (for testing)
 */
export function handleCoordinationHealthError(error: Error) {
  logger.error('Coordination health check failed', { error });
  return {
    status: 'error',
    message: 'Failed to get coordination health',
    error: error.message,
  };
}

export default {};
