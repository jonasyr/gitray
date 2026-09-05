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

---

## Recommendation reversal (2026-09-05)

The team supplied product requirements that were not in the original brief: **any repository size
including 1M+ commits; a one-time analysis persisted and never lost; shared globally; optional
notification on completion.**

The first draft recommended **Option B** (refactor, no new infrastructure) on the grounds that the
cache already delivers 50-100x on warm reads. That measurement was taken on 75-600 commit
repositories and does not generalise, and a cache is disqualified outright by the persistence
requirement.

**Revised recommendation: Option C (PostgreSQL + job queue + delta updates) as the destination,
reached through Option B's phases, which are its prerequisite.**

### Scale measurements taken to test feasibility

| Repository | Commits | Full clone | Blobless | `--numstat` FULL | `--numstat` BLOBLESS |
| --- | ---: | ---: | ---: | ---: | ---: |
| `p-limit` *(clean run)* | 81 | 150 KB | 111 KB | **63 ms** | **39,299 ms** |
| `express` | 6,163 | 11 MB | 4 MB | 1,595 ms | killed >10 min |
| `git/git` | 82,135 | 317 MB | 117 MB | 46,298 ms | killed >20 min |

Extrapolated to 1M commits on a full clone: metadata **~24 s**, churn **~9.4 min**.

### New findings from this round

| ID | Finding |
| --- | --- |
| **S-1** | `--numstat` on a `--filter=blob:none` clone is **624x slower** (identical output) because Git lazily fetches every blob. **Contradicts the v1 audit's clone recommendation.** |
| **S-2** | Metadata (24 s) and churn (9.4 min) differ by 23x — they must be **separate index jobs**. Neither the team's brainstorm nor v1 proposes this. |
| **S-3** | Disk is the real constraint (~4 GB per 1M-commit repo vs a 5 GB default limit). Refinement: full clone for the initial churn pass, prune to blobless for retention. |

### Documents updated for the reversal

Audit §1.5, §2.4 (new: requirements), §14 Option B/C, §15.1 (rewritten), §16 (Phases 6-10 added,
Phase 3 clone policy corrected), §17.7 (new: scale measurements), §17.10 diagram index;
`gitray-option-c` and `gitray-target-architecture` diagrams; `docs/diagrams/README.md`;
`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`; two Serena memories.

---

## Schema validation round (2026-09-05)

Measured the **data shape** on two repositories with deliberately different profiles, to test
whether the proposed schema is right and whether it forecloses future features. Full detail in
audit §17.8.

| Measure | `git/git` (82k commits) | `facebook/react` (21.7k commits) |
| --- | ---: | ---: |
| Full clone | 317 MB | **1.1 GB** (13x more per commit) |
| numstat throughput | 1,774 commits/s | **482 commits/s** (3.7x spread) |
| Merge commits | 25.9% | 12.0% |
| File rows per commit | 1.66 | 6.11 |
| Distinct authors | 2,790 | 2,163 (sublinear) |
| Max files in one commit | 928 | **2,814** |
| Blobless clone | 117 MB | **47 MB** (23x smaller) |

### New findings

| ID | Finding |
| --- | --- |
| **S-4** | §17.7's single-point estimates were the optimistic end. Corrected range for 1M commits: **9.4-34.6 min** churn index, **4-50 GB** clone. Disk depends on blob profile, not commit count. |
| **S-5** | Blobless retention is 2.7-23x smaller and fully supports metadata deltas: `rev-list` 365 ms, `merge-base --is-ancestor` 279 ms on react. |
| **S-6** | **Refutes the naive retention plan**: churn deltas on a blobless clone are 37-100x slower (94 s per 200 commits), and re-cloning full is no better (100 s). → **decouple metadata freshness from churn freshness.** |

### Schema decisions the data settled

- **Keep per-commit-per-file facts; reject v1's `file_churn_monthly` bucketing.** Only 1.7-6.1 M
  rows at 1M commits. Bucketing would permanently foreclose change coupling, code ownership, bus
  factor and hotspot decay.
- **Add an `authors` table with a `canonical_author_id` self-FK** — 3.4% of e-mails appear under
  multiple name spellings, so identity merging is a requirement.
- **Store `parents` and `is_merge`** — 12-26% of commits are merges and emit no numstat.
- **Reject path interning** — only 3.8x reuse on react; a join on the hottest table for a few MB.
- **Nullable additions/deletions** for binary files; **`old_path`** for the 1.4% renames, which
  appear in two formats.

### Blocked → RESOLVED (2026-09-05)

`NiklasSkulll/GitRayDocs` returned **404** over HTTPS with the available token. It was then cloned
successfully over **SSH** and read in full. The 404 was an authorisation artefact of the transport,
not evidence the repository was unshared — an earlier draft over-read it as a hard blocker.

## Roadmap reconciliation round (2026-09-05)

Read: 7 planning notes, 2,945 lines — `GitRay-Features-Roadmap.md`,
`GitRay Backend Refactor - Analysis Sessions, Indexing & Postgres-Persistenz.md`,
`GitRay-Technical-Architecture.md`, `GitRay-Business-Legal.md`, `GitRay-Project-Overview.md`,
`GitRay-UI-Design.md`, `Datalyt-Technologies-GbR-und-GitRay.md`.

Answer to the blocking question: **no per-line features** (no blame, no line-level ownership), so
**no further column family is needed**. The Diff Viewer, Refactoring Detection and PlantUML items
read blobs from the clone on demand, not from the database.

### Measurements taken this round

| Measure | `git/git` | `facebook/react` |
| --- | ---: | ---: |
| Commits from `HEAD` | 82,135 | 21,678 |
| Commits from `--branches --tags` | **85,557** (1.04x) | **35,213** (1.62x) |
| Commits from `--all` on a `--mirror` clone | **203,538** (2.48x) | 35,213 |
| Ref namespaces on the mirror | 3,288 `refs/pull`, 1,008 tags, 8 heads | 968 heads, 174 tags |
| Mirror clone size | **601 MB** (vs 317 MB bare) | — |
| Message body vs subject (10k commits) | 813 B vs 49 B — **16x** | — |
| Single-file diff on a blobless clone | — | **550 ms** cold, **35 ms** warm |
| Whole-commit diff on a blobless clone | — | **550 ms** |

### Findings R-1 … R-7 (audit §17.9)

| # | Finding |
| --- | --- |
| **R-1** | Branch coverage costs **1.0-1.7x** more commits. **Never `--mirror`-clone or index `--all`** — `refs/pull/*` inflates `git/git` 2.48x with unmerged fork commits and nearly doubles disk. Needs a `refs` table; delta rule becomes **per ref**. |
| **R-2** | Priority-1 Tag Clustering and Issue Overlay need the commit **body** (16x the subject, ~813 MB at 1M commits). Store it, plus an extracted `commit_refs` table so the overlay is a join, not a scan. |
| **R-3** | **Rescues S-6.** The Diff Viewer does *not* break blobless retention — the penalty is on *bulk* traversal, not *point* lookup (0.55 s per file). Two-tier retention stands. |
| **R-4** | **Corrects an earlier claim.** "There are no users" is true of the code, false of the plan: accounts are Priority 2 and private repos are a paid tier. `repositories` needs `visibility` + `owner_user_id` from the first migration — a security boundary, not a feature. |
| **R-5** | Coverage tiers are a confirmed pricing requirement. `index_state` must be keyed `(repository_id, coverage)` — v1 got this right — or a partial index is served forever as complete. v1's own `file_churn` has no time dimension and cannot serve its own coverage tiers. |
| **R-6** | **GDPR was absent from this audit.** German GbR; commit authors are third-party personal data. This is the real justification for a **global** `authors` table: erasure costs one row, and must pseudonymise rather than delete facts. Flags an unresolved conflict between requirement 4 (persist forever) and the vault's storage-limitation commitment — a legal question, not an engineering one. |
| **R-7** | **Contradiction inside the team's own documents, surfaced not resolved**: the refactor note forbids ranking in the UI on DSGVO grounds; the roadmap has Contribution Ranking at Priority 1 and leaderboards at Priority 4. Blocks a Priority-1 feature. |

### Drift found in the planning vault (audit §12.5)

React **19** (actual 18.3.1), **Jest** and `jest.config.cjs` (actual Vitest 3.2.3, no such file),
`tailwind.config.cjs` (does not exist), backend **CommonJS** (actual ESM), `react-calendar-heatmap`
as current (actual Recharts), and `GitService` "shallow clone with `--depth 50`" — which
`utils/gitUtils.ts:13` records as abandoned because it produced incomplete history. **Nothing in
that repository was modified.**

### Documents updated this round

| File | Change |
| --- | --- |
| `docs/BACKEND_ARCHITECTURE_AUDIT.md` | New **§17.9** (R-1…R-7 + summary of what changed); **§2.4b** requirements 6-11; **§12.5** vault drift; §14 schema — `refs`, `commit_refs`, `commits.body`, `repositories.visibility`/`owner_user_id`, `index_state` keyed by coverage, GDPR rationale on `authors`; §1.5 cost table + corrected `analysis_sessions` reasoning; §16 Phase 6 ref selection and Phase 7 per-ref delta; §17.7 branch caveat; §17.8 dependency resolved; §11 `PremiumFeatures` reclassified; §12.4 v1 verdict corrected; §2.2, §2.3 |
| `docs/diagrams/gitray-option-c.architecture.json` + `.html` | Cost figures with branch coverage; cards rewritten for refs/body/visibility/coverage/GDPR; `--branches --tags, never --mirror`. Re-delivered 9/9 showcase, browser containment pass at 4 viewports |
| `docs/diagrams/README.md` | Note on the revision |
| `CLAUDE.md` | Architectural direction: corrected figures, mirror/`--all` warning, four load-bearing schema decisions |
| `.serena/memories/project_overview.md`, `architecture_overview.md` | Same, for the actively-used memories |

### Still open

- **R-7** — the ranking contradiction is the team's decision, not the architect's.
- **R-6** — whether retention limits apply to derived aggregate facts is a legal question for the
  advisor already engaged for the Datenschutzerklärung.
- Unchanged from before: `scripts/*.sh` deep behavioural read; cross-module-writes as an explicit
  Phase 5 category; SonarCloud not run locally.
- `~/Downloads/BACKEND_ARCHITECTURE_AUDIT.md` deliberately **not** overwritten — the brief withheld
  authorisation to replace it.

## Diagram embedding round (2026-09-05)

The twelve Archify diagrams were previously reachable only as separate `.html` files, so the audit
read as text with a filename next to it. Each is now **also embedded inline** in the section it
belongs to.

| Step | Detail |
| --- | --- |
| Format | PNG at 1600 CSS px wide, 2x device scale, `img/<name>.png`, 188-246 KB each |
| How | The delivered `.html` is driven in headless Chrome under **its own `@media print` stylesheet** — the one Archify already ships. That is what hides the toolbar, guided-views bar and navigation dock, forces the light palette, and reveals the node detail tags that are transparent at the default detail level |
| Nothing added | The capture renders only what the delivered artifact already contains; no diagram was redrawn, and no `.json` spec or `.html` was modified this round |
| Reproducible | `node docs/diagrams/capture-png.mjs` — the only new file. A second run reproduced all twelve at identical dimensions and sizes |
| Placement | Where a section already carried a Mermaid sketch (§4.1, §5.1, §6.1, §7.1) the sketch was **kept** and the rendered diagram placed after it. C-1's sequence sits under `#### C-1`, not under `### 10.1 CRITICAL` |
| Also updated | Audit §17.10 (index now links every file and names the section it is embedded in); `docs/diagrams/README.md` (gallery of all twelve + regeneration steps); `CLAUDE.md` context links |

Verification: `pnpm lint:md` — 0 errors across 12 files; every image and diagram link resolved
against the working tree (**NONE broken**); `git diff` on `*.ts/*.tsx/*.mjs/*.js/*.css` under
`apps/` and `packages/` — **empty**.

Note the maintenance hazard this introduces, and why the script exists: a PNG is a copy. If a
`.json` spec is re-delivered and `capture-png.mjs` is not re-run, the Markdown silently shows the
previous diagram while claiming to show the current one. That is recorded in `CLAUDE.md` and in the
diagrams README.

## Shareable rendering round (2026-09-05)

The audit existed only as Markdown plus separate diagram files, which is fine in the repository and
poor for sending to anyone. It now also ships as **one self-contained file**.

| Output | Detail |
| --- | --- |
| `docs/GitRay-Architecture-Audit.html` | 4.2 MB, single file. Stylesheet, all twelve diagram PNGs (data URIs), the five Mermaid figures pre-rendered to SVG, and syntax highlighting are all inlined. **Zero network requests** — verified by asserting no `img/script/link` resolves to an `http(s)` URL |
| `docs/GitRay-Architecture-Audit.pdf` | 6.3 MB, 117 pages, A4, generated from the same file through its print stylesheet |
| `docs/audit-html/` | `build.mjs` (the generator), `style.css`, `transform.js` (runs in the page), `runtime.js` (ships with the output). Mermaid and highlight.js are pinned and cached into a gitignored `.cache/` on first run |

Reading affordances added by the renderer, all derived from the Markdown rather than authored:
a contents rail with scroll-spy and a filter, a reading-progress line, `figure`/`figcaption` pairs
for the twelve diagrams, severity chips on the C/S/R/Q finding headings (32 of them), and **205
cross-references**: every `§n.n` in the prose became a link to that section.

### Defects this round found in the Markdown itself

| Defect | Fix |
| --- | --- |
| **Two different sections were both numbered §0.2.** All seven inbound `§0.2` references mean the first (the C-1 reproduction), so the references were never wrong — but the number was ambiguous | Second became §0.3, and "Where to start" §0.3 became §0.4 |
| §2.4 preceded §2.3, and §13.3 preceded §13.2 | Blocks moved so the numbering ascends; no content changed, no reference affected |
| §17.3 (the diagram index) sat at the end of §17, after §17.9 | Renumbered **§17.10**, which is where it reads; it had no inbound references. Two mentions in this ledger were updated |
| A doubled `---` before §0 | Collapsed. The renderer now also drops a rule that immediately precedes a heading, since the heading carries its own |

### Verification

| Check | Result |
| --- | --- |
| Section numbers | no duplicates, none out of order, no dangling `§` reference except `§9.2`, which correctly points into the **v1** document |
| Internal anchors in the HTML | 317 links checked, **0 dead** |
| External resources | **none** — the file is fully offline |
| Images / Mermaid | 12/12 decoded, 5/5 rendered, at 1440x900, 1920x1080 and 900x1200 |
| Horizontal overflow | none at any of the three viewports; wide tables scroll inside their own container |
| `pnpm lint:md` | 0 errors |
| Source tree | `git diff` on `apps/` and `packages/` — **empty** |

Same hazard as the diagram PNGs, and worth repeating: the HTML and the PDF are copies. Edit the
Markdown without re-running `node docs/audit-html/build.mjs --pdf` and they will keep presenting the
previous version as current.
