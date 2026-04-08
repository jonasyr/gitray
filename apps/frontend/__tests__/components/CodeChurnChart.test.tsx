import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { CodeChurnChart } from '../../src/components/CodeChurnChart';
import type { CodeChurnAnalysis } from '@gitray/shared-types';

const mockChurnData: CodeChurnAnalysis = {
  files: [
    { path: 'src/services/api.ts', changes: 45, risk: 'high' },
    { path: 'src/components/Dashboard.tsx', changes: 22, risk: 'medium' },
    { path: 'src/utils/dateUtils.ts', changes: 8, risk: 'low' },
  ],
  metadata: {
    totalFiles: 10,
    totalChanges: 75,
    highRiskCount: 1,
    mediumRiskCount: 2,
    lowRiskCount: 7,
    riskThresholds: { high: 30, medium: 15, low: 14 },
    dateRange: { from: '2025-01-01', to: '2026-01-01' },
    analyzedAt: '2026-01-01T00:00:00Z',
  },
};

describe('CodeChurnChart Component', () => {
  test('should render "No churn data available" when churnData is undefined', () => {
    // Arrange & Act
    render(<CodeChurnChart />);

    // Assert
    expect(screen.getByText('No churn data available')).toBeInTheDocument();
  });

  test('should render risk stats from churnData metadata', () => {
    // Arrange & Act
    render(<CodeChurnChart churnData={mockChurnData} />);

    // Assert — stat cards display counts from metadata
    expect(screen.getByText('High Risk Files')).toBeInTheDocument();
    expect(screen.getByText('Medium Risk Files')).toBeInTheDocument();
    expect(screen.getByText('Total Analyzed')).toBeInTheDocument();
    // highRiskCount=1, mediumRiskCount=2, totalFiles=10
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  test('should render top file in the Bug Hotspot Analysis section', () => {
    // Arrange & Act
    render(<CodeChurnChart churnData={mockChurnData} />);

    // Assert — the top file (api.ts extracted from path) appears in hotspot list
    // The filename is truncated from the path
    expect(screen.getByText('Bug Hotspot Analysis')).toBeInTheDocument();
    // api.ts is 6 chars, under 25 char limit, so renders as-is
    expect(screen.getAllByText('api.ts').length).toBeGreaterThan(0);
  });
});
