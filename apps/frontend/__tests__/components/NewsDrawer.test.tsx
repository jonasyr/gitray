import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { NewsDrawer } from '../../src/components/NewsDrawer';

describe('NewsDrawer Component', () => {
  test('should render the "What\'s New" title when open', () => {
    // Arrange & Act
    render(<NewsDrawer open={true} onClose={vi.fn()} />);

    // Assert
    expect(screen.getByText("What's New")).toBeInTheDocument();
  });

  test('should render all news item titles when open', () => {
    // Arrange & Act
    render(<NewsDrawer open={true} onClose={vi.fn()} />);

    // Assert — check a sampling of news titles from the static newsItems array
    expect(
      screen.getByText('Major Update: AI Insights & Premium Features')
    ).toBeInTheDocument();
    expect(screen.getByText('New: Advanced Analytics Tab')).toBeInTheDocument();
    expect(
      screen.getByText('Enhanced: Contribution Ranking')
    ).toBeInTheDocument();
    expect(screen.getByText('Private repo tokens')).toBeInTheDocument();
    expect(
      screen.getByText('New: File Distribution chart')
    ).toBeInTheDocument();
  });

  test('should render version badges including v2.0 and v1.9', () => {
    // Arrange & Act
    render(<NewsDrawer open={true} onClose={vi.fn()} />);

    // Assert — multiple v2.0 badges exist; find them all and check at least one
    const v2Badges = screen.getAllByText('v2.0');
    expect(v2Badges.length).toBeGreaterThan(0);
    expect(screen.getByText('v1.9')).toBeInTheDocument();
    expect(screen.getByText('v1.8')).toBeInTheDocument();
  });
});
