import { describe, test, expect } from 'vitest';
import {
  formatDateByPeriod,
  generateDateRange,
  getColorShade,
  createTooltipText,
} from '../../src/utils/dateUtils';

describe('dateUtils', () => {
  describe('formatDateByPeriod', () => {
    test('formats dates for each period', () => {
      // Arrange
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
      // Arrange
      const start = new Date('2023-01-01');
      const end = new Date('2023-01-03');

      // Act
      const range = generateDateRange(start, end, 'day');

      // Assert
      expect(range).toHaveLength(3);
      expect(range[0]).toContain('Jan');
    });

    test('creates a range for months', () => {
      // Arrange
      const start = new Date('2023-01-01');
      const end = new Date('2023-03-01');

      // Act
      const range = generateDateRange(start, end, 'month');

      // Assert
      expect(range).toEqual(['January 2023', 'February 2023', 'March 2023']);
    });
  });

  describe('getColorShade', () => {
    test('returns correct shades depending on intensity', () => {
      // Act & Assert
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
      // Act
      const text = createTooltipText(2, 'Apr 10', ['Alice', 'Bob', 'Alice']);

      // Assert
      expect(text).toBe('2 commits on Apr 10 by 2 authors');
    });

    test('formats tooltip text without authors', () => {
      // Act
      const text = createTooltipText(1, 'Apr 10');

      // Assert
      expect(text).toBe('1 commit on Apr 10');
    });
  });
});
test('generate weekly and yearly ranges', () => {
  // Arrange
  const startWeek = new Date('2023-04-02');
  const endWeek = new Date('2023-04-16');

  // Act
  const weekRange = generateDateRange(startWeek, endWeek, 'week');

  // Assert
  expect(weekRange.length).toBe(3);

  // Arrange
  const startYear = new Date('2021-01-01');
  const endYear = new Date('2023-12-31');

  // Act
  const yearRange = generateDateRange(startYear, endYear, 'year');

  // Assert
  expect(yearRange).toEqual(['2021', '2022', '2023']);
});

test('createTooltipText single author', () => {
  // Act
  const text = createTooltipText(3, 'Apr', ['Alice']);

  // Assert
  expect(text).toBe('3 commits on Apr by Alice');
});
