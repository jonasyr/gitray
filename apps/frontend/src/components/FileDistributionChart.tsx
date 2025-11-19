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

// Convert backend data to chart format
function convertToChartData(fileDistribution: FileTypeDistribution) {
  const extensionData = Object.entries(fileDistribution.extensions)
    .map(([ext, stats], index) => ({
      name: ext.replace('.', '').toUpperCase(),
      value: Math.round(stats.percentage),
      count: stats.count,
      size: stats.size,
      color:
        EXTENSION_COLORS[ext.toLowerCase()] ||
        COLOR_PALETTE[index % COLOR_PALETTE.length],
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10); // Top 10 file types

  return extensionData;
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
                return (
                  <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                    <p className="text-sm">
                      {payload[0].name}:{' '}
                      <span className="font-semibold">{payload[0].value}%</span>
                    </p>
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
