/**
 * Represents a Git author.
 */
export interface Author {
  name: string;
  email: string;
}

/**
 * Represents a Git commit.
 */
export interface Commit {
  sha: string;
  message: string;
  date: string; // ISO 8601 format string
  authorName: string;
  authorEmail: string;
}

/**
 * Time period for commit aggregation
 */
export type TimePeriod = 'day' | 'week' | 'month' | 'year';

/**
 * Filter options for commit aggregation
 */
export interface CommitFilterOptions {
  /** Single author filter (deprecated in favor of `authors`) */
  author?: string;

  /**
   * Filter commits by multiple authors. When provided, takes precedence over
   * `author`.
   */
  authors?: string[];
  fileExtension?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Represents aggregated commit data for a time period
 */
export interface CommitAggregation {
  // The start date of this time period (ISO 8601 format)
  periodStart: string;

  // Number of commits in this time period
  commitCount: number;

  // Optional: unique authors who committed in this period
  authors?: string[];

  // Optional: files changed in this period
  filesChanged?: number;

  // Optional: lines added in this period
  linesAdded?: number;

  // Optional: lines deleted in this period
  linesDeleted?: number;
}

/**
 * Represents a collection of aggregated commit data for visualization
 */
export interface CommitHeatmapData {
  // The time period used for aggregation
  timePeriod: TimePeriod;

  // The aggregated commit data
  data: CommitAggregation[];

  // Optional metadata about the aggregation
  metadata?: {
    // Maximum commit count in any single period
    maxCommitCount: number;

    // Total commits in the entire dataset
    totalCommits: number;

    // Filter options used for this aggregation
    filterOptions?: CommitFilterOptions;
  };
}
