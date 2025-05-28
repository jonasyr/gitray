import { TIME } from '@gitray/shared-types';
import { gitService } from '../services/gitService';
import logger from '../services/logger';
import { cleanupQueueSize, tempDirectories } from '../services/metrics';

const queue: string[] = [];
let intervalId: NodeJS.Timeout | null = null;

export function scheduleCleanup(path: string): void {
  queue.push(path);
  cleanupQueueSize.set(queue.length);
  tempDirectories.inc();
}

export async function runCleanupQueue(): Promise<void> {
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
  if (intervalId) return;

  intervalId = setInterval(() => {
    void runCleanupQueue();
  }, TIME.MINUTE);

  logger.info('Cleanup scheduler started');
}

export function stopCleanupScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Cleanup scheduler stopped');
  }
}

export function getQueueStatus(): { size: number; items: string[] } {
  return {
    size: queue.length,
    items: [...queue],
  };
}

startCleanupScheduler();
