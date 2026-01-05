# GitRay Memory Update Summary

## Date: January 5, 2026

## Context

Memory files have been reviewed and updated to ensure alignment with the AGENTS.md file, which serves as the comprehensive project documentation. This update confirms the current state of the GitRay project following the Serena MCP server indexing.

## Current Project State

### Repository Information

- **Repository**: `gitray`
- **Owner**: `jonasyr`
- **Current Branch**: `87-featfrontend-ui-redesign-migration-to-shadcnui`
- **Status**: Active development - shadcn/ui migration in progress

### Project Structure Verified

```
gitray/ (Monorepo)
├── apps/
│   ├── backend/          # Express 5.1.0 API server (Node.js 18+)
│   └── frontend/         # React 18.3.1 + Vite 6.3.5 application
├── packages/
│   └── shared-types/     # Shared TypeScript definitions
├── scripts/              # Development and maintenance scripts
├── locks/                # Lock files for coordination
└── logs/                 # Application logs
```

### Technology Stack Summary

**Backend:**
- Node.js 18+ with TypeScript 5.7
- Express 5.1.0
- simple-git for Git operations
- ioredis for Redis 7 caching
- winston for logging
- prom-client for Prometheus metrics
- express-validator + Zod for validation
- helmet, cors, express-rate-limit for security

**Frontend:**
- React 18.3.1 (NOT 19 - corrected)
- Vite 6.3.5
- Tailwind CSS 4.1.7
- shadcn/ui component library (Radix UI primitives)
- Recharts for visualizations
- motion (Framer Motion) for animations
- @rive-app/react-canvas for Rive animations
- axios for HTTP client
- React Hook Form for forms
- Sonner for toasts
- next-themes for theme management
- Lucide React for icons

**Tooling:**
- pnpm 10.16.1 (workspace package manager)
- Vitest 3.2.3 (86.4% test coverage)
- ESLint 9 (flat config)
- Prettier 3
- Husky + lint-staged for pre-commit hooks
- k6 for backend performance testing
- markdownlint-cli2 for Markdown linting

## Key Features Verified

### Core Functionality

1. **Activity Heatmaps**: GitHub-style contribution calendars with customizable time periods
2. **Commit Analysis**: Detailed statistics and author breakdowns
3. **Code Churn Analysis**: Track code changes with risk level indicators
4. **File Type Distribution**: Analyze codebase composition
5. **Interactive Filtering**: Filter by authors, date ranges, and patterns
6. **Multi-tier Caching**: Redis + Memory + Disk (60%/25%/15% allocation)
7. **Streaming Support**: Handles 50k+ commits efficiently via Server-Sent Events
8. **Repository Coordination**: Prevents duplicate clones with reference counting

### Architecture Highlights

**Backend Services:**
- `gitService`: Git operations and streaming
- `cache`: Multi-tier hierarchical caching
- `repositoryCoordinator`: Shared repository management
- `repositoryCache`: Physical repository caching
- `fileAnalysisService`: File type distribution
- `repositorySummaryService`: Repository metadata
- `memoryPressureManager`: Memory monitoring (75%/85%/95% thresholds)
- `lockManager`: Distributed locking for coordination
- `metrics`: Prometheus metrics collection
- `logger`: Winston with daily rotation

**Frontend Components:**
- Core Pages: `LandingPage`, `DashboardPage`, `Header`, `Footer`
- Visualizations: `CommitHeatmap`, `ActivityChart`, `CodeChurnChart`, `FileDistributionChart`, `FileTypeList`, `GraphViewTimeline`, `GitDiffViewer`
- Features: `AIInsights`, `PremiumFeatures`, `SettingsDrawer`, `NewsDrawer`, `InfoModal`
- UI Library: 47+ shadcn/ui components in `components/ui/`

### API Endpoints

- `POST /api/repositories` - Fetch commit list
- `GET /api/commits/heatmap` - Aggregated heatmap data
- `GET /api/commits/info` - Repository statistics
- `GET /api/commits/stream` - Stream commit data (SSE)
- `GET /api/repositories/churn` - Code churn analysis
- `GET /api/repositories/summary` - Repository metadata
- `GET /api/cache/stats` - Cache metrics
- `GET /health`, `/health/detailed`, `/health/memory` - Health checks
- `GET /metrics` - Prometheus metrics

## Configuration

### Environment Variables (Required)

**Backend:**
- `PORT` (default: 3001)
- `CORS_ORIGIN` (default: http://localhost:5173)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `CACHE_MAX_ENTRIES`, `CACHE_MEMORY_LIMIT_GB`
- `MEMORY_WARNING_THRESHOLD`, `MEMORY_CRITICAL_THRESHOLD`
- `STREAMING_ENABLED`, `STREAMING_COMMIT_THRESHOLD`
- `LOG_LEVEL`, `DEBUG_CACHE_LOGGING`

**Frontend:**
- Vite automatically proxies API calls to backend during development

## Development Workflow

### Prerequisites

- Node.js 18+
- pnpm 10.16.1
- Docker (for Redis)
- Git
- 4 GB RAM minimum (8 GB+ recommended for large repositories)
- 2 GB free disk space

### Setup Commands

```bash
# Clone and install
git clone <repository-url>
pnpm install

# Build shared types (MUST run first)
pnpm run build:shared-types

# Environment setup
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env

# Start development
pnpm start          # Full setup: build types, start Redis, backend, frontend
pnpm dev            # Build types + start all services with hot reload
pnpm quick          # Quick start (frontend only, assumes backend running)
pnpm app            # Interactive menu

# Individual services
pnpm dev:backend    # Backend only
pnpm dev:frontend   # Frontend only

# Build
pnpm build                  # Full build: types → backend → frontend
pnpm build:shared-types     # Build types only
pnpm build:apps             # Build backend + frontend

# Clean and rebuild
pnpm clean          # Remove build artifacts
pnpm rebuild        # Clean + install + build

# Environment management
pnpm env:status     # Check service status
pnpm env:stop       # Stop services
pnpm env:clean      # Clean environment

# Testing
pnpm test                   # All tests
pnpm test:frontend          # Frontend tests only
pnpm test:backend           # Backend tests only
pnpm test:watch             # Watch mode
pnpm test:coverage          # Generate coverage reports

# Code quality
pnpm lint           # Lint all files
pnpm lint:fix       # Auto-fix issues
pnpm lint:md        # Markdown linting
pnpm format         # Format with Prettier
```

### Access Points

- **Frontend**: http://localhost:5173 (Vite dev server)
- **Backend**: http://localhost:3001
- **Health Checks**: `/health`, `/health/detailed`, `/health/memory`
- **Metrics**: `/metrics` (Prometheus format)

## Code Quality System

### Multi-Layer Quality Enforcement

1. **ESLint**: TypeScript, React, hooks, a11y, SonarJS, Prettier integration
2. **Prettier**: Consistent code formatting
3. **markdownlint-cli2**: Markdown file quality
4. **Husky + lint-staged**: Pre-commit hooks (ESLint, Prettier, Markdown lint)
5. **TypeScript**: Strict type checking across all packages

### Quality Standards

- Enforce import order and consistent quoting
- Follow React's Rules of Hooks
- Accessibility guidelines (via Radix UI + ESLint a11y)
- Incremental linting with ESLint cache
- Staged file linting for performance
- ≥80% test coverage on critical paths

## Performance Characteristics

- **Small repos** (< 1k commits): ~500 ms
- **Medium repos** (1k-10k commits): ~2 s
- **Large repos** (10k-50k): ~10 s
- **Streaming mode**: for 50k+ commits
- **Cache hit rate**: > 80% typical

## Important Patterns

### Multi-Tier Caching

Three-tier hierarchical cache with 60%/25%/15% memory allocation:
- **Tier 1**: Raw commits (60%, TTL 1h)
- **Tier 2**: Filtered commits (25%, TTL 30min)
- **Tier 3**: Aggregated data (15%, TTL 15min)

Falls back: Redis → Memory → Disk. Supports transactional operations with rollback and ordered locking.

### Repository Coordination

Prevents duplicate clones with:
- Shared map of repository handles
- Reference counting for cleanup
- Operation coalescing for identical requests
- Distributed locking to prevent race conditions

### Memory Pressure Management

Four-tier system:
- **Normal** (< 75%): Allow all operations
- **Warning** (75-85%): Log warnings
- **Critical** (85-95%): Throttle requests, evict cache
- **Emergency** (> 95%): Block operations, aggressive eviction

### Streaming Support

For large repositories (50k+ commits):
- `/api/commits/stream` endpoint (Server-Sent Events)
- Batch processing (default: 1000 commits per batch)
- Memory-efficient for massive histories

## Common Issues & Solutions

### Build Issues

- **Missing types**: Run `pnpm run build:shared-types` first
- **Redis not running**: Start Docker with Redis container
- **Port conflicts**: Adjust `PORT` in `.env` or stop conflicting services
- **TypeScript errors**: Run `tsc --noEmit` to check types

### Performance Issues

- **Slow queries**: Check cache hit rates at `/api/cache/stats`
- **Memory issues**: Monitor `/health/memory` endpoint
- **Large repos**: Streaming mode activates automatically at 50k+ commits

### Development Issues

- **Skipping shared types build**: Always build types before apps
- **Console.log in production**: Use winston logger instead
- **Type duplication**: Import from `@gitray/shared-types`

## Testing Strategy

### Unit Tests

- Co-located with source files (`*.test.ts`/`*.spec.ts`)
- Vitest test runner
- Mock external dependencies (Redis, Git, filesystem)
- Target ≥80% coverage on critical paths

### Integration Tests

- Located in `apps/backend/__tests__/integration/`
- Test complete request/response cycles
- Verify caching behavior and coordination

### Performance Tests

- k6 load tests in `apps/backend/perf/`
- Scenarios: smoke, standard, stress
- Measure request latency, throughput, cache performance

### Coverage Reports

```bash
pnpm test:coverage          # Full coverage pipeline
pnpm test:coverage:frontend # Frontend only
pnpm test:coverage:backend  # Backend only
```

Reports stored in `coverage/` and `.nyc_output/`.

## Observability

### Metrics (Prometheus)

- HTTP request count, duration, status codes
- Cache hit/miss rates per tier
- Memory usage and pressure levels
- Repository coordination stats
- Git operation durations

### Logging (Winston)

- Structured JSON logs
- Log levels: error, warn, info, debug
- Daily rotation with compression
- Request correlation IDs
- Contextual metadata

### Health Checks

- **Basic** (`/health`): Service up/down
- **Detailed** (`/health/detailed`): Redis, memory, cache health
- **Memory** (`/health/memory`): Current pressure level and thresholds

## Security Measures

- **Helmet**: Security headers (CSP, HSTS, etc.)
- **CORS**: Restricted origins
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: express-validator + Zod schemas
- **URL Security**: Blocks malicious repository URLs (file://, javascript:, etc.)
- **Content-Type Enforcement**: Strict JSON for POST/PUT
- **Admin Auth**: Protected admin endpoints

## Serena Integration Status

- ✅ Project indexed: 167 files (159 TypeScript, 8 Bash)
- ✅ All memory files created/updated
- ✅ Project activated in Serena
- ✅ Ready for development tasks

## Memory Files Current State

1. **project_overview.md**: High-level project summary, features, tech stack
2. **architecture_overview.md**: Detailed architecture, services, caching, coordination
3. **codebase_structure.md**: Directory layout, file locations, component organization
4. **coding_standards.md**: Naming conventions, patterns, best practices
5. **frontend_architecture_detailed.md**: shadcn/ui migration, component catalog, styling
6. **task_completion_checklist.md**: Checklists for common development tasks
7. **suggested_commands.md**: Common command reference
8. **memory_update_summary_2026-01-03.md**: Previous update summary
9. **memory_update_summary_2026-01-05.md**: This file

## Next Steps

### Documentation

- ✅ All memory files aligned with AGENTS.md
- ⏳ Consider updating README.md to match AGENTS.md details
- ⏳ Add screenshots/videos of new UI to documentation
- ⏳ Create component Storybook for shadcn/ui customizations

### Testing

- ⏳ Update frontend tests for new component structure
- ⏳ Add tests for shadcn/ui component customizations
- ⏳ Verify test coverage remains ≥80%

### Features

- ⏳ Complete shadcn/ui migration (branch 87)
- ⏳ Implement AI integration for AIInsights component
- ⏳ Define premium features for monetization

### Infrastructure

- ⏳ Consider Redis Cluster for horizontal scaling
- ⏳ Evaluate shared filesystem for multi-instance deployments
- ⏳ Plan database for persistent metadata (currently cache-only)

## Notes for AI Assistants

When working with this project:

1. **Always build shared types first**: `pnpm run build:shared-types`
2. **Use winston logger**: Never use `console.log` in production code
3. **Import types from shared package**: `@gitray/shared-types`
4. **Follow shadcn/ui patterns**: Use `cn()` utility, component composition
5. **Respect memory pressure**: Check thresholds before heavy operations
6. **Use repository coordinator**: Don't clone repositories directly
7. **Multi-tier caching**: Understand cache hierarchy for optimization
8. **Streaming for large repos**: Auto-enabled at 50k+ commits
9. **Test coverage**: Maintain ≥80% on critical paths
10. **Code quality**: ESLint, Prettier, TypeScript strict mode enforced

## Reference Documentation

- **AGENTS.md**: Comprehensive project documentation (primary reference)
- **README.md**: User-facing documentation
- **CLAUDE.md**: Guidelines for Claude AI assistant
- **GEMINI.md**: Guidelines for Gemini AI assistant
- **Strategy.md**: Project strategy and roadmap
