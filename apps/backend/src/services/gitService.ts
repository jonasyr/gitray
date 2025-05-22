import simpleGit, {
  SimpleGit,
  SimpleGitOptions,
} from 'simple-git';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { 
  Commit, 
  CommitFilterOptions,
  CommitAggregation,
  CommitHeatmapData
} from '../../../../packages/shared-types/src';

class GitService {
  private git: SimpleGit;

  constructor() {
    const gitOptions: Partial<SimpleGitOptions> = {
      baseDir: process.cwd(),
      binary: 'git',
      maxConcurrentProcesses: 6,
    };
    
    this.git = simpleGit(gitOptions);
    console.log('GitService initialized.');
  }

  /**
   * Clones a Git repository into a temporary directory.
   * @param repoUrl The URL of the repository to clone.
   * @returns A promise that resolves with the path to the temporary directory
   * where the repository was cloned.
   * @throws Will throw an error if cloning fails.
   */
  async cloneRepository(repoUrl: string): Promise<string> {
    let tempDir: string | undefined = undefined;
    console.log(`Attempting to clone repository: ${repoUrl}`);

    try {
      const tempDirPrefix = path.join(os.tmpdir(), 'git-visualizer-');
      tempDir = await mkdtemp(tempDirPrefix);
      console.log(`Created temporary directory: ${tempDir}`);

      const localGit = simpleGit(tempDir);

      await localGit.clone(repoUrl, '.');
      console.log(`Successfully cloned ${repoUrl} into ${tempDir}.`);

      return tempDir;
    } catch (error) {
      console.error(`Error cloning repository ${repoUrl}:`, error);
      if (tempDir) {
        try {
          console.log(
            `Attempting cleanup of failed clone directory: ${tempDir}`
          );
          await rm(tempDir, { recursive: true, force: true });
          console.log(`Cleaned up temporary directory: ${tempDir}`);
        } catch (cleanupError) {
          console.error(
            `Failed to cleanup temporary directory ${tempDir}:`,
            cleanupError
          );
        }
      }
      throw new Error(
        `Failed to clone repository: ${repoUrl}. Reason: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Retrieves the commit history from a local repository path.
   * @param localRepoPath The file system path to the cloned repository.
   * @returns A promise that resolves with an array of Commit objects.
   * @throws Will throw an error if reading the commit log fails.
   */
  async getCommits(localRepoPath: string): Promise<Commit[]> {
    console.log(`Attempting to read commits from: ${localRepoPath}`);
    try {
      const localGit: SimpleGit = simpleGit(localRepoPath);

      const raw = await localGit.raw([
        'log',
        '--pretty=format:%H|%cI|%an|%ae|%s',
      ]);

      const commits: Commit[] = raw
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const [hash, date, authorName, authorEmail, message] = line.split('|');
          if (!hash || !date || !authorName || !authorEmail || !message) {
            console.warn('Skipping commit with missing data:', line);
            return null;
          }
          return { sha: hash, message, date, authorName, authorEmail };
        })
        .filter((commit): commit is Commit => commit !== null);

      console.log(
        `Successfully retrieved ${commits.length} commits from ${localRepoPath}.`
      );
      return commits;
    } catch (error) {
      console.error(
        `Error reading commits from repository ${localRepoPath}:`,
        error
      );
      throw new Error(
        `Failed to get commits from repository: ${localRepoPath}. Reason: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Aggregates commit data by time periods.
   * @param commits Array of commits to aggregate
   * @param timePeriod The time period to aggregate by (day, week, month, year)
   * @param filterOptions Optional filter options
   * @returns Aggregated commit data for visualization
   */
  async aggregateCommitsByTime(
    commits: Commit[],
    filterOptions?: CommitFilterOptions
  ): Promise<CommitHeatmapData> {
    console.log('Aggregating commits by day', filterOptions);

    let filtered = [...commits];
    const filterAuthors = filterOptions?.authors ??
      (filterOptions?.author ? [filterOptions.author] : undefined);
    if (filterAuthors && filterAuthors.length > 0) {
      filtered = filtered.filter(c =>
        filterAuthors.some(a =>
          c.authorName.includes(a) || c.authorEmail.includes(a)
        )
      );
    }
    const endDate = filterOptions?.toDate
      ? new Date(filterOptions.toDate)
      : new Date();
    const startDate = filterOptions?.fromDate
      ? new Date(filterOptions.fromDate)
      : new Date(endDate.getTime() - 86400000 * 364);

    if (filterOptions?.fromDate) {
      filtered = filtered.filter(c => new Date(c.date) >= startDate);
    }
    if (filterOptions?.toDate) {
      filtered = filtered.filter(c => new Date(c.date) <= endDate);
    }

    const map = new Map<string, CommitAggregation>();
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const key = d.toISOString().split('T')[0];
      map.set(key, { periodStart: key, commitCount: 0, authors: [] });
    }

    let maxCommitCount = 0;
    filtered.forEach(c => {
      const key = new Date(c.date).toISOString().split('T')[0];
      const bucket = map.get(key);
      if (!bucket) return;
      bucket.commitCount += 1;
      if (!bucket.authors!.includes(c.authorName)) {
        bucket.authors!.push(c.authorName);
      }
      if (bucket.commitCount > maxCommitCount) {
        maxCommitCount = bucket.commitCount;
      }
    });

    const aggregatedData = Array.from(map.values());
    return {
      timePeriod: 'day',
      data: aggregatedData,
      metadata: {
        maxCommitCount,
        totalCommits: filtered.length,
      },
    };
  }

  /**
   * Cleans up (deletes) the temporary repository directory.
   * @param repoPath The path to the directory to delete.
   * @returns A promise that resolves when cleanup is complete.
   */
  async cleanupRepository(repoPath: string): Promise<void> {
    console.log(`Attempting cleanup of directory: ${repoPath}`);
    try {
      await rm(repoPath, { recursive: true, force: true });
      console.log(`Successfully cleaned up directory: ${repoPath}`);
    } catch (error) {
      console.error(`Error cleaning up directory ${repoPath}:`, error);
      throw new Error(
        `Failed to clean up repository directory: ${repoPath}. Reason: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const gitService = new GitService();
