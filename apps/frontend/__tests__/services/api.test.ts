// Mock external dependencies BEFORE any imports
import { describe, test, expect, beforeEach, vi } from 'vitest';
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
  };
  return {
    default: {
      ...actual.default,
      create: vi.fn(() => mockAxiosInstance),
      isAxiosError: vi.fn((_payload) => true), // Mock generic isAxiosError
    },
  };
});

import axios from 'axios';
import {
  getRepositoryHeatmap,
  getRepositoryCommits,
  getFileAnalysis,
  getCodeChurn,
  getRepositorySummary,
  getRepositoryFullData,
  getRepositoryContributors,
} from '../../src/services/api';

describe('API Service Unit Tests', () => {
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Arrange: Reset all mocks before each test
    vi.clearAllMocks();
    // Get the mocked instance's get method
    const mockAxiosInstance = axios.create();
    mockGet = mockAxiosInstance.get as ReturnType<typeof vi.fn>;

    // Explicitly mock isAxiosError to behave properly for these tests
    (axios.isAxiosError as any).mockImplementation(
      (payload: any) => payload?.isAxiosError === true
    );
  });

  describe('getRepositoryCommits', () => {
    const mockRepoUrl = 'https://github.com/user/repo';
    const mockNormalizedUrl = 'https://github.com/user/repo.git';

    test('should fetch commits successfully', async () => {
      // Arrange
      const mockResponse = {
        data: {
          commits: [{ hash: '12345', message: 'Test commit' }],
          page: 1,
          limit: 100,
        },
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await getRepositoryCommits(mockRepoUrl, 1, 100);

      // Assert
      expect(mockGet).toHaveBeenCalledWith(
        `/api/repositories/commits?repoUrl=${encodeURIComponent(mockNormalizedUrl)}&page=1&limit=100`
      );
      expect(result).toEqual({
        commits: mockResponse.data.commits,
        page: 1,
        limit: 100,
      });
    });

    test('should append .git to repoUrl if missing', async () => {
      // Arrange
      const urlWithoutGit = 'https://github.com/test/repo';
      mockGet.mockResolvedValueOnce({
        data: { commits: [], page: 1, limit: 100 },
      });

      // Act
      await getRepositoryCommits(urlWithoutGit, 1, 50);

      // Assert
      expect(mockGet).toHaveBeenCalledWith(
        `/api/repositories/commits?repoUrl=${encodeURIComponent(urlWithoutGit + '.git')}&page=1&limit=50`
      );
    });

    test('should throw meaningful error on API failure', async () => {
      // Arrange
      const mockError = {
        isAxiosError: true,
        response: { data: { error: 'Repository not found' } },
      };
      mockGet.mockRejectedValueOnce(mockError);

      // Act & Assert
      await expect(getRepositoryCommits(mockRepoUrl)).rejects.toThrow(
        'Server error: Repository not found'
      );
    });
  });

  describe('getRepositoryHeatmap', () => {
    const mockRepoUrl = 'https://github.com/user/repo';

    test('should fetch heatmap without filters', async () => {
      // Arrange
      const mockResponse = { data: { heatmapData: { 12345: 5 } } };
      mockGet.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await getRepositoryHeatmap(mockRepoUrl);

      // Assert
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining(
          `/api/repositories/heatmap?repoUrl=${encodeURIComponent(mockRepoUrl + '.git')}`
        )
      );
      expect(result).toEqual(mockResponse.data.heatmapData);
    });

    test('should append filter query parameters', async () => {
      // Arrange
      mockGet.mockResolvedValueOnce({ data: { heatmapData: {} } });
      const filters = {
        author: 'Alice',
        fromDate: '2023-01-01',
        toDate: '2023-12-31',
      };

      // Act
      await getRepositoryHeatmap(mockRepoUrl, filters);

      // Assert
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('author=Alice')
      );
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('fromDate=2023-01-01')
      );
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('toDate=2023-12-31')
      );
    });
  });

  describe('getFileAnalysis', () => {
    test('should fetch file analysis successfully', async () => {
      // Arrange
      const mockResponse = { data: { ts: 10, md: 5 } };
      mockGet.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await getFileAnalysis('test-repo');

      // Assert
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining(
          `/api/commits/file-analysis?repoUrl=test-repo.git`
        )
      );
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getCodeChurn', () => {
    test('should fetch code churn with all parameters', async () => {
      // Arrange
      const mockResponse = { data: { churnData: [] } };
      mockGet.mockResolvedValueOnce(mockResponse);

      // Act
      await getCodeChurn('test-repo', '2023-01-01', '2023-12-31', 5, [
        '.ts',
        '.tsx',
      ]);

      // Assert
      const url = mockGet.mock.calls[0][0];
      expect(url).toContain('repoUrl=test-repo.git');
      expect(url).toContain('fromDate=2023-01-01');
      expect(url).toContain('toDate=2023-12-31');
      expect(url).toContain('minChanges=5');
      expect(url).toContain('extensions=.ts%2C.tsx');
    });
  });

  describe('getRepositorySummary', () => {
    test('should fetch summary successfully', async () => {
      // Arrange
      const mockResponse = { data: { summary: { commitCount: 100 } } };
      mockGet.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await getRepositorySummary('repo');

      // Assert
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining(`/api/repositories/summary?repoUrl=repo.git`)
      );
      expect(result).toEqual(mockResponse.data.summary);
    });
  });

  describe('getRepositoryFullData', () => {
    test('should fetch full data successfully', async () => {
      // Arrange
      const mockResponse = {
        data: {
          commits: [],
          heatmapData: {},
          page: 1,
          limit: 100,
          isValidHeatmap: true,
        },
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await getRepositoryFullData('repo', 'week', 1, 100, {
        author: 'Alice',
      });

      // Assert
      const url = mockGet.mock.calls[0][0];
      expect(url).toContain('/api/repositories/full-data');
      expect(url).toContain('author=Alice');
      expect(result).toEqual(mockResponse.data);
    });

    test('should handle network error (no response)', async () => {
      // Arrange
      const mockError = {
        isAxiosError: true,
        request: {}, // Indicates no response received
      };
      mockGet.mockRejectedValueOnce(mockError);

      // Act & Assert
      await expect(getRepositoryFullData('repo')).rejects.toThrow(
        'No response from server. Please check your network connection.'
      );
    });

    test('should handle server error response (e.g. 500)', async () => {
      // Arrange
      const mockError = {
        isAxiosError: true,
        response: { status: 500, data: { msg: 'Internal Server Error' } },
        config: { url: '/api/repositories/full-data' },
      };
      mockGet.mockRejectedValueOnce(mockError);

      // Act & Assert
      await expect(getRepositoryFullData('repo')).rejects.toThrow(
        'Full-data error (500): {"msg":"Internal Server Error"}'
      );
    });

    test('should handle non-axios error', async () => {
      // Arrange
      (axios.isAxiosError as any).mockImplementationOnce(() => false);
      const mockError = new Error('Generic error');
      mockGet.mockRejectedValueOnce(mockError);

      // Act & Assert
      await expect(getRepositoryFullData('repo')).rejects.toThrow(
        'An unexpected error occurred'
      );
    });

    test('should handle axios error without response or request', async () => {
      // Arrange
      const mockError = {
        isAxiosError: true,
        message: 'Network Error',
      };
      mockGet.mockRejectedValueOnce(mockError);

      // Act & Assert
      await expect(getRepositoryFullData('repo')).rejects.toThrow(
        'Error: Network Error'
      );
    });
  });

  describe('getRepositoryContributors', () => {
    test('should fetch contributors successfully', async () => {
      // Arrange
      const mockResponse = { data: { contributors: [{ login: 'alice' }] } };
      mockGet.mockResolvedValueOnce(mockResponse);

      // Act
      const result = await getRepositoryContributors('repo');

      // Assert
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining(
          `/api/repositories/contributors?repoUrl=repo.git`
        )
      );
      expect(result).toEqual(mockResponse.data.contributors);
    });

    test('should handle network error (no response)', async () => {
      // Arrange
      const mockError = {
        isAxiosError: true,
        request: {},
      };
      mockGet.mockRejectedValueOnce(mockError);

      // Act & Assert
      await expect(getRepositoryContributors('repo')).rejects.toThrow(
        'No response from server. Please check your network connection.'
      );
    });

    test('should handle server error response (e.g. 500)', async () => {
      // Arrange
      const mockError = {
        isAxiosError: true,
        response: { status: 500, data: { msg: 'Internal Server Error' } },
        config: { url: '/api/repositories/contributors' },
      };
      mockGet.mockRejectedValueOnce(mockError);

      // Act & Assert
      await expect(getRepositoryContributors('repo')).rejects.toThrow(
        'Contributors error (500): {"msg":"Internal Server Error"}'
      );
    });

    test('should handle non-axios error', async () => {
      // Arrange
      (axios.isAxiosError as any).mockImplementationOnce(() => false);
      const mockError = new Error('Generic error');
      mockGet.mockRejectedValueOnce(mockError);

      // Act & Assert
      await expect(getRepositoryContributors('repo')).rejects.toThrow(
        'An unexpected error occurred'
      );
    });

    test('should handle axios error without response or request', async () => {
      // Arrange
      const mockError = {
        isAxiosError: true,
        message: 'Network Error',
      };
      mockGet.mockRejectedValueOnce(mockError);

      // Act & Assert
      await expect(getRepositoryContributors('repo')).rejects.toThrow(
        'Error: Network Error'
      );
    });
  });
});
