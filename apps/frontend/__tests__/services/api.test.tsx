import { describe, expect, beforeEach, vi, Mock } from 'vitest';
import { getWorkspaceCommits } from '../../src/services/api';
import { Commit } from '@gitray/shared-types';

// Mock axios
vi.mock('axios', () => {
  const mockPost = vi.fn();
  const mockCreate = vi.fn(() => ({ post: mockPost }));
  const mockIsAxiosError = vi.fn();

  return {
    default: {
      create: mockCreate,
      isAxiosError: mockIsAxiosError,
    },
  };
});

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should fetch commits successfully', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const expectedCommits: Commit[] = [
      {
        sha: 'abc123',
        message: 'Test commit',
        date: '2023-05-01T12:00:00Z',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
      },
    ];

    const mockResponse = {
      data: { commits: expectedCommits },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    };

    // Access the mocked functions
    const axios = await import('axios');
    const mockAxiosInstance = (axios.default.create as Mock)();
    mockAxiosInstance.post.mockResolvedValueOnce(mockResponse);

    // Act
    const result = await getWorkspaceCommits(repoUrl);

    // Assert
    expect(result).toEqual(expectedCommits);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/repositories', {
      repoUrl,
    });
  });

  test('should handle API errors correctly', async () => {
    // Arrange
    const repoUrl = 'https://github.com/user/repo.git';
    const error = new Error('Network error');

    // Access the mocked functions
    const axios = await import('axios');
    const mockAxiosInstance = (axios.default.create as Mock)();
    mockAxiosInstance.post.mockRejectedValueOnce(error);
    (axios.default.isAxiosError as unknown as Mock).mockReturnValueOnce(true);

    // Act & Assert
    await expect(getWorkspaceCommits(repoUrl)).rejects.toThrow('Network error');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/repositories', {
      repoUrl,
    });
  });
});
