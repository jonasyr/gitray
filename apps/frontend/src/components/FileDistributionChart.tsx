import { useMemo } from 'react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import { FileTypeDistribution } from '@gitray/shared-types';

interface FileDistributionChartProps {
  fileDistribution?: FileTypeDistribution | null;
}

const EXTENSION_COLORS: Record<string, string> = {
  // By extension
  '.ts': '#3178C6',
  '.tsx': '#3178C6',
  '.js': '#F7DF1E',
  '.jsx': '#F7DF1E',
  '.go': '#00ADD8',
  '.py': '#3776AB',
  '.json': '#292929',
  '.md': '#083D77',
  '.html': '#E34C26',
  '.css': '#264DE4',
  '.java': '#E76F00',
  '.rs': '#DEA584',
  '.c': '#A8B9CC',
  '.cpp': '#00599C',
  '.rb': '#CC342D',
  '.php': '#777BB4',
  '.swift': '#FA7343',
  '.kt': '#7F52FF',
  '.yml': '#CB171E',
  '.yaml': '#CB171E',
  '.sh': '#89E051',
  '.sql': '#E38C00',
  '.xml': '#E34C26',
  '.csv': '#217346',
  '.mjs': '#F7DF1E',
  '.vue': '#42B883',
  '.scss': '#CC6699',
  '.sass': '#CC6699',
  '.less': '#1D365D',
};

// Color palette for unmapped extensions
const COLOR_PALETTE = [
  '#5B9A8B',
  '#FFA69E',
  '#2E073F',
  '#7DB9A5',
  '#FFB8B1',
  '#83C5BE',
  '#EDF6F9',
  '#FFDDD2',
  '#E29578',
  '#006D77',
];

// Mock data for fallback
const mockData = [
  { name: 'TS', value: 48, color: EXTENSION_COLORS['.ts'] },
  { name: 'GO', value: 22, color: EXTENSION_COLORS['.go'] },
  { name: 'PY', value: 18, color: EXTENSION_COLORS['.py'] },
  { name: 'JSON', value: 7, color: EXTENSION_COLORS['.json'] },
  { name: 'MD', value: 5, color: EXTENSION_COLORS['.md'] },
];

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

// Convert backend data to chart format with "Others" grouping
function convertToChartData(fileDistribution: FileTypeDistribution) {
  const OTHERS_THRESHOLD = 3; // Group file types with less than 3% into "Others"

  // First, group extensions by their display name
  const groupedByType = new Map<
    string,
    {
      extensions: string[];
      count: number;
      size: number;
      percentage: number;
    }
  >();

  Object.entries(fileDistribution.extensions).forEach(([ext, stats]) => {
    const isNoExtension = !ext || ext === '' || ext === '.';
    const displayName = isNoExtension ? 'No Extension' : getFileTypeName(ext);

    if (groupedByType.has(displayName)) {
      const existing = groupedByType.get(displayName)!;
      existing.extensions.push(ext);
      existing.count += stats.count;
      existing.size += stats.size;
      existing.percentage += stats.percentage;
    } else {
      groupedByType.set(displayName, {
        extensions: [ext],
        count: stats.count,
        size: stats.size,
        percentage: stats.percentage,
      });
    }
  });

  // Convert to array format
  const extensionData = Array.from(groupedByType.entries())
    .map(([displayName, data], index) => {
      const isNoExtension = displayName === 'No Extension';
      const firstExt = data.extensions[0];

      return {
        name: displayName,
        value: Math.round(data.percentage * 100) / 100, // Round to 2 decimal places
        count: data.count,
        size: data.size,
        color: isNoExtension
          ? '#6B7280' // Gray for no extension
          : EXTENSION_COLORS[firstExt.toLowerCase()] ||
            COLOR_PALETTE[index % COLOR_PALETTE.length],
      };
    })
    .sort((a, b) => b.value - a.value);

  // Separate significant types and small types
  const significantTypes = extensionData.filter(
    (item) => item.value >= OTHERS_THRESHOLD
  );
  const smallTypes = extensionData.filter(
    (item) => item.value < OTHERS_THRESHOLD
  );

  // If there are small types, group them into "Others"
  if (smallTypes.length > 0) {
    const othersEntry = {
      name: 'Others',
      value:
        Math.round(
          smallTypes.reduce((sum, item) => sum + item.value, 0) * 100
        ) / 100,
      count: smallTypes.reduce((sum, item) => sum + item.count, 0),
      size: smallTypes.reduce((sum, item) => sum + item.size, 0),
      color: '#94A3B8', // Neutral gray color for "Others"
      isOthers: true, // Flag to identify this as the "Others" category
    };

    return [...significantTypes, othersEntry];
  }

  return significantTypes;
}

export function FileDistributionChart({
  fileDistribution,
}: FileDistributionChartProps) {
  const data = useMemo(() => {
    console.log('FileDistribution received:', fileDistribution);
    if (fileDistribution && fileDistribution.extensions) {
      const chartData = convertToChartData(fileDistribution);
      console.log('Converted chart data:', chartData);
      return chartData;
    }
    console.log('Using mock data');
    return mockData;
  }, [fileDistribution]);

  console.log('Rendering with data:', data);

  if (!data || data.length === 0) {
    return (
      <div className="h-[280px] w-full flex items-center justify-center text-muted-foreground">
        No file data available
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                    <p className="text-sm font-medium mb-1">
                      {payload[0].name}
                    </p>
                    <p className="text-sm">
                      Percentage:{' '}
                      <span className="font-semibold">{data.value}%</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {data.count.toLocaleString()} file
                      {data.count !== 1 ? 's' : ''}
                    </p>
                    {data.isOthers && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        Grouped file types &lt; 3%
                      </p>
                    )}
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            formatter={(value, entry: any) => (
              <span className="text-xs text-foreground">
                {value} ({entry.payload.value}%)
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
