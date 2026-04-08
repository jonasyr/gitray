import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import type {
  ValueType,
  NameType,
} from 'recharts/types/component/DefaultTooltipContent';
import { Commit } from '@gitray/shared-types';

interface ActivityChartProps {
  commits?: Commit[];
}

// Generate activity data from commits for the last 30 days
function generateActivityData(commits: Commit[]) {
  const data = [];
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 29);

  // Create a map of date -> commit count
  const commitsByDate = new Map<string, number>();

  const toLocalDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Filter commits from last 30 days and count by date
  commits.forEach((commit) => {
    const commitDate = new Date(commit.date);
    if (commitDate >= thirtyDaysAgo && commitDate <= today) {
      const dateKey = toLocalDateKey(commitDate);
      commitsByDate.set(dateKey, (commitsByDate.get(dateKey) || 0) + 1);
    }
  });

  // Generate data for each day in the last 30 days
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateKey = toLocalDateKey(date);

    data.push({
      date: date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      commits: commitsByDate.get(dateKey) || 0,
    });
  }

  return data;
}

export function ActivityChartTooltip({
  active,
  payload,
}: TooltipProps<ValueType, NameType>) {
  if (active && payload?.length) {
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm">{payload[0].payload.date}</p>
        <p className="text-sm font-semibold text-primary">
          {payload[0].value} commits
        </p>
      </div>
    );
  }
  return null;
}

export function ActivityChart({ commits = [] }: Readonly<ActivityChartProps>) {
  const data = generateActivityData(commits);
  return (
    <div className="h-[280px] w-full -mb-6">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorCommits" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#5B9A8B" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#5B9A8B" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-border"
            opacity={0.3}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            tickLine={false}
            className="text-muted-foreground"
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickLine={false}
            className="text-muted-foreground"
            width={30}
          />
          <Tooltip content={ActivityChartTooltip} />
          <Area
            type="monotone"
            dataKey="commits"
            stroke="#5B9A8B"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorCommits)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
