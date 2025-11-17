import { Request, Response, NextFunction } from 'express';
import { validationResult, CustomValidator } from 'express-validator';
import { ValidationError } from '@gitray/shared-types';
import { isSafeGitUrl } from '../utils/urlSecurity.js';

// Middleware wrapper that throws a ValidationError when request validation fails

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
