import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import { SettingsDrawer } from '../../src/components/SettingsDrawer';

describe('SettingsDrawer Component', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    theme: 'dark' as const,
    onThemeChange: vi.fn(),
  };

  test('should render the "Settings" sheet title when open', () => {
    // Arrange & Act
    render(<SettingsDrawer {...defaultProps} />);

    // Assert
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  test('should render all four tab triggers', () => {
    // Arrange & Act
    render(<SettingsDrawer {...defaultProps} />);

    // Assert
    expect(screen.getByRole('tab', { name: /General/i })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /Appearance/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Account/i })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /Connections/i })
    ).toBeInTheDocument();
  });

  test('should call onThemeChange with "light" when Light radio is selected', async () => {
    // Arrange
    const onThemeChange = vi.fn();
    const user = userEvent.setup();
    render(<SettingsDrawer {...defaultProps} onThemeChange={onThemeChange} />);

    // Act — navigate to Appearance tab then click Light radio
    await user.click(screen.getByRole('tab', { name: /Appearance/i }));
    await user.click(screen.getByRole('radio', { name: /Light/i }));

    // Assert
    expect(onThemeChange).toHaveBeenCalledWith('light');
  });

  test('should render Language select with English (Default) option in General tab', () => {
    // Arrange & Act
    render(<SettingsDrawer {...defaultProps} />);

    // Assert — General tab is default; Language label and option visible
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('English (Default)')).toBeInTheDocument();
  });
});
