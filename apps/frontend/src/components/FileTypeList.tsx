import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { FileCode, FileJson, FileText, Image, File } from 'lucide-react';
import { Progress } from './ui/progress';

const fileTypes = [
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

const totalFiles = fileTypes.reduce((sum, ft) => sum + ft.count, 0);

export function FileTypeList() {
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
                    <p className="font-semibold">{fileType.count}</p>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Files</p>
              <p className="text-xl font-semibold">
                {totalFiles.toLocaleString()}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">File Types</p>
              <p className="text-xl font-semibold">{fileTypes.length}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
