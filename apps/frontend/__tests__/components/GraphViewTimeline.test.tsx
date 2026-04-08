import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
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

  test('should render fallback timeline events when no commits are provided', () => {
    // Arrange — no commits passed

    // Act
    render(<GraphViewTimeline />);

    // Assert — component renders with hardcoded fallback events
    expect(screen.getByText('Network Graph Timeline')).toBeInTheDocument();
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
  });

  test('should display singular time unit for exactly 1 day ago', () => {
    // Arrange — commit exactly 25 hours ago (> 1 day but < 2 days)
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 25);
    const commits: Commit[] = [makeCommit('day1', 0)];
    commits[0] = { ...commits[0], date: oneDayAgo.toISOString() };

    // Act
    render(<GraphViewTimeline commits={commits} currentBranch="main" />);

    // Assert — renders "1 day ago" not "1 days ago"
    expect(screen.getByText('1 day ago')).toBeInTheDocument();
  });

  test('should display locale date string for commits older than 12 months', () => {
    // Arrange — commit 400 days ago (> 12 months)
    const veryOld = new Date();
    veryOld.setDate(veryOld.getDate() - 400);
    const commits: Commit[] = [
      { ...makeCommit('old', 0), date: veryOld.toISOString() },
    ];
    const expectedDate = veryOld.toLocaleDateString();

    // Act
    render(<GraphViewTimeline commits={commits} currentBranch="main" />);

    // Assert — date displayed as locale string, not relative
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });

  test('should show more than 5 commits after clicking Show More', async () => {
    // Arrange
    const user = userEvent.setup();
    const commits: Commit[] = Array.from({ length: 10 }, (_, i) =>
      makeCommit(`sha${i}`, i + 1)
    );

    // Act
    render(<GraphViewTimeline commits={commits} currentBranch="main" />);
    await user.click(screen.getByRole('button', { name: /show more/i }));

    // Assert — 6th commit (sha5) is now visible
    expect(screen.getByText('commit sha5')).toBeInTheDocument();
  });
});
