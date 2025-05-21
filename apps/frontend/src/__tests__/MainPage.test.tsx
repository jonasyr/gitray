import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MainPage from '../pages/MainPage';
import { getRepositoryFullData } from '../services/api';
import { Commit } from '../../../../packages/shared-types/src';

// Mock the API module
jest.mock('../services/api', () => ({
  getRepositoryFullData: jest.fn(),
  getHeatmapData: jest.fn(),
}));

const mockedGetRepositoryFullData = getRepositoryFullData as jest.MockedFunction<typeof getRepositoryFullData>;

describe('MainPage Component', () => {
  test('should fetch and display commits when repository URL is submitted', async () => {
    // Arrange
    const mockCommits: Commit[] = [
      {
        sha: '123abc456def',
        message: 'Test commit message',
        date: '2023-05-01T12:00:00Z',
        authorName: 'Test User',
        authorEmail: 'test@example.com'
      }
    ];
    
    mockedGetRepositoryFullData.mockResolvedValue({
      commits: mockCommits,
      heatmapData: {
        timePeriod: 'month',
        data: [],
        metadata: { maxCommitCount: 0, totalCommits: 0 },
      },
    });
    render(<MainPage />);
    
    const input = screen.getByRole('textbox');
    const button = screen.getByRole('button', { name: /visualize/i });
    
    // Act
    fireEvent.change(input, { target: { value: 'https://github.com/test/repo.git' } });
    fireEvent.click(button);
    
    // Assert
    await waitFor(() => {
      expect(mockedGetRepositoryFullData).toHaveBeenCalledWith(
        'https://github.com/test/repo.git',
        'month'
      );
    });

    // The heatmap should be displayed by default
    expect(screen.getByText('Repository Activity')).toBeInTheDocument();
  });
});