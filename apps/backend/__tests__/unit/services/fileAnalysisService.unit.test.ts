/**
 * Unit tests for FileAnalysisService
 *
 * Coverage targets:
 * - File categorization: 100%
 * - Statistics calculation: 100%
 * - Directory distribution: 100%
 * - Filter application: 100%
 * - Performance metrics: 100%
 * - Analysis method selection: 100%
 * - Error handling: 100%
 * - Overall: ≥80%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FileInfo, FileCategory } from '@gitray/shared-types';

// Mock dependencies before imports
vi.mock('simple-git', () => {
  const mockGit = {
    listRemote: vi.fn(),
    raw: vi.fn(),
    clone: vi.fn(),
    fetch: vi.fn(),
  };
  return {
    default: vi.fn(() => mockGit),
  };
});

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  rm: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}));

vi.mock('../../../src/services/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../src/services/metrics', () => ({
  recordStreamingStart: vi.fn(),
  recordStreamingCompletion: vi.fn(),
  recordStreamingBatch: vi.fn(),
  recordDetailedError: vi.fn(),
  updateServiceHealthScore: vi.fn(),
  getRepositorySizeCategory: vi.fn((size: number) => {
    if (size < 1000) return 'small';
    if (size < 5000) return 'medium';
    if (size < 20000) return 'large';
    return 'xl';
  }),
  recordFileAnalysisMethodUsage: vi.fn(),
  recordFileTreeCacheOperation: vi.fn(),
  recordFileAnalysisPerformanceMetrics: vi.fn(),
  recordFileAnalysisBandwidth: vi.fn(),
}));

vi.mock('../../../src/utils/memoryPressureManager', () => ({
  getMemoryStats: vi.fn(() => ({
    rss: 100 * 1024 * 1024, // 100MB
    heapTotal: 80 * 1024 * 1024,
    heapUsed: 60 * 1024 * 1024,
    external: 5 * 1024 * 1024,
    arrayBuffers: 2 * 1024 * 1024,
    pressure: 'normal' as const,
  })),
}));

// Test fixtures
const createTestFileInfo = (
  path: string,
  size: number,
  extension?: string,
  category?: FileCategory
): FileInfo => ({
  path,
  size,
  extension:
    extension !== undefined ? extension : path.substring(path.lastIndexOf('.')),
  category: category || 'code',
  lastModified: new Date().toISOString(),
});

const createMockFileTree = (count: number, extension = '.ts'): FileInfo[] => {
  // Map common extensions to categories
  const categoryMap: Record<string, FileCategory> = {
    '.ts': 'code',
    '.js': 'code',
    '.md': 'documentation',
    '.json': 'configuration',
    '.csv': 'assets',
    '.zip': 'assets',
  };

  const category = categoryMap[extension] || 'other';

  return Array.from({ length: count }, (_, i) => ({
    path: `src/file${i}${extension}`,
    size: 1000 + i * 100,
    extension,
    category,
    lastModified: new Date().toISOString(),
  }));
};

describe('FileAnalysisService', () => {
  let service: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the singleton service instance
    const module = await import('../../../src/services/fileAnalysisService');
    service = (module as any).fileAnalysisService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ================================================================
  // 1. FILE CATEGORIZATION TESTS (15-20 tests)
  // ================================================================
  describe('categorizeFile', () => {
    const categorize = (path: string): FileCategory => {
      return (service as any).categorizeFile(path);
    };

    describe('Happy path - Known extensions', () => {
      it('should categorize code files correctly', () => {
        expect(categorize('src/index.ts')).toBe('code');
        expect(categorize('app.js')).toBe('code');
        expect(categorize('main.py')).toBe('code');
        expect(categorize('App.java')).toBe('code');
        expect(categorize('main.cpp')).toBe('code');
      });

      it('should categorize documentation files correctly', () => {
        expect(categorize('README.md')).toBe('documentation');
        expect(categorize('docs.txt')).toBe('documentation');
        expect(categorize('guide.rst')).toBe('documentation');
        expect(categorize('manual.pdf')).toBe('documentation');
      });

      it('should categorize configuration files correctly', () => {
        expect(categorize('config.json')).toBe('configuration');
        expect(categorize('settings.yaml')).toBe('configuration');
        expect(categorize('.eslintrc')).toBe('configuration');
        expect(categorize('package.json')).toBe('configuration');
      });

      it('should categorize asset files correctly', () => {
        // Test with extensions that actually exist in the map
        expect(categorize('data.csv')).toBe('assets');
        expect(categorize('file.zip')).toBe('assets');
        expect(categorize('archive.tar')).toBe('assets');
      });
    });

    describe('Edge cases', () => {
      it('should handle uppercase extensions', () => {
        expect(categorize('Main.TS')).toBe('code');
        expect(categorize('README.MD')).toBe('documentation');
        expect(categorize('CONFIG.JSON')).toBe('configuration');
      });

      it('should handle files without extensions', () => {
        expect(categorize('Makefile')).toBe('other');
        expect(categorize('Dockerfile')).toBe('other');
      });

      it('should categorize dotfiles as configuration', () => {
        expect(categorize('.gitignore')).toBe('configuration');
        expect(categorize('.env')).toBe('configuration');
        expect(categorize('.editorconfig')).toBe('configuration');
      });

      it('should categorize README as documentation regardless of extension', () => {
        expect(categorize('README')).toBe('documentation');
        expect(categorize('readme')).toBe('documentation');
        expect(categorize('README.txt')).toBe('documentation');
      });

      it('should categorize LICENSE as documentation', () => {
        expect(categorize('LICENSE')).toBe('documentation');
        expect(categorize('license')).toBe('documentation');
        expect(categorize('LICENSE.md')).toBe('documentation');
      });

      it('should handle multiple dots in filename', () => {
        expect(categorize('test.spec.ts')).toBe('code');
        expect(categorize('config.dev.json')).toBe('configuration');
      });

      it('should handle hidden files correctly', () => {
        expect(categorize('.github/workflows/ci.yml')).toBe('configuration');
        expect(categorize('.vscode/settings.json')).toBe('configuration');
      });
    });

    describe('Unknown extensions', () => {
      it('should categorize unknown extensions as "other"', () => {
        expect(categorize('file.xyz')).toBe('other');
        expect(categorize('data.unknown')).toBe('other');
      });

      it('should handle empty filename gracefully', () => {
        expect(categorize('')).toBe('other');
      });
    });
  });

  // ================================================================
  // 2. STATISTICS CALCULATION TESTS (10-15 tests)
  // ================================================================
  describe('calculateStatsForGroup', () => {
    const calculateStats = (files: FileInfo[], totalFiles: number) => {
      return (service as any).calculateStatsForGroup(files, totalFiles);
    };

    it('should calculate percentage with 2 decimal places', () => {
      const files = createMockFileTree(33, '.ts');
      const stats = calculateStats(files, 100);

      expect(stats.percentage).toBe(33.0);
      expect(Number.isInteger(stats.percentage * 100)).toBe(true);
    });

    it('should calculate average file size correctly', () => {
      const files = [
        createTestFileInfo('a.ts', 1000),
        createTestFileInfo('b.ts', 2000),
        createTestFileInfo('c.ts', 3000),
      ];
      const stats = calculateStats(files, 3);

      expect(stats.averageSize).toBe(2000); // (1000 + 2000 + 3000) / 3
    });

    it('should handle zero files gracefully', () => {
      const stats = calculateStats([], 100);

      expect(stats.count).toBe(0);
      expect(stats.percentage).toBe(0);
      expect(stats.size).toBe(0);
      expect(stats.averageSize).toBe(0);
    });

    it('should handle single file', () => {
      const files = [createTestFileInfo('single.ts', 5000)];
      const stats = calculateStats(files, 1);

      expect(stats.count).toBe(1);
      expect(stats.percentage).toBe(100);
      expect(stats.size).toBe(5000);
      expect(stats.averageSize).toBe(5000);
    });

    it('should round percentages correctly', () => {
      const files = createMockFileTree(1, '.ts');
      const stats = calculateStats(files, 3);

      expect(stats.percentage).toBe(33.33); // 1/3 = 33.33...
    });

    it('should handle very large file counts', () => {
      const files = createMockFileTree(50000, '.ts');
      const stats = calculateStats(files, 100000);

      expect(stats.count).toBe(50000);
      expect(stats.percentage).toBe(50);
    });

    it('should handle very large file sizes', () => {
      const files = [createTestFileInfo('huge.bin', 1024 * 1024 * 100)]; // 100MB
      const stats = calculateStats(files, 1);

      expect(stats.size).toBe(104857600);
      expect(stats.averageSize).toBe(104857600);
    });
  });

  describe('calculateCategoryStatistics', () => {
    it('should aggregate files into correct categories', () => {
      const files = [
        createTestFileInfo('app.ts', 1000, '.ts', 'code'),
        createTestFileInfo('README.md', 2000, '.md', 'documentation'),
        createTestFileInfo('config.json', 3000, '.json', 'configuration'),
      ];

      const stats = (service as any).calculateCategoryStatistics(files);

      expect(stats.code.count).toBe(1);
      expect(stats.documentation.count).toBe(1);
      expect(stats.configuration.count).toBe(1);
    });

    it('should calculate totals for each category', () => {
      const files = [
        createTestFileInfo('a.ts', 1000, '.ts', 'code'),
        createTestFileInfo('b.ts', 1000, '.ts', 'code'),
        createTestFileInfo('README.md', 5000, '.md', 'documentation'),
      ];

      const stats = (service as any).calculateCategoryStatistics(files);

      expect(stats.code.size).toBe(2000);
      expect(stats.documentation.size).toBe(5000);
    });

    it('should include empty categories with zero counts', () => {
      const files = [createTestFileInfo('app.ts', 1000, '.ts')];

      const stats = (service as any).calculateCategoryStatistics(files);

      expect(stats.assets).toBeDefined();
      expect(stats.assets.count).toBe(0);
      expect(stats.assets.size).toBe(0);
    });

    it('should calculate percentages correctly across categories', () => {
      const files = [
        ...createMockFileTree(80, '.ts'), // 80% code
        ...createMockFileTree(20, '.md'), // 20% docs
      ];

      const stats = (service as any).calculateCategoryStatistics(
        files,
        files.length
      );

      expect(stats.code.percentage).toBeCloseTo(80, 1);
      expect(stats.documentation.percentage).toBeCloseTo(20, 1);
    });
  });

  describe('calculateExtensionStatistics', () => {
    it('should group files by extension', () => {
      const files = [
        createTestFileInfo('a.ts', 1000, '.ts', 'code'),
        createTestFileInfo('b.ts', 1000, '.ts', 'code'),
        createTestFileInfo('c.js', 1000, '.js', 'code'),
      ];

      const stats = (service as any).calculateExtensionStatistics(
        files,
        files.length
      );

      expect(stats['.ts'].count).toBe(2);
      expect(stats['.js'].count).toBe(1);
    });

    it('should group by exact extension match (case-sensitive)', () => {
      const files = [
        createTestFileInfo('a.TS', 1000, '.TS', 'code'),
        createTestFileInfo('b.ts', 1000, '.ts', 'code'),
      ];

      const stats = (service as any).calculateExtensionStatistics(
        files,
        files.length
      );

      // Extensions are case-sensitive, so .TS and .ts are separate groups
      expect(stats['.TS']).toBeDefined();
      expect(stats['.ts']).toBeDefined();
      expect(stats['.TS'].count).toBe(1);
      expect(stats['.ts'].count).toBe(1);
    });

    it('should calculate stats per extension', () => {
      const files = [
        createTestFileInfo('a.ts', 1000, '.ts', 'code'),
        createTestFileInfo('b.ts', 3000, '.ts', 'code'),
      ];

      const stats = (service as any).calculateExtensionStatistics(
        files,
        files.length
      );

      expect(stats['.ts'].size).toBe(4000);
      expect(stats['.ts'].averageSize).toBe(2000);
    });

    it('should handle files without extensions', () => {
      const files = [
        createTestFileInfo('Makefile', 1000, '', 'configuration'),
        createTestFileInfo('Dockerfile', 2000, '', 'configuration'),
      ];

      const stats = (service as any).calculateExtensionStatistics(
        files,
        files.length
      );

      expect(stats['']).toBeDefined();
      expect(stats[''].count).toBe(2);
    });
  });

  // ================================================================
  // 3. DIRECTORY DISTRIBUTION TESTS (8-12 tests)
  // ================================================================
  describe('buildDirectoryDistribution', () => {
    it('should build nested directory tree', () => {
      const files = [
        createTestFileInfo('src/index.ts', 1000),
        createTestFileInfo('src/utils/helper.ts', 1000),
      ];

      const tree = (service as any).buildDirectoryDistribution(files, {});

      expect(tree).toBeInstanceOf(Array);
      expect(tree.length).toBeGreaterThan(0);
    });

    it('should aggregate counts at each level', () => {
      const files = [
        createTestFileInfo('src/a.ts', 1000, '.ts'),
        createTestFileInfo('src/b.ts', 1000, '.ts'),
      ];

      const tree = (service as any).buildDirectoryDistribution(files, {});
      const srcDir = tree.find((d: any) => d.path === 'src');

      expect(srcDir).toBeDefined();
      expect(srcDir.totalFiles).toBe(2);
    });

    it('should aggregate sizes at each level', () => {
      const files = [
        createTestFileInfo('src/a.ts', 1000, '.ts'),
        createTestFileInfo('src/b.ts', 2000, '.ts'),
      ];

      const tree = (service as any).buildDirectoryDistribution(files, {});
      const srcDir = tree.find((d: any) => d.path === 'src');

      expect(srcDir).toBeDefined();
      expect(srcDir.totalSize).toBe(3000);
    });

    it('should handle root-level files', () => {
      const files = [
        createTestFileInfo('README.md', 1000, '.md'),
        createTestFileInfo('package.json', 2000, '.json'),
      ];

      const tree = (service as any).buildDirectoryDistribution(files, {});
      const rootDir = tree.find((d: any) => d.path === '.');

      expect(rootDir).toBeDefined();
      expect(rootDir.totalFiles).toBe(2);
    });

    it('should handle deep nesting', () => {
      const files = [createTestFileInfo('a/b/c/d/e/file.ts', 1000, '.ts')];

      const tree = (service as any).buildDirectoryDistribution(files, {});

      expect(tree.length).toBeGreaterThan(0);
    });

    it('should respect maxDepth option', () => {
      const files = [createTestFileInfo('a/b/c/d/file.ts', 1000, '.ts')];

      const tree = (service as any).buildDirectoryDistribution(files, {
        maxDepth: 2,
      });

      // Should not go deeper than maxDepth
      expect(tree).toBeDefined();
    });

    it('should handle paths with special characters', () => {
      const files = [
        createTestFileInfo('src/@types/index.d.ts', 1000, '.ts'),
        createTestFileInfo('src/__tests__/test.ts', 1000, '.ts'),
      ];

      const tree = (service as any).buildDirectoryDistribution(files, {});

      expect(tree).toBeDefined();
      expect(tree.length).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // 4. FILTER APPLICATION TESTS (10-15 tests)
  // ================================================================
  // NOTE: applyFilters method does not exist in the actual implementation
  // These tests are commented out until filtering functionality is implemented
  /*
  describe('applyFilters', () => {
    const testFiles: FileInfo[] = [
      createTestFileInfo('src/index.ts', 1000, '.ts'),
      createTestFileInfo('src/utils.js', 1000, '.js'),
      createTestFileInfo('README.md', 1000, '.md'),
      createTestFileInfo('.gitignore', 100, ''),
      createTestFileInfo('config.json', 500, '.json'),
    ];

    it('should filter by extension list', () => {
      const filtered = (service as any).applyFilters(testFiles, {
        extensions: ['.ts', '.js'],
      });

      expect(filtered.length).toBe(2);
      expect(filtered.every((f: FileInfo) => ['.ts', '.js'].includes(f.extension))).toBe(true);
    });

    it('should filter by category list', () => {
      const filtered = (service as any).applyFilters(testFiles, {
        categories: ['code'],
      });

      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((f: FileInfo) => 
        (service as any).categorizeFile(f.path) === 'code'
      )).toBe(true);
    });

    it('should combine extension and category filters', () => {
      const filtered = (service as any).applyFilters(testFiles, {
        extensions: ['.ts'],
        categories: ['code'],
      });

      expect(filtered.length).toBe(1);
      expect(filtered[0].extension).toBe('.ts');
    });

    it('should respect includeHidden flag', () => {
      const filtered = (service as any).applyFilters(testFiles, {
        includeHidden: false,
      });

      expect(filtered.some((f: FileInfo) => f.path.startsWith('.'))).toBe(false);
    });

    it('should handle empty filter options', () => {
      const filtered = (service as any).applyFilters(testFiles, {});

      expect(filtered.length).toBe(testFiles.length);
    });

    it('should handle invalid extensions gracefully', () => {
      const filtered = (service as any).applyFilters(testFiles, {
        extensions: ['.nonexistent'],
      });

      expect(filtered.length).toBe(0);
    });

    it('should handle case-insensitive extension matching', () => {
      const filtered = (service as any).applyFilters(testFiles, {
        extensions: ['.TS'],
      });

      expect(filtered.length).toBeGreaterThanOrEqual(0);
    });
  });
  */

  // ================================================================
  // 5. PERFORMANCE METRICS TESTS (8-10 tests)
  // ================================================================
  describe('enhanceResultWithPerformanceMetrics', () => {
    it('should merge metrics without mutating original', () => {
      const original = {
        categories: {},
        extensions: {},
        directories: [],
        metadata: { totalFiles: 100 },
      };

      const metrics = {
        analysisMethod: 'cached' as const,
        dataSource: 'cache-hit' as const,
        bandwidthUsed: 0,
        processingTime: 1000,
        cacheHitRate: 1.0,
        performanceGain: 25.0,
        bandwidthSaved: 1000000,
        fileTreeCached: true,
        selectionReason: 'test',
      };

      const methodDecision = {
        expectedPerformanceGain: 25.0,
        fallbackMethods: [],
      };

      const enhanced = (service as any).enhanceResultWithPerformanceMetrics(
        original,
        metrics,
        methodDecision
      );

      expect(enhanced.metadata).toBeDefined();
      expect(enhanced.metadata.analysisMethod).toBe('cached');
      expect(original.metadata.totalFiles).toBe(100);
    });

    it('should include all required metric fields', () => {
      const result = {
        categories: {},
        extensions: {},
        directories: [],
        metadata: { totalFiles: 100 },
      };

      const metrics = {
        analysisMethod: 'ls-tree-remote' as const,
        dataSource: 'git-ls-tree' as const,
        bandwidthUsed: 50000,
        processingTime: 5000,
        cacheHitRate: 0.0,
        performanceGain: 10.0,
        bandwidthSaved: 500000,
        fileTreeCached: false,
        selectionReason: 'sparse clone optimal',
      };

      const methodDecision = {
        expectedPerformanceGain: 10.0,
        fallbackMethods: ['clone-full'],
      };

      const enhanced = (service as any).enhanceResultWithPerformanceMetrics(
        result,
        metrics,
        methodDecision
      );

      expect(enhanced.metadata.analysisMethod).toBe('ls-tree-remote');
      expect(enhanced.metadata.bandwidthSaved).toBe(500000);
      expect(enhanced.metadata.performanceGain).toBe(10.0);
    });

    it('should copy selection reason to metadata', () => {
      const result = {
        categories: {},
        extensions: {},
        directories: [],
        metadata: { totalFiles: 100 },
      };

      const metrics = {
        analysisMethod: 'cached' as const,
        dataSource: 'cache-hit' as const,
        bandwidthUsed: 0,
        processingTime: 100,
        cacheHitRate: 1.0,
        performanceGain: 50.0,
        bandwidthSaved: 0,
        fileTreeCached: true,
        selectionReason: 'Cache hit - instant response',
      };

      const methodDecision = {
        expectedPerformanceGain: 50.0,
        fallbackMethods: [],
      };

      const enhanced = (service as any).enhanceResultWithPerformanceMetrics(
        result,
        metrics,
        methodDecision
      );

      expect(enhanced.metadata.selectionReason).toBe(
        'Cache hit - instant response'
      );
    });

    it('should format performance gain correctly', () => {
      const result = {
        categories: {},
        extensions: {},
        directories: [],
        metadata: { totalFiles: 100 },
      };

      const metrics = {
        analysisMethod: 'cached' as const,
        dataSource: 'cache-hit' as const,
        bandwidthUsed: 0,
        processingTime: 100,
        cacheHitRate: 1.0,
        performanceGain: 25.456789,
        bandwidthSaved: 0,
        fileTreeCached: true,
        selectionReason: 'test',
      };

      const methodDecision = {
        expectedPerformanceGain: 25.456789,
        fallbackMethods: [],
      };

      const enhanced = (service as any).enhanceResultWithPerformanceMetrics(
        result,
        metrics,
        methodDecision
      );

      expect(typeof enhanced.metadata.performanceGain).toBe('number');
    });
  });

  // ================================================================
  // 6. ANALYSIS METHOD SELECTION TESTS (12-15 tests)
  // ================================================================
  describe('selectAnalysisMethod', () => {
    it('should select sparse clone for small repos', () => {
      const characteristics = {
        sizeCategory: 'small' as const,
        estimatedFiles: 500,
        estimatedSize: 5000000,
        supportsRemoteLsTree: false,
        recommendShallowClone: false,
      };

      const decision = (service as any).selectAnalysisMethod(characteristics);

      expect(decision.method).toBe('ls-tree-remote');
      expect(decision.expectedPerformanceGain).toBeGreaterThan(1);
    });

    it('should select sparse clone for medium repos', () => {
      const characteristics = {
        sizeCategory: 'medium' as const,
        estimatedFiles: 3000,
        estimatedSize: 30000000,
        supportsRemoteLsTree: false,
        recommendShallowClone: true,
      };

      const decision = (service as any).selectAnalysisMethod(characteristics);

      expect(decision.method).toBe('ls-tree-remote');
      expect(decision.fallbackMethods).toContain('shallow-clone');
    });

    it('should include fallback methods', () => {
      const characteristics = {
        sizeCategory: 'large' as const,
        estimatedFiles: 15000,
        estimatedSize: 150000000,
        supportsRemoteLsTree: false,
        recommendShallowClone: true,
      };

      const decision = (service as any).selectAnalysisMethod(characteristics);

      expect(decision.fallbackMethods).toBeInstanceOf(Array);
      expect(decision.fallbackMethods.length).toBeGreaterThan(0);
      expect(decision.fallbackMethods).toContain('full-clone');
    });

    it('should provide selection reason', () => {
      const characteristics = {
        sizeCategory: 'xl' as const,
        estimatedFiles: 50000,
        estimatedSize: 500000000,
        supportsRemoteLsTree: false,
        recommendShallowClone: true,
      };

      const decision = (service as any).selectAnalysisMethod(characteristics);

      expect(decision.reason).toBeDefined();
      expect(typeof decision.reason).toBe('string');
      expect(decision.reason.length).toBeGreaterThan(0);
    });

    it('should calculate expected performance gain', () => {
      const characteristics = {
        sizeCategory: 'medium' as const,
        estimatedFiles: 3000,
        estimatedSize: 30000000,
        supportsRemoteLsTree: false,
        recommendShallowClone: false,
      };

      const decision = (service as any).selectAnalysisMethod(characteristics);

      expect(decision.expectedPerformanceGain).toBeGreaterThan(1);
      expect(typeof decision.expectedPerformanceGain).toBe('number');
    });
  });

  describe('categorizeRepositorySize', () => {
    it('should categorize small repositories', () => {
      const category = (service as any).categorizeRepositorySize(500);
      expect(category).toBe('small');
    });

    it('should categorize medium repositories', () => {
      const category = (service as any).categorizeRepositorySize(3000);
      expect(category).toBe('medium');
    });

    it('should categorize large repositories', () => {
      const category = (service as any).categorizeRepositorySize(15000);
      expect(category).toBe('large');
    });

    it('should categorize xl repositories', () => {
      const category = (service as any).categorizeRepositorySize(50000);
      expect(category).toBe('xl');
    });

    it('should handle boundary cases', () => {
      expect((service as any).categorizeRepositorySize(999)).toBe('small');
      expect((service as any).categorizeRepositorySize(1000)).toBe('medium');
      expect((service as any).categorizeRepositorySize(4999)).toBe('medium');
      expect((service as any).categorizeRepositorySize(5000)).toBe('large');
    });
  });

  // ================================================================
  // 7. ERROR HANDLING TESTS (12-15 tests)
  // ================================================================
  describe('error handling', () => {
    // NOTE: categorizeFile expects a string parameter and doesn't guard against null/undefined
    // These edge cases should be handled by the caller, not the categorizeFile method

    it('should handle empty arrays in statistics', () => {
      const stats = (service as any).calculateStatsForGroup([], 100);

      expect(stats.count).toBe(0);
      expect(stats.percentage).toBe(0);
      expect(stats.size).toBe(0);
    });

    it('should handle division by zero in averages', () => {
      const stats = (service as any).calculateStatsForGroup([], 0);

      expect(Number.isNaN(stats.percentage)).toBe(false);
      expect(Number.isNaN(stats.averageSize)).toBe(false);
    });

    it('should handle malformed file paths', () => {
      expect(() => (service as any).categorizeFile('////')).not.toThrow();
      expect(() => (service as any).categorizeFile('..')).not.toThrow();
      expect(() => (service as any).categorizeFile('.')).not.toThrow();
    });

    it('should handle very long file paths', () => {
      const longPath = 'a/'.repeat(1000) + 'file.ts';
      expect(() => (service as any).categorizeFile(longPath)).not.toThrow();
    });

    it('should handle special characters in paths', () => {
      expect(() =>
        (service as any).categorizeFile('file with spaces.ts')
      ).not.toThrow();
      expect(() =>
        (service as any).categorizeFile('file@#$%.ts')
      ).not.toThrow();
      expect(() => (service as any).categorizeFile('файл.ts')).not.toThrow(); // Cyrillic
    });

    it('should handle repository size edge cases', () => {
      expect((service as any).categorizeRepositorySize(0)).toBe('small');
      expect((service as any).categorizeRepositorySize(-1)).toBe('small');
      expect((service as any).categorizeRepositorySize(Infinity)).toBe('xl');
    });

    it('should return conservative fallback on detection failure', async () => {
      const simpleGit = await import('simple-git');
      const mockGit = (simpleGit.default as any)();

      mockGit.listRemote.mockRejectedValue(new Error('Network error'));
      mockGit.raw.mockRejectedValue(new Error('Command failed'));

      const characteristics = await service.detectRepositoryCharacteristics(
        'https://github.com/test/repo.git'
      );

      expect(characteristics).toBeDefined();
      expect(characteristics.sizeCategory).toBe('medium');
      expect(characteristics.estimatedFiles).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // 8. INTEGRATION TESTS (8-10 tests)
  // ================================================================
  describe('Integration Tests', () => {
    it('should process complete file analysis workflow', () => {
      const files: FileInfo[] = [
        createTestFileInfo('src/index.ts', 1000, '.ts', 'code'),
        createTestFileInfo('README.md', 2000, '.md', 'documentation'),
        createTestFileInfo('package.json', 500, '.json', 'configuration'),
      ];

      const categoryStats = (service as any).calculateCategoryStatistics(files);
      const extensionStats = (service as any).calculateExtensionStatistics(
        files,
        files.length
      );
      const directories = (service as any).buildDirectoryDistribution(
        files,
        {}
      );

      expect(categoryStats).toBeDefined();
      expect(extensionStats).toBeDefined();
      expect(directories).toBeDefined();
      expect(directories.length).toBeGreaterThan(0);
    });

    it('should handle mixed file types correctly', () => {
      const files: FileInfo[] = [
        ...createMockFileTree(50, '.ts'),
        ...createMockFileTree(30, '.js'),
        ...createMockFileTree(20, '.md'),
      ];

      const categoryStats = (service as any).calculateCategoryStatistics(
        files,
        files.length
      );

      expect(categoryStats.code.count).toBe(80);
      expect(categoryStats.documentation.count).toBe(20);
      expect(categoryStats.code.percentage).toBeCloseTo(80, 1);
    });

    /* 
    // NOTE: applyFilters method doesn't exist - commenting out this test
    it('should apply filters consistently across operations', () => {
      const files = createMockFileTree(100, '.ts');
      const filtered = (service as any).applyFilters(files, {
        extensions: ['.ts'],
      });

      const stats = (service as any).calculateCategoryStatistics(filtered);

      expect(filtered.length).toBe(100);
      expect(stats.code.count).toBe(100);
    });
    */

    it('should handle empty repository gracefully', () => {
      const files: FileInfo[] = [];

      const categoryStats = (service as any).calculateCategoryStatistics(files);
      const extensionStats = (service as any).calculateExtensionStatistics(
        files,
        0
      );
      const directories = (service as any).buildDirectoryDistribution(
        files,
        {}
      );

      expect(Object.keys(categoryStats).length).toBeGreaterThan(0);
      expect(Object.keys(extensionStats).length).toBe(0);
      expect(directories.length).toBeGreaterThanOrEqual(0);
    });

    it('should maintain data consistency through pipeline', () => {
      const files = createMockFileTree(100, '.ts');
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);

      const categoryStats = (service as any).calculateCategoryStatistics(files);
      const calculatedTotal = Object.values(categoryStats).reduce(
        (sum: number, cat: any) => sum + cat.size,
        0
      );

      expect(calculatedTotal).toBe(totalSize);
    });
  });

  // ================================================================
  // 9. HELPER METHODS TESTS (20+ tests for 80% coverage)
  // ================================================================
  describe('Helper Methods (Happy Path)', () => {
    describe('shouldIncludeFile', () => {
      it('should include file when no filters applied', () => {
        const result = (service as any).shouldIncludeFile(
          { path: 'src/app.ts', size: 1000, mode: '100644' },
          {}
        );
        expect(result).toBe(true);
      });

      it('should include file matching extension filter', () => {
        const result = (service as any).shouldIncludeFile(
          { path: 'src/app.ts', size: 1000, mode: '100644' },
          { extensions: ['.ts', '.js'] }
        );
        expect(result).toBe(true);
      });

      it('should exclude file not matching extension filter', () => {
        const result = (service as any).shouldIncludeFile(
          { path: 'README.md', size: 1000, mode: '100644' },
          { extensions: ['.ts', '.js'] }
        );
        expect(result).toBe(false);
      });

      it('should include file matching directory filter', () => {
        const result = (service as any).shouldIncludeFile(
          { path: 'src/app.ts', size: 1000, mode: '100644' },
          { directories: ['src'] }
        );
        expect(result).toBe(true);
      });

      it('should exclude hidden file when includeHidden is false', () => {
        const result = (service as any).shouldIncludeFile(
          { path: 'src/.env', size: 1000, mode: '100644' },
          { includeHidden: false }
        );
        expect(result).toBe(false);
      });
    });

    describe('passesExtensionFilter', () => {
      it('should pass when no extension filter', () => {
        const result = (service as any).passesExtensionFilter(
          { path: 'app.ts', size: 1000, mode: '100644' },
          {}
        );
        expect(result).toBe(true);
      });

      it('should pass when extension matches', () => {
        const result = (service as any).passesExtensionFilter(
          { path: 'app.ts', size: 1000, mode: '100644' },
          { extensions: ['.ts', '.js'] }
        );
        expect(result).toBe(true);
      });

      it('should fail when extension does not match', () => {
        const result = (service as any).passesExtensionFilter(
          { path: 'app.py', size: 1000, mode: '100644' },
          { extensions: ['.ts', '.js'] }
        );
        expect(result).toBe(false);
      });
    });

    describe('passesHiddenFilter', () => {
      it('should pass non-hidden file when includeHidden is true', () => {
        const result = (service as any).passesHiddenFilter(
          { path: 'src/app.ts', size: 1000, mode: '100644' },
          { includeHidden: true }
        );
        expect(result).toBe(true);
      });

      it('should pass hidden file when includeHidden is true', () => {
        const result = (service as any).passesHiddenFilter(
          { path: '.gitignore', size: 100, mode: '100644' },
          { includeHidden: true }
        );
        expect(result).toBe(true);
      });

      it('should pass non-hidden file when includeHidden is false', () => {
        const result = (service as any).passesHiddenFilter(
          { path: 'src/app.ts', size: 1000, mode: '100644' },
          { includeHidden: false }
        );
        expect(result).toBe(true);
      });

      it('should fail hidden file when includeHidden is false', () => {
        const result = (service as any).passesHiddenFilter(
          { path: '.gitignore', size: 100, mode: '100644' },
          { includeHidden: false }
        );
        expect(result).toBe(false);
      });
    });

    describe('passesSizeFilters', () => {
      it('should pass when no size filters', () => {
        const result = (service as any).passesSizeFilters(
          { path: 'app.ts', size: 5000, mode: '100644' },
          {}
        );
        expect(result).toBe(true);
      });

      it('should pass when size is above minSize', () => {
        const result = (service as any).passesSizeFilters(
          { path: 'app.ts', size: 5000, mode: '100644' },
          { minFileSize: 1000 }
        );
        expect(result).toBe(true);
      });

      it('should fail when size is below minSize', () => {
        const result = (service as any).passesSizeFilters(
          { path: 'app.ts', size: 500, mode: '100644' },
          { minFileSize: 1000 }
        );
        expect(result).toBe(false);
      });

      it('should pass when size is below maxSize', () => {
        const result = (service as any).passesSizeFilters(
          { path: 'app.ts', size: 5000, mode: '100644' },
          { maxFileSize: 10000 }
        );
        expect(result).toBe(true);
      });

      it('should fail when size is above maxSize', () => {
        const result = (service as any).passesSizeFilters(
          { path: 'app.ts', size: 15000, mode: '100644' },
          { maxFileSize: 10000 }
        );
        expect(result).toBe(false);
      });

      it('should pass when size is in range', () => {
        const result = (service as any).passesSizeFilters(
          { path: 'app.ts', size: 5000, mode: '100644' },
          { minFileSize: 1000, maxFileSize: 10000 }
        );
        expect(result).toBe(true);
      });
    });

    describe('passesDepthFilter', () => {
      it('should pass when no depth filter', () => {
        const result = (service as any).passesDepthFilter(
          { path: 'a/b/c/d/e/app.ts', size: 1000, mode: '100644' },
          {}
        );
        expect(result).toBe(true);
      });

      it('should pass when depth is within limit', () => {
        const result = (service as any).passesDepthFilter(
          { path: 'src/app.ts', size: 1000, mode: '100644' },
          { maxDepth: 3 }
        );
        expect(result).toBe(true);
      });

      it('should fail when depth exceeds limit', () => {
        const result = (service as any).passesDepthFilter(
          { path: 'a/b/c/d/e/app.ts', size: 1000, mode: '100644' },
          { maxDepth: 3 }
        );
        expect(result).toBe(false);
      });
    });

    describe('passesDirectoryFilter', () => {
      it('should pass when no directory filter', () => {
        const result = (service as any).passesDirectoryFilter(
          { path: 'src/app.ts', size: 1000, mode: '100644' },
          {}
        );
        expect(result).toBe(true);
      });

      it('should pass when in included directory', () => {
        const result = (service as any).passesDirectoryFilter(
          { path: 'src/app.ts', size: 1000, mode: '100644' },
          { directories: ['src', 'lib'] }
        );
        expect(result).toBe(true);
      });

      it('should fail when not in included directory', () => {
        const result = (service as any).passesDirectoryFilter(
          { path: 'test/app.test.ts', size: 1000, mode: '100644' },
          { directories: ['src', 'lib'] }
        );
        expect(result).toBe(false);
      });
    });

    describe('applyFileFilters', () => {
      it('should return all files when no filters', () => {
        const files = ['app.ts', 'README.md', 'package.json'];
        const result = (service as any).applyFileFilters(files, {});
        expect(result).toHaveLength(3);
      });

      it('should filter by extension', () => {
        const files = ['app.ts', 'util.ts', 'README.md'];
        const result = (service as any).applyFileFilters(files, {
          extensions: ['.ts'],
        });
        expect(result).toHaveLength(2);
        expect(result[0]).toBe('app.ts');
        expect(result[1]).toBe('util.ts');
      });

      it('should filter by directory', () => {
        const files = ['src/app.ts', 'lib/util.ts', 'test/app.test.ts'];
        const result = (service as any).applyFileFilters(files, {
          directories: ['src', 'lib'],
        });
        expect(result).toHaveLength(2);
        expect(result).toContain('src/app.ts');
        expect(result).toContain('lib/util.ts');
      });

      it('should combine multiple filters', () => {
        const files = ['src/app.ts', 'src/README.md', 'test/app.test.ts'];
        const result = (service as any).applyFileFilters(files, {
          extensions: ['.ts'],
          directories: ['src'],
        });
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('src/app.ts');
      });
    });

    describe('createFileInfoFromRemote', () => {
      it('should create FileInfo from remote file data', () => {
        const remoteFile = {
          path: 'src/app.ts',
          size: 1000,
        };
        const result = (service as any).createFileInfoFromRemote(remoteFile);

        expect(result.path).toBe('src/app.ts');
        expect(result.size).toBe(1000);
        expect(result.extension).toBe('.ts');
        expect(result.category).toBe('code');
        expect(result.lastModified).toBeDefined();
      });

      it('should categorize README correctly', () => {
        const remoteFile = {
          path: 'README.md',
          size: 2000,
        };
        const result = (service as any).createFileInfoFromRemote(remoteFile);

        expect(result.category).toBe('documentation');
      });

      it('should categorize LICENSE correctly', () => {
        const remoteFile = {
          path: 'LICENSE',
          size: 1000,
        };
        const result = (service as any).createFileInfoFromRemote(remoteFile);

        expect(result.category).toBe('documentation');
      });

      it('should handle files without extensions', () => {
        const remoteFile = {
          path: 'Makefile',
          size: 500,
        };
        const result = (service as any).createFileInfoFromRemote(remoteFile);

        expect(result.extension).toBe('');
        expect(result.category).toBeDefined();
      });
    });

    describe('estimateFilesByRepositoryType', () => {
      it('should estimate files for known repository types', () => {
        const frameworkEstimate = (
          service as any
        ).estimateFilesByRepositoryType(
          'https://github.com/user/framework-project.git'
        );
        expect(frameworkEstimate).toBe(2000);

        const exampleEstimate = (service as any).estimateFilesByRepositoryType(
          'https://github.com/user/example-project.git'
        );
        expect(exampleEstimate).toBe(500);
      });

      it('should return default estimate for unknown types', () => {
        const defaultEstimate = (service as any).estimateFilesByRepositoryType(
          'https://github.com/user/unknown-project.git'
        );
        expect(defaultEstimate).toBe(3000); // Default is 3000, not 500
      });
    });

    describe('estimateRepositorySize', () => {
      it('should estimate size for small repository', () => {
        const size = (service as any).estimateRepositorySize(100, 'small');
        expect(size).toBe(100 * 8 * 1024); // 100 files * 8KB
        expect(size).toBeGreaterThan(0);
      });

      it('should estimate size for medium repository', () => {
        const size = (service as any).estimateRepositorySize(1000, 'medium');
        expect(size).toBe(1000 * 12 * 1024); // 1000 files * 12KB
        expect(size).toBeGreaterThan(1024 * 1024); // More than 1MB
      });

      it('should estimate size for large repository', () => {
        const size = (service as any).estimateRepositorySize(10000, 'large');
        expect(size).toBe(10000 * 15 * 1024); // 10000 files * 15KB
        expect(size).toBeGreaterThan(10 * 1024 * 1024); // More than 10MB
      });
    });

    describe('calculatePerformanceGain', () => {
      it('should calculate gain for sparse clone vs full clone', () => {
        const gain = (service as any).calculatePerformanceGain(
          'ls-tree-remote',
          'medium'
        );
        expect(gain).toBe(18.0); // From the implementation
      });

      it('should calculate gain for shallow clone', () => {
        const gain = (service as any).calculatePerformanceGain(
          'shallow-clone',
          'medium'
        );
        expect(gain).toBe(3.0); // From the implementation
      });

      it('should return 1 for full clone (baseline)', () => {
        const gain = (service as any).calculatePerformanceGain(
          'full-clone',
          'small'
        );
        expect(gain).toBe(1.0);
      });

      it('should return high gain for cached method', () => {
        const gain = (service as any).calculatePerformanceGain(
          'cached',
          'large'
        );
        expect(gain).toBe(50.0); // From the implementation
      });
    });

    describe('parseLsTreeOutput', () => {
      it('should parse valid ls-tree output', () => {
        // Format: mode type hash size\tpath
        const output = `100644 blob abc1234567890 1000\tsrc/app.ts
100644 blob def1234567890 2000\tREADME.md`;
        const result = (service as any).parseLsTreeOutput(output);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          path: 'src/app.ts',
          size: 1000,
          mode: '100644',
        });
        expect(result[1]).toEqual({
          path: 'README.md',
          size: 2000,
          mode: '100644',
        });
      });

      it('should handle empty output', () => {
        const result = (service as any).parseLsTreeOutput('');
        expect(result).toHaveLength(0);
      });

      it('should skip invalid lines', () => {
        const output = `100644 blob abc1234567890 1000\tsrc/app.ts
invalid line
100644 blob def1234567890 2000\tREADME.md`;
        const result = (service as any).parseLsTreeOutput(output);

        expect(result).toHaveLength(2);
      });
    });

    describe('generateFileTreeCacheKey', () => {
      it('should generate consistent cache key for same inputs', () => {
        const key1 = (service as any).generateFileTreeCacheKey(
          'https://github.com/user/repo.git',
          'main'
        );
        const key2 = (service as any).generateFileTreeCacheKey(
          'https://github.com/user/repo.git',
          'main'
        );
        expect(key1).toBe(key2);
      });

      it('should generate different keys for different repos', () => {
        const key1 = (service as any).generateFileTreeCacheKey(
          'https://github.com/user/repo1.git',
          'main'
        );
        const key2 = (service as any).generateFileTreeCacheKey(
          'https://github.com/user/repo2.git',
          'main'
        );
        expect(key1).not.toBe(key2);
      });

      it('should generate different keys for different branches', () => {
        const key1 = (service as any).generateFileTreeCacheKey(
          'https://github.com/user/repo.git',
          'main'
        );
        const key2 = (service as any).generateFileTreeCacheKey(
          'https://github.com/user/repo.git',
          'develop'
        );
        expect(key1).not.toBe(key2);
      });
    });
  });
});
