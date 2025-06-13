import React from 'react';
import { useRive } from '@rive-app/react-canvas';

interface RiveLogoProps {
  /** Size of the logo container */
  size?: number;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show hover effects */
  interactive?: boolean;
}

/**
 * Rive logo component that displays the brand logo with interactive elements.
 * Uses the "State Machine 1" state machine for hover effects and interactions.
 */
const RiveLogo: React.FC<RiveLogoProps> = ({
  size = 60,
  className = '',
  interactive = true,
}) => {
  const { RiveComponent } = useRive({
    src: '/Logo_Animation_StateMachine_DarkMode.riv',
    stateMachines: 'State Machine 1',
    autoplay: true,
    onLoad: () => {
      console.log('Rive logo loaded successfully');
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
};

export default RiveLogo;
