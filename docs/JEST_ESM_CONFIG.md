# docs/JEST_ESM_CONFIG.md

## Problem

The frontend project uses modern ESM packages like `ansi-styles` that use JavaScript's
native ES modules with `export` statements. Jest runs in a Node.js environment and needs
special handling for ESM modules.

The error that appears in CI (and sometimes locally):

```bash
SyntaxError: Unexpected token 'export'
  at Runtime.createScriptFromCode (node_modules/jest-runtime/build/index.js:1505:14)
  at Object.<anonymous> (node_modules/pretty-format/build/index.js:9:42)
```

## Solution

Our solution uses SWC (Speedy Web Compiler) for JavaScript files and ts-jest for
TypeScript files:

1. **SWC for JavaScript Transformation**

   - Added `@swc/core` and `@swc/jest` to handle JS files including ESM modules.
   - Faster than babel-jest and handles ESM syntax properly.

2. **Expanded transformIgnorePatterns**

   - Added `pretty-format` and `@testing-library` to the list of ESM modules to transform.

   ```js
   transformIgnorePatterns: [
     'node_modules/(?!(ansi-styles|ansi-regex|kleur|chalk|pretty-format|@testing-library)/)',
   ];
   ```

3. **Reset pnpm Store Configuration**

   - Removed custom store path and reverted to default location.
   - Simplified `.npmrc` file.

4. **Node.js ESM Support in CI**
   - Added `--experimental-vm-modules` flag to Node.js options in CI workflow.

## Why This Works

- **SWC is Faster**: SWC outperforms Babel and supports ESM natively.
- **No babel Needed**: Eliminates complexity of a Babel config.
- **Compatible with React 19**: Works seamlessly with the latest React version.
- **Default pnpm Store**: Prevents path‐length issues from custom store paths.

Properly transforming node_modules ESM packages prevents Jest from loading them directly.
