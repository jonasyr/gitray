import simpleGit from 'simple-git';
import { GIT_SERVICE } from '@gitray/shared-types';

// Utility to perform a shallow clone with a configurable depth

export async function shallowClone(
  repoUrl: string,
  targetDir: string,
  depth: number = GIT_SERVICE.CLONE_DEPTH
): Promise<void> {
  const git = simpleGit(targetDir);
  // Perform a shallow clone to limit bandwidth and disk usage
  await git.clone(repoUrl, '.', [
    '--depth',
    String(depth),
    '--no-single-branch',
  ]);
}
