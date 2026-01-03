import axios from 'axios';
import {
  Commit,
  CommitFilterOptions,
  CommitHeatmapData,
  FileTypeDistribution,
  CodeChurnAnalysis,
  RepositorySummary,
} from '@gitray/shared-types';

// Define the base URL for the API
// In development, Vite proxy will forward /api requests to http://localhost:3001
// In production, this would come from an environment variable
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Create an axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

/**
 * Fetches commit heatmap data (aggregated from ALL commits)
 * @param repoUrl The URL of the git repository
 * @param filterOptions Optional filters to apply
 * @returns Promise containing heatmap data
 */
export const getRepositoryHeatmap = async (
  repoUrl: string,
  filterOptions?: CommitFilterOptions
): Promise<CommitHeatmapData> => {
  try {
    // Ensure URL ends with .git for proper Git URL format
    const normalizedUrl = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;

    // Build query parameters
    const params = new URLSearchParams({ repoUrl: normalizedUrl });

    // Add filter options as flat query parameters
    if (filterOptions?.author) {
      params.append('author', filterOptions.author);
    }
    if (filterOptions?.authors && filterOptions.authors.length > 0) {
      params.append('authors', filterOptions.authors.join(','));
    }
    if (filterOptions?.fromDate) {
      params.append('fromDate', filterOptions.fromDate);
    }
    if (filterOptions?.toDate) {
      params.append('toDate', filterOptions.toDate);
    }

    const response = await apiClient.get('/api/repositories/heatmap', {
      params,
    });

    return response.data.heatmapData;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Log full error details for debugging heatmap
        console.error('[Heatmap API Error]:', {
          status: error.response.status,
          data: error.response.data,
          url: error.config?.url,
        });
        throw new Error(
          `Heatmap error (${error.response.status}): ${JSON.stringify(error.response.data)}`
        );
      } else if (error.request) {
        console.error('[Heatmap] No response from server');
        throw new Error(
          'No response from server. Please check your network connection.'
        );
      } else {
        throw new Error(`Error: ${error.message}`);
      }
    }
    console.error('[Heatmap] Unexpected error:', error);
    throw new Error('An unexpected error occurred');
  }
};

/**
 * Fetches paginated commits from a repository
 * @param repoUrl The URL of the git repository
 * @param page Page number (default: 1)
 * @param limit Items per page (default: 100)
 * @returns Promise containing paginated commits
 */
export const getRepositoryCommits = async (
  repoUrl: string,
  page: number = 1,
  limit: number = 100
): Promise<{ commits: Commit[]; page: number; limit: number }> => {
  try {
    // Ensure URL ends with .git for proper Git URL format
    const normalizedUrl = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;

    // Build query parameters
    const params = new URLSearchParams({
      repoUrl: normalizedUrl,
      page: page.toString(),
      limit: limit.toString(),
    });

    const response = await apiClient.get('/api/repositories/commits', {
      params,
    });

    return {
      commits: response.data.commits,
      page: response.data.page,
      limit: response.data.limit,
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new Error(
          `Server error: ${error.response.data?.error ?? error.message}`
        );
      } else if (error.request) {
        throw new Error(
          'No response from server. Please check your network connection.'
        );
      } else {
        throw new Error(`Error: ${error.message}`);
      }
    }
    throw new Error('An unexpected error occurred');
  }
};

/**
 * Fetches file type distribution analysis for a repository
 * @param repoUrl The URL of the git repository
 * @returns Promise containing file type distribution data
 */
export const getFileAnalysis = async (
  repoUrl: string
): Promise<FileTypeDistribution> => {
  try {
    // Ensure URL ends with .git for proper Git URL format
    const normalizedUrl = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;

    const params = new URLSearchParams({ repoUrl: normalizedUrl });
    // Correct endpoint path: /api/commits/file-analysis
    const response = await apiClient.get('/api/commits/file-analysis', {
      params,
    });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new Error(
          `Server error: ${error.response.data?.error ?? error.message}`
        );
      } else if (error.request) {
        throw new Error(
          'No response from server. Please check your network connection.'
        );
      } else {
        throw new Error(`Error: ${error.message}`);
      }
    }
    throw new Error('An unexpected error occurred');
  }
};

/**
 * Fetches code churn analysis for a repository
 * @param repoUrl The URL of the git repository
 * @returns Promise containing code churn data
 */
export const getCodeChurn = async (
  repoUrl: string
): Promise<CodeChurnAnalysis> => {
  try {
    // Ensure URL ends with .git for proper Git URL format
    const normalizedUrl = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;

    // Build query parameters (GET request instead of POST)
    const params = new URLSearchParams({ repoUrl: normalizedUrl });
    // Note: Backend churn endpoint accepts minChanges and extensions filters
    // but we're not using them here for simplicity (could be added as function parameters)

    const response = await apiClient.get('/api/repositories/churn', {
      params,
    });
    return response.data.churnData;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new Error(
          `Server error: ${error.response.data?.error ?? error.message}`
        );
      } else if (error.request) {
        throw new Error(
          'No response from server. Please check your network connection.'
        );
      } else {
        throw new Error(`Error: ${error.message}`);
      }
    }
    throw new Error('An unexpected error occurred');
  }
};

/**
 * Fetches repository summary statistics
 * @param repoUrl The URL of the git repository
 * @returns Promise containing repository summary data
 */
export const getRepositorySummary = async (
  repoUrl: string
): Promise<RepositorySummary> => {
  try {
    // Ensure URL ends with .git for proper Git URL format
    const normalizedUrl = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;

    const params = new URLSearchParams({ repoUrl: normalizedUrl });
    const response = await apiClient.get('/api/repositories/summary', {
      params,
    });
    return response.data.summary;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new Error(
          `Server error: ${error.response.data?.error ?? error.message}`
        );
      } else if (error.request) {
        throw new Error(
          'No response from server. Please check your network connection.'
        );
      } else {
        throw new Error(`Error: ${error.message}`);
      }
    }
    throw new Error('An unexpected error occurred');
  }
};

/**
 * Fetches both commits and heatmap data in a single request
 * @param repoUrl The URL of the git repository
 * @param _timePeriod The time period for aggregation (unused by backend, kept for compatibility)
 * @param page Page number (default: 1)
 * @param limit Items per page (default: 100)
 * @param filterOptions Optional filters to apply
 * @returns Promise containing commits, heatmap data, and pagination info
 */
export const getRepositoryFullData = async (
  repoUrl: string,
  _timePeriod?: 'day' | 'week' | 'month',
  page: number = 1,
  limit: number = 100,
  filterOptions?: CommitFilterOptions
): Promise<{
  commits: Commit[];
  heatmapData: CommitHeatmapData;
  page: number;
  limit: number;
  isValidHeatmap: boolean;
}> => {
  try {
    // Ensure URL ends with .git for proper Git URL format
    const normalizedUrl = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;

    // Build query parameters
    const params = new URLSearchParams({
      repoUrl: normalizedUrl,
      page: page.toString(),
      limit: limit.toString(),
    });

    // Add filter options as flat query parameters
    if (filterOptions?.author) {
      params.append('author', filterOptions.author);
    }
    if (filterOptions?.authors && filterOptions.authors.length > 0) {
      params.append('authors', filterOptions.authors.join(','));
    }
    if (filterOptions?.fromDate) {
      params.append('fromDate', filterOptions.fromDate);
    }
    if (filterOptions?.toDate) {
      params.append('toDate', filterOptions.toDate);
    }

    const response = await apiClient.get('/api/repositories/full-data', {
      params,
    });

    return {
      commits: response.data.commits,
      heatmapData: response.data.heatmapData,
      page: response.data.page,
      limit: response.data.limit,
      isValidHeatmap: response.data.isValidHeatmap,
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error('[Full-Data API Error]:', {
          status: error.response.status,
          data: error.response.data,
          url: error.config?.url,
        });
        throw new Error(
          `Full-data error (${error.response.status}): ${JSON.stringify(error.response.data)}`
        );
      } else if (error.request) {
        console.error('[Full-Data] No response from server');
        throw new Error(
          'No response from server. Please check your network connection.'
        );
      } else {
        throw new Error(`Error: ${error.message}`);
      }
    }
    console.error('[Full-Data] Unexpected error:', error);
    throw new Error('An unexpected error occurred');
  }
};

/**
 * Fetches all unique contributors from a repository (GDPR-compliant)
 * @param repoUrl The URL of the git repository
 * @param filterOptions Optional filters to apply
 * @returns Promise containing list of contributors with only login names
 */
export const getRepositoryContributors = async (
  repoUrl: string,
  filterOptions?: CommitFilterOptions
): Promise<Array<{ login: string }>> => {
  try {
    // Ensure URL ends with .git for proper Git URL format
    const normalizedUrl = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;

    // Build query parameters
    const params = new URLSearchParams({ repoUrl: normalizedUrl });

    // Add filter options as flat query parameters
    if (filterOptions?.author) {
      params.append('author', filterOptions.author);
    }
    if (filterOptions?.authors && filterOptions.authors.length > 0) {
      params.append('authors', filterOptions.authors.join(','));
    }
    if (filterOptions?.fromDate) {
      params.append('fromDate', filterOptions.fromDate);
    }
    if (filterOptions?.toDate) {
      params.append('toDate', filterOptions.toDate);
    }

    const response = await apiClient.get('/api/repositories/contributors', {
      params,
    });

    return response.data.contributors;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error('[Contributors API Error]:', {
          status: error.response.status,
          data: error.response.data,
          url: error.config?.url,
        });
        throw new Error(
          `Contributors error (${error.response.status}): ${JSON.stringify(error.response.data)}`
        );
      } else if (error.request) {
        console.error('[Contributors] No response from server');
        throw new Error(
          'No response from server. Please check your network connection.'
        );
      } else {
        throw new Error(`Error: ${error.message}`);
      }
    }
    console.error('[Contributors] Unexpected error:', error);
    throw new Error('An unexpected error occurred');
  }
};

export default {
  getRepositoryHeatmap,
  getRepositoryCommits,
  getFileAnalysis,
  getCodeChurn,
  getRepositorySummary,
  getRepositoryFullData,
  getRepositoryContributors,
};
