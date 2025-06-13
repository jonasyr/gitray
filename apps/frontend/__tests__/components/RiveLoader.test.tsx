import { render, screen, act } from '@testing-library/react';
import { vi } from 'vitest';
import RiveLoader from '../../src/components/RiveLoader';
import { useRive } from '@rive-app/react-canvas';

vi.mock('@rive-app/react-canvas', () => ({ useRive: vi.fn() }));

const mockedUseRive = useRive as ReturnType<typeof vi.fn>;

const MockRiveComponent = () => <div data-testid="rive" />;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RiveLoader Component (happy path, AAA)', () => {
  test('renders default loader and triggers callbacks', () => {
    // Arrange
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let options: Parameters<typeof useRive>[0] | undefined;
    mockedUseRive.mockImplementation((opts) => {
      options = opts;
      return { RiveComponent: MockRiveComponent } as unknown as ReturnType<
        typeof useRive
      >;
    });

    // Act
    render(<RiveLoader />);

    // Assert
    expect(mockedUseRive).toHaveBeenCalled();
    expect(options).toBeDefined();
    expect(options?.src).toBe('/Logo_Animation_StateMachine_DarkMode.riv');
    expect(screen.getByTestId('rive')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Act
    act(() => {
      // Mock the callback parameters as needed by the implementation
      options?.onLoad?.({} as any);
      options?.onLoadError?.('test error' as any);
    });

    // Assert
    expect(logSpy).toHaveBeenCalledWith('Rive animation loaded successfully');
    expect(errSpy).toHaveBeenCalledWith(
      'Failed to load Rive animation:',
      'test error'
    );
  });

  test('accepts custom props', () => {
    // Arrange
    mockedUseRive.mockReturnValue({
      RiveComponent: MockRiveComponent,
    } as unknown as ReturnType<typeof useRive>);

    // Act
    const { container } = render(
      <RiveLoader size={50} className="extra" message="wait" />
    );

    // Assert
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex', 'extra');
    const inner = screen.getByTestId('rive').parentElement as HTMLElement;
    expect(inner.style.width).toBe('50px');
    expect(screen.getByText('wait')).toBeInTheDocument();
  });
});
