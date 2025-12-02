# GitRay - Codebase Structure

## Repository Layout

```
gitray/
├── apps/
│   ├── backend/               # Express API server
│   │   ├── src/
│   │   │   ├── routes/        # API endpoint definitions
│   │   │   │   ├── healthRoutes.ts
│   │   │   │   ├── commitRoutes.ts
│   │   │   │   ├── repositoryRoutes.ts
│   │   │   │   └── index.ts
│   │   │   ├── services/      # Business logic layer
│   │   │   │   ├── cache.ts
│   │   │   │   ├── gitService.ts
│   │   │   │   ├── repositoryCache.ts
│   │   │   │   ├── repositoryCoordinator.ts
│   │   │   │   ├── distributedCacheInvalidation.ts
│   │   │   │   ├── fileAnalysisService.ts
│   │   │   │   ├── repositorySummaryService.ts
│   │   │   │   ├── metrics.ts
│   │   │   │   └── logger.ts
│   │   │   ├── utils/         # Utility functions
│   │   │   │   ├── hybridLruCache.ts
│   │   │   │   ├── lockManager.ts
│   │   │   │   ├── memoryPressureManager.ts
│   │   │   │   ├── gitUtils.ts
│   │   │   │   ├── urlSecurity.ts
│   │   │   │   ├── routeHelpers.ts
│   │   │   │   ├── withTempRepository.ts
│   │   │   │   ├── serializationWorker.ts
│   │   │   │   ├── gracefulShutdown.ts
│   │   │   │   └── cleanupScheduler.ts
│   │   │   ├── middlewares/   # Express middlewares
│   │   │   │   ├── errorHandler.ts
│   │   │   │   ├── validation.ts
│   │   │   │   ├── memoryPressureMiddleware.ts
│   │   │   │   ├── requestId.ts
│   │   │   │   ├── adminAuth.ts
│   │   │   │   └── strictContentType.ts
│   │   │   ├── config.ts      # Configuration management
│   │   │   └── index.ts       # Application entry point
│   │   ├── perf/              # k6 performance tests
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── frontend/              # React UI
│       ├── src/
│       │   ├── components/    # React components
│       │   │   ├── ActivityHeatmap.tsx
│       │   │   ├── CommitList.tsx
│       │   │   ├── RepoInput.tsx
│       │   │   ├── RiveLogo.tsx
│       │   │   └── RiveLoader.tsx
│       │   ├── pages/         # Page components
│       │   │   └── MainPage.tsx
│       │   ├── services/      # API clients
│       │   │   └── api.ts
│       │   ├── utils/         # Utility functions
│       │   │   └── dateUtils.ts
│       │   ├── styles/        # CSS files
│       │   │   └── heatmap.css
│       │   ├── types/         # TypeScript type definitions
│       │   │   └── react-calendar-heatmap.d.ts
│       │   ├── assets/        # Static assets
│       │   ├── App.tsx        # Root component
│       │   ├── main.tsx       # Application entry
│       │   └── test-setup.ts  # Vitest setup
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
│
├── packages/
│   └── shared-types/          # Shared TypeScript definitions
│       ├── src/
│       │   └── index.ts       # Type exports
│       ├── dist/              # Built types (CJS + ESM)
│       ├── package.json
│       └── tsconfig.json
│
├── scripts/                   # Dev and maintenance scripts
│   ├── start.sh              # Development environment manager
│   └── normalize-line-endings.sh
│
├── .github/                   # GitHub Actions workflows
├── .husky/                    # Git hooks
├── .vscode/                   # VS Code settings
├── .serena/                   # Serena MCP memories
├── logs/                      # Application logs (gitignored)
├── coverage/                  # Test coverage reports (gitignored)
├── node_modules/              # Dependencies (gitignored)
│
├── package.json               # Root workspace config
├── pnpm-workspace.yaml        # pnpm workspace definition
├── tsconfig.json              # Root TypeScript config with project references
├── vitest.config.ts           # Vitest test configuration
├── eslint.config.mjs          # ESLint flat config
├── prettier.config.js         # Prettier configuration
├── .gitignore
├── CLAUDE.md                  # Guidelines for Claude AI assistant
├── README.md                  # Project documentation
└── LICENSE

```

## Important File Locations

### Configuration Files
- **Root TypeScript**: `tsconfig.json` (composite project references)
- **Backend Config**: `apps/backend/src/config.ts`
- **Environment**: `.env` (not checked in)
- **ESLint**: `eslint.config.mjs` (flat config format)
- **Prettier**: `prettier.config.js`
- **Vitest**: `vitest.config.ts` (workspace-aware)

### Entry Points
- **Backend Server**: `apps/backend/src/index.ts`
- **Frontend App**: `apps/frontend/src/main.tsx`
- **Shared Types**: `packages/shared-types/src/index.ts`

### Testing
- **Backend Tests**: Co-located with source files as `*.test.ts`
- **Frontend Tests**: Co-located with components as `*.test.tsx`
- **Performance Tests**: `apps/backend/perf/`

## Build Artifacts (Gitignored)
- `dist/` - Compiled TypeScript output
- `*.tsbuildinfo` - TypeScript incremental build cache
- `coverage/` - Test coverage reports
- `.vite/` - Vite cache
- `.eslintcache` - ESLint cache
- `.nyc_output/` - Coverage intermediate files
- `logs/` - Winston log files
- `node_modules/` - Dependencies

## Key Architectural Components

### Backend Services
- **gitService**: Git operations (clone, log, analysis)
- **cache**: Multi-tier caching (Redis + Memory + Disk)
- **repositoryCoordinator**: Shared repository management
- **repositoryCache**: Repository-level caching
- **fileAnalysisService**: File type distribution analysis
- **repositorySummaryService**: Repository metadata extraction
- **metrics**: Prometheus metrics collection
- **logger**: Winston logging with daily rotation

### Backend Utilities
- **hybridLruCache**: LRU cache with hierarchical tiers
- **lockManager**: Distributed locking for coordination
- **memoryPressureManager**: Memory threshold monitoring
- **urlSecurity**: Repository URL validation

### Frontend Services
- **api.ts**: Axios-based API client for backend communication
