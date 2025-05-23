import {
  formatDateByPeriod,
  generateDateRange,
  getColorShade,
  createTooltipText,
} from '../../src/utils/dateUtils';

describe('dateUtils', () => {
  describe('formatDateByPeriod', () => {
    test('formats dates for each period', () => {
      const date = new Date('2023-04-15T12:00:00Z');
      expect(formatDateByPeriod(date, 'day')).toMatch('Apr');
      expect(formatDateByPeriod(date, 'month')).toBe('April 2023');
      expect(formatDateByPeriod(date, 'year')).toBe('2023');

      const week = formatDateByPeriod(date, 'week');
      expect(week).toMatch('Apr');
      expect(week).toMatch('2023');
    });
  });

  describe('generateDateRange', () => {
    test('creates a range for days', () => {
      const start = new Date('2023-01-01');
      const end = new Date('2023-01-03');
      const range = generateDateRange(start, end, 'day');
      expect(range).toHaveLength(3);
      expect(range[0]).toContain('Jan');
    });

    test('creates a range for months', () => {
      const start = new Date('2023-01-01');
      const end = new Date('2023-03-01');
      const range = generateDateRange(start, end, 'month');
      expect(range).toEqual(['January 2023', 'February 2023', 'March 2023']);
    });
  });

  describe('getColorShade', () => {
    test('returns correct shades depending on intensity', () => {
      expect(getColorShade(0, 10)).toBe('#ebedf0');
      expect(getColorShade(1, 5)).toBe('#40c463');
      expect(getColorShade(2, 5)).toBe('#30a14e');
      expect(getColorShade(3, 5)).toBe('#216e39');
      expect(getColorShade(4, 5)).toBe('#0d4620');
      expect(getColorShade(5, 5)).toBe('#0d4620');
    });
  });

  describe('createTooltipText', () => {
    test('formats tooltip text with authors', () => {
      const text = createTooltipText(2, 'Apr 10', ['Alice', 'Bob', 'Alice']);
      expect(text).toBe('2 commits on Apr 10 by 2 authors');
    });

    test('formats tooltip text without authors', () => {
      const text = createTooltipText(1, 'Apr 10');
      expect(text).toBe('1 commit on Apr 10');
    });
  });
});
test('generate weekly and yearly ranges', () => {
  const startWeek = new Date('2023-04-02');
  const endWeek = new Date('2023-04-16');
  const weekRange = generateDateRange(startWeek, endWeek, 'week');
  expect(weekRange.length).toBe(3);

  const startYear = new Date('2021-01-01');
  const endYear = new Date('2023-12-31');
  const yearRange = generateDateRange(startYear, endYear, 'year');
  expect(yearRange).toEqual(['2021', '2022', '2023']);
});

test('createTooltipText single author', () => {
  const text = createTooltipText(3, 'Apr', ['Alice']);
  expect(text).toBe('3 commits on Apr by Alice');
});
