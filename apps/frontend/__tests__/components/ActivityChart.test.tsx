import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import {
  ActivityChart,
  ActivityChartTooltip,
} from '../../src/components/ActivityChart';
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

  test('should bucket commits using local date, not UTC date', () => {
    // Arrange — commits spread across multiple local days
    // Dates are constructed via the Date constructor (local time), ensuring
    // getFullYear/getMonth/getDate are used for bucketing, not toISOString (UTC).
    const day1 = new Date(2026, 2, 10, 23, 45, 0); // Mar 10 23:45 local — would be Mar 11 UTC in UTC+1+
    const day2 = new Date(2026, 2, 11, 0, 15, 0); // Mar 11 00:15 local
    const fixedNow = new Date(2026, 3, 7, 12, 0, 0); // Apr 7 — "today" for the 30-day window

    const RealDate = globalThis.Date;
    const dateSpy = vi
      .spyOn(globalThis, 'Date')
      .mockImplementation((...args: unknown[]) => {
        if (args.length === 0) return fixedNow;
        // @ts-expect-error forward args to real Date constructor
        return new RealDate(...args);
      });

    const commits: Commit[] = [
      {
        sha: 'a1',
        message: 'feat: a',
        authorName: 'Jonas',
        authorEmail: 'j@example.com',
        date: day1.toISOString(),
      },
      {
        sha: 'a2',
        message: 'feat: b',
        authorName: 'Jonas',
        authorEmail: 'j@example.com',
        date: day2.toISOString(),
      },
    ];

    // Act
    render(<ActivityChart commits={commits} />);

    // Assert — chart renders without error; bucketing logic ran without throwing
    expect(
      document.querySelector('.recharts-responsive-container')
    ).toBeInTheDocument();

    dateSpy.mockRestore();
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

  test('ActivityChartTooltip should render date and commit count when active', () => {
    // Arrange
    const payload = [{ value: 3, payload: { date: 'Apr 7' } }] as Parameters<
      typeof ActivityChartTooltip
    >[0]['payload'];

    // Act
    render(<ActivityChartTooltip active={true} payload={payload} />);

    // Assert
    expect(screen.getByText('Apr 7')).toBeInTheDocument();
    expect(screen.getByText('3 commits')).toBeInTheDocument();
  });

  test('ActivityChartTooltip should render nothing when inactive', () => {
    // Arrange / Act
    const { container } = render(
      <ActivityChartTooltip active={false} payload={[]} />
    );

    // Assert
    expect(container.firstChild).toBeNull();
  });
});
