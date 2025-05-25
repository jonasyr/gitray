/* eslint-disable @typescript-eslint/no-unused-vars */

import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import logger from '../services/logger';
import { GitrayError, HTTP_STATUS } from '@gitray/shared-types';

const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err instanceof GitrayError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return; // Explicitly return to satisfy void | Promise<void>
  }

  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    error: 'An internal error occurred',
  });
};

export default errorHandler;
