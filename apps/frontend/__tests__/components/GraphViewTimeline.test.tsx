import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { GraphViewTimeline } from '../../src/components/GraphViewTimeline';
import { Commit } from '@gitray/shared-types';

function makeCommit(sha: string, daysAgo: number): Commit {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return {
    sha,
    message: `commit ${sha}`,
    authorName: 'Jonas',
    authorEmail: 'jonas@example.com',
    date: date.toISOString(),
  };
}

describe('GraphViewTimeline Component', () => {
  test('should render timeline with real commits', () => {
    // Arrange
    const commits: Commit[] = [
      makeCommit('abc1', 1),
      makeCommit('abc2', 2),
      makeCommit('abc3', 3),
    ];

    // Act
    render(<GraphViewTimeline commits={commits} currentBranch="main" />);

    // Assert
    expect(screen.getByText('Network Graph Timeline')).toBeInTheDocument();
    expect(screen.getByText('commit abc1')).toBeInTheDocument();
  });

  test('should not mutate the original commits array when sorting', () => {
    // Arrange
    const commits: Commit[] = [
      makeCommit('old1', 5),
      makeCommit('new1', 1),
      makeCommit('mid1', 3),
    ];
    const originalFirst = commits[0].sha;
    const originalLength = commits.length;

    // Act
    render(<GraphViewTimeline commits={commits} currentBranch="main" />);

    // Assert — original array order and length are unchanged
    expect(commits.length).toBe(originalLength);
    expect(commits[0].sha).toBe(originalFirst);
  });

  test('should show at most 5 commits by default', () => {
    // Arrange — 10 commits
    const commits: Commit[] = Array.from({ length: 10 }, (_, i) =>
      makeCommit(`sha${i}`, i + 1)
    );

    // Act
    render(<GraphViewTimeline commits={commits} currentBranch="main" />);

    // Assert — only 5 commit messages rendered
    const renderedCommits = commits.slice(0, 5);
    for (const commit of renderedCommits) {
      expect(screen.getByText(`commit ${commit.sha}`)).toBeInTheDocument();
    }
    expect(screen.queryByText('commit sha5')).not.toBeInTheDocument();
  });
});
