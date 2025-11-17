import { NextFunction, Request, Response } from 'express';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'DELETE']);

export function strictContentType(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }

  const contentType = req.get('Content-Type')?.toLowerCase() ?? '';

  if (!contentType.startsWith('application/json')) {
    res.status(415).json({
      error: 'Unsupported Media Type',
      code: 'INVALID_CONTENT_TYPE',
      message:
        'Only application/json is accepted for state-changing operations',
    });
    return;
  }

  const customHeader = req.get('X-Requested-With');
  if (!customHeader) {
    res.status(403).json({
      error: 'Forbidden',
      code: 'MISSING_CUSTOM_HEADER',
      message: 'X-Requested-With header required',
    });
    return;
  }

  next();
}
