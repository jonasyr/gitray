import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect } from 'vitest';
import { AIInsights } from '../../src/components/AIInsights';

describe('AIInsights Component', () => {
  test('should render the component and default Overview tab', () => {
    // Act
    render(<AIInsights />);

    // Assert
    expect(
      screen.getByText(
        /AI-powered insights are generated based on your project's structure/i
      )
    ).toBeInTheDocument();

    // Check if tabs are present
    expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Weekly/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Trends/i })).toBeInTheDocument();

    // Check Overview content
    expect(screen.getByText('Project Health Score')).toBeInTheDocument();
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText('Recommendations')).toBeInTheDocument();
    expect(
      screen.getByText('Implement lazy loading for feature modules')
    ).toBeInTheDocument();
  });

  test('should switch to the Weekly tab when clicked', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<AIInsights />);
    const weeklyTab = screen.getByRole('tab', { name: /Weekly/i });

    // Act
    await user.click(weeklyTab);

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText('Weekly Development Summary')
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Week 47 (Nov 1-7)')).toBeInTheDocument();
    expect(
      screen.getByText('Implemented new dashboard analytics feature')
    ).toBeInTheDocument();
  });

  test('should switch to the Trends tab when clicked', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<AIInsights />);
    const trendsTab = screen.getByRole('tab', { name: /Trends/i });

    // Act
    await user.click(trendsTab);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Monthly Trends')).toBeInTheDocument();
    });
    expect(screen.getByText('Team Productivity')).toBeInTheDocument();
    expect(screen.getByText('Code Quality')).toBeInTheDocument();
    expect(screen.getByText('Team Collaboration')).toBeInTheDocument();
  });
});
