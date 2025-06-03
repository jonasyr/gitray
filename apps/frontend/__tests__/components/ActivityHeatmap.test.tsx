import { render, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActivityHeatmap from '../../src/components/ActivityHeatmap';
import { getHeatmapData } from '../../src/services/api';

jest.mock('../../src/services/api', () => ({
  getHeatmapData: jest.fn(),
}));

const mockedGetHeatmapData = getHeatmapData as jest.MockedFunction<
  typeof getHeatmapData
>;

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
    const { container } = render(
      <ActivityHeatmap
        repoUrl="https://github.com/test/repo.git"
        commits={[]}
      />
    );
    await waitFor(() => expect(mockedGetHeatmapData).toHaveBeenCalled());

    // Assert
    const titles = Array.from(container.querySelectorAll('title')).map(
      (t) => t.textContent
    );
    expect(titles).toContain(`3 commits on ${date}`);
  });

  test('applies color class based on commit count', async () => {
    // Arrange
    const date = new Date().toISOString().slice(0, 10);
    mockedGetHeatmapData.mockResolvedValue({
      timePeriod: 'day',
      data: [{ periodStart: date, commitCount: 8 }],
      metadata: { maxCommitCount: 8, totalCommits: 8 },
    });

    // Act
    const { container } = render(
      <ActivityHeatmap repoUrl="url" commits={[]} />
    );
    await waitFor(() => expect(mockedGetHeatmapData).toHaveBeenCalled());
    // Assert
    const rects = container.querySelectorAll('rect.color-scale-4');
    expect(rects.length).toBeGreaterThan(0);
  });

  test('sorts authors in dropdown by commit count', async () => {
    // Arrange
    mockedGetHeatmapData.mockResolvedValue({
      timePeriod: 'day',
      data: [],
      metadata: { maxCommitCount: 0, totalCommits: 0 },
    });
    const commits = [
      {
        sha: '1',
        message: 'm',
        date: new Date().toISOString(),
        authorName: 'Bob',
        authorEmail: 'bob@example.com',
      },
      {
        sha: '2',
        message: 'm',
        date: new Date().toISOString(),
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
      },
      {
        sha: '3',
        message: 'm',
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
