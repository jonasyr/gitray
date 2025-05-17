import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MainPage from '../pages/MainPage';
import { getWorkspaceCommits } from '../services/api';
import { Commit } from '../../../../packages/shared-types/src';

// Mock the API module
jest.mock('../services/api', () => ({
  getWorkspaceCommits: jest.fn(),
}));

const mockedGetWorkspaceCommits = getWorkspaceCommits as jest.MockedFunction<typeof getWorkspaceCommits>;

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
    
    mockedGetWorkspaceCommits.mockResolvedValue(mockCommits);
    render(<MainPage />);
    
    const input = screen.getByRole('textbox');
    const button = screen.getByRole('button', { name: /visualize/i });
    
    // Act
    fireEvent.change(input, { target: { value: 'https://github.com/test/repo.git' } });
    fireEvent.click(button);
    
    // Assert
    await waitFor(() => {
      expect(mockedGetWorkspaceCommits).toHaveBeenCalledWith('https://github.com/test/repo.git');
      expect(screen.getByText('Repository Commits')).toBeDefined();
      expect(screen.getByText('123abc4')).toBeDefined();
    });
  });
});