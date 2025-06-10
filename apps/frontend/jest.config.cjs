/** @typ  transform: {
    '^.+\\.tsx?$': ['ts-jest', { 
      tsconfig: '<rootDir>/tsconfig.app.json',
      useESM: false
    }],
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': 'jest-transform-stub',
  },mport('jest').Config} */
module.exports = {
  displayName: 'frontend',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  rootDir: './',
  testMatch: ['<rootDir>/__tests__/**/*.test.tsx'],
  
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.app.json' }],
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': 'jest-transform-stub',
  },

  moduleNameMapper: {
    '\\.css$': 'identity-obj-proxy',
    '\\.(svg|jpg|jpeg|png|gif|webp)$': '<rootDir>/__mocks__/fileMock.cjs',
    '^ansi-styles$': '<rootDir>/__mocks__/ansi-styles.cjs',
    '^@gitray/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
  },
  
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
