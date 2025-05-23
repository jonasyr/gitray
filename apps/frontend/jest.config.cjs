/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',

  // Provide a direct mock for ansi-styles
  moduleNameMapper: {
    // CSS-Module
    '\\.css$': 'identity-obj-proxy',
    // Stub für Bild- und SVG-Imports
    '\\.(svg|jpg|jpeg|png|gif|webp)$': '<rootDir>/__mocks__/fileMock.cjs',
    // Mock problematic ESM modules
    '^ansi-styles$': '<rootDir>/__mocks__/ansi-styles.cjs',
  },

  // Transformer for TypeScript files
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json',
      },
    ],
    // Assets
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      'jest-transform-stub',
  },

  // Only transform specific modules
  transformIgnorePatterns: [
    '/node_modules/(?!chalk|pretty-format|@testing-library)/',
  ],

  // Test patterns
  testMatch: ['**/__tests__/**/*.test.tsx'],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // Module resolution
  moduleDirectories: ['node_modules', '../../node_modules'],

  // Other Jest settings
  testTimeout: 10000,
  clearMocks: true,
  passWithNoTests: true,
};
