# GitRay - Quick Command Reference

## Essential Commands

### Development

```bash
# Start full development environment (interactive menu)
pnpm app

# Start all services (Redis + Backend + Frontend)
pnpm start

# Quick start frontend only (assumes backend is running)
pnpm quick

# Start individual services
pnpm dev:frontend    # Frontend on :5173
pnpm dev:backend     # Backend on :3001
pnpm dev             # Both with hot reload
```

### Build

```bash
# Full production build
pnpm build

# Build individual packages
pnpm build:shared-types
pnpm --filter backend build
pnpm --filter frontend build

# Clean rebuild from scratch
pnpm rebuild
```

### Testing

```bash
# Run all tests
pnpm test

# Run specific test suites
pnpm test:frontend
pnpm test:backend

# Watch mode
pnpm test:watch
pnpm test:watch:changed

# With coverage
pnpm test:coverage
pnpm test:coverage:frontend
pnpm test:coverage:backend

# Interactive UI
pnpm test:ui

# Performance tests (requires k6)
pnpm --filter backend test:perf
pnpm --filter backend test:perf:smoke
pnpm --filter backend test:perf:stress
```

### Code Quality

```bash
# Lint code
pnpm lint              # Check all
pnpm lint:fix          # Auto-fix
pnpm lint:md           # Check markdown

# Format code
pnpm format            # Format all files
pnpm format --check    # Check only

# Type checking
pnpm --filter frontend run type-check
pnpm --filter backend build  # Also checks types
```

### Cleanup

```bash
# Remove cache files
pnpm clean:cache

# Remove build artifacts
pnpm clean:dist

# Remove dependencies (destructive!)
pnpm clean:node_modules

# Complete cleanup
pnpm clean:all

# Nuclear option: clean + reinstall + rebuild
pnpm rebuild
```

### Environment Management

```bash
# Check service status
pnpm env:status

# Stop all services
pnpm env:stop

# Clean environment
pnpm env:clean
```

### Shell Scripts

```bash
# Main orchestration script
./scripts/start.sh

# Verification script
./scripts/verify-migration.sh

# End-to-end cache testing
./scripts/end2end_cache_test.sh

# API testing
./scripts/test_api_complete.sh

# Security verification
./scripts/verify-ssrf-protection.sh

# Line ending normalization
./scripts/normalize-line-endings.sh
# or
pnpm normalize-line-endings
```

## Workspace-Specific Commands

### Frontend (`apps/frontend`)

```bash
cd apps/frontend

pnpm dev              # Start dev server
pnpm build            # Production build
pnpm preview          # Preview production build
pnpm test             # Run tests
pnpm type-check       # TypeScript check
```

### Backend (`apps/backend`)

```bash
cd apps/backend

pnpm dev              # Start dev server with hot reload
pnpm build            # Compile TypeScript
pnpm test             # Run tests
pnpm test:perf        # Performance tests
```

### Shared Types (`packages/shared-types`)

```bash
cd packages/shared-types

pnpm build            # Build CJS and ESM
pnpm watch            # Watch mode
```

## Common Workflows

### First Time Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd gitray

# 2. Install dependencies
pnpm install

# 3. Build shared types
pnpm build:shared-types

# 4. Start development
pnpm start
```

### Daily Development

```bash
# Start everything
pnpm start

# Or start services individually
pnpm dev:backend     # Terminal 1
pnpm dev:frontend    # Terminal 2
```

### Before Committing

```bash
# 1. Run linter
pnpm lint:fix

# 2. Format code
pnpm format

# 3. Run tests
pnpm test

# 4. Check types
pnpm build
```

### Testing Changes

```bash
# Run affected tests in watch mode
pnpm test:watch:changed

# Or run full test suite
pnpm test

# With coverage
pnpm test:coverage
```

### Production Build

```bash
# Clean build
pnpm rebuild

# Or step by step
pnpm clean
pnpm install
pnpm build
```

### Troubleshooting

```bash
# 1. Clean everything
pnpm clean:all

# 2. Reinstall dependencies
pnpm install

# 3. Rebuild
pnpm build

# 4. Check status
pnpm env:status

# 5. Run verification
./scripts/verify-migration.sh
```

## Service URLs

- **Frontend**: <http://localhost:5173>
- **Backend API**: <http://localhost:3001>
- **Health Check**: <http://localhost:3001/health>
- **Metrics**: <http://localhost:3001/metrics>
- **Redis**: localhost:6379

## Environment Files

- `apps/backend/.env` - Backend configuration
- `apps/frontend/.env` - Frontend configuration

## Port Configuration

Default ports:

- Frontend: 5173 (configurable in .env)
- Backend: 3001 (configurable in .env)
- Redis: 6379 (Docker)

## Git Hooks

Pre-commit hooks automatically run:

- ESLint on staged `.ts`, `.tsx`, `.js`, `.jsx` files
- Prettier on staged files
- markdownlint on staged `.md` files

Managed by Husky + lint-staged.

## Tips

1. **Always build shared-types first** when making changes to types
2. **Use `pnpm app`** for interactive menu if unsure what to run
3. **Run `pnpm test:watch:changed`** while developing for fast feedback
4. **Use `pnpm quick`** to restart just the frontend quickly
5. **Check `pnpm env:status`** if something isn't working
6. **Run `./scripts/verify-migration.sh`** after major changes

## PNPM Workspace Filters

```bash
# Run command in specific package
pnpm --filter <package-name> <command>

# Examples:
pnpm --filter frontend build
pnpm --filter backend test
pnpm --filter @gitray/shared-types build

# Run in all packages
pnpm -r <command>        # All packages
pnpm -r run build        # Build all
```

## Monitoring & Health

```bash
# Check backend health
curl http://localhost:3001/health

# Detailed health
curl http://localhost:3001/health/detailed

# Memory status
curl http://localhost:3001/health/memory

# Prometheus metrics
curl http://localhost:3001/metrics

# Cache stats
curl http://localhost:3001/api/cache/stats
```

---

**Quick Start**: `pnpm start`  
**Documentation**: See README.md and AGENTS.md  
**Issues**: Check logs/ directory for detailed logs
