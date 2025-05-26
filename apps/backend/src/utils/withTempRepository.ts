import { gitService } from '../services/gitService';
import { scheduleCleanup } from './cleanupScheduler';

export async function withTempRepository<T>(
  repoUrl: string,
  callback: (tempDir: string) => Promise<T>
): Promise<T> {
  let tempDir: string | undefined;

  try {
    tempDir = await gitService.cloneRepository(repoUrl);
    return await callback(tempDir);
  } finally {
    if (tempDir) {
      scheduleCleanup(tempDir);
    }
  }
}
