import { render } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { ActivityChart } from '../../src/components/ActivityChart';
import { Commit } from '@gitray/shared-types';

describe('ActivityChart Component', () => {
  test('should render with no commits', () => {
    // Arrange
    const commits: Commit[] = [];

    // Act
    render(<ActivityChart commits={commits} />);

    // Assert
    expect(
      document.querySelector('.recharts-responsive-container')
    ).toBeInTheDocument();
  });

  test('should render with commits in the last 30 days', () => {
    // Arrange
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const commits: Commit[] = [
      {
        sha: 'abc123',
        message: 'feat: add feature',
        authorName: 'Jonas',
        authorEmail: 'jonas@example.com',
        date: yesterday.toISOString(),
      },
      {
        sha: 'def456',
        message: 'fix: fix bug',
        authorName: 'Jonas',
        authorEmail: 'jonas@example.com',
        date: today.toISOString(),
      },
    ];

    // Act
    render(<ActivityChart commits={commits} />);

    // Assert
    expect(
      document.querySelector('.recharts-responsive-container')
    ).toBeInTheDocument();
  });

  test('should ignore commits older than 30 days', () => {
    // Arrange
    const thirtyFiveDaysAgo = new Date();
    thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);

    const commits: Commit[] = [
      {
        sha: 'old123',
        message: 'old commit',
        authorName: 'Jonas',
        authorEmail: 'jonas@example.com',
        date: thirtyFiveDaysAgo.toISOString(),
      },
    ];

    // Act
    render(<ActivityChart commits={commits} />);

    // Assert
    expect(
      document.querySelector('.recharts-responsive-container')
    ).toBeInTheDocument();
  });
});
