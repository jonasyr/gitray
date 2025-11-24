<!-- markdownlint-disable -->
# API Migration Guide: Repository Routes Refactoring

## Overview

The repository routes have been refactored to use the unified multi-tier cache service and align with RESTful conventions. This document outlines the breaking changes and provides migration examples.

## Breaking Changes Summary

⚠️ **BREAKING CHANGES**: All repository endpoints have changed from POST to GET, and parameters have moved from request body to query strings.

### Affected Endpoints

| Old Endpoint | New Endpoint | Status |
|--------------|--------------|--------|
| `POST /api/repositories` | `GET /api/repositories/commits` | ✅ Migrated |
| `POST /api/repositories/heatmap` | `GET /api/repositories/heatmap` | ✅ Migrated |
| `POST /api/repositories/contributors` | `GET /api/repositories/contributors` | ✅ Migrated |
| `POST /api/repositories/churn` | `GET /api/repositories/churn` | ✅ Migrated |
| `GET /api/repositories/summary` | `GET /api/repositories/summary` | ✅ Updated (no breaking change in HTTP method) |
| `POST /api/repositories/full-data` | `GET /api/repositories/full-data` | ✅ Migrated |

---

## Migration Examples

### 1. Get Repository Commits

#### Old (POST with body):
```bash
curl -X POST http://localhost:3001/api/repositories \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/user/repo"}'
```

#### New (GET with query params):
```bash
curl "http://localhost:3001/api/repositories/commits?repoUrl=https://github.com/user/repo&page=1&limit=100"
```

#### JavaScript/TypeScript Migration:
```typescript
// OLD
const response = await fetch('/api/repositories', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ repoUrl: 'https://github.com/user/repo' })
});

// NEW
const params = new URLSearchParams({
  repoUrl: 'https://github.com/user/repo',
  page: '1',
  limit: '100'
});
const response = await fetch(`/api/repositories/commits?${params}`);
```

#### New Features:
- ✨ Pagination support (`page`, `limit`)
- ✨ Automatic multi-tier caching
- ✨ Better browser caching support

---

### 2. Get Heatmap Data

#### Old (POST with body):
```bash
curl -X POST http://localhost:3001/api/repositories/heatmap \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/user/repo",
    "filterOptions": {
      "author": "john",
      "fromDate": "2023-01-01",
      "toDate": "2023-12-31"
    }
  }'
```

#### New (GET with query params):
```bash
curl "http://localhost:3001/api/repositories/heatmap?repoUrl=https://github.com/user/repo&author=john&fromDate=2023-01-01&toDate=2023-12-31"
```

#### JavaScript/TypeScript Migration:
```typescript
// OLD
const response = await fetch('/api/repositories/heatmap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    repoUrl: 'https://github.com/user/repo',
    filterOptions: { author: 'john', fromDate: '2023-01-01', toDate: '2023-12-31' }
  })
});

// NEW
const params = new URLSearchParams({
  repoUrl: 'https://github.com/user/repo',
  author: 'john',
  fromDate: '2023-01-01',
  toDate: '2023-12-31'
});
const response = await fetch(`/api/repositories/heatmap?${params}`);
```

---

### 3. Get Top Contributors

#### Old (POST with body):
```bash
curl -X POST http://localhost:3001/api/repositories/contributors \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/user/repo",
    "filterOptions": {
      "fromDate": "2023-01-01",
      "toDate": "2023-12-31"
    }
  }'
```

#### New (GET with query params):
```bash
curl "http://localhost:3001/api/repositories/contributors?repoUrl=https://github.com/user/repo&fromDate=2023-01-01&toDate=2023-12-31"
```

---

### 4. Get Code Churn Analysis

#### Old (POST with body):
```bash
curl -X POST http://localhost:3001/api/repositories/churn \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/user/repo",
    "filterOptions": {
      "minChanges": 10,
      "extensions": ["ts", "js"]
    }
  }'
```

#### New (GET with query params):
```bash
curl "http://localhost:3001/api/repositories/churn?repoUrl=https://github.com/user/repo&minChanges=10&extensions=ts,js"
```

**Note**: Arrays are now comma-separated strings in query parameters.

---

### 5. Get Repository Summary

✅ **No Breaking Change** - Already used GET method

#### Usage remains the same:
```bash
curl "http://localhost:3001/api/repositories/summary?repoUrl=https://github.com/user/repo"
```

**Changed internally**: Now uses unified cache service for consistency.

---

### 6. Get Full Data (Commits + Heatmap)

#### Old (POST with body):
```bash
curl -X POST http://localhost:3001/api/repositories/full-data \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/user/repo",
    "filterOptions": {
      "fromDate": "2023-01-01"
    }
  }'
```

#### New (GET with query params):
```bash
curl "http://localhost:3001/api/repositories/full-data?repoUrl=https://github.com/user/repo&page=1&limit=100&fromDate=2023-01-01"
```

---

## New Query Parameter Schema

### Common Parameters (All Routes)

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `repoUrl` | string | Yes | Git repository URL (https only) | `https://github.com/user/repo` |

### Pagination Parameters (Commits, Full-Data)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | integer | No | 1 | Page number (1-1000) |
| `limit` | integer | No | 100 | Items per page (1-100) |

### Filter Parameters (Heatmap, Contributors, Full-Data)

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `author` | string | No | Filter by specific author | `john` |
| `authors` | string | No | Comma-separated list of authors (max 10) | `john,jane,bob` |
| `fromDate` | string (ISO 8601) | No | Start date filter | `2023-01-01` |
| `toDate` | string (ISO 8601) | No | End date filter | `2023-12-31` |

### Churn Analysis Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `minChanges` | integer | No | Minimum changes to include (1-1000) | `10` |
| `extensions` | string | No | Comma-separated file extensions (max 20) | `ts,js,tsx` |

---

## Benefits of the New Architecture

### 1. **Unified Multi-Tier Caching**
- **Before**: Manual Redis get/set in each route
- **After**: Automatic three-tier caching (memory → disk → Redis)
- **Impact**: Better cache hit rates, reduced Git operations

### 2. **RESTful Design**
- **Before**: Using POST for read operations
- **After**: GET endpoints that follow HTTP semantics
- **Impact**: Better browser caching, CDN compatibility, bookmark-ability

### 3. **Repository Coordination**
- **Before**: Duplicate repository clones for concurrent requests
- **After**: Shared repository access prevents duplicate clones
- **Impact**: Reduced disk usage and clone overhead

### 4. **Transactional Cache Consistency**
- **Before**: Race conditions could corrupt cache state
- **After**: Atomic cache updates with automatic rollback
- **Impact**: Guaranteed cache consistency

### 5. **Enhanced Error Handling**
- **Before**: Silent cache failures
- **After**: Structured logging and graceful degradation
- **Impact**: Better observability and reliability

---

## Validation Changes

### Enhanced Security Validation

All endpoints now include comprehensive validation:

✅ **URL Validation**
- Protocol must be `http://` or `https://`
- URL must be properly formatted
- Security checks via `isSecureGitUrl`

✅ **Date Validation**
- Must be valid ISO 8601 format
- `fromDate` cannot be in the future
- `toDate` must be after `fromDate`

✅ **Pagination Validation**
- Page: 1-1000
- Limit: 1-100

✅ **Author Validation**
- Author name: 1-100 characters
- Multiple authors: max 10, comma-separated
- XSS protection via input sanitization

---

## Error Response Format

Validation errors now return a consistent format:

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "type": "field",
      "value": "",
      "msg": "repoUrl query parameter is required",
      "path": "repoUrl",
      "location": "query"
    }
  ]
}
```

---

## Caching Behavior

### Cache Key Strategy

#### Old (Manual):
```typescript
const key = `commits:${repoUrl}`;
```

#### New (Unified):
```typescript
// Automatically generates hierarchical keys:
// - raw_commits:${hash(repoUrl)}
// - filtered_commits:${hash(repoUrl)}:${hash(filters)}
// - aggregated_data:${hash(repoUrl)}:${hash(filters)}
```

### Cache Invalidation

To invalidate cache for a repository:

```bash
curl -X POST http://localhost:3001/api/commits/cache/invalidate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"repoUrl": "https://github.com/user/repo"}'
```

This will clear all three cache tiers for the repository.

---

## Performance Expectations

### Cache Hit Scenarios

| Scenario | Before | After |
|----------|--------|-------|
| First request | Clone + Process | Clone + Process (same) |
| Second identical request | Redis hit (fast) | Memory hit (faster) |
| Filtered request | Clone + Process | Reuse raw commits (faster) |
| Concurrent requests | Multiple clones | Single clone (much faster) |

### Memory Allocation

The unified cache distributes memory across tiers:
- **Raw commits**: 50% of cache memory
- **Filtered commits**: 30% of cache memory
- **Aggregated data**: 20% of cache memory

---

## Frontend Migration Checklist

- [ ] Update all `POST /api/repositories/*` calls to `GET /api/repositories/*`
- [ ] Move request body parameters to query string
- [ ] Update parameter names (e.g., `filterOptions.author` → `author`)
- [ ] Convert arrays to comma-separated strings (e.g., `['ts', 'js']` → `'ts,js'`)
- [ ] Add pagination handling for commits and full-data endpoints
- [ ] Update error handling to expect new validation error format
- [ ] Test with different filter combinations
- [ ] Update API client type definitions

---

## Rollback Strategy

If you need to temporarily revert to the old API:

1. The old implementation is preserved in git history
2. You can create a compatibility layer that translates GET→POST internally
3. Or deploy both versions side-by-side with different URL prefixes

**Recommended**: Plan a coordinated frontend + backend deployment to minimize disruption.

---

## Questions?

For questions or issues, please:
1. Check the [API Documentation](./docs/API.md)
2. Review the [Caching System Architecture](https://deepwiki.com/jonasyr/gitray/4-caching-system)
3. Open an issue on GitHub

---

## Implementation Reference

- **Cache Service**: `apps/backend/src/services/repositoryCache.ts`
- **Refactored Routes**: `apps/backend/src/routes/repositoryRoutes.ts`
- **Tests**: `apps/backend/__tests__/unit/routes/repositoryRoutes.refactored.unit.test.ts`
