import { TIME } from '@gitray/shared-types';
import { gitService } from '../services/gitService';
import logger from '../services/logger';
import { cleanupQueueSize, tempDirectories } from '../services/metrics';

// Manages async cleanup of temporary repositories using a simple queue

const queue: string[] = [];
let intervalId: NodeJS.Timeout | null = null;

export function scheduleCleanup(path: string): void {
  queue.push(path);
  cleanupQueueSize.set(queue.length);
  tempDirectories.inc();
}

export async function runCleanupQueue(): Promise<void> {
  // Process the cleanup queue in small batches to avoid blocking the event loop
  const batchSize = 10;
  const toCleanup = queue.splice(0, batchSize);

  if (toCleanup.length === 0) return;

  logger.info(`Running cleanup for ${toCleanup.length} directories`);

  await Promise.all(
    toCleanup.map(async (repoPath) => {
      try {
        await gitService.cleanupRepository(repoPath);
        tempDirectories.dec();
      } catch (error) {
        logger.error('Async cleanup failed', { repoPath, error });
      }
    })
  );

  cleanupQueueSize.set(queue.length);
}

export function startCleanupScheduler(): void {
  // Begin interval loop if not already running
  if (intervalId) return;

  intervalId = setInterval(() => {
    void runCleanupQueue();
  }, TIME.MINUTE);

  logger.info('Cleanup scheduler started');
}

export function stopCleanupScheduler(): void {
  // Gracefully stop the interval when shutting down the server
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Cleanup scheduler stopped');
  }
}

export function getQueueStatus(): { size: number; items: string[] } {
  // Expose queue metrics for testing and monitoring
  return {
    size: queue.length,
    items: [...queue],
  };
}

// Kick off cleanup processing on startup (but not in test environment)
if (process.env.NODE_ENV !== 'test') {
  startCleanupScheduler();
}
