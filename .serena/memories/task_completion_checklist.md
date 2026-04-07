# GitRay - Task Completion Checklist

## Before Committing Code

### 1. Code Quality Checks

```bash
# Run linting
pnpm lint

# Fix auto-fixable issues
pnpm lint:fix

# Lint markdown files (if docs changed)
pnpm lint:md
```

### 2. Run Tests

```bash
# Run all tests
pnpm test

# Or run specific workspace tests
pnpm test:frontend  # Frontend only
pnpm test:backend   # Backend only

# Check coverage (maintain ≥80%)
pnpm test:coverage
```

### 3. Build Validation

```bash
# Ensure clean build
pnpm build

# Or incrementally
pnpm build:shared-types  # If types changed
pnpm build:apps          # If app code changed
```

### 4. Manual Testing

- [ ] Test the feature/fix in the running application
- [ ] Verify frontend behavior (`pnpm dev:frontend`)
- [ ] Verify backend endpoints (`pnpm dev:backend`)
- [ ] Check browser console for errors
- [ ] Check backend logs for errors

### 5. Type Safety

- [ ] No TypeScript errors (`pnpm build`)
- [ ] No use of `any` without justification
- [ ] Proper types imported from `@gitray/shared-types`
- [ ] All new functions/components properly typed

## Code Review Self-Checklist

### General

- [ ] Code follows project conventions (see `coding_standards.md`)
- [ ] No debug code (`console.log`, commented code, etc.)
- [ ] Descriptive variable and function names
- [ ] Complex logic has explanatory comments
- [ ] No duplicate code (DRY principle)

### TypeScript

- [ ] Strict type checking passes
- [ ] No `any` types without justification
- [ ] Proper error handling with typed error classes
- [ ] Async functions use `async/await`, not promise chains

### React Components (Frontend)

- [ ] Functional components with proper typing
- [ ] Hooks follow Rules of Hooks
- [ ] Proper key props for lists
- [ ] No inline functions in render (performance)
- [ ] Tailwind CSS for styling (avoid inline styles)
- [ ] Use shadcn/ui components from `components/ui/` when available
- [ ] Use `cn()` utility for conditional className merging
- [ ] Theme colors via CSS variables (not hardcoded colors)
- [ ] Dark mode classes where appropriate (`dark:` prefix)
- [ ] Accessibility maintained (keyboard navigation, ARIA labels)

### Backend Routes & Services

- [ ] Proper error handling with try/catch
- [ ] Use Winston logger, not `console.log`
- [ ] Input validation with express-validator or Zod
- [ ] HTTP status codes from `HTTP_STATUS` constants
- [ ] Route helpers used for consistency (`setupRouteRequest`, etc.)

### Testing

- [ ] New features have tests
- [ ] Bug fixes have regression tests
- [ ] Test coverage maintained (≥80%)
- [ ] Tests are meaningful (not just coverage padding)
- [ ] Mocks are used for external dependencies

### Documentation

- [ ] README updated if user-facing changes
- [ ] CLAUDE.md updated if guidelines change
- [ ] JSDoc comments for public APIs
- [ ] Complex algorithms explained

## When Changing Shared Types

If you modified `packages/shared-types/src/index.ts`:

1. **Rebuild shared types**

   ```bash
   pnpm build:shared-types
   ```

2. **Update imports** in backend and frontend

   ```typescript
   import { YourNewType } from '@gitray/shared-types';
   ```

3. **Update both backend and frontend** if API contract changed
   - Backend: Route handlers, services
   - Frontend: API client, components

4. **Run tests across workspace**
   ```bash
   pnpm test  # All workspaces
   ```

## When Adding Dependencies

### Root dependencies

```bash
pnpm add -D <package>  # Dev dependency at root
```

### Workspace dependencies

```bash
pnpm --filter backend add <package>
pnpm --filter frontend add <package>
pnpm --filter @gitray/shared-types add <package>
```

### After adding dependencies

- [ ] Verify `pnpm-lock.yaml` is updated
- [ ] Test that build still works
- [ ] Update README if dependency is significant

## When Creating a Pull Request

### 1. Ensure Clean Branch

```bash
# Sync with main development branch
git checkout dev
git pull origin dev

# Rebase your feature branch
git checkout your-feature-branch
git rebase dev
```

### 2. Commit Message

Follow Conventional Commits format:

```
feat: add code churn risk indicators
fix: resolve cache eviction race condition
refactor: extract route success/error helpers
test: add integration tests for repository summary
docs: update API documentation for /churn endpoint
perf: optimize commit aggregation algorithm
```

### 3. PR Description Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Refactoring (no functional changes)
- [ ] Documentation update

## Testing

- [ ] Tests pass locally
- [ ] Added tests for new features
- [ ] Coverage maintained ≥80%

## Checklist

- [ ] Code follows project conventions
- [ ] Self-reviewed the code
- [ ] Commented complex logic
- [ ] Updated documentation
- [ ] No breaking changes (or documented if necessary)
```

## Performance Considerations

When implementing features, consider:

- [ ] **Caching**: Can this be cached? Which tier?
- [ ] **Memory**: Will this consume significant memory?
- [ ] **Streaming**: For large datasets, should streaming be used?
- [ ] **Repository Coordination**: Use `withSharedRepository()` for Git ops
- [ ] **Pagination**: Large result sets should be paginated
- [ ] **Error Recovery**: Graceful degradation on failures

## Security Considerations

- [ ] Input validation for all user inputs
- [ ] URL validation for repository URLs
- [ ] No exposure of sensitive data in logs
- [ ] Proper error messages (don't leak internals)
- [ ] Rate limiting on new endpoints

## Specific Task Types

### Adding a New API Endpoint

1. **Define types** in `packages/shared-types/src/index.ts`
2. **Build shared types**: `pnpm build:shared-types`
3. **Create route** in `apps/backend/src/routes/`
4. **Add validation** middleware
5. **Implement service logic** in `apps/backend/src/services/`
6. **Add tests** for route and service
7. **Update frontend API client** in `apps/frontend/src/services/api.ts`
8. **Create/update components** to consume the endpoint
9. **Test end-to-end**
10. **Update documentation** (README, API docs)

### Adding a New Frontend Component

1. **Check shadcn/ui catalog** for existing components to reuse
2. **Create component** in `apps/frontend/src/components/<Name>.tsx`
3. **Import shadcn/ui primitives** from `@/components/ui/`
4. **Use Tailwind utilities** for styling
5. **Apply theme colors** via CSS variables
6. **Add dark mode support** with `dark:` classes
7. **Ensure accessibility** (keyboard nav, ARIA, focus management)
8. **Add proper TypeScript types** for props
9. **Test component** in isolation
10. **Integrate into parent component/page**

### Fixing a Bug

1. **Write failing test** that reproduces the bug
2. **Fix the bug** with minimal changes
3. **Verify test passes**
4. **Run full test suite**
5. **Test manually**
6. **Commit with `fix:` prefix**

### Refactoring

1. **Ensure tests exist** and pass
2. **Make refactoring changes** (behavior unchanged)
3. **Verify tests still pass** (no changes to tests needed)
4. **Verify build works**
5. **Commit with `refactor:` prefix**
6. **Keep refactor separate** from feature changes

## Environment-Specific Checks

### Development

- [ ] Redis running (`docker ps | grep redis`)
- [ ] Ports available (3001, 5173, 6379)
- [ ] Environment variables set (`.env` file)
- [ ] Logs accessible (`logs/` directory)

### Before Production Deploy (Future)

- [ ] All tests pass in CI
- [ ] Coverage ≥80%
- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] Security audit passed (`pnpm audit`)
- [ ] Environment variables configured
- [ ] Redis/database connections verified
- [ ] Monitoring configured (Prometheus, logs)

## Final Checks Before Git Push

```bash
# 1. Status check
git status

# 2. Ensure no unintended changes
git diff

# 3. Run full validation
pnpm lint && pnpm test && pnpm build

# 4. Commit with conventional commit message
git add .
git commit -m "feat: your feature description"

# 5. Push
git push origin your-branch-name
```

## Automated Checks (Pre-commit Hook)

The project uses Husky with lint-staged for automatic checks:

- **TypeScript/JavaScript**: ESLint auto-fix + Prettier
- **Markdown**: Markdownlint
- **JSON/YAML**: Prettier formatting

These run automatically on `git commit`. If they fail, fix issues before committing.

## Quick Reference

### Validation Pipeline

```
Code → Lint → Format → Test → Build → Manual Test → Commit
```

### Must-Run Before Commit

```bash
pnpm lint && pnpm test && pnpm build
```

### If Shared Types Changed

```bash
pnpm build:shared-types && pnpm test
```

### If Unsure, Run Everything

```bash
pnpm rebuild && pnpm lint && pnpm test
```
