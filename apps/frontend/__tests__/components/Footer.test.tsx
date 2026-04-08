import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { Footer } from '../../src/components/Footer';

describe('Footer Component', () => {
  test('should render the GitHub repository link', () => {
    // Arrange & Act
    render(<Footer />);

    // Assert
    const repoLink = screen.getByRole('link', { name: /GitRay Repository/i });
    expect(repoLink).toBeInTheDocument();
    expect(repoLink).toHaveAttribute(
      'href',
      'https://github.com/jonasyr/gitray'
    );
  });

  test('should render the copyright text', () => {
    // Arrange & Act
    render(<Footer />);

    // Assert
    expect(screen.getByText('© GitRay 2025')).toBeInTheDocument();
  });

  test('should render Privacy Policy and Contact links', () => {
    // Arrange & Act
    render(<Footer />);

    // Assert
    expect(
      screen.getByRole('link', { name: /Privacy Policy/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Contact/i })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Impressum/i })
    ).toBeInTheDocument();
  });
});
