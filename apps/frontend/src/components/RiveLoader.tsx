import { useEffect, useState } from 'react';
import { useRive } from '@rive-app/react-canvas';

interface RiveLoaderProps {
  /** Size of the animation container */
  size?: number;
  /** Additional CSS classes */
  className?: string;
  /** Loading message to display */
  message?: string;
  /** Current theme (light/dark/system) */
  theme?: 'light' | 'dark' | 'system';
}

/**
 * Rive animation component that displays a loading animation.
 * Automatically switches between light and dark mode animations based on the theme.
 * Uses the "Loading" state machine for the loading animation.
 */
function RiveLoaderInner({
  size = 120,
  className = '',
  message = 'Loading...',
  resolvedTheme,
}: {
  size: number;
  className: string;
  message: string;
  resolvedTheme: 'light' | 'dark';
}) {
  const animationSrc =
    resolvedTheme === 'dark'
      ? '/Logo_Animation_StateMachine_DarkMode.riv'
      : '/Logo_Animation_StateMachine_LightMode.riv';

  const { RiveComponent } = useRive({
    src: animationSrc,
    stateMachines: 'Loading',
    autoplay: true,
    onLoad: () => {
      console.log(
        `Rive loading animation loaded successfully (${resolvedTheme} mode)`
      );
    },
    onLoadError: (error) => {
      console.error('Failed to load Rive loading animation:', error);
    },
  });

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center"
      >
        <RiveComponent />
      </div>
      {message && (
        <p className="mt-4 text-muted-foreground text-center">{message}</p>
      )}
    </div>
  );
}

export function RiveLoader({
  size = 120,
  className = '',
  message = 'Loading...',
  theme = 'dark',
}: RiveLoaderProps) {
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  // Resolve system theme preference
  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const updateTheme = () => {
        const newTheme = mediaQuery.matches ? 'dark' : 'light';
        setResolvedTheme(newTheme);
      };

      updateTheme();
      mediaQuery.addEventListener('change', updateTheme);
      return () => mediaQuery.removeEventListener('change', updateTheme);
    } else {
      setResolvedTheme(theme);
    }
  }, [theme]);

  return (
    <RiveLoaderInner
      key={resolvedTheme}
      size={size}
      className={className}
      message={message}
      resolvedTheme={resolvedTheme}
    />
  );
}
