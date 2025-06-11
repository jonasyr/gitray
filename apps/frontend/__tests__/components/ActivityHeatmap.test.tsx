import { describe, expect, vi } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActivityHeatmap from '../../src/components/ActivityHeatmap';
import { getHeatmapData } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({
  getHeatmapData: vi.fn(),
}));

const mockedGetHeatmapData = vi.mocked(getHeatmapData);

describe('ActivityHeatmap (happy path, AAA)', () => {
  test('renders tooltip title with correct commit count', async () => {
    // Arrange
    const date = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    mockedGetHeatmapData.mockResolvedValue({
      timePeriod: 'day',
      data: [{ periodStart: date, commitCount: 3 }],
      metadata: { maxCommitCount: 3, totalCommits: 3 },
    });

    // Act
    render(<ActivityHeatmap repoUrl="url" commits={[]} />);
    await waitFor(() => expect(mockedGetHeatmapData).toHaveBeenCalled());

    // Assert
    const tooltipElements = screen.getAllByText(/3 commits/);
    expect(tooltipElements.length).toBeGreaterThan(0);
  });

  test('displays author filters correctly sorted by commit count', async () => {
    // Arrange
    const commits = [
      {
        sha: '1',
        message: 'msg1',
        date: new Date().toISOString(),
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
      },
      {
        sha: '2',
        message: 'msg2',
        date: new Date().toISOString(),
        authorName: 'Bob',
        authorEmail: 'bob@example.com',
      },
      {
        sha: '3',
        message: 'msg3',
        date: new Date().toISOString(),
        authorName: 'Bob',
        authorEmail: 'bob@example.com',
      },
    ];

    // Act
    render(<ActivityHeatmap repoUrl="url" commits={commits} />);
    await waitFor(() => expect(mockedGetHeatmapData).toHaveBeenCalled());
    const combo = screen.getByRole('combobox');
    await userEvent.click(combo);
    const options = screen.getAllByRole('option');

    // Assert
    expect(options[0].textContent).toContain('Bob (2)');
    expect(options[1].textContent).toContain('Alice (1)');
  });
});
