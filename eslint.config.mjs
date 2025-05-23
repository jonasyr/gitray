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

  // Node.js, Jest und CommonJS-Konfiguration
  {
    files: [
      '**/*.cjs',
      '**/jest.config.js',
      '**/jest.config.cjs',
      '**/jest-transforms/**/*.cjs',
      '**/jest-transforms/**/*.js',
      '**/apps/backend/src/**/*.js',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        module: true,
        require: true,
        jest: true,
        exports: true,
        process: true,
        console: true,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': 'warn'
    }
  },

  prettier,
];
