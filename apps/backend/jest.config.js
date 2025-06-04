/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Ensure clean state between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Handle ES modules properly
  extensionsToTreatAsEsm: ['.ts'],

  // Module resolution
  moduleNameMapper: {
    '^@gitray/shared-types$':
      '<rootDir>/../../packages/shared-types/src/index.ts',
  },

  // Transform configuration
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: {
          module: 'commonjs',
        },
      },
    ],
  },

  // Test patterns
  testMatch: ['**/__tests__/**/*.test.ts'],

  // Coverage settings
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.test.ts'],

  // Timeout settings
  testTimeout: 30000,

  // Handle async operations properly
  maxWorkers: 1,

  // Setup and teardown
  setupFilesAfterEnv: [],

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  // Module directories
  moduleDirectories: ['node_modules', '<rootDir>/../../node_modules'],

  // Force Jest to exit cleanly
  forceExit: true,

  // Detect open handles for debugging
  detectOpenHandles: false,
};
