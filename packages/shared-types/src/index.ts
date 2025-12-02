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
    public readonly statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'GitrayError';
  }
}

export class ValidationError extends GitrayError {
  constructor(
    message: string,
    public readonly errors?: any[]
  ) {
    super(message, HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class RepositoryError extends GitrayError {
  constructor(
    message: string,
    public readonly repoUrl?: string
  ) {
    super(message, HTTP_STATUS.BAD_REQUEST, 'REPOSITORY_ERROR');
    this.name = 'RepositoryError';
  }
}

export class TransactionRollbackError extends GitrayError {
  constructor(
    message: string,
    public readonly transactionId?: string,
    public readonly failedOperations?: string[]
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
    /** Applied filter options */
    filterOptions?: FileAnalysisFilterOptions;
    /** Cache strategy used */
    cacheStrategy?: string;
    /** Processing time in milliseconds */
    processingTime?: number;
    /** Repository coordination metrics */
    coordinationMetrics?: any;
    // NEW: Performance optimization metadata
    /** Performance metrics for this analysis */
    performanceMetrics?: PerformanceMetrics;
    /** Repository characteristics determined */
    repositoryCharacteristics?: RepositoryCharacteristics;
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

// ============================================================================
// PERFORMANCE OPTIMIZATION TYPES - Phase 2.5 Critical Enhancement
// ============================================================================

/**
 * Analysis method used to extract file information from repository
 */
export type AnalysisMethod =
  | 'full-clone' // Current method: full repository clone (most resource intensive)
  | 'shallow-clone' // Shallow clone with blob filtering (moderate optimization)
  | 'ls-tree-remote' // Git ls-tree on remote repository (highest optimization)
  | 'ls-tree-local' // Git ls-tree on local clone (for cached repositories)
  | 'cached'; // Data retrieved from cache (no analysis needed)

/**
 * Source of file data for analysis
 */
export type DataSource =
  | 'git-ls-tree' // From git ls-tree commands
  | 'filesystem-walk' // From actual filesystem traversal
  | 'cache-hit'; // From cached analysis results

/**
 * Repository characteristics for method selection optimization
 */
export interface RepositoryCharacteristics {
  /** Estimated repository size category */
  sizeCategory: 'small' | 'medium' | 'large' | 'xl';
  /** Estimated number of files */
  estimatedFiles: number;
  /** Estimated total repository size in bytes */
  estimatedSize: number;
  /** Whether remote ls-tree is available */
  supportsRemoteLsTree: boolean;
  /** Whether shallow cloning is recommended */
  recommendShallowClone: boolean;
  /** Current commit hash for cache invalidation */
  currentCommitHash?: string;
  /** Last analysis timestamp for cache decisions */
  lastAnalyzed?: string;
}

/**
 * Performance metrics for analysis method tracking
 */
export interface PerformanceMetrics {
  /** Analysis method used */
  analysisMethod: AnalysisMethod;
  /** Source of file data */
  dataSource: DataSource;
  /** Bandwidth used in bytes */
  bandwidthUsed: number;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Cache hit rate (0.0 to 1.0) */
  cacheHitRate: number;
  /** Performance improvement factor vs full clone baseline */
  performanceGain: number;
  /** Estimated bandwidth saved vs full clone */
  bandwidthSaved: number;
  /** Whether file tree was cached for future use */
  fileTreeCached: boolean;
  /** Method selection reasoning for debugging */
  selectionReason: string;
}

// ============================================================================
// CONTRIBUTOR STATISTICS - Top Contributors Feature
// ============================================================================

/**
 * Represents a repository contributor
 * GDPR-compliant: contains only the author name, no statistics or ranking
 */
export interface Contributor {
  /**
   * Git author name (pseudonymized identifier for GDPR compliance).
   * Uses the author's configured git name, not email address.
   */
  login: string;
}

// ============================================================================
// CODE CHURN ANALYSIS - File Change Frequency and Risk Analysis
// ============================================================================

/**
 * Risk level classification for file churn
 */
export type ChurnRiskLevel = 'high' | 'medium' | 'low';

/**
 * File churn data representing change frequency and risk level
 */
export interface FileChurnData {
  /** Relative path from repository root */
  path: string;
  /** Number of times this file has been modified */
  changes: number;
  /** Risk level based on change frequency */
  risk: ChurnRiskLevel;
  /** File extension (e.g., '.ts', '.js') */
  extension?: string;
  /** Date of first modification */
  firstChange?: string;
  /** Date of last modification */
  lastChange?: string;
  /** Number of unique authors who modified this file */
  authorCount?: number;
}

/**
 * Filter options for code churn analysis
 */
export interface ChurnFilterOptions {
  /** Start date for analysis period (ISO 8601 format) */
  since?: string;
  /** End date for analysis period (ISO 8601 format) */
  until?: string;
  /** Filter by specific file extensions (e.g., ['ts', 'js']) */
  extensions?: string[];
  /** Minimum number of changes to include in results */
  minChanges?: number;
  /** Filter by specific file paths or patterns */
  paths?: string[];
  /** Filter by specific risk levels */
  riskLevels?: ChurnRiskLevel[];
}

/**
 * Thresholds for determining risk levels based on change counts
 */
export interface ChurnRiskThresholds {
  /** Minimum changes for high risk (default: 30) */
  high: number;
  /** Minimum changes for medium risk (default: 15) */
  medium: number;
  /** Maximum changes for low risk (anything below medium threshold) */
  low: number;
}

/**
 * Complete code churn analysis results
 */
export interface CodeChurnAnalysis {
  /** List of files with their churn data */
  files: FileChurnData[];
  /** Analysis metadata */
  metadata: {
    /** Total number of files analyzed */
    totalFiles: number;
    /** Total number of changes across all files */
    totalChanges: number;
    /** Risk level thresholds used for this analysis */
    riskThresholds: ChurnRiskThresholds;
    /** Date range analyzed */
    dateRange: {
      from: string;
      to: string;
    };
    /** Number of high risk files */
    highRiskCount: number;
    /** Number of medium risk files */
    mediumRiskCount: number;
    /** Number of low risk files */
    lowRiskCount: number;
    /** When the analysis was performed */
    analyzedAt: string;
    /** Whether streaming mode was used */
    streamingUsed?: boolean;
    /** Applied filter options */
    filterOptions?: ChurnFilterOptions;
    /** Processing time in milliseconds */
    processingTime?: number;
    /** Whether results were cached */
    fromCache?: boolean;
  };
}

// ============================================================================
// REPOSITORY SUMMARY - Repository Metadata and Statistics
// ============================================================================

/**
 * Git hosting platform identifier
 */
export type RepositoryPlatform = 'github' | 'gitlab' | 'bitbucket' | 'other';

/**
 * Repository activity status based on last commit recency
 */
export type RepositoryStatus = 'active' | 'inactive' | 'archived' | 'empty';

/**
 * Source of repository creation date information
 */
export type CreatedDateSource = 'first-commit' | 'git-api' | 'platform-api';

/**
 * Parsed repository URL components
 */
export interface RepositoryUrlInfo {
  /** Detected hosting platform */
  platform: RepositoryPlatform;
  /** Repository owner/organization */
  owner: string;
  /** Repository name */
  name: string;
  /** Normalized full URL */
  fullUrl: string;
}

/**
 * Comprehensive repository summary statistics
 */
export interface RepositorySummary {
  repository: {
    name: string;
    owner: string;
    url: string;
    platform: RepositoryPlatform;
  };
  created: {
    /** ISO 8601 timestamp of repository creation */
    date: string;
    /** How the creation date was determined */
    source: CreatedDateSource;
  };
  age: {
    /** Full years since creation */
    years: number;
    /** Remaining months after full years */
    months: number;
    /** Human-readable formatted age (e.g., "5.7y") */
    formatted: string;
  };
  lastCommit: {
    /** ISO 8601 timestamp of last commit */
    date: string;
    /** Human-readable relative time (e.g., "2 days ago") */
    relativeTime: string;
    /** Commit SHA hash */
    sha: string;
    /** Commit author name */
    author: string;
  };
  stats: {
    /** Total number of commits in repository */
    totalCommits: number;
    /** Number of unique contributors */
    contributors: number;
    /** Activity status classification */
    status: RepositoryStatus;
  };
  metadata: {
    /** Whether data was retrieved from cache */
    cached: boolean;
    /** Source of the data */
    dataSource: 'git-sparse-clone' | 'cache';
    /** Accuracy of creation date */
    createdDateAccuracy: 'exact' | 'approximate';
    /** Bandwidth savings description */
    bandwidthSaved: string;
    /** When this summary was last updated */
    lastUpdated: string;
  };
}
