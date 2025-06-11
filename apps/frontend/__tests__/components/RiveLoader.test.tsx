import { render, screen, act } from '@testing-library/react';
import RiveLoader from '../../src/components/RiveLoader';
import { useRive } from '@rive-app/react-canvas';

jest.mock('@rive-app/react-canvas', () => ({ useRive: jest.fn() }));

const mockedUseRive = useRive as jest.MockedFunction<typeof useRive>;

const MockRiveComponent = () => <div data-testid="rive" />;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RiveLoader Component (happy path, AAA)', () => {
  test('renders default loader and triggers callbacks', () => {
    // Arrange
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let options: Parameters<typeof useRive>[0] | undefined;
    mockedUseRive.mockImplementation((opts) => {
      options = opts;
      return { RiveComponent: MockRiveComponent } as any;
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
      options?.onLoad?.({} as any);
      options?.onLoadError?.('oops' as any);
    });

    // Assert
    expect(logSpy).toHaveBeenCalledWith('Rive animation loaded successfully');
    expect(errSpy).toHaveBeenCalledWith(
      'Failed to load Rive animation:',
      'oops'
    );
  });

  test('accepts custom props', () => {
    // Arrange
    mockedUseRive.mockReturnValue({ RiveComponent: MockRiveComponent } as any);

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
