/** @type {import('jest').Config} */
module.exports = {
  projects: [
    '<rootDir>/apps/backend',
    '<rootDir>/apps/frontend'
  ],
  collectCoverageFrom: [
    '<rootDir>/apps/*/src/**/*.{ts,tsx}',
    '!<rootDir>/apps/*/src/**/*.d.ts',
    '!<rootDir>/apps/frontend/src/main.tsx',
  ],
  passWithNoTests: true,
};