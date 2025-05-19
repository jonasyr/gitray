import simpleGit, {
  SimpleGit,
  SimpleGitOptions,
  DefaultLogFields,
} from 'simple-git'; // Import necessary types
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';

// Define the Commit interface directly since we're having issues with shared-types
interface Commit {
  sha: string;
  message: string;
  date: string;
  authorName: string;
  authorEmail: string;
}

// Optional: Define more specific options if needed
const gitOptions: Partial<SimpleGitOptions> = {
  baseDir: process.cwd(),
  binary: 'git',
  maxConcurrentProcesses: 6,
};

// Define the fields we expect from simple-git log based on the default structure
// Note: simple-git types might evolve, adjust if needed.
// This interface helps ensure we handle the expected log data.
interface GitLogEntry extends DefaultLogFields {
  hash: string;
  date: string; // ISO 8601 format string
  message: string;
  author_name: string;
  author_email: string;
  // refs, body, etc. are also available if needed later
}

class GitService {
  private git: SimpleGit;

  constructor() {
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
      // The default log format includes the necessary fields.
      // We limit the number of commits using maxCount.
      const logOptions = {
        maxCount: maxCount,
      };

      const log = await localGit.log<GitLogEntry>(logOptions); // Specify expected type

      // Map the result from simple-git log to our shared Commit interface
      const commits: Commit[] = log.all
        .map((entry: GitLogEntry) => {
          // Basic validation (optional, but good practice)
          if (
            !entry.hash ||
            !entry.message ||
            !entry.date ||
            !entry.author_name ||
            !entry.author_email
          ) {
            console.warn('Skipping commit with missing data:', entry);
            return null; // Skip this entry if essential data is missing
          }
          return {
            sha: entry.hash,
            message: entry.message,
            date: entry.date, // Already in ISO 8601 string format
            authorName: entry.author_name,
            authorEmail: entry.author_email,
          };
        })
        .filter((commit): commit is Commit => commit !== null); // Filter out any null entries

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
// export default GitService; // Uncomment if you prefer exporting the class