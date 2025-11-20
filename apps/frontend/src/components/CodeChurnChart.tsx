import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { Badge } from './ui/badge';
import { CodeChurnAnalysis } from '@gitray/shared-types';

interface CodeChurnChartProps {
  churnData?: CodeChurnAnalysis | null;
}

// Mock data for fallback
const mockChurnData = [
  { file: 'api/auth.ts', changes: 47, category: 'high', bugRisk: 'High' },
  {
    file: 'components/Dashboard.tsx',
    changes: 38,
    category: 'high',
    bugRisk: 'High',
  },
  {
    file: 'utils/helpers.ts',
    changes: 32,
    category: 'high',
    bugRisk: 'Medium',
  },
  {
    file: 'pages/settings.tsx',
    changes: 24,
    category: 'medium',
    bugRisk: 'Medium',
  },
  {
    file: 'lib/api-client.ts',
    changes: 19,
    category: 'medium',
    bugRisk: 'Low',
  },
  {
    file: 'styles/globals.css',
    changes: 15,
    category: 'medium',
    bugRisk: 'Low',
  },
  { file: 'config/routes.ts', changes: 12, category: 'low', bugRisk: 'Low' },
  { file: 'types/index.ts', changes: 8, category: 'low', bugRisk: 'Low' },
];

const COLORS = {
  high: '#FFA69E',
  medium: '#FAE3B4',
  low: '#5B9A8B',
};

// Convert backend data to chart format (backend already limits results)
function convertChurnData(churnAnalysis: CodeChurnAnalysis) {
  // Take only top 20 for visualization (backend sends top 50)
  return churnAnalysis.files.slice(0, 20).map((file) => ({
    file: file.path,
    changes: file.changes,
    category: file.risk,
    bugRisk: file.risk.charAt(0).toUpperCase() + file.risk.slice(1),
  }));
}

export function CodeChurnChart({ churnData }: CodeChurnChartProps) {
  console.log('CodeChurnChart received churnData:', churnData);

  const chartData = useMemo(() => {
    if (churnData && churnData.files && Array.isArray(churnData.files)) {
      const converted = convertChurnData(churnData);
      console.log('Converted chart data:', converted);
      return converted;
    }
    console.log('Using mock data');
    return mockChurnData;
  }, [churnData]);

  const stats = useMemo(() => {
    if (churnData && churnData.metadata) {
      return {
        highRisk: churnData.metadata.highRiskCount,
        mediumRisk: churnData.metadata.mediumRiskCount,
        total: churnData.metadata.totalFiles,
      };
    }
    return { highRisk: 3, mediumRisk: 3, total: 8 };
  }, [churnData]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-destructive/50">
          <CardHeader className="pb-3">
            <CardDescription>High Risk Files</CardDescription>
            <CardTitle className="text-2xl">{stats.highRisk}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Files changed 30+ times
            </p>
          </CardContent>
        </Card>

        <Card className="border-yellow-500/50">
          <CardHeader className="pb-3">
            <CardDescription>Medium Risk Files</CardDescription>
            <CardTitle className="text-2xl">{stats.mediumRisk}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Files changed 15-30 times
            </p>
          </CardContent>
        </Card>

        <Card className="border-primary/50">
          <CardHeader className="pb-3">
            <CardDescription>Total Analyzed</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Most frequently changed
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Code Churn by File
          </CardTitle>
          <CardDescription>
            Files with the most changes - potential bug hotspots
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis type="number" />
              <YAxis dataKey="file" type="category" width={150} fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="changes" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[entry.category as keyof typeof COLORS]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Bug Hotspot Analysis</span>
            </div>
            {chartData.slice(0, 3).map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-sm font-medium">{file.file}</p>
                    <p className="text-xs text-muted-foreground">
                      {file.changes} changes detected
                    </p>
                  </div>
                </div>
                <Badge
                  variant={
                    file.bugRisk === 'High' ? 'destructive' : 'secondary'
                  }
                >
                  {file.bugRisk} Risk
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
