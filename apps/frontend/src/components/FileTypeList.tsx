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

// Convert backend data to display format
function convertFileDistribution(data: FileTypeDistribution) {
  // Convert the extensions Record to an array
  return (
    Object.entries(data.extensions)
      .map(([extension, stats]) => {
        // Handle files without extension
        const isNoExtension =
          !extension || extension === '' || extension === '.';
        const displayType = isNoExtension
          ? 'No Extension'
          : extension.replace('.', '').toUpperCase();
        const displayExtension = isNoExtension
          ? 'files without extension'
          : extension;

        return {
          type: displayType,
          extension: displayExtension,
          count: stats.count,
          percentage: Math.round(stats.percentage),
          icon: isNoExtension ? File : getIconForExtension(extension),
          color: isNoExtension
            ? 'bg-gray-500'
            : getColorForExtension(extension),
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
                  ? `${Math.round(fileDistribution.metadata.totalSize / totalFiles / 1024)}KB`
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
