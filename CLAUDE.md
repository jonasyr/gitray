<!-- markdownlint-disable -->
# CLAUDE.md

Guidance for Claude when contributing to the GitRay monorepo. Follow these rules before any other doc unless overridden by a nearer `AGENTS.md`.

## Project Snapshot
- **Monorepo**: pnpm workspaces with TypeScript project references
- **Frontend**: React 19 + Vite 6 + Tailwind CSS 4
- **Backend**: Express 5 with simple-git, Redis caching, Prometheus metrics
- **Shared**: `packages/shared-types` exported via `@gitray/shared-types`
- **Testing**: Vitest across apps; k6 for backend perf

## Repo Layout (high level)
```
apps/
  frontend/   # React UI, Vite, Tailwind, API clients
  backend/    # Express routes, services, cache/coordination layers
packages/
  shared-types/ # Reusable TypeScript types and schemas
scripts/       # Dev/start/maintenance scripts
```
Keep new files inside these roots; never add code under build artifacts (`dist/`, `.next/`, `coverage/`, `node_modules/`).

## Daily Commands
```bash
pnpm install               # Install workspace deps
pnpm dev                   # Start frontend+backend with hot reload (builds shared-types)
pnpm dev:frontend          # Frontend only (Vite on 5173)
pnpm dev:backend           # Backend only (Express on 3001)
pnpm build                 # Full build: shared-types → backend → frontend
pnpm test                  # Vitest across all workspaces
pnpm lint                  # ESLint flat config
pnpm lint:md               # Markdown lint
pnpm format                # Prettier format
```
Build order matters: run `pnpm build:shared-types` before isolated backend/frontend builds.

## Code Standards (enforceable)
- TypeScript **strict** everywhere; avoid `any` and implicit `any`.
- React components must be functional with hooks; follow Rules of Hooks.
- Use provided logger (winston) instead of `console.log` in runtime code.
- Import shared types from `@gitray/shared-types`; do not duplicate interfaces.
- Absolute imports from `src/` via `@/` alias; keep grouped (external → internal → styles/tests).
- Tailwind for styling; avoid inline style objects except dynamic values.
- Keep tests co-located: `*.test.ts`/`*.spec.ts` beside implementations.
- Prefer named exports; avoid default exports for components and utilities.

### Naming
- Components & types/interfaces: **PascalCase** (`CommitHeatmap`, `CommitHeatmapProps`)
- Hooks: `use` + camelCase (`useCommitFilters`)
- Utilities/functions: `camelCase`
- Constants/enums: `SCREAMING_SNAKE_CASE`
- Environment vars: `UPPER_SNAKE_CASE`

### Async & Error Handling
- Use `async/await` with try/catch at call boundaries; wrap errors with context and rethrow typed errors.
- Avoid promise chains; never swallow errors. Use abort signals for cancellable Git/HTTP operations.

## File Placement Rules
- Frontend components: `apps/frontend/src/components/<Name>/index.tsx`
- Pages/routes: `apps/frontend/src/pages` or `/src/routes` per existing pattern
- Hooks: `apps/frontend/src/hooks/use<Name>.ts`
- Utilities/helpers: `apps/**/src/lib/` or `apps/**/src/utils/` matching folder conventions
- Backend routes: `apps/backend/src/routes/`; services under `apps/backend/src/services/`
- Shared types/schemas: `packages/shared-types/src/`
- Tests: same folder as target file with `.test.ts`/`.spec.ts`
- Configuration: respect existing `config/` modules; do not hard-code secrets (use `.env`)

If unsure where to place code, search existing modules and mirror their location before creating new folders.

## Workflow Expectations
- For feature work: update types first, then backend services/routes, then frontend API clients/components, with tests at each layer.
- For bug fixes: reproduce with a failing test, patch minimally, keep regression test.
- For refactors: keep behavior identical, maintain coverage, and avoid mixing with feature changes.
- Keep diffs small and focused; avoid drive-by cleanup unless directly related.
- Use conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).

## Common Mistakes to Avoid
- Skipping `pnpm run build:shared-types` before running/packaging apps → leads to missing types.
- Adding new `node_modules` or build outputs to git.
- Creating duplicate types instead of importing from shared types.
- Using relative paths when `@/` alias exists.
- Introducing `console.log` or unhandled promise rejections in backend code.
- Forgetting to update both backend and frontend when API contracts change.

## Quality & Checks
- Run tests and lint for code changes; doc-only edits may skip tests (still ensure formatting is clean).
- Keep ≥80% coverage on critical paths; prefer writing tests alongside new logic.
- Use `pnpm lint:md` for Markdown changes if formatting issues are possible.

## Context Links
- Architecture: `docs/ARCHITECTURE.md` (overall design, caches, streaming)
- API: `docs/API.md` (endpoints/contracts)
- Testing: `docs/TESTING.md` (testing strategy, coverage)

## When in Doubt
- Mirror existing patterns within the same folder.
- Prefer modifying existing modules over creating new abstractions.
- Ask for guidance before adding new top-level packages or changing folder structure.
