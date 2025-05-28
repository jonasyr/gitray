// jest.setup.react19.ts - Spezielle Einstellungen für React 19
import '@testing-library/jest-dom';
import { act } from '@testing-library/react';

// Für React 19: Verbesserung des act() Warnings
// React 19 hat ein neues Timing-Modell, das mehr asynchrone Operationen verwendet
// SonarLint: suppress deprecation warning on act’s old signature
const originalAct: any = act;
(global as any).act = async (callback: () => Promise<void> | void) => {
  await originalAct(async () => {
    await callback();
    // Kleiner Timeout, um sicherzustellen, dass alle Promises abgewickelt sind
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // Noch ein Tick, um sicherzustellen, dass die React-Renderings abgeschlossen sind
  await new Promise((resolve) => setTimeout(resolve, 0));
};

// Weitere Mocks für React 19 können hier hinzugefügt werden
