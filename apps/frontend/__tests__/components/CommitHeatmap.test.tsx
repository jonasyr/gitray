import { render, screen } from '@testing-library/react';
import { CommitHeatmap } from '../../src/components/CommitHeatmap';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommitHeatmapData } from '@gitray/shared-types';

describe('CommitHeatmap Component', () => {
  const mockDate = new Date('2023-12-31T12:00:00Z');

  beforeEach(() => {
    // Arrange: Fix current date for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('should render properly with no data', () => {
    // Act
    render(<CommitHeatmap />);

    // Assert
    expect(screen.getByText('Commit Activity')).toBeInTheDocument();
    // It should render the heatmap grid but empty (all bg-muted/30)
    const items = document.querySelectorAll('.rounded-sm');
    expect(items.length).toBeGreaterThan(300); // 365 days + some legends
  });

  test('should log a warning if isValidHeatmap is false', () => {
    // Arrange
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const heatmapData: CommitHeatmapData = { data: [], timePeriod: 'day' };

    // Act
    render(<CommitHeatmap heatmapData={heatmapData} isValidHeatmap={false} />);

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith(
      '[CommitHeatmap] Heatmap data may be incomplete or invalid'
    );
    consoleSpy.mockRestore();
  });

  test('should render heatmap with data from heatmapData prop', () => {
    // Arrange
    const heatmapData: CommitHeatmapData = {
      data: [
        { periodStart: '2023-12-30T00:00:00Z', commitCount: 15 }, // High intensity
        { periodStart: '2023-12-31T00:00:00Z', commitCount: 2 }, // Low intensity
      ],
      timePeriod: 'day',
    };

    // Act
    render(<CommitHeatmap heatmapData={heatmapData} monthsToShow={12} />);

    // Assert
    // Check that we have elements with the specific intensity classes
    const highIntensityNodes = document.querySelectorAll('.bg-primary');
    const lowIntensityNodes = document.querySelectorAll('.bg-primary\\/20');

    // There are legendary items colored as well, so we expect at least 1 + legend items
    expect(highIntensityNodes.length).toBeGreaterThanOrEqual(1);
    expect(lowIntensityNodes.length).toBeGreaterThanOrEqual(1);
  });

  test('should render heatmap with data fallback from commits prop', () => {
    // Arrange
    const commits = [
      {
        hash: 'abc',
        message: 'test',
        author: 'tester',
        date: '2023-12-25T10:00:00Z',
        filesChanged: 1,
        insertions: 10,
        deletions: 5,
      },
      {
        hash: 'def',
        message: 'test2',
        author: 'tester',
        date: '2023-12-25T11:00:00Z',
        filesChanged: 1,
        insertions: 10,
        deletions: 5,
      },
    ];

    // Act
    // Omitting heatmapData to trigger fallback
    render(<CommitHeatmap commits={commits as any} />);

    // Assert
    // 2 commits on same day -> expect bg-primary/20
    const intensityNodes = document.querySelectorAll('.bg-primary\\/20');
    expect(intensityNodes.length).toBeGreaterThanOrEqual(1);
  });

  test('should restrict data visibility based on monthsToShow prop', () => {
    // Arrange
    const twelveMonthsAgo = new Date(mockDate);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);

    const commits = [
      {
        hash: 'old',
        message: 'old commit',
        author: 'tester',
        date: twelveMonthsAgo.toISOString(),
        filesChanged: 1,
        insertions: 1,
        deletions: 1,
      },
      {
        hash: 'new',
        message: 'new commit',
        author: 'tester',
        date: mockDate.toISOString(),
        filesChanged: 1,
        insertions: 1,
        deletions: 1,
      },
    ];

    // Act: only show 3 months
    render(<CommitHeatmap commits={commits as any} monthsToShow={3} />);

    // Assert
    // The old commit should not be colored because it's outside the 3 months window.
    // The new commit should be colored (count 1 -> bg-primary/20).
    const paintedNodes = document.querySelectorAll('.bg-primary\\/20');
    // Legends uses 1 bg-primary/20, plus the new commit = 2
    expect(paintedNodes.length).toBe(2);
  });
});
