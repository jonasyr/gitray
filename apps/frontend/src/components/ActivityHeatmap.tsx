import React, { useEffect, useState } from 'react';
import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';
import { TimePeriod, CommitAggregation, CommitFilterOptions, CommitHeatmapData } from '../../../../packages/shared-types/src';
import { getHeatmapData } from '../services/api';
import { formatDateByPeriod } from '../utils/dateUtils';

interface ActivityHeatmapProps {
  repoUrl: string;
  initialTimePeriod?: TimePeriod;
  heatmapData?: CommitHeatmapData;
}

interface HeatmapValue {
  date: string;
  count: number;
  authors?: string[];
}

const periodToRange = (period: TimePeriod): { start: Date; end: Date } => {
  const end = new Date();
  const start = new Date();
  switch (period) {
    case 'day':
      start.setDate(end.getDate() - 364);
      break;
    case 'week':
      start.setDate(end.getDate() - 364); // 52 weeks
      break;
    case 'month':
      start.setMonth(end.getMonth() - 11);
      break;
    case 'year':
      start.setFullYear(end.getFullYear() - 4); // last 5 years
      break;
  }
  return { start, end };
};

const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ repoUrl, initialTimePeriod = 'day', heatmapData }) => {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(initialTimePeriod);
  const [filterOptions, setFilterOptions] = useState<CommitFilterOptions>({});
  const [values, setValues] = useState<HeatmapValue[]>([]);

  const convert = (data: CommitHeatmapData) => {
    const expanded: HeatmapValue[] = [];
    data.data.forEach((d: CommitAggregation) => {
      const start = new Date(d.periodStart);
      if (timePeriod === 'day') {
        expanded.push({ date: d.periodStart, count: d.commitCount, authors: d.authors });
      } else if (timePeriod === 'week') {
        for (let i = 0; i < 7; i++) {
          const dt = new Date(start);
          dt.setDate(start.getDate() + i);
          expanded.push({ date: dt.toISOString().split('T')[0], count: d.commitCount, authors: d.authors });
        }
      } else if (timePeriod === 'month') {
        const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
        for (let i = 0; i < days; i++) {
          const dt = new Date(start);
          dt.setDate(start.getDate() + i);
          expanded.push({ date: dt.toISOString().split('T')[0], count: d.commitCount, authors: d.authors });
        }
      } else if (timePeriod === 'year') {
        const end = new Date(start.getFullYear() + 1, 0, 0);
        for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
          expanded.push({ date: dt.toISOString().split('T')[0], count: d.commitCount, authors: d.authors });
        }
      }
    });
    return expanded;
  };

  const fetchData = async () => {
    if (!repoUrl) return;
    const data = heatmapData ?? await getHeatmapData(repoUrl, timePeriod, filterOptions);
    setValues(convert(data));
  };

  useEffect(() => {
    fetchData().catch(err => console.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoUrl, timePeriod, filterOptions, heatmapData]);

  const { start, end } = periodToRange(timePeriod);

  const classForValue = (value: HeatmapValue | undefined) => {
    if (!value || value.count === 0) return 'color-empty';
    const level = Math.min(4, Math.ceil(value.count / 5));
    return `color-scale-${level}`;
  };

  const tooltipDataAttrs = (value: HeatmapValue | undefined) => {
    if (!value) return null;
    const formatted = formatDateByPeriod(new Date(value.date), timePeriod);
    const authorText = value.authors?.join(', ');
    return {
      'data-tip': `${value.count} commits on ${formatted}${authorText ? ' by ' + authorText : ''}`,
    };
  };

  const handleCellClick = (value: HeatmapValue) => {
    if (!value) return;
    if (timePeriod !== 'day') {
      setFilterOptions({
        ...filterOptions,
        fromDate: value.date,
        toDate: value.date,
      });
      setTimePeriod('day');
    }
  };

  return (
    <div className="w-full">
      <h2 className="text-xl font-bold mb-2">Repository Activity</h2>
      <div className="flex space-x-2 mb-4">
        {(['day', 'week', 'month', 'year'] as TimePeriod[]).map(p => (
          <button
            key={p}
            className={`px-2 py-1 rounded text-sm ${timePeriod === p ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            onClick={() => {
              setFilterOptions({});
              setTimePeriod(p);
            }}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex space-x-2 mb-4">
        <input
          type="text"
          placeholder="Author"
          className="px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded"
          value={filterOptions.author || ''}
          onChange={e => setFilterOptions({ ...filterOptions, author: e.target.value || undefined })}
        />
        <input
          type="text"
          placeholder="File type"
          className="px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded"
          value={filterOptions.fileExtension || ''}
          onChange={e => setFilterOptions({ ...filterOptions, fileExtension: e.target.value || undefined })}
        />
      </div>

      <CalendarHeatmap
        startDate={start}
        endDate={end}
        values={values}
        classForValue={classForValue}
        tooltipDataAttrs={tooltipDataAttrs}
        onClick={handleCellClick}
      />
      <div className="flex items-center text-xs mt-2 space-x-1">
        <span>Less</span>
        <div className="w-3 h-3 bg-color-empty" />
        {[1,2,3,4].map(l => (
          <div key={l} className={`w-3 h-3 color-scale-${l}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
};

export default ActivityHeatmap;
