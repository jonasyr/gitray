import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { Request } from 'express';
import path from 'path';
import fs from 'fs';

// Enhanced application logger with file rotation and structured logging

let logger: winston.Logger;

// Initialize logger function (call after dotenv.config())
export const initializeLogger = () => {
  // Ensure logs directory exists
  const logDir = process.env.LOG_DIR ?? './logs';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Simple console format with proper colors
  const consoleFormat = winston.format.combine(
    winston.format.timestamp({
      format: 'HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(
      ({
        timestamp,
        level,
        message,
        requestId,
        method,
        path: reqPath,
        stack,
      }) => {
        let baseLog = `${timestamp} ${level}`;

        // Add request info if present (simplified)
        if (requestId && method && reqPath) {
          baseLog += ` [${method} ${reqPath}]`;
        }

        baseLog += `: ${message}`;

        // Add stack trace for errors
        if (stack) {
          baseLog += `\n${stack}`;
        }

        return baseLog;
      }
    )
  );

  // JSON format for file logs (better for log analysis)
  const jsonFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  // Create transports array
  const transports: winston.transport[] = [];

  // Console transport (simple and clean)
  if (process.env.LOG_ENABLE_CONSOLE !== 'false') {
    transports.push(
      new winston.transports.Console({
        level: process.env.LOG_CONSOLE_LEVEL ?? 'info',
        format: consoleFormat,
      })
    );
  }

  // Helper function to parse file size to bytes
  const parseFileSize = (size: string): number => {
    const units = { b: 1, k: 1024, m: 1024 * 1024, g: 1024 * 1024 * 1024 };
    const regex = /^(\d+)([bkmg]?)$/;
    const match = regex.exec(size.toLowerCase());
    if (!match) return 10 * 1024 * 1024; // Default 10MB
    const [, num, unit] = match;
    return parseInt(num) * (units[unit as keyof typeof units] || 1);
  };

  // File transports (if enabled)
  if (process.env.LOG_TO_FILE === 'true') {
    const maxSize = parseFileSize(process.env.LOG_FILE_MAX_SIZE ?? '10m');
    const maxFiles = parseInt(process.env.LOG_FILE_MAX_FILES ?? '10');
    const datePattern = process.env.LOG_DATE_PATTERN ?? 'YYYY-MM-DD';

    // Combined log file (all levels) - using DailyRotateFile
    if (process.env.LOG_ENABLE_COMBINED_FILE !== 'false') {
      transports.push(
        new DailyRotateFile({
          filename: path.join(logDir, 'combined-%DATE%.log'),
          datePattern,
          maxSize,
          maxFiles,
          zippedArchive: true,
          format: jsonFormat,
        })
      );
    }

    // Error log file (error level only) - using DailyRotateFile
    if (process.env.LOG_ENABLE_ERROR_FILE !== 'false') {
      transports.push(
        new DailyRotateFile({
          filename: path.join(logDir, 'error-%DATE%.log'),
          datePattern,
          maxSize,
          maxFiles,
          zippedArchive: true,
          level: 'error',
          format: jsonFormat,
        })
      );
    }

    // Application-specific log file - using DailyRotateFile
    transports.push(
      new DailyRotateFile({
        filename: path.join(logDir, 'application-%DATE%.log'),
        datePattern,
        maxSize,
        maxFiles,
        zippedArchive: true,
        format: jsonFormat,
      })
    );

    // Performance log file (for cache hits, coordination metrics, etc.) - using DailyRotateFile
    transports.push(
      new DailyRotateFile({
        filename: path.join(logDir, 'performance-%DATE%.log'),
        datePattern,
        maxSize,
        maxFiles,
        zippedArchive: true,
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
      })
    );
  }

  logger = winston.createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    defaultMeta: {
      service: 'gitray-backend',
      pid: process.pid,
      hostname: process.env.HOSTNAME ?? 'unknown',
    },
    transports,
    // Handle uncaught exceptions and unhandled rejections
    exceptionHandlers:
      process.env.LOG_TO_FILE === 'true'
        ? [
            new winston.transports.File({
              filename: path.join(logDir, 'exceptions.log'),
              format: jsonFormat,
            }),
          ]
        : undefined,
    rejectionHandlers:
      process.env.LOG_TO_FILE === 'true'
        ? [
            new winston.transports.File({
              filename: path.join(logDir, 'rejections.log'),
              format: jsonFormat,
            }),
          ]
        : undefined,
  });

  // Log startup information
  logger.info('Logger initialized', {
    logLevel: process.env.LOG_LEVEL ?? 'info',
    logToFile: process.env.LOG_TO_FILE === 'true',
    logDir: process.env.LOG_TO_FILE === 'true' ? logDir : 'disabled',
    nodeEnv: process.env.NODE_ENV ?? 'development',
  });

  return logger;
};

// Add request-specific logger factory
export const createRequestLogger = (req: Request) => {
  const requestId =
    req.headers['x-request-id'] ??
    req.headers['x-correlation-id'] ??
    Math.random().toString(36).substring(2, 15);

  return logger.child({
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip ?? req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });
};

// Add performance logger for cache and coordination metrics
export const createPerformanceLogger = () => {
  return logger.child({ type: 'performance' });
};

// Add structured logging helpers
export const logCacheEvent = (event: string, data: Record<string, any>) => {
  logger.info(`Cache ${event}`, {
    type: 'performance',
    category: 'cache',
    event,
    ...data,
  });
};

export const logCoordinationEvent = (
  event: string,
  data: Record<string, any>
) => {
  logger.info(`Coordination ${event}`, {
    type: 'performance',
    category: 'coordination',
    event,
    ...data,
  });
};

export const logRepositoryEvent = (
  event: string,
  repoUrl: string,
  data: Record<string, any> = {}
) => {
  logger.info(`Repository ${event}`, {
    type: 'performance',
    category: 'repository',
    event,
    repoUrl,
    ...data,
  });
};

// Get the logger instance (with lazy initialization)
export const getLogger = () => {
  if (!logger) {
    // Auto-initialize if not already done (fallback for modules loaded early)
    initializeLogger();
  }
  return logger;
};

// Default export for backward compatibility
export default { getLogger };
