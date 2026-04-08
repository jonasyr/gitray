import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { RiveLoader } from '../../src/components/RiveLoader';

// Mock @rive-app/react-canvas to avoid loading actual Rive runtime in jsdom
vi.mock('@rive-app/react-canvas', () => ({
  useRive: vi.fn(() => ({
    RiveComponent: () => null,
  })),
}));

describe('RiveLoader Component', () => {
  test('should render with the default "Loading..." message', () => {
    // Arrange & Act
    render(<RiveLoader />);

    // Assert
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('should render with a custom message prop', () => {
    // Arrange
    const customMessage = 'Fetching repository data...';

    // Act
    render(<RiveLoader message={customMessage} />);

    // Assert
    expect(screen.getByText(customMessage)).toBeInTheDocument();
  });

  test('should render without errors using dark theme (default)', () => {
    // Arrange & Act
    const { container } = render(<RiveLoader theme="dark" />);

    // Assert — component mounts without throwing
    expect(container).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
