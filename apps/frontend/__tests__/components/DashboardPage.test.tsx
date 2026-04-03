import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from '../../src/components/DashboardPage';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import * as api from '../../src/services/api';

// Mock dependencies BEFORE imports
vi.mock('../../src/services/api', () => ({
  getFileAnalysis: vi.fn(),
  getCodeChurn: vi.fn(),
  getRepositorySummary: vi.fn(),
}));

// Mock sub-components that might do complex rendering
vi.mock('../../src/components/CommitHeatmap', () => ({
  CommitHeatmap: () => <div data-testid="mock-heatmap" />,
}));
vi.mock('../../src/components/ActivityChart', () => ({
  ActivityChart: () => <div data-testid="mock-activity-chart" />,
}));
vi.mock('../../src/components/FileDistributionChart', () => ({
  FileDistributionChart: () => <div data-testid="mock-file-chart" />,
}));
vi.mock('../../src/components/CodeChurnChart', () => ({
  CodeChurnChart: () => <div data-testid="mock-churn-chart" />,
}));
vi.mock('../../src/components/GraphViewTimeline', () => ({
  GraphViewTimeline: () => <div data-testid="mock-timeline" />,
}));

describe('DashboardPage Component', () => {
  const mockRepoUrl = 'https://github.com/test/repo';
  const mockCommits = [
    {
      hash: '123',
      message: 'test',
      date: '2023-01-01',
      author: 'tester',
      filesChanged: 1,
      insertions: 1,
      deletions: 1,
    },
  ];

  beforeEach(() => {
    // Arrange: reset API mocks
    vi.clearAllMocks();

    // Default resolve values
    (api.getRepositorySummary as any).mockResolvedValue({
      stats: { totalCommits: 100, branches: 2, contributors: 3 },
      lastCommit: { relativeTime: '2 days ago' },
      created: { date: '2023-01-01T00:00:00Z' },
      repository: { name: 'test-repo', url: 'https://github.com/test/repo' },
    });
    (api.getFileAnalysis as any).mockResolvedValue({ ts: 10 });
    (api.getCodeChurn as any).mockResolvedValue([]);
  });

  test('should render dashboard tabs and overview by default', async () => {
    // Act
    await act(async () => {
      render(
        <DashboardPage
          commits={mockCommits as any}
          heatmapData={{ data: [], timePeriod: 'day' }}
          isValidHeatmap={true}
          repoUrl={mockRepoUrl}
          currentBranch="main"
        />
      );
    });

    // Assert
    expect(screen.getAllByText('Overview')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Analytics')[0]).toBeInTheDocument();
    expect(screen.getByTestId('mock-activity-chart')).toBeInTheDocument();
  });

  test('should trigger API calls on mount with repoUrl', async () => {
    // Act
    await act(async () => {
      render(
        <DashboardPage
          commits={mockCommits as any}
          heatmapData={{ data: [], timePeriod: 'day' }}
          isValidHeatmap={true}
          repoUrl="https://github.com/test/repo2"
        />
      );
    });

    // Assert
    expect(api.getRepositorySummary).toHaveBeenCalledWith(
      'https://github.com/test/repo2'
    );
    expect(api.getFileAnalysis).toHaveBeenCalledWith(
      'https://github.com/test/repo2'
    );
    expect(api.getCodeChurn).toHaveBeenCalledWith(
      'https://github.com/test/repo2'
    );
  });

  test('should handle missing heatmap data gracefully', async () => {
    // Act
    await act(async () => {
      render(
        <DashboardPage
          commits={mockCommits as any}
          heatmapData={null}
          isValidHeatmap={false}
          repoUrl={mockRepoUrl}
        />
      );
    });

    // Assert
    // It should still render the main dashboard structure
    expect(screen.getByText(/Repository Analytics/i)).toBeInTheDocument();

    // Switch to Heatmap tab and ensure it handles it gracefully
    await act(async () => {
      const user = userEvent.setup();
      const tab = screen.getByRole('tab', { name: /Heatmap/i });
      await user.click(tab);
    });

    expect(await screen.findByTestId('mock-heatmap')).toBeInTheDocument();
  });
});
