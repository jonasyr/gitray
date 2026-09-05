<!-- markdownlint-disable -->

# CLAUDE.md

Guidance for Claude when contributing to the GitRay monorepo. Follow these rules before any other doc unless overridden by a nearer `AGENTS.md`.

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

## Architectural direction (decided 2026-09-05)

**Destination: PostgreSQL-backed index with delta updates. Route: fix correctness and the Git layer
first.**

Requirements driving this: any repository size including 1M+ commits; a one-time analysis that is
persisted and never lost; shared globally with every visitor; optional notification on completion.
A cache cannot satisfy these — it is evictable and lost on restart.

Measured feasibility for a 1M-commit repository, indexing branches and tags (not just the default
branch): **~24-41 s** for commit metadata, **10-35 min** for file churn — roughly **15-25 minutes
once**, then milliseconds per delta. The wide range is repository shape, not method: blob density
varies 13x and throughput 3.7x between real repositories.

Measured constraints that shape the design:

- **Do not clone with `--filter=blob:none` when you need `--numstat`.** It is **624x slower**,
  because Git lazily fetches every blob over the network. Full clone for the churn pass — then
  prune to blobless for retention, which is safe: a single-file diff on a blobless clone costs
  0.55 s, because the penalty is on *bulk* traversal, not *point* lookup.
- **Index metadata and churn as separate jobs**, so the dashboard is usable in under a minute.
- **Never `--mirror`-clone and never index `--all`.** A mirror of a GitHub repo fetches
  `refs/pull/*` — 3,288 refs on `git/git` — inflating the commit universe 2.48x with unmerged fork
  commits and nearly doubling disk. Index the union of `--branches --tags`.

Four schema decisions are load-bearing and were validated against the team's planning vault
(`NiklasSkulll/GitRayDocs`, read 2026-09-05) — see audit §17.9:

- **Per-commit-per-file facts, never monthly buckets.** Only 3-10M rows at 1M commits, and
  bucketing forecloses change coupling, code ownership and bus factor permanently.
- **A `refs` table, and no branch column on `commits`.** The Priority-1 Graph View Timeline needs
  branches; a commit is reachable from many refs, so branch membership is a query, not a column.
- **`repositories.visibility` and `owner_user_id` from the first migration.** Private repositories
  are a paid tier; a private index must never be served globally. This is a security boundary that
  cannot be retrofitted.
- **A single global `authors` table.** GDPR applies — the entity is a German GbR and commit authors
  are third-party personal data. Erasure must cost one row, and must pseudonymise the identity
  rather than delete facts.

**Hard prerequisites before any persistence work** — the current Git layer would corrupt the index:

1. C-1, the lock defect above.
2. The commit parser: measured **4 commits in, 3 parsed**. It drops empty-subject commits and
   shifts fields on a `|` in an author name. A persisted index built on it diverges from
   `rev-list` silently, and every delta compounds the drift.

Full plan, phases and schema: `docs/BACKEND_ARCHITECTURE_AUDIT.md` §15 and §16.



## Project Snapshot

- **Monorepo**: pnpm workspaces with TypeScript project references
- **Frontend**: React 18 + Vite 6 + Tailwind CSS 4
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

- **Architecture audit (authoritative, evidence-based): `docs/BACKEND_ARCHITECTURE_AUDIT.md`**
  Read this before any structural work. It documents the verified current architecture, five
  critical/high defects (including a live cross-request data-corruption bug in `lockManager`),
  dead code, documentation drift, and the recommended phased refactor.
- Diagrams: `docs/diagrams/*.html` (current architecture, target architecture, the lock defect).
  Each is also embedded inline in the audit section it belongs to, as a PNG in
  `docs/diagrams/img/`. After changing any diagram, run `node docs/diagrams/capture-png.mjs`
  or the embedded images will keep showing the previous version.
- `docs/ARCHITECTURE.md`, `docs/API.md` and `docs/TESTING.md` do **not** exist yet; they are
  planned as part of the audit's migration Phase 7.

## When in Doubt

- Mirror existing patterns within the same folder.
- Prefer modifying existing modules over creating new abstractions.
- Ask for guidance before adding new top-level packages or changing folder structure.
