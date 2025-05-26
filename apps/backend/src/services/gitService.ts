import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import Redis from 'ioredis';
import {
  parseISO,
  eachDayOfInterval,
  subDays,
  startOfDay,
  isAfter,
  isBefore,
  format,
} from 'date-fns';
import {
  Commit,
  CommitFilterOptions,
  CommitAggregation,
  CommitHeatmapData,
  GIT_SERVICE,
  ERROR_MESSAGES,
  RepositoryError,
} from '@gitray/shared-types';
import logger from '../services/logger';
import { config } from '../config';

class GitService {
  private git: SimpleGit;
  private redis: Redis;

  constructor() {
    const gitOptions: Partial<SimpleGitOptions> = {
      baseDir: process.cwd(),
      binary: 'git',
      maxConcurrentProcesses: GIT_SERVICE.MAX_CONCURRENT_PROCESSES,
    };

    this.git = simpleGit(gitOptions);
    this.redis = new Redis(config.redis);
    logger.info('GitService initialized.');
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
    logger.info(`Attempting to clone repository: ${repoUrl}`);

    try {
      const tempDirPrefix = path.join(os.tmpdir(), GIT_SERVICE.TEMP_DIR_PREFIX);
      tempDir = await mkdtemp(tempDirPrefix);
      logger.info(`Created temporary directory: ${tempDir}`);

      const localGit = simpleGit(tempDir);

      await localGit.clone(repoUrl, '.', [
        '--depth',
        String(GIT_SERVICE.CLONE_DEPTH),
        '--no-single-branch',
      ]);
      logger.info(`Successfully cloned ${repoUrl} into ${tempDir}.`);

      return tempDir;
    } catch (error) {
      logger.error(`Error cloning repository ${repoUrl}`, { error, repoUrl });
      if (tempDir) {
        try {
          logger.info(
            `Attempting cleanup of failed clone directory: ${tempDir}`
          );
          await rm(tempDir, { recursive: true, force: true });
          logger.info(`Cleaned up temporary directory: ${tempDir}`);
        } catch (cleanupError) {
          logger.error(`Failed to cleanup temporary directory ${tempDir}`, {
            cleanupError,
            tempDir,
          });
        }
      }
      throw new RepositoryError(
        `${ERROR_MESSAGES.REPO_CLONE_FAILED}: ${error instanceof Error ? error.message : String(error)}`,
        repoUrl
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
    logger.info(`Attempting to read commits from: ${localRepoPath}`);
    try {
      const localGit: SimpleGit = simpleGit(localRepoPath);

      const raw = await localGit.raw([
        'log',
        '--pretty=format:' + GIT_SERVICE.LOG_FORMAT,
      ]);

      const commits: Commit[] = raw
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, date, authorName, authorEmail, message] =
            line.split('|');
          if (!hash || !date || !authorName || !authorEmail || !message) {
            logger.warn('Skipping commit with missing data', { line });
            return null;
          }
          return { sha: hash, message, date, authorName, authorEmail };
        })
        .filter((commit): commit is Commit => commit !== null);

      logger.info(
        `Successfully retrieved ${commits.length} commits from ${localRepoPath}.`
      );
      return commits;
    } catch (error) {
      logger.error(`Error reading commits from repository ${localRepoPath}`, {
        error,
        localRepoPath,
      });
      throw new RepositoryError(
        `${ERROR_MESSAGES.COMMITS_FETCH_FAILED}: ${error instanceof Error ? error.message : String(error)}`,
        localRepoPath
      );
    }
  }

  private filterByAuthors(commits: Commit[], authors?: string[]): Commit[] {
    if (!authors || authors.length === 0) {
      return commits;
    }
    return commits.filter((c) =>
      authors.some((a) => c.authorName.includes(a) || c.authorEmail.includes(a))
    );
  }

  private filterByDateRange(
    commits: Commit[],
    startDate: Date,
    endDate: Date
  ): Commit[] {
    return commits.filter((c) => {
      const commitDate = parseISO(c.date);
      return !isBefore(commitDate, startDate) && !isAfter(commitDate, endDate);
    });
  }

  private createDateBuckets(
    startDate: Date,
    endDate: Date
  ): Map<string, CommitAggregation> {
    const buckets = new Map<string, CommitAggregation>();
    eachDayOfInterval({
      start: startOfDay(startDate),
      end: startOfDay(endDate),
    }).forEach((d) => {
      const key = format(d, 'yyyy-MM-dd');
      buckets.set(key, { periodStart: key, commitCount: 0, authors: [] });
    });
    return buckets;
  }

  private tallyCommits(
    commits: Commit[],
    buckets: Map<string, CommitAggregation>
  ): number {
    let max = 0;
    commits.forEach((c) => {
      const key = format(parseISO(c.date), 'yyyy-MM-dd');
      const bucket = buckets.get(key);
      if (!bucket) return;
      bucket.commitCount += 1;
      if (!bucket.authors!.includes(c.authorName)) {
        bucket.authors!.push(c.authorName);
      }
      if (bucket.commitCount > max) {
        max = bucket.commitCount;
      }
    });
    return max;
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
    logger.info('Aggregating commits by day', { filterOptions });

    const endDate = filterOptions?.toDate
      ? parseISO(filterOptions.toDate)
      : new Date();
    const startDate = filterOptions?.fromDate
      ? parseISO(filterOptions.fromDate)
      : subDays(endDate, 364);

    const authors =
      filterOptions?.authors ??
      (filterOptions?.author ? [filterOptions.author] : undefined);

    let filtered = this.filterByAuthors(commits, authors);
    filtered = this.filterByDateRange(filtered, startDate, endDate);

    const buckets = this.createDateBuckets(startDate, endDate);
    const maxCommitCount = this.tallyCommits(filtered, buckets);

    const aggregatedData = Array.from(buckets.values());
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
    logger.info(`Attempting cleanup of directory: ${repoPath}`);
    try {
      await rm(repoPath, { recursive: true, force: true });
      logger.info(`Successfully cleaned up directory: ${repoPath}`);
    } catch (error) {
      logger.error(`Error cleaning up directory ${repoPath}`, {
        error,
        repoPath,
      });
      throw new RepositoryError(
        `${ERROR_MESSAGES.CLEANUP_FAILED}: ${error instanceof Error ? error.message : String(error)}`,
        repoPath
      );
    }
  }
}

export const gitService = new GitService();
