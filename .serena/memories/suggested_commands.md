# GitRay - Suggested Development Commands

## Essential Commands (Most Commonly Used)

### Development Environment
```bash
pnpm app                  # Interactive development environment manager
pnpm dev                  # Build shared types + start all services with hot reload
pnpm dev:frontend         # Start frontend only (Vite on port 5173)
pnpm dev:backend          # Start backend only (Express on port 3001)
```

### Testing
```bash
pnpm test                 # Run all tests across workspace
pnpm test:frontend        # Frontend tests only
pnpm test:backend         # Backend tests only
pnpm test:watch           # Watch mode for development
pnpm test:watch:changed   # Watch changed files only
pnpm test:coverage        # Generate combined coverage report (86.4%+)
pnpm test:ui              # Open Vitest UI
```

### Code Quality
```bash
pnpm lint                 # Run ESLint on all code
pnpm lint:fix             # Auto-fix linting issues
pnpm lint:md              # Lint markdown files
pnpm format               # Format all files with Prettier
```

### Building
```bash
pnpm build                # Build everything (shared-types → backend → frontend)
pnpm build:shared-types   # Build shared types only (REQUIRED before apps)
pnpm build:apps           # Build backend + frontend
```

### Environment Management
```bash
pnpm env:status           # Show service status (frontend, backend, Redis)
pnpm env:stop             # Stop all services
pnpm env:clean            # Clean environment (stop services + clean cache)
```

### Cleanup
```bash
pnpm clean                # Clean dist + cache + node_modules
pnpm clean:dist           # Remove build artifacts only
pnpm clean:cache          # Remove Vite/ESLint/nyc caches
pnpm clean:node_modules   # Remove all node_modules (deep clean)
pnpm clean:all            # Deep clean including logs
pnpm rebuild              # Full clean + install + build
```

## Installation & Setup

```bash
# Initial setup
pnpm install              # Install all workspace dependencies

# Start Redis (via Docker)
docker run --name gitray-redis -d -p 6379:6379 redis:7-alpine

# Check Redis status
docker ps | grep redis
docker restart gitray-redis  # If needed

# Build before first run
pnpm build
```

## Application Management Scripts

```bash
pnpm start                # Full development setup (via scripts/start.sh)
pnpm quick                # Frontend-only quick start
```

## Testing Variants

### Backend-Specific
```bash
pnpm --filter backend test              # Backend unit tests
pnpm --filter backend test:coverage     # Backend coverage
pnpm --filter backend test:perf         # k6 performance tests
pnpm --filter backend test:perf:smoke   # Quick smoke test (30s)
pnpm --filter backend test:perf:stress  # Stress test (2x load)
```

### Frontend-Specific
```bash
pnpm --filter frontend test             # Frontend unit tests
pnpm --filter frontend test:coverage    # Frontend coverage
```

### Coverage Details
```bash
pnpm test:coverage:frontend    # Frontend coverage (apps/frontend/coverage)
pnpm test:coverage:backend     # Backend coverage (apps/backend/coverage)
pnpm test:coverage:merge       # Merge coverage reports
pnpm test:coverage:report      # Generate HTML/LCOV/text reports
pnpm clean:coverage-output     # Clean coverage artifacts
```

## Git Hooks (Automated via Husky)

### Pre-commit (Automated)
- ESLint auto-fix on `*.{ts,tsx,js,jsx}`
- Prettier format on code files
- Markdownlint on `*.md` files
- Prettier format on `*.{json,yml,yaml}`

### Manual Hook Setup
```bash
pnpm prepare              # Install Husky hooks
```

## Debugging & Troubleshooting

```bash
# Check what's using a port
lsof -i :3001             # Backend port
lsof -i :5173             # Frontend port
lsof -i :6379             # Redis port

# Kill process by PID
kill -9 <PID>

# Check Redis connection
docker logs gitray-redis

# View application logs
tail -f logs/combined.log
tail -f logs/error.log

# Memory and system status
pnpm env:status
```

## Performance Testing (k6)

```bash
# Standard load test
pnpm --filter backend test:perf

# Quick smoke test (5 VUs, 30 seconds)
pnpm --filter backend test:perf:smoke

# Stress test (2x multiplier)
pnpm --filter backend test:perf:stress

# Custom k6 test
cd apps/backend
k6 run --vus 10 --duration 60s perf/load-test.ts
```

## Useful System Commands (Linux)

### File Operations
```bash
ls -la                    # List files with details
find . -name "*.ts"       # Find TypeScript files
grep -r "pattern" src/    # Search in files
```

### Git Operations
```bash
git status                # Current branch status
git log --oneline -10     # Recent commits
git diff                  # View changes
git checkout dev          # Switch to dev branch
```

## Build Order (IMPORTANT!)

**Always build in this order:**
1. `pnpm build:shared-types` (or `pnpm --filter @gitray/shared-types build`)
2. `pnpm build:apps` (or manually: backend → frontend)

**Why?** Backend and frontend depend on built types from `@gitray/shared-types`.

## Environment Variables

Create `.env` in project root:
```bash
# Server
PORT=3001
CORS_ORIGIN=http://localhost:5173

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Caching
CACHE_ENABLE_REDIS=true
CACHE_ENABLE_DISK=true

# Development
NODE_ENV=development
LOG_LEVEL=info
DEBUG_CACHE_LOGGING=false
```

## Quick Reference: Common Workflows

### Starting Development
```bash
pnpm app                  # Interactive menu
# OR
pnpm dev                  # Direct start (recommended)
```

### Before Committing
```bash
pnpm lint                 # Check for issues
pnpm test                 # Run tests
pnpm format               # Format code
```

### After Pulling Changes
```bash
pnpm install              # Update dependencies
pnpm build:shared-types   # Rebuild shared types
```

### Adding New Dependencies
```bash
# Root level
pnpm add -D <package>

# Specific workspace
pnpm --filter backend add <package>
pnpm --filter frontend add <package>
pnpm --filter @gitray/shared-types add <package>
```
