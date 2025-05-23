import React, { useEffect, useState, useMemo } from 'react';
import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';
import '../styles/heatmap.css';
import Select from 'react-select';
import { CommitFilterOptions, CommitHeatmapData, Commit } from '../../../../packages/shared-types/src';
import { getHeatmapData } from '../services/api';

interface ActivityHeatmapProps {
  repoUrl: string;
  commits: Commit[];
}

interface HeatmapValue {
  date: string;
  count: number;
  authors?: string[];
}

const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ repoUrl, commits }) => {
  const [filterOptions, setFilterOptions] = useState<CommitFilterOptions>({});
  const [data, setData] = useState<CommitHeatmapData | null>(null);
  const [loading, setLoading] = useState(false);

  const authorOptions = useMemo(
    () =>
      Array.from(new Set(commits.map(c => c.authorName))).map(a => ({
        value: a,
        label: a,
      })),
    [commits]
  );

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
    fetchData().catch(console.error);
  }, [repoUrl]);

  const values: HeatmapValue[] = data
    ? data.data.map(b => ({ date: b.periodStart, count: b.commitCount, authors: b.authors }))
    : [];
  const max = data?.metadata?.maxCommitCount ?? 0;

  const classForValue = (v?: HeatmapValue) => {
    if (!v) return 'color-empty';
    const step = max / 4 || 1;
    const level = Math.min(4, Math.ceil(v.count / step));
    return `color-scale-${level}`;
  };

  const titleForValue = (v?: HeatmapValue) =>
    v ? `${v.count} commit${v.count === 1 ? '' : 's'} on ${v.date}` : null;

  const startDate = new Date(Date.now() - 364 * 24 * 60 * 60 * 1000);
  const endDate = new Date();

  return (
    <div className="w-full p-4 bg-gray-800 rounded-md">
      <h2 className="text-xl font-bold mb-3">Repository Activity</h2>

      {/* author selector & trigger fetch on close */}
      <div className="flex items-center mb-100">
        <Select
          isMulti
          options={authorOptions}
          className="min-w-[150px] text-sm"
          closeMenuOnSelect={false}
          onMenuClose={fetchData}
          styles={{
            control: base => ({
              ...base,
              backgroundColor: '#1f2937', // gray-800
              borderColor: '#374151', // gray-700
            }),
            menu: base => ({ ...base, backgroundColor: '#1f2937', color: 'white' }),
            option: (base, state) => ({
              ...base,
              backgroundColor: state.isSelected
                ? '#10b981'
                : state.isFocused
                ? '#374151'
                : '#1f2937',
              color: 'white',
              cursor: 'pointer',
            }),
            multiValue: base => ({ ...base, backgroundColor: '#065f46', color: 'white' }),
            multiValueLabel: base => ({ ...base, color: 'white' }),
            multiValueRemove: base => ({
              ...base,
              color: 'white',
              ':hover': { backgroundColor: '#064e3b', color: 'white' },
            }),
          }}
          value={
            filterOptions.authors?.map(a => ({ value: a, label: a })) ?? []
          }
          onChange={vals =>
            setFilterOptions({
              ...filterOptions,
              authors: vals.map(v => v.value),
            })
          }
          placeholder="Author(s)"
          
        />
      </div>

      {loading ? (
        <div className="text-center">Loading...</div>
      ) : (
        <>
          {/* now a real MT and no CSS scale */}
          <div className="mx-auto mt-8">
            <CalendarHeatmap
              startDate={startDate}
              endDate={endDate}
              values={values}
              showWeekdayLabels
              cellSize={60} // ↑ bump this up instead of using CSS scale
              gutterSize={3}
              classForValue={classForValue as (v?: HeatmapValue) => string}
              titleForValue={titleForValue as (v?: HeatmapValue) => string | null}
              onClick={(v: HeatmapValue | undefined) =>
                v && window.open(`${repoUrl}/commits?until=${v.date}`, '_blank')
              }
            />
          </div>
          <div className="flex items-center text-xs mt-2 space-x-1 justify-end">
            <span>Less</span>
            <div className="w-3 h-3 color-empty" />
            {[1, 2, 3, 4].map((l: number) => (
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
