import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '../../../src/components/ui/use-mobile';
import { describe, test, expect, beforeEach, vi } from 'vitest';

describe('useIsMobile Hook', () => {
  let mockMatchMedia: ReturnType<typeof vi.fn>;
  let resizeListeners: Array<() => void> = [];

  beforeEach(() => {
    // Arrange
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024, // Desktop by default
    });

    resizeListeners = [];
    mockMatchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (event: string, listener: () => void) => {
        if (event === 'change') resizeListeners.push(listener);
      },
      removeEventListener: (event: string, listener: () => void) => {
        if (event === 'change') {
          resizeListeners = resizeListeners.filter((l) => l !== listener);
        }
      },
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: mockMatchMedia,
    });
  });

  test('should return false for desktop displays', () => {
    // Arrange
    window.innerWidth = 1024;

    // Act
    const { result } = renderHook(() => useIsMobile());

    // Assert
    expect(result.current).toBe(false);
  });

  test('should return true for mobile displays', () => {
    // Arrange
    window.innerWidth = 500;

    // Act
    const { result } = renderHook(() => useIsMobile());

    // Assert
    expect(result.current).toBe(true);
  });

  test('should update value on resize event', () => {
    // Arrange
    window.innerWidth = 1024;
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);

    // Act
    act(() => {
      window.innerWidth = 500;
      resizeListeners.forEach((listener) => listener());
    });

    // Assert
    expect(result.current).toBe(true);
  });

  test('should setup and cleanup event listeners', () => {
    // Arrange
    const { unmount } = renderHook(() => useIsMobile());
    expect(resizeListeners.length).toBe(1);

    // Act
    unmount();

    // Assert
    expect(resizeListeners.length).toBe(0);
  });
});
