/** @type {import('jest').Config} */
module.exports = {
  displayName: 'backend',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@gitray/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { 
      tsconfig: '<rootDir>/tsconfig.json',
      useESM: false
    }],
  },
};
