import React from 'react';
import { useRive } from '@rive-app/react-canvas';

interface RiveLoaderProps {
  /** Size of the animation container */
  size?: number;
  /** Additional CSS classes */
  className?: string;
  /** Loading message to display */
  message?: string;
}

/**
 * Rive animation component that displays a loading animation from the dark mode logo file.
 * The animation uses the "Loading" state machine and timeline.
 */
const RiveLoader: React.FC<RiveLoaderProps> = ({
  size = 120,
  className = '',
  message = 'Loading...',
}) => {
  const { RiveComponent } = useRive({
    src: '/Logo_Animation_StateMachine_DarkMode.riv',
    stateMachines: 'Loading',
    autoplay: true,
    onLoad: () => {
      console.log('Rive animation loaded successfully');
    },
    onLoadError: (error) => {
      console.error('Failed to load Rive animation:', error);
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
      {message && <p className="mt-4 text-gray-400 text-center">{message}</p>}
    </div>
  );
};

export default RiveLoader;
