// apps/backend/src/middlewares/memoryPressureMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import {
  shouldThrottleRequest,
  getMemoryStats,
} from '../utils/memoryPressureManager';
import { getLogger } from '../services/logger';
import { HTTP_STATUS } from '@gitray/shared-types';

const logger = getLogger();

type MemoryPriority = 'low' | 'normal' | 'high';

/**
 * CRITICAL MIDDLEWARE: Request throttling based on memory pressure
 *
 * This middleware prevents memory exhaustion by throttling requests
 * when system memory usage becomes critical.
 */

declare module 'express-serve-static-core' {
  interface Request {
    memoryPriority?: MemoryPriority;
    skipMemoryThrottling?: boolean;
  }
}

export const memoryPressureMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Skip if explicitly disabled for this request
  if (req.skipMemoryThrottling) {
    return next();
  }

  // Determine request priority based on path and headers
  const priority = determinePriority(req);
  req.memoryPriority = priority;

  // Check if request should be throttled
  const throttleResult = shouldThrottleRequest({
    path: req.path,
    method: req.method,
    priority,
    userAgent: req.headers['user-agent'],
  });

  if (throttleResult.shouldThrottle) {
    // Set retry-after header
    if (throttleResult.retryAfter) {
      res.setHeader('Retry-After', throttleResult.retryAfter);
    }

    // Add memory pressure headers for client awareness
    const memoryStats = getMemoryStats();
    res.setHeader('X-Memory-Pressure', memoryStats.pressure.level);
    res.setHeader(
      'X-Memory-Usage',
      `${Math.round(memoryStats.system.usagePercentage * 100)}%`
    );

    logger.warn('Request throttled due to memory pressure', {
      path: req.path,
      method: req.method,
      priority,
      reason: throttleResult.reason,
      memoryUsage: `${Math.round(memoryStats.system.usagePercentage * 100)}%`,
      userAgent: req.headers['user-agent'],
    });

    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      error: 'Service temporarily unavailable due to memory pressure',
      reason: throttleResult.reason,
      retryAfter: throttleResult.retryAfter,
      memoryPressure: {
        level: memoryStats.pressure.level,
        systemUsage: `${Math.round(memoryStats.system.usagePercentage * 100)}%`,
        suggestion:
          'Please retry in a few moments or contact support if this persists',
      },
    });
    return;
  }

  // Add memory info to response headers for monitoring
  const memoryStats = getMemoryStats();
  res.setHeader('X-Memory-Pressure', memoryStats.pressure.level);

  next();
};

/**
 * Determine request priority based on path, method, and headers
 */
function determinePriority(req: Request): 'low' | 'normal' | 'high' {
  // Explicit priority header
  const explicitPriority = req.headers['x-priority'] as string;
  if (
    explicitPriority &&
    ['low', 'normal', 'high'].includes(explicitPriority)
  ) {
    return explicitPriority as 'low' | 'normal' | 'high';
  }

  // Health checks and metrics are high priority
  if (req.path.startsWith('/health') || req.path.startsWith('/metrics')) {
    return 'high';
  }

  // Cache management endpoints are high priority
  if (req.path.includes('/cache/')) {
    return 'high';
  }

  // Admin operations are high priority
  if (
    req.headers['user-agent']?.includes('admin') ||
    req.headers['authorization']?.includes('admin')
  ) {
    return 'high';
  }

  // Large repository operations are low priority by default
  if (req.path.includes('/commits') && req.method === 'GET') {
    // Check for streaming or large repo indicators
    const repoUrl = req.query.repoUrl as string;
    if (
      repoUrl &&
      (repoUrl.includes('torvalds/linux') ||
        repoUrl.includes('microsoft/vscode') ||
        req.query.useStreaming === 'true')
    ) {
      return 'low';
    }
    return 'normal';
  }

  // POST operations for repository data are normal priority
  if (req.path.includes('/repositories') && req.method === 'POST') {
    return 'normal';
  }

  // Everything else is normal priority
  return 'normal';
}

/**
 * Memory-aware error handler wrapper
 */
export const memoryAwareErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if error might be memory-related
  const isMemoryError =
    err.message.includes('memory') ||
    err.message.includes('ENOMEM') ||
    err.message.includes('heap') ||
    err.name === 'MemoryPressureError';

  if (isMemoryError) {
    const memoryStats = getMemoryStats();

    logger.error('Memory-related error detected', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      memoryStats,
    });

    // If memory pressure is critical, suggest client-side caching
    if (
      memoryStats.pressure.level === 'critical' ||
      memoryStats.pressure.level === 'emergency'
    ) {
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        error: 'Service experiencing memory pressure',
        suggestion:
          'Please cache responses client-side and reduce request frequency',
        memoryPressure: memoryStats.pressure,
        retryAfter: 60,
      });
      return;
    }
  }

  // Pass to next error handler
  next(err);
};
