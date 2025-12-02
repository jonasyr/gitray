import simpleGit from 'simple-git';
import { config } from '../config';

// Utility to perform a shallow clone with a configurable depth

/**
 * FIX: Clone with full commit history using blob filtering
 * This approach:
 * - Fetches ALL commits from the default branch (complete history)
 * - Excludes file contents (blobs) to save 95-99% bandwidth
 * - Matches the behavior of repositorySummaryService for consistent commit counts
 *
 * Previous implementation used --depth which resulted in incomplete history
 * (e.g., 346 commits instead of 480 for gitray repo)
 */
export async function shallowClone(
  repoUrl: string,
  targetDir: string,
  depth: number = config.git.cloneDepth
): Promise<void> {
  const git = simpleGit(targetDir);

  // Use blob filtering instead of depth limiting for complete history
  // This matches the approach used by repositorySummaryService
  await git.init();
  await git.addRemote('origin', repoUrl);
  await git.raw(['config', 'core.sparseCheckout', 'true']);

  // Fetch all commits from default branch but exclude file contents (blobs)
  // This saves bandwidth while preserving full commit history
  await git.raw([
    'fetch',
    '--filter=blob:none', // Exclude file contents, keep commit history
    '--no-tags', // Skip tags to reduce bandwidth
    'origin',
    'HEAD', // Fetch default branch with full history
  ]);

  await git.raw(['checkout', 'FETCH_HEAD']);
}
