import { render, screen } from '@testing-library/react';
import CommitList from '../../src/components/CommitList';
import { Commit } from '../../../../packages/shared-types/src';

describe('CommitList Component', () => {
  test('should render commit list with data', () => {
    // Arrange
    const mockCommits: Commit[] = [
      {
        sha: '123abc456def',
        message: 'Test commit message',
        date: '2023-05-01T12:00:00Z',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
      },
    ];

    // Act
    render(<CommitList commits={mockCommits} />);

    // Assert
    expect(screen.getByText('Repository Commits')).toBeDefined();
    expect(screen.getByText('123abc4')).toBeDefined(); // First 7 chars of SHA
    expect(screen.getByText('Test commit message')).toBeDefined();
    expect(screen.getByText('Test User')).toBeDefined();
  });

  test('should render nothing when commits array is empty', () => {
    // Arrange
    const emptyCommits: Commit[] = [];

    // Act
    const { container } = render(<CommitList commits={emptyCommits} />);

    // Assert
    expect(container.firstChild).toBeNull();
  });
});
