/**
 * Unit tests for cacheHelpers
 *
 * Coverage target: ≥80%
 * Testing strategy: AAA pattern (Arrange-Act-Assert)
 * Focus: Happy path first, then edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  safeCacheGet,
  handleTransactionError,
} from '../../../src/utils/cacheHelpers';
import type HybridLRUCache from '../../../src/utils/hybridLruCache';
import type { Logger } from 'winston';

// Mock metrics service
vi.mock('../../../src/services/metrics', () => ({
  recordDetailedError: vi.fn(),
  updateServiceHealthScore: vi.fn(),
}));

describe('cacheHelpers', () => {
  let mockCache: HybridLRUCache<any>;
  let mockLogger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCache = {
      get: vi.fn(),
    } as any;

    mockLogger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as any;
  });

  describe('safeCacheGet', () => {
    describe('Happy Path', () => {
      it('should return cached value when key exists', async () => {
        // ARRANGE
        const testData = { commits: [{ sha: 'abc123' }] };
        (mockCache.get as any).mockResolvedValue(testData);

        // ACT
        const result = await safeCacheGet(mockCache, 'test-key', mockLogger);

        // ASSERT
        expect(result).toEqual(testData);
        expect(mockCache.get).toHaveBeenCalledWith('test-key');
      });

      it('should return cached value when key exists', async () => {
        // ARRANGE
        const testData = { commits: [{ sha: 'abc123' }] };
        (mockCache.get as any).mockResolvedValue(testData);

        // ACT
        const result = await safeCacheGet(mockCache, 'test-key', mockLogger);

        // ASSERT
        expect(result).toEqual(testData);
        expect(mockCache.get).toHaveBeenCalledWith('test-key');
      });

      it('should return null when key does not exist (cache miss)', async () => {
        // ARRANGE
        (mockCache.get as any).mockResolvedValue(null);

        // ACT
        const result = await safeCacheGet(mockCache, 'missing-key', mockLogger);

        // ASSERT
        expect(result).toBeNull();
      });

      it('should work with different data types', async () => {
        // ARRANGE - Array
        const arrayData = ['item1', 'item2'];
        (mockCache.get as any).mockResolvedValue(arrayData);

        // ACT
        const result1 = await safeCacheGet(mockCache, 'array-key', mockLogger);

        // ASSERT
        expect(result1).toEqual(arrayData);

        // ARRANGE - String
        (mockCache.get as any).mockResolvedValue('simple string');

        // ACT
        const result2 = await safeCacheGet(mockCache, 'string-key', mockLogger);

        // ASSERT
        expect(result2).toBe('simple string');
      });
    });

    describe('Error Handling', () => {
      it('should return null and log error when cache.get throws Error', async () => {
        // ARRANGE
        const error = new Error('Cache read error');
        (mockCache.get as any).mockRejectedValue(error);

        // ACT
        const result = await safeCacheGet(mockCache, 'error-key', mockLogger, {
          operation: 'get',
          key: 'error-key',
          repoUrl: 'https://github.com/test/repo',
        });

        // ASSERT
        expect(result).toBeNull();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Cache operation failed',
          expect.objectContaining({
            operation: 'get',
            key: 'error-key',
            repoUrl: 'https://github.com/test/repo',
            error: 'Cache read error',
          })
        );
      });

      it('should handle non-Error exceptions (string)', async () => {
        // ARRANGE
        (mockCache.get as any).mockRejectedValue('String error');

        // ACT
        const result = await safeCacheGet(mockCache, 'test-key', mockLogger);

        // ASSERT
        expect(result).toBeNull();
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Cache operation failed',
          expect.objectContaining({
            error: 'String error',
          })
        );
      });

      it('should use provided context for error logging', async () => {
        // ARRANGE
        (mockCache.get as any).mockRejectedValue(new Error('Test error'));

        // ACT
        await safeCacheGet(mockCache, 'key1', mockLogger, {
          operation: 'custom-op',
          key: 'custom-key',
          repoUrl: 'https://github.com/custom/repo',
        });

        // ASSERT
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Cache operation failed',
          expect.objectContaining({
            operation: 'custom-op',
            key: 'custom-key',
            repoUrl: 'https://github.com/custom/repo',
          })
        );
      });

      it('should use default operation and key when context not provided', async () => {
        // ARRANGE
        (mockCache.get as any).mockRejectedValue(new Error('Test error'));

        // ACT
        await safeCacheGet(mockCache, 'test-key', mockLogger);

        // ASSERT
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Cache operation failed',
          expect.objectContaining({
            operation: 'get',
            key: 'test-key',
          })
        );
      });
    });
  });

  describe('handleTransactionError', () => {
    describe('Happy Path', () => {
      it('should increment metrics, rollback transaction, and rethrow error', async () => {
        // ARRANGE
        const mockTransaction = {
          id: 'tx-123',
          operations: [],
        };
        const mockMetrics = {
          transactions: { failed: 0 },
        };
        const error = new Error('Transaction failed');
        const mockRollback = vi.fn().mockResolvedValue(undefined);

        // ACT & ASSERT
        await expect(
          handleTransactionError(
            mockTransaction,
            error,
            mockMetrics,
            mockLogger,
            {
              repoUrl: 'https://github.com/test/repo',
              operation: 'cache_operation',
              transactionId: 'tx-123',
            },
            mockRollback
          )
        ).rejects.toThrow('Transaction failed');

        // ASSERT - Metrics incremented
        expect(mockMetrics.transactions.failed).toBe(1);

        // ASSERT - Rollback called
        expect(mockRollback).toHaveBeenCalledWith(mockTransaction);

        // ASSERT - Error logged
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to cache_operation, transaction rolled back',
          expect.objectContaining({
            repoUrl: 'https://github.com/test/repo',
            transactionId: 'tx-123',
            error: 'Transaction failed',
          })
        );
      });

      it('should call rollback function before rethrowing', async () => {
        // ARRANGE
        const mockTransaction = { id: 'tx-789', operations: [] };
        const mockMetrics = { transactions: { failed: 0 } };
        const error = new Error('Rollback test');
        let rollbackCalled = false;
        const mockRollback = vi.fn(async () => {
          rollbackCalled = true;
        });

        // ACT & ASSERT
        try {
          await handleTransactionError(
            mockTransaction,
            error,
            mockMetrics,
            mockLogger,
            {
              repoUrl: 'https://github.com/test/repo',
              operation: 'test',
              transactionId: 'tx-789',
            },
            mockRollback
          );
        } catch (e) {
          // Expected to throw
        }

        // ASSERT
        expect(rollbackCalled).toBe(true);
        expect(mockRollback).toHaveBeenCalledBefore(mockLogger.error as any);
      });
    });

    describe('Error Handling', () => {
      it('should handle non-Error exceptions (string)', async () => {
        // ARRANGE
        const mockTransaction = { id: 'tx-456', operations: [] };
        const mockMetrics = { transactions: { failed: 5 } };
        const mockRollback = vi.fn().mockResolvedValue(undefined);

        // ACT & ASSERT
        await expect(
          handleTransactionError(
            mockTransaction,
            'String error',
            mockMetrics,
            mockLogger,
            {
              repoUrl: 'https://github.com/test/repo',
              operation: 'test_op',
              transactionId: 'tx-456',
            },
            mockRollback
          )
        ).rejects.toThrow();

        // ASSERT
        expect(mockMetrics.transactions.failed).toBe(6);
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to test_op, transaction rolled back',
          expect.objectContaining({
            error: 'String error',
          })
        );
      });

      it('should increment failed counter from any starting value', async () => {
        // ARRANGE
        const mockTransaction = { id: 'tx-999', operations: [] };
        const mockMetrics = { transactions: { failed: 42 } };
        const mockRollback = vi.fn().mockResolvedValue(undefined);

        // ACT
        try {
          await handleTransactionError(
            mockTransaction,
            new Error('Test'),
            mockMetrics,
            mockLogger,
            {
              repoUrl: 'https://github.com/test/repo',
              operation: 'increment_test',
              transactionId: 'tx-999',
            },
            mockRollback
          );
        } catch (e) {
          // Expected
        }

        // ASSERT
        expect(mockMetrics.transactions.failed).toBe(43);
      });
    });
  });
});
