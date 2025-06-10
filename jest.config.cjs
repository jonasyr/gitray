/** @type {import('jest').Config} */
module.exports = {
  collectCoverageFrom: [
    '<rootDir>/apps/*/src/**/*.{ts,tsx}',
    '!<rootDir>/apps/*/src/**/*.d.ts',
    '!<rootDir>/apps/frontend/src/main.tsx',
    '<rootDir>/packages/*/src/**/*.{ts,tsx}',
    '!<rootDir>/packages/*/src/**/*.d.ts',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/packages/*/dist/',
    'main.tsx$',
    '\\.d\\.ts$',
  ],
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/.git/',
    '/coverage/',
    '/.vite/',
    '/.tmp/',
    '/pnpm-lock.yaml',
    '/.eslintcache'
  ],
  watchman: false,
  passWithNoTests: true,

  projects: [
    {
      displayName: 'backend',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/apps/backend/**/__tests__/**/*.test.ts'],
      moduleDirectories: ['node_modules', 'node_modules', '../../node_modules'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
      rootDir: './',
      testPathIgnorePatterns: ['/node_modules/'],
      moduleNameMapper: {
        '^@gitray/shared-types$': '<rootDir>/packages/shared-types/src/index.ts',
      },
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: 'apps/backend/tsconfig.json',
          },
        ],
      },
    },
    {
      displayName: 'frontend',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      rootDir: './',
      testMatch: ['<rootDir>/apps/frontend/**/__tests__/**/*.test.tsx'],
      transform: {
        // ➞ TypeScript Dateien mit ts-jest bearbeiten
        '^.+\\.tsx?$': [
          'ts-jest',
          { tsconfig: 'apps/frontend/tsconfig.jest.json' },
        ],
        // ➞ Assets stubben
        '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
          'jest-transform-stub',
      },

      moduleNameMapper: {
        '\\.css$': 'identity-obj-proxy',
        '\\.(svg|jpg|jpeg|png|gif|webp)$':
          '<rootDir>/apps/frontend/__mocks__/fileMock.cjs',
        '^/vite\\.svg$': '<rootDir>/apps/frontend/__mocks__/fileMock.cjs',
        '^ansi-styles$': '<rootDir>/apps/frontend/__mocks__/ansi-styles.cjs',
        '^@gitray/shared-types$': '<rootDir>/packages/shared-types/src/index.ts',
      },
      setupFilesAfterEnv: ['<rootDir>/apps/frontend/jest.setup.ts'],
      moduleDirectories: [
        'node_modules',
        '<rootDir>/apps/frontend/node_modules',
        '<rootDir>/node_modules',
        '../../node_modules',
      ],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
      testPathIgnorePatterns: ['/node_modules/'],
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
    },
  ],
};