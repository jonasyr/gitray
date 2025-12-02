// eslint.config.mjs
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config(
  {
    // Files to ignore
    ignores: [
      'eslint.config.mjs', // Config file itself
      'apps/frontend/postcss.config.cjs',
      'apps/frontend/tailwind.config.cjs',
      'prettier.config.js',
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      'apps/backend/src/**/*.js',
      'apps/backend/src/**/*.js.map',
      'apps/backend/perf/load-test.ts', // k6-specific TypeScript
    ],
  },

  // Base JavaScript configuration
  js.configs.recommended,

  // Backend TypeScript files (exclude config and perf files)
  {
    files: ['apps/backend/**/*.ts'],
    ignores: [
      'apps/backend/vitest.config.ts',
      'apps/backend/test-config-dynamic.mjs',
      'apps/backend/perf/**/*.ts',
    ],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'sonarjs': sonarjs,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: path.join(__dirname, 'apps/backend'),
      },
      globals: {
        ...globals.node,
        NodeJS: 'readonly',
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      'complexity': ['warn', { max: 15 }],
      'sonarjs/cognitive-complexity': ['warn', 15],
    },
  },

  // Frontend TypeScript files (exclude config files)
  {
    files: ['apps/frontend/**/*.ts'], // Only .ts files, .tsx handled by React config
    ignores: [
      'apps/frontend/vite.config.ts',
      'apps/frontend/vitest.config.ts',
    ],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'sonarjs': sonarjs,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.app.json',
        tsconfigRootDir: path.join(__dirname, 'apps/frontend'),
      },
      globals: {
        ...globals.browser,
        ...globals.vitest, // Add vitest globals for test files
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      'complexity': ['warn', { max: 15 }],
      'sonarjs/cognitive-complexity': ['warn', 15],
    },
  },

  // Shared types TypeScript files
  {
    files: ['packages/shared-types/**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'sonarjs': sonarjs,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: path.join(__dirname, 'packages/shared-types'),
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        // Allow unused constructor parameters (they're used as public/readonly class properties)
        args: 'after-used',
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      'complexity': ['warn', { max: 15 }],
      'sonarjs/cognitive-complexity': ['warn', 15],
    },
  },

  // React specific configuration
  {
    files: ['apps/frontend/**/*.tsx', 'apps/frontend/**/*.jsx'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'sonarjs': sonarjs,
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.app.json',
        tsconfigRootDir: path.join(__dirname, 'apps/frontend'),
      },
      globals: {
        ...globals.browser,
        ...globals.vitest,
        React: 'readonly',
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      'complexity': ['warn', { max: 15 }],
      'sonarjs/cognitive-complexity': ['warn', 15],
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',
    },
  },

  // Node.js, Vitest and CommonJS configuration (backend tests only)
  {
    files: [
      '**/*.cjs',
      'apps/backend/**/*.test.ts',
      'apps/backend/**/__tests__/**/*.ts',
    ],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
        module: true,
        require: true,
        exports: true,
        process: true,
        console: true,
        NodeJS: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-unused-vars': 'warn',
      'no-undef': 'off', // TypeScript handles this
    },
  },

  // Frontend and backend config files (vite, vitest)
  {
    files: [
      'apps/frontend/vite.config.ts',
      'apps/frontend/vitest.config.ts',
      'apps/backend/vitest.config.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        __dirname: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },

  // k6 load testing files
  {
    files: ['**/perf/**/*.ts'],
    languageOptions: {
      globals: {
        __ENV: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off', // k6 has special globals
    },
  },
);
