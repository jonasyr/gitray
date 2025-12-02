# GitRay - Architecture Overview

## High-Level Architecture

GitRay follows a **monorepo architecture** with clear separation between frontend, backend, and shared types.

```
┌─────────────────┐
│   React 19 UI   │  Port 5173 (Vite dev server)
│   (Frontend)    │
└────────┬────────┘
         │ HTTP/REST
         │ (Axios)
┌────────▼────────┐
│   Express 5 API │  Port 3001
│   (Backend)     │
└────────┬────────┘
         │
    ┌────┴──────┬─────────┬──────────┐
    │           │         │          │
┌───▼───┐  ┌───▼───┐ ┌──▼────┐ ┌───▼────┐
│ Redis │  │ Disk  │ │ simple│ │ Winston│
│ Cache │  │ Cache │ │  git  │ │  Logs  │
└───────┘  └───────┘ └───────┘ └────────┘
```

## Backend Architecture

### Layered Design

```
Routes (API Endpoints)
    ↓
Middlewares (Validation, Auth, Error Handling)
    ↓
Services (Business Logic)
    ↓
Utils (Helpers, Cache, Locks, Memory Management)
    ↓
External Systems (Redis, Git, Filesystem)
```

### Key Services

#### 1. **gitService** (`services/gitService.ts`)
- Git operations: clone, log extraction, repository analysis
- Streaming support for large repositories (50k+ commits)
- Batch processing with configurable batch sizes
- Integration with `repositoryCoordinator` for shared repository access

**Key Methods:**
- `getCommits(repoPath)` - Extract commits from local repository
- `cloneRepository(repoUrl, options)` - Clone with configurable depth
- Streaming capabilities for memory-efficient large repo handling

#### 2. **cache** (`services/cache.ts`)
Multi-tier caching strategy:
- **Tier 1 - Raw Commits** (60% memory): Direct Git extraction results, TTL 1h
- **Tier 2 - Filtered Commits** (25% memory): Author/date filtered, TTL 30min
- **Tier 3 - Aggregated Data** (15% memory): Processed visualizations, TTL 15min

**Backends:**
- **Redis**: Primary distributed cache (via ioredis)
- **hybridLruCache**: In-memory LRU + disk persistence fallback
- Automatic fallback and health checks

**Key Functions:**
- `getFromCache(key)` - Multi-tier read with fallback
- `setInCache(key, value, ttl)` - Multi-tier write with replication
- `isCacheHealthy()` - Health status of cache backends
- `switchCacheBackend(backend)` - Runtime backend switching

#### 3. **repositoryCoordinator** (`services/repositoryCoordinator.ts`)
Prevents duplicate repository clones and manages shared access:
- **Operation Coalescing**: Combines identical concurrent operations
- **Reference Counting**: Tracks active users of each repository
- **Automatic Cleanup**: Removes unused repositories
- **Lock Management**: Deadlock-free concurrent access via `lockManager`

**Key Functions:**
- `withSharedRepository(repoUrl, operation)` - Execute with shared repo access
- `coordinatedOperation(repoUrl, operationType, operation)` - Coordinated execution

**Architecture:**
```
Request 1 ─┐
Request 2 ─┼─→ Coordinator ─→ Single Clone ─→ Shared Access
Request 3 ─┘                    (Reference Counted)
```

#### 4. **repositoryCache** (`services/repositoryCache.ts`)
Physical repository caching on disk:
- Max repositories: 50 (configurable)
- Max age: 24 hours (configurable)
- LRU eviction when limits reached
- Integration with coordinator for reuse

#### 5. **fileAnalysisService** (`services/fileAnalysisService.ts`)
File type distribution analysis:
- Categorizes files (code, documentation, config, assets, other)
- Extension-based statistics
- Directory-level breakdown
- Performance optimized with streaming

#### 6. **repositorySummaryService** (`services/repositorySummaryService.ts`)
Repository metadata extraction:
- Sparse clone approach (95-99% bandwidth savings)
- Creation date determination (first commit or API)
- Last commit info with relative time
- Activity status classification (active/inactive/archived)
- Total commits and contributor count

#### 7. **metrics** (`services/metrics.ts`)
Prometheus metrics collection:
- Request counters and latencies
- Cache hit rates
- Memory usage
- Repository coordination metrics
- Custom business metrics

#### 8. **logger** (`services/logger.ts`)
Winston logging with:
- Daily log rotation
- Multiple log levels (error, warn, info, debug)
- Structured logging with context
- Separate error log file

### Utilities

#### **hybridLruCache** (`utils/hybridLruCache.ts`)
Hierarchical LRU cache:
- In-memory primary cache
- Disk-based secondary cache
- Automatic tier promotion/demotion
- Memory pressure-aware eviction

#### **lockManager** (`utils/lockManager.ts`)
Distributed locking:
- Redis-based locks with TTL
- Lock cleanup on timeout
- Prevents race conditions in coordinator
- Supports lock renewal

#### **memoryPressureManager** (`utils/memoryPressureManager.ts`)
Memory monitoring and protection:
- Thresholds: Warning (75%), Critical (85%), Emergency (95%)
- Circuit breakers for memory protection
- Request throttling under pressure
- Emergency cache eviction

#### **urlSecurity** (`utils/urlSecurity.ts`)
Repository URL validation:
- Blocks malicious URLs (file://, javascript:, etc.)
- Validates Git hosting platforms (GitHub, GitLab, Bitbucket)
- Normalizes URLs

#### **routeHelpers** (`utils/routeHelpers.ts`)
Common route patterns extracted for reuse:
- `setupRouteRequest()` - Initialize request context
- `recordRouteSuccess()` - Success response with metrics
- `recordRouteError()` - Error handling with logging
- `recordCacheHit()` / `recordCacheMiss()` - Cache metrics

### Middlewares

1. **errorHandler** - Centralized error handling with proper status codes
2. **validation** - Express-validator integration
3. **memoryPressureMiddleware** - Reject requests under high memory pressure
4. **requestId** - Add unique request IDs for tracing
5. **strictContentType** - Enforce JSON content type for POST/PUT
6. **adminAuth** - Admin endpoint authentication

### Routes

#### **repositoryRoutes** (`routes/repositoryRoutes.ts`)
- `GET /repositories/summary` - Repository metadata
- `GET /repositories/churn` - Code churn analysis
- `GET /repositories/commits` - All commits
- `GET /repositories/contributors` - Top contributors
- `GET /repositories/heatmap` - Heatmap data
- `GET /repositories/full-data` - Complete repository data

#### **commitRoutes** (`routes/commitRoutes.ts`)
- Legacy commit endpoints (being refactored)

#### **healthRoutes** (`routes/healthRoutes.ts`)
- `GET /health` - Basic health check
- `GET /health/detailed` - Comprehensive system status
- `GET /health/memory` - Memory pressure status
- `GET /metrics` - Prometheus metrics

## Caching Strategy

### Three-Tier Hierarchy

```
Request → Tier 1 (Raw Commits, 60%)
              ↓ miss
          Tier 2 (Filtered, 25%)
              ↓ miss
          Tier 3 (Aggregated, 15%)
              ↓ miss
          Git Extraction
```

### Cache Key Design
```typescript
// Tier 1: Raw commits
`commits:${repoUrlHash}`

// Tier 2: Filtered commits
`commits:filtered:${repoUrlHash}:${filterHash}`

// Tier 3: Aggregated data
`heatmap:${repoUrlHash}:${timePeriod}:${filterHash}`
```

### TTL Strategy
- **Raw data**: 1 hour (highest reusability)
- **Filtered data**: 30 minutes (medium reusability)
- **Aggregated data**: 15 minutes (specific use case)

### Backends Priority
1. **Redis** (primary) - Distributed, fast, persistent
2. **Memory** (fallback) - Local, fastest, volatile
3. **Disk** (last resort) - Local, slow, persistent

## Repository Coordination

### Operation Flow

```
Request → Coordinator.withSharedRepository()
              ↓
          Check existing operations
              ├─ Match found → Join existing
              └─ No match → Create new operation
                  ↓
              Acquire lock
                  ↓
              Clone/reuse repository
                  ↓
              Execute operation
                  ↓
              Update reference count
                  ↓
              Release lock
                  ↓
              Return result (shared with all waiters)
```

### Benefits
- **Efficiency**: Single clone for concurrent identical requests
- **Resource Management**: Reference counting prevents premature cleanup
- **Consistency**: Lock-based coordination prevents race conditions
- **Automatic Cleanup**: Unused repositories automatically removed

## Memory Management

### Monitoring
```
Normal (< 75%) → Allow all operations
Warning (75-85%) → Log warnings, continue
Critical (85-95%) → Throttle requests, emergency eviction
Emergency (> 95%) → Reject new requests, aggressive eviction
```

### Emergency Eviction Order
1. Tier 3 cache (aggregated data) - least reusable
2. Tier 2 cache (filtered data) - medium reusability
3. Tier 1 cache (raw commits) - highest reusability

### Circuit Breakers
- Automatic request rejection at emergency threshold
- Prevents system overload and crashes
- Self-recovery when memory drops below threshold

## Streaming for Large Repositories

### Activation
- Automatically enabled for repositories with 50k+ commits
- Configurable threshold via `STREAMING_COMMIT_THRESHOLD`

### Batch Processing
- Default batch size: 1000 commits
- Configurable via `STREAMING_BATCH_SIZE`
- Memory-efficient processing of massive histories

### Benefits
- Handles repositories with 100k+ commits
- Prevents memory exhaustion
- Progressive data delivery to frontend

## Frontend Architecture

### Component Structure
```
App.tsx (Root)
    ↓
MainPage.tsx (Main layout)
    ├─ RepoInput.tsx (URL input)
    ├─ ActivityHeatmap.tsx (Visualization)
    ├─ CommitList.tsx (Commit display)
    └─ RiveLoader.tsx (Loading animation)
```

### API Communication
- **Centralized API client**: `services/api.ts`
- **Axios-based**: Configured with base URL and interceptors
- **Type-safe**: All requests/responses use types from `@gitray/shared-types`

### State Management
- React hooks for local state
- No global state management (Redux/Context) currently
- Direct API calls from components

## Shared Types Package

### Purpose
- Single source of truth for TypeScript types
- Prevents type duplication between frontend/backend
- Exported as `@gitray/shared-types` workspace package

### Key Exports
- `Commit`, `Author`, `CommitFilterOptions`
- `CommitHeatmapData`, `CommitAggregation`, `TimePeriod`
- `FileTypeDistribution`, `FileInfo`, `FileCategory`
- `CodeChurnAnalysis`, `FileChurnData`, `ChurnRiskLevel`
- `RepositorySummary`, `RepositoryStatus`, `RepositoryPlatform`
- `GitrayError`, `ValidationError`, `RepositoryError`
- Constants: `HTTP_STATUS`, `TIME`, `ERROR_MESSAGES`, `GIT_SERVICE`

### Build Process
- Must be built before backend/frontend (`pnpm build:shared-types`)
- Produces both CommonJS and ESM outputs
- Consumed via TypeScript project references

## Performance Optimizations

### Backend
- Multi-tier caching reduces Git operations by ~90%
- Repository coordination eliminates duplicate clones
- Streaming mode for large repositories
- Memory pressure management prevents crashes
- LRU eviction maintains optimal cache size

### Frontend
- Vite for fast HMR and optimized builds
- React 19 with automatic batching
- Lazy loading of heavy components
- Efficient re-rendering with proper key usage

### Network
- Compressed responses (gzip/brotli via helmet)
- Cache headers for static assets
- Minimal payload sizes via selective data fetching

## Security Measures

- **Helmet**: Security headers (CSP, HSTS, etc.)
- **CORS**: Restricted origins
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: Express-validator + Zod schemas
- **URL Security**: Blocks malicious repository URLs
- **Content-Type Enforcement**: Strict JSON-only for mutations

## Monitoring & Observability

### Metrics (Prometheus)
- Request count, duration, status codes
- Cache hit/miss rates per tier
- Memory usage and pressure levels
- Repository coordination stats
- Git operation durations

### Logging (Winston)
- Structured JSON logs
- Log levels: error, warn, info, debug
- Daily rotation with compression
- Request IDs for tracing
- Contextual metadata in all logs

### Health Checks
- Basic: Service up/down
- Detailed: Redis status, memory usage, cache health
- Memory: Current pressure level and thresholds

## Scalability Considerations

### Current Design Supports
- Multiple concurrent users on single server
- Horizontal scaling limited by Redis as single point
- Repository cache shared via filesystem

### Future Scaling Options
- Redis Cluster for distributed caching
- Load balancer with sticky sessions
- Shared filesystem (NFS/S3) for repository cache
- Separate worker processes for Git operations
- Database for persistent metadata (currently cache-only)
