// apps/frontend/src/__tests__/App.test.tsx
import { render, screen } from '@testing-library/react';
import App from '../src/App';

describe('App Component (ohne jest-dom)', () => {
  test('rendert MainPage mit Login- und Signup-Buttons', () => {
    render(<App />);
    // getByRole wirft, wenn der Button nicht da ist → Test schlägt fehl
    const loginBtn = screen.getByRole('button', { name: /login/i });
    const signupBtn = screen.getByRole('button', { name: /signup/i });
    // mit Standard-Matcher prüfen wir nur, dass der Wert nicht undefined ist
    expect(loginBtn).toBeDefined();
    expect(signupBtn).toBeDefined();
  });

  test('rendert exakt drei Explanation-Buttons', () => {
    render(<App />);
    const explainBtns = screen.getAllByRole('button', {
      name: /explanation \d+/i,
    });
    expect(explainBtns.length).toBe(3);
  });

  test('rendert Footer mit dem korrekten Text', () => {
    render(<App />);
    // Wir suchen den Text-Content und prüfen, dass er gefunden wird
    const preFooter = screen.getByText(/Nach dem runterscrollen:/i);
    const linkText = screen.getByText(
      /Links: Impressum; Datenschutzerklärung; "Über Uns"-Seite; created by "Namen von uns"/i
    );
    expect(preFooter).toBeDefined();
    expect(linkText).toBeDefined();
  });
});
