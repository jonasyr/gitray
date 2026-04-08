import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';

describe('LoadingSpinner Component', () => {
  test('should render with the default "Loading..." message', () => {
    // Arrange & Act
    render(<LoadingSpinner />);

    // Assert
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('should render with a custom message prop', () => {
    // Arrange
    const customMessage = 'Analyzing repository...';

    // Act
    render(<LoadingSpinner message={customMessage} />);

    // Assert
    expect(screen.getByText(customMessage)).toBeInTheDocument();
  });
});
