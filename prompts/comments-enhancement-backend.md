# GitHub Copilot: TypeScript Backend Code Comments Enhancement

## Project Context

You are enhancing the backend codebase for _gitray_, an open-source project that
provides visualizations and analysis of Git repositories. This codebase uses
TypeScript exclusively and will undergo professional code review focusing on
comment quality and best practices adherence.

## Core Commenting Philosophy

_BALANCE IS KEY_: Add meaningful, professional comments that enhance code
understanding WITHOUT creating comment clutter. Comments should illuminate the
"why" and complex "how", not obvious "what".

## TypeScript Comment Standards to Follow

### 1. JSDoc for Public APIs

typescript
/\*\*

- Analyzes Git repository commit patterns and generates statistical insights.
-
- @param repoPath - Absolute path to the Git repository
- @param options - Configuration options for analysis depth and filters
- @returns Promise resolving to comprehensive repository analysis data
- @throws {RepositoryNotFoundError} When repository path is invalid
- @throws {GitAnalysisError} When Git operations fail
-
- @example
- typescript
- const analysis = await analyzeRepository('/path/to/repo', {
- includeFileChanges: true,
- maxCommits: 1000
- });
- \*/

### 2. Strategic Inline Comments

- _Complex Business Logic_: Explain algorithms, calculations, and non-obvious decisions
- _Performance Optimizations_: Why specific approaches were chosen
- _Edge Cases_: Handling of unusual but important scenarios
- _External Dependencies_: Integration points and API interactions

### 3. What NOT to Comment

- Obvious variable assignments
- Simple getter/setter methods
- Self-explanatory function names
- Standard TypeScript patterns

## Specific Backend Focus Areas

### Database Operations

typescript
// Example of GOOD commenting for database operations:
/\*\*

- Optimizes commit history queries by batching requests and using indexed fields.
- Prevents memory overflow for repositories with 100k+ commits.
  \*/

### Git Integration Logic

- Comment complex Git operations and shell command constructions
- Explain error handling strategies for Git failures
- Document performance considerations for large repositories

### API Endpoints

- Brief JSDoc for each endpoint's purpose and expected usage
- Document important middleware chains
- Explain authentication/authorization logic

### Data Processing Pipelines

- Comment transformation steps in data analysis
- Explain aggregation algorithms
- Document memory and performance optimizations

## Comment Quality Guidelines

### ✅ DO

- Use complete sentences with proper grammar
- Explain the business reasoning behind complex code
- Document assumptions and constraints
- Add TODO/FIXME comments for technical debt (sparingly)
- Use consistent terminology matching the gitray domain
- Comment public interfaces thoroughly
- Explain error handling strategies

### ❌ DON'T

- Comment every line or obvious operations
- Repeat what the code clearly shows
- Use vague comments like "// fix this later"
- Add comments that will quickly become outdated
- Over-explain TypeScript syntax or standard patterns
- Comment private helper functions unless complex

## TypeScript-Specific Patterns

### Type Definitions

typescript
/\*\*

- Represents a Git commit with enhanced metadata for visualization.
- Optimized for frontend consumption and chart generation.
  _/
  interface CommitVisualizationData {
  // Only comment complex or domain-specific properties
  /\*\*Calculated impact score based on files changed and line additions/deletions_/
  impactScore: number;
  }

### Generic Functions

typescript
/\*\*

- Generic repository data transformer that converts raw Git data
- into visualization-ready formats while preserving type safety.
  \*/
  function transformRepositoryData<T extends RepositoryData>(data: T): VisualizationData<T>

## Code Review Standards

Remember: This code will be professionally reviewed. Comments should:

- Demonstrate understanding of the gitray domain
- Show consideration for maintainability
- Reflect professional software development practices
- Balance thoroughness with conciseness
- Use precise technical language

## Implementation Instructions

1. _Scan each file_ for functions/classes that handle complex logic
2. _Prioritize public APIs_ and exported functions for comprehensive JSDoc
3. _Focus on git-specific operations_ that may not be familiar to all developers
4. _Add strategic inline comments_ for business logic and optimizations
5. _Review existing comments_ and enhance or remove as needed
6. _Maintain consistency_ in comment style across the entire backend

## Final Quality Check

Before finalizing, ensure:

- Comments add genuine value to code understanding
- No comment explains obvious TypeScript or JavaScript patterns
- JSDoc is complete for all public APIs
- Complex algorithms have clear explanations
- The comment-to-code ratio feels balanced and professional

---

_Remember_: Professional code comments are like good documentation—they make
the complex simple, not the simple complex.
