import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      './apps/frontend/vitest.config.ts',
      './apps/backend/vitest.config.ts',
      // If you had specific configurations in vitest.workspace.ts
      // that are not in the individual project configs,
      // you might need to replicate them here or ensure they are in the project configs.
      // For example, if you need to specify 'name' or 'root' explicitly,
      // you can use the object syntax for projects:
      // {
      //   name: 'frontend',
      //   root: './apps/frontend', // This is usually inferred from the config path
      //   extends: './apps/frontend/vitest.config.ts'
      // },
      // {
      //   name: 'backend',
      //   root: './apps/backend', // This is usually inferred
      //   extends: './apps/backend/vitest.config.ts'
      // }
      // However, Vitest usually infers project details well from their config files.
      // The simple string array above should work given your setup.
    ],
  },
});
