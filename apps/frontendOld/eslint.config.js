import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  // Haupt-TypeScript-Konfiguration (unverändert)
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // Configuration for test setup files
  {
    files: ['**/test-setup*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // Disable any rule for test setup files
    },
  },
  // Configuration for CommonJS files (config files, etc.)
  {
    files: ['**/*.cjs', '**/vitest.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        module: true,
        require: true,
      },
    },
  }
);
