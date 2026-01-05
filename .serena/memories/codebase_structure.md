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
│   └── frontend/              # React UI (redesigned with shadcn/ui)
│       ├── src/
│       │   ├── components/    # React components
│       │   │   ├── ui/        # shadcn/ui component library
│       │   │   │   ├── button.tsx
│       │   │   │   ├── card.tsx
│       │   │   │   ├── tabs.tsx
│       │   │   │   ├── dialog.tsx
│       │   │   │   ├── drawer.tsx
│       │   │   │   ├── alert.tsx
│       │   │   │   ├── badge.tsx
│       │   │   │   ├── avatar.tsx
│       │   │   │   ├── chart.tsx
│       │   │   │   ├── sonner.tsx (toast)
│       │   │   │   ├── form.tsx
│       │   │   │   ├── table.tsx
│       │   │   │   ├── select.tsx
│       │   │   │   ├── input.tsx
│       │   │   │   ├── textarea.tsx
│       │   │   │   ├── utils.ts
│       │   │   │   └── [47+ more shadcn components]
│       │   │   ├── figma/     # Figma design references
│       │   │   ├── Header.tsx
│       │   │   ├── Footer.tsx
│       │   │   ├── LandingPage.tsx
│       │   │   ├── DashboardPage.tsx (main analytics view)
│       │   │   ├── CommitHeatmap.tsx
│       │   │   ├── ActivityChart.tsx
│       │   │   ├── CodeChurnChart.tsx
│       │   │   ├── FileDistributionChart.tsx
│       │   │   ├── FileTypeList.tsx
│       │   │   ├── GraphViewTimeline.tsx
│       │   │   ├── GitDiffViewer.tsx
│       │   │   ├── AIInsights.tsx
│       │   │   ├── PremiumFeatures.tsx
│       │   │   ├── SettingsDrawer.tsx
│       │   │   ├── NewsDrawer.tsx
│       │   │   ├── InfoModal.tsx
│       │   │   ├── LoadingSpinner.tsx
│       │   │   ├── RiveLogo.tsx
│       │   │   └── RiveLoader.tsx
│       │   ├── services/      # API clients
│       │   │   └── api.ts
│       │   ├── styles/        # CSS files (minimal, mostly Tailwind)
│       │   ├── App.tsx        # Root component
│       │   ├── main.tsx       # Application entry
│       │   ├── index.css      # Global styles + Tailwind imports
│       │   ├── test-setup.ts  # Vitest setup
│       │   └── vite-env.d.ts  # Vite type declarations
│       ├── public/            # Static assets (Rive animations, etc.)
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

### Frontend Components & Services

#### Core Components

- **App.tsx**: Root component managing routing, theme, and global state
- **LandingPage.tsx**: Repository input and onboarding
- **DashboardPage.tsx**: Main analytics dashboard with multiple visualization tabs
- **Header.tsx**: Navigation bar with theme toggle, settings, news
- **Footer.tsx**: Footer with links and information

#### Visualization Components

- **CommitHeatmap.tsx**: GitHub-style contribution calendar heatmap
- **ActivityChart.tsx**: Time-series activity visualization
- **CodeChurnChart.tsx**: Code change and stability metrics
- **FileDistributionChart.tsx**: Pie/donut chart for file type distribution
- **FileTypeList.tsx**: Detailed file type breakdown with icons
- **GraphViewTimeline.tsx**: Git graph visualization with branches
- **GitDiffViewer.tsx**: Commit diff viewer with syntax highlighting

#### Feature Components

- **AIInsights.tsx**: AI-powered repository analysis and recommendations
- **PremiumFeatures.tsx**: Premium feature showcase and upsell
- **SettingsDrawer.tsx**: User settings and preferences
- **NewsDrawer.tsx**: Product updates and changelog
- **InfoModal.tsx**: Contextual help and information modals
- **LoadingSpinner.tsx**: Loading state indicator
- **RiveLoader.tsx**: Rive-powered animated loader
- **RiveLogo.tsx**: Animated Rive-based logo

#### shadcn/ui Component Library (`components/ui/`)

Complete set of 47+ accessible, customizable UI primitives built on Radix UI:

- **Form Controls**: button, input, textarea, select, checkbox, radio-group, switch, slider
- **Containers**: card, sheet, drawer, dialog, alert-dialog, popover, hover-card
- **Navigation**: tabs, accordion, navigation-menu, menubar, breadcrumb, pagination
- **Display**: table, badge, avatar, alert, skeleton, progress, chart
- **Advanced**: carousel, command, sonner (toast), scroll-area, resizable panels

#### Services

- **api.ts**: Axios-based API client for backend communication
