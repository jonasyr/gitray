import { RATE_LIMIT, GIT_SERVICE } from '@gitray/shared-types';

export const config = {
  port: process.env.PORT || 3001,
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },
  rateLimit: {
    windowMs: RATE_LIMIT.WINDOW_MS,
    max: RATE_LIMIT.MAX_REQUESTS,
    message: RATE_LIMIT.MESSAGE,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  git: {
    maxConcurrentProcesses: GIT_SERVICE.MAX_CONCURRENT_PROCESSES,
    cloneDepth: GIT_SERVICE.CLONE_DEPTH,
  },
};
