/**
 * Utility functions for working with dates in the heatmap visualization
 */

import { TimePeriod } from '../../../../packages/shared-types/src';

/**
 * Formats a date according to the specified time period
 * @param date The date to format
 * @param timePeriod The time period format
 * @returns Formatted date string
 */
export const formatDateByPeriod = (date: Date, timePeriod: TimePeriod): string => {
  switch (timePeriod) {
    case 'day':
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    case 'week':
      // Get start of the week
      const startOfWeek = new Date(date);
      const dayOfWeek = date.getDay();
      startOfWeek.setDate(date.getDate() - dayOfWeek);
      
      // Get end of the week
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      // Format as "Apr 1 - Apr 7, 2023"
      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${
        endOfWeek.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        })
      }`;
    case 'month':
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    case 'year':
      return date.toLocaleDateString('en-US', { year: 'numeric' });
    default:
      return date.toLocaleDateString();
  }
};

/**
 * Generates a range of dates for the given time period
 * @param startDate Start of the range
 * @param endDate End of the range
 * @param timePeriod The time period to use
 * @returns Array of date strings formatted according to the time period
 */
export const generateDateRange = (
  startDate: Date, 
  endDate: Date, 
  timePeriod: TimePeriod
): string[] => {
  const dates: string[] = [];
  const currentDate = new Date(startDate);
  
  // Ensure dates are at the start of their respective periods
  switch (timePeriod) {
    case 'day':
      // No adjustment needed for days
      break;
    case 'week':
      // Set to start of week (Sunday)
      const dayOfWeek = currentDate.getDay();
      currentDate.setDate(currentDate.getDate() - dayOfWeek);
      break;
    case 'month':
      // Set to first day of month
      currentDate.setDate(1);
      break;
    case 'year':
      // Set to first day of year
      currentDate.setMonth(0, 1);
      break;
  }
  
  // Generate the date range
  while (currentDate <= endDate) {
    dates.push(formatDateByPeriod(new Date(currentDate), timePeriod));
    
    // Move to the next period
    switch (timePeriod) {
      case 'day':
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case 'week':
        currentDate.setDate(currentDate.getDate() + 7);
        break;
      case 'month':
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      case 'year':
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        break;
    }
  }
  
  return dates;
};

/**
 * Gets a color shade based on commit count relative to the maximum
 * @param commitCount Number of commits
 * @param maxCommitCount Maximum number of commits in the dataset
 * @returns CSS color value in the green spectrum
 */
export const getColorShade = (commitCount: number, maxCommitCount: number): string => {
  if (commitCount === 0) return '#ebedf0'; // Light gray for no commits
  
  // Calculate intensity (0-1)
  const intensity = Math.min(commitCount / maxCommitCount, 1);
  
  // Use a green color spectrum with 5 intensity levels
  if (intensity < 0.2) return '#9be9a8'; // Lightest green
  if (intensity < 0.4) return '#40c463'; 
  if (intensity < 0.6) return '#30a14e';
  if (intensity < 0.8) return '#216e39';
  return '#0d4620'; // Darkest green
};

/**
 * Creates a tooltip text for a heatmap cell
 * @param commitCount Number of commits
 * @param periodText The text describing the time period
 * @param authors Optional array of author names
 * @returns Formatted tooltip text
 */
export const createTooltipText = (
  commitCount: number, 
  periodText: string, 
  authors?: string[]
): string => {
  const commitText = commitCount === 1 ? '1 commit' : `${commitCount} commits`;
  let tooltip = `${commitText} on ${periodText}`;
  
  if (authors && authors.length > 0) {
    const uniqueAuthors = [...new Set(authors)];
    const authorText = uniqueAuthors.length === 1 
      ? `by ${uniqueAuthors[0]}` 
      : `by ${uniqueAuthors.length} authors`;
    
    tooltip += ` ${authorText}`;
  }
  
  return tooltip;
};