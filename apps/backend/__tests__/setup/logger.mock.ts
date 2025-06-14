// apps/backend/__tests__/setup/logger.mock.ts
import { vi } from 'vitest';

export const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  http: vi.fn(),
  verbose: vi.fn(),
  silly: vi.fn(),
};

export const getLogger = vi.fn(() => mockLogger);
export const initializeLogger = vi.fn(() => mockLogger);
