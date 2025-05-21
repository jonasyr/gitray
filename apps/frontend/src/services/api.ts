import axios from 'axios';
import { 
  Commit, 
  TimePeriod, 
  CommitFilterOptions, 
  CommitHeatmapData 
} from '../../../../packages/shared-types/src';

// Define the base URL for the API
// In a production app, this would typically come from an environment variable
const API_BASE_URL = 'http://localhost:3001';

// Create an axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Fetches commits for a given repository URL
 * @param repoUrl The URL of the git repository
 * @returns Promise containing an array of commits
 */
export const getWorkspaceCommits = async (repoUrl: string): Promise<Commit[]> => {
  try {
    const response = await apiClient.post('/api/repositories', { repoUrl });
    return response.data.commits;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        throw new Error(`Server error: ${error.response.data?.error || error.message}`);
      } else if (error.request) {
        // The request was made but no response was received
        throw new Error('No response from server. Please check your network connection.');
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
    const params = new URLSearchParams({ repoUrl, timePeriod });
    if (filterOptions?.author) params.append('author', filterOptions.author);
    if (filterOptions?.fromDate) params.append('fromDate', filterOptions.fromDate);
    if (filterOptions?.toDate) params.append('toDate', filterOptions.toDate);
    if (filterOptions?.fileExtension) params.append('fileExtension', filterOptions.fileExtension);

    const response = await apiClient.get('/api/commits/heatmap', { params });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new Error(`Server error: ${error.response.data?.error || error.message}`);
      } else if (error.request) {
        throw new Error('No response from server. Please check your network connection.');
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
): Promise<{commits: Commit[], heatmapData: CommitHeatmapData}> => {
  try {
    const response = await apiClient.post('/api/repositories/full-data', {
      repoUrl,
      timePeriod,
      filterOptions
    });
    
    return {
      commits: response.data.commits,
      heatmapData: response.data.heatmapData
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new Error(`Server error: ${error.response.data?.error || error.message}`);
      } else if (error.request) {
        throw new Error('No response from server. Please check your network connection.');
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
  getRepositoryFullData
};