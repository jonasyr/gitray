import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';
import '../styles/heatmap.css';
import Select, {
  StylesConfig,
  GroupBase,
  ControlProps,
  CSSObjectWithLabel,
  OptionProps,
} from 'react-select';
import {
  CommitFilterOptions,
  CommitHeatmapData,
  Commit,
} from '@gitray/shared-types';
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

// add this below HeatmapValue
interface AuthorOption {
  value: string;
  label: string;
}

const customStyles: StylesConfig<
  AuthorOption,
  true,
  GroupBase<AuthorOption>
> = {
  control: (
    base: CSSObjectWithLabel,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _props: ControlProps<AuthorOption, true, GroupBase<AuthorOption>>
  ) => ({
    ...base,
    backgroundColor: '#1f2937', // Maintains dark background for the control
  }),
  placeholder: (base: CSSObjectWithLabel) => ({
    ...base,
    color: 'white', // Only placeholder text in white
  }),
  input: (base: CSSObjectWithLabel) => ({
    ...base,
    color: 'white', // Input text remains white
  }),
  menu: (base: CSSObjectWithLabel) => ({
    ...base,
    backgroundColor: '#1f2937', // Set dropdown menu background to dark
  }),
  option: (
    base: CSSObjectWithLabel,
    state: OptionProps<AuthorOption, true, GroupBase<AuthorOption>>
  ) => ({
    ...base,
    backgroundColor: state.isFocused ? '#374151' : '#1f2937',
    color: 'white',
    cursor: 'pointer',
  }),
  multiValue: (base: CSSObjectWithLabel) => ({
    ...base,
    backgroundColor: '#065f46',
    color: 'white',
  }),
  multiValueLabel: (base: CSSObjectWithLabel) => ({
    ...base,
    color: 'white',
  }),
  multiValueRemove: (base: CSSObjectWithLabel) => ({
    ...base,
    color: 'white',
    ':hover': {
      backgroundColor: '#064e3b',
      color: 'white',
    },
  }),
};

const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({
  repoUrl,
  commits,
}) => {
  const [filterOptions, setFilterOptions] = useState<CommitFilterOptions>({});
  const [data, setData] = useState<CommitHeatmapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // memoize start/end dates to avoid unstable deps
  const startDate = useMemo(
    () => new Date(Date.now() - 364 * 24 * 60 * 60 * 1000),
    []
  );
  const endDate = useMemo(() => new Date(), []);

  // Count commits per author in that range
  const authorCommitCounts = useMemo(() => {
    const counts = new Map<string, number>();
    commits.forEach((c) => {
      const d = new Date(c.date);
      if (d >= startDate && d <= endDate) {
        counts.set(c.authorName, (counts.get(c.authorName) || 0) + 1);
      }
    });
    return counts;
  }, [commits, startDate, endDate]);

  // Build dropdown options including the count
  const authorOptions = useMemo(
    () =>
      Array.from(new Set(commits.map((c) => c.authorName))).map((a) => ({
        value: a,
        label: `${a} (${authorCommitCounts.get(a) || 0})`,
      })),
    [commits, authorCommitCounts]
  );

  // Calculate dynamic cell size based on container width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        setContainerWidth(width);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Calculate cell size dynamically
  // We have 53 weeks (columns) + some padding
  // Formula: (containerWidth - padding) / (weeks + gaps)
  const cellSize = useMemo(() => {
    if (containerWidth === 0) return 12; // Default size
    const padding = 40; // Space for labels
    const weeks = 53;
    const gutterSize = 2;
    const availableWidth = containerWidth - padding;
    const calculatedSize = Math.floor(
      (availableWidth - weeks * gutterSize) / weeks
    );
    // Limit the size to reasonable bounds
    return Math.min(Math.max(calculatedSize, 8), 20);
  }, [containerWidth]);

  // Helper to compare author arrays
  const isFilterOptionsEqual = (
    a: CommitFilterOptions,
    b: CommitFilterOptions
  ) => {
    const A = a.authors ?? [];
    const B = b.authors ?? [];
    if (A.length !== B.length) return false;
    const sortedA = [...A].sort();
    const sortedB = [...B].sort();
    return sortedA.every((v, i) => v === sortedB[i]);
  };

  // Ref to hold last‐used filters
  const prevFilters = useRef<CommitFilterOptions>({ authors: [] });

  const fetchData = useCallback(async () => {
    if (!repoUrl) return;
    setLoading(true);
    try {
      const d = await getHeatmapData(repoUrl, 'day', filterOptions);
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [repoUrl, filterOptions]);

  // Only call fetchData when filters changed
  const handleMenuClose = () => {
    if (!isFilterOptionsEqual(filterOptions, prevFilters.current)) {
      fetchData();
      prevFilters.current = filterOptions;
    }
  };

  // initial fetch on repoUrl change
  useEffect(() => {
    fetchData().catch(console.error);
  }, [fetchData]);

  const values: HeatmapValue[] = data
    ? data.data.map((b) => ({
        date: b.periodStart,
        count: b.commitCount,
        authors: b.authors,
      }))
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

  return (
    <div className="w-full bg-gray-800 rounded-lg shadow-lg">
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-6 text-white">
          Repository Activity
        </h2>

        {/* Author selector with proper spacing */}
        <div className="mb-8 relative">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Filter by Authors
          </label>
          <Select
            isMulti
            options={authorOptions}
            className="w-full max-w-md text-sm"
            closeMenuOnSelect={false}
            onMenuClose={handleMenuClose}
            styles={customStyles}
            value={
              filterOptions.authors?.map((a) => ({ value: a, label: a })) ?? []
            }
            onChange={(vals) =>
              setFilterOptions({
                ...filterOptions,
                authors: vals.map((v) => v.value),
              })
            }
            placeholder="Select author(s) to filter..."
          />
          {loading && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <div className="animate-spin h-5 w-5 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
          )}
        </div>
        <br></br>
        {/* Heatmap container with dynamic sizing */}
        <div ref={containerRef} className="w-full overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <span className="text-white text-lg">Loading commits...</span>
            </div>
          ) : (
            <div className="min-w-fit">
              <CalendarHeatmap
                startDate={startDate}
                endDate={endDate}
                values={values}
                showWeekdayLabels
                cellSize={cellSize}
                gutterSize={2}
                classForValue={classForValue as (v?: HeatmapValue) => string}
                titleForValue={
                  titleForValue as (v?: HeatmapValue) => string | null
                }
                onClick={(v: HeatmapValue | undefined) =>
                  v &&
                  window.open(`${repoUrl}/commits?until=${v.date}`, '_blank')
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityHeatmap;
