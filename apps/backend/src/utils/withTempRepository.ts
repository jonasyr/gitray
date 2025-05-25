import { gitService } from '../services/gitService';
import logger from '../services/logger';

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
      try {
        await gitService.cleanupRepository(tempDir);
      } catch (error) {
        logger.error('Failed to cleanup repository', { tempDir, error });
      }
    }
  }
}
