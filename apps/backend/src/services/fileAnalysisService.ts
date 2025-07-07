/**
 * File Analysis Service - Repository File Type Distribution Analysis
 *
 * Provides comprehensive file type distribution analysis for Git repositories
 * with intelligent memory management and three-tier caching integration.
 *
 * @fileoverview This service implements sophisticated file system analysis:
 * - File categorization (code, documentation, configuration, assets)
 * - Extension-based distribution analysis
 * - Directory-level breakdown       const categories: Record<FileCategory, FileTypeStats> = {
        code: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        documentation: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        configuration: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        assets: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        other: { count: 0, percentage: 0, size: 0, averageSize: 0 },
      };
      
      for (const [category, categoryFiles] of Object.entries(categoryGroups)) {
        categories[category as FileCategory] = this.calculateStatsForGroup(categoryFiles, totalFiles);
      } recursive traversal
 * - Size-based statistics and optimization
 * - Integration with GitRay's existing caching architecture
 *
 * Key features:
 * - Memory-aware processing for large repositories
 * - Streaming support for repositories with >10k files
 * - Integration with existing three-tier caching system
 * - Leverages GitRay's withTempRepository coordination
 * - Comprehensive metrics and health monitoring
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { getLogger } from './logger';
import { config } from '../config';
import {
  recordStreamingStart,
  recordStreamingCompletion,
  recordStreamingBatch,
  recordDetailedError,
  updateServiceHealthScore,
  getRepositorySizeCategory,
} from './metrics';
import { getMemoryStats } from '../utils/memoryPressureManager';
import {
  FileTypeDistribution,
  FileAnalysisFilterOptions,
  FileInfo,
  FileCategory,
  FileTypeStats,
  DirectoryDistribution,
  RepositoryError,
  ERROR_MESSAGES,
} from '@gitray/shared-types';
import simpleGit, { SimpleGit } from 'simple-git';

const logger = getLogger();

/**
 * File category mapping based on extensions
 */
const FILE_CATEGORY_MAP: Record<string, FileCategory> = {
  // Code files
  '.js': 'code',
  '.ts': 'code',
  '.jsx': 'code',
  '.tsx': 'code',
  '.py': 'code',
  '.java': 'code',
  '.c': 'code',
  '.cpp': 'code',
  '.cs': 'code',
  '.go': 'code',
  '.rs': 'code',
  '.php': 'code',
  '.rb': 'code',
  '.swift': 'code',
  '.kt': 'code',
  '.scala': 'code',
  '.clj': 'code',
  '.hs': 'code',
  '.ml': 'code',
  '.r': 'code',
  '.m': 'code',
  '.vue': 'code',
  '.svelte': 'code',
  '.dart': 'code',
  '.elm': 'code',

  // Documentation files
  '.md': 'documentation',
  '.txt': 'documentation',
  '.rst': 'documentation',
  '.adoc': 'documentation',
  '.tex': 'documentation',
  '.pdf': 'documentation',
  '.doc': 'documentation',
  '.docx': 'documentation',
  '.rtf': 'documentation',

  // Configuration files
  '.json': 'configuration',
  '.yaml': 'configuration',
  '.yml': 'configuration',
  '.toml': 'configuration',
  '.ini': 'configuration',
  '.xml': 'configuration',
  '.conf': 'configuration',
  '.config': 'configuration',
  '.env': 'configuration',
  '.gitignore': 'configuration',
  '.dockerignore': 'configuration',
  '.editorconfig': 'configuration',

  // Assets
  '.png': 'assets',
  '.jpg': 'assets',
  '.jpeg': 'assets',
  '.gif': 'assets',
  '.svg': 'assets',
  '.webp': 'assets',
  '.ico': 'assets',
  '.bmp': 'assets',
  '.tiff': 'assets',
  '.mp4': 'assets',
  '.webm': 'assets',
  '.avi': 'assets',
  '.mov': 'assets',
  '.mp3': 'assets',
  '.wav': 'assets',
  '.flac': 'assets',
  '.ogg': 'assets',
  '.woff': 'assets',
  '.woff2': 'assets',
  '.ttf': 'assets',
  '.eot': 'assets',
  '.css': 'assets',
  '.scss': 'assets',
  '.sass': 'assets',
  '.less': 'assets',
};

/**
 * Streaming options for large repository analysis
 */
export interface FileAnalysisStreamingOptions {
  batchSize: number;
  maxFiles?: number;
  startFromPath?: string;
  resumeState?: FileAnalysisResumeState;
}

/**
 * Resume state for interrupted file analysis
 */
export interface FileAnalysisResumeState {
  lastProcessedPath?: string;
  processedCount: number;
  totalEstimatedCount: number;
  startTime: number;
  partialResults: Partial<FileTypeDistribution>;
}

/**
 * Streaming metrics for file analysis
 */
export interface FileAnalysisMetrics {
  totalFiles: number;
  processedFiles: number;
  batchesProcessed: number;
  averageBatchTime: number;
  memoryUsageMB: number;
  cacheHitRate: number;
  startTime: number;
  lastBatchTime?: number;
  largestFile: { path: string; size: number };
}

/**
 * File Analysis Service Class
 */
class FileAnalysisService {
  private readonly defaultStreamingOptions: FileAnalysisStreamingOptions = {
    batchSize: config.streaming?.batchSize ?? 1000,
    maxFiles: config.streaming?.maxFiles ?? 100000,
  };

  constructor() {
    logger.info('FileAnalysisService initialized with streaming support', {
      defaultBatchSize: this.defaultStreamingOptions.batchSize,
      maxFiles: this.defaultStreamingOptions.maxFiles,
      streamingEnabled: config.streaming?.enabled ?? true,
    });
  }

  /**
   * Determine file category based on extension
   */
  private categorizeFile(filePath: string): FileCategory {
    const ext = path.extname(filePath).toLowerCase();

    // Handle special cases
    if (path.basename(filePath).startsWith('.')) {
      return 'configuration';
    }

    if (filePath.toLowerCase().includes('readme')) {
      return 'documentation';
    }

    if (filePath.toLowerCase().includes('license')) {
      return 'documentation';
    }

    return FILE_CATEGORY_MAP[ext] || 'other';
  }

  /**
   * Get file statistics from filesystem
   */
  private async getFileStats(
    filePath: string
  ): Promise<{ size: number; lastModified: string }> {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
      };
    } catch (error) {
      logger.warn(`Failed to get stats for file: ${filePath}`, { error });
      return {
        size: 0,
        lastModified: new Date().toISOString(),
      };
    }
  }

  /**
   * Check if file analysis should use streaming mode
   */
  private async shouldUseStreaming(localRepoPath: string): Promise<boolean> {
    if (!config.streaming?.enabled) {
      logger.debug('Streaming disabled by configuration');
      return false;
    }

    try {
      // Check memory pressure first
      const memoryStats = getMemoryStats();
      if (memoryStats.pressure.level !== 'normal') {
        logger.info('Forcing streaming due to memory pressure', {
          pressureLevel: memoryStats.pressure.level,
          systemMemoryUsage: `${(memoryStats.system.usagePercentage * 100).toFixed(1)}%`,
        });
        return true;
      }

      // Estimate file count using git ls-tree
      const git: SimpleGit = simpleGit(localRepoPath);
      const lsTreeOutput = await git.raw([
        'ls-tree',
        '-r',
        '--name-only',
        'HEAD',
      ]);
      const fileCount = lsTreeOutput
        .split('\n')
        .filter((line) => line.trim()).length;

      const fileThreshold = config.streaming?.fileThreshold ?? 10000;
      const useStreaming = fileCount > fileThreshold;

      logger.info(
        `Repository file analysis decision: ${fileCount} files, streaming: ${useStreaming}`,
        {
          fileCount,
          threshold: fileThreshold,
          useStreaming,
          memoryPressure: memoryStats.pressure.level,
        }
      );

      return useStreaming;
    } catch (error) {
      logger.warn(
        'Failed to determine if streaming should be used for file analysis, defaulting to false',
        { error, localRepoPath }
      );
      return false;
    }
  }

  /**
   * Get all files in repository using git ls-tree
   */
  private async getRepositoryFiles(
    localRepoPath: string,
    options?: FileAnalysisFilterOptions
  ): Promise<string[]> {
    const git: SimpleGit = simpleGit(localRepoPath);

    try {
      const lsTreeOutput = await git.raw([
        'ls-tree',
        '-r',
        '--name-only',
        'HEAD',
      ]);
      let files = lsTreeOutput.split('\n').filter((line) => line.trim());

      // Apply filters
      if (options) {
        files = this.applyFileFilters(files, options);
      }

      return files;
    } catch (error) {
      logger.error('Failed to get repository files', { error, localRepoPath });
      throw new RepositoryError(
        `${ERROR_MESSAGES.REPO_GET_COMMITS_FAILED}: Failed to list repository files - ${error instanceof Error ? error.message : String(error)}`,
        localRepoPath
      );
    }
  }

  /**
   * Apply filters to file list
   */
  private applyFileFilters(
    files: string[],
    options: FileAnalysisFilterOptions
  ): string[] {
    let filteredFiles = files;

    // Filter by extensions
    if (options.extensions && options.extensions.length > 0) {
      filteredFiles = filteredFiles.filter((file) =>
        options.extensions!.some((ext) =>
          file.toLowerCase().endsWith(ext.toLowerCase())
        )
      );
    }

    // Filter by categories
    if (options.categories && options.categories.length > 0) {
      filteredFiles = filteredFiles.filter((file) =>
        options.categories!.includes(this.categorizeFile(file))
      );
    }

    // Filter by directories
    if (options.directories && options.directories.length > 0) {
      filteredFiles = filteredFiles.filter((file) =>
        options.directories!.some((dir) => file.startsWith(dir))
      );
    }

    // Filter by hidden files
    if (options.includeHidden === false) {
      filteredFiles = filteredFiles.filter(
        (file) => !file.split('/').some((part) => part.startsWith('.'))
      );
    }

    // Filter by depth
    if (options.maxDepth !== undefined) {
      filteredFiles = filteredFiles.filter(
        (file) => file.split('/').length <= options.maxDepth! + 1
      );
    }

    return filteredFiles;
  }

  /**
   * Process files in batches for streaming mode
   */
  private async processFilesBatch(
    localRepoPath: string,
    files: string[],
    batchStart: number,
    batchSize: number
  ): Promise<FileInfo[]> {
    const batchEnd = Math.min(batchStart + batchSize, files.length);
    const batchFiles = files.slice(batchStart, batchEnd);
    const results: FileInfo[] = [];

    for (const file of batchFiles) {
      try {
        const fullPath = path.join(localRepoPath, file);
        const stats = await this.getFileStats(fullPath);
        const extension = path.extname(file).toLowerCase();
        const category = this.categorizeFile(file);

        results.push({
          path: file,
          extension,
          category,
          size: stats.size,
          lastModified: stats.lastModified,
        });
      } catch (error) {
        logger.warn(`Failed to process file: ${file}`, { error });
        // Continue processing other files
      }
    }

    return results;
  }

  /**
   * Calculate statistics for a group of files
   */
  private calculateStatsForGroup(
    files: FileInfo[],
    totalFiles: number
  ): FileTypeStats {
    const count = files.length;
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const averageSize = count > 0 ? totalSize / count : 0;
    const percentage = totalFiles > 0 ? (count / totalFiles) * 100 : 0;

    return {
      count,
      percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
      size: totalSize,
      averageSize: Math.round(averageSize),
    };
  }

  /**
   * Build directory distribution tree
   */
  private buildDirectoryDistribution(
    files: FileInfo[]
  ): DirectoryDistribution[] {
    const dirMap: Record<string, FileInfo[]> = {};

    // Group files by directory
    files.forEach((file) => {
      const dir = path.dirname(file.path);
      if (!dirMap[dir]) {
        dirMap[dir] = [];
      }
      dirMap[dir].push(file);
    });

    // Build directory tree
    const directories: DirectoryDistribution[] = [];

    for (const [dirPath, dirFiles] of Object.entries(dirMap)) {
      // Calculate category statistics
      const categoryGroups: Record<FileCategory, FileInfo[]> = {
        code: [],
        documentation: [],
        configuration: [],
        assets: [],
        other: [],
      };

      dirFiles.forEach((file) => {
        categoryGroups[file.category].push(file);
      });

      const categories: Record<FileCategory, FileTypeStats> = {
        code: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        documentation: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        configuration: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        assets: { count: 0, percentage: 0, size: 0, averageSize: 0 },
        other: { count: 0, percentage: 0, size: 0, averageSize: 0 },
      };

      for (const [category, categoryFiles] of Object.entries(categoryGroups)) {
        categories[category as FileCategory] = this.calculateStatsForGroup(
          categoryFiles,
          dirFiles.length
        );
      }

      // Calculate extension statistics
      const extensionGroups: Record<string, FileInfo[]> = {};
      dirFiles.forEach((file) => {
        if (!extensionGroups[file.extension]) {
          extensionGroups[file.extension] = [];
        }
        extensionGroups[file.extension].push(file);
      });

      const extensions: Record<string, FileTypeStats> = {};
      for (const [ext, extFiles] of Object.entries(extensionGroups)) {
        extensions[ext] = this.calculateStatsForGroup(
          extFiles,
          dirFiles.length
        );
      }

      directories.push({
        path: dirPath,
        categories,
        extensions,
        totalFiles: dirFiles.length,
        totalSize: dirFiles.reduce((sum, file) => sum + file.size, 0),
        subdirectories: [], // Will be populated by parent-child relationship logic
      });
    }

    return directories;
  }

  /**
   * Process files using streaming mode for large repositories
   */
  private async processFilesWithStreaming(
    localRepoPath: string,
    allFiles: string[],
    totalFiles: number,
    startTime: number
  ): Promise<FileInfo[]> {
    recordStreamingStart(totalFiles);

    const batchSize = this.defaultStreamingOptions.batchSize;
    const metrics: FileAnalysisMetrics = {
      totalFiles,
      processedFiles: 0,
      batchesProcessed: 0,
      averageBatchTime: 0,
      memoryUsageMB: 0,
      cacheHitRate: 0,
      startTime,
      largestFile: { path: '', size: 0 },
    };

    const fileInfos: FileInfo[] = [];

    for (let i = 0; i < totalFiles; i += batchSize) {
      const batchStartTime = Date.now();

      // Check memory pressure
      const memoryStats = getMemoryStats();
      if (memoryStats.pressure.level === 'emergency') {
        logger.error('Emergency memory pressure - stopping file analysis', {
          localRepoPath,
          processedFiles: metrics.processedFiles,
          totalFiles,
        });
        throw new Error(
          'File analysis stopped due to emergency memory pressure'
        );
      }

      // Process batch
      const batchFiles = await this.processFilesBatch(
        localRepoPath,
        allFiles,
        i,
        batchSize
      );
      fileInfos.push(...batchFiles);

      // Update metrics
      this.updateStreamingMetrics(
        metrics,
        batchFiles,
        batchStartTime,
        memoryStats
      );

      recordStreamingBatch(
        batchFiles.length,
        metrics.lastBatchTime!,
        false,
        totalFiles
      );

      logger.debug('Processed file analysis batch', {
        batch: metrics.batchesProcessed,
        filesInBatch: batchFiles.length,
        totalProcessed: metrics.processedFiles,
        totalFiles,
        batchTime: metrics.lastBatchTime,
        memoryUsage: `${metrics.memoryUsageMB}MB`,
      });
    }

    recordStreamingCompletion(
      metrics.totalFiles,
      Date.now() - startTime,
      metrics.processedFiles,
      metrics.batchesProcessed,
      0, // cacheHitRate - no cache hit tracking for file analysis
      metrics.memoryUsageMB
    );

    return fileInfos;
  }

  /**
   * Update streaming metrics with batch processing results
   */
  private updateStreamingMetrics(
    metrics: FileAnalysisMetrics,
    batchFiles: FileInfo[],
    batchStartTime: number,
    memoryStats: any
  ): void {
    metrics.processedFiles += batchFiles.length;
    metrics.batchesProcessed++;
    metrics.lastBatchTime = Date.now() - batchStartTime;
    metrics.averageBatchTime =
      (metrics.averageBatchTime * (metrics.batchesProcessed - 1) +
        metrics.lastBatchTime) /
      metrics.batchesProcessed;
    metrics.memoryUsageMB = memoryStats.process.rss / (1024 * 1024); // Convert bytes to MB

    // Track largest file
    for (const file of batchFiles) {
      if (file.size > metrics.largestFile.size) {
        metrics.largestFile = { path: file.path, size: file.size };
      }
    }
  }

  /**
   * Calculate category statistics from file infos
   */
  private calculateCategoryStatistics(
    fileInfos: FileInfo[],
    totalFiles: number
  ): Record<FileCategory, FileTypeStats> {
    const categoryGroups: Record<FileCategory, FileInfo[]> = {
      code: [],
      documentation: [],
      configuration: [],
      assets: [],
      other: [],
    };

    fileInfos.forEach((file) => {
      categoryGroups[file.category].push(file);
    });

    const categories: Record<FileCategory, FileTypeStats> = {
      code: { count: 0, percentage: 0, size: 0, averageSize: 0 },
      documentation: { count: 0, percentage: 0, size: 0, averageSize: 0 },
      configuration: { count: 0, percentage: 0, size: 0, averageSize: 0 },
      assets: { count: 0, percentage: 0, size: 0, averageSize: 0 },
      other: { count: 0, percentage: 0, size: 0, averageSize: 0 },
    };

    for (const [category, categoryFiles] of Object.entries(categoryGroups)) {
      categories[category as FileCategory] = this.calculateStatsForGroup(
        categoryFiles,
        totalFiles
      );
    }

    return categories;
  }

  /**
   * Calculate extension statistics from file infos
   */
  private calculateExtensionStatistics(
    fileInfos: FileInfo[],
    totalFiles: number
  ): Record<string, FileTypeStats> {
    const extensionGroups: Record<string, FileInfo[]> = {};
    fileInfos.forEach((file) => {
      if (!extensionGroups[file.extension]) {
        extensionGroups[file.extension] = [];
      }
      extensionGroups[file.extension].push(file);
    });

    const extensions: Record<string, FileTypeStats> = {};
    for (const [ext, extFiles] of Object.entries(extensionGroups)) {
      extensions[ext] = this.calculateStatsForGroup(extFiles, totalFiles);
    }

    return extensions;
  }

  /**
   * Main file analysis method
   */
  async analyzeRepository(
    localRepoPath: string,
    options?: FileAnalysisFilterOptions
  ): Promise<FileTypeDistribution> {
    const startTime = Date.now();
    logger.info('Starting file analysis', { localRepoPath, options });

    try {
      // Get repository commit hash for metadata
      const git: SimpleGit = simpleGit(localRepoPath);
      const commitHash = await git.revparse(['HEAD']).catch(() => undefined);

      // Get all files from repository
      const allFiles = await this.getRepositoryFiles(localRepoPath, options);
      const totalFiles = allFiles.length;

      // Determine if streaming should be used
      const useStreaming = await this.shouldUseStreaming(localRepoPath);

      // Process files based on streaming decision
      const fileInfos = useStreaming
        ? await this.processFilesWithStreaming(
            localRepoPath,
            allFiles,
            totalFiles,
            startTime
          )
        : await this.processFilesBatch(localRepoPath, allFiles, 0, totalFiles);

      // Calculate statistics
      const categories = this.calculateCategoryStatistics(
        fileInfos,
        totalFiles
      );
      const extensions = this.calculateExtensionStatistics(
        fileInfos,
        totalFiles
      );
      const directories = this.buildDirectoryDistribution(fileInfos);
      const totalSize = fileInfos.reduce((sum, file) => sum + file.size, 0);

      // Build final result
      const result: FileTypeDistribution = {
        categories,
        extensions,
        directories,
        metadata: {
          totalFiles,
          totalSize,
          analyzedAt: new Date().toISOString(),
          repositorySize: getRepositorySizeCategory(totalFiles),
          commitHash,
          streamingUsed: useStreaming,
        },
      };

      const analysisTime = Date.now() - startTime;
      logger.info('File analysis completed', {
        localRepoPath,
        totalFiles,
        totalSize,
        analysisTime,
        streamingUsed: useStreaming,
        categoriesFound: Object.keys(categories).length,
        extensionsFound: Object.keys(extensions).length,
        directoriesAnalyzed: directories.length,
      });

      // Update service health score
      updateServiceHealthScore('file-analysis', {
        errorRate: 0,
        responseTime: analysisTime,
        memoryUtilization: process.memoryUsage().rss / (1024 * 1024),
      });

      return result;
    } catch (error) {
      logger.error('File analysis failed', { error, localRepoPath });
      recordDetailedError(
        'file-analysis',
        error instanceof Error ? error : new Error(String(error))
      );
      updateServiceHealthScore('file-analysis', {
        errorRate: 1.0,
        responseTime: Date.now() - startTime,
        memoryUtilization: process.memoryUsage().rss / (1024 * 1024),
      });

      throw new RepositoryError(
        `File analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        localRepoPath
      );
    }
  }
}

// Export singleton instance
export const fileAnalysisService = new FileAnalysisService();
