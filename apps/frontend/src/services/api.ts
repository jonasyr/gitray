import axios from 'axios';
import {
  Commit,
  TimePeriod,
  CommitFilterOptions,
  CommitHeatmapData,
  FileTypeDistribution,
  CodeChurnAnalysis,
} from '@gitray/shared-types';

// Define the base URL for the API
// In a production app, this would typically come from an environment variable
const API_BASE_URL = 'http://localhost:3001';

// Create an axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

/**
 * Fetches commits for a given repository URL
 * @param repoUrl The URL of the git repository
 * @returns Promise containing an array of commits
 */
export const getWorkspaceCommits = async (
  repoUrl: string
): Promise<Commit[]> => {
  try {
    // Ensure URL ends with .git for proper Git URL format
    const normalizedUrl = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;

    const response = await apiClient.post('/api/repositories', {
      repoUrl: normalizedUrl,
    });
    return response.data.commits;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        throw new Error(
          `Server error: ${error.response.data?.error ?? error.message}`
        );
      } else if (error.request) {
        // The request was made but no response was received
        throw new Error(
          'No response from server. Please check your network connection.'
        );
      } else {
        // Something happened in setting up the request
        throw new Error(`Error: ${error.message}`);
      }
    }
    // For non-Axios errors
    throw new Error('An unexpected error occurred');
  }
};

/**
 * Fetches heatmap data for a repository
 * @param repoUrl The URL of the git repository
 * @param timePeriod The time period to aggregate by
 * @param filterOptions Optional filters to apply
 * @returns Promise containing heatmap data
 */
export const getHeatmapData = async (
  repoUrl: string,
  timePeriod: TimePeriod,
  filterOptions?: CommitFilterOptions
): Promise<CommitHeatmapData> => {
  try {
    // Ensure URL ends with .git for proper Git URL format
    const normalizedUrl = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;

    const params = new URLSearchParams({ repoUrl: normalizedUrl, timePeriod });
    if (filterOptions?.authors && filterOptions.authors.length > 0) {
      params.append('authors', filterOptions.authors.join(','));
    } else if (filterOptions?.author) {
      params.append('author', filterOptions.author);
    }
    if (filterOptions?.fromDate)
      params.append('fromDate', filterOptions.fromDate);
    if (filterOptions?.toDate) params.append('toDate', filterOptions.toDate);

    const response = await apiClient.get('/api/commits/heatmap', { params });
    return response.data;
  } catch (error) {
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
 * @param timePeriod The time period to aggregate by
 * @param filterOptions Optional filters to apply
 * @returns Promise containing both commit and heatmap data
 */
export const getRepositoryFullData = async (
  repoUrl: string,
  timePeriod: TimePeriod = 'month',
  filterOptions?: CommitFilterOptions
): Promise<{ commits: Commit[]; heatmapData: CommitHeatmapData }> => {
  try {
    // Ensure URL ends with .git for proper Git URL format
    const normalizedUrl = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;

    const response = await apiClient.post('/api/repositories/full-data', {
      repoUrl: normalizedUrl,
      timePeriod,
      filterOptions,
    });

    return {
      commits: response.data.commits,
      heatmapData: response.data.heatmapData,
    };
  } catch (error) {
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
    const response = await apiClient.get('/api/commits/file-analysis', {
      params,
    });
    return response.data;
  } catch (error) {
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

    const response = await apiClient.post('/api/repositories/churn', {
      repoUrl: normalizedUrl,
      filterOptions: {
        limit: 50, // Request only top 50 files for performance
      },
    });
    return response.data.churnData;
  } catch (error) {
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

export default {
  getWorkspaceCommits,
  getHeatmapData,
  getRepositoryFullData,
  getFileAnalysis,
  getCodeChurn,
};
