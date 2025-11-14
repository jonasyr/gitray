// apps/backend/vitest.config.ts - Create this file
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'path';
import * as os from 'os';

// Vitest uses esbuild under the hood to transform TypeScript files. By default it
// targets CommonJS which results in `exports is not defined` errors when running
// inside this ESM package. Explicitly set the esbuild format to `esm` and align
// the compiler options with the backend tsconfig so tests execute the same code
// shape as production builds.
const tsconfigRaw = {
  compilerOptions: {
    module: 'esnext',
    moduleResolution: 'nodenext',
    target: 'esnext',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    resolveJsonModule: true,
  },
};

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,js}'],
    exclude: ['node_modules', 'dist', 'coverage'],
    // Some of the enhanced coverage suites exercise complex startup logic that
    // requires a bit more time when the full workspace test run is executing,
    // so give them a larger timeout budget.
    testTimeout: 20000,
    setupFiles: ['./__tests__/setup/global.setup.ts'],
    pool: 'threads',
    // isolate: true is the default - keeps tests reliable
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: Math.max(1, Math.floor(os.cpus().length * 0.8)), // Use 80% of available cores
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**'], // Only include files from the src directory for this project
      all: true, // Include all files in src, not just executed ones
      clean: true, // Clean coverage directory before running
      extension: ['.ts'], // <--- Added: Only consider .ts files for coverage
      // skipFull: true,
      exclude: [
        // Paths relative to this project's root (apps/backend)
        'node_modules/**',
        'dist/**', // Excludes apps/backend/dist/**
        'coverage/**',
        '*.config.js',
        '*.config.cjs',
        '*.config.mjs',
        '.*rc.{js,cjs,mjs}',
        '**/*.d.ts',
        'perf/**',

        // Exclude files from frontend project
        '../frontend/dist/**',
        '../frontend/*.config.cjs', // Targets apps/frontend/postcss.config.cjs, apps/frontend/tailwind.config.cjs
        '../frontend/public/**',
        '../frontend/src/test-setup.ts', // Frontend's test setup
        '../frontend/index.html',
        '../frontend/vite.config.ts',
        '../frontend/postcss.config.cjs', // Explicitly again
        '../frontend/tailwind.config.cjs', // Explicitly again

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
      '@gitray/shared-types': path.resolve(
        __dirname,
        '../../packages/shared-types/src'
      ),
    },
  },
  esbuild: {
    target: 'esnext',
    format: 'esm',
    tsconfigRaw,
    supported: {
      'top-level-await': true,
    },
  },
});
