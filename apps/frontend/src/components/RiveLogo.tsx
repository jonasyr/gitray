import { useEffect, useState } from 'react';
import { useRive } from '@rive-app/react-canvas';

interface RiveLogoProps {
  /** Size of the logo container */
  size?: number;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show hover effects */
  interactive?: boolean;
  /** Current theme (light/dark/system) */
  theme?: 'light' | 'dark' | 'system';
}

/**
 * Rive logo component that displays the brand logo with interactive elements.
 * Automatically switches between light and dark mode logos based on the theme.
 * Uses the "State Machine 1" state machine for hover effects and interactions.
 */
export function RiveLogo({
  size = 60,
  className = '',
  interactive = true,
  theme = 'dark',
}: RiveLogoProps) {
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  // Resolve system theme preference
  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const updateTheme = () => {
        setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      };

      updateTheme();
      mediaQuery.addEventListener('change', updateTheme);
      return () => mediaQuery.removeEventListener('change', updateTheme);
    } else {
      setResolvedTheme(theme);
    }
  }, [theme]);

  const logoSrc =
    resolvedTheme === 'dark'
      ? '/Logo_Animation_StateMachine_DarkMode.riv'
      : '/Logo_Animation_StateMachine_LightMode.riv';

  const { RiveComponent } = useRive({
    src: logoSrc,
    stateMachines: 'State Machine 1',
    autoplay: true,
    onLoad: () => {
      console.log(`Rive logo loaded successfully (${resolvedTheme} mode)`);
    },
    onLoadError: (error) => {
      console.error('Failed to load Rive logo:', error);
    },
  });

  return (
    <div
      className={`flex items-center justify-center ${interactive ? 'cursor-pointer' : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      <RiveComponent />
    </div>
  );
}
