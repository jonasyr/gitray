<!-- markdownlint-disable MD013 -->

# Audit Progress Ledger

Tracks every phase and deliverable of the architecture audit brief against actual completion.
Updated continuously. **Analysis and documentation only — no production code changes.**

**Repo state:** `dev` @ `12efe61`. `git diff` against `apps/`, `packages/`, `eslint.config.mjs`
is empty and must stay empty for the duration of this audit.

Legend: ✅ done · 🟡 partial · ⬜ open · ⛔ not applicable (with reason)

---

## Phases

| # | Phase | Status | Notes |
| --- | --- | --- | --- |
| 1 | Repository reconnaissance | ✅ | Structure, stack, entry points, modules, feature flags, legacy code, partial refactors |
| 1b | Git history for partial migrations | ✅ | 597 commits analysed; backend stopped 2025-12-02 mid-refactor after 4 deadlock fixes — audit §3.4 |
| 1c | `scripts/*.sh` deep read | 🟡 | Dead-endpoint consumers identified; full behavioural read not done (low value — they are test harnesses) |
| 2 | Runtime & dependency reconstruction | ✅ | All modules traced; the five previously-shallow ones covered via codebase-mem metrics (C-11..C-13) |
| 3 | Database reconstruction | ⛔→✅ | No DB exists (verified). Real persistence model documented in audit §7 |
| 4 | Current-state diagrams | ✅ | 9 delivered; deployment topology ⛔ (no artifact exists) |
| 5 | Architectural health audit | ✅ | C-9..C-13 added from codebase-mem metrics; cross-module/domain-leak gaps closed |
| 6 | Re-evaluate old audit | ✅ | Claim-by-claim table, audit §12.4 |
| 7 | New architecture audit | ✅ | 18 sections + §0 |
| 8 | Multiple target architectures | ✅ | A, C, D expanded to B's depth; Option C has a full proposed schema |
| 9 | Target-state diagrams | ✅ | A, B, C, D all delivered and comparable |
| 10 | Recommendation | ✅ | Audit §15 |
| 11 | Migration plan | ✅ | Audit §16 |
| 12 | Documentation audit & update | ✅ | All 15 docs audited; 11 corrected. GEMINI.md had 4 non-existent dependencies |
| 13 | Validation | ✅ | Build/test/lint/LSP + full codebase-mem cross-verification pass (see below) |

---

## Phase 2 — module deep-trace

Each module must answer: what initialises it, who calls it, what it calls, what state it owns,
what config controls it, what it can fail on, sync/async, assumptions.

| Module | LOC | Status |
| --- | ---: | --- |
| `routes/*` | 1,824 | ✅ |
| `services/repositoryCache.ts` | 3,100 | ✅ |
| `services/repositoryCoordinator.ts` | 826 | ✅ |
| `services/gitService.ts` | 1,596 | ✅ |
| `services/cache.ts` | 851 | ✅ |
| `services/repositorySummaryService.ts` | 441 | ✅ |
| `utils/lockManager.ts` | 472 | ✅ |
| `middlewares/*` | 670 | ✅ |
| `config.ts` | 834 | ✅ |
| `services/fileAnalysisService.ts` | 3,498 | ✅ via codebase-mem metrics |
| `services/metrics.ts` | 2,003 | ✅ via codebase-mem metrics |
| `utils/hybridLruCache.ts` | 1,634 | ✅ via codebase-mem metrics |
| `utils/memoryPressureManager.ts` | 865 | ✅ via codebase-mem metrics |
| `utils/serializationWorker.ts` | 261 | ✅ via codebase-mem metrics |
| `services/distributedCacheInvalidation.ts` | 352 | ✅ via codebase-mem metrics |
| `utils/withTempRepository.ts` | 606 | ✅ |
| `utils/cleanupScheduler.ts`, `gracefulShutdown.ts` | 206 | ✅ found C-9 |

---

## Phase 4 — current-state diagrams

| # | Diagram | Status | Artifact |
| --- | --- | --- | --- |
| 1 | System context | ✅ | folded into current architecture |
| 2 | Application / container | ✅ | `gitray-current-architecture.html` |
| 3 | Backend module / component | ✅ | `gitray-current-architecture.html` |
| 4 | Runtime request / data-flow | ✅ | `gitray-request-lifecycle.html` |
| 5 | Database / ERD | ⛔→✅ | no DB; `gitray-persistence-architecture.html` replaces it |
| 6 | Module dependency | ✅ | `gitray-module-dependencies.html` |
| 7 | Auth / authz flow | ✅ | `gitray-auth.html` |
| 8 | Background / scheduled flows | ✅ | `gitray-background-jobs.html` |
| 9 | External integration | ✅ | `gitray-external.html` |
| 10 | Deployment topology | ⛔ | no deployment artifact exists in repo (verified) |
| + | C-1 defect sequence | ✅ | `gitray-lock-collision.html` |

## Phase 9 — target-state diagrams

| Option | Status | Artifact |
| --- | --- | --- |
| A — Minimal stabilisation | ✅ | `gitray-option-a.html` |
| B — Incremental modular refactor | ✅ | `gitray-target-architecture.html` |
| C — Postgres + job queue | ✅ | `gitray-option-c.html` |
| D — Drop Redis | ✅ | `gitray-option-d.html` |

---

## Phase 5 — health audit gaps

| Item | Status |
| --- | --- |
| Cross-module writes | ⬜ not explicit |
| Domain leakage | 🟡 partial |
| Missing abstractions | 🟡 partial |
| Per-issue fields (consequences + refactor implications) | 🟡 uneven |

---

## Phase 12 — documentation audit

| Document | Audited | Updated |
| --- | --- | --- |
| `README.md` | ✅ | ✅ |
| `AGENTS.md` | ✅ | ✅ |
| `GEMINI.md` | ✅ | ✅ |
| `CLAUDE.md` | ✅ | ✅ |
| `.serena/memories/*` (9 files) | ✅ | ✅ corrected in place — endpoints, curl params, React version, Tailwind/CSS reality |
| `apps/backend/.env.example` | ✅ | ⛔ accurate |
| `Strategy.md` | ✅ | ⛔ historical planning doc, left as-is |
| `apps/frontend/README.md` | ✅ | ✅ 4 stale items fixed |
| `apps/backend/perf/README.md` | ✅ | ✅ flagged (repointing k6 is a code change) |
| `scripts/api_test_scenarios.md` | ✅ | ✅ annotated |
| `prompts/*.md` | ⛔ | scratch files, out of scope |

---

## Deliverables

| # | Deliverable | Status |
| --- | --- | --- |
| 1 | Current architecture reconstruction | ✅ |
| 2 | Current-state diagrams | ✅ 9 delivered |
| 3 | New backend architecture audit | ✅ |
| 4 | Refactoring alternatives | ✅ all four detailed |
| 5 | Target-state diagrams | ✅ 4 options |
| 6 | Recommended architecture | ✅ |
| 7 | Migration plan | ✅ |
| 8 | Database architecture documentation | ✅ current model + Option C schema with columns, types, PK/FK, indexes, constraints |
| 9 | Documentation updates | ✅ |
| 10 | Uncertainty / open questions register | ✅ 8 items, 2 resolved by experiment |
| — | Overwrite `~/Downloads/BACKEND_ARCHITECTURE_AUDIT.md` | ⬜ deliberately held until the analysis is complete |

---

## Open questions

| ID | Question | Status |
| --- | --- | --- |
| Q-1 | Does the clone download all HEAD blobs? | ✅ RESOLVED by experiment (audit §17.1) |
| Q-2 | Does `getCommits` disagree with `rev-list --count`? | ✅ RESOLVED by experiment — yes: 4 commits, 3 parsed. Plus field-shifting on `\|` in author names (§17.4) |
| Q-3 | Is multi-instance ever intended? | ✅ RESOLVED, recommendation in §17.2 |
| Q-4 | How stale is served data in practice? | ✅ RESOLVED — warm reads in 9-30 ms with zero network, from a clone never refreshed (§17.5) |
| Q-5 | Does `refCount` drift and pin clones? | ✅ RESOLVED — **no drift observed**; all handles `refCount=0` after 4 bursts. P-4 downgraded |
| Q-6 | Are `.serena/memories` still used? | ✅ RESOLVED — actively used; all 9 corrected in place |
| Q-7 | Is `AIInsights` meant to become real? | ✅ RESOLVED — intended but far future; keep as labelled placeholder |
| Q-8 | Actual performance profile | ✅ RESOLVED by measurement — cache gives 50-100x warm; `/file-analysis` only 2.2x (§17.6) |

---

## Tooling limitations recorded

| Tool | Status |
| --- | --- |
| Serena (LSP) | ✅ used for all dead-code verification |
| Archify | ✅ used for all diagrams |
| codebase-memory-mcp | ✅ **works** — my earlier "broken" note was an error: the tools take a `project` name, not a `repo_path`. Used for SCC/cluster analysis, complexity metrics, Route enumeration and inbound call tracing |
| Build / Vitest / ESLint / markdownlint | ✅ executed |
| SonarCloud | ⛔ not run locally (runs in CI) |
| Runtime observation | ✅ **server started and driven against 6 real repositories**; C-1 reproduced 3/3. Redis not used (memory+disk backends) |

---

## Cross-verification pass (codebase-memory + Serena + build tooling)

Run after the first draft, because a single tool proved unreliable.

| Claim class | Method | Outcome |
| --- | --- | --- |
| Dead code | Serena `find_referencing_symbols` **vs** codebase-mem `trace_path(inbound, include_tests)` **vs** grep | **Serena gave a false negative**: it reported 0 references for `withTempRepository`, which has 14+ call sites in its own unit test. All claims re-worded from "zero references" to "no production caller". |
| Every `file:line` citation | script extracts all citations from the audit and every diagram spec, resolves each against the working tree, prints the actual line | **46 citations were wrong** and were corrected; all 21 distinct citations now resolve to lines whose content matches the claim |
| Diagram `sources` line refs | resolved each numeric `line` field against the file | 2 wrong (`lockManager.ts:286`→289, `gitService.ts:41`→42), corrected and re-delivered |
| LOC figures | `wc -l` over the tree | **"~14,000 lines of backend" was wrong — it is 21,908.** Corrected in 5 places; the Option B deletion estimate was re-grounded from an unsupported "4,000-5,000" to a measured "~2,600-3,000" |
| Dependency cycles | independent Tarjan SCC over a script-extracted import graph, cross-checked against codebase-mem clusters | 1 SCC of six modules, 3 direct two-cycles — confirmed by both |
| Complexity / hot paths | codebase-mem per-function metrics | New findings C-11 (10 hot spots, 4 hidden linear-scan-in-loop sites), C-12, C-13 |
| Route inventory | codebase-mem `Route` nodes (77) vs hand-built table | Agreed |
| Background timers | exhaustive `setInterval` enumeration + caller trace | New findings C-9 (shutdown drops its async callback) and C-10 |
| Diagram card claims | each card item re-checked against source | 7 imprecise claims corrected across 5 diagrams |
| TTLs, metric count, lock timeout, auth absence | direct source read | All confirmed as stated |
| Serena memory file/path references | script resolves every path in all 9 memories | 4 genuinely missing (`ActivityHeatmap`, `CommitList`, `RepoInput`, `tailwind.config.js`); 3 were correctly-labelled migration history, 1 was stale and fixed |
| Serena memory endpoints | script classifies every `/api/...` mention as live / mounted / not-a-route | `/api/cache/stats` and `POST /api/repositories` do not exist; both corrected in 2 files |
| Serena memory commands | **executed each one** | `pnpm type-check` (root) and `pnpm build:frontend` **fail**; `pnpm test:integration` does not exist. All three corrected, and the replacements were run to confirm they work. `pnpm tsc --noEmit` was verified working and left alone |
| Frontend CSS pipeline | import trace from `main.tsx` | **F-1**: `globals.css` is imported by nothing; the app renders from a 4,192-line committed Tailwind bundle |

**Diagrams:** all 9 re-delivered at 9/9 checks, 0 errors, 0 warnings, and all 9 pass browser
containment at 1440x900, 1600x1000, 1920x1080 and 2048x1320 in both themes.

---

## Live system verification (2026-09-04)

The backend was started via a throwaway driver (the Windows entry-point guard prevents direct
launch — finding P-8) and driven against six real public repositories. **No source file was
modified**; all configuration was supplied as environment variables.

| Test | Result |
| --- | --- |
| **C-1 reproduction** | **CONFIRMED 3/3 cold repos.** Concurrent dashboard pattern → `/summary` and `/churn` return **500**. Stacks land exactly on `repositoryRoutes.ts:219` and `:246`, as predicted statically |
| Sequential control | All four endpoints return **200** — isolates the cause to concurrency |
| Q-2 parser | 4-commit repo → 3 parsed. Empty subject dropped; `\|` in author name shifts fields |
| Q-4 staleness | Warm reads 9-30 ms, no network; clone never refreshed |
| Q-5 refCount | **No drift** — all handles `refCount=0`. P-4 downgraded |
| Q-8 performance | full-data 1.53s→0.015s, summary 1.61s→0.030s, churn 0.17s→0.009s, **file-analysis 2.92s→1.33s** |
| C-3 pagination | `limit=1/10/100` all cost the same — limit applied after full materialisation |
| Admin auth | no token → 403, wrong token → 403, correct → 200, `/metrics` → 403 |
| SSRF | `127.0.0.1:6379` → 400, `evil.example.com` → 400 |
| 404 handler | returns hardened JSON, no path reflection |
| S-1 resume endpoint | **200 with no token** — confirmed unauthenticated |
| M-7 import side effects | Log order proves every singleton and timer starts **before** `Index.ts file loading...` |

**Cleanup note:** 5 `git-visualizer-*` clone directories remained in the system temp directory after
the process was hard-killed. Shared clones are retained by design for `REPO_CACHE_MAX_AGE_HOURS`
(24 h default), so this is expected behaviour rather than a leak — but combined with C-9 it means
clones survive both graceful and ungraceful shutdown.
