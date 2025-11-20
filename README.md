# GitRay

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![Test Coverage](https://img.shields.io/badge/Coverage-86.4%25-brightgreen.svg)](coverage/index.html)
[![DeepWiki](https://img.shields.io/badge/DeepWiki-jonasyr%2Fgitray-blue.svg?logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAyCAYAAAAnWDnqAAAAAXNSR0IArs4c6QAAA05JREFUaEPtmUtyEzEQhtWTQyQLHNak2AB7ZnyXZMEjXMGeK/AIi+QuHrMnbChYY7MIh8g01fJoopFb0uhhEqqcbWTp06/uv1saEDv4O3n3dV60RfP947Mm9/SQc0ICFQgzfc4CYZoTPAswgSJCCUJUnAAoRHOAUOcATwbmVLWdGoH//PB8mnKqScAhsD0kYP3j/Yt5LPQe2KvcXmGvRHcDnpxfL2zOYJ1mFwrryWTz0advv1Ut4CJgf5uhDuDj5eUcAUoahrdY/56ebRWeraTjMt/00Sh3UDtjgHtQNHwcRGOC98BJEAEymycmYcWwOprTgcB6VZ5JK5TAJ+fXGLBm3FDAmn6oPPjR4rKCAoJCal2eAiQp2x0vxTPB3ALO2CRkwmDy5WohzBDwSEFKRwPbknEggCPB/imwrycgxX2NzoMCHhPkDwqYMr9tRcP5qNrMZHkVnOjRMWwLCcr8ohBVb1OMjxLwGCvjTikrsBOiA6fNyCrm8V1rP93iVPpwaE+gO0SsWmPiXB+jikdf6SizrT5qKasx5j8ABbHpFTx+vFXp9EnYQmLx02h1QTTrl6eDqxLnGjporxl3NL3agEvXdT0WmEost648sQOYAeJS9Q7bfUVoMGnjo4AZdUMQku50McDcMWcBPvr0SzbTAFDfvJqwLzgxwATnCgnp4wDl6Aa+Ax283gghmj+vj7feE2KBBRMW3FzOpLOADl0Isb5587h/U4gGvkt5v60Z1VLG8BhYjbzRwyQZemwAd6cCR5/XFWLYZRIMpX39AR0tjaGGiGzLVyhse5C9RKC6ai42ppWPKiBagOvaYk8lO7DajerabOZP46Lby5wKjw1HCRx7p9sVMOWGzb/vA1hwiWc6jm3MvQDTogQkiqIhJV0nBQBTU+3okKCFDy9WwferkHjtxib7t3xIUQtHxnIwtx4mpg26/HfwVNVDb4oI9RHmx5WGelRVlrtiw43zboCLaxv46AZeB3IlTkwouebTr1y2NjSpHz68WNFjHvupy3q8TFn3Hos2IAk4Ju5dCo8B3wP7VPr/FGaKiG+T+v+TQqIrOqMTL1VdWV1DdmcbO8KXBz6esmYWYKPwDL5b5FA1a0hwapHiom0r/cKaoqr+27/XcrS5UwSMbQAAAABJRU5ErkJggg==)](https://deepwiki.com/jonasyr/gitray)

A professional Git visualization tool that transforms repository commit history into
beautiful, interactive heatmaps and activity calendars. Built with performance and
scalability in mind, GitRay provides deep insights into development patterns and team
collaboration.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Development](#development)
- [Testing](#testing)
- [API Reference](#api-reference)
- [Performance](#performance)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Documentation](#documentation)
- [License](#license)

## Features

### 🎨 Rich Visualizations

- **Activity Heatmaps**: GitHub-style contribution calendars with customizable time periods
- **Commit Analysis**: Detailed commit statistics and author breakdowns
- **Code Churn Analysis**: Track code changes and stability patterns with risk level indicators
- **Interactive Filtering**: Filter by authors, date ranges, and commit patterns
- **Responsive Design**: Optimized for desktop and mobile viewing

### ⚡ High Performance

- **Multi-tier Caching**: Intelligent caching system with Redis, disk, and memory tiers
- **Streaming Support**: Handle large repositories (50k+ commits) efficiently
- **Repository Coordination**: Prevents duplicate clones with shared repository management
- **Memory Pressure Management**: Automatic memory optimization and circuit breakers

### 🔧 Developer Experience

- **Professional Development Environment**: Automated service orchestration
- **Real-time Monitoring**: Live log viewing and service status monitoring
- **Hot Reloading**: Instant feedback during development
- **Type Safety**: Full TypeScript support across the stack

### 🚀 Production Ready

- **Transactional Consistency**: ACID-compliant cache operations with automatic rollback
- **Error Recovery**: Comprehensive error handling and graceful degradation
- **Monitoring & Metrics**: Built-in health checks and performance monitoring
- **Scalable Architecture**: Designed for high-throughput production environments

## Architecture

GitRay follows a modern monorepo architecture with clear separation of concerns:

```text
gitray/
├── apps/
│   ├── backend/           # Express.js API server
│   │   ├── src/
│   │   │   ├── routes/    # API endpoints
│   │   │   ├── services/  # Business logic
│   │   │   ├── utils/     # Utilities and helpers
│   │   │   └── middlewares/ # Express middlewares
│   │   └── package.json
│   └── frontend/          # React application
│       ├── src/
│       │   ├── components/ # React components
│       │   ├── pages/     # Page components
│       │   ├── services/  # API clients
│       │   └── styles/    # CSS and styling
│       └── package.json
├── packages/
│   └── shared-types/      # Shared TypeScript definitions
└── scripts/
    └── start.sh          # Development environment manager
```

### Technology Stack

**Backend:**

- Node.js 18+ with TypeScript
- Express.js web framework
- Redis for caching and session management
- simple-git for Git operations
- Docker for containerized services

**Frontend:**

- React 19 with TypeScript
- Vite for fast development and building
- Tailwind CSS for styling
- Rive for interactive animations
- React Calendar Heatmap for visualizations

**Development:**

- pnpm for package management
- Vitest for testing (86.4% coverage)
- ESLint and Prettier for code quality
- Husky for git hooks

## Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **pnpm**: Version 8.0.0 or higher
- **Docker**: For Redis container (or local Redis installation)
- **Git**: For repository analysis functionality

### System Requirements

- **Memory**: Minimum 4GB RAM (8GB+ recommended for large repositories)
- **Storage**: 2GB free space for cache and temporary files
- **OS**: Linux, macOS, or Windows with WSL2

## Installation

### Quick Start

1. **Clone the repository:**

```bash
git clone https://github.com/jonasyr/gitray.git
cd gitray
```

2. **Start the application:**

```bash
pnpm app
```

The interactive script will guide you through setup options:

- **Full Setup**: Installs dependencies, starts Redis, builds types, and launches all services
- **Quick Start**: Frontend only
- **Other options**: Status, stop, clean environment

### Manual Setup

If you prefer manual setup:

```bash
# Install dependencies
pnpm install

# Building
pnpm build

# Start Redis (using Docker)
docker run --name gitray-redis -d -p 6379:6379 redis:7-alpine

# Start both backend & frontend
pnpm dev

# Or speperatly
pnpm dev:frontend/backend
```

## Configuration

GitRay uses environment variables for configuration. Create a `.env` file in the root directory:

```bash
# Server Configuration
PORT=3001
CORS_ORIGIN=http://localhost:5173

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Cache Configuration
CACHE_MAX_ENTRIES=10000
CACHE_MEMORY_LIMIT_GB=1
CACHE_ENABLE_REDIS=true
CACHE_ENABLE_DISK=true

# Repository Cache
REPO_CACHE_MAX_REPOSITORIES=50
REPO_CACHE_MAX_AGE_HOURS=24
REPO_CACHE_DISK_LIMIT_GB=5

# Memory Pressure Management
MEMORY_WARNING_THRESHOLD=75
MEMORY_CRITICAL_THRESHOLD=85
MEMORY_EMERGENCY_THRESHOLD=95

# Streaming Configuration
STREAMING_ENABLED=true
STREAMING_COMMIT_THRESHOLD=50000
STREAMING_BATCH_SIZE=1000

# Development
NODE_ENV=development
LOG_LEVEL=info
DEBUG_CACHE_LOGGING=false
```

### Advanced Configuration

For production deployments, additional configuration options are available:

```bash
# Lock Management
LOCK_TIMEOUT_MS=120000
LOCK_CLEANUP_INTERVAL_MS=300000

# Operation Coordination
REPO_OPERATION_COORDINATION_ENABLED=true
REPO_OPERATION_TIMEOUT_MS=600000
REPO_MAX_CONCURRENT_OPS=3

# Cache Strategy
CACHE_HIERARCHICAL_ENABLED=true
CACHE_MEMORY_PRESSURE_THRESHOLD=80
CACHE_EMERGENCY_EVICTION_PERCENT=30
```

## Usage

### Basic Usage

1. **Access the application:**
   - Frontend: <http://localhost:5173>
   - Backend API: <http://localhost:3001>
   - Health check: <http://localhost:3001/health>

2. **Visualize a repository:**
   - Enter a Git repository URL (GitHub, GitLab, Bitbucket)
   - Click "Visualize" to generate the heatmap
   - Use filters to focus on specific authors or time periods

### Supported Repository URLs

```bash
# GitHub
https://github.com/username/repository.git

# GitLab
https://gitlab.com/username/repository.git

# Bitbucket
https://bitbucket.org/username/repository.git

# Self-hosted Git
https://git.yourcompany.com/username/repository.git
```

### API Usage

The backend provides a RESTful API for programmatic access:

```bash
# Get repository commits
curl -X POST http://localhost:3001/api/repositories \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/username/repo.git"}'

# Get commit heatmap data
curl "http://localhost:3001/api/commits/heatmap?repoUrl=https://github.com/username/repo.git&timePeriod=day"

# Get repository info
curl "http://localhost:3001/api/commits/info?repoUrl=https://github.com/username/repo.git"

# Get code churn analysis
curl "http://localhost:3001/api/repositories/churn?repoUrl=https://github.com/username/repo.git"

# Get repository summary (creation date, commits, contributors, status)
curl "http://localhost:3001/api/repositories/summary?repoUrl=https://github.com/username/repo.git"

# Health check
curl "http://localhost:3001/health"

# Detailed health with metrics
curl "http://localhost:3001/health/detailed"

# Memory pressure status
curl "http://localhost:3001/health/memory"

# Prometheus metrics
curl "http://localhost:3001/metrics"
```

### Development Environment Management

The start script provides comprehensive development environment management:

```bash
# Interactive menu
pnpm app

# Direct commands
pnpm start           # Full development setup
pnpm quick           # Frontend only
pnpm env:stop        # Stop all services
pnpm env:status      # Show service status
pnpm env:clean       # Clean environment
```

**Interactive Features:**

- Live log monitoring with `multitail`
- Service status monitoring
- Individual service management
- Automatic dependency installation

## Development

### Getting Started

```bash
# Start development environment (builds shared types + starts all services)
pnpm dev

# Or use the interactive script
pnpm app
```

### Available Scripts

```bash
# Development
pnpm dev                    # Build shared types + start all services
pnpm dev:frontend          # Frontend only
pnpm dev:backend           # Backend only

# Application Management
pnpm app                   # Interactive development environment
pnpm start                 # Full development setup
pnpm quick                 # Frontend only

# Environment Management
pnpm env:status           # Show service status
pnpm env:stop             # Stop all services
pnpm env:clean            # Clean environment

# Building
pnpm build                # Build shared types + all apps
pnpm build:shared-types   # Build shared types only
pnpm build:apps           # Build apps only

# Testing
pnpm test                 # Run all tests
pnpm test:ui              # Test with UI
pnpm test:frontend        # Frontend tests only
pnpm test:backend         # Backend tests only
pnpm test:watch           # Watch mode
pnpm test:watch:changed   # Watch changed files only
pnpm test:coverage        # Generate coverage report

# Code Quality
pnpm lint                 # Run ESLint
pnpm lint:fix             # Fix linting issues
pnpm lint:md              # Lint markdown files
pnpm format               # Format with Prettier

# Cleanup
pnpm clean                # Clean build artifacts and cache
pnpm clean:all            # Deep clean including logs
pnpm rebuild              # Full clean + install + build
```

### Project Structure

```typescript
// Shared types example
interface Commit {
  sha: string;
  message: string;
  date: string;
  authorName: string;
  authorEmail: string;
}

interface CommitHeatmapData {
  timePeriod: TimePeriod;
  data: CommitAggregation[];
  metadata?: {
    maxCommitCount: number;
    totalCommits: number;
  };
}
```

### Adding New Features

1. **Backend API Endpoint:**

```typescript
// apps/backend/src/routes/yourRoute.ts
router.get('/your-endpoint', async (req, res) => {
  // Implementation
});
```

2. **Frontend Component:**

```tsx
// apps/frontend/src/components/YourComponent.tsx
export const YourComponent: React.FC = () => {
  return <div>Your component</div>;
};
```

3. **Shared Types:**

```typescript
// packages/shared-types/src/index.ts
export interface YourInterface {
  // Type definition
}
```

## Testing

GitRay maintains high test coverage (86.4%+) with comprehensive test suites:

```bash
# Run all tests
pnpm test

# Frontend tests only
pnpm test:frontend

# Backend tests only  
pnpm test:backend

# Watch mode for development
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

### Test Structure

- **Unit Tests**: Component and service-level testing
- **Integration Tests**: API endpoint and workflow testing  
- **Performance Tests**: Cache and memory management testing
- **E2E Tests**: Full user workflow testing

### Writing Tests

```typescript
// Example test
import { describe, it, expect } from 'vitest';
import { gitService } from '../services/gitService';

describe('GitService', () => {
  it('should parse commits correctly', async () => {
    const commits = await gitService.getCommits('/path/to/repo');
    expect(commits).toBeDefined();
    expect(commits.length).toBeGreaterThan(0);
  });
});
```

## API Reference

### Endpoints

#### Repository Operations

##### POST /api/repositories

```typescript
// Request
{
  "repoUrl": "https://github.com/username/repo.git"
}

// Response
{
  "commits": Commit[]
}
```

##### POST /api/repositories/heatmap

```typescript
// Request
{
  "repoUrl": "string",
  "filterOptions": {
    "authors": string[],
    "fromDate": "string",
    "toDate": "string"
  }
}

// Response: CommitHeatmapData
```

##### GET /api/repositories/summary

Get comprehensive repository statistics including creation date, last commit info, total commits,
contributors, and activity status. Uses efficient sparse clone approach (95-99% bandwidth savings).

```typescript
// Query parameters
{
  repoUrl: string;  // Repository URL (required)
}

// Response: RepositorySummary
{
  repository: {
    name: string;          // Repository name
    owner: string;         // Repository owner
    url: string;           // Full repository URL
    platform: string;      // 'github' | 'gitlab' | 'bitbucket' | 'other'
  };
  created: {
    date: string;          // ISO 8601 timestamp
    source: string;        // 'first-commit' | 'git-api' | 'platform-api'
  };
  age: {
    years: number;         // Repository age in years
    months: number;        // Additional months
    formatted: string;     // Human-readable format (e.g., "5.7y")
  };
  lastCommit: {
    date: string;          // ISO 8601 timestamp
    relativeTime: string;  // Human-readable (e.g., "2 days ago")
    sha: string;           // Commit SHA
    author: string;        // Commit author name
  };
  stats: {
    totalCommits: number;  // Total commit count
    contributors: number;  // Unique contributor count
    status: string;        // 'active' | 'inactive' | 'archived' | 'empty'
  };
  metadata: {
    cached: boolean;              // Whether data was served from cache
    dataSource: string;           // 'git-sparse-clone' | 'cache'
    createdDateAccuracy: string;  // 'exact' | 'approximate'
    bandwidthSaved: string;       // Bandwidth savings description
    lastUpdated: string;          // ISO 8601 timestamp
  };
}

// Example
curl "http://localhost:3001/api/repositories/summary?repoUrl=https://github.com/octocat/Hello-World.git"
```

##### GET /api/repositories/churn

```typescript
// Query parameters
{
  repoUrl: string;           // Repository URL
  fromDate?: string;         // Start date (ISO 8601)
  toDate?: string;           // End date (ISO 8601)
  extensions?: string[];     // File extensions to include (e.g., ['.ts', '.js'])
  riskLevels?: string[];     // Risk levels to include ('high', 'medium', 'low')
}

// Response: CodeChurnAnalysis
{
  totalCommits: number;
  totalFilesChanged: number;
  averageChurnPerCommit: number;
  fileChurn: FileChurnData[];
  riskDistribution: {
    high: number;
    medium: number;
    low: number;
  };
}
```

#### Commit Operations

##### GET /api/commits/heatmap

- Query parameters: `repoUrl`, `timePeriod`, `authors`, `fromDate`, `toDate`
- Response: `CommitHeatmapData`

##### GET /api/commits/info

- Query parameters: `repoUrl`
- Response: Repository information and statistics

#### Health and Monitoring

##### GET /health

- Basic health check

##### GET /health/detailed

- Comprehensive system status

##### GET /health/memory

- Memory pressure and usage statistics

##### GET /metrics

- Prometheus-compatible metrics

## Performance

### Caching Strategy

GitRay implements a sophisticated three-tier caching system:

1. **Tier 1 - Raw Commits** (60% memory allocation)
   - Direct Git extraction results
   - Highest reusability
   - TTL: 1 hour

2. **Tier 2 - Filtered Commits** (25% memory allocation)
   - Author/date filtered datasets
   - Medium reusability
   - TTL: 30 minutes

3. **Tier 3 - Aggregated Data** (15% memory allocation)
   - Processed visualizations
   - Specific use cases
   - TTL: 15 minutes

### Memory Management

- **Memory Pressure Detection**: Automatic threshold monitoring
- **Circuit Breakers**: Prevent system overload
- **Emergency Eviction**: Intelligent cache clearing under pressure
- **Request Throttling**: Rate limiting during high memory usage

### Repository Coordination

- **Shared Repository Management**: Prevents duplicate clones
- **Operation Coalescing**: Combines identical operations
- **Reference Counting**: Automatic cleanup when unused
- **Lock Management**: Deadlock-free concurrent access

### Performance Metrics

For typical repositories:

- **Small repos** (<1k commits): ~500ms response time
- **Medium repos** (1k-10k commits): ~2s response time
- **Large repos** (10k-50k commits): ~10s with caching
- **Huge repos** (50k+ commits): Streaming mode activated

## Contributing

We welcome contributions! Please read our contributing guidelines.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Install dependencies: `pnpm install`
4. Start development environment: `pnpm app`

### Code Style

- **TypeScript**: Strict type checking enabled
- **ESLint**: Configured with recommended rules
- **Prettier**: Automatic code formatting
- **Conventional Commits**: Use conventional commit messages

```bash
# Example commit messages
feat: add repository coordination system
fix: resolve memory leak in cache manager  
docs: update API documentation
test: add integration tests for heatmap
```

### Pull Request Process

1. Ensure all tests pass: `pnpm test`
2. Update documentation if needed
3. Add tests for new features
4. Ensure code coverage remains above 80%
5. Create pull request with clear description

### Code Quality Standards

- **Test Coverage**: Maintain 80%+ coverage
- **Type Safety**: No `any` types without justification
- **Performance**: Consider memory and CPU impact
- **Security**: Follow security best practices
- **Documentation**: Document complex functions and APIs

## Troubleshooting

### Common Issues

**Port Conflicts:**

```bash
# Check what's using the port
lsof -i :3001
# Kill the process
kill -9 <PID>
```

**Redis Connection Issues:**

```bash
# Check Redis status
docker ps | grep redis
# Restart Redis
docker restart gitray-redis
```

**Memory Issues:**

```bash
# Check memory usage
pnpm env:status
# Clean environment
pnpm env:clean
```

**Build Issues:**

```bash
# Clean rebuild
pnpm rebuild
```

### Debug Mode

Enable detailed logging:

```bash
DEBUG_CACHE_LOGGING=true
DEBUG_LOCK_LOGGING=true
LOG_LEVEL=debug
```

### Performance Issues

For large repositories:

1. Ensure sufficient memory (8GB+ recommended)
2. Enable streaming mode
3. Adjust cache limits in configuration
4. Monitor memory pressure endpoints

## Roadmap

### Upcoming Features

- [ ] **Team Analytics**: Advanced team collaboration insights
- [ ] **Custom Visualizations**: User-defined chart types
- [ ] **Export Capabilities**: PDF and image export for visualizations
- [ ] **Real-time Updates**: Live repository monitoring
- [ ] **API Authentication**: Secure API access with token-based auth
- [ ] **Plugin System**: Extensible visualization plugins
- [ ] **Zoom & Pan Controls**: Enhanced navigation for all visualizations
- [ ] **Unified Dashboard Layout**: Consistent UI/UX across components

### Data & Analytics Enhancements

- [ ] **Git Diff Viewer**: Integrated code difference visualization
- [ ] **File Type Distribution Analysis**: Breakdown of repository file types
- [ ] **Git Graph Timeline Visualization**: Interactive commit history graphs
- [ ] **Contributor Analysis Dashboard**: Detailed team contribution metrics
- [x] **Code Churn Analysis**: Track code changes and stability patterns (API implemented)

### User Experience Improvements

- [ ] **Error Handling & User Feedback**: Enhanced error messages and user guidance
- [ ] **Heatmap Cell Clipping Fix**: Resolve visual display issues on right edge
- [ ] **General Refactoring**: Code organization and maintainability improvements

### Performance Improvements

- [ ] **GraphQL API**: More efficient data fetching
- [ ] **WebSocket Support**: Real-time updates
- [ ] **CDN Integration**: Global content delivery
- [ ] **Database Integration**: PostgreSQL/MongoDB support

### Enterprise Features

- [ ] **Multi-tenant Support**: Organization management
- [ ] **SSO Integration**: Enterprise authentication
- [ ] **Audit Logging**: Comprehensive access logs
- [ ] **Custom Branding**: White-label solutions

## Documentation

### Development Documentation

For detailed development information, component documentation, and architectural
decisions, please refer to the [Wiki](https://github.com/jonasyr/gitray/wiki)

### API Documentation

The backend API is documented through:

- **Health Endpoints**: `/health`, `/health/detailed`, `/health/memory`
- **Repository API**: `/api/repositories` for commit data
- **Heatmap API**: `/api/commits/heatmap` for visualization data
- **Metrics**: `/metrics` for Prometheus-compatible monitoring

### Configuration Files

- **`package.json`** - Project dependencies and scripts
- **`tsconfig.json`** - TypeScript configuration
- **`vitest.config.ts`** - Test configuration
- **`eslint.config.mjs`** - Linting rules
- **`.env`** - Environment configuration (see Configuration section)

## Acknowledgements

- [React Calendar Heatmap](https://github.com/kevinsqi/react-calendar-heatmap) for visualization components
- [Rive](https://rive.app/) for interactive animations
- [simple-git](https://github.com/steveukx/git-js) for Git operations
- The open-source community for inspiration and tools

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

---

**GitRay** - Transform your Git history into beautiful insights.

For questions, issues, or feature requests, please
[open an issue](https://github.com/jonasyr/gitray/issues) or contact the maintainers.
