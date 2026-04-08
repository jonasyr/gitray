import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import { Header } from '../../src/components/Header';

// Mock RiveLogo to avoid pulling in @rive-app/react-canvas
vi.mock('../../src/components/RiveLogo', () => ({
  RiveLogo: () => <div data-testid="rive-logo" />,
}));

describe('Header Component', () => {
  const defaultProps = {
    isSignedIn: false,
    onMenuClick: vi.fn(),
    onNewsClick: vi.fn(),
    onNavigateHome: vi.fn(),
  };

  test('should render "Sign in / Log in" button when not signed in', () => {
    // Arrange & Act
    render(<Header {...defaultProps} isSignedIn={false} />);

    // Assert
    expect(screen.getByText(/Sign in \/ Log in/i)).toBeInTheDocument();
  });

  test('should render avatar fallback "JD" when signed in', () => {
    // Arrange & Act
    render(<Header {...defaultProps} isSignedIn={true} />);

    // Assert
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  test('should call onMenuClick when the menu button is clicked', async () => {
    // Arrange
    const onMenuClick = vi.fn();
    const user = userEvent.setup();
    render(<Header {...defaultProps} onMenuClick={onMenuClick} />);

    // Act — the menu button is the first button in the header (icon-only, no text)
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]);

    // Assert
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  test('should show unread news badge when hasUnreadNews=true and showNews=true', () => {
    // Arrange & Act
    render(<Header {...defaultProps} showNews={true} hasUnreadNews={true} />);

    // Assert — badge element rendered (small dot badge)
    // The Badge component renders with bg-secondary class when unread
    const badge = document.querySelector('.bg-secondary');
    expect(badge).toBeInTheDocument();
  });
});
