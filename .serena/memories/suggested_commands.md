# GitRay - Suggested Commands Reference

## Quick Reference

This file contains commonly used commands for GitRay development. All commands should be run from the project root unless otherwise specified.

## Setup & Installation

```bash
# Clone repository
git clone <repository-url>
cd gitray

# Install all dependencies (workspace-aware)
pnpm install

# Build shared types (MUST run before apps)
pnpm run build:shared-types

# Setup environment files
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
# Edit .env files with your configuration
```

## Development

### Starting Services

```bash
# Interactive menu to start services
pnpm app

# Full development setup (build types, start Redis, backend, frontend)
pnpm start

# Quick start (frontend only, assumes backend is running)
pnpm quick

# Build types and start all services with hot reload
pnpm dev

# Start individual services
pnpm dev:frontend     # Frontend only (Vite dev server)
pnpm dev:backend      # Backend only (Express with nodemon)
```

### Environment Management

```bash
# Check status of services
pnpm env:status

# Stop all services
pnpm env:stop

# Clean environment (remove containers, temp files)
pnpm env:clean
```

## Building

```bash
# Full build pipeline: shared-types → backend → frontend
pnpm build

# Build only shared types package
pnpm build:shared-types

# Build backend and frontend (assumes types are built)
pnpm build:apps

# Clean build artifacts and caches
pnpm clean

# Clean install and build from scratch
pnpm rebuild
```

## Testing

### Running Tests

```bash
# Run all tests across all packages
pnpm test

# Run tests for specific package
pnpm test:frontend
pnpm test:backend

# Watch mode for all tests
pnpm test:watch

# Watch mode for changed files only
pnpm test:watch:changed

# Launch Vitest UI for interactive debugging
pnpm test:ui
```

### Coverage Reports

```bash
# Full coverage pipeline (clean → test → merge → report)
pnpm test:coverage

# Coverage for individual packages
pnpm test:coverage:frontend
pnpm test:coverage:backend
```

### Performance Testing

```bash
# Run standard k6 load test (backend only)
pnpm --filter backend test:perf

# Light load smoke test
pnpm --filter backend test:perf:smoke

# Heavy load stress test
pnpm --filter backend test:perf:stress
```

## Code Quality

### Linting

```bash
# Lint all files
pnpm lint

# Auto-fix linting issues
pnpm lint:fix

# Lint Markdown files only
pnpm lint:md

# Format all files with Prettier
pnpm format
```

### Type Checking

```bash
# Type check all packages
pnpm type-check

# Type check backend only
cd apps/backend && pnpm tsc --noEmit

# Type check frontend only
cd apps/frontend && pnpm tsc --noEmit
```

## Package Management

```bash
# Add dependency to workspace root
pnpm add <package> -w

# Add dependency to specific workspace
pnpm --filter backend add <package>
pnpm --filter frontend add <package>
pnpm --filter @gitray/shared-types add <package>

# Add dev dependency
pnpm --filter backend add -D <package>

# Update all dependencies
pnpm update

# Update specific package
pnpm update <package>

# List outdated packages
pnpm outdated

# Remove dependency
pnpm --filter backend remove <package>
```

## Git & Version Control

```bash
# Check current branch
git branch --show-current

# Create feature branch
git checkout -b feat/your-feature-name

# Create bugfix branch
git checkout -b fix/issue-description

# Commit with conventional commit message
git commit -m "feat: add new feature"
git commit -m "fix: resolve bug in cache manager"
git commit -m "refactor: extract route helpers"
git commit -m "test: add integration tests"
git commit -m "docs: update API documentation"
git commit -m "perf: optimize commit aggregation"
git commit -m "style: format code with prettier"
git commit -m "chore: update dependencies"

# Push branch
git push origin <branch-name>

# Pull latest changes
git pull origin <branch-name>

# View recent commits
git log --oneline -n 10

# Check diff
git diff
git diff --staged
```

## Docker & Redis

```bash
# Start Redis container (development)
docker run -d --name gitray-redis -p 6379:6379 redis:7-alpine

# Stop Redis container
docker stop gitray-redis

# Remove Redis container
docker rm gitray-redis

# View Redis logs
docker logs gitray-redis

# Connect to Redis CLI
docker exec -it gitray-redis redis-cli

# Check Redis memory usage
docker exec -it gitray-redis redis-cli INFO memory
```

## Backend Development

### Running Backend Services

```bash
# Start backend in development mode
cd apps/backend
pnpm dev

# Start backend in production mode
cd apps/backend
pnpm start

# Build backend
cd apps/backend
pnpm build
```

### Backend Testing & Debugging

```bash
# Run backend unit tests
cd apps/backend
pnpm test

# Run backend integration tests
cd apps/backend
pnpm test:integration

# View backend logs
tail -f apps/backend/logs/combined.log
tail -f apps/backend/logs/error.log

# Check backend health
curl http://localhost:3001/health
curl http://localhost:3001/health/detailed
curl http://localhost:3001/health/memory

# Check cache statistics
curl http://localhost:3001/api/cache/stats

# View Prometheus metrics
curl http://localhost:3001/metrics
```

### API Testing

```bash
# Test repository endpoint
curl -X POST http://localhost:3001/api/repositories \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/user/repo"}'

# Test heatmap endpoint
curl "http://localhost:3001/api/commits/heatmap?url=https://github.com/user/repo"

# Test streaming endpoint
curl "http://localhost:3001/api/commits/stream?url=https://github.com/user/repo"

# Test churn analysis
curl "http://localhost:3001/api/repositories/churn?url=https://github.com/user/repo"

# Test repository summary
curl "http://localhost:3001/api/repositories/summary?url=https://github.com/user/repo"
```

### Backend Scripts

```bash
# Run manual XSS verification
cd apps/backend/__tests__
bash manual-xss-verification.sh

# Run end-to-end cache test
cd scripts
bash end2end_cache_test.sh

# Run complete API test
cd scripts
bash test_api_complete.sh

# Verify health endpoints
cd scripts
bash verify-health.sh

# Verify SSRF protection
cd scripts
bash verify-ssrf-protection.sh
```

## Frontend Development

### Running Frontend

```bash
# Start frontend dev server
cd apps/frontend
pnpm dev

# Build frontend for production
cd apps/frontend
pnpm build

# Preview production build
cd apps/frontend
pnpm preview
```

### Frontend Testing

```bash
# Run frontend tests
cd apps/frontend
pnpm test

# Run frontend tests in watch mode
cd apps/frontend
pnpm test:watch

# Run frontend tests with UI
cd apps/frontend
pnpm test:ui
```

## Shared Types Development

```bash
# Build shared types
cd packages/shared-types
pnpm build

# Watch mode for shared types (rebuild on change)
cd packages/shared-types
pnpm build --watch

# Type check shared types
cd packages/shared-types
pnpm tsc --noEmit
```

## Troubleshooting

### Common Issues

```bash
# Shared types not found - rebuild types
pnpm run build:shared-types

# Redis connection failed - start Redis
docker run -d --name gitray-redis -p 6379:6379 redis:7-alpine

# Port already in use - check and kill process
lsof -ti:3001 | xargs kill -9  # Backend port
lsof -ti:5173 | xargs kill -9  # Frontend port

# Clear all node_modules and reinstall
pnpm clean
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install

# Clear TypeScript build cache
find . -name "*.tsbuildinfo" -delete

# Clear Vite cache
rm -rf apps/frontend/.vite

# Clear ESLint cache
rm .eslintcache

# Clear all caches
pnpm clean
rm -rf .vite .eslintcache .nyc_output coverage

# Reset everything
pnpm clean
rm -rf node_modules apps/*/node_modules packages/*/node_modules
rm -rf apps/backend/dist apps/frontend/dist packages/shared-types/dist
rm -rf .vite .eslintcache .nyc_output coverage
pnpm install
pnpm build
```

### Debugging Commands

```bash
# Check Node.js version
node --version

# Check pnpm version
pnpm --version

# Check TypeScript version
pnpm tsc --version

# List all workspace packages
pnpm list --depth 0

# Check for circular dependencies
pnpm why <package-name>

# Verify workspace configuration
pnpm list --workspace-root

# Check environment variables (backend)
cd apps/backend && cat .env

# Check running processes
ps aux | grep node

# Check Redis connection
redis-cli ping

# Monitor memory usage
watch -n 1 free -h

# Monitor disk space
df -h
```

## Maintenance

### Cache Management

```bash
# Clear Redis cache
docker exec -it gitray-redis redis-cli FLUSHALL

# Clear disk cache
rm -rf apps/backend/cache/*

# Clear repository locks
rm -rf apps/backend/locks/*

# Clear logs
rm -rf apps/backend/logs/*
rm -rf logs/*
```

### Log Management

```bash
# View combined logs
tail -f apps/backend/logs/combined.log

# View error logs only
tail -f apps/backend/logs/error.log

# Search logs for errors
grep -i error apps/backend/logs/combined.log

# Count errors in logs
grep -c ERROR apps/backend/logs/combined.log

# View last 100 log entries
tail -n 100 apps/backend/logs/combined.log

# Follow logs with grep filter
tail -f apps/backend/logs/combined.log | grep "cache"
```

### Performance Monitoring

```bash
# Monitor backend metrics
watch -n 5 curl -s http://localhost:3001/metrics

# Monitor health status
watch -n 5 curl -s http://localhost:3001/health/detailed

# Monitor memory pressure
watch -n 5 curl -s http://localhost:3001/health/memory

# Monitor cache stats
watch -n 5 curl -s http://localhost:3001/api/cache/stats

# Node.js heap snapshot (requires --inspect)
node --inspect apps/backend/dist/index.js
# Then in Chrome: chrome://inspect
```

## Git Workflow

### Feature Development

```bash
# Start new feature
git checkout dev
git pull origin dev
git checkout -b feat/feature-name

# Make changes and commit
git add .
git commit -m "feat: add feature description"

# Push feature branch
git push origin feat/feature-name

# Create pull request (via GitHub UI)
```

### Bug Fixes

```bash
# Start bug fix
git checkout dev
git pull origin dev
git checkout -b fix/bug-description

# Make changes and commit
git add .
git commit -m "fix: resolve bug description"

# Push fix branch
git push origin fix/bug-description

# Create pull request (via GitHub UI)
```

### Updating Branch

```bash
# Update feature branch with latest dev
git checkout dev
git pull origin dev
git checkout feat/feature-name
git merge dev

# Or use rebase (cleaner history)
git checkout feat/feature-name
git rebase dev

# Resolve conflicts if any
git add .
git rebase --continue

# Force push if rebased
git push origin feat/feature-name --force-with-lease
```

## CI/CD

### Pre-commit Checks (Run Locally)

```bash
# Run all pre-commit checks manually
pnpm lint
pnpm format
pnpm lint:md
pnpm test
pnpm build

# Simulate CI pipeline locally
pnpm lint && pnpm format && pnpm test && pnpm build
```

### GitHub Actions (Automated)

```bash
# View workflow status
git push origin <branch>
# Check GitHub Actions tab in repository

# Re-run failed workflows (via GitHub UI)
# Navigate to Actions → Select workflow → Re-run jobs
```

## Production Deployment

### Build for Production

```bash
# Full production build
pnpm clean
pnpm install --frozen-lockfile
pnpm build

# Verify build artifacts
ls -lh apps/backend/dist
ls -lh apps/frontend/dist
ls -lh packages/shared-types/dist
```

### Environment Setup

```bash
# Set production environment variables
export NODE_ENV=production
export PORT=3001
export REDIS_HOST=production-redis-host
export REDIS_PORT=6379
# ... other production variables

# Or use .env.production files
cp apps/backend/.env.example apps/backend/.env.production
# Edit with production values
```

### Start Production Services

```bash
# Start backend in production mode
cd apps/backend
NODE_ENV=production node dist/index.js

# Or use PM2 for process management
pm2 start apps/backend/dist/index.js --name gitray-backend

# Serve frontend static files (via Nginx, Apache, or Node.js server)
# Frontend dist files in: apps/frontend/dist
```

## Useful Aliases (Add to ~/.bashrc or ~/.zshrc)

```bash
# GitRay aliases
alias gitray-dev="cd ~/gitray && pnpm dev"
alias gitray-test="cd ~/gitray && pnpm test"
alias gitray-build="cd ~/gitray && pnpm build"
alias gitray-clean="cd ~/gitray && pnpm clean && pnpm install"
alias gitray-logs="tail -f ~/gitray/apps/backend/logs/combined.log"
alias gitray-redis="docker exec -it gitray-redis redis-cli"
alias gitray-health="curl -s http://localhost:3001/health/detailed | jq"
```

## References

- **AGENTS.md**: Comprehensive project documentation
- **README.md**: User-facing documentation
- **package.json**: Scripts and dependencies
- **apps/backend/src/config.ts**: Backend configuration
- **scripts/**: Development scripts
