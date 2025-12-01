/**
 * Unit Tests for Repository Route Factory
 *
 * Focus: Route handler factory and validation chain builder
 * Pattern: AAA (Arrange-Act-Assert), Happy Path First
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { ValidationChain } from 'express-validator';
import {
  createCachedRouteHandler,
  buildRepoValidationChain,
  type RouteContext,
  type SuccessMetricsBuilder,
  type RouteProcessor,
  type ValidationChainOptions,
} from '../../../src/utils/repositoryRouteFactory.js';

// Mock dependencies
vi.mock('../../../src/utils/routeHelpers.js', () => ({
  setupRouteRequest: vi.fn((req: Request) => ({
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    repoUrl: req.body.repoUrl || 'https://github.com/test/repo.git',
    userType: 'authenticated',
  })),
  recordRouteSuccess: vi.fn(
    (
      featureName: string,
      userType: string,
      logger: unknown,
      repoUrl: string,
      result: unknown,
      res: Response,
      metrics: unknown
    ) => {
      res.json(result);
    }
  ),
  recordRouteError: vi.fn(
    (
      featureName: string,
      userType: string,
      logger: unknown,
      repoUrl: string,
      error: unknown,
      next: NextFunction
    ) => {
      next(error);
    }
  ),
}));

describe('Repository Route Factory', () => {
  describe('createCachedRouteHandler', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: Mock;

    beforeEach(() => {
      mockReq = {
        body: { repoUrl: 'https://github.com/test/repo.git' },
        query: {},
      };
      mockRes = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn();
    });

    // Happy Path Tests
    it('should create a route handler that processes successfully', async () => {
      // ARRANGE
      const processor: RouteProcessor<{ data: string }> = vi
        .fn()
        .mockResolvedValue({ data: 'test-data' });
      const buildMetrics: SuccessMetricsBuilder<{ data: string }> = vi
        .fn()
        .mockReturnValue({ dataLength: 9 });

      const handlers = createCachedRouteHandler(
        'test_feature',
        processor,
        buildMetrics
      );

      // ACT
      await handlers[0](
        mockReq as Request,
        mockRes as Response,
        mockNext as NextFunction
      );

      // ASSERT
      expect(handlers).toHaveLength(1);
      expect(processor).toHaveBeenCalledWith(
        expect.objectContaining({
          req: mockReq,
          repoUrl: 'https://github.com/test/repo.git',
          userType: 'authenticated',
        })
      );
      expect(buildMetrics).toHaveBeenCalledWith({ data: 'test-data' });
      expect(mockRes.json).toHaveBeenCalledWith({ data: 'test-data' });
    });

    it('should handle different feature names', async () => {
      // ARRANGE
      const processor: RouteProcessor<{ count: number }> = vi
        .fn()
        .mockResolvedValue({ count: 42 });
      const buildMetrics: SuccessMetricsBuilder<{ count: number }> = vi
        .fn()
        .mockReturnValue({ itemCount: 42 });

      const handlers1 = createCachedRouteHandler(
        'feature_one',
        processor,
        buildMetrics
      );
      const handlers2 = createCachedRouteHandler(
        'feature_two',
        processor,
        buildMetrics
      );

      // ACT
      await handlers1[0](
        mockReq as Request,
        mockRes as Response,
        mockNext as NextFunction
      );
      await handlers2[0](
        mockReq as Request,
        mockRes as Response,
        mockNext as NextFunction
      );

      // ASSERT
      expect(processor).toHaveBeenCalledTimes(2);
      expect(mockRes.json).toHaveBeenCalledTimes(2);
    });

    it('should pass route context with logger to processor', async () => {
      // ARRANGE
      let capturedContext: RouteContext | null = null;
      const processor: RouteProcessor<{ result: string }> = vi
        .fn()
        .mockImplementation((ctx: RouteContext) => {
          capturedContext = ctx;
          return Promise.resolve({ result: 'ok' });
        });
      const buildMetrics: SuccessMetricsBuilder<{ result: string }> = vi
        .fn()
        .mockReturnValue({});

      const handlers = createCachedRouteHandler(
        'test',
        processor,
        buildMetrics
      );

      // ACT
      await handlers[0](
        mockReq as Request,
        mockRes as Response,
        mockNext as NextFunction
      );

      // ASSERT
      expect(capturedContext).not.toBeNull();
      expect(
        (capturedContext as unknown as RouteContext).logger
      ).toHaveProperty('info');
      expect(
        (capturedContext as unknown as RouteContext).logger
      ).toHaveProperty('error');
      expect((capturedContext as unknown as RouteContext).repoUrl).toBe(
        'https://github.com/test/repo.git'
      );
      expect((capturedContext as unknown as RouteContext).userType).toBe(
        'authenticated'
      );
    });

    // Error Handling Tests
    it('should handle processor errors gracefully', async () => {
      // ARRANGE
      const testError = new Error('Processor failed');
      const processor: RouteProcessor<{ data: string }> = vi
        .fn()
        .mockRejectedValue(testError);
      const buildMetrics: SuccessMetricsBuilder<{ data: string }> = vi.fn();

      const handlers = createCachedRouteHandler(
        'failing_feature',
        processor,
        buildMetrics
      );

      // ACT
      await handlers[0](
        mockReq as Request,
        mockRes as Response,
        mockNext as NextFunction
      );

      // ASSERT
      expect(processor).toHaveBeenCalled();
      expect(buildMetrics).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(testError);
    });

    it('should call error handler when processor throws', async () => {
      // ARRANGE
      const processor: RouteProcessor<unknown> = vi
        .fn()
        .mockRejectedValue(new Error('Cache error'));
      const buildMetrics: SuccessMetricsBuilder<unknown> = vi.fn();

      const handlers = createCachedRouteHandler(
        'error_test',
        processor,
        buildMetrics
      );

      // ACT
      await handlers[0](
        mockReq as Request,
        mockRes as Response,
        mockNext as NextFunction
      );

      // ASSERT
      expect(mockNext).toHaveBeenCalled();
      expect(mockNext.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    });

    // Edge Cases
    it('should handle empty metrics from buildMetrics', async () => {
      // ARRANGE
      const processor: RouteProcessor<{ data: string }> = vi
        .fn()
        .mockResolvedValue({ data: 'test' });
      const buildMetrics: SuccessMetricsBuilder<{ data: string }> = vi
        .fn()
        .mockReturnValue({});

      const handlers = createCachedRouteHandler(
        'empty_metrics',
        processor,
        buildMetrics
      );

      // ACT
      await handlers[0](
        mockReq as Request,
        mockRes as Response,
        mockNext as NextFunction
      );

      // ASSERT
      expect(buildMetrics).toHaveBeenCalledWith({ data: 'test' });
      expect(mockRes.json).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should handle complex result types', async () => {
      // ARRANGE
      const complexResult = {
        commits: [{ sha: 'abc123' }, { sha: 'def456' }],
        metadata: { total: 2, page: 1 },
      };
      const processor: RouteProcessor<typeof complexResult> = vi
        .fn()
        .mockResolvedValue(complexResult);
      const buildMetrics: SuccessMetricsBuilder<typeof complexResult> = vi
        .fn()
        .mockReturnValue({ commitCount: 2, page: 1 });

      const handlers = createCachedRouteHandler(
        'complex',
        processor,
        buildMetrics
      );

      // ACT
      await handlers[0](
        mockReq as Request,
        mockRes as Response,
        mockNext as NextFunction
      );

      // ASSERT
      expect(processor).toHaveBeenCalled();
      expect(buildMetrics).toHaveBeenCalledWith(complexResult);
      expect(mockRes.json).toHaveBeenCalledWith(complexResult);
    });
  });

  describe('buildRepoValidationChain', () => {
    let mockValidators: {
      repoUrlValidation: () => ValidationChain[];
      paginationValidation: () => ValidationChain[];
      dateValidation: () => ValidationChain[];
      authorValidation: () => ValidationChain[];
      churnValidation: () => ValidationChain[];
    };

    beforeEach(() => {
      mockValidators = {
        repoUrlValidation: vi
          .fn()
          .mockReturnValue([{ name: 'repoUrl' } as unknown as ValidationChain]),
        paginationValidation: vi
          .fn()
          .mockReturnValue([
            { name: 'page' } as unknown as ValidationChain,
            { name: 'limit' } as unknown as ValidationChain,
          ]),
        dateValidation: vi
          .fn()
          .mockReturnValue([
            { name: 'fromDate' } as unknown as ValidationChain,
            { name: 'toDate' } as unknown as ValidationChain,
          ]),
        authorValidation: vi
          .fn()
          .mockReturnValue([{ name: 'author' } as unknown as ValidationChain]),
        churnValidation: vi
          .fn()
          .mockReturnValue([
            { name: 'minChanges' } as unknown as ValidationChain,
          ]),
      };
    });

    // Happy Path Tests
    it('should include only repoUrl validation by default', () => {
      // ARRANGE
      const options: ValidationChainOptions = {};

      // ACT
      const chain = buildRepoValidationChain(options, mockValidators);

      // ASSERT
      expect(chain).toHaveLength(1);
      expect(mockValidators.repoUrlValidation).toHaveBeenCalled();
      expect(mockValidators.paginationValidation).not.toHaveBeenCalled();
    });

    it('should include pagination validation when requested', () => {
      // ARRANGE
      const options: ValidationChainOptions = { includePagination: true };

      // ACT
      const chain = buildRepoValidationChain(options, mockValidators);

      // ASSERT
      expect(chain).toHaveLength(3); // repoUrl + page + limit
      expect(mockValidators.repoUrlValidation).toHaveBeenCalled();
      expect(mockValidators.paginationValidation).toHaveBeenCalled();
    });

    it('should include date validation when requested', () => {
      // ARRANGE
      const options: ValidationChainOptions = { includeDates: true };

      // ACT
      const chain = buildRepoValidationChain(options, mockValidators);

      // ASSERT
      expect(chain).toHaveLength(3); // repoUrl + fromDate + toDate
      expect(mockValidators.dateValidation).toHaveBeenCalled();
    });

    it('should include author validation when requested', () => {
      // ARRANGE
      const options: ValidationChainOptions = { includeAuthors: true };

      // ACT
      const chain = buildRepoValidationChain(options, mockValidators);

      // ASSERT
      expect(chain).toHaveLength(2); // repoUrl + author
      expect(mockValidators.authorValidation).toHaveBeenCalled();
    });

    it('should include churn validation when requested', () => {
      // ARRANGE
      const options: ValidationChainOptions = { includeChurn: true };

      // ACT
      const chain = buildRepoValidationChain(options, mockValidators);

      // ASSERT
      expect(chain).toHaveLength(2); // repoUrl + minChanges
      expect(mockValidators.churnValidation).toHaveBeenCalled();
    });

    it('should combine multiple validation types', () => {
      // ARRANGE
      const options: ValidationChainOptions = {
        includePagination: true,
        includeDates: true,
      };

      // ACT
      const chain = buildRepoValidationChain(options, mockValidators);

      // ASSERT
      expect(chain).toHaveLength(5); // repoUrl + page + limit + fromDate + toDate
      expect(mockValidators.repoUrlValidation).toHaveBeenCalled();
      expect(mockValidators.paginationValidation).toHaveBeenCalled();
      expect(mockValidators.dateValidation).toHaveBeenCalled();
    });

    it('should include all validation types when all requested', () => {
      // ARRANGE
      const options: ValidationChainOptions = {
        includePagination: true,
        includeDates: true,
        includeAuthors: true,
        includeChurn: true,
      };

      // ACT
      const chain = buildRepoValidationChain(options, mockValidators);

      // ASSERT
      expect(chain).toHaveLength(7); // repoUrl(1) + pagination(2) + dates(2) + author(1) + churn(1) = 7
      expect(mockValidators.repoUrlValidation).toHaveBeenCalled();
      expect(mockValidators.paginationValidation).toHaveBeenCalled();
      expect(mockValidators.dateValidation).toHaveBeenCalled();
      expect(mockValidators.authorValidation).toHaveBeenCalled();
      expect(mockValidators.churnValidation).toHaveBeenCalled();
    });

    // Edge Cases
    it('should handle missing optional validators gracefully', () => {
      // ARRANGE
      const options: ValidationChainOptions = { includePagination: true };
      const partialValidators = {
        repoUrlValidation: vi
          .fn()
          .mockReturnValue([{ name: 'repoUrl' } as unknown as ValidationChain]),
      };

      // ACT
      const chain = buildRepoValidationChain(options, partialValidators);

      // ASSERT
      expect(chain).toHaveLength(1); // Only repoUrl since pagination validator missing
    });

    it('should maintain correct order of validators', () => {
      // ARRANGE
      const options: ValidationChainOptions = {
        includeChurn: true,
        includeAuthors: true,
        includeDates: true,
        includePagination: true,
      };

      // ACT
      const chain = buildRepoValidationChain(options, mockValidators);

      // ASSERT - Order should be: repoUrl, pagination, dates, authors, churn
      expect(chain[0]).toEqual({ name: 'repoUrl' });
      expect(chain[1]).toEqual({ name: 'page' });
      expect(chain[2]).toEqual({ name: 'limit' });
      expect(chain[3]).toEqual({ name: 'fromDate' });
      expect(chain[4]).toEqual({ name: 'toDate' });
      expect(chain[5]).toEqual({ name: 'author' });
      expect(chain[6]).toEqual({ name: 'minChanges' });
    });

    it('should handle false flags correctly', () => {
      // ARRANGE
      const options: ValidationChainOptions = {
        includePagination: false,
        includeDates: false,
        includeAuthors: false,
        includeChurn: false,
      };

      // ACT
      const chain = buildRepoValidationChain(options, mockValidators);

      // ASSERT
      expect(chain).toHaveLength(1); // Only repoUrl
      expect(mockValidators.paginationValidation).not.toHaveBeenCalled();
      expect(mockValidators.dateValidation).not.toHaveBeenCalled();
      expect(mockValidators.authorValidation).not.toHaveBeenCalled();
      expect(mockValidators.churnValidation).not.toHaveBeenCalled();
    });
  });
});
