import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { FileDistributionChart } from '../../src/components/FileDistributionChart';
import type { FileTypeDistribution } from '@gitray/shared-types';

const mockFileDistribution: FileTypeDistribution = {
  extensions: {
    '.ts': { count: 50, percentage: 60, size: 500000, averageSize: 10000 },
    '.tsx': { count: 20, percentage: 25, size: 200000, averageSize: 10000 },
    '.css': { count: 10, percentage: 12, size: 50000, averageSize: 5000 },
    '.md': { count: 2, percentage: 2, size: 5000, averageSize: 2500 },
  },
  categories: {
    code: { count: 70, percentage: 85, size: 700000, averageSize: 10000 },
    documentation: { count: 2, percentage: 2, size: 5000, averageSize: 2500 },
    configuration: {
      count: 10,
      percentage: 12,
      size: 50000,
      averageSize: 5000,
    },
    assets: { count: 0, percentage: 0, size: 0, averageSize: 0 },
    other: { count: 0, percentage: 0, size: 0, averageSize: 0 },
  },
  directories: [],
  metadata: {
    totalFiles: 82,
    totalSize: 755000,
    analyzedAt: '2026-01-01T00:00:00Z',
    repositorySize: 'medium',
  },
};

describe('FileDistributionChart Component', () => {
  test('should render "No file data available" when fileDistribution is undefined', () => {
    // Arrange & Act
    render(<FileDistributionChart />);

    // Assert
    expect(screen.getByText('No file data available')).toBeInTheDocument();
    expect(
      screen.getByText('File distribution could not be loaded')
    ).toBeInTheDocument();
  });

  test('should render the recharts container when fileDistribution data is provided', () => {
    // Arrange & Act
    render(<FileDistributionChart fileDistribution={mockFileDistribution} />);

    // Assert — Recharts renders its container div
    expect(
      document.querySelector('.recharts-responsive-container')
    ).toBeInTheDocument();
  });
});
