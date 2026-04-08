import { render } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { RiveLogo } from '../../src/components/RiveLogo';

// Mock @rive-app/react-canvas to avoid loading actual Rive runtime in jsdom
vi.mock('@rive-app/react-canvas', () => ({
  useRive: vi.fn(() => ({
    RiveComponent: () => null,
  })),
}));

describe('RiveLogo Component', () => {
  test('should render a container with the default 60×60 size', () => {
    // Arrange & Act
    const { container } = render(<RiveLogo />);

    // Assert — outer div has the correct inline size
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.style.width).toBe('60px');
    expect(wrapper.style.height).toBe('60px');
  });

  test('should render a container with a custom size', () => {
    // Arrange & Act
    const { container } = render(<RiveLogo size={40} />);

    // Assert
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.width).toBe('40px');
    expect(wrapper.style.height).toBe('40px');
  });

  test('should apply cursor-pointer class when interactive is true', () => {
    // Arrange & Act
    const { container } = render(<RiveLogo interactive={true} />);

    // Assert
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('cursor-pointer');
  });
});
