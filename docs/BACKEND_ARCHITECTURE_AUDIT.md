# GitRay Backend — Architecture Audit & Refactoring Strategy

**Scope:** repository-wide audit of `apps/backend`, its Git-processing, caching and API layers, and a
validation of the proposal in *GitRay Backend Refactor – Analysis Sessions, Indexing & Postgres-Persistenz*.

**Method:** static reconstruction of execution paths from source (no dependencies were installed, so the
test suite and build were not executed), plus targeted local Git experiments to verify clone semantics.

**Evidence classification used throughout:**

| Tag | Meaning |
| --- | --- |
| **[O]** Observed | Directly verified in this repository (file/line cited) |
| **[D]** Documented | Stated in the supplied design documents |
| **[I]** Inferred | Reasoned conclusion from observed evidence; not directly measured |
| **[R]** Recommended | Proposed future design |

---

## 1. Executive Summary

GitRay today is a **stateless, clone-per-request analytics service with a very large cache layer bolted on
top**. There is no persistent knowledge of any repository between requests; every analytic is re-derived
from `git log` and the *outputs* are cached. That is the root architectural problem, and the refactor
document identifies it correctly.

However, the audit found that **the biggest wins are not in the direction the document proposes first**.
Four findings dominate:

1. **A correctness bug in the lock layer silently swaps results between concurrent requests.**
   `withKeyLock` coalesces on the lock key and returns another operation's promise, so a churn request can
   receive a commit array, and a heatmap for author *A* can receive the heatmap for author *B*
   (`apps/backend/src/utils/lockManager.ts:295`). This is already visible in the codebase as defensive
   workarounds (`apps/backend/src/routes/repositoryRoutes.ts:294`, the `isValidHeatmap` guard). **[O]**
   No amount of persistence fixes this; it must be fixed first.

2. **One "Analyze" clones the same repository three times.** The coordinator clone, the summary service's
   own sparse clone, and the file-analysis service's own shallow clone are three independent code paths
   with three temp directories (`repositoryCoordinator.performClone`, `repositorySummaryService.performSparseClone:158`,
   `fileAnalysisService.getFileTreeSparse:1021`). **[O]** Deduplicating clones is a larger, cheaper win
   than adding PostgreSQL.

3. **"Streaming" does not bound memory and is quadratic.** `getCommitsStream` pages with
   `git log --skip=N -n B` (`gitService.ts:309`), which re-walks the history on every batch — O(N²/B)
   commit traversals — and `executeStreamingCommits` then accumulates every batch into one array
   (`gitService.ts:632`). The streaming path is strictly worse than the non-streaming path it replaces
   above 50 000 commits. **[O]**

4. **Several "lifetime" numbers are not lifetime, and the proposal inherits the misconception.** Churn
   defaults to the last 365 days (`gitService.ts:1293`), the heatmap always buckets a 365-day window
   (`gitService.ts:1546`), and churn carries no additions/deletions at all (`--name-only`, `gitService.ts:1045`)
   even though the proposed `file_churn` schema has `additions`/`deletions` columns. **[O]** The document's
   premise that `/summary` "reads all commits" is also inaccurate — it uses `rev-list --count` and
   `shortlog -s -n` on a *separate* clone (`repositorySummaryService.ts:238,252`). The expensive part of
   `/summary` is the redundant clone, not a commit scan. **[O]**

**Recommended direction.** Adopt persistence, but persist **normalized per-commit facts plus a small set of
materialized rollups**, not the aggregate-only index the document proposes. Drive it with a
**PostgreSQL-backed job queue**, key everything to a **generation-stamped index state per (repo, branch)**
rather than to `analysis_runs`, and **delete the three-tier cache entirely** once reads are served from the
database. Do *not* introduce an `analysis_sessions` table — the concept has no responsibility that
"index state + job state" does not already cover.

The ordering matters: **P0 correctness fixes → P1 single clone path + streaming rewrite → P2 Postgres facts
+ job queue → P3 rollups → P4 incremental → P5 delete the cache layer.** Phases P0 and P1 alone should
produce most of the perceived latency improvement, and they are prerequisites for trusting any benchmark
of P2+.

---

## 2. Current Architecture

### 2.1 Repository map

```
apps/
  frontend/        React 19 + Vite. Single API client (src/services/api.ts, 423 lines).
  backend/         Express 5. 21.9k LOC of TypeScript in src/.
packages/
  shared-types/    Domain types + constants (571 lines).
scripts/           Shell helpers (start, health, ad-hoc API/SSRF test scripts).
```

Backend module inventory, by size — the size distribution is itself a finding:

| Module | LOC | Responsibility |
| --- | ---: | --- |
| `services/fileAnalysisService.ts` | 3498 | File-type distribution; own clones; own circuit breakers; own cache |
| `services/repositoryCache.ts` | 3100 | Three-tier cache + "transactions" + rollback machinery |
| `services/metrics.ts` | 2003 | 76 Prometheus metrics |
| `utils/hybridLruCache.ts` | 1634 | memory → disk → Redis LRU with async serialization workers |
| `services/gitService.ts` | 1596 | All Git reads: commits, contributors, churn, aggregation, clone |
| `routes/commitRoutes.ts` | 1210 | `/api/commits/*` — partially duplicates `/api/repositories/*` |
| `utils/memoryPressureManager.ts` | 865 | Circuit breaker + throttling on RSS |
| `services/cache.ts` | 851 | Redis wrapper with in-memory fallback |
| `config.ts` | 834 | Config + validation (≈120 env vars) |
| `services/repositoryCoordinator.ts` | 826 | Shared clone handles + refcounting + operation coalescing |
| `utils/withTempRepository.ts` | 606 | Coordinated + "legacy" wrappers around the coordinator |
| `utils/lockManager.ts` | 472 | File-system advisory locks + in-process coalescing |
| `services/repositorySummaryService.ts` | 441 | `/summary` — **its own clone path** |
| `routes/repositoryRoutes.ts` | 332 | `/api/repositories/*` — the endpoints the frontend actually uses |

**[O] Absent from the repository entirely:** any database, migrations, ORM/query builder, background job
system, `docker-compose.yml`, `Dockerfile`, and the `docs/ARCHITECTURE.md` / `docs/API.md` /
`docs/TESTING.md` referenced by `CLAUDE.md`. The refactor document's Phase-1 step "integrate a Postgres
container into docker-compose" has no docker-compose to integrate into. **[O]**

### 2.2 Entry points and mounting

`apps/backend/src/index.ts:201-204`:

```
/api                    → routes/index.ts   (hello world)
/                       → healthRoutes
/api/repositories       → repositoryRoutes  ← the frontend's real surface
/api/commits            → commitRoutes      ← largely duplicate + admin + streaming
/metrics                → admin-token gated
/health/coordination    → inline handler in index.ts
```

`/api/commits` re-implements `GET /` (commits) and `GET /heatmap` with a different response envelope and
different header logic than `/api/repositories`. **[O]** The frontend calls only
`/api/commits/file-analysis` from that router (`apps/frontend/src/services/api.ts:154`); the duplicated
commit and heatmap endpoints have no external consumer. **[O]**

### 2.3 Dependency graph (analytics path)

```
route handler
  └── repositoryCache.getCached*            (3-tier cache, file locks)
        ├── repositoryCoordinator.withSharedRepository   (shared clone, refcount)
        │     └── gitService.<op>(handle.localPath)      (simple-git subprocesses)
        └── HybridLRUCache                               (memory → disk → Redis)

/summary  → repositoryCache.getOrGenerateSummary
              └── repositorySummaryService  → **its own clone**  → own Redis key
/file-analysis → fileAnalysisService.analyzeRepositoryOptimized → **its own clone**
```

---

## 3. Current Request / Data Flow

### 3.1 The actual "Analyze" sequence

`apps/frontend/src/App.tsx:61` fires **one** call, `getRepositoryFullData(url, 'day')` →
`GET /api/repositories/full-data?page=1&limit=100`. When `DashboardPage` mounts it fires **three more, in
parallel** (`DashboardPage.tsx:197,208,217`): `/summary`, `/api/commits/file-analysis`, `/churn`. **[O]**

So a cold analyze is:

| # | Request | Clone | Git work |
| --- | --- | --- | --- |
| 1 | `/full-data` | coordinator clone (full history, `--filter=blob:none`, working tree checked out) | `rev-list --count`, then `git log` over **all** commits |
| 2 | `/summary` | **second clone** (`repositorySummaryService.performSparseClone`) | `rev-list --count`, `rev-list --max-parents=0`, `log -1`, `shortlog -s -n` |
| 3 | `/file-analysis` | **third clone** (`--depth=1 --filter=blob:none`) | `ls-tree -r -l HEAD` |
| 4 | `/churn` | reuses coordinator clone | `git log --name-only` over last 365 days |

All four run concurrently against the same `repoUrl`, which is precisely the condition that triggers the
lock-coalescing bug (§4, Critical-1). **[I from O]**

### 3.2 `/full-data` in detail (the first-paint path)

`repositoryRoutes.ts:253-330` → `getCachedCommits(repoUrl, {skip:0, limit:100})` then
`getCachedAggregatedData(repoUrl, filters)`, deliberately sequential because parallel execution corrupted
results (`repositoryRoutes.ts:294`). **[O]**

`getCachedCommits` → `RepositoryCacheManager.getOrParseCommits` (`repositoryCache.ts:1018`):

1. Acquire ordered locks `[cache-filtered:<url>, cache-operation:<url>]` — file locks in
   `os.tmpdir()/gitray-locks`, 120 s timeout.
2. `hasSpecificFilters()` returns **true** because `skip`/`limit` are set (`repositoryCache.ts:2227`), so
   the request is routed to the *filtered* tier.
3. Filtered miss → `getOrParseCommitsUnlocked` → raw tier miss → `withSharedRepository` → clone →
   `gitService.getCommits(localPath)` with **no pagination arguments**, i.e. **the entire history**.
4. The full `Commit[]` is stored in the raw tier, then `applyFilters` slices `[0..100]`
   (`repositoryCache.ts:2348`), and the 100-item slice is stored in the filtered tier.

**Consequence [O+I]:** asking for the first 100 commits of a 1 M-commit repository materialises 1 M commit
objects in the Node heap, serialises them into the hybrid cache, and returns 100. Pagination exists at the
API but not in the data path.

`getCachedAggregatedData` then calls `getOrParseFilteredCommitsUnlocked` (full history again, from cache
this time) and `aggregateCommitsByTime`, which **discards everything outside a 365-day window**
(`gitService.ts:1546`) before bucketing. **[O]**

### 3.3 Cost table per endpoint

| Endpoint | Source | Full history? | File/diff data? | Where cached | Real cost driver |
| --- | --- | --- | --- | --- | --- |
| `/full-data` | `git log` all + in-memory aggregate | yes | no | raw + filtered + aggregated tiers | full history parse, then 99.99 % discarded |
| `/commits` | same as above | yes | no | raw + filtered | same |
| `/heatmap` | filtered commits + `aggregateCommitsByTime` | yes (then windowed to 365 d) | no | aggregated tier | full history parse for a 1-year view |
| `/contributors` | `git log --format=%aN` (`gitService.ts:959`) | yes | no | aggregated tier | one full walk per filter combination |
| `/churn` | `git log --name-only` since 365 d (`gitService.ts:1045,1293`) | no (1 y default) | file **names** only, **no line counts** | aggregated tier | per-commit tree diff — the most expensive Git op in the system |
| `/summary` | `rev-list --count`, `shortlog` on own clone | metadata only | no | Redis 24 h **and** aggregated tier | the redundant clone |
| `/file-analysis` | `ls-tree -r -l HEAD` on own clone | no (HEAD only) | file sizes | own file-tree cache + circuit breaker | the redundant clone |

**Note the asymmetry the refactor document asks about:** commit-metadata processing (`git log --pretty`)
is roughly linear and cheap per commit; per-commit *file* processing (`--name-only`, `--numstat`) requires
a tree diff per commit and is the dominant cost by a wide margin at any repository size. **[I]** Churn is
therefore the analytic that determines the indexing budget, not the commit count.

---

## 4. Major Findings

### CRITICAL

#### C-1 — `withKeyLock` returns another request's result

**Evidence [O]** `apps/backend/src/utils/lockManager.ts:289-330`:

```ts
async withKeyLock<T>(key, fn, timeout) {
  const existing = this.inflight.get(key) as Promise<T> | undefined;
  if (existing) { return existing; }          // ← fn is never called
  const promise = (async () => { handle = await this.acquire(key); return await fn(); })();
  this.inflight.set(key, promise);
```

The coalescing key is the **lock name**, not the operation. `withOrderedLocks` funnels *different*
operations through the same first lock (`repositoryCache.ts:386-421`):

| Operation | Sorted lock chain |
| --- | --- |
| commits | `cache-filtered:U` → `cache-operation:U` |
| heatmap | `cache-aggregated:U` → `cache-filtered:U` → `cache-operation:U` |
| churn | `cache-churn:U` → `cache-filtered:U` → `cache-operation:U` |
| contributors | `cache-contributors:U` → `cache-filtered:U` → `cache-operation:U` |

Any two of these, concurrent on the same repository URL, collide on `cache-filtered:U`. The second caller
receives the first caller's promise and therefore the first caller's **payload**.

**Impact.** Two distinct classes of failure:

* *Type confusion* — `/churn` receives `Commit[]`, the route dereferences `churnData.files.length`
  (`repositoryRoutes.ts:219`) and 500s. The existing comment "cache corruption where commits end up in
  heatmapData" (`repositoryRoutes.ts:294`) and the `isValidHeatmap` guard are symptoms of exactly this.
* *Silent wrong data* — lock keys contain only `repoUrl`, **not the filters**. Two concurrent heatmap
  requests for the same repo with different `author=` values collide, and the second user receives the
  first user's filtered result with HTTP 200. This is a cross-request data-correctness defect. **[I from O]**

**Recommendation.** Remove coalescing from the lock primitive. A lock is mutual exclusion; deduplication is
a separate concern that must key on the *full* operation identity (the cache key), not the lock name. Where
single-flight is genuinely wanted, implement it in `RepositoryCacheManager` keyed by the generated cache
key. Add a regression test that runs two different operations on one repo URL concurrently and asserts both
return their own shape.

#### C-2 — Streaming is quadratic and does not bound memory

**Evidence [O]** `gitService.ts:300-339` builds `git log --skip=<n> -n <batch>` per batch;
`gitService.ts:628-657` (`executeStreamingCommits`) does `allCommits.push(...batch)` for every batch and
returns one array.

**Impact [I].** `git log --skip=N` must walk N commits before emitting anything, so total traversal is
Σ(skip) ≈ N²/(2B). At N = 1 000 000 and B = 1 000 that is ~5×10¹¹ commit visits across 1 000 subprocesses,
versus 10⁶ for a single `git log`. The path is only entered above `STREAMING_COMMIT_THRESHOLD` = 50 000
(`config.ts:147`), i.e. it activates **exactly on the repositories it makes worst**. And because the caller
re-accumulates, the memory-pressure logic, batch sizing and resume state buy nothing at the pipeline level.

**Recommendation.** Delete `getCommitsStream`/`executeStreamingCommits` and the `/api/commits/stream`
endpoint. Replace with a single long-lived `git log` child process consumed line-by-line, feeding an
aggregator that never retains the commit list (§9).

#### C-3 — Redis keys are derived from ephemeral temp paths

**Evidence [O]** `gitService.ts:256` `commits_batch:${localRepoPath}:${skip}:${size}` and
`gitService.ts:380,431,791,815` `stream_resume:${localRepoPath}`, where `localRepoPath` is an
`mkdtemp` directory that changes on every clone (`gitService.ts:1401`).

**Impact.** The batch cache can never hit across clones (its stated purpose), the keys are written with a
1-hour TTL from every streaming run, and they accumulate one key set per temp directory per run — an
unbounded key-space in the shared Redis DB. `/api/commits/resume/:repoPath` additionally exposes a
user-supplied path directly into a Redis key (`commitRoutes.ts:723`). **[O]**

**Recommendation.** Remove both key families with the streaming rewrite. Any future cache key must be
derived from `(repoId, headSha, …)`, never from a filesystem path.

#### C-4 — Cached repositories are never refreshed

**Evidence [O]** No `git fetch`/`pull` exists anywhere after the initial clone
(`repositoryCoordinator.performClone:611` is the only clone; `isHandleValid:674` only checks directory
existence and age since **`lastAccessed`**, which is bumped on every access at `incrementReference:375`).

**Impact.** A repository that is polled regularly never expires and never updates: GitRay serves an
increasingly stale snapshot indefinitely, while reporting `X-Repository-Cached: true`. There is no
user-visible indication of the snapshot's age. This is the correctness gap that makes persistence
worthwhile — but it also means today's numbers are already silently stale, which will confound any
before/after benchmark. **[I from O]**

### HIGH

#### H-1 — Three independent clone paths per analyze

**Evidence [O]** `repositoryCoordinator.performClone` → `gitService.cloneRepository` → `shallowClone`
(`utils/gitUtils.ts:16`); `repositorySummaryService.performSparseClone` (`:158`);
`fileAnalysisService.getFileTreeSparse` (`:1021`) and `performShallowClone` (`:1931`). Each creates its own
`mkdtemp` directory. `repositorySummaryService` calls `coordinatedOperation` (`:47`) which only *de-duplicates
concurrent identical operation types* — it does **not** reuse the coordinator's clone.

**Impact.** 3× network, 3× disk, 3× clone latency on the cold path, and three unrelated cleanup regimes.

**Recommendation.** One clone path owned by the coordinator; all services receive a `localPath` from it.

#### H-2 — The clone downloads every blob at HEAD despite `--filter=blob:none`

**Evidence [O]** `gitUtils.ts:25-39` does `init` + `config core.sparseCheckout true` +
`fetch --filter=blob:none` + `checkout FETCH_HEAD`. Verified locally with git 2.43.0: with
`core.sparseCheckout=true` but **no** `.git/info/sparse-checkout` patterns file, git checks out the full
tree (test in this session produced `a.txt` and `d/b.txt` in the working tree, `git ls-files` listing both).

**Impact [I].** On a blobless partial clone, checking out the working tree forces git to lazily fetch every
blob reachable from HEAD. The `bandwidthSaved: '95-99% vs full clone'` label
(`repositorySummaryService.ts:26`) is therefore wrong for the checkout step — historical blobs are skipped,
HEAD blobs are not. Every analytic GitRay computes from this clone (`log`, `rev-list`, `shortlog`,
`log --name-only`) needs **no working tree at all**.

**Recommendation.** `git clone --bare --filter=blob:none --no-tags <url>` (or `init --bare` + fetch). This
removes the HEAD blob download *and* the working-tree write. Caveat to verify: `ls-tree -r -l` reports blob
sizes and will lazily fetch missing blobs — if `FileTypeDistribution` needs byte sizes, either accept one
targeted fetch, use `--filter=blob:limit=…`, or derive size buckets differently. **[I — benchmark this]**

#### H-3 — `git log` parsing is lossy and ambiguous

**Evidence [O]** `GIT_SERVICE.LOG_FORMAT = '%H|%cI|%an|%ae|%s'` (`shared-types/src/index.ts:105`), parsed by
splitting on `|` (`gitService.ts:757-765`, `:323-338`). Commits are dropped when any field is falsy —
including `!message` (`gitService.ts:760`), i.e. **every commit with an empty subject is silently discarded**.
An author name containing `|` shifts all subsequent fields.

**Impact.** `commits.length` from `getCommits` can disagree with `rev-list --count` from
`getCommitCount`/`/summary` for the same repository — two different "total commits" reachable from the same
dashboard. Also note `%cI` (committer date) is used for the heatmap while `/summary` uses `%aI` (author
date) for first-commit (`repositorySummaryService.ts:202`); after a rebase these differ materially. **[O]**

**Recommendation.** Use unambiguous separators (`%x1e` record, `%x1f` field), capture both `%aI` and `%cI`,
never drop a record for an empty subject, and decide explicitly which timestamp each analytic uses.

#### H-4 — Repository refcounting is not actually atomic; disk can leak

**Evidence [O]** `withSharedRepository`'s `finally` calls `repositoryCoordinator.releaseRepository(repoUrl)`
**without `await`** (`repositoryCoordinator.ts:810`). Acquire takes lock `repo-access:<url>`
(`:255`), release takes a *different* lock `repo-release:<url>` (`:439`), so the two are not mutually
exclusive despite the "atomic reference counting" comments. `performCleanup` collects expired handles but
then only deletes them if `refCount === 0` (`:769`), so a handle whose refcount never returns to zero is
re-collected and re-skipped forever.

**Impact [I].** Under concurrency or on a rejected promise path, `refCount` can drift above zero; that
repository's clone is then pinned on disk permanently. `updateDiskUsageMetrics` is a hard-coded
`handles × 100 MB` estimate (`:792`), so the disk metric cannot reveal it.

#### H-5 — The three-tier cache stores the wrong things

Raw tier holds `Commit[]` for the **entire history** (`repositoryCache.ts:224,1118`), memory budget 60 % of
`CACHE_MEMORY_LIMIT_GB` (default 1 GB → 600 MB). Filtered tier holds one array **per filter combination**
(author × authors × fromDate × toDate × skip × limit) — the key is `hashObject(options)`
(`repositoryCache.ts:2177`), so a paginating client generates one cache entry per page, each a copy of the
sliced commits.

**Impact [I].** Unbounded key cardinality on a fixed memory budget → the raw entry (the only genuinely
reusable one) is the most likely eviction victim, which restarts the full clone+log cycle. Cache hit ratio
is also used as a *health signal* (`index.ts:231` returns 503 when `hitRatios.overall <= 0.1`), so a cold
server reports itself unhealthy.

#### H-6 — Per-repository serialisation with a 120 s lock timeout

**Evidence [O]** All cache locks are keyed on `repoUrl` only. `getOrParseCommits` holds them across the
clone **and** the full `git log`. `lockConfig.defaultTimeoutMs` = 120 000 (`config.ts:124`).

**Impact [I].** For a large repository, the first request holds the locks for minutes; every other request
for that repository — including the three the dashboard fires immediately — waits, then throws
`Lock timeout for …`. There is no admission control, no queue-depth limit, and no per-repo concurrency
cap other than this. The advisory locks live in `os.tmpdir()`, so they are per-host, not per-cluster.

### MEDIUM

* **M-1 — `analysis`-shaped dead code.** `gitService.getCommitsWithStats` (`:885`, the only function that
  parses `--numstat`) has **no callers**. `RepositoryCacheManager.getOrParseFilteredCommits` (`:1177`) and
  `invalidateCachedRepository` (`:3035`) have no production callers. `repositoryCoordinator.cleanupHandle`
  (`:702`) is unreachable. `shallowClone`'s `depth` parameter is accepted and never used (`gitUtils.ts:19`).
  `config.git.cloneDepth` is validated (`config.ts:493`) but has no effect. **[O]**
* **M-2 — Duplicate API surface.** `/api/commits/` and `/api/commits/heatmap` duplicate
  `/api/repositories/commits` and `/heatmap` with a different envelope; no frontend consumer. **[O]**
* **M-3 — Summary is cached twice** — Redis 24 h (`repositorySummaryService.ts:25,426`) and the aggregated
  tier at `repositoryInfoTTL` 2 h (`repositoryCache.ts:1832`) — with independent expiry, so the two layers
  can disagree. **[O]**
* **M-4 — The "transactional cache" is ceremony without a guarantee.** ~900 lines of transaction/rollback/
  verification/retry code (`repositoryCache.ts:432-970`) protect single-key writes to a non-transactional
  LRU. The rollback path itself is instrumented with five dedicated Prometheus metrics. There is no
  multi-key invariant it defends. **[O/I]**
* **M-5 — Client-side URL canonicalisation.** The frontend appends `.git` before every call
  (`api.ts:37,102,147,193,244,295,365`). The server's cache keys, lock keys and coordinator keys are the raw
  string, so `…/repo` and `…/repo.git` are two different repositories to the backend. **[O]**
* **M-6 — Batch errors are swallowed.** On a batch failure the stream `continue`s past
  `currentSkip += currentBatchSize` (`gitService.ts:562`), silently dropping a window of commits from the
  result with no error surfaced. **[O]**
* **M-7 — `console.error` in route handlers** (`commitRoutes.ts:222,345`) contradicts the logging rule in
  `CLAUDE.md`. **[O]**

### LOW

* Health endpoint conflates "cold" with "unhealthy" (§H-5). **[O]**
* `getRepositoryInfo` is called *after* the data fetch on `/api/commits/` purely to populate response
  headers (`commitRoutes.ts:104`), adding a coordinator round-trip per request. **[O]**
* Prometheus surface is very large (76 metric families) but contains no metric for clone duration as a
  distinct stage, queue wait, or index progress (§14). **[O]**
* `docs/` referenced by `CLAUDE.md` does not exist. **[O]**

---

## 5. Performance & Scalability Analysis

Cost is dominated by four stages. Approximate complexity per cold request, N = commits, F = files touched,
P = files at HEAD:

| Stage | Complexity | Notes |
| --- | --- | --- |
| Clone (blobless + checkout) | O(N) refs/objects + **O(P) blob bytes** | H-2: the checkout defeats the filter |
| Commit metadata walk | O(N), one subprocess | cheap per commit; ~µs-scale each |
| Commit **file** walk (`--name-only`/`--numstat`) | O(N + Σ F) with a tree diff per commit | **dominant cost**; 1–2 orders of magnitude above metadata |
| In-process aggregation | O(N) with full array retention | O(N) heap, then discarded |
| "Streaming" path | **O(N²/B)** | C-2, above 50 k commits only |

**Scale behaviour [I]** (qualitative — no measurements were taken; see §14/§20 for the benchmark plan):

* **~10 k commits.** Everything works. Clone dominates. The full-history-then-slice waste is invisible.
* **~100 k commits.** Full `Commit[]` in heap is order-of-magnitude 100 MB before cache serialisation; the
  filtered tier multiplies that per page. Churn's tree diffs push `/churn` into tens of seconds. Lock
  contention starts producing 120 s timeouts on the concurrent dashboard fan-out.
* **~1 M commits.** The streaming threshold trips, the quadratic path engages, and the request either
  exhausts the lock timeout or the memory circuit breaker. The architecture does not degrade — it fails.

**Where the time actually goes, ranked [I]:** ① redundant clones (×3), ② the checkout blob fetch, ③ churn
tree diffs, ④ full-history parse for a 100-row page, ⑤ quadratic streaming, ⑥ cache serialisation of
million-element arrays.

**Concurrency behaviour [O/I]:**

| Scenario | Today |
| --- | --- |
| Two users, same repo | Serialised on the same file lock; and subject to C-1 result swapping |
| Two users, different large repos | Independent; bounded only by `GIT_MAX_CONCURRENT_PROCESSES=6` and the RSS circuit breaker |
| Indexing overlapping reads | N/A — no indexing exists |
| Process crash / restart | All coordinator state is in-process Maps; clones leak in `os.tmpdir()`; lock files persist until the 10-minute staleness sweep |
| Memory pressure | `memoryPressureMiddleware` 503s low-priority requests; `executeWithMemoryProtection` opens a circuit breaker |

Missing outright: request deduplication keyed on the real operation, backpressure, admission control, per-repo
job concurrency limits, cancellation/abort signals into Git subprocesses, per-operation timeouts (only the
lock has one), and idempotency. **[O]**

---

## 6. Review of the Proposed Backend Refactor

| # | Proposal | Verdict | Reasoning |
| --- | --- | --- | --- |
| 1 | Decouple the full scan from the request path into a background job | **Accept** | Correct and necessary. It is the single right idea in the document. |
| 2 | Persist an index in PostgreSQL | **Accept** | Right store: relational, transactional, read-heavy, range + prefix queries, one operational dependency they can also use for the job queue. |
| 3 | **Analysis Sessions** as a first-class concept/table | **Reject** | No responsibility that `(repo, index_state, job)` does not already own. It adds a lifecycle, a state machine and a table with no consumer. What the UI needs is "is repo X indexed, and through which commit" — that is index state. Keep a *request-scoped* correlation id for telemetry; do not persist a session entity. Revisit only if per-user analysis history becomes a product feature. |
| 4 | `analysis_runs` with `UNIQUE(repo_id, coverage)` holding `last_indexed_commit` | **Reject** | Self-contradictory: a *run* is historical, but the unique constraint forces exactly one row per coverage, so run history is impossible and the row is really mutable current state. Split into `repo_index_state` (current, one row per repo+ref+coverage) and `index_jobs` (append-only attempts). |
| 5 | Aggregate-only index (totals, contributors, daily counts, file churn) | **Accept with changes → Hybrid** | Aggregate-only cannot serve the API that already exists. `daily_commit_stats(repo_id, date, commits)` has **no author dimension**, yet `/heatmap?author=…` and `/contributors?fromDate=…` are live endpoints (`repositoryRoutes.ts:103,142`) and the frontend sends those filters (`api.ts:44-55`). Aggregate-only also forces a full re-scan for every future feature. Persist per-commit facts; materialise the hot, unfiltered rollups. |
| 6 | Incremental updates via `lastIndexedCommit..HEAD` | **Accept with changes** | Correct **only** when `lastIndexedCommit` is an ancestor of the new HEAD. Must be guarded by an explicit ancestry check and a generation-based rebuild otherwise (§9). |
| 7 | Incrementally mutating lifetime aggregates (`totalCommits++`) | **Reject** | Non-idempotent. A retried or partially-applied job permanently corrupts the counter with no way to detect drift. Derive totals from the facts, or make writes idempotent on `(repo_id, sha)`. |
| 8 | Widget-specific endpoints, lazy loading | **Accept** | Matches how the dashboard already fetches (`DashboardPage.tsx:194-227`). Add explicit coverage/staleness metadata to every response. |
| 9 | `/full-data` retained | **Reject — remove** | It is the reason first paint blocks on a whole-history walk. One consumer (`App.tsx:61`), trivially replaced by `/commits` + `/activity`. |
| 10 | "Existing multi-tier caching stays important" | **Reject** | Once reads are DB-backed, the raw/filtered/aggregated tiers cache data that is *already* cheaper to read from Postgres, at the cost of ~5 200 LOC and the C-1 defect class. Delete them. Keep Redis for response caching, rate limiting and (optionally) locks. |
| 11 | "Streaming stays for full scans and deltas" | **Accept with changes** | Streaming is the right *concept* for indexing; the current implementation (C-2) must be replaced, not reused. |
| 12 | Proposed SQL schema verbatim | **Accept with changes** | See §8. Key changes: drop `analysis_runs`' dual role, add author dimension to activity, intern file paths, bucket churn by month, add a snapshot/generation column, `TIMESTAMPTZ` for `first_seen/last_seen`. |
| 13 | SQLite as an interim step | **Reject** | Ships a migration you will pay for twice. Postgres in a container is not meaningfully harder than SQLite, and the job queue design (`SKIP LOCKED`) depends on it. |
| 14 | Coverage tiers (`full` / `last_12_months`) for pricing | **Accept, postpone** | The column costs nothing now; the enforcement logic should wait until the index is proven. |
| 15 | `/summary` "reads all commits today" (premise) | **Needs correction** | It does not (`repositorySummaryService.ts:238-267`). The cost is the extra clone. Fixing the premise changes the priority ordering. |
| 16 | "Lifetime churn" is computed today (premise) | **Needs correction** | Churn is 365-day-windowed and has no line counts (`gitService.ts:1045,1293`). Lifetime churn with additions/deletions is **new work**, and it is the most expensive thing in the plan. |

---

## 7. Recommended Target Architecture

### 7.1 Concepts that should exist

| Concept | Exists? | Responsibility |
| --- | --- | --- |
| **Repository** | new | Stable identity: canonical URL → `repo_id`. Host, owner, name, default branch. |
| **Snapshot / Generation** | new | The `(ref, head_sha, generation)` a set of facts is valid for. Makes invalidation a stamp-and-sweep instead of a delete cascade. |
| **Index State** | new | Per `(repo, ref)`: `indexed_sha`, `generation`, `state`, `coverage`, `updated_at`. Read by every API response to report staleness. |
| **Index Job** | new | An attempt to move index state forward. Queued, leased, retried, append-only history. |
| **Facts** | new | `commits`, `file_churn_monthly` — immutable per generation. |
| **Materialisations** | new | `repo_summary`, `daily_activity`, `contributors` — recomputable from facts. |
| **Analysis Session** | **not created** | Rejected (§6.3). |
| **Working copy** | exists | The coordinator's bare clone, now the only one. |

### 7.2 Target dataflow

```
                    ┌──────────────────────────────────────────────┐
  Frontend  ───────►│  API layer (Express)                          │
  (widgets)         │   POST /api/repos            → resolve+ensure │
       ▲            │   GET  /api/repos/:id/…      → DB reads only  │
       │            │   GET  /api/repos/:id/index-status (poll)     │
       │            └───────┬──────────────────────────────┬────────┘
       │                    │ read                         │ enqueue
       │            ┌───────▼───────────┐          ┌───────▼──────────┐
       │            │   PostgreSQL      │◄─────────┤  index_jobs      │
       │            │  repositories     │  write   │  (FOR UPDATE     │
       │            │  repo_index_state │          │   SKIP LOCKED)   │
       │            │  commits (facts)  │          └───────┬──────────┘
       │            │  file_churn_mon.  │                  │ claim
       │            │  daily_activity   │          ┌───────▼──────────┐
       │            │  contributors     │          │  Indexer worker  │
       │            │  repo_summary     │◄─────────┤  (in-process,    │
       │            └───────────────────┘  COPY    │   concurrency N) │
       │                                            └───────┬──────────┘
       │                                                    │
  ┌────┴──────────────┐                            ┌────────▼─────────┐
  │ Redis             │                            │ Repository store │
  │ • response cache  │                            │ bare blobless    │
  │ • rate limiting   │                            │ clone + fetch    │
  │ • (opt) job lease │                            │ (one path)       │
  └───────────────────┘                            └────────┬─────────┘
                                                             │ one long-lived
                                                   ┌─────────▼─────────┐
                                                   │ git log (streamed)│
                                                   └───────────────────┘
```

### 7.3 Lifecycles

**Repository:** resolve canonical URL → upsert `repositories` → return `repo_id`. Identity is
`sha256(canonical_url)`; canonicalisation moves server-side (fixes M-5).

**Clone/fetch:** `git clone --bare --filter=blob:none --no-tags` on first index. Every subsequent job
`git fetch --filter=blob:none --no-tags origin +refs/heads/<default>:refs/remotes/origin/<default>` and
reads `refs/remotes/origin/<default>` — this gives a real ref to diff against, unlike today's detached
`FETCH_HEAD`. Working copies are LRU-evicted by total disk bytes (measured, not estimated).

**Index job state machine:**

```
queued ──claim──► running ──┬──► completed        (indexed_sha = head_sha)
   ▲                        ├──► failed(retryable) ──backoff──► queued
   │                        └──► failed(permanent)
   └──lease expiry (worker crash) ── requeue
```

**Read state exposed to the UI** (derived, not stored): `absent` → `indexing` → `partial` →
`ready` → `stale` (head moved) → `failed`.

**Restart/recovery:** jobs are rows; a crashed worker's lease expires and the row returns to `queued`.
Facts are written per generation, so a half-written generation is never visible — the generation is only
promoted in `repo_index_state` in the final transaction.

---

## 8. Persistence & Data Model

Design principles: **facts are immutable and idempotent**; **aggregates are recomputable**; **nothing is
`+=`'d that cannot be recomputed**; **high-cardinality tables are bucketed, not per-event**.

```sql
CREATE TABLE repositories (
  id             BIGSERIAL PRIMARY KEY,
  url_hash       BYTEA NOT NULL UNIQUE,       -- sha256(canonical_url), server-side canonicalisation
  canonical_url  TEXT  NOT NULL,
  host           TEXT  NOT NULL,
  owner          TEXT  NOT NULL,
  name           TEXT  NOT NULL,
  default_branch TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- cardinality: thousands. update: rare.

CREATE TABLE repo_index_state (
  repo_id        BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  ref_name       TEXT   NOT NULL,             -- e.g. 'refs/heads/main'
  coverage       TEXT   NOT NULL DEFAULT 'full',
  generation     INT    NOT NULL DEFAULT 1,   -- bumped on any non-fast-forward rebuild
  indexed_sha    TEXT,                        -- commit the facts are complete through
  head_sha       TEXT,                        -- head observed at last fetch
  state          TEXT   NOT NULL,             -- 'indexing'|'ready'|'partial'|'failed'
  commit_count   BIGINT,
  indexed_at     TIMESTAMPTZ,
  PRIMARY KEY (repo_id, ref_name, coverage)
);
-- The single source of truth for "can I trust these numbers?". Read on every API response.

CREATE TABLE index_jobs (
  id            BIGSERIAL PRIMARY KEY,
  repo_id       BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  ref_name      TEXT   NOT NULL,
  kind          TEXT   NOT NULL,              -- 'full' | 'incremental'
  state         TEXT   NOT NULL,              -- 'queued'|'running'|'completed'|'failed'
  attempts      INT    NOT NULL DEFAULT 0,
  lease_until   TIMESTAMPTZ,
  worker_id     TEXT,
  error         TEXT,
  progress      JSONB,                        -- {stage, commitsProcessed, total}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_active_job ON index_jobs (repo_id, ref_name)
  WHERE state IN ('queued','running');       -- deduplication, enforced by the DB
CREATE INDEX idx_jobs_claim ON index_jobs (state, created_at) WHERE state = 'queued';
```

**Facts.**

```sql
CREATE TABLE commits (
  repo_id       BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  sha           BYTEA  NOT NULL,              -- 20 bytes, not 40 chars
  generation    INT    NOT NULL,
  author_name   TEXT   NOT NULL,
  author_email  TEXT   NOT NULL,
  authored_at   TIMESTAMPTZ NOT NULL,
  committed_at  TIMESTAMPTZ NOT NULL,
  is_merge      BOOLEAN NOT NULL,
  files_changed INT,
  insertions    INT,
  deletions     INT,
  subject       TEXT,
  PRIMARY KEY (repo_id, sha)
);
CREATE INDEX idx_commits_time   ON commits (repo_id, committed_at DESC);
CREATE INDEX idx_commits_author ON commits (repo_id, author_email, committed_at DESC);
CREATE INDEX idx_commits_gen    ON commits (repo_id, generation);
-- cardinality: N per repo (1M worst case). Insert-only, bulk COPY. Never updated in place.
```

`commits` is what makes the model future-proof: the commit list, the heatmap (filtered **and** unfiltered),
contributor first/last-seen, activity streaks, peak-hour analysis and the planned graph view are all
`GROUP BY`s over this one table. It is also idempotent — re-processing a delta re-upserts identical rows.

**Churn — the high-cardinality decision.** A per-commit-per-file table at 1 M commits × 5–15 files is
5–15 M rows *per large repository*, with write amplification across every index. Since the UI shows churn
per file over a date range at day-or-coarser granularity, bucket it:

```sql
CREATE TABLE repo_files (
  id       BIGSERIAL PRIMARY KEY,
  repo_id  BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path     TEXT   NOT NULL,
  extension TEXT,
  UNIQUE (repo_id, path)
);
CREATE INDEX idx_repo_files_prefix ON repo_files (repo_id, path text_pattern_ops); -- 'src/%' prefix scans

CREATE TABLE file_churn_monthly (
  repo_id    BIGINT NOT NULL,
  file_id    BIGINT NOT NULL REFERENCES repo_files(id) ON DELETE CASCADE,
  month      DATE   NOT NULL,                -- first day of month, UTC
  generation INT    NOT NULL,
  changes    INT    NOT NULL,
  additions  BIGINT NOT NULL,
  deletions  BIGINT NOT NULL,
  authors    INT    NOT NULL,                -- distinct authors that month
  PRIMARY KEY (repo_id, file_id, month)
);
CREATE INDEX idx_churn_month ON file_churn_monthly (repo_id, month);
```

Cardinality: `files × active months`, typically **10²–10³× smaller** than per-commit rows, while still
answering "churn in `src/` between 2024-01 and 2024-12" and "lifetime churn" (sum over all months).
Lifetime totals per file are a materialised view or a rolled-up `file_churn_total` refreshed at job end.

**Materialisations** (all recomputable, all `INSERT … ON CONFLICT DO UPDATE` with *absolute* values):

```sql
CREATE TABLE daily_activity (
  repo_id BIGINT NOT NULL, day DATE NOT NULL, generation INT NOT NULL,
  commits INT NOT NULL, authors INT NOT NULL,
  PRIMARY KEY (repo_id, day)
);

CREATE TABLE contributors (
  repo_id BIGINT NOT NULL, email_hash BYTEA NOT NULL,   -- see §13 on PII
  display_name TEXT NOT NULL, first_seen TIMESTAMPTZ, last_seen TIMESTAMPTZ,
  commit_count BIGINT NOT NULL, generation INT NOT NULL,
  PRIMARY KEY (repo_id, email_hash)
);

CREATE TABLE repo_summary (
  repo_id BIGINT PRIMARY KEY REFERENCES repositories(id) ON DELETE CASCADE,
  coverage TEXT NOT NULL, generation INT NOT NULL,
  total_commits BIGINT NOT NULL, total_contributors BIGINT NOT NULL,
  first_commit_at TIMESTAMPTZ, last_commit_at TIMESTAMPTZ,
  computed_at TIMESTAMPTZ NOT NULL
);
```

**Which analytics are materialised vs computed at query time:**

| Analytic | Strategy | Why |
| --- | --- | --- |
| Summary totals | materialised | Read on every page load; trivially small |
| Heatmap, **no author filter** | materialised (`daily_activity`) | The default view; must be instant |
| Heatmap, **with author filter** | query-time over `commits` | Unbounded filter space; index `(repo_id, author_email, committed_at)` makes it cheap |
| Contributor list | materialised | Small, read-often |
| Churn by path/range | query-time over `file_churn_monthly` | Filter space is unbounded; the table is already the rollup |
| Lifetime churn per file | materialised | The default view |
| Commit list | query-time, **keyset** pagination on `(committed_at, sha)` | Replaces `skip`, which is O(offset) in both git and SQL |
| File types at HEAD | materialised per generation | Derived from `ls-tree`, not from history |

**Write strategy.** `COPY` into an `UNLOGGED` staging table per job, then one transaction:
`INSERT … SELECT … ON CONFLICT DO NOTHING` into `commits`, upsert rollups, promote
`repo_index_state.generation`/`indexed_sha`. Indexes on `commits` stay in place for incremental jobs; for a
*full* rebuild of a very large repo, drop-and-recreate the non-primary indexes inside the job.
**Storage estimate [I]:** ~120–180 B/commit row + ~2× that in indexes → **≈0.5 GB per 1 M-commit repo**;
`file_churn_monthly` typically an order of magnitude less. Partitioning is **not** justified at this scale —
revisit only if a single repo exceeds ~50 M churn rows or total `commits` exceeds ~10⁸.

---

## 9. Indexing Strategy

### 9.1 Initial (full) index

One job, one long-lived Git process, constant memory:

```
git -C <bare> log <ref> --no-abbrev --date-order \
    --pretty=format:%x1e%H%x1f%P%x1f%aI%x1f%cI%x1f%an%x1f%ae%x1f%s \
    --numstat
```

* One subprocess for the entire history (vs today's N/B subprocesses).
* `%x1e`/`%x1f` separators cannot appear in names, e-mails or subjects → fixes H-3.
* `--numstat` yields per-file `additions<TAB>deletions<TAB>path` — the data churn needs and that
  `getCommitsWithStats` already knows how to parse but nothing calls (M-1).
* Consumed with `readline` over `stdout`; the aggregator holds **only** the in-progress rollup maps
  (`daily_activity`, `contributors`, `file_churn_monthly`) plus a bounded `COPY` buffer for `commits`.
  Peak RSS becomes a function of *distinct files × active months*, not of N.
* Progress is written to `index_jobs.progress` every K commits, so the UI can show real progress.

Merge commits produce no `--numstat` output by default, which is the correct behaviour for churn (a merge
does not "change" files). Record them in `commits` with `is_merge = true` so commit totals still match
`rev-list --count`.

### 9.2 Incremental index

```
fetch → new_head = rev-parse refs/remotes/origin/<default>
if new_head == indexed_sha:                     → no-op, touch indexed_at
if git merge-base --is-ancestor <indexed_sha> <new_head>:
        delta = rev-list <indexed_sha>..<new_head>   → process delta, same pipeline
else:                                            → NON-FAST-FORWARD → rebuild (§9.3)
```

`rev-list A..B` is exactly "reachable from B, not from A" and is **correct across merges** — the merge and
both sides of a newly-merged branch are all included. The document's `lastIndexedCommit..HEAD` is therefore
right *for this case only*.

### 9.3 When the delta is not safe — the invariant

**Invariant:** the fact set for `(repo, ref, generation)` is exactly the set of commits reachable from
`indexed_sha`. A delta may be applied **only** if `indexed_sha` is an ancestor of the new head.

| Event | Ancestry holds? | Action |
| --- | --- | --- |
| Fast-forward commits | yes | delta |
| Merge commit | yes | delta |
| Force push / rebase / amend / squash | **no** | rebuild |
| Default branch changed | n/a — different ref | new `repo_index_state` row; index separately |
| Branch deleted upstream | fetch fails / ref gone | mark `state='stale'`, keep last good generation, surface it |
| Repository URL changed | different `url_hash` | new repository |
| Repository deleted / made private | clone/fetch fails | `state='failed'`, retain last good facts, surface staleness |
| Author metadata rewritten (mailmap etc.) | usually no (shas change) | rebuild |
| Shallow/grafted clone | — | not supported; assert full history at clone time |

**Rebuild is cheap, and that is what makes this design safe.** `git rev-list <ref>` emits the complete sha
set in seconds even for 1 M commits. Diff it against the shas already stored for the repo: only *unseen*
shas need metadata + numstat parsing. Then stamp the new generation, recompute rollups from
`commits WHERE generation = <new>`, promote in one transaction, and sweep
`DELETE … WHERE generation < <new>` in the background. A force-push that rewrites the last 50 commits costs
one `rev-list` plus 50 commits of parsing — **not** a full re-scan. This is why full rebuild, rather than
partial invalidation, is the right default answer: it is always correct and almost always fast.

### 9.4 Idempotency rules

1. Never `+=` a persisted counter. `commits` inserts are `ON CONFLICT DO NOTHING`; rollups are recomputed
   from `commits`, or upserted with absolute values computed for the whole affected bucket.
2. For an incremental delta, recompute only the *touched* buckets:
   `daily_activity` for the days in the delta, `file_churn_monthly` for the (file, month) pairs in the
   delta — each recomputed from `commits`, so re-running the job is a no-op.
3. `repo_index_state.indexed_sha` advances only in the transaction that commits the facts.

---

## 10. Caching Strategy

| Layer | Today | Target |
| --- | --- | --- |
| Raw commits tier | `Commit[]` full history, 60 % of memory budget | **Delete.** Postgres is the source of truth. |
| Filtered commits tier | one array per filter combo | **Delete.** Replaced by indexed SQL. |
| Aggregated tier | heatmap/contributors/churn/summary objects | **Delete.** Replaced by rollup tables. |
| `HybridLRUCache` (memory→disk→Redis) | 1 634 LOC, serialisation worker pool | **Delete.** |
| Cache transactions/rollback | ~900 LOC in `repositoryCache.ts` | **Delete.** |
| `distributedCacheInvalidation` (Redis pub/sub) | invalidates the tiers above | **Delete** with them. |
| Redis | batch cache, resume state, summary cache | **Keep, narrowed:** HTTP response cache (short TTL, keyed `repoId:generation:endpoint:params` — self-invalidating because the generation changes), rate limiting, optional job-lease heartbeat. |
| Working-copy cache | coordinator handles | **Keep**, fixed: bare clones, measured disk LRU, awaited release, periodic fetch. |

The four-way distinction the prompt asks for, made explicit:

* **Source of truth:** the Git repository (upstream) → `commits`, `repo_files`, `file_churn_monthly` in Postgres.
* **Materialised aggregates:** `daily_activity`, `contributors`, `repo_summary`, file-types-at-HEAD.
  Derived, disposable, rebuildable from facts.
* **Ephemeral cache:** Redis response cache. Loss is a latency event, never a correctness event.
* **Request/session state:** a correlation id in the request context. Not persisted.

Because every cache key is scoped by `generation`, **cache invalidation stops being a distributed problem**:
a new generation makes old entries unreachable and they expire on their own. That single change removes the
need for the pub/sub invalidation service, the pattern-tracking map (`repositoryCache.ts:236`), and the
rollback machinery.

---

## 11. Job & Concurrency Model

**Recommendation: a PostgreSQL-backed queue, worker in-process behind a role flag.**

| Option | Verdict |
| --- | --- |
| In-process array/queue | Rejected — no crash recovery, no cross-instance dedupe |
| **Postgres `FOR UPDATE SKIP LOCKED`** | **Recommended** — transactional with the facts, dedupe via the partial unique index, lease-based crash recovery, no new dependency, and it is already the DB they are adopting |
| Redis / BullMQ | Rejected for now — a second source of truth for job state, and job completion cannot be transactional with the data write |
| Dedicated worker service | Postpone — same binary, `ROLE=worker`, split when a single instance saturates |

Claim query:

```sql
UPDATE index_jobs SET state='running', worker_id=$1, lease_until=now()+interval '5 minutes', attempts=attempts+1
WHERE id = (SELECT id FROM index_jobs WHERE state='queued' AND (lease_until IS NULL OR lease_until < now())
            ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
RETURNING *;
```

Controls, each with a concrete owner:

* **Dedupe** — `uq_active_job` partial unique index; enqueue is `ON CONFLICT DO NOTHING`.
* **Concurrency** — `INDEX_WORKER_CONCURRENCY` (default 2) and a global cap on concurrent `git` subprocesses.
* **Backpressure** — queue depth threshold → the API returns `state:'queued'` with a position rather than
  blocking; no request ever waits on a job.
* **Retries** — `attempts` with exponential backoff; permanent classification for auth/404 errors so a
  private repo is not retried forever.
* **Lease renewal** — heartbeat every 60 s; expired lease → another worker requeues.
* **Cancellation** — jobs check a cancel flag between batches and pass an `AbortSignal` to the Git child
  process (today no Git operation is cancellable — `CLAUDE.md` mandates abort signals and none exist **[O]**).
* **Timeouts** — per stage (clone, fetch, log), not one 120 s lock timeout for everything.

---

## 12. API Architecture

```
POST /api/repos                     {url}      → 200 {repoId, state, indexedThrough, headSha}
                                                  (idempotent; enqueues if absent or stale)
GET  /api/repos/:id                            → repository + summary + index state
GET  /api/repos/:id/index-status               → {state, progress:{stage, done, total}, indexedThrough}
GET  /api/repos/:id/commits?cursor=&limit=     → keyset page + nextCursor
GET  /api/repos/:id/activity?from&to&author=   → heatmap buckets
GET  /api/repos/:id/contributors               → list (no ranking)
GET  /api/repos/:id/churn?from&to&path=&limit= → file churn
GET  /api/repos/:id/file-types                 → distribution at HEAD
```

Every analytics response carries the same envelope so partial and stale data are honest rather than
indistinguishable from fresh data:

```json
{ "data": { }, "coverage": { "state": "ready", "indexedThrough": "abc123", "headSha": "abc123",
                             "scope": "full", "computedAt": "2026-…", "stale": false } }
```

**Decisions.**

* **Repo identity in the path, not a query string.** `repoId` is server-canonicalised; the client stops
  guessing `.git` suffixes (M-5). Accept the URL only at `POST /api/repos`.
* **Polling, not SSE/WebSockets.** Indexing takes seconds to minutes and the UI needs one coarse progress
  value. A 1–2 s poll of `/index-status` is a few lines of code, survives proxies and restarts, and needs no
  connection accounting. Revisit SSE only if per-widget streaming progress becomes a product requirement.
* **`/full-data`: remove.** One caller (`App.tsx:61`); replace with `/commits` + `/activity`.
* **`/api/commits/*`: remove or make internal.** Keep only `file-analysis` until it moves under
  `/api/repos/:id/file-types`. The streaming NDJSON endpoint and the resume endpoints go with C-2/C-3.
  Admin cache endpoints go with the cache layer; keep `/metrics` and health.
* **Pagination: keyset.** `?cursor=<committed_at,sha>` — O(1) in SQL and semantically stable while new
  commits arrive, unlike `page/skip`.
* **Partial results:** when `state='indexing'`, endpoints return whatever the current generation already
  holds with `stale:true` and `coverage.state='indexing'` — never a 503, never a blocking wait.

---

## 13. Reliability & Security

| Failure | Detection | Recovery | User-visible |
| --- | --- | --- | --- |
| Clone fails (network) | non-zero exit | retry w/ backoff, `attempts` capped | `state:'failed'`, retryable |
| Repo private / 404 | stderr classification | **no** retry (permanent) | actionable error |
| Fetch fails, index exists | job error | serve last good generation | `stale:true` |
| Git process hangs | per-stage timeout + `AbortSignal` | kill, requeue | progress stalls then retries |
| Malformed Git output | record-separator parse guard | fail the job, do not promote | previous generation retained |
| Disk exhaustion | pre-flight free-space check + measured LRU | evict working copies | queued jobs wait |
| Memory exhaustion | existing `memoryPressureManager` | bounded aggregator makes this rare | — |
| Redis down | connection error | degrade to no response cache | slower, correct |
| **Postgres down** | connection error | API returns 503 for analytics; jobs stop | explicit outage (new hard dependency — accepted trade-off) |
| Worker crash | lease expiry | another worker requeues | progress resumes |
| Partially written index | generation not promoted | invisible; swept later | previous generation served |
| Concurrent indexing | `uq_active_job` | second enqueue is a no-op | — |
| History rewrite | ancestry check (§9.3) | rebuild into a new generation | brief `stale` window |

**Security review of the current code:**

* **SSRF protection is real and reasonably thorough** — scheme, allowlist, userinfo rejection, DNS
  resolution with private/link-local/multicast/IPv4-mapped checks (`utils/urlSecurity.ts:98-189`). **[O]**
* **Command injection: low risk.** All Git invocations pass argument arrays through `simple-git`, never a
  shell string. The URL reaches `git` as an argument, and the allowlist prevents option-injection via a
  leading `-`. **[O]**
* **Path handling.** `GET /api/commits/resume/:repoPath` takes a user-supplied path, decodes it, and
  interpolates it into a Redis key (`commitRoutes.ts:723`). No filesystem access, so impact is limited to
  key-space pollution — but the endpoint should go regardless (C-3). **[O]**
* **PII.** `Contributor` currently exposes only `login` (`gitService.ts:996`) and the summary exposes only a
  count — consistent with the stated GDPR posture. The proposed schema stores raw `email` as a unique key.
  **Recommendation [R]:** key `contributors` on `sha256(lower(email))` and store the display name; retain
  the raw e-mail only if a product feature requires it, and document the retention/deletion path. Commit
  author e-mails will still live in `commits`; that is unavoidable for correctness but should be an explicit,
  documented decision with a per-repository delete path.
* **Multi-tenancy.** There is none today: caches, locks and clones are keyed on repository URL only, with no
  tenant dimension. When accounts arrive, every cache and DB key needs a tenant scope, and private
  repositories must never share a working copy across tenants. Design the `repositories` table to allow a
  future `owner_account_id` for private repos. **[R]**
* **Admin surface** is token-gated and rate-limited (`middlewares/adminAuth.ts`, `commitRoutes.ts:56`), and
  config refuses to start with `ADMIN_AUTH_ENABLED` and no token (`config.ts:601`). Good. **[O]**

---

## 14. Observability & Benchmarking

The existing surface is large (76 metric families) but instruments the *cache machinery* rather than the
work: there are five metrics for transaction rollbacks and none for clone duration as a distinct stage. **[O]**

**Can we answer these today?**

| Question | Today | Fix |
| --- | --- | --- |
| How long does cloning take? | Partly — `git_operation_duration_seconds` conflates stages | Label by stage: `clone`/`fetch`/`log`/`ls-tree` |
| How long does fetching take? | No — no fetch exists | ditto |
| Commits/sec, files/sec | `git_streaming_throughput_commits_per_second` exists but only on the streaming path | Emit from the indexer |
| Indexing duration | No | `index_job_duration_seconds{kind}` |
| Queue wait time | No | `index_job_queue_wait_seconds` |
| Active indexing jobs | No | `index_jobs_active` gauge |
| Git subprocess duration/count | Partly | `git_subprocess_total`, `git_subprocess_duration_seconds{command}` |
| Cache hit/miss | Yes, extensively | Keep only the response-cache counters |
| DB query latency | No DB | `db_query_duration_seconds{query}` |
| Failures by stage | Partly (`gitray_errors_detailed_total`) | Label by pipeline stage |
| Memory during indexing | Yes (RSS gauges) | Keep; add per-job peak |
| Repository size characteristics | Yes (`git_repository_size_commits`) | Add `repo_files_at_head`, `repo_bytes_on_disk` (measured, replacing the hard-coded estimate at `repositoryCoordinator.ts:792`) |

Retire with the cache layer: the rollback/verification/transaction families, `cache_prediction_accuracy_ratio`,
`gitray_anomalies_detected_total`, and the several composite "health score" gauges — they are derived numbers
without a defined action.

---

## 15. Current → Target Gap Analysis

| Area | Current | Problem | Target | Pri | Effort | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Request dedup / locking | `withKeyLock` coalesces on lock name | Cross-request result substitution | Locks lock; single-flight keyed on cache key | P0 | S | `lockManager.ts:295` |
| Commit parsing | `\|`-split, drops empty subjects | Wrong counts, corrupt fields | `%x1e/%x1f` records, keep all commits | P0 | S | `gitService.ts:760` |
| Refcount release | not awaited, split locks | Disk leak | awaited, one lock | P0 | S | `repositoryCoordinator.ts:810` |
| Redis keys | contain temp paths | Never hits, unbounded keyspace | Remove | P0 | S | `gitService.ts:256,380` |
| Clone paths | 3 independent | 3× network/disk/latency | 1 coordinator-owned bare clone | P1 | M | `:158`, `:1021`, `gitUtils.ts:16` |
| Clone form | `init`+fetch+**checkout** | Downloads all HEAD blobs | `--bare --filter=blob:none` | P1 | S | `gitUtils.ts:25-39` (+ local test) |
| Streaming | `--skip` paging, re-accumulated | O(N²), unbounded memory | one streamed `git log` | P1 | M | `gitService.ts:309,632` |
| Freshness | never fetches | Silently stale forever | fetch per job; expose `indexedThrough` | P1 | M | no fetch in tree |
| Persistence | none | Every request re-derives everything | Postgres facts + rollups | P2 | L | — |
| Job execution | none | Full scans on the request path | Postgres queue + in-process worker | P2 | M | — |
| Read path | git per request | Latency ∝ history | SQL reads only | P2 | M | §3.2 |
| Pagination | full history then `slice` | O(N) for 100 rows | keyset SQL | P2 | S | `repositoryCache.ts:2348` |
| Churn | 365 d, no line counts | Not lifetime, no add/del | `--numstat` → `file_churn_monthly` | P3 | M | `gitService.ts:1045,1293` |
| Heatmap window | hard-coded 365 d | Cannot show lifetime | range from `daily_activity`/`commits` | P3 | S | `gitService.ts:1546` |
| Incremental | none | Full cost on every change | ancestry check + delta / rebuild | P4 | M | — |
| Cache layer | 3 tiers + transactions | ~5 200 LOC, C-1 source | delete; Redis response cache | P5 | M | `repositoryCache.ts`, `hybridLruCache.ts` |
| API shape | `/full-data`, dup routers | Blocking first paint, dead surface | `/api/repos/:id/*` + coverage envelope | P5 | M | `repositoryRoutes.ts:253`, `commitRoutes.ts` |
| Tests | git fully mocked | Cannot catch index corruption | fixture repos + integration suite | P2 (with) | M | `__tests__/unit/**` |

---

## 16. Refactoring Roadmap

### P0 — Correctness (must do now; independent of everything else)

* **Objective:** stop serving wrong data; stop the unbounded leaks.
* **Modules:** `utils/lockManager.ts`, `services/gitService.ts`, `services/repositoryCoordinator.ts`,
  `routes/commitRoutes.ts`.
* **Changes:** remove promise coalescing from `withKeyLock`; re-format/re-parse `git log`; `await`
  `releaseRepository` and unify its lock with `repo-access`; delete `commits_batch:` / `stream_resume:` keys
  and the `/resume` endpoints; replace the two `console.error` calls.
* **Tests:** concurrent-different-operations test on one repo URL; parser fixtures (`|` in names, empty
  subject, non-ASCII, merge commits); refcount-under-concurrency test.
* **Risk:** low. Removing coalescing increases duplicate work slightly until P1 lands — acceptable.
* **Acceptance:** two concurrent differently-filtered requests each return their own correct payload;
  `getCommits().length === getCommitCount()` on every fixture repo; no `*_batch:*` keys in Redis after a run.

### P1 — One clone, one walk

* **Objective:** collapse three clones into one bare blobless clone; make history traversal linear.
* **Modules:** `utils/gitUtils.ts`, `services/gitService.ts`, `services/repositoryCoordinator.ts`,
  `services/repositorySummaryService.ts`, `services/fileAnalysisService.ts`.
* **Changes:** `cloneRepository` → `--bare --filter=blob:none --no-tags`, fetch a real remote-tracking ref;
  summary and file-analysis take a `localPath` from the coordinator; delete `getCommitsStream` and
  `executeStreamingCommits`; add a streamed `git log` reader; measured disk LRU for working copies.
* **Dependencies:** P0 (the parser).
* **Risk:** medium — `ls-tree -l` sizes on a blobless clone must be verified (H-2 caveat).
* **Acceptance:** one clone per repository per analyze, verified by `git_subprocess_total`; peak RSS flat
  in commit count on the largest fixture; `/full-data` cold latency improves measurably (§20 baseline).

### P2 — Postgres facts + job queue + DB read path

* **Objective:** move the full scan off the request path.
* **Changes:** add a migration tool (`drizzle` or plain SQL + `node-pg-migrate` — either is fine; pick one
  and check migrations into `apps/backend/migrations/`); create `repositories`, `repo_index_state`,
  `index_jobs`, `commits`; build `services/indexing/` (job runner, claimer, commit pipeline); repoint
  `/summary`, `/contributors`, `/commits`, `/activity` at SQL; add `POST /api/repos` and
  `GET /index-status`; add `docker-compose.yml` with Postgres + Redis.
* **Migrations:** additive only; the old endpoints keep working behind a `USE_INDEX=false` flag for rollback.
* **Tests:** fixture-repo integration suite (§ below); job crash/resume; idempotent re-run.
* **Risk:** medium-high — a new hard dependency. Mitigate with the flag and a documented rollback.
* **Acceptance:** all four endpoints answered from SQL with no Git subprocess; a re-run of the same job
  produces byte-identical rollups.

### P3 — Churn and file types on the index

* Add `repo_files`, `file_churn_monthly`, `daily_activity`, `contributors`, `repo_summary`; extend the
  indexer to consume `--numstat`; file-types materialised from `ls-tree` at the indexed head.
* **Acceptance:** lifetime churn *with* additions/deletions; churn range + path-prefix queries under the
  latency target; heatmap over an arbitrary range.

### P4 — Incremental & invalidation

* Ancestry check, delta processing, generation bump + rebuild, background sweep of old generations,
  scheduled refresh for recently-viewed repositories.
* **Acceptance:** the force-push / rebase / merge / branch-change fixture matrix (§ below) produces numbers
  identical to a from-scratch index in every case.

### P5 — Delete the cache layer and reshape the API

* Remove `repositoryCache.ts`, `hybridLruCache.ts`, `distributedCacheInvalidation.ts`,
  `serializationWorker.ts`, the cache admin endpoints and the cache metrics; narrow Redis to response cache
  + rate limiting; remove `/full-data`, `/api/commits/*` duplicates and the streaming endpoints; move the
  frontend to `repoId` + widget endpoints + `index-status` polling.
* **Acceptance:** backend `src/` shrinks by roughly a third with no endpoint regression.

### P6 — Coverage tiers / pricing

* Enforce `coverage` in the indexer and the API. Deferred until the index is proven.

### Do **not** do

Table partitioning; a per-commit-per-file table at 1 M-commit scale; BullMQ or a separate worker service;
SSE/WebSocket progress; a distributed cache-invalidation bus; SQLite as an interim store; an
`analysis_sessions` table; reviving the cache-transaction/rollback machinery.

---

## 17. File-Level Change Plan

**Keep (architecturally sound):**

| Path | Note |
| --- | --- |
| `apps/backend/src/utils/urlSecurity.ts` | Solid SSRF defence; keep as-is |
| `apps/backend/src/middlewares/*` | validation, adminAuth, requestId, strictContentType, errorHandler |
| `apps/backend/src/services/logger.ts` | winston setup + request logger |
| `apps/backend/src/utils/memoryPressureManager.ts`, `middlewares/memoryPressureMiddleware.ts` | Still useful as a last-resort guard |
| `packages/shared-types/src/index.ts` | Extend, don't fork |
| `apps/backend/perf/` | Reuse the k6 harness for §20 |

**Modify:**

| Path | Current responsibility | Future responsibility |
| --- | --- | --- |
| `utils/lockManager.ts` | locks **+ result coalescing** | locks only; coalescing removed (P0) |
| `utils/gitUtils.ts` | `shallowClone` (init+fetch+checkout, unused `depth`) | `createBareMirror` / `fetchRef`; no working tree |
| `services/gitService.ts` | everything Git | thin, streamed Git readers: `streamCommits`, `revList`, `countCommits`, `lsTree`, `resolveRef`, `isAncestor`. Remove streaming/batch/resume, `aggregateCommitsByTime`, `analyzeCodeChurn` (moves into the indexer) |
| `services/repositoryCoordinator.ts` | shared handles + coalescing + refcount | working-copy manager: acquire/fetch/release, measured disk LRU, awaited refcounts |
| `services/repositorySummaryService.ts` | own clone + own cache + summary | URL parsing/canonicalisation only (`parseRepositoryUrl` is worth keeping); summary comes from `repo_summary` |
| `services/fileAnalysisService.ts` | 3 498 LOC: clones, circuit breakers, own cache, analysis | file-type computation from an `ls-tree` listing against a coordinator-supplied path. Target ≤ 400 LOC |
| `routes/repositoryRoutes.ts` | url-query endpoints incl. `/full-data` | `/api/repos/:id/*` with the coverage envelope |
| `routes/commitRoutes.ts` | duplicates + admin + streaming + file-analysis | delete; `file-analysis` migrates to the repos router |
| `services/metrics.ts` | 76 families | drop cache/rollback families; add git-stage, job and DB families |
| `config.ts` | ~120 env vars, many for caches | drop cache/streaming/lock groups; add `DATABASE_URL`, worker concurrency, job timeouts |
| `apps/frontend/src/services/api.ts` | url-string API, client-side `.git` | `repoId` API, `POST /api/repos`, `index-status` polling |
| `apps/frontend/src/App.tsx`, `components/DashboardPage.tsx` | one blocking `/full-data`, then 3 fetches | register → poll status → per-widget fetch with skeletons |

**Replace / Remove:**

| Path | Reason |
| --- | --- |
| `services/repositoryCache.ts` (3 100) | Superseded by Postgres; source of the C-1 defect class |
| `utils/hybridLruCache.ts` (1 634) | No consumer once the tiers are gone |
| `utils/serializationWorker.ts` | Only exists to serialise cached commit arrays |
| `services/distributedCacheInvalidation.ts` | Generation-scoped keys make it unnecessary |
| `utils/withTempRepository.ts` | Legacy + coordinated duplication; fold into the coordinator |
| `utils/repositoryRouteFactory.ts`, `utils/routeHelpers.ts` | Re-evaluate against the new route shape; likely much smaller |
| `utils/cleanupScheduler.ts` | Only used by the legacy temp-repo path |
| `gitService.getCommitsWithStats`, `getOrParseFilteredCommits`, `invalidateCachedRepository`, `repositoryCoordinator.cleanupHandle` | Dead code today (M-1) |
| `apps/backend/__tests__/unit/routes/repositoryRoutes.unit.test.ts.old` | Checked-in dead test file |

**Add:**

```
apps/backend/migrations/                      SQL migrations (checked in, forward-only)
apps/backend/src/db/                          pool, query helpers, typed repositories
apps/backend/src/services/indexing/
    indexJobQueue.ts                          enqueue / claim / lease / complete
    indexWorker.ts                            worker loop, concurrency, shutdown
    commitPipeline.ts                         streamed git log → rollups → COPY
    invalidation.ts                           ancestry check, generation, sweep
apps/backend/src/services/analytics/          SQL read models (one per widget)
apps/backend/__tests__/fixtures/gitRepoBuilder.ts   synthetic repo builder
apps/backend/__tests__/integration/indexing/  correctness suite (below)
docker-compose.yml                            postgres + redis
docs/ARCHITECTURE.md, docs/API.md, docs/TESTING.md   referenced by CLAUDE.md, missing today
```

**Test architecture (prerequisite for P2, not a follow-up).** Today every backend test mocks `gitService`,
so no test exercises real Git output; the only integration tests cover security headers and admin auth. **[O]**
Before touching the indexer, add a `gitRepoBuilder` fixture and an integration suite covering: linear
history; merge commits; octopus merge; many files per commit; many contributors; identical author name with
different e-mails; empty commit message; `|` and non-ASCII in names/subjects; commits with identical
timestamps; incremental append; **force push**; **rebase/history rewrite**; default-branch change; deleted
branch. For each: index from scratch, index incrementally, and assert the two produce **identical** rollups.
That equivalence assertion is the single test that prevents an optimisation from silently corrupting analytics.

---

## 18. Performance Plan

**Fixtures.** A generator producing repositories at 1 k / 10 k / 100 k / 1 M commits with controllable
files-per-commit (1, 5, 20) and contributor counts, plus two or three real public repositories spanning the
size range. Fixtures are generated once and cached in CI.

**Method.** Measure on the same host, cold (fresh temp dirs, flushed Redis, empty DB) and warm. Capture:
wall time per stage; `process.resourceUsage()` + peak RSS via `/usr/bin/time -v`; Git subprocess count and
duration via a wrapper around the Git invoker; bytes fetched via `GIT_TRACE2_PERF`; DB write volume via
`pg_stat_statements`; API latency percentiles via the existing k6 harness (`apps/backend/perf/`).

| Metric | Baseline | Likely bottleneck | Optimisation target | Threshold that would change the architecture |
| --- | --- | --- | --- | --- |
| Cold `/full-data` (10 k) | measure today | 3× clone | 1 clone | — |
| Time to **first useful dashboard data** | measure today | full-history walk | ≤ 2 s at any size (register + summary from a prior index, or `state:'indexing'` immediately) | — |
| Full index, 100 k commits | n/a | `--numstat` tree diffs | linear in N; single Git process | > 10 min → shard the walk by commit range |
| Full index, 1 M commits | n/a | same | linear | > 45 min → precomputed commit-graph, or coverage-limited default |
| Incremental (10 new commits) | n/a | fetch | < 5 s dominated by network | — |
| Peak RSS during indexing | measure today (expect ∝ N) | commit-array retention | **flat in N**, bounded by distinct files × months | > 1 GB on the 1 M fixture → spill rollups to a staging table |
| Git subprocesses per analyze | ~6–8 across 3 clones **[I]** | duplicate paths | ≤ 3 cold, 0 warm | — |
| DB write volume, full index | n/a | `commits` + churn | ≈ 0.5 GB / 1 M commits | > 2 GB → revisit churn bucketing |
| API p95 after indexing | n/a | SQL | < 150 ms all widgets | > 500 ms → add covering indexes, then materialised views |
| Concurrent indexing, 4 large repos | n/a | CPU + disk | no request latency regression | queue wait > 5 min → dedicated worker service (P6) |

**Rule:** every threshold above is a *decision trigger*, not a target to be asserted. No number in this
document is a measurement; the first task of P0 is to record the baseline so P1–P5 can be judged against it.

---

## 19. Open Questions

1. **Product scale.** What is the largest repository GitRay must support *well*, and is a bounded-coverage
   default (e.g. 24 months, with lifetime as an opt-in job) acceptable? This single answer determines
   whether the 1 M-commit column of §18 is a requirement or a stretch goal.
2. **Deployment shape.** Single instance or multiple? The file-based locks in `os.tmpdir()` only work
   per-host, and today's design would already be incorrect behind more than one instance.
3. **Private repositories / authentication.** Is this planned? It changes clone credentials, tenant
   isolation, working-copy sharing rules and cache-key scoping — all of which are cheaper to design in now.
4. **PII retention.** May commit author e-mails be persisted in `commits`? If not, indexing must hash them
   at ingest, and contributor identity resolution becomes hash-only.
5. **Churn semantics.** Should churn count merge commits, and should renames be followed (`--follow` /
   rename detection)? This materially changes both the numbers and the indexing cost.
6. **Multi-branch.** Is analytics always the default branch, or will users select branches? The schema
   supports per-ref state; the indexing budget multiplies per indexed ref.
7. **File sizes in file-type analysis.** Are byte sizes required, or is file *count* per type sufficient?
   Sizes are what force blob access on an otherwise blobless clone (H-2).
8. **Retention.** How long should a repository's index survive after the last view? This drives the sweep
   policy and the storage forecast.

---

## 20. Final Recommendation

> **If I were refactoring GitRay today:** I would fix the lock-coalescing defect and the Git-log parser
> first, because until those are fixed the service can return one user's data to another and no benchmark of
> anything else is trustworthy. Then I would collapse the three clone paths into a single **bare, blobless**
> clone and replace the `--skip`-paged pseudo-streaming with **one streamed `git log`**, which is where most
> of the perceived latency actually lives. Only then would I add **PostgreSQL**, and I would use it to store
> **normalized per-commit facts plus a small set of recomputable rollups** — not the aggregate-only index the
> design document proposes, because aggregate-only cannot serve the author-filtered heatmap the product
> already ships and forces a full re-scan for every future feature. Indexing would run as a
> **Postgres-queued background job** claimed with `FOR UPDATE SKIP LOCKED`, executed by a worker in the same
> process behind a role flag, with correctness anchored on one invariant: *a delta may be applied only if the
> indexed commit is an ancestor of the new head; otherwise stamp a new generation and rebuild* — which is
> cheap because `rev-list` gives the full sha set in seconds and only unseen commits need parsing. Lifetime
> totals would be **derived from the facts, never incremented**, so a retried job can never corrupt them.
> I would **not** create an `analysis_sessions` table — index state plus job state already answer every
> question the UI asks — and I would **delete** the entire three-tier cache, the hybrid LRU, the
> serialization workers and the distributed invalidation bus, roughly 5 200 lines whose job Postgres does
> better and whose complexity produced the correctness bug in the first place. Redis stays, narrowed to
> short-TTL response caching keyed by generation (so invalidation is free) and rate limiting.
>
> **Why:** GitRay's analytics are all aggregations over one immutable fact stream. The current architecture
> re-derives that stream per feature, per filter, per request, and then spends thousands of lines caching the
> derivations. Persisting the stream once, and treating everything else as a recomputable projection, makes
> the system fast for small repos, feasible for very large ones, cheap to extend with new widgets, and — most
> importantly — simple enough that its correctness is checkable by tests rather than defended by rollback
> machinery.

---

*Analysis only. No production code, schema, migration or dependency was modified in producing this document.*
