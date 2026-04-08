import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import { LandingPage } from '../../src/components/LandingPage';

describe('LandingPage Component', () => {
  test('should render the "GitRay" hero title', () => {
    // Arrange & Act
    render(<LandingPage onAnalyze={vi.fn()} onInfoClick={vi.fn()} />);

    // Assert
    expect(screen.getByRole('heading', { name: 'GitRay' })).toBeInTheDocument();
  });

  test('should disable the Analyze button when URL input is empty', () => {
    // Arrange & Act
    render(<LandingPage onAnalyze={vi.fn()} onInfoClick={vi.fn()} />);

    // Assert
    const button = screen.getByRole('button', { name: /Analyze Repository/i });
    expect(button).toBeDisabled();
  });

  test('should call onAnalyze with URL and default mode when button clicked', async () => {
    // Arrange
    const onAnalyze = vi.fn();
    const user = userEvent.setup();
    render(<LandingPage onAnalyze={onAnalyze} onInfoClick={vi.fn()} />);
    const input = screen.getByRole('textbox');
    const button = screen.getByRole('button', { name: /Analyze Repository/i });

    // Act
    await user.type(input, 'https://github.com/org/repo');
    await user.click(button);

    // Assert
    expect(onAnalyze).toHaveBeenCalledWith(
      'https://github.com/org/repo',
      'main'
    );
  });

  test('should call onInfoClick with "what" when "What is GitRay?" is clicked', async () => {
    // Arrange
    const onInfoClick = vi.fn();
    const user = userEvent.setup();
    render(<LandingPage onAnalyze={vi.fn()} onInfoClick={onInfoClick} />);

    // Act
    await user.click(screen.getByRole('button', { name: /What is GitRay\?/i }));

    // Assert
    expect(onInfoClick).toHaveBeenCalledWith('what');
  });

  test('should call onInfoClick with "private" and "local" from helper buttons', async () => {
    // Arrange
    const onInfoClick = vi.fn();
    const user = userEvent.setup();
    render(<LandingPage onAnalyze={vi.fn()} onInfoClick={onInfoClick} />);

    // Act
    await user.click(
      screen.getByRole('button', { name: /Analyze a private Repo\?/i })
    );
    await user.click(
      screen.getByRole('button', { name: /Analyze on a local Server\?/i })
    );

    // Assert
    expect(onInfoClick).toHaveBeenCalledWith('private');
    expect(onInfoClick).toHaveBeenCalledWith('local');
  });
});
