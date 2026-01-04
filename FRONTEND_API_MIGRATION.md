# Frontend API Migration Guide

<!-- markdownlint-disable MD013 -->

This document is a **drop-in migration reference** that matches the current backend implementation
in [`apps/backend/src/routes/repositoryRoutes.ts`](apps/backend/src/routes/repositoryRoutes.ts) and
the shared response contracts in [`packages/shared-types/src/index.ts`](packages/shared-types/src/index.ts).
Every route under `/api/repositories` is a **GET** endpoint that accepts **query parameters only** and
uses unified caching. Pagination defaults are `page=1` and `limit=100` (maximum `limit=100`).

## Quick endpoint map (old → new)

| Legacy call | Replacement | Method | Notes |
| --- | --- | --- | --- |
| `POST /api/repositories` | `GET /api/repositories/commits` | GET | Paginated commits; flat author fields. |
| `POST /api/repositories/heatmap` | `GET /api/repositories/heatmap` | GET | Aggregated buckets; author/date filters via query. |
| `POST /api/repositories/contributors` | `GET /api/repositories/contributors` | GET | Unique contributor names; same filters as heatmap. |
| `POST /api/repositories/churn` | `GET /api/repositories/churn` | GET | Code churn with `files[]` + `metadata`; filters flattened. |
| `POST /api/repositories/full-data` | `GET /api/repositories/full-data` | GET | Commits + heatmap + pagination + `isValidHeatmap`. |
| `GET /api/repositories/summary` | `GET /api/repositories/summary` | GET | Summary returned under `summary` with required metadata. |

## Shared request-building rules

- **repoUrl (required):** must be a valid HTTP/HTTPS Git URL; validation returns HTTP 400 with
  `{ error: 'Validation failed', code: 'VALIDATION_ERROR', errors: [...] }` on failure.
- **Pagination:** `page` and `limit` must be integers (`1 ≤ page ≤ 1000`, `1 ≤ limit ≤ 100`). Defaults
  are `page=1`, `limit=100`; `skip` is derived server-side from these values.
- **Date filters:** `fromDate` / `toDate` must be strict ISO-8601; `toDate` cannot precede
  `fromDate` or be in the future.
- **Author filters:** `author` (single) or `authors` (comma-separated list, max 10). Backend converts
  `authors` to `string[]` via `authors.split(',')`.
- **Churn filters:** `minChanges` integer `1–1000`; `extensions` comma-separated (max 20) ->
  `string[]` server-side via `extensions.split(',')`.
- **Query serialization:** Send numbers as strings; omit undefined values to keep cache keys stable.
  Example helper:

```typescript
const params = new URLSearchParams();
params.set('repoUrl', repoUrl);
if (page) params.set('page', String(page));
if (limit) params.set('limit', String(limit));
if (author) params.set('author', author);
if (authors?.length) params.set('authors', authors.join(','));
if (fromDate) params.set('fromDate', fromDate);
if (toDate) params.set('toDate', toDate);
if (minChanges) params.set('minChanges', String(minChanges));
if (extensions?.length) params.set('extensions', extensions.join(','));
```

## Endpoint-by-endpoint migration

### 1) GET /api/repositories/commits — paginated commit list

#### Validated params — commits

```typescript
{
  repoUrl: string; // required
  page?: number;   // optional, default 1, max 1000
  limit?: number;  // optional, default 100, max 100
}
```

#### Response (from `Commit` type)

```typescript
{
  commits: Array<{
    sha: string;
    message: string;
    date: string;        // ISO 8601
    authorName: string;  // flat fields, no nested author object
    authorEmail: string;
  }>;
  page: number;
  limit: number;
}
```

#### Before → After — commits

```typescript
// BEFORE (legacy POST body)
await apiClient.post('/api/repositories', { repoUrl });

// AFTER (GET with pagination)
const params = new URLSearchParams({ repoUrl, page: '1', limit: '50' });
const { commits, page, limit } = await apiClient
  .get(`/api/repositories/commits?${params.toString()}`)
  .then((r) => r.data);
```

### 2) GET /api/repositories/heatmap — commit aggregations

#### Validated params — heatmap

All optional except `repoUrl`: `author`, `authors`, `fromDate`, `toDate`.

#### Response — heatmap (`CommitHeatmapData`)

```typescript
{
  heatmapData: {
    timePeriod: 'day' | 'week' | 'month' | 'year';
    data: Array<{
      periodStart: string;   // bucket start date
      commitCount: number;   // commits in bucket
      authors?: string[];
      filesChanged?: number;
      linesAdded?: number;
      linesDeleted?: number;
    }>;
    metadata?: {
      maxCommitCount: number;
      totalCommits: number;
      filterOptions?: {
        author?: string;
        authors?: string[];
        fileExtension?: string;
        fromDate?: string;
        toDate?: string;
      };
      streamingUsed?: boolean;
    };
  };
}
```

#### Before → After — heatmap

```typescript
// BEFORE
await apiClient.post('/api/repositories/heatmap', {
  repoUrl,
  filterOptions: { author, fromDate, toDate },
});

// AFTER
const params = new URLSearchParams({ repoUrl });
if (author) params.set('author', author);
if (authors?.length) params.set('authors', authors.join(','));
if (fromDate) params.set('fromDate', fromDate);
if (toDate) params.set('toDate', toDate);

const { heatmapData } = await apiClient
  .get(`/api/repositories/heatmap?${params.toString()}`)
  .then((r) => r.data);
```

### 3) GET /api/repositories/contributors — unique contributor names

Uses the same filter params (`author`, `authors`, `fromDate`, `toDate`).

#### Response — contributors (`Contributor[]`)

```typescript
{
  contributors: Array<{
    login: string; // contributor display name; no counts/ranks
  }>;
}
```

#### Before → After — contributors

```typescript
// BEFORE
await apiClient.post('/api/repositories/contributors', { repoUrl, filterOptions });

// AFTER
const params = new URLSearchParams({ repoUrl });
if (fromDate) params.set('fromDate', fromDate);
if (toDate) params.set('toDate', toDate);
if (authors?.length) params.set('authors', authors.join(','));

const { contributors } = await apiClient
  .get(`/api/repositories/contributors?${params.toString()}`)
  .then((r) => r.data);
```

### 4) GET /api/repositories/churn — `CodeChurnAnalysis`

Validated params: `repoUrl` (required), `fromDate`, `toDate`, `minChanges`, `extensions`.
Backend maps `fromDate` → `metadata.dateRange.from`, `toDate` → `metadata.dateRange.to`, converts
`extensions` to `string[]`, and `minChanges` to `number` via `Number.parseInt`.

#### Response — churn

```typescript
{
  churnData: {
    files: Array<{
      path: string;
      changes: number;
      risk: 'high' | 'medium' | 'low';
      extension?: string;
      firstChange?: string;
      lastChange?: string;
      authorCount?: number;
    }>;
    metadata: {
      totalFiles: number;
      totalChanges: number;
      riskThresholds: { high: number; medium: number; low: number };
      dateRange: { from: string; to: string };
      highRiskCount: number;
      mediumRiskCount: number;
      lowRiskCount: number;
      analyzedAt: string;
      streamingUsed?: boolean;
      filterOptions?: {
        since?: string;
        until?: string;
        extensions?: string[];
        minChanges?: number;
      };
      processingTime?: number;
      fromCache?: boolean;
    };
  };
}
```

#### Before → After — churn

```typescript
// BEFORE
await apiClient.post('/api/repositories/churn', { repoUrl, filterOptions: { limit: 50 } });

// AFTER
const params = new URLSearchParams({ repoUrl });
if (fromDate) params.set('fromDate', fromDate);
if (toDate) params.set('toDate', toDate);
if (minChanges) params.set('minChanges', String(minChanges));
if (extensions?.length) params.set('extensions', extensions.join(','));

const { churnData } = await apiClient
  .get(`/api/repositories/churn?${params.toString()}`)
  .then((r) => r.data);
```

### 5) GET /api/repositories/summary — repository overview

No pagination; only `repoUrl` is required.

#### Response — summary (`RepositorySummary`)

```typescript
{
  summary: {
    repository: { name: string; owner: string; url: string; platform: 'github' | 'gitlab' | 'bitbucket' | 'other' };
    created: { date: string; source: 'first-commit' | 'git-api' | 'platform-api' };
    age: { years: number; months: number; formatted: string };
    lastCommit: { date: string; relativeTime: string; sha: string; author: string };
    stats: {
      totalCommits: number;
      contributors: number;
      status: 'active' | 'inactive' | 'archived' | 'empty';
    };
    metadata: {
      cached: boolean;
      dataSource: 'git-sparse-clone' | 'cache';
      createdDateAccuracy: 'exact' | 'approximate';
      bandwidthSaved: string;
      lastUpdated: string;
    };
  };
}
```

#### Before → After — summary

```typescript
// BEFORE (incorrect root-level access)
// const totalCommits = response.totalCommits;

// AFTER
const { summary } = await apiClient
  .get(`/api/repositories/summary?repoUrl=${encodeURIComponent(repoUrl)}`)
  .then((r) => r.data);

const totalCommits = summary.stats.totalCommits;
const contributors = summary.stats.contributors;
const status = summary.stats.status;
const bandwidthSaved = summary.metadata.bandwidthSaved;
```

### 6) GET /api/repositories/full-data — commits + heatmap + pagination

Validated params: `repoUrl` (required), `page`, `limit`, `author`, `authors`, `fromDate`, `toDate`.
Backend derives `skip` from pagination, builds commit filters from author/date, fetches commits and
heatmap sequentially, and returns a validation guard `isValidHeatmap` that is `true` only when the
returned object contains `timePeriod` and `data` fields.

#### Response — full-data

```typescript
{
  commits: Array<{
    sha: string;
    message: string;
    date: string;
    authorName: string;
    authorEmail: string;
  }>;
  heatmapData: {
    timePeriod: 'day' | 'week' | 'month' | 'year';
    data: Array<{ periodStart: string; commitCount: number; authors?: string[]; filesChanged?: number; linesAdded?: number; linesDeleted?: number }>;
    metadata?: { maxCommitCount: number; totalCommits: number; filterOptions?: CommitFilterOptions; streamingUsed?: boolean };
  };
  page: number;
  limit: number;
  isValidHeatmap: boolean;
}
```

#### Before → After — full-data

```typescript
// BEFORE
await apiClient.post('/api/repositories/full-data', { repoUrl, timePeriod, filterOptions });

// AFTER
const params = new URLSearchParams({ repoUrl, page: '1', limit: '20' });
if (authors?.length) params.set('authors', authors.join(','));
if (fromDate) params.set('fromDate', fromDate);
if (toDate) params.set('toDate', toDate);

const { commits, heatmapData, page, limit, isValidHeatmap } = await apiClient
  .get(`/api/repositories/full-data?${params.toString()}`)
  .then((r) => r.data);

if (isValidHeatmap) {
  renderHeatmap(heatmapData);
}
```

## Error handling (accurate to backend middleware)

- Validation failures return **HTTP 400** with `{ error: 'Validation failed', code: 'VALIDATION_ERROR', errors: [...] }`.
- Other errors propagate to the global error handler and are returned as HTTP 500 unless overridden
  by specific middleware.
- Always check `response.ok` (or catch Axios errors) and surface `payload.message` if provided.

```typescript
async function getJson<T>(path: string, params: URLSearchParams): Promise<T> {
  const res = await fetch(`${path}?${params.toString()}`);
  if (!res.ok) {
    const payload = await res.json().catch(() => undefined);
    throw new Error(payload?.message ?? payload?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
```

## Migration checklist

- [ ] All fetchers use **GET** with query params; no POST bodies remain.
- [ ] Pagination defaults (`page=1`, `limit=100`) and bounds (`limit ≤ 100`) are respected.
- [ ] Author/date filters use query params and comma-separated `authors`; churn uses `extensions`
      and `minChanges` as strings.
- [ ] Commits render **flat `authorName`/`authorEmail`**; no per-commit `stats` or nested `author`.
- [ ] Heatmap consumers read `{ periodStart, commitCount }` buckets and optional metadata.
- [ ] Churn consumers read `churnData.files` + `churnData.metadata`; no `summary`/`riskLevel` strings.
- [ ] Summary consumers read nested `summary.stats` and `summary.metadata.bandwidthSaved`.
- [ ] Full-data consumers honor `isValidHeatmap` before rendering the heatmap.
