# GitRay - Coding Standards and Conventions

## Core Principles
- **TypeScript Strict Mode**: Enabled everywhere, avoid `any` and implicit `any`
- **Functional React**: Use functional components with hooks only
- **Professional Logging**: Use Winston logger, not `console.log` in runtime code
- **Shared Types**: Import from `@gitray/shared-types`, never duplicate interfaces
- **Path Aliases**: Use `@/` for absolute imports from `src/`
- **Test Co-location**: Place `*.test.ts`/`*.spec.ts` beside implementations
- **Named Exports**: Prefer named exports over default exports

## Naming Conventions

### Components & Types (PascalCase)
```typescript
// React Components
export const CommitHeatmap: React.FC<CommitHeatmapProps> = ({ ... }) => { ... };

// Interfaces and Types
export interface CommitHeatmapProps { ... }
export type TimePeriod = 'day' | 'week' | 'month';

// Classes
export class GitService { ... }
export class RepositoryCoordinator { ... }
```

### Hooks (use + camelCase)
```typescript
export const useCommitFilters = () => { ... };
export const useRepositoryData = (repoUrl: string) => { ... };
```

### Functions & Variables (camelCase)
```typescript
export const calculateCommitStats = (commits: Commit[]) => { ... };
const filteredCommits = filterByAuthor(commits, author);
let isLoading = false;
```

### Constants & Enums (SCREAMING_SNAKE_CASE)
```typescript
export const MAX_CACHE_ENTRIES = 10000;
export const STREAMING_THRESHOLD = 50000;
export const HTTP_STATUS = { OK: 200, ... } as const;

export enum CacheTier {
  MEMORY = 'MEMORY',
  REDIS = 'REDIS',
  DISK = 'DISK'
}
```

### Environment Variables (UPPER_SNAKE_CASE)
```bash
PORT=3001
REDIS_HOST=localhost
CACHE_ENABLE_REDIS=true
NODE_ENV=development
```

## File and Directory Naming

### Frontend
- **Components**: `apps/frontend/src/components/<Name>/index.tsx` (PascalCase)
- **Pages**: `apps/frontend/src/pages/<Name>.tsx` (PascalCase)
- **Hooks**: `apps/frontend/src/hooks/use<Name>.ts` (camelCase with 'use' prefix)
- **Utilities**: `apps/frontend/src/utils/<name>.ts` (camelCase)
- **Services**: `apps/frontend/src/services/<name>.ts` (camelCase)

### Backend
- **Routes**: `apps/backend/src/routes/<entity>Routes.ts` (camelCase + 'Routes')
- **Services**: `apps/backend/src/services/<name>Service.ts` (camelCase + 'Service')
- **Utilities**: `apps/backend/src/utils/<name>.ts` (camelCase)
- **Middlewares**: `apps/backend/src/middlewares/<name>.ts` (camelCase)

### Shared Types
- **Index file**: `packages/shared-types/src/index.ts` (all exports in single file)

## Import Organization

Group and order imports:
1. External packages (React, Express, etc.)
2. Internal modules (`@gitray/shared-types`, `@/...`)
3. Relative imports
4. Style imports (CSS)
5. Test utilities (in test files)

```typescript
// 1. External
import express from 'express';
import { simpleGit } from 'simple-git';

// 2. Internal workspace
import { Commit, CommitFilterOptions } from '@gitray/shared-types';
import { logger } from '@/services/logger';

// 3. Relative
import { validateRepoUrl } from '../utils/urlSecurity';
import type { CacheOptions } from './cache';

// 4. Styles (frontend)
import './heatmap.css';

// 5. Test utils (in tests)
import { describe, it, expect, vi } from 'vitest';
```

## Async & Error Handling

### Use async/await, not promise chains
```typescript
// ✅ GOOD
async function getCommits(repoUrl: string): Promise<Commit[]> {
  try {
    const repoPath = await cloneRepository(repoUrl);
    const commits = await extractCommits(repoPath);
    return commits;
  } catch (error) {
    logger.error('Failed to get commits', { repoUrl, error });
    throw new RepositoryError('Failed to fetch commits', repoUrl);
  }
}

// ❌ BAD (promise chains)
function getCommits(repoUrl: string): Promise<Commit[]> {
  return cloneRepository(repoUrl)
    .then(extractCommits)
    .catch(error => { throw error; });
}
```

### Never swallow errors
```typescript
// ✅ GOOD
try {
  await someOperation();
} catch (error) {
  logger.error('Operation failed', { error });
  throw new GitrayError('Operation failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
}

// ❌ BAD
try {
  await someOperation();
} catch (error) {
  // Silent failure - never do this
}
```

### Use typed error classes
```typescript
import { GitrayError, RepositoryError, ValidationError } from '@gitray/shared-types';

throw new ValidationError('Invalid input', errors);
throw new RepositoryError('Clone failed', repoUrl);
throw new GitrayError('Internal error', HTTP_STATUS.INTERNAL_SERVER_ERROR);
```

## React Component Style

### Functional components with proper typing
```typescript
import { FC } from 'react';

interface CommitListProps {
  commits: Commit[];
  onCommitClick?: (commit: Commit) => void;
}

export const CommitList: FC<CommitListProps> = ({ commits, onCommitClick }) => {
  return (
    <div className="commit-list">
      {commits.map((commit) => (
        <div key={commit.sha} onClick={() => onCommitClick?.(commit)}>
          {commit.message}
        </div>
      ))}
    </div>
  );
};
```

### Follow Rules of Hooks
```typescript
// ✅ GOOD - hooks at top level
const MyComponent: FC = () => {
  const [data, setData] = useState<Commit[]>([]);
  const { loading, error } = useRepositoryData(repoUrl);
  
  useEffect(() => {
    fetchData();
  }, []);

  return <div>...</div>;
};

// ❌ BAD - conditional hooks
const MyComponent: FC = () => {
  if (condition) {
    const [data, setData] = useState([]); // NEVER do this
  }
  return <div>...</div>;
};
```

## Styling

### Use Tailwind CSS classes
```tsx
<div className="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
  <span className="text-lg font-semibold">Title</span>
  <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
    Click
  </button>
</div>
```

### Avoid inline styles (except dynamic values)
```tsx
// ✅ GOOD - dynamic value
<div style={{ width: `${percentage}%` }}>...</div>

// ❌ BAD - static styles should use Tailwind
<div style={{ padding: '16px', backgroundColor: '#f3f4f6' }}>...</div>
```

## Backend Route Structure

### RESTful conventions
```typescript
import { Router } from 'express';
import { validateRequest } from '@/middlewares/validation';
import { handleValidationErrors } from '@/utils/routeHelpers';

const router = Router();

// GET: Retrieve data
router.get('/repositories/summary', 
  repoUrlValidation,
  handleValidationErrors,
  async (req, res) => { ... }
);

// POST: Create or process data
router.post('/repositories', 
  repoUrlValidation,
  handleValidationErrors,
  async (req, res) => { ... }
);

export default router;
```

### Consistent error handling in routes
```typescript
import { setupRouteRequest, recordRouteSuccess, recordRouteError } from '@/utils/routeHelpers';

router.get('/endpoint', async (req, res) => {
  const { logger, startTime } = setupRouteRequest(req, 'operation-name');
  
  try {
    const result = await performOperation();
    recordRouteSuccess(res, result, logger, startTime, 'operation-name');
  } catch (error) {
    recordRouteError(res, error, logger, 'operation-name');
  }
});
```

## Testing Standards

### Test file naming
- Place beside source: `myModule.ts` → `myModule.test.ts`
- Use descriptive test names
- Use HappyPath Concept
- Use AAA Pattern

### Test structure (Vitest)
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { myFunction } from './myModule';

describe('myFunction', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
    vi.clearAllMocks();
  });

  it('should return expected result for valid input', () => {
    const result = myFunction(validInput);
    expect(result).toEqual(expectedOutput);
  });

  it('should throw error for invalid input', () => {
    expect(() => myFunction(invalidInput)).toThrow(ValidationError);
  });
});
```

### Maintain ≥80% coverage
- Focus on critical paths
- Test error cases
- Mock external dependencies (Redis, Git, filesystem)

## Code Quality Rules

### No `any` without justification
```typescript
// ✅ GOOD
function processData(data: Commit[]): CommitStats { ... }

// ❌ BAD
function processData(data: any): any { ... }

// ⚠️ ACCEPTABLE with comment explaining why
function legacyAPI(data: any): any {  // External API with unknown shape
  // ...
}
```

### Prefer readonly where appropriate
```typescript
interface Config {
  readonly port: number;
  readonly redisHost: string;
}

const config: Readonly<Config> = { ... };
```

### Use const assertions for constants
```typescript
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  INTERNAL_SERVER_ERROR: 500
} as const;

export type HttpStatus = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];
```

## Documentation

### JSDoc for public APIs
```typescript
/**
 * Aggregates commits by time period for heatmap visualization.
 * 
 * @param commits - Array of commits to aggregate
 * @param timePeriod - Aggregation period ('day' | 'week' | 'month' | 'year')
 * @param filterOptions - Optional filtering criteria
 * @returns Aggregated commit data with metadata
 * @throws {ValidationError} If timePeriod is invalid
 */
export function aggregateCommits(
  commits: Commit[],
  timePeriod: TimePeriod,
  filterOptions?: CommitFilterOptions
): CommitHeatmapData { ... }
```

### Complex logic comments
```typescript
// Use temporal locality: recently used entries are more likely to be used again.
// This implements a 3-tier LRU cache with 60/25/15 memory allocation.
const tierSizes = calculateTierSizes(maxEntries);
```

## Commit Message Convention

Follow Conventional Commits:
```
feat: add code churn analysis endpoint
fix: resolve memory leak in cache manager
refactor: extract route helpers to reduce duplication
test: add integration tests for repository coordinator
docs: update API documentation for /summary endpoint
perf: optimize commit aggregation for large datasets
style: format code with prettier
chore: update dependencies
```

## Common Mistakes to Avoid

1. ❌ Using `console.log` in production code (use `logger`)
2. ❌ Skipping `pnpm build:shared-types` before building apps
3. ❌ Creating duplicate types instead of importing from `@gitray/shared-types`
4. ❌ Using relative paths when `@/` alias exists
5. ❌ Adding `node_modules`, `dist`, or build outputs to git
6. ❌ Introducing unhandled promise rejections
7. ❌ Forgetting to update both backend and frontend when API contracts change
8. ❌ Mixing feature changes with refactoring in same commit
9. ❌ Not adding tests for new features
10. ❌ Default exports for components/utilities (use named exports)
