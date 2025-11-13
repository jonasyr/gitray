import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'node:crypto';

// Middleware that assigns a unique ID to every incoming request

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Reuse provided header if present for traceability, otherwise generate one
  let requestId: string;

  // Handle case where headers might be undefined
  const headerValue = req.headers?.['x-request-id'];

  if (headerValue) {
    // Handle array headers by joining with comma (Express convention)
    requestId = Array.isArray(headerValue)
      ? headerValue.join(',')
      : headerValue;
  } else {
    requestId = randomBytes(5).toString('hex');
  }

  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};
