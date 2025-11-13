import { Server } from 'node:http';
import { getLogger } from '../services/logger';
import redis from '../services/cache';
import { runCleanupQueue } from './cleanupScheduler';
import { shutdownLockManager } from './lockManager';

const logger = getLogger();

/**
 * ENHANCED GRACEFUL SHUTDOWN:
 * Now properly handles all new cache systems and lock manager
 *
 * IMPROVEMENTS:
 * 1. Added Lock Manager shutdown
 * 2. Enhanced error handling for all shutdown operations
 * 3. Better logging of shutdown progress
 * 4. Configurable shutdown timeout
 */

// Guard to prevent running shutdown sequence multiple times
let isShuttingDown = false;

// Optional cleanup callbacks to run during shutdown
const cleanupCallbacks: (() => void)[] = [];

export function setupGracefulShutdown(
  server: Server,
  additionalCleanup?: () => void
): void {
  if (additionalCleanup) {
    cleanupCallbacks.push(additionalCleanup);
  }
  // Register signal handlers for graceful shutdown
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}, starting graceful shutdown...`);

    server.close(() => {
      logger.info('HTTP server closed');
    });

    try {
      // Configurable shutdown timeout (default 30 seconds)
      const shutdownTimeoutMs =
        Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS) || 30000;

      const shutdownTimeout = setTimeout(() => {
        logger.error('Graceful shutdown timeout, forcing exit');
        process.exit(1);
      }, shutdownTimeoutMs);

      logger.info('Running final cleanup queue...');
      await runCleanupQueue();

      logger.info('Shutting down lock manager...');
      try {
        await shutdownLockManager();
        logger.info('Lock manager shutdown completed');
      } catch (lockErr) {
        logger.error('Lock manager shutdown failed', { err: lockErr });
        // Continue with other shutdowns
      }

      logger.info('Closing cache connections...');
      try {
        await redis.quit();
        logger.info('Cache connections closed');
      } catch (cacheErr) {
        logger.error('Cache shutdown failed', { err: cacheErr });
        // Continue with other shutdowns
      }

      // Run additional cleanup callbacks
      if (cleanupCallbacks.length > 0) {
        logger.info('Running additional cleanup callbacks...');
        try {
          cleanupCallbacks.forEach((callback) => callback());
          logger.info('Additional cleanup callbacks completed');
        } catch (cleanupErr) {
          logger.error('Additional cleanup failed', { err: cleanupErr });
        }
      }

      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed successfully');

      // Log final statistics
      try {
        const { getCacheStats } = await import('../services/cache');
        const { getLockMetrics } = await import('./lockManager');

        logger.info('Final system statistics', {
          cache: getCacheStats(),
          locks: getLockMetrics(),
        });
      } catch (statsErr) {
        logger.debug('Could not get final statistics', { err: statsErr });
      }

      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught exception', error);
    await shutdown('uncaughtException');
  });
  process.on('unhandledRejection', async (reason) => {
    logger.error('Unhandled rejection', reason);
    await shutdown('unhandledRejection');
  });

  logger.info('Graceful shutdown handler registered');
}

export function isServerShuttingDown(): boolean {
  return isShuttingDown;
}
