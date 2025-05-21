import simpleGit, {
  SimpleGit,
  SimpleGitOptions,
  DefaultLogFields,
} from 'simple-git';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { 
  Commit, 
  TimePeriod, 
  CommitFilterOptions, 
  CommitAggregation, 
  CommitHeatmapData 
} from '../../../../packages/shared-types/src';

// Define the fields we expect from simple-git log based on the default structure
interface GitLogEntry extends DefaultLogFields {
  hash: string;
  date: string; // ISO 8601 format string
  message: string;
  author_name: string;
  author_email: string;
}

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

      const cloneOptions = {
        '--depth': 50,
      };
      await localGit.clone(repoUrl, '.', cloneOptions);
      console.log(
        `Successfully cloned ${repoUrl} into ${tempDir} with depth 50.`
      );

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
   * @param maxCount The maximum number of commits to retrieve (default: 100).
   * @returns A promise that resolves with an array of Commit objects.
   * @throws Will throw an error if reading the commit log fails.
   */
  async getCommits(
    localRepoPath: string,
    maxCount: number = 100
  ): Promise<Commit[]> {
    console.log(
      `Attempting to read commits from: ${localRepoPath}, maxCount: ${maxCount}`
    );
    try {
      // Create a simple-git instance specifically for the repo path
      const localGit: SimpleGit = simpleGit(localRepoPath);

      // Use git.log to retrieve commits.
      const logOptions = {
        maxCount: maxCount,
      };

      const log = await localGit.log<GitLogEntry>(logOptions);

      // Map the result to our shared Commit interface
      const commits: Commit[] = log.all
        .map((entry: GitLogEntry) => {
          // Basic validation
          if (
            !entry.hash ||
            !entry.message ||
            !entry.date ||
            !entry.author_name ||
            !entry.author_email
          ) {
            console.warn('Skipping commit with missing data:', entry);
            return null;
          }
          return {
            sha: entry.hash,
            message: entry.message,
            date: entry.date,
            authorName: entry.author_name,
            authorEmail: entry.author_email,
          };
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
    timePeriod: TimePeriod,
    filterOptions?: CommitFilterOptions
  ): Promise<CommitHeatmapData> {
    console.log(`Aggregating commits by ${timePeriod}`, filterOptions);
    
    // Apply filters if provided
    let filteredCommits = [...commits];
    
    if (filterOptions) {
      if (filterOptions.author) {
        filteredCommits = filteredCommits.filter(commit => 
          commit.authorName.includes(filterOptions.author!) || 
          commit.authorEmail.includes(filterOptions.author!)
        );
      }
      
      if (filterOptions.fromDate) {
        const fromDate = new Date(filterOptions.fromDate);
        filteredCommits = filteredCommits.filter(commit => 
          new Date(commit.date) >= fromDate
        );
      }
      
      if (filterOptions.toDate) {
        const toDate = new Date(filterOptions.toDate);
        filteredCommits = filteredCommits.filter(commit => 
          new Date(commit.date) <= toDate
        );
      }
    }
    
    // Create a map to aggregate commits by time period
    const aggregationMap = new Map<string, CommitAggregation>();
    let maxCommitCount = 0;
    
    // Process each commit
    filteredCommits.forEach(commit => {
      const date = new Date(commit.date);
      let periodKey: string;
      
      // Determine the period key based on the time period
      switch (timePeriod) {
        case 'day':
          // Format: YYYY-MM-DD
          periodKey = date.toISOString().split('T')[0];
          break;
        case 'week': {
          // Get the first day of the week (Sunday)
          const dayOfWeek = date.getUTCDay();
          const firstDayOfWeek = new Date(date);
          firstDayOfWeek.setUTCDate(date.getUTCDate() - dayOfWeek);
          periodKey = firstDayOfWeek.toISOString().split('T')[0];
          break;
        }
        case 'month':
          // Format: YYYY-MM
          periodKey = date.toISOString().substring(0, 7);
          break;
        case 'year':
          // Format: YYYY
          periodKey = date.toISOString().substring(0, 4);
          break;
        default:
          periodKey = date.toISOString().split('T')[0]; // Default to day
      }
      
      // Update or create the aggregation for this period
      if (aggregationMap.has(periodKey)) {
        const existing = aggregationMap.get(periodKey)!;
        existing.commitCount += 1;
        
        // Update authors if not already included
        if (!existing.authors?.includes(commit.authorName)) {
          existing.authors = [...(existing.authors || []), commit.authorName];
        }
        
        // Update max commit count if needed
        if (existing.commitCount > maxCommitCount) {
          maxCommitCount = existing.commitCount;
        }
      } else {
        aggregationMap.set(periodKey, {
          periodStart: periodKey,
          commitCount: 1,
          authors: [commit.authorName]
        });
        
        // Update max commit count if needed
        if (1 > maxCommitCount) {
          maxCommitCount = 1;
        }
      }
    });
    
    // Convert the map to an array and sort by period start
    const aggregatedData = Array.from(aggregationMap.values())
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    
    // Create the result
    const result: CommitHeatmapData = {
      timePeriod,
      data: aggregatedData,
      metadata: {
        maxCommitCount,
        totalCommits: filteredCommits.length,
        filterOptions
      }
    };
    
    console.log(`Generated heatmap data with ${aggregatedData.length} time periods`);
    return result;
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