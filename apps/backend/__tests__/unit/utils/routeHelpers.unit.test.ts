/**
 * Unit tests for routeHelpers
 *
 * Coverage target: ≥80%
 * Testing strategy: AAA pattern (Arrange-Act-Assert)
 * Focus: Happy path first, then edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setupRouteRequest,
  recordRouteSuccess,
  recordRouteError,
  buildCommitFilters,
  extractPaginationParams,
  extractFilterParams,
  buildChurnFilters,
} from '../../../src/utils/routeHelpers';
import type { Request, Response } from 'express';

// Mock dependencies
vi.mock('../../../src/services/logger', () => ({
  createRequestLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../src/services/metrics', () => ({
  getUserType: vi.fn(() => 'anonymous'),
  recordFeatureUsage: vi.fn(),
}));

vi.mock('@gitray/shared-types', () => ({
  HTTP_STATUS: {
    OK: 200,
  },
  CommitFilterOptions: {},
  ChurnFilterOptions: {},
}));

describe('routeHelpers', () => {
  describe('setupRouteRequest', () => {
    describe('Happy Path', () => {
      it('should extract logger, repoUrl, and userType from request', () => {
        // ARRANGE
        const mockReq = {
          query: { repoUrl: 'https://github.com/test/repo.git' },
        } as any as Request;

        // ACT
        const result = setupRouteRequest(mockReq);

        // ASSERT
        expect(result).toHaveProperty('logger');
        expect(result).toHaveProperty(
          'repoUrl',
          'https://github.com/test/repo.git'
        );
        expect(result).toHaveProperty('userType', 'anonymous');
      });

      it('should handle different repository URLs', () => {
        // ARRANGE
        const testUrls = [
          'https://github.com/owner/repo.git',
          'https://gitlab.com/group/project.git',
          'https://bitbucket.org/user/repository.git',
        ];

        for (const url of testUrls) {
          const mockReq = {
            query: { repoUrl: url },
          } as any as Request;

          // ACT
          const result = setupRouteRequest(mockReq);

          // ASSERT
          expect(result.repoUrl).toBe(url);
        }
      });
    });
  });

  describe('recordRouteSuccess', () => {
    let mockRes: any;
    let mockLogger: any;

    beforeEach(() => {
      vi.clearAllMocks();

      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
      };
    });

    describe('Happy Path', () => {
      it('should record metrics, log success, and send response', () => {
        // ARRANGE
        const data = { commits: [{ sha: 'abc123' }] };
        const additionalLogData = { commitCount: 1 };

        // ACT
        recordRouteSuccess(
          'repository_commits',
          'anonymous',
          mockLogger,
          'https://github.com/test/repo.git',
          data,
          mockRes,
          additionalLogData
        );

        // ASSERT - Logger called
        expect(mockLogger.info).toHaveBeenCalledWith(
          'repository_commits retrieved successfully',
          expect.objectContaining({
            repoUrl: 'https://github.com/test/repo.git',
            commitCount: 1,
          })
        );

        // ASSERT - Response sent
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith(data);
      });

      it('should work without additional log data', () => {
        // ARRANGE
        const data = { heatmap: [] };

        // ACT
        recordRouteSuccess(
          'heatmap_view',
          'authenticated',
          mockLogger,
          'https://github.com/test/repo.git',
          data,
          mockRes
        );

        // ASSERT
        expect(mockLogger.info).toHaveBeenCalledWith(
          'heatmap_view retrieved successfully',
          expect.objectContaining({
            repoUrl: 'https://github.com/test/repo.git',
          })
        );
        expect(mockRes.json).toHaveBeenCalledWith(data);
      });

      it('should handle different feature names', () => {
        // ARRANGE
        const features = [
          'repository_commits',
          'heatmap_view',
          'top_contributors',
          'code_churn',
        ];

        for (const feature of features) {
          vi.clearAllMocks();

          // ACT
          recordRouteSuccess(
            feature,
            'anonymous',
            mockLogger,
            'https://github.com/test/repo.git',
            {},
            mockRes
          );

          // ASSERT
          expect(mockLogger.info).toHaveBeenCalledWith(
            `${feature} retrieved successfully`,
            expect.any(Object)
          );
        }
      });

      it('should handle different user types', () => {
        // ARRANGE
        const userTypes = ['anonymous', 'authenticated', 'admin'];

        for (const userType of userTypes) {
          vi.clearAllMocks();

          // ACT
          recordRouteSuccess(
            'test_feature',
            userType,
            mockLogger,
            'https://github.com/test/repo.git',
            {},
            mockRes
          );

          // ASSERT - Should complete without errors
          expect(mockRes.json).toHaveBeenCalled();
        }
      });
    });
  });

  describe('recordRouteError', () => {
    let mockLogger: any;
    let mockNext: any;

    beforeEach(() => {
      vi.clearAllMocks();

      mockLogger = {
        error: vi.fn(),
      };

      mockNext = vi.fn();
    });

    describe('Happy Path', () => {
      it('should log error and call next with Error object', () => {
        // ARRANGE
        const error = new Error('Repository not found');

        // ACT
        recordRouteError(
          'repository_commits',
          'anonymous',
          mockLogger,
          'https://github.com/test/repo.git',
          error,
          mockNext
        );

        // ASSERT - Error logged
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to retrieve repository_commits',
          expect.objectContaining({
            repoUrl: 'https://github.com/test/repo.git',
            error: 'Repository not found',
          })
        );

        // ASSERT - Error propagated
        expect(mockNext).toHaveBeenCalledWith(error);
      });

      it('should handle non-Error exceptions (string)', () => {
        // ARRANGE
        const error = 'String error message';

        // ACT
        recordRouteError(
          'heatmap_view',
          'anonymous',
          mockLogger,
          'https://github.com/test/repo.git',
          error,
          mockNext
        );

        // ASSERT
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to retrieve heatmap_view',
          expect.objectContaining({
            error: 'String error message',
          })
        );
        expect(mockNext).toHaveBeenCalledWith(error);
      });

      it('should handle different error types', () => {
        // ARRANGE
        const testErrors = [
          new Error('Test error'),
          'String error',
          { message: 'Object error' },
          42,
        ];

        for (const error of testErrors) {
          vi.clearAllMocks();

          // ACT
          recordRouteError(
            'test_feature',
            'anonymous',
            mockLogger,
            'https://github.com/test/repo.git',
            error,
            mockNext
          );

          // ASSERT
          expect(mockNext).toHaveBeenCalledWith(error);
        }
      });
    });
  });

  describe('buildCommitFilters', () => {
    describe('Happy Path', () => {
      it('should build filter with all properties defined', () => {
        // ARRANGE
        const query = {
          author: 'john',
          authors: 'john,jane,bob',
          fromDate: '2024-01-01',
          toDate: '2024-12-31',
        };

        // ACT
        const result = buildCommitFilters(query);

        // ASSERT
        expect(result).toEqual({
          author: 'john',
          authors: ['john', 'jane', 'bob'],
          fromDate: '2024-01-01',
          toDate: '2024-12-31',
        });
      });

      it('should build filter with only author', () => {
        // ARRANGE
        const query = { author: 'alice' };

        // ACT
        const result = buildCommitFilters(query);

        // ASSERT
        expect(result).toEqual({ author: 'alice' });
      });

      it('should build filter with only date range', () => {
        // ARRANGE
        const query = {
          fromDate: '2024-01-01',
          toDate: '2024-06-30',
        };

        // ACT
        const result = buildCommitFilters(query);

        // ASSERT
        expect(result).toEqual({
          fromDate: '2024-01-01',
          toDate: '2024-06-30',
        });
      });

      it('should return empty object when no filters provided', () => {
        // ARRANGE
        const query = {};

        // ACT
        const result = buildCommitFilters(query);

        // ASSERT
        expect(result).toEqual({});
      });

      it('should trim whitespace from authors list', () => {
        // ARRANGE
        const query = {
          authors: 'alice , bob , charlie ',
        };

        // ACT
        const result = buildCommitFilters(query);

        // ASSERT
        expect(result).toEqual({
          authors: ['alice', 'bob', 'charlie'],
        });
      });

      it('should handle single author in authors list', () => {
        // ARRANGE
        const query = {
          authors: 'alice',
        };

        // ACT
        const result = buildCommitFilters(query);

        // ASSERT
        expect(result).toEqual({
          authors: ['alice'],
        });
      });
    });

    describe('Edge Cases', () => {
      it('should exclude undefined properties', () => {
        // ARRANGE
        const query = {
          author: 'john',
          authors: undefined,
          fromDate: undefined,
          toDate: '2024-12-31',
        };

        // ACT
        const result = buildCommitFilters(query);

        // ASSERT
        expect(result).toEqual({
          author: 'john',
          toDate: '2024-12-31',
        });
        expect(result).not.toHaveProperty('authors');
        expect(result).not.toHaveProperty('fromDate');
      });
    });
  });

  describe('extractPaginationParams', () => {
    describe('Happy Path', () => {
      it('should extract page and limit with skip calculation', () => {
        // ARRANGE
        const query = {
          page: '2',
          limit: '50',
        };

        // ACT
        const result = extractPaginationParams(query);

        // ASSERT
        expect(result).toEqual({
          page: 2,
          limit: 50,
          skip: 50, // (2-1) * 50
        });
      });

      it('should use default values when not provided', () => {
        // ARRANGE
        const query = {};

        // ACT
        const result = extractPaginationParams(query);

        // ASSERT
        expect(result).toEqual({
          page: 1,
          limit: 100,
          skip: 0,
        });
      });

      it('should handle page 1 with default limit', () => {
        // ARRANGE
        const query = { page: '1' };

        // ACT
        const result = extractPaginationParams(query);

        // ASSERT
        expect(result).toEqual({
          page: 1,
          limit: 100,
          skip: 0,
        });
      });

      it('should calculate correct skip for different pages', () => {
        // ARRANGE
        const testCases = [
          {
            query: { page: '1', limit: '10' },
            expected: { page: 1, limit: 10, skip: 0 },
          },
          {
            query: { page: '2', limit: '10' },
            expected: { page: 2, limit: 10, skip: 10 },
          },
          {
            query: { page: '5', limit: '25' },
            expected: { page: 5, limit: 25, skip: 100 },
          },
          {
            query: { page: '10', limit: '20' },
            expected: { page: 10, limit: 20, skip: 180 },
          },
        ];

        for (const testCase of testCases) {
          // ACT
          const result = extractPaginationParams(testCase.query);

          // ASSERT
          expect(result).toEqual(testCase.expected);
        }
      });
    });

    describe('Edge Cases', () => {
      it('should handle invalid page as default', () => {
        // ARRANGE
        const query = { page: 'invalid', limit: '20' };

        // ACT
        const result = extractPaginationParams(query);

        // ASSERT
        expect(result.page).toBe(1);
        expect(result.limit).toBe(20);
        expect(result.skip).toBe(0);
      });

      it('should handle invalid limit as default', () => {
        // ARRANGE
        const query = { page: '3', limit: 'invalid' };

        // ACT
        const result = extractPaginationParams(query);

        // ASSERT
        expect(result.page).toBe(3);
        expect(result.limit).toBe(100);
        expect(result.skip).toBe(200);
      });

      it('should handle zero page value (falls back to 1)', () => {
        // ARRANGE
        const query = { page: '0' };

        // ACT
        const result = extractPaginationParams(query);

        // ASSERT
        // parseInt('0') || 1 = 1 (0 is falsy, so || returns 1)
        expect(result.page).toBe(1);
        expect(result.limit).toBe(100); // default
        expect(result.skip).toBe(0); // (1-1) * 100
      });
    });
  });

  describe('extractFilterParams', () => {
    describe('Happy Path', () => {
      it('should extract all filter parameters', () => {
        // ARRANGE
        const query = {
          author: 'john',
          authors: 'john,jane',
          fromDate: '2024-01-01',
          toDate: '2024-12-31',
        };

        // ACT
        const result = extractFilterParams(query);

        // ASSERT
        expect(result).toEqual({
          author: 'john',
          authors: 'john,jane',
          fromDate: '2024-01-01',
          toDate: '2024-12-31',
        });
      });

      it('should handle missing parameters as undefined', () => {
        // ARRANGE
        const query = {
          author: 'alice',
        };

        // ACT
        const result = extractFilterParams(query);

        // ASSERT
        expect(result).toEqual({
          author: 'alice',
          authors: undefined,
          fromDate: undefined,
          toDate: undefined,
        });
      });

      it('should return all undefined when no parameters', () => {
        // ARRANGE
        const query = {};

        // ACT
        const result = extractFilterParams(query);

        // ASSERT
        expect(result).toEqual({
          author: undefined,
          authors: undefined,
          fromDate: undefined,
          toDate: undefined,
        });
      });
    });
  });

  describe('buildChurnFilters', () => {
    describe('Happy Path', () => {
      it('should build churn filter with all properties', () => {
        // ARRANGE
        const query = {
          fromDate: '2024-01-01',
          toDate: '2024-12-31',
          minChanges: '5',
          extensions: 'ts,tsx,js',
        };

        // ACT
        const result = buildChurnFilters(query);

        // ASSERT
        expect(result).toEqual({
          since: '2024-01-01',
          until: '2024-12-31',
          minChanges: 5,
          extensions: ['ts', 'tsx', 'js'],
        });
      });

      it('should map fromDate to since and toDate to until', () => {
        // ARRANGE
        const query = {
          fromDate: '2024-06-01',
          toDate: '2024-06-30',
        };

        // ACT
        const result = buildChurnFilters(query);

        // ASSERT
        expect(result).toEqual({
          since: '2024-06-01',
          until: '2024-06-30',
        });
      });

      it('should parse minChanges as integer', () => {
        // ARRANGE
        const query = {
          minChanges: '10',
        };

        // ACT
        const result = buildChurnFilters(query);

        // ASSERT
        expect(result).toEqual({
          minChanges: 10,
        });
        expect(typeof result.minChanges).toBe('number');
      });

      it('should split and trim extensions', () => {
        // ARRANGE
        const query = {
          extensions: ' ts , js , py ',
        };

        // ACT
        const result = buildChurnFilters(query);

        // ASSERT
        expect(result).toEqual({
          extensions: ['ts', 'js', 'py'],
        });
      });

      it('should return empty object when no filters provided', () => {
        // ARRANGE
        const query = {};

        // ACT
        const result = buildChurnFilters(query);

        // ASSERT
        expect(result).toEqual({});
      });

      it('should handle single extension', () => {
        // ARRANGE
        const query = {
          extensions: 'ts',
        };

        // ACT
        const result = buildChurnFilters(query);

        // ASSERT
        expect(result).toEqual({
          extensions: ['ts'],
        });
      });
    });

    describe('Edge Cases', () => {
      it('should exclude undefined properties', () => {
        // ARRANGE
        const query = {
          fromDate: '2024-01-01',
          toDate: undefined,
          minChanges: undefined,
          extensions: 'ts',
        };

        // ACT
        const result = buildChurnFilters(query);

        // ASSERT
        expect(result).toEqual({
          since: '2024-01-01',
          extensions: ['ts'],
        });
        expect(result).not.toHaveProperty('until');
        expect(result).not.toHaveProperty('minChanges');
      });

      it('should exclude empty extensions string', () => {
        // ARRANGE
        const query = {
          extensions: '',
        };

        // ACT
        const result = buildChurnFilters(query);

        // ASSERT
        // Empty string is falsy, so it gets excluded
        expect(result).toEqual({});
      });
    });
  });
});
