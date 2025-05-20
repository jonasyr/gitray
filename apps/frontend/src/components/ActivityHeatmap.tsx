import React, { useState, useEffect } from 'react';
import { 
  CommitHeatmapData, 
  TimePeriod, 
  CommitFilterOptions, 
  CommitAggregation 
} from '../../../../packages/shared-types/src';
import { getHeatmapData } from '../services/api';
import { 
  formatDateByPeriod, 
  createTooltipText 
} from '../utils/dateUtils';

interface ActivityHeatmapProps {
  repoUrl: string;
  initialTimePeriod?: TimePeriod;
  initialFilterOptions?: CommitFilterOptions;
  // Option to use provided data instead of fetching
  heatmapData?: CommitHeatmapData;
}

const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({
  repoUrl,
  initialTimePeriod = 'day',
  initialFilterOptions,
  heatmapData: providedHeatmapData
}) => {
  // State
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [heatmapData, setHeatmapData] = useState<CommitHeatmapData | null>(providedHeatmapData || null);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(initialTimePeriod);
  const [filterOptions, setFilterOptions] = useState<CommitFilterOptions | undefined>(initialFilterOptions);
  const [hoveredCell, setHoveredCell] = useState<{ index: number; tooltipText: string } | null>(null);
  
  // Fetch data when repoUrl, timePeriod, or filterOptions change
  // Skip if data was provided through props
  useEffect(() => {
    if (!repoUrl || providedHeatmapData) return;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const data = await getHeatmapData(repoUrl, timePeriod, filterOptions);
        setHeatmapData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching heatmap data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [repoUrl, timePeriod, filterOptions, providedHeatmapData]);
  
  // Handle time period change
  const handleTimePeriodChange = (newPeriod: TimePeriod) => {
    setTimePeriod(newPeriod);
  };
  
  // Handle filter changes
  const handleAuthorFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const author = event.target.value;
    setFilterOptions(prev => ({
      ...prev,
      author: author || undefined // Use undefined if empty
    }));
  };
  
  // Handle date range filter changes
  const handleDateFilterChange = (
    type: 'fromDate' | 'toDate',
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const date = event.target.value;
    setFilterOptions(prev => ({
      ...prev,
      [type]: date || undefined // Use undefined if empty
    }));
  };
  
  // Render data cells
  const renderHeatmapCells = () => {
    if (!heatmapData || !heatmapData.data.length) {
      return <div className="text-gray-500">No data available</div>;
    }
    
    const maxCommitCount = heatmapData.metadata?.maxCommitCount || 0;
    
    // For Dark mode
    const getColorForDarkMode = (commitCount: number, maxCount: number) => {
      if (commitCount === 0) return '#333'; // Dark gray for no commits
      
      // Calculate intensity (0-1)
      const intensity = Math.min(commitCount / maxCount, 1);
      
      // Use a green color spectrum with 5 intensity levels
      if (intensity < 0.2) return '#0a3622'; // Darkest green
      if (intensity < 0.4) return '#0e6b33'; 
      if (intensity < 0.6) return '#14a851';
      if (intensity < 0.8) return '#30d979';
      return '#6bffb8'; // Lightest green
    };
    
    return (
      <div className="grid grid-cols-7 gap-2 mt-6 w-full md:grid-cols-10 lg:grid-cols-15">
        {heatmapData.data.map((period: CommitAggregation, index: number) => {
          const date = new Date(period.periodStart);
          const formattedDate = formatDateByPeriod(date, timePeriod);
          const tooltipText = createTooltipText(period.commitCount, formattedDate, period.authors);
          
          return (
            <div
              key={period.periodStart}
              className="relative w-6 h-6 rounded-sm cursor-pointer transition-colors duration-200 flex items-center justify-center group"
              style={{ 
                backgroundColor: getColorForDarkMode(period.commitCount, maxCommitCount),
                outline: '1px solid rgba(255, 255, 255, 0.1)' 
              }}
              onMouseEnter={() => setHoveredCell({ index, tooltipText })}
              onMouseLeave={() => setHoveredCell(null)}
            >
              {/* Tooltip */}
              {hoveredCell?.index === index && (
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  {hoveredCell.tooltipText}
                </div>
              )}
              
              {/* Show commit count for cells with commits */}
              {period.commitCount > 0 && (
                <span className="text-xs text-white opacity-80 group-hover:opacity-100">
                  {period.commitCount}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };
  
  return (
    <div className="w-full max-w-4xl bg-gray-900 p-6 rounded-lg shadow-lg text-white">
      <h2 className="text-xl font-bold mb-4">Repository Activity</h2>
      
      {/* Controls */}
      <div className="flex flex-col md:flex-row justify-between mb-6 gap-4">
        {/* Time period selection */}
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">Time Period:</span>
          <div className="flex space-x-1">
            {(['day', 'week', 'month', 'year'] as TimePeriod[]).map((period) => (
              <button
                key={period}
                className={`px-3 py-1 text-sm rounded ${
                  timePeriod === period
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                onClick={() => handleTimePeriodChange(period)}
              >
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </button>
            ))}
          </div>
        </div>
        
        {/* Filter options */}
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">Filter:</span>
          <input
            type="text"
            placeholder="Author"
            className="px-2 py-1 text-sm border border-gray-700 rounded bg-gray-800 text-white"
            value={filterOptions?.author || ''}
            onChange={handleAuthorFilterChange}
          />
          <input
            type="date"
            className="px-2 py-1 text-sm border border-gray-700 rounded bg-gray-800 text-white"
            value={filterOptions?.fromDate || ''}
            onChange={(e) => handleDateFilterChange('fromDate', e)}
          />
          <span className="text-xs">to</span>
          <input
            type="date"
            className="px-2 py-1 text-sm border border-gray-700 rounded bg-gray-800 text-white"
            value={filterOptions?.toDate || ''}
            onChange={(e) => handleDateFilterChange('toDate', e)}
          />
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex items-center space-x-1 mb-4">
        <span className="text-xs text-gray-400">Less</span>
        {[0, 1, 2, 3, 4].map((level) => {
          // For dark mode
          const getColor = (level: number) => {
            if (level === 0) return '#333';
            if (level === 1) return '#0a3622';
            if (level === 2) return '#0e6b33';
            if (level === 3) return '#14a851';
            if (level === 4) return '#6bffb8';
            return '#333';
          };
          
          return (
            <div
              key={level}
              className="w-4 h-4 rounded-sm"
              style={{ backgroundColor: getColor(level) }}
            />
          );
        })}
        <span className="text-xs text-gray-400">More</span>
      </div>
      
      {/* Loading state */}
      {loading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
          <span className="ml-2 text-gray-400">Loading activity data...</span>
        </div>
      )}
      
      {/* Error state */}
      {error && (
        <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded mb-4">
          <p className="font-bold">Error loading activity data</p>
          <p>{error}</p>
        </div>
      )}
      
      {/* Heatmap cells */}
      {!loading && !error && renderHeatmapCells()}
      
      {/* Metadata */}
      {heatmapData && heatmapData.metadata && (
        <div className="mt-4 text-sm text-gray-400">
          <p>
            Total commits: <span className="font-semibold text-white">{heatmapData.metadata.totalCommits}</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default ActivityHeatmap;