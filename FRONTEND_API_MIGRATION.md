# Frontend API Migration Guide - Issue #120

## Overview

Issue #120 refactored the backend repository routes to use a unified cache service.
While the backend changes are complete and working,
the frontend needs updates to work with the new API structure.

## Key Changes

### 1. HTTP Method Changes

**Before (Old API):**

- `POST /api/repositories` - Get commits
- `POST /api/repositories/heatmap` - Get heatmap data
- `POST /api/repositories/full-data` - Get full data

**After (New API):**

- `GET /api/repositories/commits` - Get commits
- `GET /api/repositories/heatmap` - Get heatmap data
- `GET /api/repositories/full-data` - Get full data
- `GET /api/repositories/summary` - Get repository summary (unchanged method)

**Migration Required:**

- Change all POST requests to GET requests
- Move request body parameters to query parameters

### 2. Response Structure Changes

#### Summary Endpoint Response

**Endpoint:** `GET /api/repositories/summary`

**Response Structure:**

```typescript
{
  summary: {
    repository: {
      name: string;
      owner: string;
      url: string;
      platform: "github" | "gitlab" | "bitbucket";
    };
    created: {
      date: string;  // ISO 8601
      source: "git-log" | "github-api" | "gitlab-api" | "estimated";
    };
    age: {
      years: number;
      months: number;
      formatted: string;  // e.g., "2.5y"
    };
    lastCommit: {
      date: string;  // ISO 8601
      relativeTime: string;  // e.g., "2 days ago"
      sha: string;
      author: string;
    };
    stats: {
      totalCommits: number;     // ← Access as response.summary.stats.totalCommits
      contributors: number;      // ← Access as response.summary.stats.contributors
      status: "active" | "inactive" | "archived";
    };
    metadata: {
      cached: boolean;
      dataSource: "git-sparse-clone" | "cache";
      createdDateAccuracy: "exact" | "approximate";
      bandwidthSaved: string;
      lastUpdated: string;  // ISO 8601
    };
  }
}
```

**Frontend Code Changes Required:**

```typescript
// OLD (INCORRECT):
const totalCommits = response.totalCommits;           // ❌ Returns undefined
const totalContributors = response.totalContributors; // ❌ Returns undefined

// NEW (CORRECT):
const totalCommits = response.summary?.stats?.totalCommits;  // ✅ Returns 480
const contributors = response.summary?.stats?.contributors;  // ✅ Returns 4-6
```

**Important Notes:**

- `totalCommits` is nested in `summary.stats.totalCommits`
- Field is named `contributors`, NOT `totalContributors`
- All fields are nested under `summary` object

### 3. Filter Options Structure

**Before:**

```typescript
// POST body
{
  repoUrl: string;
  filterOptions?: {
    author?: string;
    authors?: string[];
    fromDate?: string;
    toDate?: string;
  }
}
```

**After:**

```typescript
// GET query parameters
?repoUrl=https://github.com/user/repo.git
&author=john
&authors=john,jane,bob
&fromDate=2024-01-01
&toDate=2024-12-31
```

**Frontend Code Changes Required:**

```typescript
// OLD:
const response = await apiClient.post('/api/repositories/heatmap', {
  repoUrl,
  filterOptions: { author: 'john', fromDate: '2024-01-01' }
});

// NEW:
const params = new URLSearchParams({
  repoUrl,
  ...(author && { author }),
  ...(fromDate && { fromDate }),
  ...(toDate && { toDate })
});
if (authors && authors.length > 0) {
  params.append('authors', authors.join(','));
}
const response = await apiClient.get('/api/repositories/heatmap', { params });
```

## Required Frontend Changes

### File: `apps/frontend/src/services/api.ts`

#### 1. Update `getWorkspaceCommits` function

```typescript
// OLD:
export const getWorkspaceCommits = async (repoUrl: string): Promise<Commit[]> => {
  const response = await apiClient.post('/api/repositories', { repoUrl });
  return response.data.commits;
};

// NEW:
export const getWorkspaceCommits = async (repoUrl: string): Promise<Commit[]> => {
  const params = new URLSearchParams({ repoUrl });
  const response = await apiClient.get('/api/repositories/commits', { params });
  return response.data.commits;
};
```

#### 2. Update `getHeatmapData` function

```typescript
// Already correct - uses GET method
// Just verify endpoint path is '/api/commits/heatmap' or '/api/repositories/heatmap'
```

#### 3. Update `getRepositoryFullData` function

```typescript
// OLD:
export const getRepositoryFullData = async (
  repoUrl: string,
  timePeriod: TimePeriod = 'month',
  filterOptions?: CommitFilterOptions
): Promise<{ commits: Commit[]; heatmapData: CommitHeatmapData }> => {
  const response = await apiClient.post('/api/repositories/full-data', {
    repoUrl,
    timePeriod,
    filterOptions,
  });
  return {
    commits: response.data.commits,
    heatmapData: response.data.heatmapData,
  };
};

// NEW:
export const getRepositoryFullData = async (
  repoUrl: string,
  timePeriod: TimePeriod = 'month',
  filterOptions?: CommitFilterOptions
): Promise<{ commits: Commit[]; heatmapData: CommitHeatmapData }> => {
  const params = new URLSearchParams({
    repoUrl,
    timePeriod
  });

  // Add filter options as query params
  if (filterOptions?.author) {
    params.append('author', filterOptions.author);
  }
  if (filterOptions?.authors && filterOptions.authors.length > 0) {
    params.append('authors', filterOptions.authors.join(','));
  }
  if (filterOptions?.fromDate) {
    params.append('fromDate', filterOptions.fromDate);
  }
  if (filterOptions?.toDate) {
    params.append('toDate', filterOptions.toDate);
  }

  const response = await apiClient.get('/api/repositories/full-data', { params });
  return {
    commits: response.data.commits,
    heatmapData: response.data.heatmapData,
  };
};
```

#### 4. Add `getRepositorySummary` function (if missing)

```typescript
import { RepositorySummary } from '@gitray/shared-types';

export const getRepositorySummary = async (
  repoUrl: string
): Promise<RepositorySummary> => {
  const params = new URLSearchParams({ repoUrl });
  const response = await apiClient.get('/api/repositories/summary', { params });
  return response.data.summary;  // Returns RepositorySummary object
};
```

### TypeScript Type Updates

Ensure your types match the backend `RepositorySummary` interface:

```typescript
// Import from shared types
import { RepositorySummary } from '@gitray/shared-types';

// Or define locally if not imported:
interface RepositorySummary {
  repository: {
    name: string;
    owner: string;
    url: string;
    platform: string;
  };
  stats: {
    totalCommits: number;      // Access this field
    contributors: number;       // Access this field
    status: string;
  };
  // ... other fields
}
```

## Testing Checklist

After implementing these changes:

- [ ] Test `getWorkspaceCommits` returns commit data
- [ ] Test `getHeatmapData` returns non-empty heatmap
- [ ] Test `getRepositoryFullData` returns both commits and heatmap
- [ ] Test `getRepositorySummary` returns summary with `stats.totalCommits` and `stats.contributors`
- [ ] Test filter options (author, authors, date ranges) work correctly
- [ ] Verify no endpoints return null for expected data
- [ ] Test with gitray repository: should show 480 commits, 4-6 contributors

## Common Pitfalls

1. **Accessing top-level fields**: `response.totalCommits` will be undefined. Always access `response.summary.stats.totalCommits`

2. **Field name mismatch**: Backend returns `contributors`, not `totalContributors`

3. **Method mismatch**: Using POST when endpoints now expect GET will return 404

4. **Query parameter format**: Arrays should be comma-separated strings, not JSON arrays

## Backend Response Examples

### Summary Response (Real Data from gitray repo)

```json
{
  "summary": {
    "stats": {
      "totalCommits": 480,
      "contributors": 4,
      "status": "active"
    }
  }
}
```

### Heatmap Response

```json
{
  "data": [
    { "date": "2024-01-01", "count": 5 },
    { "date": "2024-01-02", "count": 3 }
  ],
  "totalCommits": 480
}
```

## Questions?

If you encounter issues during migration:

1. Check backend logs for errors
2. Verify query parameters are correctly formatted
3. Ensure response paths match TypeScript interfaces
4. Test with curl to verify backend is returning correct data

## Related Issues

- Issue #120: Backend cache refactoring (completed)
- Deadlock fix: Nested lock acquisition bug (resolved)
