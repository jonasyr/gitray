<!-- markdownlint-disable -->
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GitRay** is a Git visualization tool built as a pnpm monorepo with TypeScript. It provides advanced Git repository analysis, visualization, and metrics through a React frontend and Express backend.

### Architecture
- **Monorepo Structure**: pnpm workspaces with TypeScript project references
- **Frontend**: React 19 + Vite 6 + Tailwind CSS 4
- **Backend**: Express 5 + simple-git for Git operations
- **Shared**: TypeScript type definitions shared across workspaces

## Development Commands

### Package Management
This project uses **pnpm** exclusively:
- `pnpm install` - Install all dependencies across workspaces
- `pnpm update` - Update dependencies
- `pnpm audit` - Check for security vulnerabilities

### Environment Management
Docker-based development environment managed via scripts:
- `pnpm start` or `./scripts/start.sh dev` - Start full stack (backend + frontend + Redis)
- `pnpm run quick` or `./scripts/start.sh quick` - Quick start without rebuilding
- `pnpm run env:status` - Check Docker container status
- `pnpm run env:stop` - Stop all containers
- `pnpm run env:clean` - Clean up Docker environment

### Build Commands
Build must follow correct order due to TypeScript project references:
- `pnpm run build` - Full production build (shared-types → backend → frontend)
- `pnpm run build:shared-types` - Build shared type definitions (required first)
- `pnpm run build:apps` - Build backend and frontend applications
- `pnpm --filter backend build` - Build backend only
- `pnpm --filter frontend build` - Build frontend only

### Development Servers
- `pnpm run dev` - Start all workspaces in development mode
- `pnpm run dev:frontend` - Start frontend dev server only (Vite on port 5173)
- `pnpm run dev:backend` - Start backend dev server only (Express with nodemon)

### Testing Commands
Uses Vitest for all testing:
- `pnpm test` - Run all tests across workspaces
- `pnpm run test:frontend` - Run frontend tests only
- `pnpm run test:backend` - Run backend tests only
- `pnpm run test:watch` - Run tests in watch mode
- `pnpm run test:watch:changed` - Watch mode for changed files only
- `pnpm run test:ui` - Open Vitest UI for interactive testing
- `pnpm run test:coverage` - Generate coverage report (merged from all workspaces)

### Performance Testing
Backend includes k6 load testing:
- `pnpm --filter backend run test:perf` - Standard load test
- `pnpm --filter backend run test:perf:smoke` - Quick 5-user smoke test (30s)
- `pnpm --filter backend run test:perf:stress` - 2x load stress test

### Code Quality Commands
- `pnpm run lint` - Run ESLint (flat config) on all files
- `pnpm run lint:fix` - Auto-fix ESLint issues
- `pnpm run lint:md` - Lint markdown files
- `pnpm run format` - Format all files with Prettier
- TypeScript type checking happens automatically via `tsc -b` in build commands

### Cleanup Commands
- `pnpm run clean` - Clean dist, cache, and node_modules
- `pnpm run clean:dist` - Remove build artifacts and coverage
- `pnpm run clean:cache` - Remove Vite/ESLint caches
- `pnpm run clean:node_modules` - Remove all node_modules
- `pnpm run rebuild` - Full clean reinstall and rebuild

## Technology Stack

### Core Technologies
- **TypeScript 5.7** - Primary language with strict mode
- **Node.js** - Runtime environment
- **pnpm 10.16.1** - Fast, disk-efficient package manager

### Frontend Stack
- **React 19** - UI library with modern hooks
- **Vite 6** - Lightning-fast dev server and build tool
- **Tailwind CSS 4** - Utility-first CSS framework
- **ApexCharts** - Interactive data visualization
- **react-calendar-heatmap** - Activity heatmap visualization
- **Axios** - HTTP client for API requests
- **date-fns** - Modern date utility library

### Backend Stack
- **Express 5** - Web application framework
- **simple-git** - Git operations and repository analysis
- **ioredis** - Redis client for caching
- **winston** - Structured logging with daily rotation
- **Zod** - Runtime type validation
- **Helmet** - Security headers middleware
- **express-rate-limit** - API rate limiting
- **express-validator** - Request validation middleware
- **prom-client** - Prometheus metrics

### Testing & Quality
- **Vitest 3** - Fast unit test framework (Vite-powered)
- **@testing-library/react** - React component testing
- **@testing-library/user-event** - User interaction simulation
- **Supertest** - HTTP assertion library for API testing
- **k6** - Load and performance testing
- **ESLint 9** - Linting with flat config
- **eslint-plugin-sonarjs** - Code quality and bug detection
- **eslint-plugin-react-hooks** - React hooks rules
- **Prettier 3** - Code formatting
- **Husky** - Git hooks for pre-commit checks
- **lint-staged** - Run linters on staged files

### Development Tools
- **tsx** - TypeScript execution for Node.js
- **nodemon** - Auto-restart dev server on changes
- **nyc** - Coverage report merging
- **rimraf** - Cross-platform file deletion

## Project Structure

### Monorepo Layout
```
gitray/
├── apps/
│   ├── backend/              # Express API server
│   │   ├── src/
│   │   │   ├── index.ts      # App entry point
│   │   │   ├── routes/       # API route definitions
│   │   │   ├── services/     # Business logic (Git, cache, etc.)
│   │   │   └── middlewares/  # Express middleware
│   │   └── package.json
│   └── frontend/             # React + Vite application
│       ├── src/
│       │   ├── main.tsx      # React entry point
│       │   ├── App.tsx       # Root component
│       │   ├── components/   # React components
│       │   ├── pages/        # Page-level components
│       │   └── services/     # API client
│       └── package.json
├── packages/
│   └── shared-types/         # Shared TypeScript definitions
│       ├── src/
│       │   └── index.ts      # Type exports
│       └── package.json
├── scripts/                  # Build and deployment scripts
├── package.json              # Root workspace configuration
├── pnpm-workspace.yaml       # pnpm workspace definition
├── tsconfig.json             # TypeScript project references
└── vitest.config.ts          # Vitest workspace configuration
```

### Backend Structure
```
apps/backend/src/
├── index.ts                  # Express app setup, middleware, routes
├── routes/
│   ├── index.ts              # Route aggregation
│   ├── repositoryRoutes.ts   # Repository management endpoints
│   ├── commitRoutes.ts       # Commit analysis endpoints
│   └── healthRoutes.ts       # Health check endpoints
├── services/
│   ├── cache.ts              # Redis caching layer
│   ├── repositoryCoordinator.ts  # Repository lifecycle management
│   ├── repositoryHandle.ts   # Git repository operations
│   └── process.ts            # Background process management
└── middlewares/
    ├── errorHandler.ts       # Global error handling
    ├── validation.ts         # Request validation
    ├── requestId.ts          # Request ID tracking
    └── memoryPressureMiddleware.ts  # Memory monitoring
```

### Frontend Structure
```
apps/frontend/src/
├── main.tsx                  # React DOM render
├── App.tsx                   # Root component with routing
├── components/
│   ├── RepoInput.tsx         # Repository URL input
│   ├── ActivityHeatmap.tsx   # Contribution heatmap
│   ├── CommitList.tsx        # Commit history display
│   ├── RiveLoader.tsx        # Loading animations
│   └── RiveLogo.tsx          # Animated logo
├── pages/
│   └── MainPage.tsx          # Main dashboard page
└── services/
    └── api.ts                # Axios API client
```

### Naming Conventions
- **Files**: PascalCase for React components (`ActivityHeatmap.tsx`), camelCase for utilities
- **Components**: PascalCase (`CommitList`, `RepoInput`)
- **Functions**: camelCase (`getCommitHistory`, `validateRepository`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`, `MAX_RETRIES`)
- **Types/Interfaces**: PascalCase (`RepositoryMetadata`, `CommitData`)

## TypeScript Configuration

### Project References
This project uses TypeScript project references for faster builds:
1. `packages/shared-types` - Built first, provides types to other packages
2. `apps/backend` - Depends on shared-types
3. `apps/frontend` - Depends on shared-types

**Important**: Always build `shared-types` first when making type changes:
```bash
pnpm run build:shared-types
```

### Type Safety Guidelines
- **Strict mode enabled** - All TypeScript strict checks are on
- Use explicit types for function parameters and return values
- Prefer interfaces over types for object shapes
- Use Zod schemas for runtime validation (backend)
- Avoid `any` - use `unknown` when type is uncertain
- Leverage utility types (`Partial`, `Pick`, `Omit`, `Record`)

## Code Quality Standards

### ESLint Configuration
Uses ESLint 9 flat config (`eslint.config.mjs`):
- TypeScript ESLint rules with type checking
- React and React Hooks plugins
- SonarJS for code quality and bug detection
- Accessibility rules (jsx-a11y)
- Prettier integration to avoid conflicts

### Prettier Configuration
See `prettier.config.js`:
- Consistent formatting across all file types
- Applied automatically via pre-commit hooks

### Testing Standards
- **Vitest** for all unit and integration tests
- Test files use `.test.ts` or `.test.tsx` suffix
- Place tests alongside source files or in `__tests__` directories
- Use `@testing-library` for React component testing
- Mock external dependencies (Git, Redis, file system)
- Aim for high coverage on business logic (services, utilities)

### Pre-commit Hooks
Husky runs lint-staged before commits:
- Auto-fix ESLint issues on `.ts`, `.tsx`, `.js`, `.jsx` files
- Format with Prettier
- Lint markdown with markdownlint-cli2

## Git Workflow

### Development Process
1. Work on feature/fix branches
2. Write tests for new functionality
3. Run `pnpm test` to verify tests pass
4. Run `pnpm run lint` to check code quality
5. Commit changes (hooks will auto-format)
6. Push and create PR to `dev` branch

### Commit Messages
Follow conventional commit format:
- `feat: add commit frequency analysis`
- `fix: correct timezone handling in heatmap`
- `test: add coverage for repository cleanup`
- `refactor: simplify cache invalidation logic`
- `docs: update API endpoint documentation`

## Development Workflow

### Initial Setup
1. Ensure Node.js 18+ is installed
2. Install pnpm: `npm install -g pnpm@10.16.1`
3. Clone repository and `cd gitray`
4. Copy `.env` from `.env.example` (if exists)
5. Run `pnpm install` to install all dependencies
6. Run `pnpm start` to start Docker environment

### Daily Development
1. Pull latest changes: `git pull origin dev`
2. Install new dependencies if package.json changed: `pnpm install`
3. If types changed, rebuild: `pnpm run build:shared-types`
4. Start dev servers: `pnpm run dev` or `pnpm run dev:frontend` / `dev:backend`
5. Make changes and verify with tests: `pnpm test`
6. Check code quality: `pnpm run lint`

### Before Committing
Pre-commit hooks will automatically run, but manually verify:
1. Tests pass: `pnpm test`
2. Linting passes: `pnpm run lint`
3. Build succeeds: `pnpm run build`
4. No TypeScript errors (checked during build)

### Performance Considerations
- Backend uses Redis for caching repository data
- Repository handles are pooled and reused
- Memory pressure monitoring prevents OOM issues
- Rate limiting protects API endpoints
- Use k6 tests to verify performance after changes

## Security Guidelines

### Dependencies
- Audit regularly: `pnpm audit`
- Keep dependencies updated
- Lock file (`pnpm-lock.yaml`) is committed
- Avoid packages with known vulnerabilities

### Backend Security
- Helmet middleware for security headers
- CORS configured for frontend origin only
- Rate limiting on all API endpoints
- Request validation with express-validator and Zod
- Input sanitization for Git operations
- No arbitrary command execution
- Environment variables for sensitive config

### Git Operations
- Repository cloning happens in isolated directories
- Path traversal protection
- Resource limits on repository size
- Cleanup of temporary clones

## Common Tasks

### Adding a New API Endpoint
1. Define route in `apps/backend/src/routes/`
2. Add validation middleware
3. Implement business logic in `apps/backend/src/services/`
4. Add types to `packages/shared-types/src/`
5. Write tests in adjacent `.test.ts` file
6. Update frontend API client in `apps/frontend/src/services/api.ts`

### Adding a New React Component
1. Create component in `apps/frontend/src/components/`
2. Import and use in pages or other components
3. Add types from `@gitray/shared-types`
4. Write component tests with Testing Library
5. Style with Tailwind CSS classes

### Updating Shared Types
1. Modify types in `packages/shared-types/src/index.ts`
2. Run `pnpm run build:shared-types`
3. TypeScript will auto-detect changes in dependent projects
4. Verify with `pnpm run build` across all workspaces

### Debugging
- Backend logs to console (Winston) and file (daily rotation)
- Frontend uses React DevTools
- VSCode launch configs may be available in `.vscode/`
- Use `pnpm run test:ui` for interactive test debugging
- Check Redis cache: connect to Redis in Docker container

## Troubleshooting

### Build Failures
- Ensure shared-types is built first: `pnpm run build:shared-types`
- Clear build cache: `pnpm run clean:dist`
- Reinstall: `pnpm run clean:node_modules && pnpm install`

### Test Failures
- Check if services (Redis) are running: `pnpm run env:status`
- Clear test cache: `pnpm run clean:cache`
- Run specific test file: `pnpm test <path-to-test>`

**Common Mock-Related Test Failures:**
- If you see errors about missing exports in mocks (e.g., "No 'lockConfig' export is defined on the mock"):
  - Ensure all config exports are properly mocked in test files
  - Check that vi.mock() includes all necessary exports from the config module
  - The config module exports: `hybridCacheConfig`, `lockConfig`, `streamingConfig`, `debugConfig`, `repositoryCacheConfig`, `operationCoordinationConfig`, `cacheStrategyConfig`, `memoryPressureConfig`
  - Use `importOriginal` helper for partial mocks when only specific exports need to be mocked

### Docker Issues
- Stop and restart: `pnpm run env:stop && pnpm start`
- Full cleanup: `pnpm run env:clean`
- Check logs: `docker-compose logs -f`

### Performance Issues
- Run performance tests: `pnpm --filter backend run test:perf:smoke`
- Check Redis connection and cache hit rates
- Monitor memory usage (backend has memory pressure middleware)
