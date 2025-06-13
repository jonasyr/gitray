# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GitRay is a Git visualization tool designed to help developers, teams, and researchers understand
repository history through interactive visualizations. The project is structured as a monorepo,
with a frontend React app and a backend Node.js/Express service.

## Commands

### Installation

```bash
pnpm install
```

### Development

```bash
# Run both frontend and backend
pnpm run dev

# Run only frontend
pnpm run dev:frontend

# Run only backend
pnpm run dev:backend
```

### Building

```bash
# Build shared types, backend, and frontend
pnpm run build
```

### Testing

```bash
# Run all tests
pnpm run test

# Run frontend tests only
pnpm run test:frontend

# Run backend tests only
pnpm run test:backend

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage report
pnpm run test:coverage
```

### Running a single test

```bash
# Run a specific test file
pnpm test -- -t "test name pattern" apps/backend/__tests__/specific-file.test.ts

# Run tests matching a pattern in a specific directory
pnpm test -- apps/frontend/__tests__/components
```

### Linting and Formatting

```bash
# Lint all JS/TS files
pnpm run lint

# Lint markdown files
pnpm run lint:md

# Auto-fix linting issues
pnpm run lint:fix

# Format code with Prettier
pnpm run format
```

## Architecture and Structure

### Monorepo Structure

- Uses pnpm workspaces for package management
- Three main packages:

  - `apps/frontend`: React application with Vite and Tailwind CSS
  - `apps/backend`: Express.js server with Git service functionality
  - `packages/shared-types`: Shared TypeScript interfaces

### Backend Architecture

- Express routes in `apps/backend/src/routes/`
- Git operations abstracted in `apps/backend/src/services/gitService.ts`
- Error handling middleware in `apps/backend/src/middlewares/`

#### Git Service Functionality

The core backend functionality revolves around the `GitService` class, which:

1. Clones repositories into temporary directories
2. Retrieves commit history from cloned repositories
3. Cleans up temporary directories when operations complete

### Frontend Architecture

- React 19 + Vite 6 + TypeScript + Tailwind CSS
- Currently uses a simple UI template but will implement visualization components using D3.js/visx
- Component structure follows React best practices with TypeScript

### Testing Strategy

- Vitest configured for both backend and frontend
- Backend tests use Node.js environment
- Frontend tests use JSDOM environment
- Mock implementations for API services

### Testing Patterns

#### AAA Pattern (Arrange-Act-Assert)

All tests should follow the AAA pattern:

1. **Arrange**: Set up the test environment and preconditions

   - Mock dependencies
   - Define inputs and expected outputs
   - Set up any necessary state

2. **Act**: Execute the code being tested

   - Call the function/method being tested

3. **Assert**: Verify that the expected outcomes occurred

   - Check return values
   - Verify mock functions were called correctly
   - Validate any state changes

#### Happy Path Testing

Tests should focus on the "Happy Path" - the primary successful execution flow:

- Test the most common and important use cases first
- Minimize test count while maintaining good coverage
- Add edge cases and error scenarios only when critical to functionality

Example test structure:

```typescript
test('should perform expected operation', async () => {
  // Arrange
  const input = 'test input';
  mockDependency.mockResolvedValue(expectedResult);

  // Act
  const result = await functionUnderTest(input);

  // Assert
  expect(result).toEqual(expectedResult);
  expect(mockDependency).toHaveBeenCalledWith(input);
});
```

## Branch Strategy

- `main`: Production-ready code
- `dev`: Development branch where features are merged
- `feature/<name>`: Feature branches
- `bugfix/<name>`: Bug fix branches

When creating PRs, target the `dev` branch.
