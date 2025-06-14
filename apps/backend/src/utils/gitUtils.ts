import simpleGit from 'simple-git';
import { config } from '../config';

// Utility to perform a shallow clone with a configurable depth

export async function shallowClone(
  repoUrl: string,
  targetDir: string,
  depth: number = config.git.cloneDepth
): Promise<void> {
  const git = simpleGit(targetDir);
  // Perform a shallow clone to limit bandwidth and disk usage
  await git.clone(repoUrl, '.', [
    '--depth',
    String(depth),
    '--no-single-branch',
  ]);
}
