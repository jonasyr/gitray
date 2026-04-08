import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { InfoModal } from '../../src/components/InfoModal';

describe('InfoModal Component', () => {
  test('should render nothing when type is null', () => {
    // Arrange & Act
    const { container } = render(
      <InfoModal open={true} onClose={vi.fn()} type={null} />
    );

    // Assert — null renders an empty container
    expect(container).toBeEmptyDOMElement();
  });

  test('should render "What is GitRay?" content for type="what"', () => {
    // Arrange & Act
    render(<InfoModal open={true} onClose={vi.fn()} type="what" />);

    // Assert
    expect(screen.getByText('What is GitRay?')).toBeInTheDocument();
    expect(
      screen.getByText(/powerful Git repository analytics tool/i)
    ).toBeInTheDocument();
  });

  test('should render private repository content for type="private"', () => {
    // Arrange & Act
    render(<InfoModal open={true} onClose={vi.fn()} type="private" />);

    // Assert
    expect(
      screen.getByText('Analyze a Private Repository')
    ).toBeInTheDocument();
    expect(screen.getByText(/Personal Access Token/i)).toBeInTheDocument();
  });

  test('should render local server content for type="local"', () => {
    // Arrange & Act
    render(<InfoModal open={true} onClose={vi.fn()} type="local" />);

    // Assert
    expect(screen.getByText('Analyze on a Local Server')).toBeInTheDocument();
    expect(
      screen.getByText(/self-hosted on your local server/i)
    ).toBeInTheDocument();
  });
});
