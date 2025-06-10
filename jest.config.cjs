/** @type {import('jest').Config} */
module.exports = {
  projects: [
    '<rootDir>/apps/backend/jest.config.cjs',
    '<rootDir>/apps/frontend/jest.config.cjs'
  ],
  // Add watch plugins for better monorepo support
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  // Ensure git root is properly detected
  rootDir: '.',
  // Add these for better change detection
  modulePathIgnorePatterns: [
    '<rootDir>/apps/*/dist',
    '<rootDir>/packages/*/dist'
  ],
  // Collect coverage from all projects
  collectCoverageFrom: [
    '<rootDir>/apps/*/src/**/*.{ts,tsx}',
    '!<rootDir>/apps/*/src/**/*.d.ts',
    '!<rootDir>/apps/frontend/src/main.tsx',
  ],
  passWithNoTests: true,
};