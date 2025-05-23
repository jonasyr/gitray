# docs/JEST_MOCK.md

## Problem

Modern ESM modules like `ansi-styles` use native ES modules syntax with `export`
statements, leading to this Jest error:

```bash
SyntaxError: Unexpected token 'export'
```

## Solution

We created a simple but effective solution using Jest's built-in mocking:

1. **Manual Module Mock**  
   Created `jest.setup.cjs` to mock problematic ESM modules:

   ```js
   // jest.setup.cjs
   // Mock ansi-styles with a CommonJS version
   jest.mock('ansi-styles', () => ({
     modifier: {
       /* ... */
     },
     color: {
       /* ... */
     },
     bgColor: {
       /* ... */
     },
     // etc.
   }));
   ```

2. **Global Setup**  
   Added this mock to Jest's `setupFiles`:

   ```js
   // jest.config.cjs
   module.exports = {
     setupFiles: ['<rootDir>/jest.setup.cjs'],
     // ...
   };
   ```

3. **Simplified Config**  
   Removed complex `transformIgnorePatterns` and custom transformers.

## Why This Works

- **Direct Approach**: No transformers required.
- **Consistent**: Works locally and in CI.
- **Fast**: Zero transformation overhead.
- **Simple**: Minimal config changes.
- **Targeted**: Only mocks the problematic modules.

By pre-mocking modules in CommonJS, Jest never encounters the ESM `export` syntax directly.
