// apps/frontend/vitest.config.ts - Create this file
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import * as path from 'path';
import * as os from 'os';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'coverage'],
    css: false,
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: Math.max(1, Math.floor(os.cpus().length * 0.8)), // Use 80% of available cores
      },
    },
    server: {
      deps: {
        inline: ['@testing-library/user-event'],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      all: false,
      clean: true,
      extension: ['.ts', '.tsx'],
      skipFull: true,
      exclude: [
        // Paths relative to this project's root (apps/frontend)
        'node_modules/**',
        'dist/**', // Excludes apps/frontend/dist/**
        'coverage/**',
        '*.config.js', // Includes its own vite.config.ts if not desired, but usually fine
        '*.config.cjs', // Includes its own postcss.config.cjs, tailwind.config.cjs
        '*.config.mjs',
        '.*rc.{js,cjs,mjs}', // e.g. .eslintrc.js in project root
        'src/test-setup.ts', // Its own test setup
        '**/*.d.ts',
        'public/**',
        'index.html', // Its own index.html

        // Exclude files from backend project
        '../backend/dist/**',
        '../backend/perf/**',
        '../backend/*.config.ts', // Backend's vitest.config.ts

        // Exclude files from shared-types package dist
        '../../packages/shared-types/dist/**',

        // Exclude files from workspace root
        '../../eslint.config.mjs',
        '../../prettier.config.js',
        '../../vitest.workspace.ts',
        '../../tsconfig.json',
        '../../pnpm-workspace.yaml',
        '../../package.json',
        '../../sonar-project.properties',
        '../../README.md',
        // Add any other root files that might get picked up
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@gitray/shared-types': path.resolve(
        __dirname,
        '../../packages/shared-types/src'
      ),
    },
  },
});
