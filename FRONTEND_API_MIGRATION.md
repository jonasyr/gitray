# Frontend API Migration Guide

## Overview

This guide documents the backend API changes from PR #122 (Issue #120) and provides
complete migration instructions for **any frontend implementation** consuming the GitRay
backend API.

**Scope**: This document is frontend-agnostic and covers general API interaction
patterns, not specific to the current frontend implementation (which is being replaced).

**Key Changes**:

- All POST endpoints → GET endpoints with query parameters
- Enhanced pagination support
- Filter parameters flattened to query params
- Improved response structures with nested data
- Multi-tier caching for better performance

---

## Migration Status

### FRONTEND API SERVICE MIGRATION: COMPLETE

The frontend API service (`apps/frontend/src/services/api.ts`) has been fully
migrated to use the new backend endpoints:

- ✅ `getRepositoryCommits` - Migrated to GET /api/repositories/commits with pagination
- ✅ `getRepositoryHeatmap` - Migrated to GET /api/repositories/heatmap with filters
- ✅ `getRepositoryContributors` - Implemented GET /api/repositories/contributors (GDPR-compliant)
- ✅ `getCodeChurn` - Migrated to GET /api/repositories/churn
- ✅ `getRepositorySummary` - Migrated to GET /api/repositories/summary
- ✅ `getRepositoryFullData` - Implemented GET /api/repositories/full-data with
  pagination and filters
- ✅ `getFileAnalysis` - Uses GET /api/commits/file-analysis (separate endpoint)

**All functions**:

- Use URLSearchParams for query parameter construction
- Handle filter options (author, authors, fromDate, toDate) correctly
- Include proper error handling with detailed logging
- Normalize repository URLs (append .git if missing)
- Return correctly typed responses matching backend structure

**Next Steps**: The API service is ready. Any remaining migration work involves
updating UI components to use these functions correctly, particularly handling the
nested response structures (e.g., `response.summary.stats.totalCommits`).

---

## Table of Contents

- [API Endpoint Changes](#api-endpoint-changes)
- [Detailed Endpoint Documentation](#detailed-endpoint-documentation)
  - [1. GET /api/repositories/commits](#1-get-apirepositoriescommits)
  - [2. GET /api/repositories/heatmap](#2-get-apirepositoriesheatmap)
  - [3. GET /api/repositories/contributors](#3-get-apirepositoriescontributors)
  - [4. GET /api/repositories/churn](#4-get-apirepositorieschurn)
  - [5. GET /api/repositories/summary](#5-get-apirepositoriessummary)
  - [6. GET /api/repositories/full-data](#6-get-apirepositories full-data)
- [Migration Patterns](#migration-patterns)
- [Query Parameter Guidelines](#query-parameter-guidelines)
- [Response Structure Changes](#response-structure-changes)
- [Error Handling](#error-handling)
- [Testing Recommendations](#testing-recommendations)
- [Common Pitfalls](#common-pitfalls)

---

## API Endpoint Changes

### Complete Endpoint Mapping

| **Old Endpoint** | **New Endpoint** | **Method** | **Key Differences** |
|------------------|------------------|------------|---------------------|
| `POST /api/repositories` | `GET /api/repositories/commits` | POST→GET | Pagination added |
| `POST /api/repositories/heatmap` | `GET /api/repositories/heatmap` | POST→GET | Query params |
| `POST /api/repositories/contributors` | `GET /api/repositories/contributors` | POST→GET | Filters |
| `POST /api/repositories/churn` | `GET /api/repositories/churn` | POST→GET | Churn filters |
| `POST /api/repositories/full-data` | `GET /api/repositories/full-data` | POST→GET | Pagination |
| `GET /api/repositories/summary` | `GET /api/repositories/summary` | No change | Improved caching |

---

## Detailed Endpoint Documentation

### 1. GET /api/repositories/commits

**Purpose**: Retrieve paginated commit history for a repository.

**Query Parameters**:

```typescript
{
  repoUrl: string;      // Required - Git repository URL
  page?: number;        // Optional - Page number (default: 1)
  limit?: number;       // Optional - Items per page (default: 100)
}
```

**Example Request**:

```bash
GET /api/repositories/commits?repoUrl=https://github.com/jonasyr/gitray.git&page=1&limit=50
```

**Response Structure**:

```typescript
{
  commits: Commit[];    // Array of commit objects
  page: number;         // Current page number
  limit: number;        // Items per page
}
```

**Sample Response**:

```json
{
  "commits": [
    {
      "sha": "abc123...",
      "message": "feat: add new feature",
      "author": {
        "name": "Jonas",
        "email": "jonas@example.com"
      },
      "date": "2024-12-01T10:30:00Z",
      "stats": {
        "additions": 150,
        "deletions": 30
      }
    }
  ],
  "page": 1,
  "limit": 50
}
```

**Migration Example**:

```typescript
// OLD (POST)
const response = await fetch('/api/repositories', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ repoUrl })
});

// NEW (GET)
const params = new URLSearchParams({
  repoUrl,
  page: '1',
  limit: '50'
});
const response = await fetch(`/api/repositories/commits?${params}`);
const { commits, page, limit } = await response.json();
```

---

### 2. GET /api/repositories/heatmap

**Purpose**: Retrieve commit activity heatmap data with optional filters.

**Query Parameters**:

```typescript
{
  repoUrl: string;      // Required - Git repository URL
  author?: string;      // Optional - Filter by single author
  authors?: string;     // Optional - Comma-separated author list
  fromDate?: string;    // Optional - Start date (ISO 8601)
  toDate?: string;      // Optional - End date (ISO 8601)
}
```

**Example Request**:

```bash
GET /api/repositories/heatmap?repoUrl=https://github.com/user/repo.git&fromDate=2024-01-01&toDate=2024-12-31
```

**Response Structure**:

```typescript
{
  heatmapData: {
    timePeriod: 'day' | 'week' | 'month';
    data: Array<{
      date: string;      // ISO 8601 date
      count: number;     // Commit count
      authors: number;   // Unique author count
    }>;
    metadata?: {
      totalCommits: number;
      dateRange: { start: string; end: string };
    };
  }
}
```

**Sample Response**:

```json
{
  "heatmapData": {
    "timePeriod": "day",
    "data": [
      { "date": "2024-01-01", "count": 5, "authors": 2 },
      { "date": "2024-01-02", "count": 3, "authors": 1 }
    ],
    "metadata": {
      "totalCommits": 480,
      "dateRange": {
        "start": "2024-01-01",
        "end": "2024-12-31"
      }
    }
  }
}
```

**Migration Example**:

```typescript
// OLD (POST with nested filterOptions)
const response = await fetch('/api/repositories/heatmap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    repoUrl,
    filterOptions: {
      author: 'john',
      fromDate: '2024-01-01',
      toDate: '2024-12-31'
    }
  })
});

// NEW (GET with flat query params)
const params = new URLSearchParams({ repoUrl });
if (author) params.append('author', author);
if (fromDate) params.append('fromDate', fromDate);
if (toDate) params.append('toDate', toDate);

const response = await fetch(`/api/repositories/heatmap?${params}`);
const { heatmapData } = await response.json();
```

---

### 3. GET /api/repositories/contributors

**Purpose**: Retrieve all unique contributors without statistics or ranking (GDPR-compliant).

**Query Parameters**:

```typescript
{
  repoUrl: string;      // Required - Git repository URL
  author?: string;      // Optional - Filter by single author
  authors?: string;     // Optional - Comma-separated author list
  fromDate?: string;    // Optional - Start date (ISO 8601)
  toDate?: string;      // Optional - End date (ISO 8601)
}
```

**Example Request**:

```bash
GET /api/repositories/contributors?repoUrl=https://github.com/user/repo.git&fromDate=2024-01-01
```

**Response Structure**:

```typescript
{
  contributors: Array<{
    login: string;  // Author name (GDPR-compliant pseudonymized identifier)
  }>
}
```

**Sample Response**:

```json
{
  "contributors": [
    { "login": "Alice" },
    { "login": "Bob" },
    { "login": "Charlie" }
  ]
}
```

**Migration Example**:

```typescript
// OLD (POST)
const response = await fetch('/api/repositories/contributors', {
  method: 'POST',
  body: JSON.stringify({ repoUrl, filterOptions })
});

// NEW (GET)
const params = new URLSearchParams({ repoUrl });
if (fromDate) params.append('fromDate', fromDate);
if (toDate) params.append('toDate', toDate);

const response = await fetch(`/api/repositories/contributors?${params}`);
const { contributors } = await response.json();
// Note: Contributors now contain only { login: string }, no statistics
```

**IMPORTANT CHANGES (Issue #121)**:

- Returns **all unique contributors**, not just top 5
- No commit counts, line statistics, or contribution percentages
- Alphabetically sorted for consistency
- Fully GDPR-compliant (only author names, no tracking metrics)

---

### 4. GET /api/repositories/churn

**Purpose**: Retrieve code churn analysis showing file change frequency.

**Query Parameters**:

```typescript
{
  repoUrl: string;       // Required - Git repository URL
  fromDate?: string;     // Optional - Analysis start date (ISO 8601)
  toDate?: string;       // Optional - Analysis end date (ISO 8601)
  minChanges?: string;   // Optional - Minimum changes filter (numeric)
  extensions?: string;   // Optional - Comma-separated file extensions (e.g., 'ts,tsx,js')
}
```

**Example Request**:

```bash
GET /api/repositories/churn?repoUrl=https://github.com/user/repo.git&minChanges=10&extensions=ts,tsx
```

**Response Structure**:

```typescript
{
  churnData: {
    files: Array<{
      path: string;
      additions: number;
      deletions: number;
      changes: number;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
    }>;
    summary: {
      totalFiles: number;
      highRiskFiles: number;
      averageChanges: number;
    };
    metadata: {
      dateRange: { start: string; end: string };
      filters: {
        minChanges?: number;
        extensions?: string[];
      };
    };
  }
}
```

**Sample Response**:

```json
{
  "churnData": {
    "files": [
      {
        "path": "src/services/cache.ts",
        "additions": 450,
        "deletions": 120,
        "changes": 570,
        "riskLevel": "high"
      }
    ],
    "summary": {
      "totalFiles": 87,
      "highRiskFiles": 12,
      "averageChanges": 45.3
    }
  }
}
```

**Migration Example**:

```typescript
// OLD (POST)
const response = await fetch('/api/repositories/churn', {
  method: 'POST',
  body: JSON.stringify({ repoUrl, filterOptions })
});

// NEW (GET with churn-specific params)
const params = new URLSearchParams({ repoUrl });
if (minChanges) params.append('minChanges', minChanges.toString());
if (extensions && extensions.length > 0) {
  params.append('extensions', extensions.join(','));
}
if (fromDate) params.append('fromDate', fromDate);

const response = await fetch(`/api/repositories/churn?${params}`);
const { churnData } = await response.json();
```

---

### 5. GET /api/repositories/summary

**Purpose**: Retrieve repository metadata and statistics.

**Query Parameters**:

```typescript
{
  repoUrl: string;      // Required - Git repository URL
}
```

**Example Request**:

```bash
GET /api/repositories/summary?repoUrl=https://github.com/jonasyr/gitray.git
```

**Response Structure**:

```typescript
{
  summary: {
    repository: {
      name: string;
      owner: string;
      url: string;
      platform: 'github' | 'gitlab' | 'bitbucket' | 'other';
      defaultBranch?: string;
    };
    created: {
      date: string;       // ISO 8601
      source: 'git-log' | 'github-api' | 'gitlab-api' | 'estimated';
    };
    age: {
      years: number;
      months: number;
      formatted: string;  // e.g., "2.5y"
    };
    lastCommit: {
      date: string;       // ISO 8601
      relativeTime: string; // e.g., "2 days ago"
      sha: string;
      author: string;
    };
    stats: {
      totalCommits: number;      // ⚠️ Important: nested under stats
      contributors: number;       // ⚠️ Important: nested under stats
      status: 'active' | 'inactive' | 'archived';
    };
    metadata: {
      cached: boolean;
      dataSource: 'git-sparse-clone' | 'cache';
      createdDateAccuracy: 'exact' | 'approximate';
      bandwidthSaved?: string;
      lastUpdated: string;  // ISO 8601
    };
  }
}
```

**Sample Response**:

```json
{
  "summary": {
    "repository": {
      "name": "gitray",
      "owner": "jonasyr",
      "url": "https://github.com/jonasyr/gitray.git",
      "platform": "github"
    },
    "stats": {
      "totalCommits": 480,
      "contributors": 6,
      "status": "active"
    },
    "lastCommit": {
      "date": "2024-12-02T08:15:00Z",
      "relativeTime": "2 hours ago",
      "sha": "abc123def456",
      "author": "Jonas"
    },
    "metadata": {
      "cached": true,
      "dataSource": "cache"
    }
  }
}
```

**⚠️ Critical Migration Note**:

```typescript
// ❌ WRONG - Old structure (will be undefined)
const totalCommits = response.totalCommits;
const contributors = response.totalContributors;

// ✅ CORRECT - New nested structure
const totalCommits = response.summary.stats.totalCommits;
const contributors = response.summary.stats.contributors;  // Note: field is 'contributors', not 'totalContributors'
```

---

### 6. GET /api/repositories/full-data

**Purpose**: Retrieve both commits and heatmap data in a single request with pagination and filters.

**Query Parameters**:

```typescript
{
  repoUrl: string;      // Required - Git repository URL
  page?: number;        // Optional - Page number (default: 1)
  limit?: number;       // Optional - Items per page (default: 100)
  author?: string;      // Optional - Filter by single author
  authors?: string;     // Optional - Comma-separated author list
  fromDate?: string;    // Optional - Start date (ISO 8601)
  toDate?: string;      // Optional - End date (ISO 8601)
}
```

**Example Request**:

```bash
GET /api/repositories/full-data?repoUrl=https://github.com/user/repo.git&page=1&limit=20&fromDate=2024-01-01
```

**Response Structure**:

```typescript
{
  commits: Commit[];        // Paginated commits
  heatmapData: CommitHeatmapData;  // Filtered heatmap data
  page: number;
  limit: number;
  isValidHeatmap: boolean;  // Backend validation flag
}
```

**Sample Response**:

```json
{
  "commits": [
    {
      "sha": "abc123",
      "message": "Initial commit",
      "author": { "name": "Jonas", "email": "jonas@example.com" },
      "date": "2024-01-01T10:00:00Z"
    }
  ],
  "heatmapData": {
    "timePeriod": "day",
    "data": [
      { "date": "2024-01-01", "count": 1, "authors": 1 }
    ]
  },
  "page": 1,
  "limit": 20,
  "isValidHeatmap": true
}
```

**Migration Example**:

```typescript
// OLD (POST)
const response = await fetch('/api/repositories/full-data', {
  method: 'POST',
  body: JSON.stringify({
    repoUrl,
    timePeriod: 'month',
    filterOptions: { fromDate, toDate }
  })
});

// NEW (GET)
const params = new URLSearchParams({
  repoUrl,
  page: '1',
  limit: '100'
});
if (fromDate) params.append('fromDate', fromDate);
if (toDate) params.append('toDate', toDate);

const response = await fetch(`/api/repositories/full-data?${params}`);
const { commits, heatmapData, page, limit } = await response.json();
```

---

## Migration Patterns

### Pattern 1: Basic POST → GET Migration

```typescript
// Before
async function fetchData(repoUrl: string) {
  const response = await apiClient.post('/api/repositories', { repoUrl });
  return response.data;
}

// After
async function fetchData(repoUrl: string) {
  const params = new URLSearchParams({ repoUrl });
  const response = await apiClient.get('/api/repositories/commits', { params });
  return response.data;
}
```

### Pattern 2: Handling Optional Filters

```typescript
function buildQueryParams(
  repoUrl: string,
  filters?: {
    author?: string;
    authors?: string[];
    fromDate?: string;
    toDate?: string;
  }
): URLSearchParams {
  const params = new URLSearchParams({ repoUrl });
  
  if (filters?.author) {
    params.append('author', filters.author);
  }
  
  if (filters?.authors && filters.authors.length > 0) {
    params.append('authors', filters.authors.join(','));
  }
  
  if (filters?.fromDate) {
    params.append('fromDate', filters.fromDate);
  }
  
  if (filters?.toDate) {
    params.append('toDate', filters.toDate);
  }
  
  return params;
}

// Usage
const params = buildQueryParams(repoUrl, { fromDate: '2024-01-01' });
const response = await fetch(`/api/repositories/heatmap?${params}`);
```

### Pattern 3: Pagination Helper

```typescript
interface PaginationParams {
  page?: number;
  limit?: number;
}

function addPaginationParams(
  params: URLSearchParams,
  pagination?: PaginationParams
): void {
  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 100;
  
  params.append('page', page.toString());
  params.append('limit', limit.toString());
}

// Usage
const params = new URLSearchParams({ repoUrl });
addPaginationParams(params, { page: 2, limit: 50 });
const response = await fetch(`/api/repositories/commits?${params}`);
```

### Pattern 4: Error Handling

```typescript
async function fetchWithErrorHandling<T>(
  endpoint: string,
  params: URLSearchParams
): Promise<T> {
  try {
    const response = await fetch(`${endpoint}?${params}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch ${endpoint}:`, error);
    throw error;
  }
}

// Usage
const params = new URLSearchParams({ repoUrl });
const data = await fetchWithErrorHandling('/api/repositories/summary', params);
```

---

## Query Parameter Guidelines

### Arrays (authors, extensions)

**Convert arrays to comma-separated strings**:

```typescript
// Array to comma-separated string
const authors = ['alice', 'bob', 'charlie'];
params.append('authors', authors.join(','));  // 'alice,bob,charlie'

const extensions = ['ts', 'tsx', 'js'];
params.append('extensions', extensions.join(','));  // 'ts,tsx,js'
```

### Dates (fromDate, toDate)

**Use ISO 8601 format**:

```typescript
// Correct date formats
params.append('fromDate', '2024-01-01');
params.append('toDate', '2024-12-31');

// Also accepts full ISO 8601
params.append('fromDate', '2024-01-01T00:00:00Z');
```

### Numbers (page, limit, minChanges)

**Convert numbers to strings**:

```typescript
params.append('page', page.toString());
params.append('limit', limit.toString());
params.append('minChanges', minChanges.toString());
```

### Conditional Parameters

**Only include defined values**:

```typescript
// Good - only includes defined values
if (author) params.append('author', author);
if (fromDate) params.append('fromDate', fromDate);

// Bad - includes undefined
params.append('author', author || '');  // ❌ Don't do this
```

---

## Response Structure Changes

### Summary Endpoint - Nested Stats

**Critical**: The `summary` endpoint now returns deeply nested data.

```typescript
// ❌ WRONG - Old pattern (undefined)
interface OldResponse {
  totalCommits: number;
  totalContributors: number;
  status: string;
}

// ✅ CORRECT - New pattern
interface NewResponse {
  summary: {
    repository: { name: string; owner: string; url: string; platform: string };
    stats: {
      totalCommits: number;      // Access via response.summary.stats.totalCommits
      contributors: number;       // Note: 'contributors' not 'totalContributors'
      status: string;
    };
    lastCommit: { date: string; sha: string; author: string };
    metadata: { cached: boolean };
  };
}

// Migration example
function getTotalCommits(response: NewResponse): number {
  return response.summary?.stats?.totalCommits ?? 0;
}
```

### Heatmap Data - Always an Object

```typescript
// Backend returns this structure
interface HeatmapResponse {
  heatmapData: {
    timePeriod: string;
    data: Array<{ date: string; count: number }>;
    metadata?: { totalCommits: number };
  };
}

// Access pattern
const dataPoints = response.heatmapData.data.length;
const totalCommits = response.heatmapData.metadata?.totalCommits;
```

### Full-Data - Validation Flag

```typescript
interface FullDataResponse {
  commits: Commit[];
  heatmapData: CommitHeatmapData;
  isValidHeatmap: boolean;  // Backend validation result
}

// Always check validation flag
if (response.isValidHeatmap) {
  renderHeatmap(response.heatmapData);
} else {
  console.warn('Invalid heatmap data structure');
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| `400` | Bad Request | Missing `repoUrl`, invalid date format, invalid URL |
| `404` | Not Found | Wrong endpoint path, typo in URL |
| `422` | Validation Error | Invalid query parameter values |
| `500` | Server Error | Cache failure, Git operation error |
| `504` | Gateway Timeout | Large repository taking too long |

### Validation Errors

```typescript
// Example validation error response
{
  "error": "Validation failed",
  "details": [
    {
      "field": "repoUrl",
      "message": "Invalid URL format"
    },
    {
      "field": "fromDate",
      "message": "Invalid date format, use YYYY-MM-DD"
    }
  ]
}
```

### Error Handling Pattern

```typescript
async function handleApiCall<T>(
  endpoint: string,
  params: URLSearchParams
): Promise<T | null> {
  try {
    const response = await fetch(`${endpoint}?${params}`);
    
    if (response.status === 400) {
      const error = await response.json();
      console.error('Validation error:', error.details);
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    return null;
  }
}
```

---

## Testing Recommendations

### 1. Test with Real Repository

Use the GitRay repository for testing:

```bash
curl "http://localhost:3001/api/repositories/summary?repoUrl=https://github.com/jonasyr/gitray.git"
```

**Expected Results**:

- `stats.totalCommits`: 480
- `stats.contributors`: 6
- `stats.status`: "active"

### 2. Test Pagination

```bash
# Page 1
curl "http://localhost:3001/api/repositories/commits?repoUrl=https://github.com/jonasyr/gitray.git&page=1&limit=10"

# Page 2
curl "http://localhost:3001/api/repositories/commits?repoUrl=https://github.com/jonasyr/gitray.git&page=2&limit=10"
```

### 3. Test Filters

```bash
# Date range filter
curl "http://localhost:3001/api/repositories/heatmap?repoUrl=https://github.com/jonasyr/gitray.git&fromDate=2024-01-01&toDate=2024-12-31"

# Author filter
curl "http://localhost:3001/api/repositories/contributors?repoUrl=https://github.com/jonasyr/gitray.git&author=jonas"

# Multiple authors
curl "http://localhost:3001/api/repositories/heatmap?repoUrl=https://github.com/jonasyr/gitray.git&authors=jonas,contributor2"
```

### 4. Test Error Cases

```bash
# Missing repoUrl
curl "http://localhost:3001/api/repositories/summary"
# Expected: HTTP 400

# Invalid date
curl "http://localhost:3001/api/repositories/heatmap?repoUrl=https://github.com/jonasyr/gitray.git&fromDate=invalid"
# Expected: HTTP 400
```

### 5. Automated Test Checklist

- [ ] All endpoints return HTTP 200 with valid params
- [ ] Pagination works correctly (page 1, 2, 3)
- [ ] Date filters reduce result set appropriately
- [ ] Author filters return subset of commits
- [ ] Multiple authors filter works (comma-separated)
- [ ] Invalid parameters return HTTP 400
- [ ] Missing `repoUrl` returns HTTP 400
- [ ] Response structures match documented types
- [ ] `summary.stats.totalCommits` accessible and correct
- [ ] Heatmap data has `timePeriod` and `data` fields
- [ ] Full-data returns both `commits` and `heatmapData`

---

## Common Pitfalls

### 1. Using POST Instead of GET

```typescript
// ❌ WRONG - Will get HTTP 404
fetch('/api/repositories/commits', {
  method: 'POST',
  body: JSON.stringify({ repoUrl })
});

// ✅ CORRECT
const params = new URLSearchParams({ repoUrl });
fetch(`/api/repositories/commits?${params}`);
```

### 2. Accessing Top-Level Fields in Summary

```typescript
// ❌ WRONG - Returns undefined
const commits = response.totalCommits;

// ✅ CORRECT - Access nested field
const commits = response.summary.stats.totalCommits;
```

### 3. Incorrect Field Name

```typescript
// ❌ WRONG - Field doesn't exist
const count = response.summary.stats.totalContributors;

// ✅ CORRECT - Field is 'contributors'
const count = response.summary.stats.contributors;
```

### 4. Arrays as JSON in Query Params

```typescript
// ❌ WRONG - Don't stringify arrays
params.append('authors', JSON.stringify(['alice', 'bob']));

// ✅ CORRECT - Comma-separated string
params.append('authors', ['alice', 'bob'].join(','));
```

### 5. Not Handling Optional Parameters

```typescript
// ❌ WRONG - Includes undefined
params.append('author', author);  // If author is undefined

// ✅ CORRECT - Conditional inclusion
if (author) params.append('author', author);
```

### 6. Incorrect Date Format

```typescript
// ❌ WRONG - Invalid format
params.append('fromDate', '12/01/2024');

// ✅ CORRECT - ISO 8601 format
params.append('fromDate', '2024-12-01');
```

---

## Performance Considerations

### Cache Behavior

The backend uses multi-tier caching:

- **Memory tier**: ~1ms response time
- **Disk tier**: ~10-50ms response time
- **Redis tier**: ~50-100ms response time
- **Git clone**: 5-30 seconds (first request only)

**Recommendations**:

- First request will be slow (Git clone)
- Subsequent requests with same parameters are fast (cache hit)
- Different filter combinations create separate cache entries
- Don't make unnecessary duplicate requests

### Pagination Best Practices

```typescript
// Good - Use reasonable page sizes
const limit = 50;  // ✅ Balanced

// Avoid - Too small or too large
const limit = 1;   // ❌ Too many requests
const limit = 10000;  // ❌ Memory issues
```

---

## Summary Checklist

Use this checklist when migrating your frontend:

### Endpoints

- [ ] Changed all POST requests to GET
- [ ] Updated endpoint paths (`/repositories` → `/repositories/commits`)
- [ ] Moved request body to query parameters

### Parameters

- [ ] Arrays converted to comma-separated strings
- [ ] Dates in ISO 8601 format (`YYYY-MM-DD`)
- [ ] Numbers converted to strings for query params
- [ ] Conditional parameters only included if defined

### Response Handling

- [ ] Updated to access `response.summary.stats.totalCommits`
- [ ] Using `contributors` instead of `totalContributors`
- [ ] Handling nested `summary` object structure
- [ ] Validating `isValidHeatmap` flag in full-data endpoint

### Error Management

- [ ] Handling HTTP 400 for validation errors
- [ ] Handling HTTP 404 for incorrect endpoints
- [ ] Graceful degradation on server errors
- [ ] Logging errors for debugging

### Testing

- [ ] Tested all endpoints with valid parameters
- [ ] Tested pagination (multiple pages)
- [ ] Tested filters (author, date range)
- [ ] Tested error cases (missing params, invalid format)
- [ ] Verified response structures match documented types

---

## Additional Resources

- **Backend Repository Routes**: `apps/backend/src/routes/repositoryRoutes.ts`
- **Shared Types Package**: `packages/shared-types/src/index.ts`
- **API Test Script**: `test-api-phase1.sh`
- **Test Scenarios Documentation**: `scripts/api_test_scenarios.md`

---

## Questions or Issues?

If you encounter problems during migration:

1. **Check backend logs** - Detailed error messages are logged
2. **Verify query parameters** - Use browser DevTools Network tab
3. **Test with curl** - Isolate frontend vs backend issues
4. **Review response structure** - Compare against documented types
5. **Check SonarQube** - Code quality issues may surface

For the most up-to-date backend implementation, always refer to the source code in `apps/backend/src/routes/repositoryRoutes.ts`.
