import { useMemo } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { Commit, CommitHeatmapData } from '@gitray/shared-types';

interface CommitHeatmapProps {
  commits?: Commit[];
  heatmapData?: CommitHeatmapData;
}

// Generate mock data for the last 12 months (fallback when no real data)
function generateMockHeatmapData() {
  const data = [];
  const today = new Date();

  for (let i = 365; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    // Generate realistic commit patterns (more during weekdays, less on weekends)
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const baseCount = isWeekend ? Math.random() * 3 : Math.random() * 15;
    const count = Math.floor(baseCount);

    data.push({
      date: date.toISOString().split('T')[0],
      count,
    });
  }

  return data;
}

// Convert commits to heatmap data format
function convertCommitsToHeatmapData(
  commits: Commit[]
): Array<{ date: string; count: number }> {
  const commitsByDate = new Map<string, number>();

  // Count commits per day
  commits.forEach((commit) => {
    const dateStr = commit.date.split('T')[0]; // Get YYYY-MM-DD format
    commitsByDate.set(dateStr, (commitsByDate.get(dateStr) || 0) + 1);
  });

  // Generate data for last 365 days, filling gaps with 0
  const data = [];
  const today = new Date();

  for (let i = 365; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    data.push({
      date: dateStr,
      count: commitsByDate.get(dateStr) || 0,
    });
  }

  return data;
}

export function CommitHeatmap({ commits }: CommitHeatmapProps) {
  // Use real data if available, otherwise fall back to mock data
  const data = useMemo(() => {
    if (commits && commits.length > 0) {
      return convertCommitsToHeatmapData(commits);
    }
    return generateMockHeatmapData();
  }, [commits]);

  // Get intensity color based on count
  const getColor = (count: number) => {
    if (count === 0) return 'bg-muted/30';
    if (count < 3) return 'bg-primary/20';
    if (count < 6) return 'bg-primary/40';
    if (count < 9) return 'bg-primary/60';
    if (count < 12) return 'bg-primary/80';
    return 'bg-primary';
  };

  // Group data by weeks
  const weeks: Array<Array<{ date: string; count: number }>> = [];
  let currentWeek: Array<{ date: string; count: number }> = [];

  data.forEach((day, index) => {
    const dayOfWeek = new Date(day.date).getDay();

    if (dayOfWeek === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }

    currentWeek.push(day);

    if (index === data.length - 1 && currentWeek.length > 0) {
      weeks.push(currentWeek);
    }
  });

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-base md:text-lg">Commit Activity</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Less</span>
          <div className="flex gap-1">
            <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-sm bg-muted/30" />
            <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-sm bg-primary/20" />
            <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-sm bg-primary/40" />
            <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-sm bg-primary/60" />
            <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-sm bg-primary" />
          </div>
          <span className="hidden sm:inline">More</span>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="inline-flex gap-1">
          <div className="flex flex-col gap-1 pr-2 text-xs text-muted-foreground">
            <div className="h-3" />
            {days.map((day, i) => (
              <div key={day} className="h-3 leading-3">
                {i % 2 === 1 ? day : ''}
              </div>
            ))}
          </div>

          <TooltipProvider>
            <div className="flex gap-1">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-1">
                  {weekIndex % 4 === 0 && (
                    <div className="h-3 text-xs text-muted-foreground leading-3">
                      {months[new Date(week[0].date).getMonth()]}
                    </div>
                  )}
                  {weekIndex % 4 !== 0 && <div className="h-3" />}
                  {week.map((day) => (
                    <Tooltip key={day.date}>
                      <TooltipTrigger asChild>
                        <div
                          className={`h-3 w-3 rounded-sm ${getColor(day.count)} transition-all hover:ring-2 hover:ring-primary cursor-pointer`}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {day.count} {day.count === 1 ? 'commit' : 'commits'}{' '}
                          on {new Date(day.date).toLocaleDateString()}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              ))}
            </div>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
