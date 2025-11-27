# GitRay - Project Overview

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
- **Framework**: Express 5
- **Git Operations**: simple-git
- **Caching**: Redis 7 (via ioredis)
- **Logging**: Winston with daily rotate file
- **Metrics**: Prometheus (prom-client)
- **Validation**: Express-validator, Zod
- **Security**: Helmet, CORS, express-rate-limit

### Frontend  
- **Framework**: React 19 with TypeScript 5.7
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS 4
- **Visualizations**: react-calendar-heatmap, ApexCharts
- **Animations**: Rive (@rive-app/react-canvas)
- **HTTP Client**: Axios
- **Date Handling**: date-fns

### Shared Infrastructure
- **Package Manager**: pnpm 10.16.1 (workspaces)
- **Testing**: Vitest 3.2.3 (86.4% coverage)
- **Performance Testing**: k6 for backend load testing
- **Linting**: ESLint 9 (flat config)
- **Formatting**: Prettier 3
- **Git Hooks**: Husky + lint-staged
- **CI/CD**: GitHub Actions (assumed from .github directory)

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
Main development branch: `dev`
Current working branch: `120-enhancementscopebackend-refactor-old-routes-to-use-unified-cache-service-retain-redis-remove-manual-caching`

## License
ISC License
