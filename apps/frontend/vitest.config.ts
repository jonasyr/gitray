// apps/frontend/vitest.config.ts - Create this file
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'coverage'],
    css: false,
    deps: {
      inline: ['@testing-library/user-event'],
    },
  },
  resolve: {
    alias: {
      '@gitray/shared-types': path.resolve(
        __dirname,
        '../../packages/shared-types/src'
      ),
    },
  },
});
