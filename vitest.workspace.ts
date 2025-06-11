import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'frontend',
      root: './apps/frontend',
      environment: 'jsdom',
    },
    extends: './apps/frontend/vitest.config.ts',
  },
  {
    test: {
      name: 'backend',
      root: './apps/backend',
      environment: 'node',
    },
    extends: './apps/backend/vitest.config.ts',
  },
]);
