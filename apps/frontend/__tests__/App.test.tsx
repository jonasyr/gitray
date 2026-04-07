import { render, screen, act } from '@testing-library/react';
import App from '../src/App';
import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../src/components/Header', () => ({
  Header: () => <div data-testid="mock-header" />,
}));
vi.mock('../src/components/Footer', () => ({
  Footer: () => <div data-testid="mock-footer" />,
}));
vi.mock('../src/components/LandingPage', () => ({
  LandingPage: ({ onAnalyze }: any) => (
    <div data-testid="mock-landing">
      <button
        onClick={() => onAnalyze('https://github.com/test')}
        data-testid="analyze-btn"
      >
        Analyze
      </button>
    </div>
  ),
}));
vi.mock('../src/components/DashboardPage', () => ({
  default: () => <div data-testid="mock-dashboard" />,
}));
vi.mock('../src/components/RiveLoader', () => ({
  RiveLoader: () => <div data-testid="mock-loader" />,
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
  Toaster: () => <div data-testid="mock-toaster" />,
}));
vi.mock('../src/services/api', () => ({
  getRepositoryFullData: vi.fn(),
}));

describe('App Component', () => {
  beforeEach(() => {
    // Arrange: Reset mocks and DOM
    vi.clearAllMocks();
  });

  test('should render LandingPage by default with Header and Footer', async () => {
    // Act
    await act(async () => {
      render(<App />);
    });

    // Assert
    expect(screen.getByTestId('mock-header')).toBeInTheDocument();
    expect(screen.getByTestId('mock-landing')).toBeInTheDocument();
    expect(screen.getByTestId('mock-footer')).toBeInTheDocument();
  });

  test('should transition to DashboardPage on successful analysis', async () => {
    // Arrange
    const { getRepositoryFullData } = await import('../src/services/api');
    (getRepositoryFullData as any).mockResolvedValue({
      commits: [],
      heatmapData: null,
      isValidHeatmap: true,
    });

    await act(async () => {
      render(<App />);
    });

    // Act
    const analyzeBtn = screen.getByTestId('analyze-btn');
    await act(async () => {
      analyzeBtn.click();
    });

    // Assert
    // It should first show loader, then dashboard
    // Check API was called
    expect(getRepositoryFullData).toHaveBeenCalledWith(
      'https://github.com/test',
      'day'
    );

    // Check that dashboard is rendered (since the mock returns immediately in `act`)
    expect(screen.getByTestId('mock-dashboard')).toBeInTheDocument();
    // Landing shouldn't be rendered anymore
    expect(screen.queryByTestId('mock-landing')).not.toBeInTheDocument();
  });

  test('should handle API errors gracefully via toast', async () => {
    // Arrange
    const { getRepositoryFullData } = await import('../src/services/api');
    const { toast } = await import('sonner');
    (getRepositoryFullData as any).mockRejectedValue(
      new Error('Network error')
    );

    await act(async () => {
      render(<App />);
    });

    // Act
    const analyzeBtn = screen.getByTestId('analyze-btn');
    await act(async () => {
      analyzeBtn.click();
    });

    // Assert
    expect(toast.error).toHaveBeenCalledWith('Analysis failed', {
      description: 'Network error',
    });
    // Should still be on landing page
    expect(screen.getByTestId('mock-landing')).toBeInTheDocument();
  });
});
