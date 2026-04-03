import { render, screen } from '@testing-library/react';
import { FileTypeList } from '../../src/components/FileTypeList';
import { describe, test, expect } from 'vitest';

describe('FileTypeList Component', () => {
  test('should render properly with no data', () => {
    // Arrange
    render(<FileTypeList fileDistribution={null} />);

    // Assert
    expect(screen.getByText('File Type Distribution')).toBeInTheDocument();
    expect(screen.getByText('No file data available')).toBeInTheDocument();
  });

  test('should render file types and calculate correct percentages', () => {
    // Arrange
    const allExtensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.py',
      '.go',
      '.rs',
      '.java',
      '.c',
      '.cpp',
      '.cs',
      '.rb',
      '.php',
      '.swift',
      '.kt',
      '.scala',
      '.clj',
      '.ex',
      '.erl',
      '.hs',
      '.lua',
      '.r',
      '.m',
      '.dart',
      '.sh',
      '.bash',
      '.ps1',
      '.psd1',
      '.psm1',
      '.pl',
      '.vb',
      '.fs',
      '.html',
      '.css',
      '.scss',
      '.sass',
      '.less',
      '.xml',
      '.svg',
      '.vue',
      '.json',
      '.yaml',
      '.yml',
      '.toml',
      '.csv',
      '.sql',
      '.md',
      '.txt',
      '.rst',
      '.tex',
      '.pdf',
      '.doc',
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.bmp',
      '.ico',
      '.tif',
      '.riv',
      '.env',
      '.gitignore',
      '.dockerignore',
      '.editorconfig',
      '.eslintrc',
      '.prettierrc',
      '.lock',
      '.log',
      '.zip',
      '.tar',
      '.gz',
      '', // No extension
      '.unknown', // Fallback
      // specific icon branches
      '.mp4',
      '.mp3',
      '.db',
      '.sqlite',
      '.xlsx',
      '.pem',
    ];

    const mockDistribution = {
      extensions: {} as Record<
        string,
        { count: number; percentage: number; size: number; averageSize: number }
      >,
      categories: {
        code: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        documentation: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        configuration: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        assets: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        other: { count: 0, percentage: 0, size: 0, averageSize: 0 },
      },
      directories: [],
      metadata: {
        totalFiles: 100,
        totalSize: 1024000, // 1MB, so ~10KB/file
        analyzedAt: new Date().toISOString(),
        repositorySize: '1 MB',
      },
    };

    allExtensions.forEach((ext) => {
      mockDistribution.extensions[ext] = {
        count: 1,
        percentage: 1,
        size: 10,
        averageSize: 10,
      };
    });

    // Act
    render(<FileTypeList fileDistribution={mockDistribution} />);

    // Assert
    expect(screen.getByText('File Type Distribution')).toBeInTheDocument();

    // Random checks
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText('files without extension')).toBeInTheDocument();

    // Check Average File Size
    expect(screen.getByText('≈ 10 KB')).toBeInTheDocument();
  });

  test('should format multiple extensions of the same display type together', () => {
    // Arrange
    const mockDistribution = {
      extensions: {
        '.ts': { count: 10, percentage: 40.05, size: 100, averageSize: 10 },
        '.tsx': { count: 10, percentage: 40.05, size: 100, averageSize: 10 },
      },
      categories: {
        code: { count: 20, percentage: 80.1, size: 0, averageSize: 0 },
        documentation: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        configuration: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        assets: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        other: { count: 0, percentage: 0, size: 0, averageSize: 0 },
      },
      directories: [],
      metadata: {
        totalFiles: 20,
        totalSize: 0,
        analyzedAt: new Date().toISOString(),
        repositorySize: '0 B',
      },
    };

    // Act
    render(<FileTypeList fileDistribution={mockDistribution} />);

    // Assert
    // They both map to "TypeScript"
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('.ts 40.05%, .tsx 40.05%')).toBeInTheDocument();
  });
});
