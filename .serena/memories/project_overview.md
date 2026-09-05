# GitRay - Project Overview

## ⚠ Current runtime state (verified 2026-09-04 by running the system)

**The dashboard is broken on cold repositories.** Concurrent `/api/repositories/summary` and
`/api/repositories/churn` return **500** (reproduced 3/3); sequential requests all return 200.
Cause is C-1, lock coalescing in `lockManager.withKeyLock`, crashing at
`repositoryRoutes.ts:219` and `:246`.

Measured behaviour, for reference when reasoning about performance:

| Endpoint | Cold | Warm |
| --- | ---: | ---: |
| `/api/repositories/full-data` | 1.53 s | 0.015 s |
| `/api/repositories/summary` | 1.61 s | 0.030 s |
| `/api/repositories/churn` | 0.17 s | 0.009 s |
| `/api/commits/file-analysis` | 2.92 s | **1.33 s** (barely caches) |

Other verified facts: no `git fetch` ever runs after the initial clone, so cached data is
unboundedly stale; the commit parser silently drops commits with an empty subject and shifts fields
when an author name contains `|`; the test suite is non-deterministic.

Authoritative analysis: `docs/BACKEND_ARCHITECTURE_AUDIT.md`.

## Architectural direction (decided 2026-09-05)

Destination is a **PostgreSQL-backed index with delta updates**, reached only after the correctness
and Git-layer phases. A cache cannot meet the requirements (persisted, shared, any repo size,
notify on completion) because it is evictable and lost on restart.

Measured: a 1M-commit repository costs ~24 s for commit metadata and ~9.4 min for file churn —
~15 minutes once, then milliseconds per delta.

Two measured design constraints:
- `--filter=blob:none` is **624x slower** for `--numstat`; use a full clone for the churn pass.
- Index metadata and churn as **separate jobs** so the dashboard is usable in under a minute.

Rejected: an `analysis_sessions` table — there is no authentication anywhere and results are
global, so `(repository, index_state, index_job)` covers every responsibility it would have.

Plan and schema: `docs/BACKEND_ARCHITECTURE_AUDIT.md` §15-16.



## Purpose

GitRay is a professional Git visualization tool that transforms repository commit history into beautiful, interactive heatmaps and activity calendars. It provides deep insights into development patterns and team collaboration.

## Key Features

- **Activity Heatmaps**: GitHub-style contribution calendars with customizable time periods
- **Commit Analysis**: Detailed commit statistics and author breakdowns
- **Code Churn Analysis**: Track code changes and stability patterns with risk level indicators
- **Interactive Filtering**: Filter by authors, date ranges, and commit patterns
- **Multi-tier Caching**: Intelligent caching system with Redis, disk, and memory tiers
- **Streaming Support**: Handle large repositories (50k+ commits) efficiently
- **Repository Coordination**: Prevents duplicate clones with shared repository management

## Technology Stack

### Backend

- **Runtime**: Node.js 18+ with TypeScript 5.7
- **Framework**: Express 5.1.0
- **Git Operations**: simple-git
- **Caching**: Redis 7 (via ioredis)
- **Logging**: Winston with daily rotate file
- **Metrics**: Prometheus (prom-client)
- **Validation**: Express-validator, Zod
- **Security**: Helmet, CORS, express-rate-limit
- **Date Utilities**: date-fns for date manipulation

### Frontend

- **Framework**: React 18.3.1 with TypeScript 5.7
- **Build Tool**: Vite 6.3.5
- **Styling**: Tailwind CSS 4.1.7
- **UI Components**: shadcn/ui (Radix UI primitives + CVA)
- **Visualizations**: Recharts for charts, custom heatmap components
- **Animations**: Rive (@rive-app/react-canvas), motion (Framer Motion)
- **HTTP Client**: Axios
- **Forms**: React Hook Form
- **Toast Notifications**: Sonner
- **Themes**: next-themes for dark/light mode
- **Icons**: lucide-react
- **Carousel**: Embla Carousel for carousels
- **Command Menu**: cmdk for command palette

### Shared Infrastructure

- **Package Manager**: pnpm 10.16.1 (workspaces)
- **Testing**: Vitest 3.2.3 (86.4% coverage)
- **Performance Testing**: k6 for backend load testing
- **Linting**: ESLint 9 (flat config)
- **Formatting**: Prettier 3
- **Markdown Linting**: markdownlint-cli2
- **Git Hooks**: Husky + lint-staged
- **CI/CD**: GitHub Actions

## Monorepo Structure

- **apps/backend**: Express API server
- **apps/frontend**: React UI application
- **packages/shared-types**: Shared TypeScript types and error classes
- **scripts/**: Development and maintenance scripts

## Architecture Principles

- **Strict TypeScript**: No `any` types, strict type checking enabled
- **Monorepo with Project References**: TypeScript project references for incremental builds
- **Shared Type Safety**: All types exported from @gitray/shared-types
- **Layered Architecture**: Routes → Services → Utils pattern in backend
- **Component-Based Frontend**: Functional React components with hooks
- **Comprehensive Testing**: Unit, integration, and performance tests
- **Professional Logging**: Winston instead of console.log
- **Performance Optimized**: Multi-tier caching, streaming, memory pressure management

## Current Development Branch

**Main development branch**: `dev`
**Current working branch**: `87-featfrontend-ui-redesign-migration-to-shadcnui`
**Repository**: `gitray` (owner: `jonasyr`)
**Recent major changes**: Complete frontend UI redesign with shadcn/ui component library

## Current Date

As of January 5, 2026, the project is actively maintained and in production-ready state with ongoing feature development.

## License

ISC License
