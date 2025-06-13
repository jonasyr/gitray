import { RATE_LIMIT, GIT_SERVICE } from '@gitray/shared-types';

// Consolidated runtime configuration values

export const config = {
  // Port the backend listens on
  port: process.env.PORT ?? 3001,
  // Allowed CORS origin for the frontend
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  },
  // Express rate limiting options
  rateLimit: {
    windowMs: RATE_LIMIT.WINDOW_MS,
    max: RATE_LIMIT.MAX_REQUESTS,
    message: RATE_LIMIT.MESSAGE,
  },
  // Redis connection settings
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379'),
  },
  // Git defaults used by GitService
  git: {
    maxConcurrentProcesses: GIT_SERVICE.MAX_CONCURRENT_PROCESSES,
    cloneDepth: GIT_SERVICE.CLONE_DEPTH,
  },
};
