import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';

// Mock the modules
vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
  })),
}));

vi.mock('react', async () => {
  const actualReact = await vi.importActual('react');
  return {
    ...actualReact,
    StrictMode: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock('../src/App', () => ({
  default: () => null,
}));

vi.mock('../src/index.css', () => ({}));

describe('Main Entry Point', () => {
  let mockRootElement: HTMLDivElement;
  const originalGetElementById = document.getElementById;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRootElement = document.createElement('div');
    document.getElementById = vi.fn().mockReturnValue(mockRootElement);
  });

  afterEach(() => {
    document.getElementById = originalGetElementById;
    vi.resetModules();
  });

  test('should render App component into root element', async () => {
    // Act - Import main.tsx to trigger execution
    await import('../src/main');

    // Assert
    expect(document.getElementById).toHaveBeenCalledWith('root');
    expect(createRoot).toHaveBeenCalledWith(mockRootElement);
    const mockCreateRoot = vi.mocked(createRoot);
    expect(mockCreateRoot.mock.results[0].value.render).toHaveBeenCalled();
  });
});
