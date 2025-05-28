# Technologies

## Front‑end

- **React** (v19)  
  Component‑based UI library.  
  Chosen for its ecosystem, TypeScript support and seamless HMR via Vite.
- **Vite** (v6)  
  Next‑gen build tool with native ES module support and  
  ultra‑fast cold starts.
- **TypeScript** (~5.7)  
  Static typing for early error detection, better refactoring and  
  IDE integration.
- **Tailwind CSS** (v4)  
  Utility‑first CSS framework for rapid, consistent styling without  
  leaving markup.
- **ESLint** + **Prettier**  
  Enforces code quality and consistent formatting across the team.

## Back‑end

- **Node.js** + **Express** (v5)  
  Minimal, flexible HTTP server framework. Chosen for low boilerplate  
  and rich middleware ecosystem.
- **TypeScript**  
  Ensures type safety end‑to‑end, aligning with front‑end stack.
- **simple‑git**  
  Programmatic Git operations with familiar API.
- **dotenv**  
  Manages environment variables securely.
- **cors**  
  Enables cross‑origin API access.

## Package Manager

- **pnpm** (v10)  
  Disk‑efficient installs, strict workspace management and fast CLI.

## Conventions

- **PascalCase** for interfaces and React components (`Commit`, `App`).
- **camelCase** for variables and functions (`gitService`, `getCommits`).
- **kebab-case** for file names (`error-handler.ts`, `package.json`).
- **src/** roots all source code;
  **dist/** holds build outputs.
- Add concise comments explaining non-trivial logic in both code and tests.
- Tests follow the Happy Path pattern and include commented Arrange/Act/Assert sections.

## Other Tools & Libraries

- **nodemon**, **ts-node** for live‑reload development.
- **husky**, **lint-staged** for pre‑commit linting & formatting.
- **@eslint/js**, **eslint-plugin-react-hooks**, **jsx-a11y** for advanced  
  lint rules.
- **D3.js** / **visx** (planned) for data visualizations.

> _Why these choices?_
>
> - **Performance & DX**: Vite & pnpm speed up feedback loops.
> - **Type Safety**: TypeScript prevents a whole class of runtime errors.
> - **Ecosystem**: React & Express have vast community support.
