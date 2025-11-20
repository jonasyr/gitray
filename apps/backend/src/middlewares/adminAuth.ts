import { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS } from '@gitray/shared-types';
import { createRequestLogger } from '../services/logger';
import { timingSafeEqual } from 'node:crypto';

/**
 * Admin authentication middleware
 *
 * Validates X-Admin-Token header against configured ADMIN_TOKEN environment variable.
 * Returns 403 Forbidden for missing or invalid tokens.
 * Includes audit logging for all admin access attempts (success and failure).
 */

export const requireAdminToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const logger = createRequestLogger(req);

  // Check if admin auth is enabled (can be disabled for local development)
  const adminAuthEnabled = process.env.ADMIN_AUTH_ENABLED !== 'false';
  if (!adminAuthEnabled) {
    logger.warn('Admin auth disabled - allowing request', {
      category: 'security',
      event: 'admin_auth_disabled',
    });
    next();
    return;
  }

  // Check if ADMIN_TOKEN is configured
  const configuredToken = process.env.ADMIN_TOKEN;
  if (!configuredToken) {
    logger.error('ADMIN_TOKEN not configured but admin auth enabled', {
      category: 'security',
      event: 'admin_auth_misconfigured',
    });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Server misconfiguration',
      code: 'ADMIN_AUTH_NOT_CONFIGURED',
    });
    return;
  }

  // Get token from X-Admin-Token header
  const providedToken = req.headers['x-admin-token'];

  // Check if token was provided
  if (!providedToken || typeof providedToken !== 'string') {
    logger.warn('Admin endpoint accessed without token', {
      category: 'security',
      event: 'admin_auth_missing_token',
      path: req.path,
      method: req.method,
      ip: req.ip ?? req.socket.remoteAddress,
    });
    res.status(HTTP_STATUS.FORBIDDEN).json({
      error: 'Forbidden',
      code: 'ADMIN_AUTH_REQUIRED',
      message: 'Admin authentication required. Provide X-Admin-Token header.',
    });
    return;
  }

  // Validate token using constant-time comparison to prevent timing attacks
  let tokensMatch = false;
  try {
    // Convert strings to buffers for constant-time comparison
    const providedBuffer = Buffer.from(providedToken, 'utf8');
    const configuredBuffer = Buffer.from(configuredToken, 'utf8');

    // Only compare if lengths match (prevents length-based timing attacks)
    if (providedBuffer.length === configuredBuffer.length) {
      tokensMatch = timingSafeEqual(providedBuffer, configuredBuffer);
    }
  } catch (error) {
    logger.error('Error during token comparison', {
      category: 'security',
      event: 'admin_auth_comparison_error',
      error: error instanceof Error ? error.message : String(error),
    });
    // Continue with tokensMatch = false
  }

  if (!tokensMatch) {
    logger.warn('Admin endpoint accessed with invalid token', {
      category: 'security',
      event: 'admin_auth_invalid_token',
      path: req.path,
      method: req.method,
      ip: req.ip ?? req.socket.remoteAddress,
    });
    res.status(HTTP_STATUS.FORBIDDEN).json({
      error: 'Forbidden',
      code: 'INVALID_ADMIN_TOKEN',
      message: 'Invalid admin token provided.',
    });
    return;
  }

  // Audit log successful admin access
  logger.info('Admin access granted', {
    category: 'security',
    event: 'admin_auth_success',
    path: req.path,
    method: req.method,
    ip: req.ip ?? req.socket.remoteAddress,
  });

  next();
};
