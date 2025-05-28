import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

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
  const requestId =
    (req.headers['x-request-id'] as string) || randomBytes(5).toString('hex');
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};
