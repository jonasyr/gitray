import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import {
  FileCode,
  FileJson,
  FileText,
  Image,
  File,
  FileTerminal,
  Braces,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  Database,
  Code2,
  FileType,
  Settings,
  Lock,
  FileSpreadsheet,
} from 'lucide-react';
import { Progress } from './ui/progress';
import { FileTypeDistribution } from '@gitray/shared-types';

interface FileTypeListProps {
  fileDistribution?: FileTypeDistribution | null;
}

// Helper function to get icon for file extension
function getIconForExtension(extension: string) {
  const ext = extension.toLowerCase();

  // Programming languages
  if (
    ext.includes('ts') ||
    ext.includes('js') ||
    ext.includes('tsx') ||
    ext.includes('jsx')
  )
    return FileCode;
  if (
    ext.includes('.go') ||
    ext.includes('.rs') ||
    ext.includes('.c') ||
    ext.includes('.cpp')
  )
    return Code2;
  if (ext.includes('.py') || ext.includes('.rb') || ext.includes('.php'))
    return FileCode;
  if (ext.includes('.java') || ext.includes('.kt') || ext.includes('.swift'))
    return FileCode;

  // Scripts
  if (
    ext.includes('.sh') ||
    ext.includes('.bash') ||
    ext.includes('.ps1') ||
    ext.includes('.psm1')
  )
    return FileTerminal;

  // Data & config
  if (ext.includes('json')) return FileJson;
  if (ext.includes('.yml') || ext.includes('.yaml') || ext.includes('.toml'))
    return Braces;
  if (ext.includes('.xml')) return FileType;
  if (ext.includes('.env') || ext.includes('config') || ext.includes('.ini'))
    return Settings;
  if (ext.includes('.psd1')) return Settings; // PowerShell data

  // Documentation
  if (ext.includes('md') || ext.includes('.txt') || ext.includes('.rst'))
    return FileText;
  if (ext.includes('.pdf') || ext.includes('.doc')) return FileText;

  // Styling
  if (
    ext.includes('css') ||
    ext.includes('scss') ||
    ext.includes('sass') ||
    ext.includes('less')
  )
    return FileType;

  // Images
  if (
    ext.includes('png') ||
    ext.includes('jpg') ||
    ext.includes('jpeg') ||
    ext.includes('gif')
  )
    return FileImage;
  if (ext.includes('svg') || ext.includes('webp') || ext.includes('ico'))
    return Image;
  if (ext.includes('.riv')) return FileVideo; // Rive animations

  // Media
  if (ext.includes('.mp4') || ext.includes('.mov') || ext.includes('.avi'))
    return FileVideo;
  if (ext.includes('.mp3') || ext.includes('.wav') || ext.includes('.ogg'))
    return FileAudio;

  // Archives
  if (
    ext.includes('.zip') ||
    ext.includes('.tar') ||
    ext.includes('.gz') ||
    ext.includes('.rar')
  )
    return FileArchive;

  // Database & data files
  if (ext.includes('.sql') || ext.includes('.db') || ext.includes('.sqlite'))
    return Database;
  if (ext.includes('.csv') || ext.includes('.xlsx') || ext.includes('.xls'))
    return FileSpreadsheet;

  // Security
  if (ext.includes('.lock') || ext.includes('.key') || ext.includes('.pem'))
    return Lock;

  return File;
}

// Helper function to get color for extension
function getColorForExtension(extension: string): string {
  const ext = extension.toLowerCase();

  // Programming languages
  if (ext.includes('.ts') || ext.includes('.tsx')) return 'bg-blue-500';
  if (ext.includes('.js') || ext.includes('.jsx')) return 'bg-yellow-500';
  if (ext.includes('.mjs')) return 'bg-yellow-600';
  if (ext.includes('.cjs')) return 'bg-yellow-700';
  if (ext.includes('.py')) return 'bg-blue-600';
  if (ext.includes('.go')) return 'bg-cyan-500';
  if (ext.includes('.rs')) return 'bg-orange-600';
  if (ext.includes('.java')) return 'bg-red-600';
  if (ext.includes('.c') && !ext.includes('.css')) return 'bg-blue-700';
  if (ext.includes('.cpp')) return 'bg-blue-800';
  if (ext.includes('.cs')) return 'bg-purple-600';
  if (ext.includes('.rb')) return 'bg-red-500';
  if (ext.includes('.php')) return 'bg-indigo-500';
  if (ext.includes('.swift')) return 'bg-orange-500';
  if (ext.includes('.kt')) return 'bg-purple-500';

  // Scripts & Shell
  if (ext.includes('.sh') || ext.includes('.bash')) return 'bg-green-600';
  if (ext.includes('.ps1') || ext.includes('.psm1')) return 'bg-blue-400';
  if (ext.includes('.psd1')) return 'bg-blue-300';

  // Data & Config
  if (ext.includes('.json')) return 'bg-green-500';
  if (ext.includes('.yml') || ext.includes('.yaml')) return 'bg-red-400';
  if (ext.includes('.toml')) return 'bg-orange-400';
  if (ext.includes('.xml')) return 'bg-orange-300';
  if (ext.includes('.env')) return 'bg-yellow-400';
  if (ext.includes('.ini') || ext.includes('config')) return 'bg-slate-500';

  // Documentation
  if (ext.includes('.md')) return 'bg-purple-500';
  if (ext.includes('.txt')) return 'bg-gray-400';
  if (ext.includes('.pdf')) return 'bg-red-500';
  if (ext.includes('.doc')) return 'bg-blue-500';

  // Styling
  if (ext.includes('.css')) return 'bg-pink-500';
  if (ext.includes('.scss') || ext.includes('.sass')) return 'bg-pink-600';
  if (ext.includes('.less')) return 'bg-blue-400';

  // Images
  if (ext.includes('.png') || ext.includes('.jpg') || ext.includes('.jpeg'))
    return 'bg-orange-500';
  if (ext.includes('.svg')) return 'bg-yellow-500';
  if (ext.includes('.gif')) return 'bg-green-400';
  if (ext.includes('.webp')) return 'bg-teal-500';
  if (ext.includes('.ico')) return 'bg-indigo-400';
  if (ext.includes('.riv')) return 'bg-purple-400';

  // Media
  if (ext.includes('.mp4') || ext.includes('.mov') || ext.includes('.avi'))
    return 'bg-red-600';
  if (ext.includes('.mp3') || ext.includes('.wav')) return 'bg-green-500';

  // Archives
  if (ext.includes('.zip') || ext.includes('.tar') || ext.includes('.gz'))
    return 'bg-amber-600';

  // Database
  if (ext.includes('.sql') || ext.includes('.db')) return 'bg-cyan-600';
  if (ext.includes('.csv')) return 'bg-green-600';

  // Security & locks
  if (ext.includes('.lock')) return 'bg-gray-600';

  // Markup
  if (ext.includes('.html') || ext.includes('.htm')) return 'bg-orange-600';

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
    return [];
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
        {fileTypes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <File className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground mb-2">
              No file data available
            </p>
            <p className="text-sm text-muted-foreground">
              File type distribution data could not be loaded for this
              repository.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {fileTypes.map((fileType, index) => {
              const Icon = fileType.icon;
              return (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${fileType.color} bg-opacity-20`}
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
        )}

        {fileTypes.length > 0 && (
          <div className="mt-6 pt-6 border-t">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Files</p>
                <p className="text-xl font-semibold">
                  {totalFiles.toLocaleString()}
                </p>
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm text-muted-foreground">
                  Average File Size
                </p>
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
        )}
      </CardContent>
    </Card>
  );
}
