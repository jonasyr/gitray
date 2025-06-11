import { useRive } from '@rive-app/react-canvas';
import React from 'react';
import LoadingAsset from '../assets/Logo_Animation_StateMachine_DarkMode.riv';

/**
 * Displays the "Loading" animation from the Rive asset.
 */
const LoadingAnimation: React.FC<{ className?: string }> = ({ className }) => {
  const { RiveComponent } = useRive({
    src: LoadingAsset,
    animations: 'Loading',
    autoplay: true,
  });

  return <RiveComponent className={className} />;
};

export default LoadingAnimation;
