import { describe, expect, beforeEach, vi, Mock } from 'vitest';
import { getHeatmapData, getRepositoryFullData } from '../../src/services/api';
import { CommitHeatmapData } from '@gitray/shared-types';

// Mock axios
vi.mock('axios', () => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  const mockCreate = vi.fn(() => ({ get: mockGet, post: mockPost }));
  const mockIsAxiosError = vi.fn();

  return {
    default: {
      create: mockCreate,
      isAxiosError: mockIsAxiosError,
    },
  };
});

describe('API Service extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('getHeatmapData constructs query params and returns data', async () => {
    // Arrange
    const heatmap: CommitHeatmapData = {
      timePeriod: 'day',
      data: [],
      metadata: { maxCommitCount: 0, totalCommits: 0 },
    };

    // Access the mocked functions
    const axios = await import('axios');
    const mockAxiosInstance = (axios.default.create as Mock)();
    mockAxiosInstance.get.mockResolvedValueOnce({ data: heatmap });

    // Act
    const result = await getHeatmapData('url', 'day', { author: 'Me' });

    // Assert
    expect(mockAxiosInstance.get).toHaveBeenCalled();
    expect(result).toEqual(heatmap);
  });

  test('getHeatmapData handles network error', async () => {
    // Arrange
    const error = {
      request: {},
      message: 'Network',
    };

    // Access the mocked functions
    const axios = await import('axios');
    const mockAxiosInstance = (axios.default.create as Mock)();
    mockAxiosInstance.get.mockRejectedValueOnce(error);
    (axios.default.isAxiosError as unknown as Mock).mockReturnValueOnce(true);

    // Act & Assert
    await expect(getHeatmapData('url', 'day')).rejects.toThrow(
      'No response from server'
    );
  });

  test('getRepositoryFullData posts payload and returns commits and heatmap', async () => {
    // Arrange
    const response = {
      data: {
        commits: [],
        heatmapData: {
          timePeriod: 'day',
          data: [],
          metadata: { maxCommitCount: 0, totalCommits: 0 },
        },
      },
    };

    // Access the mocked functions
    const axios = await import('axios');
    const mockAxiosInstance = (axios.default.create as Mock)();
    mockAxiosInstance.post.mockResolvedValueOnce(response);

    // Act
    const result = await getRepositoryFullData('url', 'day');

    // Assert
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/api/repositories/full-data',
      { repoUrl: 'url', timePeriod: 'day', filterOptions: undefined }
    );
    expect(result).toEqual({
      commits: [],
      heatmapData: response.data.heatmapData,
    });
  });

  test('getRepositoryFullData handles server error', async () => {
    // Arrange
    const error = {
      response: { data: { error: 'fail' } },
    };

    // Access the mocked functions
    const axios = await import('axios');
    const mockAxiosInstance = (axios.default.create as Mock)();
    mockAxiosInstance.post.mockRejectedValueOnce(error);
    (axios.default.isAxiosError as unknown as Mock).mockReturnValueOnce(true);

    // Act & Assert
    await expect(getRepositoryFullData('url')).rejects.toThrow(
      'Server error: fail'
    );
  });
});
