# Contributor Guide

## Repository Overview

This monorepo uses **pnpm** and contains:

- `apps/frontend` – React app built with Vite/Tailwind
- `apps/backend` – Express server
- `packages/shared-types` – shared TypeScript interfaces

Tests live under `__tests__` or `src/__tests__` within each package.

## Working Locally

1. Install dependencies with `pnpm install`.
2. Run the app with `pnpm dev` (or `dev:frontend` / `dev:backend`).
3. Build all packages with `pnpm build`.

## Validation

Before committing changes, run:

```bash
pnpm lint && pnpm lint:md
pnpm build
pnpm test # or pnpm test:frontend / test:backend
```

CI runs these steps and SonarCloud analysis. All must pass without errors.

## Testing Guidelines

- Use **Jest** for unit tests.
- Follow the **Arrange–Act–Assert** and **Happy Path** patterns.
- Achieve **≥ 80% coverage** using `pnpm test:coverage`.

## Pull Requests

- Target the `dev` branch.
- Ensure linting, tests, and build succeed before pushing.

All scripts are documented in the `README.md` for reference.
