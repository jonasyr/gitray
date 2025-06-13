// eslint.config.mjs
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    // Files to ignore
    ignores: [
      'apps/frontend/postcss.config.cjs',
      'apps/frontend/tailwind.config.cjs',
      'prettier.config.js',
      '**/dist/**',
      '**/node_modules/**',
      'apps/backend/src/**/*.js',
      'apps/backend/src/**/*.js.map',
    ],
  },

  // Base configurations
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // React specific configuration
  {
    files: ['**/*.tsx', '**/*.jsx'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',
    },
  },

  // Node.js, Vitest and CommonJS configuration
  {
    files: [
      '**/*.cjs',
      '**/vitest.config.ts',
      '**/vite.config.ts',
      '**/apps/backend/src/**/*.js',
      '**/*.test.ts', // Added to include TypeScript test files
      '**/*.test.tsx', // Added to include TypeScript JSX test files
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest, // Add vitest globals
        module: true,
        require: true,
        exports: true,
        process: true,
        console: true,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },

  prettier,
];
