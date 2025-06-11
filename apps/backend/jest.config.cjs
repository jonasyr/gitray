/** @type {import('jest').Config} */
module.exports = {
  displayName: 'backend',
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Use absolute path for rootDir
  rootDir: __dirname,
  // More specific test patterns
  testMatch: [
    '<rootDir>/__tests__/**/*.test.ts',
    '<rootDir>/__tests__/**/*.test.js',
  ],
  // Ensure proper module resolution
  moduleNameMapper: {
    '^@gitray/shared-types$':
      '<rootDir>/../../packages/shared-types/src/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        useESM: false,
      },
    ],
  },
  // Add watch-specific settings
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules',
    '<rootDir>/dist',
    '<rootDir>/coverage',
    '<rootDir>/.tmp',
  ],
  // Improve test detection
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.tmp/'],
  // Clear mocks between tests
  clearMocks: true,
  // Restore mocks between tests
  restoreMocks: true,
};
