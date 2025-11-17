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

// Displays a calendar-style heatmap of commit activity with optional filters
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
  TIME,
} from '@gitray/shared-types';
import { getHeatmapData } from '../services/api';
import RiveLoader from './RiveLoader';

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
  count?: number;
}

const customStyles: StylesConfig<
  AuthorOption,
  true,
  GroupBase<AuthorOption>
> = {
  control: (
    base: CSSObjectWithLabel,
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

/**
 * Component that renders a calendar-style heatmap of commit activity.
 * Users can filter by author and the heatmap dynamically adjusts to the
 * container size.
 */
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
  const startDate = useMemo(() => new Date(Date.now() - TIME.DAY * 364), []);
  const endDate = useMemo(() => new Date(), []);

  // Count commits per author in that range
  const authorCommitCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const commit of commits) {
      const commitDate = new Date(commit.date);
      if (commitDate >= startDate && commitDate <= endDate) {
        const previousCount = counts.get(commit.authorName) ?? 0;
        counts.set(commit.authorName, previousCount + 1);
      }
    }
    return counts;
  }, [commits, startDate, endDate]);

  // Build dropdown options including the count and sort by commit count
  const authorOptions = useMemo(
    () =>
      Array.from(new Set(commits.map((c) => c.authorName)))
        .map((a) => ({
          value: a,
          label: `${a} (${authorCommitCounts.get(a) ?? 0})`,
          count: authorCommitCounts.get(a) ?? 0,
        }))
        .sort((a, b) => b.count - a.count),
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
  const compareAuthorArrays = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort((x, y) => x.localeCompare(y));
    const sortedB = [...b].sort((x, y) => x.localeCompare(y));
    return sortedA.every((v, i) => v === sortedB[i]);
  };

  const isFilterOptionsEqual = (
    a: CommitFilterOptions,
    b: CommitFilterOptions
  ) => {
    const A = a.authors ?? [];
    const B = b.authors ?? [];
    return compareAuthorArrays(A, B);
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

  const titleForValue = (v?: HeatmapValue) => {
    if (!v) return null;
    const plural = v.count === 1 ? '' : 's';
    return `${v.count} commit${plural} on ${v.date}`;
  };

  return (
    <div className="w-full bg-gray-800 rounded-lg shadow-lg">
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-6 text-white">
          Repository Activity
        </h2>

        {/* Author selector with proper spacing */}
        <div className="mb-8 relative">
          <label
            htmlFor="author-filter"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            Filter by Authors
          </label>
          <Select
            inputId="author-filter"
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
              <RiveLoader size={20} className="" />
            </div>
          )}
        </div>
        <br></br>
        {/* Heatmap container with dynamic sizing */}
        <div ref={containerRef} className="w-full overflow-x-auto">
          {loading ? (
            <RiveLoader
              size={80}
              message="Loading heatmap data..."
              className="h-40 flex justify-center items-center"
            />
          ) : (
            <div className="min-w-fit">
              <CalendarHeatmap
                startDate={startDate}
                endDate={endDate}
                values={values}
                showWeekdayLabels
                cellSize={cellSize}
                gutterSize={2}
                classForValue={classForValue as (_v?: HeatmapValue) => string}
                titleForValue={
                  titleForValue as (_v?: HeatmapValue) => string | null
                }
                onClick={(_v: HeatmapValue | undefined) =>
                  _v &&
                  window.open(`${repoUrl}/commits?until=${_v.date}`, '_blank')
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
