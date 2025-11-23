import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { FileCode, FileJson, FileText, Image, File } from 'lucide-react';
import { Progress } from './ui/progress';
import { FileTypeDistribution } from '@gitray/shared-types';

interface FileTypeListProps {
  fileDistribution?: FileTypeDistribution | null;
}

// Mock data for fallback
const mockFileTypes = [
  {
    type: 'TypeScript',
    extension: '.ts, .tsx',
    count: 247,
    percentage: 42,
    icon: FileCode,
    color: 'bg-blue-500',
  },
  {
    type: 'JavaScript',
    extension: '.js, .jsx',
    count: 183,
    percentage: 31,
    icon: FileCode,
    color: 'bg-yellow-500',
  },
  {
    type: 'JSON',
    extension: '.json',
    count: 72,
    percentage: 12,
    icon: FileJson,
    color: 'bg-green-500',
  },
  {
    type: 'Markdown',
    extension: '.md',
    count: 45,
    percentage: 8,
    icon: FileText,
    color: 'bg-purple-500',
  },
  {
    type: 'CSS/SCSS',
    extension: '.css, .scss',
    count: 28,
    percentage: 5,
    icon: FileText,
    color: 'bg-pink-500',
  },
  {
    type: 'Images',
    extension: '.png, .jpg, .svg',
    count: 15,
    percentage: 2,
    icon: Image,
    color: 'bg-orange-500',
  },
];

// Helper function to get icon for file extension
function getIconForExtension(extension: string) {
  const ext = extension.toLowerCase();
  if (ext.includes('json')) return FileJson;
  if (ext.includes('md')) return FileText;
  if (ext.includes('css') || ext.includes('scss')) return FileText;
  if (
    ext.includes('png') ||
    ext.includes('jpg') ||
    ext.includes('svg') ||
    ext.includes('gif')
  )
    return Image;
  if (
    ext.includes('ts') ||
    ext.includes('js') ||
    ext.includes('tsx') ||
    ext.includes('jsx')
  )
    return FileCode;
  return File;
}

// Helper function to get color for extension
function getColorForExtension(extension: string): string {
  const ext = extension.toLowerCase();
  if (ext.includes('.ts') || ext.includes('.tsx')) return 'bg-blue-500';
  if (ext.includes('.js') || ext.includes('.jsx')) return 'bg-yellow-500';
  if (ext.includes('.json')) return 'bg-green-500';
  if (ext.includes('.md')) return 'bg-purple-500';
  if (ext.includes('.css') || ext.includes('.scss')) return 'bg-pink-500';
  if (ext.includes('.png') || ext.includes('.jpg') || ext.includes('.svg'))
    return 'bg-orange-500';
  return 'bg-gray-500';
}

// Helper function to get human-readable file type name from extension
function getFileTypeName(extension: string): string {
  const ext = extension.toLowerCase();

  // Programming languages
  if (ext === '.ts' || ext === '.tsx') return 'TypeScript';
  if (ext === '.js' || ext === '.jsx') return 'JavaScript';
  if (ext === '.mjs') return 'Module JavaScript';
  if (ext === '.cjs') return 'CommonJS';
  if (ext === '.py') return 'Python';
  if (ext === '.java') return 'Java';
  if (ext === '.cpp' || ext === '.cc' || ext === '.cxx') return 'C++';
  if (ext === '.c') return 'C';
  if (ext === '.cs') return 'C#';
  if (ext === '.go') return 'Go';
  if (ext === '.rs') return 'Rust';
  if (ext === '.rb') return 'Ruby';
  if (ext === '.php') return 'PHP';
  if (ext === '.swift') return 'Swift';
  if (ext === '.kt' || ext === '.kts') return 'Kotlin';
  if (ext === '.scala') return 'Scala';
  if (ext === '.clj' || ext === '.cljs') return 'Clojure';
  if (ext === '.ex' || ext === '.exs') return 'Elixir';
  if (ext === '.erl') return 'Erlang';
  if (ext === '.hs') return 'Haskell';
  if (ext === '.lua') return 'Lua';
  if (ext === '.r') return 'R';
  if (ext === '.m') return 'Objective-C';
  if (ext === '.dart') return 'Dart';
  if (ext === '.sh' || ext === '.bash') return 'Shell Script';
  if (ext === '.ps1') return 'PowerShell Script';
  if (ext === '.psd1') return 'PowerShell Data';
  if (ext === '.psm1') return 'PowerShell Module';
  if (ext === '.pl') return 'Perl';
  if (ext === '.vb') return 'Visual Basic';
  if (ext === '.fs' || ext === '.fsx') return 'F#';

  // Markup & styling
  if (ext === '.html' || ext === '.htm') return 'HTML';
  if (ext === '.css') return 'CSS';
  if (ext === '.scss' || ext === '.sass') return 'SCSS/Sass';
  if (ext === '.less') return 'Less';
  if (ext === '.xml') return 'XML';
  if (ext === '.svg') return 'SVG';
  if (ext === '.vue') return 'Vue';
  if (ext === '.jsx') return 'JSX';
  if (ext === '.tsx') return 'TSX';

  // Data formats
  if (ext === '.json') return 'JSON';
  if (ext === '.yaml' || ext === '.yml') return 'YAML';
  if (ext === '.toml') return 'TOML';
  if (ext === '.xml') return 'XML';
  if (ext === '.csv') return 'CSV';
  if (ext === '.sql') return 'SQL';

  // Documentation
  if (ext === '.md' || ext === '.markdown') return 'Markdown';
  if (ext === '.txt') return 'Text';
  if (ext === '.rst') return 'reStructuredText';
  if (ext === '.tex') return 'LaTeX';
  if (ext === '.pdf') return 'PDF';
  if (ext === '.doc' || ext === '.docx') return 'Word Document';

  // Images
  if (ext === '.png') return 'PNG Image';
  if (ext === '.jpg' || ext === '.jpeg') return 'JPEG Image';
  if (ext === '.gif') return 'GIF Image';
  if (ext === '.webp') return 'WebP Image';
  if (ext === '.bmp') return 'Bitmap Image';
  if (ext === '.ico') return 'Icon';
  if (ext === '.tif' || ext === '.tiff') return 'TIFF Image';

  // Animation & interactive
  if (ext === '.riv') return 'Rive';

  // Configuration
  if (ext === '.env') return 'Environment Config';
  if (ext === '.gitignore') return 'Git Ignore';
  if (ext === '.dockerignore') return 'Docker Ignore';
  if (ext === '.editorconfig') return 'Editor Config';
  if (ext === '.eslintrc') return 'ESLint Config';
  if (ext === '.prettierrc') return 'Prettier Config';

  // Build & package files
  if (ext === '.lock') return 'Lock File';
  if (ext === '.log') return 'Log File';
  if (ext === '.zip') return 'ZIP Archive';
  if (ext === '.tar') return 'TAR Archive';
  if (ext === '.gz') return 'Gzip Archive';

  // Fallback: capitalize the extension without the dot
  return ext.replace('.', '').toUpperCase();
}

// Convert backend data to display format
function convertFileDistribution(data: FileTypeDistribution) {
  // First, group extensions by their display name, keeping individual stats
  const groupedByType = new Map<
    string,
    {
      extensionStats: Array<{
        extension: string;
        count: number;
        percentage: number;
      }>;
      totalCount: number;
      totalPercentage: number;
    }
  >();

  Object.entries(data.extensions).forEach(([extension, stats]) => {
    const isNoExtension = !extension || extension === '' || extension === '.';
    const displayType = isNoExtension
      ? 'No Extension'
      : getFileTypeName(extension);

    if (groupedByType.has(displayType)) {
      const existing = groupedByType.get(displayType)!;
      existing.extensionStats.push({
        extension,
        count: stats.count,
        percentage: stats.percentage,
      });
      existing.totalCount += stats.count;
      existing.totalPercentage += stats.percentage;
    } else {
      groupedByType.set(displayType, {
        extensionStats: [
          { extension, count: stats.count, percentage: stats.percentage },
        ],
        totalCount: stats.count,
        totalPercentage: stats.percentage,
      });
    }
  });

  // Convert to array format
  return (
    Array.from(groupedByType.entries())
      .map(([type, data]) => {
        const isNoExtension = type === 'No Extension';
        const firstExtension = data.extensionStats[0].extension;

        // Create display extension with percentages only if there are multiple extensions
        let displayExtension: string;
        if (isNoExtension) {
          displayExtension = 'files without extension';
        } else if (data.extensionStats.length === 1) {
          // Single extension: just show the extension
          displayExtension = data.extensionStats[0].extension;
        } else {
          // Multiple extensions: show each with their actual percentage (not relative)
          // Round to 2 decimal places to match pie chart
          const roundedPercentages = data.extensionStats.map((stat) => ({
            extension: stat.extension,
            percentage: Math.round(stat.percentage * 100) / 100,
          }));

          displayExtension = roundedPercentages
            .map((stat) => `${stat.extension} ${stat.percentage}%`)
            .join(', ');
        }

        return {
          type,
          extension: displayExtension,
          count: data.totalCount,
          percentage: Math.round(data.totalPercentage * 100) / 100, // Round to 2 decimal places
          icon: isNoExtension ? File : getIconForExtension(firstExtension),
          color: isNoExtension
            ? 'bg-gray-500'
            : getColorForExtension(firstExtension),
        };
      })
      // Sort by count descending
      .sort((a, b) => b.count - a.count)
  );
}

export function FileTypeList({ fileDistribution }: FileTypeListProps) {
  const fileTypes = useMemo(() => {
    if (fileDistribution && fileDistribution.extensions) {
      return convertFileDistribution(fileDistribution);
    }
    return mockFileTypes;
  }, [fileDistribution]);

  const totalFiles = useMemo(() => {
    if (fileDistribution?.metadata?.totalFiles) {
      return fileDistribution.metadata.totalFiles;
    }
    return fileTypes.reduce((sum, ft) => sum + ft.count, 0);
  }, [fileDistribution, fileTypes]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>File Type Distribution</CardTitle>
        <CardDescription>
          Breakdown of {totalFiles.toLocaleString()} files by type
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {fileTypes.map((fileType, index) => {
            const Icon = fileType.icon;
            return (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${fileType.color} bg-opacity-10`}
                    >
                      <Icon
                        className={`h-4 w-4 ${fileType.color.replace('bg-', 'text-')}`}
                      />
                    </div>
                    <div>
                      <p className="font-medium">{fileType.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {fileType.extension}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      <span className="text-xs text-muted-foreground font-normal mr-1">
                        Files:
                      </span>
                      {fileType.count}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fileType.percentage}%
                    </p>
                  </div>
                </div>
                <Progress value={fileType.percentage} className="h-2" />
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-6 border-t">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Files</p>
              <p className="text-xl font-semibold">
                {totalFiles.toLocaleString()}
              </p>
            </div>
            <div className="space-y-1 text-center">
              <p className="text-sm text-muted-foreground">Average File Size</p>
              <p className="text-xl font-semibold">
                {fileDistribution?.metadata?.totalSize && totalFiles > 0
                  ? `≈ ${Math.round(fileDistribution.metadata.totalSize / totalFiles / 1024)} KB`
                  : 'N/A'}
              </p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-sm text-muted-foreground">File Types</p>
              <p className="text-xl font-semibold">{fileTypes.length}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
