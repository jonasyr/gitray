import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { FileCode, ChevronDown, ChevronRight, Plus, Minus } from 'lucide-react';
import { useState } from 'react';
import { ScrollArea } from './ui/scroll-area';

const diffFiles = [
  {
    name: 'src/components/Dashboard.tsx',
    additions: 45,
    deletions: 12,
    status: 'modified',
    diff: [
      { type: 'context', line: "import { Card } from './ui/card';", number: 1 },
      {
        type: 'context',
        line: "import { Button } from './ui/button';",
        number: 2,
      },
      { type: 'add', line: "import { Badge } from './ui/badge';", number: 3 },
      { type: 'context', line: '', number: 4 },
      { type: 'context', line: 'export function Dashboard() {', number: 5 },
      {
        type: 'remove',
        line: '  const [data, setData] = useState(null);',
        number: 6,
      },
      {
        type: 'add',
        line: '  const [data, setData] = useState<DashboardData | null>(null);',
        number: 7,
      },
      {
        type: 'add',
        line: '  const [loading, setLoading] = useState(false);',
        number: 8,
      },
      { type: 'context', line: '', number: 9 },
      { type: 'context', line: '  return (', number: 10 },
      { type: 'remove', line: '    <div>Dashboard</div>', number: 11 },
      { type: 'add', line: "    <div className='space-y-4'>", number: 12 },
      { type: 'add', line: '      <h1>Dashboard</h1>', number: 13 },
      { type: 'add', line: '      <Card>', number: 14 },
      {
        type: 'add',
        line: '        <CardContent>Analytics</CardContent>',
        number: 15,
      },
      { type: 'add', line: '      </Card>', number: 16 },
      { type: 'add', line: '    </div>', number: 17 },
      { type: 'context', line: '  );', number: 18 },
      { type: 'context', line: '}', number: 19 },
    ],
  },
  {
    name: 'src/lib/api.ts',
    additions: 23,
    deletions: 5,
    status: 'modified',
    diff: [
      { type: 'context', line: 'async function fetchData() {', number: 1 },
      {
        type: 'remove',
        line: "  const response = await fetch('/api/data');",
        number: 2,
      },
      {
        type: 'add',
        line: "  const response = await fetch('/api/v2/data', {",
        number: 3,
      },
      {
        type: 'add',
        line: "    headers: { 'Authorization': `Bearer ${token}` }",
        number: 4,
      },
      { type: 'add', line: '  });', number: 5 },
      { type: 'context', line: '  return response.json();', number: 6 },
      { type: 'context', line: '}', number: 7 },
    ],
  },
  {
    name: 'src/styles/globals.css',
    additions: 8,
    deletions: 2,
    status: 'modified',
    diff: [
      { type: 'context', line: ':root {', number: 1 },
      { type: 'remove', line: '  --primary: #3b82f6;', number: 2 },
      { type: 'add', line: '  --primary: #5B9A8B;', number: 3 },
      { type: 'add', line: '  --secondary: #FFA69E;', number: 4 },
      { type: 'context', line: '}', number: 5 },
    ],
  },
];

export function GitDiffViewer() {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set([diffFiles[0].name])
  );

  const toggleFile = (fileName: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(fileName)) {
      newExpanded.delete(fileName);
    } else {
      newExpanded.add(fileName);
    }
    setExpandedFiles(newExpanded);
  };

  const totalAdditions = diffFiles.reduce(
    (sum, file) => sum + file.additions,
    0
  );
  const totalDeletions = diffFiles.reduce(
    (sum, file) => sum + file.deletions,
    0
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            Git Diff Viewer
          </CardTitle>
          <CardDescription>
            Compare current version with previous commit
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-2 text-sm">
              <Badge
                variant="outline"
                className="bg-green-500/10 text-green-500 border-green-500/20"
              >
                <Plus className="h-3 w-3 mr-1" />
                {totalAdditions} additions
              </Badge>
              <Badge
                variant="outline"
                className="bg-red-500/10 text-red-500 border-red-500/20"
              >
                <Minus className="h-3 w-3 mr-1" />
                {totalDeletions} deletions
              </Badge>
            </div>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500"
                style={{
                  width: `${(totalAdditions / (totalAdditions + totalDeletions)) * 100}%`,
                }}
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {diffFiles.length} files changed
            </span>
          </div>

          <div className="space-y-3">
            {diffFiles.map((file, index) => (
              <div key={index} className="border rounded-lg overflow-hidden">
                <Button
                  variant="ghost"
                  className="w-full justify-between p-4 h-auto hover:bg-muted/50"
                  onClick={() => toggleFile(file.name)}
                >
                  <div className="flex items-center gap-3">
                    {expandedFiles.has(file.name) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <FileCode className="h-4 w-4" />
                    <span className="font-mono text-sm">{file.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {file.status}
                    </Badge>
                    <span className="text-xs text-green-500">
                      +{file.additions}
                    </span>
                    <span className="text-xs text-red-500">
                      -{file.deletions}
                    </span>
                  </div>
                </Button>

                {expandedFiles.has(file.name) && (
                  <ScrollArea className="h-[300px] border-t">
                    <div className="font-mono text-xs">
                      {file.diff.map((line, lineIndex) => (
                        <div
                          key={lineIndex}
                          className={`flex px-4 py-1 ${
                            line.type === 'add'
                              ? 'bg-green-500/10'
                              : line.type === 'remove'
                                ? 'bg-red-500/10'
                                : ''
                          }`}
                        >
                          <span className="text-muted-foreground mr-4 select-none w-8 text-right">
                            {line.number}
                          </span>
                          <span
                            className={`mr-2 ${
                              line.type === 'add'
                                ? 'text-green-500'
                                : line.type === 'remove'
                                  ? 'text-red-500'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {line.type === 'add'
                              ? '+'
                              : line.type === 'remove'
                                ? '-'
                                : ' '}
                          </span>
                          <span className="flex-1 whitespace-pre-wrap break-all">
                            {line.line}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Comparing with commit{' '}
              <code className="px-2 py-1 bg-muted rounded text-xs">
                a3f4c21
              </code>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                View Full Diff
              </Button>
              <Button variant="default" size="sm">
                Commit Changes
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
