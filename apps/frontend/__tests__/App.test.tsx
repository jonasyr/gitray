import { describe, expect, test } from 'vitest';
// apps/frontend/src/__tests__/App.test.tsx
import { render, screen } from '@testing-library/react';
import App from '../src/App';

describe('App Component', () => {
  test('renders main page with login and signup buttons', () => {
    // Arrange

    // Act: render the component under test
    render(<App />);

    // Assert: both buttons should be present
    const loginBtn = screen.getByRole('button', { name: /login/i });
    const signupBtn = screen.getByRole('button', { name: /signup/i });
    expect(loginBtn).toBeDefined();
    expect(signupBtn).toBeDefined();
  });

  test('renders exactly three explanation buttons', () => {
    // Arrange

    // Act
    render(<App />);

    // Assert
    const explainBtns = screen.getAllByRole('button', {
      name: /explanation \d+/i,
    });
    expect(explainBtns.length).toBe(3);
  });

  test('renders footer with the correct text', () => {
    // Arrange

    // Act
    render(<App />);

    // Assert
    const preFooter = screen.getByText(/Nach dem runterscrollen:/i);
    const linkText = screen.getByText(
      /Links: Impressum; Datenschutzerklärung; "Über Uns"-Seite; created by "Namen von uns"/i
    );
    expect(preFooter).toBeDefined();
    expect(linkText).toBeDefined();
  });
});
