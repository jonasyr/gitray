import { gitService } from '../services/gitService';
import { scheduleCleanup } from './cleanupScheduler';
import { withKeyLock } from './lockManager';

// Helper that clones a repository, runs a callback, then schedules cleanup

export async function withTempRepository<T>(
  repoUrl: string,
  callback: (tempDir: string) => Promise<T>
): Promise<T> {
  let tempDir: string | undefined;

  try {
    return await withKeyLock(repoUrl, async () => {
      // Clone the repository and forward the temp directory to the callback
      tempDir = await gitService.cloneRepository(repoUrl);
      return await callback(tempDir);
    });
  } finally {
    if (tempDir) {
      // Ensure cleanup even if the callback throws
      scheduleCleanup(tempDir);
    }
  }
}
