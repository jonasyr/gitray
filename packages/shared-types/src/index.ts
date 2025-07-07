// packages/shared-types/src/index.ts

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
  periodStart: string;
  commitCount: number;
  authors?: string[];
  filesChanged?: number;
  linesAdded?: number;
  linesDeleted?: number;
}

/**
 * Represents a collection of aggregated commit data for visualization
 */
export interface CommitHeatmapData {
  timePeriod: TimePeriod;
  data: CommitAggregation[];
  metadata?: {
    maxCommitCount: number;
    totalCommits: number;
    filterOptions?: CommitFilterOptions;
    streamingUsed?: boolean;
  };
}

// ============================================================================
// CONSTANTS - Add these for the backend refactoring
// ============================================================================

/**
 * HTTP Status Codes
 */
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Time constants in milliseconds
 */
export const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Git service constants
 */
export const GIT_SERVICE = {
  MAX_CONCURRENT_PROCESSES: 6,
  CLONE_DEPTH: 1000, // Default depth for shallow clones
  TEMP_DIR_PREFIX: 'git-visualizer-',
  LOG_FORMAT: '%H|%cI|%an|%ae|%s',
} as const;

/**
 * Rate limiting constants
 */
export const RATE_LIMIT = {
  WINDOW_MS: 15 * TIME.MINUTE, // 15 minutes
  MAX_REQUESTS: 100,
  MESSAGE: 'Too many requests from this IP, please try again later.',
} as const;

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  INVALID_REPO_URL:
    'Invalid repository URL. Please provide a valid Git repository URL.',
  REPO_CLONE_FAILED: 'Failed to clone repository',
  COMMITS_FETCH_FAILED: 'Failed to fetch commits from repository',
  CLEANUP_FAILED: 'Failed to clean up repository directory',
  INTERNAL_ERROR: 'An internal error occurred',
  VALIDATION_FAILED: 'Validation failed',
  REPO_GET_COMMITS_FAILED: 'Failed to get commits from repository', // Added for consistency if used elsewhere
  REPO_CLEANUP_FAILED: 'Failed to clean up repository directory', // Added for consistency if used elsewhere
} as const;

/**
 * Custom error classes
 */
export class GitrayError extends Error {
  constructor(
    message: string,
    public statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    public code?: string
  ) {
    super(message);
    this.name = 'GitrayError';
  }
}

export class ValidationError extends GitrayError {
  constructor(
    message: string,
    public errors?: any[]
  ) {
    super(message, HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class RepositoryError extends GitrayError {
  constructor(
    message: string,
    public repoUrl?: string
  ) {
    super(message, HTTP_STATUS.BAD_REQUEST, 'REPOSITORY_ERROR');
    this.name = 'RepositoryError';
  }
}

export class TransactionRollbackError extends GitrayError {
  constructor(
    message: string,
    public transactionId?: string,
    public failedOperations?: string[]
  ) {
    super(
      message,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'TRANSACTION_ROLLBACK_ERROR'
    );
    this.name = 'TransactionRollbackError';
  }
}

// ============================================================================
// FILE ANALYSIS TYPES - New feature for file type distribution analysis
// ============================================================================

/**
 * File category for grouping file types
 */
export type FileCategory =
  | 'code'
  | 'documentation'
  | 'configuration'
  | 'assets'
  | 'other';

/**
 * File type statistics for a specific category or extension
 */
export interface FileTypeStats {
  /** Number of files in this category/extension */
  count: number;
  /** Percentage of total files */
  percentage: number;
  /** Total size in bytes */
  size: number;
  /** Average file size in bytes */
  averageSize: number;
}

/**
 * File information for analysis
 */
export interface FileInfo {
  /** Relative path from repository root */
  path: string;
  /** File extension (including dot) */
  extension: string;
  /** File category */
  category: FileCategory;
  /** File size in bytes */
  size: number;
  /** Last modified date (ISO 8601 format) */
  lastModified: string;
}

/**
 * Directory-level file distribution
 */
export interface DirectoryDistribution {
  /** Directory path relative to repository root */
  path: string;
  /** File type distribution within this directory */
  categories: Record<FileCategory, FileTypeStats>;
  /** Extension distribution within this directory */
  extensions: Record<string, FileTypeStats>;
  /** Total files in this directory */
  totalFiles: number;
  /** Total size of all files in this directory */
  totalSize: number;
  /** Subdirectories */
  subdirectories: DirectoryDistribution[];
}

/**
 * Complete file type distribution analysis
 */
export interface FileTypeDistribution {
  /** File type distribution by category */
  categories: Record<FileCategory, FileTypeStats>;
  /** File type distribution by extension */
  extensions: Record<string, FileTypeStats>;
  /** Directory-level analysis */
  directories: DirectoryDistribution[];
  /** Analysis metadata */
  metadata: {
    /** Total number of files analyzed */
    totalFiles: number;
    /** Total size of all files in bytes */
    totalSize: number;
    /** When the analysis was performed */
    analyzedAt: string;
    /** Repository size category for optimization */
    repositorySize: string;
    /** Git commit hash at time of analysis */
    commitHash?: string;
    /** Whether streaming mode was used */
    streamingUsed?: boolean;
  };
}

/**
 * Filter options for file analysis
 */
export interface FileAnalysisFilterOptions {
  /** Filter by specific file extensions */
  extensions?: string[];
  /** Filter by file categories */
  categories?: FileCategory[];
  /** Filter by directory paths */
  directories?: string[];
  /** Include hidden files (starting with .) */
  includeHidden?: boolean;
  /** Maximum directory depth to analyze */
  maxDepth?: number;
  /** Minimum file size in bytes */
  minFileSize?: number;
  /** Maximum file size in bytes */
  maxFileSize?: number;
}
