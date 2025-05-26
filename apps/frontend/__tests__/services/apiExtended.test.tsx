import axios from 'axios';
import { getHeatmapData, getRepositoryFullData } from '../../src/services/api';
import { CommitHeatmapData } from '@gitray/shared-types';

jest.mock('axios', () => {
  const mock = {
    create: jest.fn(() => mock),
    get: jest.fn(),
    post: jest.fn(),
    isAxiosError: jest.fn(),
  } as any;
  return mock;
});

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('API Service extended', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue(mockedAxios);
  });

  test('getHeatmapData constructs query params and returns data', async () => {
    // Arrange
    const heatmap: CommitHeatmapData = {
      timePeriod: 'day',
      data: [],
      metadata: { maxCommitCount: 0, totalCommits: 0 },
    };
    mockedAxios.get.mockResolvedValueOnce({ data: heatmap });

    // Act
    const result = await getHeatmapData('url', 'day', { author: 'Me' });

    // Assert
    expect(mockedAxios.get).toHaveBeenCalled();
    expect(result).toEqual(heatmap);
  });

  test('getHeatmapData handles network error', async () => {
    const error = {
      request: {},
      message: 'Network',
    };
    mockedAxios.get.mockRejectedValueOnce(error);
    mockedAxios.isAxiosError.mockReturnValueOnce(true);

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
    mockedAxios.post.mockResolvedValueOnce(response);

    // Act
    const result = await getRepositoryFullData('url', 'day');

    // Assert
    expect(mockedAxios.post).toHaveBeenCalledWith(
      '/api/repositories/full-data',
      { repoUrl: 'url', timePeriod: 'day', filterOptions: undefined }
    );
    expect(result).toEqual({
      commits: [],
      heatmapData: response.data.heatmapData,
    });
  });

  test('getRepositoryFullData handles server error', async () => {
    const error = {
      response: { data: { error: 'fail' } },
    } as any;
    mockedAxios.post.mockRejectedValueOnce(error);
    mockedAxios.isAxiosError.mockReturnValueOnce(true);

    await expect(getRepositoryFullData('url')).rejects.toThrow(
      'Server error: fail'
    );
  });
});
