import { useMemo } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { Calendar } from 'lucide-react';
import { Commit, CommitHeatmapData } from '@gitray/shared-types';

interface CommitHeatmapProps {
  commits?: Commit[];
  heatmapData?: CommitHeatmapData;
  /** Whether the heatmap data is valid and complete */
  isValidHeatmap?: boolean;
  /** Number of months to display (3, 6, or 12) */
  monthsToShow?: 3 | 6 | 12;
}

export function CommitHeatmap({
  commits,
  heatmapData,
  isValidHeatmap = true,
  monthsToShow = 12,
}: CommitHeatmapProps) {
  // Log warning if heatmap data is marked as invalid
  if (heatmapData && !isValidHeatmap) {
    console.warn('[CommitHeatmap] Heatmap data may be incomplete or invalid');
  }

  // Prefer heatmapData from API (contains ALL commits), fallback to computing from commits
  const data = useMemo(() => {
    // Create a map of commit data from the API
    const commitDataMap = new Map<string, number>();

    // First try to use the aggregated heatmap data from the API (preferred - has all data)
    if (heatmapData && heatmapData.data && heatmapData.data.length > 0) {
      heatmapData.data.forEach((bucket) => {
        const dateStr = bucket.periodStart.split('T')[0];
        commitDataMap.set(dateStr, bucket.commitCount);
      });
    }
    // Fallback: compute from commits if heatmapData is not available
    else if (commits && commits.length > 0) {
      commits.forEach((commit) => {
        const dateStr = commit.date.split('T')[0];
        commitDataMap.set(dateStr, (commitDataMap.get(dateStr) || 0) + 1);
      });
    }

    // Always generate a full 365-day grid, but only show commits within the selected time range
    const result = [];
    const today = new Date();
    const startDate = new Date();
    startDate.setMonth(today.getMonth() - monthsToShow);

    // Generate data for the last 365 days (full year for consistent layout)
    for (let i = 364; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      // Only show commit count if the date is within the selected time range
      const isInRange = date >= startDate && date <= today;
      const count = isInRange ? commitDataMap.get(dateStr) || 0 : 0;

      result.push({
        date: dateStr,
        count: count,
      });
    }

    return result;
  }, [commits, heatmapData, monthsToShow]);

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

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
        <p className="text-lg font-medium text-muted-foreground mb-2">
          No commit data available
        </p>
        <p className="text-sm text-muted-foreground">
          Commit activity heatmap could not be generated for this repository.
        </p>
      </div>
    );
  }

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
              {weeks.map((week, weekIndex) => {
                // Check if this week contains the first day of a new month
                const currentMonth = new Date(week[0].date).getMonth();
                const previousMonth =
                  weekIndex > 0
                    ? new Date(weeks[weekIndex - 1][0].date).getMonth()
                    : -1;
                const isNewMonth = currentMonth !== previousMonth;

                return (
                  <div key={weekIndex} className="flex flex-col gap-1">
                    {isNewMonth ? (
                      <div className="h-3 text-xs text-muted-foreground leading-3">
                        {months[currentMonth]}
                      </div>
                    ) : (
                      <div className="h-3" />
                    )}
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
                );
              })}
            </div>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
