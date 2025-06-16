// apps/backend/__tests__/setup/dotenv.mock.ts
import { vi } from 'vitest';

export const dotenvMock = {
  default: {
    config: vi.fn(),
  },
  config: vi.fn(),
};
