import { Request, Response, NextFunction } from 'express';
import {
  validationResult,
  CustomValidator,
  ValidationChain,
  query,
  body,
} from 'express-validator';
import {
  ValidationError,
  ERROR_MESSAGES,
  HTTP_STATUS,
} from '@gitray/shared-types';
import { isSafeGitUrl } from '../utils/urlSecurity.js';
import { createRequestLogger } from '../services/logger';

// Re-export for use in route files
export { ERROR_MESSAGES } from '@gitray/shared-types';
export type { ValidationChain, CustomValidator } from 'express-validator';

// ---------------------------------------------------------------------------
// Validation error handlers
// ---------------------------------------------------------------------------

/**
 * Middleware that throws a ValidationError when request validation fails.
 * Use this for routes that have centralized error handling middleware.
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Convert validation result into a typed error for consistent handling
    throw new ValidationError('Validation failed', errors.array());
  }
  next();
};

/**
 * Middleware that returns JSON 400 response when validation fails.
 * Use this for routes that need direct error responses without throwing.
 */
export const handleValidationErrorsWithResponse = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const logger = createRequestLogger(req);
    logger.warn('Validation failed', {
      errors: errors.array(),
      query: req.query,
      path: req.path,
    });

    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: errors.array(),
    });
    return;
  }
  next();
};

// ---------------------------------------------------------------------------
// Custom validators
// ---------------------------------------------------------------------------

/**
 * Custom validator for Git repository URLs with SSRF protection
 *
 * Validates that the URL:
 * - Uses secure protocols (https/http)
 * - Points to allowed Git hosting services
 * - Does not resolve to private/internal IP addresses
 * - Is not vulnerable to DNS rebinding attacks
 */
export const isSecureGitUrl: CustomValidator = async (value: string) => {
  const safe = await isSafeGitUrl(value);
  if (!safe) {
    throw new Error('Invalid or potentially unsafe repository URL');
  }
  return true;
};

// ---------------------------------------------------------------------------
// Reusable validation chains
// ---------------------------------------------------------------------------

/**
 * Repository URL validation chain with security checks.
 * Validates format, protocol, and safety of repository URLs.
 */
export const repoUrlValidation = (): ValidationChain[] => [
  query('repoUrl')
    .notEmpty()
    .withMessage('repoUrl query parameter is required')
    .isURL({
      protocols: ['http', 'https'],
      require_protocol: true,
      require_valid_protocol: true,
    })
    .withMessage(ERROR_MESSAGES.INVALID_REPO_URL)
    .custom(isSecureGitUrl)
    .withMessage('Invalid or potentially unsafe repository URL'),
];

/**
 * Pagination validation chain for page and limit parameters.
 * Enforces reasonable bounds to prevent excessive data retrieval.
 */
export const paginationValidation = (): ValidationChain[] => [
  query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Page must be between 1 and 1000')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
];

/**
 * Date range validation chain for fromDate and toDate parameters.
 * Ensures dates are valid ISO 8601 format, not in the future, and in correct order.
 */
export const dateValidation = (): ValidationChain[] => [
  query('fromDate')
    .optional()
    .isISO8601({ strict: true })
    .withMessage('fromDate must be a valid ISO 8601 date')
    .custom((value) => {
      if (value && new Date(value) > new Date()) {
        return false;
      }
      return true;
    })
    .withMessage('fromDate cannot be in the future'),
  query('toDate')
    .optional()
    .isISO8601({ strict: true })
    .withMessage('toDate must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      if (value && new Date(value) > new Date()) {
        return false;
      }
      const fromDate = req.query?.fromDate as string;
      if (value && fromDate && new Date(value) < new Date(fromDate)) {
        return false;
      }
      return true;
    })
    .withMessage('toDate must be after fromDate and not in the future'),
];

/**
 * Author filtering validation chain for author and authors parameters.
 * Supports single author or comma-separated list with sanitization.
 */
export const authorValidation = (): ValidationChain[] => [
  query('author')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Author must be between 1 and 100 characters')
    .escape(),
  query('authors')
    .optional()
    .isString()
    .custom((value) => {
      const authors = value.split(',');
      return (
        authors.length <= 10 &&
        authors.every((a: string) => a.trim().length > 0)
      );
    })
    .withMessage(
      'Authors must be comma-separated and maximum 10 authors allowed'
    ),
];

/**
 * Code churn filtering validation chain for minChanges and extensions parameters.
 * Validates change thresholds and file extension filters.
 */
export const churnValidation = (): ValidationChain[] => [
  query('minChanges')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('minChanges must be between 1 and 1000')
    .toInt(),
  query('extensions')
    .optional()
    .isString()
    .custom((value) => {
      const exts = value.split(',');
      return (
        exts.length <= 20 && exts.every((e: string) => e.trim().length > 0)
      );
    })
    .withMessage('Extensions must be comma-separated and maximum 20 allowed'),
];

/**
 * Repository URL validation chain for request body (POST/PUT/PATCH).
 * Validates format, protocol, and safety of repository URLs in body parameters.
 */
export const repoUrlBodyValidation = (): ValidationChain[] => [
  body('repoUrl')
    .notEmpty()
    .withMessage('repoUrl is required')
    .isURL({
      protocols: ['http', 'https'],
      require_protocol: true,
      require_valid_protocol: true,
    })
    .withMessage(ERROR_MESSAGES.INVALID_REPO_URL)
    .custom(isSecureGitUrl)
    .withMessage('Invalid or potentially unsafe repository URL'),
];
