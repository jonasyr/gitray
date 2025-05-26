import simpleGit from 'simple-git';
import { GIT_SERVICE } from '@gitray/shared-types';

export async function shallowClone(
  repoUrl: string,
  targetDir: string,
  depth: number = GIT_SERVICE.CLONE_DEPTH
): Promise<void> {
  const git = simpleGit(targetDir);
  await git.clone(repoUrl, '.', [
    '--depth',
    String(depth),
    '--no-single-branch',
  ]);
}
