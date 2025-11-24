<!-- markdownlint-disable -->
# GitRay API curl Reference Guide

Complete reference for testing all GitRay API endpoints using curl commands.

## Table of Contents

- [Key Finding: Why Manual curl Doesn't Work](#key-finding-why-manual-curl-doesnt-work)
- [Required Headers](#required-headers)
- [Health Check Endpoints](#health-check-endpoints)
- [Commit Routes](#commit-routes)
- [Commit Streaming](#commit-streaming)
- [Cache Management](#cache-management)
- [Repository Routes](#repository-routes)
- [Repository Summary](#repository-summary)
- [Resume State Management](#resume-state-management)
- [Testing Examples](#testing-examples)
- [Validation Rules](#validation-rules)
- [Cache Headers](#cache-headers)
- [Quick Test Script](#quick-test-script)

---

## Key Finding: Why Manual curl Doesn't Work

The backend has a **`strictContentType` middleware** (apps/backend/src/index.ts:193) that enforces specific headers for POST requests to `/api/repositories` and `/api/commits`.

### Frontend Headers (Required for Success)

```typescript
'Content-Type': 'application/json'
'X-Requested-With': 'XMLHttpRequest'
```

**Without the `X-Requested-With: XMLHttpRequest` header, your manual curl requests will fail!**

---

## Required Headers

For all POST requests to `/api/repositories` and `/api/commits` routes:

```bash
-H "Content-Type: application/json"
-H "X-Requested-With: XMLHttpRequest"
```

For admin endpoints (when `ADMIN_AUTH_ENABLED=true`):

```bash
-H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## Health Check Endpoints

No special headers required for health checks.

### Basic Health Check

```bash
curl -X GET http://localhost:3001/health
```

### Detailed Health (Cache + Coordination Info)

```bash
curl -X GET http://localhost:3001/health/detailed
```

### Memory Pressure Monitoring

```bash
curl -X GET http://localhost:3001/health/memory
```

### Kubernetes Liveness Probe

```bash
curl -X GET http://localhost:3001/health/live
```

### Kubernetes Readiness Probe

```bash
curl -X GET http://localhost:3001/health/ready
```

### Coordination System Health

```bash
curl -X GET http://localhost:3001/coordination
```

---

## Commit Routes

All commit routes use GET with query parameters and require headers.

### Get Paginated Commits

```bash
curl -X GET "http://localhost:3001/api/commits?repoUrl=https://github.com/user/repo.git&page=1&limit=100" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest"
```

**Query Parameters:**
- `repoUrl` (required): Git repository URL ending with `.git`
- `page` (optional): Page number (1-1000, default: 1)
- `limit` (optional): Items per page (1-100, default: 100)
- `useStreaming` (optional): Force streaming mode (`true`/`false`)

### Get Commit Heatmap

```bash
curl -X GET "http://localhost:3001/api/commits/heatmap?repoUrl=https://github.com/user/repo.git&fromDate=2024-01-01T00:00:00.000Z&toDate=2024-12-31T23:59:59.999Z" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest"
```

**Query Parameters:**
- `repoUrl` (required): Git repository URL
- `fromDate` (optional): ISO 8601 date string
- `toDate` (optional): ISO 8601 date string
- `author` (optional): Single author name
- `authors` (optional): Comma-separated author names (max 10)

### Heatmap with Author Filter

```bash
curl -X GET "http://localhost:3001/api/commits/heatmap?repoUrl=https://github.com/user/repo.git&author=john" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest"
```

### Heatmap with Multiple Authors

```bash
curl -X GET "http://localhost:3001/api/commits/heatmap?repoUrl=https://github.com/user/repo.git&authors=john,jane,bob" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest"
```

### Get Repository Info

```bash
curl -X GET "http://localhost:3001/api/commits/info?repoUrl=https://github.com/user/repo.git" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest"
```

Returns repository metadata, coordination metrics, and cache information.

### Get File Analysis (File Type Distribution)

```bash
curl -X GET "http://localhost:3001/api/commits/file-analysis?repoUrl=https://github.com/user/repo.git" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest"
```

**Query Parameters:**
- `repoUrl` (required): Git repository URL
- `extensions` (optional): Comma-separated extensions with dot prefix (max 50)
- `categories` (optional): Comma-separated categories (max 5)
- `includeHidden` (optional): Include hidden files (`true`/`false`)
- `maxDepth` (optional): Max directory depth (1-20)

### File Analysis with Filters

```bash
curl -X GET "http://localhost:3001/api/commits/file-analysis?repoUrl=https://github.com/user/repo.git&extensions=.js,.ts&includeHidden=false&maxDepth=10" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest"
```

### File Analysis by Categories

Valid categories: `code`, `documentation`, `configuration`, `assets`, `other`

```bash
curl -X GET "http://localhost:3001/api/commits/file-analysis?repoUrl=https://github.com/user/repo.git&categories=code,documentation" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest"
```

---

## Commit Streaming

Streaming endpoints return NDJSON (newline-delimited JSON) for large repositories.

### Stream Commits (Default Settings)

```bash
curl -X POST http://localhost:3001/api/commits/stream \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{
    "repoUrl": "https://github.com/user/repo.git"
  }'
```

### Stream with Custom Batch Size

```bash
curl -X POST http://localhost:3001/api/commits/stream \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{
    "repoUrl": "https://github.com/user/repo.git",
    "batchSize": 500,
    "maxCommits": 10000
  }'
```

**Body Parameters:**
- `repoUrl` (required): Git repository URL
- `batchSize` (optional): Commits per batch (1-10000, default: 1000)
- `maxCommits` (optional): Maximum commits to stream
- `resumeFromSha` (optional): 40-character commit SHA to resume from

### Stream with Resume Capability

```bash
curl -X POST http://localhost:3001/api/commits/stream \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{
    "repoUrl": "https://github.com/user/repo.git",
    "resumeFromSha": "abc123def456789012345678901234567890abcd"
  }'
```

---

## Cache Management

Admin endpoints require authentication when `ADMIN_AUTH_ENABLED=true` in `.env`.

### Get Cache Statistics

```bash
curl -X GET http://localhost:3001/api/commits/cache/stats \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Returns detailed cache statistics including:
- Hit ratios (raw commits, filtered commits, aggregated data, overall)
- Memory usage
- Cache entries count
- Coordination metrics

### Invalidate Repository Cache

```bash
curl -X POST http://localhost:3001/api/commits/cache/invalidate \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "repoUrl": "https://github.com/user/repo.git"
  }'
```

Clears all cache layers for the specified repository.

### List All Cached Repositories

```bash
curl -X GET http://localhost:3001/api/commits/cache/repositories \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Returns list of all cached repositories with:
- Repository URL
- Age in minutes
- Last accessed timestamp
- Cache utilization percentage

---

## Repository Routes

All repository routes use POST with JSON body.

### Get Repository Commits

```bash
curl -X POST http://localhost:3001/api/repositories \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{
    "repoUrl": "https://github.com/user/repo.git"
  }'
```

### Get Commit Heatmap (Aggregated by Time)

```bash
curl -X POST http://localhost:3001/api/repositories/heatmap \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{
    "repoUrl": "https://github.com/user/repo.git",
    "filterOptions": {
      "fromDate": "2024-01-01T00:00:00.000Z",
      "toDate": "2024-12-31T23:59:59.999Z"
    }
  }'
```

### Heatmap with Author Filter

```bash
curl -X POST http://localhost:3001/api/repositories/heatmap \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{
    "repoUrl": "https://github.com/user/repo.git",
    "filterOptions": {
      "author": "john",
      "fromDate": "2024-01-01T00:00:00.000Z"
    }
  }'
```

### Get Top Contributors

```bash
curl -X POST http://localhost:3001/api/repositories/contributors \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{
    "repoUrl": "https://github.com/user/repo.git"
  }'
```

### Contributors with Date Filter

```bash
curl -X POST http://localhost:3001/api/repositories/contributors \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{
    "repoUrl": "https://github.com/user/repo.git",
    "filterOptions": {
      "fromDate": "2024-01-01T00:00:00.000Z",
      "toDate": "2024-12-31T23:59:59.999Z"
    }
  }'
```

### Get Code Churn Analysis

```bash
curl -X POST http://localhost:3001/api/repositories/churn \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{
    "repoUrl": "https://github.com/user/repo.git",
    "filterOptions": {
      "limit": 50
    }
  }'
```

Analyzes file change frequency to identify frequently modified files.

### Get Full Data (Commits + Heatmap)

Optimized endpoint that returns both commits and heatmap in a single request.

```bash
curl -X POST http://localhost:3001/api/repositories/full-data \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{
    "repoUrl": "https://github.com/user/repo.git",
    "timePeriod": "month",
    "filterOptions": {
      "fromDate": "2024-01-01T00:00:00.000Z"
    }
  }'
```

**Body Parameters:**
- `repoUrl` (required): Git repository URL
- `timePeriod` (optional): Aggregation period (`day`, `week`, `month`, `year`)
- `filterOptions` (optional): Filter object with dates, authors, etc.

---

## Repository Summary

Get lightweight repository metadata.

```bash
curl -X GET "http://localhost:3001/api/repositories/summary?repoUrl=https://github.com/user/repo.git" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest"
```

Returns:
- Total commits
- Total contributors
- Date range
- Primary language
- Repository size category
- Cache status

---

## Resume State Management

For interrupted streaming operations.

### Get Resume State

```bash
curl -X GET "http://localhost:3001/api/commits/resume/path%2Fto%2Frepo" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest"
```

Note: URL encode the repository path in the URL.

### Clear Resume State

```bash
curl -X POST http://localhost:3001/api/commits/resume/clear \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{
    "repoPath": "path/to/repo"
  }'
```

---

## Testing Examples

### Example 1: Quick Health Check

```bash
curl -X GET http://localhost:3001/health | jq
```

### Example 2: Real Repository (Linux Kernel)

```bash
REPO="https://github.com/torvalds/linux.git"

# Get summary
curl -X GET "http://localhost:3001/api/repositories/summary?repoUrl=${REPO}" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" | jq

# Get first 10 commits
curl -X GET "http://localhost:3001/api/commits?repoUrl=${REPO}&page=1&limit=10" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" | jq

# Get file analysis
curl -X GET "http://localhost:3001/api/commits/file-analysis?repoUrl=${REPO}" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" | jq
```

### Example 3: Full Data with Filters

```bash
curl -X POST http://localhost:3001/api/repositories/full-data \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{
    "repoUrl": "https://github.com/facebook/react.git",
    "timePeriod": "week",
    "filterOptions": {
      "fromDate": "2024-01-01T00:00:00.000Z",
      "toDate": "2024-12-31T23:59:59.999Z"
    }
  }' | jq
```

---

## Validation Rules

The backend enforces strict validation:

### URL Validation
- Must be valid HTTP/HTTPS URL
- Must end with `.git`
- Protocol required (`http://` or `https://`)
- Must pass security checks (no localhost, private IPs in production)

### Pagination
- `page`: 1-1000
- `limit`: 1-100

### Dates
- Must be ISO 8601 format: `YYYY-MM-DDTHH:mm:ss.sssZ`
- `fromDate` cannot be in the future
- `toDate` must be after `fromDate`
- `toDate` cannot be in the future

### Authors
- `author`: 1-100 characters
- `authors`: Max 10 comma-separated values

### File Analysis
- `extensions`: Max 50 comma-separated values with dot prefix (e.g., `.js,.ts`)
- `categories`: Valid values: `code`, `documentation`, `configuration`, `assets`, `other`
- `maxDepth`: 1-20

### Streaming
- `batchSize`: 1-10000
- `resumeFromSha`: Must be 40-character hexadecimal string

---

## Cache Headers

The backend returns cache performance headers:

```bash
# Use -v flag to see response headers
curl -v -X GET "http://localhost:3001/api/commits?repoUrl=https://github.com/user/repo.git" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest"
```

### Response Headers

| Header | Values | Description |
|--------|--------|-------------|
| `X-Cache-Status` | `HIT`, `MISS`, `PARTIAL` | Cache hit status |
| `X-Cache-Level` | `UNIFIED`, `AGGREGATED`, `FILTERED`, `RAW`, `SOURCE` | Which cache level was used |
| `X-Cache-Hit-Ratio` | `0.0` - `1.0` | Overall cache efficiency |
| `X-Repository-Size` | `small`, `medium`, `large`, `xlarge` | Repository size category |
| `X-Repository-Cached` | `true`, `false` | Is repository cached on disk |
| `X-Repository-Shared` | `true`, `false` | Is repository shared between requests |
| `X-Coordination-Enabled` | `true`, `false` | Is coordination system active |
| `X-Streaming-Mode` | `enabled`, `disabled` | Streaming mode status |

### Cache Performance Interpretation

- `X-Cache-Hit-Ratio > 0.8`: Excellent cache performance
- `X-Cache-Hit-Ratio 0.3-0.8`: Partial cache hits
- `X-Cache-Hit-Ratio < 0.3`: Cache mostly bypassed

---

## Quick Test Script

Save as `test-gitray-api.sh`:

```bash
#!/bin/bash

# Configuration
BASE_URL="http://localhost:3001"
REPO_URL="https://github.com/torvalds/linux.git"
SMALL_REPO="https://github.com/developit/htm.git"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== GitRay API Test Suite ===${NC}\n"

# Test 1: Health Check
echo -e "${GREEN}1. Basic Health Check${NC}"
curl -s $BASE_URL/health | jq
echo ""

# Test 2: Detailed Health
echo -e "${GREEN}2. Detailed Health (Cache + Coordination)${NC}"
curl -s $BASE_URL/health/detailed | jq
echo ""

# Test 3: Memory Health
echo -e "${GREEN}3. Memory Pressure Status${NC}"
curl -s $BASE_URL/health/memory | jq
echo ""

# Test 4: Coordination Health
echo -e "${GREEN}4. Coordination System Health${NC}"
curl -s $BASE_URL/coordination | jq
echo ""

# Test 5: Repository Summary
echo -e "${GREEN}5. Repository Summary${NC}"
curl -s -X GET "${BASE_URL}/api/repositories/summary?repoUrl=${SMALL_REPO}" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" | jq
echo ""

# Test 6: Get Commits (Paginated)
echo -e "${GREEN}6. Get Commits (Page 1, Limit 5)${NC}"
curl -s -X GET "${BASE_URL}/api/commits?repoUrl=${SMALL_REPO}&page=1&limit=5" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" | jq '.commits[] | {hash: .hash, message: .message, author: .author}'
echo ""

# Test 7: Repository Info
echo -e "${GREEN}7. Repository Info with Coordination Metrics${NC}"
curl -s -X GET "${BASE_URL}/api/commits/info?repoUrl=${SMALL_REPO}" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" | jq
echo ""

# Test 8: File Analysis
echo -e "${GREEN}8. File Type Distribution Analysis${NC}"
curl -s -X GET "${BASE_URL}/api/commits/file-analysis?repoUrl=${SMALL_REPO}" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" | jq '.distribution[] | {extension: .extension, count: .count, percentage: .percentage}'
echo ""

# Test 9: Contributors
echo -e "${GREEN}9. Top Contributors${NC}"
curl -s -X POST "${BASE_URL}/api/repositories/contributors" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d "{\"repoUrl\": \"${SMALL_REPO}\"}" | jq '.contributors[] | {name: .name, commitCount: .commitCount}'
echo ""

# Test 10: Code Churn
echo -e "${GREEN}10. Code Churn Analysis (Top 10 Files)${NC}"
curl -s -X POST "${BASE_URL}/api/repositories/churn" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d "{\"repoUrl\": \"${SMALL_REPO}\", \"filterOptions\": {\"limit\": 10}}" | jq '.churnData.files[] | {path: .path, changes: .changes}'
echo ""

# Test 11: Heatmap with Date Filter
echo -e "${GREEN}11. Commit Heatmap (Last 6 Months)${NC}"
FROM_DATE=$(date -u -d '6 months ago' +%Y-%m-%dT%H:%M:%S.000Z)
TO_DATE=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
curl -s -X GET "${BASE_URL}/api/commits/heatmap?repoUrl=${SMALL_REPO}&fromDate=${FROM_DATE}&toDate=${TO_DATE}" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" | jq '.metadata'
echo ""

# Test 12: Cache Statistics (Admin)
echo -e "${GREEN}12. Cache Statistics (if admin auth disabled)${NC}"
curl -s -X GET "${BASE_URL}/api/commits/cache/stats" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" 2>/dev/null | jq || echo -e "${RED}Admin authentication required${NC}"
echo ""

# Test 13: Full Data Request
echo -e "${GREEN}13. Full Data (Commits + Heatmap)${NC}"
curl -s -X POST "${BASE_URL}/api/repositories/full-data" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d "{\"repoUrl\": \"${SMALL_REPO}\", \"timePeriod\": \"month\"}" | jq '{commitCount: (.commits | length), heatmapPoints: (.heatmapData.data | length)}'
echo ""

# Test 14: Cache Headers
echo -e "${GREEN}14. Cache Performance Headers${NC}"
curl -s -v -X GET "${BASE_URL}/api/commits?repoUrl=${SMALL_REPO}&page=1&limit=1" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" 2>&1 | grep -i "x-cache\|x-repository"
echo ""

echo -e "${BLUE}=== Test Suite Complete ===${NC}"
```

Make it executable:

```bash
chmod +x test-gitray-api.sh
./test-gitray-api.sh
```

### Quick Single Command Test

```bash
# Test if the API is working with proper headers
curl -v -X GET "http://localhost:3001/api/repositories/summary?repoUrl=https://github.com/developit/htm.git" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" 2>&1 | grep -E "HTTP|X-Cache"
```

---

## Common Issues

### Issue 1: 400 Bad Request - Missing Headers

**Problem:** Forgot required headers
**Solution:** Always include both headers:
```bash
-H "Content-Type: application/json"
-H "X-Requested-With: XMLHttpRequest"
```

### Issue 2: 401 Unauthorized

**Problem:** Admin endpoint requires authentication
**Solution:** Add admin token:
```bash
-H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Or disable admin auth in `.env`:
```
ADMIN_AUTH_ENABLED=false
```

### Issue 3: 400 Bad Request - Invalid URL

**Problem:** Repository URL doesn't end with `.git`
**Solution:** Always append `.git` to repository URLs:
```bash
https://github.com/user/repo.git  # ✓ Correct
https://github.com/user/repo      # ✗ Wrong
```

### Issue 4: Connection Refused

**Problem:** Backend is not running
**Solution:**
```bash
# Start the backend
cd apps/backend
pnpm dev:backend

# Or from project root
pnpm dev
```

### Issue 5: 503 Service Unavailable

**Problem:** Server is shutting down or cache is unhealthy
**Solution:** Check health endpoints:
```bash
curl http://localhost:3001/health/detailed
```

---

## Environment Configuration

Current configuration from `.env`:

```
PORT=3001
CORS_ORIGIN=http://localhost:5173
ADMIN_AUTH_ENABLED=false  # Admin endpoints don't require auth in dev
STREAMING_ENABLED=true
REPO_CACHE_ENABLED=true
CACHE_HIERARCHICAL_ENABLED=true
```

---

## Additional Resources

- **Architecture**: `docs/ARCHITECTURE.md`
- **API Documentation**: `docs/API.md`
- **Testing Strategy**: `docs/TESTING.md`
- **Project Instructions**: `CLAUDE.md`

---

## Summary

The key to successful manual API testing is including the required headers:

```bash
# ✓ CORRECT - Will work
curl -X GET "http://localhost:3001/api/commits?repoUrl=https://github.com/user/repo.git" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest"

# ✗ WRONG - Will fail with 400 Bad Request
curl -X GET "http://localhost:3001/api/commits?repoUrl=https://github.com/user/repo.git"
```

The `X-Requested-With: XMLHttpRequest` header is enforced by the `strictContentType` middleware for security and consistency with the frontend client.
