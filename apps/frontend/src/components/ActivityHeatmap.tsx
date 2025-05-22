import React, { useEffect, useState } from 'react';
import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';
import '../styles/heatmap.css';
import { CommitFilterOptions, CommitHeatmapData } from '../../../../packages/shared-types/src';
import { getHeatmapData } from '../services/api';

interface ActivityHeatmapProps {
  repoUrl: string;
}

interface HeatmapValue {
  date: string;
  count: number;
  authors?: string[];
}

const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ repoUrl }) => {
  const [filterOptions, setFilterOptions] = useState<CommitFilterOptions>({});
  const [data, setData] = useState<CommitHeatmapData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!repoUrl) return;
    setLoading(true);
    try {
      const d = await getHeatmapData(repoUrl, 'day', filterOptions);
      setData(d);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData().catch(err => console.error(err));
  }, [repoUrl, filterOptions]);

  const values: HeatmapValue[] = data
    ? data.data.map(b => ({ date: b.periodStart, count: b.commitCount, authors: b.authors }))
    : [];
  const max = data?.metadata?.maxCommitCount || 0;

  const classForValue = (v?: HeatmapValue) => {
    if (!v) return 'color-empty';
    const step = max / 4 || 1;
    const level = Math.min(4, Math.ceil(v.count / step));
    return `color-scale-${level}`;
  };

  const tooltipDataAttrs = (v?: HeatmapValue) =>
    v ? { 'data-tip': `${v.count} commits on ${v.date}` } : null;

  const startDate = new Date(Date.now() - 364 * 24 * 60 * 60 * 1000);
  const endDate = new Date();

  return (
    <div className="w-full">
      <h2 className="text-xl font-bold mb-2">Repository Activity</h2>
      <div className="flex space-x-2 mb-4">
        <input
          type="text"
          placeholder="Author"
          className="px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded"
          value={filterOptions.author || ''}
          onChange={e => setFilterOptions({ ...filterOptions, author: e.target.value || undefined })}
        />
      </div>
      {loading ? (
        <div className="text-center">Loading...</div>
      ) : (
        <>
          <CalendarHeatmap
            startDate={startDate}
            endDate={endDate}
            values={values}
            showWeekdayLabels
            classForValue={classForValue}
            tooltipDataAttrs={tooltipDataAttrs}
            onClick={(v: HeatmapValue | undefined) =>
              v && window.open(`${repoUrl}/commits?until=${v.date}`, '_blank')}
          />
          <div className="flex items-center text-xs mt-2 space-x-1 justify-end">
            <span>Less</span>
            <div className="w-3 h-3 color-empty" />
            {[1, 2, 3, 4].map(l => (
              <div key={l} className={`w-3 h-3 color-scale-${l}`} />
            ))}
            <span>More</span>
          </div>
        </>
      )}
    </div>
  );
};

export default ActivityHeatmap;
