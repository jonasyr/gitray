import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ValidationError } from '@gitray/shared-types';

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
