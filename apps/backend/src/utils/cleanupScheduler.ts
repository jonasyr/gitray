import { TIME } from '@gitray/shared-types';
import { gitService } from '../services/gitService';
import logger from '../services/logger';

const queue: string[] = [];

export function scheduleCleanup(path: string): void {
  queue.push(path);
}

export async function runCleanupQueue(): Promise<void> {
  while (queue.length) {
    const repoPath = queue.shift();
    if (!repoPath) continue;
    try {
      await gitService.cleanupRepository(repoPath);
    } catch (error) {
      logger.error('Async cleanup failed', { repoPath, error });
    }
  }
}

setInterval(() => {
  void runCleanupQueue();
}, TIME.MINUTE);
