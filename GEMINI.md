<!-- markdownlint-disable -->

# GitRay

GitRay is a production-ready Git repository analysis and visualization platform that transforms commit history into interactive visualizations such as heatmaps, commit statistics, code churn analysis and time-series aggregations.

## ⚠ Known critical defect — read before touching the backend

**The dashboard is currently broken on any repository that is not already cached.**

Firing the four live endpoints concurrently — which is exactly what `DashboardPage.tsx` does —
returns HTTP **500** from `/api/repositories/summary` and `/api/repositories/churn`. Reproduced on
3 of 3 cold repositories. Run one at a time, all four succeed.

**Root cause (C-1):** `lockManager.withKeyLock` deduplicates on the *lock name* rather than the
operation, so concurrent operations sharing a lock key receive each other's payloads. The route
handlers then dereference a field the wrong payload does not have:

- `repositoryRoutes.ts:219` → `churnData.files.length` → `Cannot read properties of undefined`
- `repositoryRoutes.ts:246` → `summary.repository.name` → `Cannot read properties of undefined`

**Reproduce it:**

```bash
R="https://github.com/sindresorhus/p-limit.git"; B=http://localhost:3001
for ep in "repositories/full-data?repoUrl=$R" "repositories/summary?repoUrl=$R" \
          "repositories/churn?repoUrl=$R" "commits/file-analysis?repoUrl=$R"; do
  curl -s -o /dev/null -w "$ep -> %{http_code}\n" "$B/api/$ep" &
done; wait
```

**Do not build features on top of this.** The fix is Phase 1 of the migration plan. Full analysis,
including four other verified defects and the recommended refactor, is in
`docs/BACKEND_ARCHITECTURE_AUDIT.md`.

Also note: the test suite is **non-deterministic** (finding C-8) — the same command has produced
four different outcomes on an unmodified tree. A green run is not proof.


## Development Environment

### Prerequisites

- Node.js 18+
- pnpm 10.16.1
- Docker (for Redis)
- Git

The recommended local development environment has at least 4 GB of RAM (8 GB+ for large repositories) and 2 GB of free disk space.

### Clone & Install

Use `git clone` to clone the repository, then run `pnpm install` from the project root to install dependencies across all packages (root, backend, frontend, shared types).

### Building Shared Types

Build the `@gitray/shared-types` package before running apps using:

```bash
pnpm run build:shared-types
```

### Environment Variables

Copy `.env.example` files into `apps/backend/.env` and `apps/frontend/.env`. Configure at least:

- `PORT`
- `CORS_ORIGIN`
- `REDIS_HOST`
- `REDIS_PORT`
- `CACHE_MAX_ENTRIES`
- `MEMORY_WARNING_THRESHOLD`
- `STREAMING_ENABLED`

### Development Scripts

- `pnpm app` – interactive menu to start services
- `pnpm start` – full development setup, including building shared types, starting Redis and launching backend and frontend
- `pnpm quick` – quick start that launches only the frontend (assumes backend is running)
- `pnpm dev` – build types and start all services with hot reload
- `pnpm dev:frontend` / `pnpm dev:backend` – start individual services
- `pnpm env:status` / `pnpm env:stop` / `pnpm env:clean` – check status, stop services or clean the environment
- `pnpm rebuild` – performs a clean install and build from scratch

### Starting Manual Services

Start Redis (via Docker) then run `pnpm dev:backend` for the backend and `pnpm dev:frontend` for the frontend.

- Backend dev server uses `tsx` and `nodemon` for hot reload
- Frontend dev server uses Vite's hot module replacement and proxies API calls to the backend

### Access Points

Default ports are `5173` for the frontend and `3001` for the backend. Health endpoints are exposed at:

- `/health`
- `/health/detailed`
- `/health/memory`

### Build Commands

- `pnpm build` – full build: shared-types → backend → frontend
- `pnpm build:shared-types` – builds only the shared types package
- `pnpm build:apps` – builds backend then frontend
- `pnpm clean` – remove build artifacts and caches
- `pnpm rebuild` – clean + install + build

## Code Style Guidelines

### General Rules

- Use TypeScript in strict mode for all codebases (backend, frontend, shared types)
- Prefer functional React components with hooks; avoid class components
- Use PNPM workspaces; do not use npm or Yarn
- Write small, focused functions and pure functions where possible
- Avoid `console.log` in production code; use the logger provided by winston
- Check existing components and services before creating new ones to avoid duplication

### Naming Conventions

- **Components**: PascalCase (e.g., `CommitHeatmap.tsx`)
- **Files and utilities**: camelCase (e.g., `repositoryCache.ts`, `memoryPressureManager.ts`)
- **Constants**: UPPER_SNAKE_CASE
- **Types/Interfaces**: PascalCase with suffix (e.g., `CommitHeatmapData`, `CodeChurnAnalysis`)
- **Environment variables**: Uppercase with underscores (e.g., `REDIS_HOST`)

### File Organization

- Project follows a monorepo with `apps/backend`, `apps/frontend`, and `packages/shared-types`
- Co-locate tests (`*.test.ts`/`*.spec.ts`) next to implementation files
- Group related components into folders and export via `index.ts`
- Keep `scripts/` directory for development tooling (e.g., `start.sh`)

### Code Quality Tools

GitRay uses a multi-layer code quality system:

- **ESLint** with plugins for TypeScript, React, hooks, a11y, SonarJS and Prettier
- **Prettier** for consistent formatting; run `pnpm format` to format all files
- **markdownlint-cli2** for Markdown files
- **Husky + lint-staged**: pre-commit hooks run ESLint, Prettier, and Markdown lint on staged files
- **TypeScript** strict type checking; run `tsc --noEmit` or `pnpm --filter backend build` for type checking

### Best Practices

- Enforce import order and consistent quoting via ESLint rules
- Follow React's Rules of Hooks and accessibility guidelines
- Use incremental linting (ESLint cache) and staged file linting for performance
- Do not bypass quality checks unless absolutely necessary

## Project Context

### Repository Structure

```
apps/
├── backend/        # Express API server
│   ├── src/        # Backend source code (services, routes, cache logic)
│   └── dist/       # Compiled output (ES modules)
├── frontend/       # React + Vite web application
│   ├── src/        # UI components, hooks, pages
│   └── dist/       # Bundled static assets
packages/
└── shared-types/   # TypeScript definitions shared across frontend and backend
scripts/
└── start.sh        # Environment orchestration (Redis, build, start services)
```

### Key Technologies

**Backend:**

- Node.js 18+
- Express 5.1.0
- simple-git for Git operations
- ioredis for Redis caching
- express-validator for input validation
- winston for logging
- prom-client for Prometheus metrics
- helmet and cors for security
- express-rate-limit for rate limiting
- date-fns for date manipulation

**Frontend:**

- React 18.3.1
- Vite 6.3.5
- Tailwind CSS 4.1.7
- axios for HTTP calls
- Recharts for data visualisations and charts
- shadcn/ui component library (built on Radix UI primitives)
- Radix UI components (Accordion, Dialog, Select, Dropdown, Tabs, Tooltip, etc.)
- Lucide React for icons
- @rive-app/react-canvas for animations
- React Hook Form for form management
- Sonner for toast notifications
- next-themes for theme management

**Shared Types:**

Centralized TypeScript interfaces such as `Commit`, `CommitFilterOptions`, `CommitHeatmapData`, `CommitAggregation`, `CodeChurnAnalysis`, `FileChurnData`, `RepositoryError` and `TransactionRollbackError`. Always import shared types instead of duplicating definitions.

## Important Patterns & Gotchas

### Multi-Tier Caching

GitRay uses a three-tier hierarchical cache with 60%/25%/15% memory allocation for raw commits, filtered commits and aggregated data, respectively. The caching system falls back to disk and Redis and supports transactional operations with rollback and ordered locking to avoid deadlocks. When interacting with the cache, use the provided `RepositoryCacheManager` methods; do not implement ad-hoc caching.

### Repository Coordination

To prevent duplicate Git clones and reduce disk I/O, the `repositoryCoordinator.ts` maintains a shared map of repository handles, uses reference counting for cleanup, and coalesces identical operations. Use the coordinator to clone repositories instead of directly invoking simple-git.

### Memory Pressure Management

`memoryPressureManager.ts` monitors memory usage and classifies states as:

- **Normal** (< 75%)
- **Warning** (75–85%)
- **Critical** (85–95%)
- **Emergency** (> 95%)

At higher pressure levels it throttles requests, evicts cache entries or blocks low-priority operations to prevent crashes. Avoid long-running synchronous operations and respect circuit breakers.

### Streaming Support

A streaming path exists for large repositories (above `STREAMING_COMMIT_THRESHOLD`, default 50k
commits): `POST /api/commits/stream`, which responds with **newline-delimited JSON**
(`application/x-ndjson`) — **not** Server-Sent Events, and **not** a GET.

**Do not build on it.** It is unused by the frontend, and it pages with `git log --skip=N`, which
re-walks history on every batch (quadratic) while the caller re-accumulates all batches into a
single array. See `docs/BACKEND_ARCHITECTURE_AUDIT.md` finding C-4; the audit recommends deleting
this path.

### Observability

The backend exposes Prometheus metrics at `/metrics`, with counters, gauges and histograms for HTTP requests, cache performance, memory pressure and Git operation durations. Structured logging via winston includes request correlation IDs; use the logger instead of `console.log`. Health checks at `/health`, `/health/detailed` and `/health/memory` report service status.

### API Endpoints

Verified against the route modules and the frontend API client. Only four endpoints are actually
called by the UI; the rest are mounted but unused (see `docs/BACKEND_ARCHITECTURE_AUDIT.md` §4.2).

**Live — called by the frontend:**

- `GET /api/repositories/full-data` – commits + heatmap in one response (`App.tsx`)
- `GET /api/repositories/summary` – repository stats (creation, commits, contributors)
- `GET /api/repositories/churn` – code churn analysis
- `GET /api/commits/file-analysis` – file type distribution

**Mounted but not called by the UI:**

- `GET /api/repositories/commits`, `/heatmap`, `/contributors`
- `GET /api/commits/`, `/heatmap`, `/info` – duplicates of the `/api/repositories/*` routes
- `POST /api/commits/stream` – NDJSON streaming (see above)
- `GET /api/commits/resume/:repoPath`, `POST /api/commits/resume/clear` – **unauthenticated**

**Admin — require the `X-Admin-Token` header:**

- `GET /api/commits/cache/stats`
- `POST /api/commits/cache/invalidate`
- `GET /api/commits/cache/repositories`
- `GET /metrics` – Prometheus metrics

**Health:**

- `GET /health`, `/health/detailed`, `/health/live`, `/health/ready`, `/health/memory`, `/health/coordination`

### Configuration

Core configuration sections include:

- **Server**: `PORT`, `CORS_ORIGIN`
- **Redis**: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- **Cache**: `CACHE_MAX_ENTRIES`, `CACHE_MEMORY_LIMIT_GB`
- **Memory**: `MEMORY_WARNING_THRESHOLD`, `MEMORY_CRITICAL_THRESHOLD`
- **Streaming**: `STREAMING_ENABLED`, `STREAMING_COMMIT_THRESHOLD`
- **Logging**: `LOG_LEVEL`, `DEBUG_CACHE_LOGGING`

Do not hard-code secrets; use `.env` files.

### Performance Characteristics

- **Small repositories** (< 1k commits): ~500 ms
- **Medium repositories** (1k–10k commits): ~2 s
- **Large repositories** (10k–50k): ~10 s
- **Streaming mode**: for 50k+ commits

Cache hit rates > 80% are typical. When optimizing, prioritize caching and streaming.

## Testing Instructions

### Unit and Integration Tests

GitRay uses Vitest. Test files follow `*.test.ts` or `*.spec.ts` patterns. Run tests with:

- `pnpm test` – run all tests across all packages
- `pnpm test:frontend` – run frontend tests only
- `pnpm test:backend` – run backend tests only
- `pnpm test:watch` – watch mode for all tests
- `pnpm test:watch:changed` – watch mode for changed files only
- `pnpm test:ui` – launch Vitest UI for interactive debugging

### Coverage

Maintain ≥ 80% coverage on critical paths. Generate coverage reports via:

- `pnpm test:coverage` – full coverage pipeline (clean → test → merge → report)
- `pnpm test:coverage:frontend`, `pnpm test:coverage:backend` – generate coverage for individual packages

Coverage reports are stored in `coverage/` and `.nyc_output/` for integration with CI/CD pipelines.

### Performance Tests

The backend includes k6 load tests. Run with `pnpm --filter backend test:perf` for standard load; use `test:perf:smoke` and `test:perf:stress` for light and heavy loads.

### Code Quality Checks

Run `pnpm lint` to lint all files; `pnpm lint:fix` to auto-fix; `pnpm lint:md` for Markdown linting; `pnpm format` to format code. These checks run automatically via Husky pre-commit hooks.

### CI/CD Pipeline

Ensure that builds, tests, linting and coverage are executed in continuous integration. Failed quality checks or tests block merges. The main branch deploys to production and preview deployments are created for pull requests.

## Common Pitfalls

- Skipping `pnpm run build:shared-types` before running apps results in missing type definitions
- Not running Redis results in failed cache operations; ensure Docker is running
- Ports `3001` or `5173` already in use – adjust `.env` or stop conflicting services
- TypeScript errors in `node_modules` – add `skipLibCheck: true` in `tsconfig.json` if needed

## Troubleshooting

For cache issues, memory issues and performance tuning, refer to the Troubleshooting section in the documentation. The memory pressure manager and circuit breakers automatically handle overloads, but persistent errors may indicate misconfiguration.
