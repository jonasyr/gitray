import { render, screen, act } from '@testing-library/react';
import { vi } from 'vitest';
import RiveLogo from '../../src/components/RiveLogo';
import { useRive } from '@rive-app/react-canvas';

vi.mock('@rive-app/react-canvas', () => ({ useRive: vi.fn() }));

const mockedUseRive = useRive as ReturnType<typeof vi.fn>;

const MockRiveComponent = () => <div data-testid="rive" />;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RiveLogo Component (happy path, AAA)', () => {
  test.skip('renders default logo and triggers callbacks', () => {
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
    const { container } = render(<RiveLogo />);

    // Assert
    expect(mockedUseRive).toHaveBeenCalled();
    expect(options).toBeDefined();
    expect(options?.src).toBe('/Logo_Animation_StateMachine_DarkMode.riv');
    expect(screen.getByTestId('rive')).toBeInTheDocument();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('cursor-pointer');
    expect(wrapper).toHaveStyle({ width: '60px', height: '60px' });

    // Act
    act(() => {
      options?.onLoad?.({} as any);
      options?.onLoadError?.('err' as any);
    });

    // Assert
    expect(logSpy).toHaveBeenCalledWith('Rive logo loaded successfully');
    expect(errSpy).toHaveBeenCalledWith('Failed to load Rive logo:', 'err');
  });

  test.skip('accepts custom props', () => {
    // Arrange
    mockedUseRive.mockReturnValue({
      RiveComponent: MockRiveComponent,
    } as unknown as ReturnType<typeof useRive>);

    // Act
    const { container } = render(
      <RiveLogo size={40} className="extra" interactive={false} />
    );

    // Assert
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex', 'extra');
    expect(wrapper.className).not.toContain('cursor-pointer');
    expect(wrapper).toHaveStyle({ width: '40px', height: '40px' });
  });
});
