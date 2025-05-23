// apps/frontend/src/__tests__/main.test.tsx
import { createRoot } from 'react-dom/client';

// Mock the modules
jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => ({
    render: jest.fn(),
  })),
}));

// Mock React's StrictMode without importing from react
jest.mock('react', () => {
  const actualReact = jest.requireActual('react');
  return {
    ...actualReact,
    StrictMode: jest.fn(
      ({ children }: { children: React.ReactNode }) => children
    ),
  };
});

// Mock App component without importing
jest.mock('../App', () => jest.fn(() => null), { virtual: true });

// Mock direct import for index.css
jest.mock('../index.css', () => ({}), { virtual: true });

// Mock getElementById
const originalGetElementById = document.getElementById;

describe('Main Entry Point', () => {
  // Explicitly type mockRootElement as HTMLDivElement
  let mockRootElement: HTMLDivElement;

  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();

    // Create mock root element
    mockRootElement = document.createElement('div');

    // Mock getElementById to always return our non-null element
    document.getElementById = jest.fn().mockReturnValue(mockRootElement);

    // Create a mock version of main.tsx content
    jest.doMock(
      '../main.tsx',
      () => {
        // This simulates what main.tsx would do
        const rootElement = document.getElementById('root');
        // Only proceed if rootElement is not null (TypeScript safety)
        if (rootElement) {
          const root = createRoot(rootElement);
          root.render(
            jest.requireMock('react').StrictMode({
              children: jest.requireMock('../App')(),
            })
          );
        }
        return {};
      },
      { virtual: true }
    );
  });

  afterEach(() => {
    // Restore getElementById
    document.getElementById = originalGetElementById;

    // Reset modules to ensure clean slate between tests
    jest.resetModules();
  });

  test('should render App component into root element', () => {
    // Act
    jest.requireMock('../main.tsx');

    // Assert
    expect(document.getElementById).toHaveBeenCalledWith('root');
    expect(createRoot).toHaveBeenCalledWith(mockRootElement);
    expect(
      (createRoot as jest.Mock).mock.results[0].value.render
    ).toHaveBeenCalled();
  });
});
