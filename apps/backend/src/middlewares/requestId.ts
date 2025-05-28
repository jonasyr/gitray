import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

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
  const requestId =
    (req.headers['x-request-id'] as string) || randomBytes(5).toString('hex');
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};
