import { Server } from 'http';
import logger from '../services/logger';
import redis from '../services/cache';
import { runCleanupQueue } from './cleanupScheduler';

let isShuttingDown = false;

export function setupGracefulShutdown(server: Server): void {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}, starting graceful shutdown...`);

    server.close(() => {
      logger.info('HTTP server closed');
    });

    try {
      const shutdownTimeout = setTimeout(() => {
        logger.error('Graceful shutdown timeout, forcing exit');
        process.exit(1);
      }, 30000);

      logger.info('Running final cleanup queue...');
      await runCleanupQueue();

      logger.info('Closing Redis connection...');
      await redis.quit();

      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed');
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
