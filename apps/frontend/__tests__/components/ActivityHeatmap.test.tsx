import { render, waitFor } from '@testing-library/react';
import ActivityHeatmap from '../../src/components/ActivityHeatmap';
import { getHeatmapData } from '../../src/services/api';

jest.mock('../../src/services/api', () => ({
  getHeatmapData: jest.fn(),
}));

const mockedGetHeatmapData = getHeatmapData as jest.MockedFunction<typeof getHeatmapData>;

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
      t => t.textContent
    );
    expect(titles).toContain(`3 commits on ${date}`);
  });
});
