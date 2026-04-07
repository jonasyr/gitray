import { describe, test, expect } from 'vitest';
import { cn } from '../../../src/components/ui/utils';

describe('UI Utilities', () => {
  describe('cn()', () => {
    test('should merge standard classes', () => {
      // Arrange
      const class1 = 'text-red-500';
      const class2 = 'bg-blue-500';

      // Act
      const result = cn(class1, class2);

      // Assert
      expect(result).toBe('text-red-500 bg-blue-500');
    });

    test('should resolve tailwind conflicts', () => {
      // Arrange
      const baseClass = 'p-4 m-2 text-black';
      const overrideClass = 'p-2 text-white';

      // Act
      const result = cn(baseClass, overrideClass);

      // Assert
      // Expected tailwind-merge to override previous padding/text classes
      expect(result).toBe('m-2 p-2 text-white');
    });

    test('should handle conditional classes properly', () => {
      // Arrange
      const isRed = true;
      const isBlue = false;

      // Act
      const result = cn('base-class', {
        'text-red-500': isRed,
        'text-blue-500': isBlue,
      });

      // Assert
      expect(result).toBe('base-class text-red-500');
    });

    test('should handle array inputs', () => {
      // Arrange
      const classArray = ['flex', 'flex-col', 'items-center'];

      // Act
      const result = cn(classArray, 'justify-center');

      // Assert
      expect(result).toBe('flex flex-col items-center justify-center');
    });

    test('should handle null and undefined', () => {
      // Arrange
      const inputs = ['btn', null, undefined, 'active'];

      // Act
      const result = cn(inputs);

      // Assert
      expect(result).toBe('btn active');
    });
  });
});
