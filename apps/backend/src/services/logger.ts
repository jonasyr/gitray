import winston from 'winston';
import { Request } from 'express';

// Base application logger configured with timestamp and colorized output

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'gitray-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

export const createRequestLogger = (req: Request) => {
  // Attach request specific metadata to each log entry
  return logger.child({
    requestId: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
};

export default logger;
