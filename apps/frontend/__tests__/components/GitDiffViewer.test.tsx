import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { GitDiffViewer } from '../../src/components/GitDiffViewer';

describe('GitDiffViewer Component', () => {
  test('should render the diff viewer with correct totals', () => {
    // Act
    render(<GitDiffViewer />);

    // Assert
    expect(screen.getByText('Git Diff Viewer')).toBeInTheDocument();

    // totalAdditions: 45 + 23 + 8 = 76
    // totalDeletions: 12 + 5 + 2 = 19
    expect(screen.getByText(/76 additions/i)).toBeInTheDocument();
    expect(screen.getByText(/19 deletions/i)).toBeInTheDocument();
    expect(screen.getByText(/3 files changed/i)).toBeInTheDocument();

    // verify file names are displayed
    expect(
      screen.getByText('src/components/Dashboard.tsx')
    ).toBeInTheDocument();
    expect(screen.getByText('src/lib/api.ts')).toBeInTheDocument();
    expect(screen.getByText('src/styles/globals.css')).toBeInTheDocument();
  });

  test('should toggle file diff visibility when clicked', () => {
    // Arrange
    render(<GitDiffViewer />);
    const firstFileRow = screen.getByRole('button', {
      name: /src\/components\/Dashboard.tsx/i,
    });
    const secondFileRow = screen.getByRole('button', {
      name: /src\/lib\/api.ts/i,
    });

    // Act & Assert initially (Dashboard is open by default, api.ts is closed)
    expect(
      screen.getByText("import { Card } from './ui/card';")
    ).toBeInTheDocument();
    expect(
      screen.queryByText('async function fetchData() {')
    ).not.toBeInTheDocument();

    // Act - close Dashboard
    fireEvent.click(firstFileRow);
    // Assert
    expect(
      screen.queryByText("import { Card } from './ui/card';")
    ).not.toBeInTheDocument();

    // Act - open api.ts
    fireEvent.click(secondFileRow);
    // Assert
    expect(
      screen.getByText('async function fetchData() {')
    ).toBeInTheDocument();
  });
});
