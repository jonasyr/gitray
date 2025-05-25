import axios, { AxiosRequestConfig } from 'axios';
import { getWorkspaceCommits } from '../../src/services/api';
import { Commit } from '@gitray/shared-types';

// Define type for our mock axios
type MockAxios = {
  create: jest.MockedFunction<() => MockAxios>;
  post: jest.MockedFunction<
    (
      url: string,
      data?: unknown
    ) => Promise<{
      data: { commits: Commit[] };
      status: number;
      statusText: string;
      headers: Record<string, string>;
      config: AxiosRequestConfig;
    }>
  >;
  isAxiosError: jest.MockedFunction<(error: unknown) => boolean>;
};

// Mock axios
jest.mock('axios', () => {
  const mockAxios: MockAxios = {
    create: jest.fn(() => mockAxios),
    post: jest.fn(),
    isAxiosError: jest.fn(),
  };
  return mockAxios;
});

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('API Service', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getWorkspaceCommits', () => {
    it('should fetch commits successfully', async () => {
      // Mock data
      const mockCommits: Commit[] = [
        {
          sha: '123abc',
          message: 'Test commit message',
          date: '2023-05-01T12:00:00Z',
          authorName: 'Test User',
          authorEmail: 'test@example.com',
        },
        {
          sha: '456def',
          message: 'Another test commit',
          date: '2023-05-02T14:30:00Z',
          authorName: 'Another User',
          authorEmail: 'another@example.com',
        },
      ];

      // Setup mock response
      mockedAxios.post.mockResolvedValueOnce({
        data: { commits: mockCommits },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as AxiosRequestConfig,
      });

      // Create axios instance mock
      mockedAxios.create.mockReturnValue(mockedAxios);

      // Call the function
      const repoUrl = 'https://github.com/test/repo.git';
      const result = await getWorkspaceCommits(repoUrl);

      // Assertions
      expect(mockedAxios.post).toHaveBeenCalledWith('/api/repositories', {
        repoUrl,
      });
      expect(result).toEqual(mockCommits);
      expect(result.length).toBe(2);
      expect(result[0].sha).toBe('123abc');
    });

    it('should handle API errors correctly', async () => {
      // Setup mock error response
      const errorResponse = {
        response: {
          data: { error: 'Invalid repository URL' },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          config: {} as AxiosRequestConfig,
        },
      };

      mockedAxios.post.mockRejectedValueOnce(errorResponse);
      mockedAxios.create.mockReturnValue(mockedAxios);
      mockedAxios.isAxiosError.mockReturnValueOnce(true);

      // Call the function and expect it to throw
      const repoUrl = 'invalid-url';
      await expect(getWorkspaceCommits(repoUrl)).rejects.toThrow(
        'Server error: Invalid repository URL'
      );
    });

    it('should handle network errors', async () => {
      // Setup mock network error
      const networkError = {
        request: {},
        message: 'Network Error',
      };

      mockedAxios.post.mockRejectedValueOnce(networkError);
      mockedAxios.create.mockReturnValue(mockedAxios);
      mockedAxios.isAxiosError.mockReturnValueOnce(true);

      // Call the function and expect it to throw
      const repoUrl = 'https://github.com/test/repo.git';
      await expect(getWorkspaceCommits(repoUrl)).rejects.toThrow(
        'No response from server'
      );
    });

    it('should handle unexpected errors', async () => {
      // Setup mock unexpected error
      const unexpectedError = new Error('Unexpected error');

      mockedAxios.post.mockRejectedValueOnce(unexpectedError);
      mockedAxios.create.mockReturnValue(mockedAxios);
      mockedAxios.isAxiosError.mockReturnValueOnce(false);

      // Call the function and expect it to throw
      const repoUrl = 'https://github.com/test/repo.git';
      await expect(getWorkspaceCommits(repoUrl)).rejects.toThrow(
        'An unexpected error occurred'
      );
    });
  });
});
