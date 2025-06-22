/* eslint-disable @typescript-eslint/no-unused-vars */

// Generic error handler used at the end of the middleware chain. It logs the
// error details and converts known GitrayError instances into structured JSON
// responses. Unknown errors fallback to HTTP 500.

import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { getLogger } from '../services/logger';
import { GitrayError, HTTP_STATUS } from '@gitray/shared-types';
import {
  recordDetailedError,
  updateServiceHealthScore,
  getUserType,
  recordFeatureUsage,
} from '../services/metrics';

const logger = getLogger();

const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userType = getUserType(req);

  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userType,
  });

  // Record detailed error metrics
  recordDetailedError('api', err, {
    userImpact: err instanceof GitrayError ? 'degraded' : 'blocking',
    recoveryAction: 'retry',
    severity: err instanceof GitrayError ? 'warning' : 'critical',
  });

  // Update service health score
  updateServiceHealthScore('api', {
    errorRate: 1,
    responseTime: 0, // Error response is immediate
  });

  // Record failed feature usage
  const feature = req.path.split('/')[2] ?? 'unknown'; // Extract feature from path
  recordFeatureUsage(feature, userType, false, 'api_call');

  if (err instanceof GitrayError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    // Known error types are returned directly with their status code
    return; // Explicitly return to satisfy void | Promise<void>
  }

  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    error: 'An internal error occurred',
  });
};

export default errorHandler;
