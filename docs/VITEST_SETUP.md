# docs/VITEST_SETUP.md

## Vitest Testing Configuration

This document explains how we've configured Vitest for testing in our monorepo setup.

### Migration from Jest

The project has been migrated from Jest to Vitest for better ESM support, faster test
execution, and improved monorepo compatibility.

### Configuration Structure

#### Root Configuration (`vitest.config.ts`)

- Defines workspace projects for frontend and backend
- Shared configuration across all packages

#### Frontend Configuration (`apps/frontend/vitest.config.ts`)

- React/JSX support via `@vitejs/plugin-react`
- JSDOM environment for browser-like testing
- Test setup file for global configurations

#### Backend Configuration (`apps/backend/vitest.config.ts`)

- Node.js environment for server-side testing
- Direct TypeScript support

### Key Features

1. **ESM Native Support**: No complex transformations needed
2. **Fast Execution**: Significantly faster than Jest
3. **Vite Integration**: Seamless integration with Vite build system
4. **Jest-DOM Compatibility**: Still uses `@testing-library/jest-dom` matchers
5. **Hot Module Replacement**: Fast feedback during test development

### Test Commands

```bash
# Run all tests
pnpm test

# Run frontend tests only
pnpm test:frontend

# Run backend tests only
pnpm test:backend

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run tests with UI
pnpm test:ui
```

### Mock Configuration

Vitest uses `vi.mock()` instead of `jest.mock()`:

```typescript
import { vi } from 'vitest';

// Mock a module
vi.mock('@rive-app/react-canvas', () => ({ 
  useRive: vi.fn() 
}));

// Mock functions
const mockFn = vi.fn();
```

### Environment Setup

The frontend test setup (`apps/frontend/src/test-setup.ts`) includes:

- `@testing-library/jest-dom` matchers
- `window.matchMedia` mock for responsive tests
- React 19 compatibility
- Automatic cleanup after each test

### Coverage Reports

Coverage is generated using `@vitest/coverage-v8` and merged across projects using
`nyc` for comprehensive reporting.
