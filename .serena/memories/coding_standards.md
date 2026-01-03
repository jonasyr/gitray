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
- **Components**: `apps/frontend/src/components/<Name>.tsx` (PascalCase, single file)
- **UI Components**: `apps/frontend/src/components/ui/<name>.tsx` (camelCase for shadcn/ui components)
- **Hooks**: `apps/frontend/src/hooks/use<Name>.ts` (camelCase with 'use' prefix)
- **Utilities**: `apps/frontend/src/utils/<name>.ts` (camelCase)
- **Services**: `apps/frontend/src/services/<name>.ts` (camelCase)
- **UI Utils**: `apps/frontend/src/components/ui/utils.ts` (contains `cn()` function)

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

### Functional components with proper typing (shadcn/ui style)
```typescript
import { FC } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';

interface CommitListProps {
  commits: Commit[];
  onCommitClick?: (commit: Commit) => void;
  className?: string; // Allow className override
}

export const CommitList: FC<CommitListProps> = ({ 
  commits, 
  onCommitClick,
  className 
}) => {
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle>Recent Commits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {commits.map((commit) => (
          <Button
            key={commit.sha}
            variant="ghost"
            className="w-full justify-start"
            onClick={() => onCommitClick?.(commit)}
          >
            {commit.message}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
};
```

### Component composition with shadcn/ui
```typescript
// Build complex UIs by composing shadcn/ui primitives
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const DashboardTabs: FC = () => {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="files">Files</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <OverviewPanel />
      </TabsContent>
      <TabsContent value="activity">
        <ActivityPanel />
      </TabsContent>
      <TabsContent value="files">
        <FilesPanel />
      </TabsContent>
    </Tabs>
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

### Use Tailwind CSS classes with shadcn/ui patterns
```tsx
// Use shadcn/ui components as building blocks
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Repository Stats</CardTitle>
  </CardHeader>
  <CardContent className="flex items-center justify-between">
    <span className="text-lg font-semibold">Commits</span>
    <Button variant="default" size="sm">View Details</Button>
  </CardContent>
</Card>
```

### Use `cn()` utility for conditional classes
```tsx
import { cn } from '@/components/ui/utils';

<div className={cn(
  "base-styles p-4 rounded-lg",
  isActive && "bg-primary text-primary-foreground",
  isDisabled && "opacity-50 cursor-not-allowed"
)}>
  Content
</div>
```

### Theme colors via CSS variables
```tsx
// ✅ GOOD - use semantic color variables
<div className="bg-background text-foreground border border-border">
  <span className="text-muted-foreground">Subtitle</span>
  <button className="bg-primary text-primary-foreground">Action</button>
</div>

// ❌ BAD - hardcoded colors
<div className="bg-white text-black border border-gray-300">
  <span className="text-gray-500">Subtitle</span>
  <button className="bg-blue-500 text-white">Action</button>
</div>
```

### Dark mode support
```tsx
// Tailwind dark mode classes
<div className="bg-white dark:bg-slate-900 text-black dark:text-white">
  Content adapts to theme
</div>
```

### Avoid inline styles (except dynamic values)
```tsx
// ✅ GOOD - dynamic value
<div style={{ width: `${percentage}%` }}>...</div>

// ❌ BAD - static styles should use Tailwind
<div style={{ padding: '16px', backgroundColor: '#f3f4f6' }}>...</div>
```

### shadcn/ui component variants
```tsx
// Use built-in variant systems
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">Subtle</Button>
<Button variant="link">Link Style</Button>

<Badge variant="default">New</Badge>
<Badge variant="secondary">Info</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Outlined</Badge>
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
