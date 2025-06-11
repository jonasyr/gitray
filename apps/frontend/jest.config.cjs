/** @type {import('jest').Config} */
module.exports = {
  displayName: 'frontend',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  // Use absolute path for rootDir
  rootDir: __dirname,
  // More specific test patterns
  testMatch: [
    '<rootDir>/__tests__/**/*.test.tsx',
    '<rootDir>/__tests__/**/*.test.ts',
    '<rootDir>/__tests__/**/*.test.jsx',
    '<rootDir>/__tests__/**/*.test.js',
  ],

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.app.json',
        useESM: false,
      },
    ],
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      'jest-transform-stub',
  },

  moduleNameMapper: {
    '\\.css$': 'identity-obj-proxy',
    '\\.(svg|jpg|jpeg|png|gif|webp)$': '<rootDir>/__mocks__/fileMock.cjs',
    '^ansi-styles$': '<rootDir>/__mocks__/ansi-styles.cjs',
    '^@gitray/shared-types$':
      '<rootDir>/../../packages/shared-types/src/index.ts',
  },

  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // Add watch-specific settings
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules',
    '<rootDir>/dist',
    '<rootDir>/coverage',
    '<rootDir>/.vite',
  ],
  // Improve test detection
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.vite/'],
  // Clear mocks between tests
  clearMocks: true,
  // Restore mocks between tests
  restoreMocks: true,
};
