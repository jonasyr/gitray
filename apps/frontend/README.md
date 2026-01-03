# GitRay Frontend

The modern, redesigned frontend for GitRay - a Git repository analysis and
visualization platform built with React, TypeScript, and shadcn/ui.

## 🎨 Design

This frontend is based on the **GitRay Web App Design** and implements a
complete UI redesign with shadcn/ui components.

## 🚀 Tech Stack

- **React 18.3** - UI library
- **TypeScript 5.7** - Type safety
- **Vite 6.3** - Build tool with HMR
- **Tailwind CSS 4.1** - Utility-first styling
- **shadcn/ui** - High-quality component library built on Radix UI
- **Recharts** - Charting library for data visualization
- **Axios** - HTTP client
- **@rive-app/react-canvas** - Interactive animations

## 📦 Installation

From the project root:

```bash
# Install all workspace dependencies
pnpm install

# Or install only frontend dependencies
pnpm --filter frontend install
```

## 🛠️ Development

```bash
# Start development server (from project root)
pnpm dev:frontend

# Or from this directory
pnpm dev

# Start with full stack (Redis + Backend + Frontend)
pnpm start
```

The development server runs on `http://localhost:5173` with hot module replacement (HMR) enabled.

## 🏗️ Build

```bash
# Build for production
pnpm build

# Preview production build
pnpm preview
```

Output directory: `build/`

## 🧪 Testing

```bash
# Run tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

### Test Structure

Tests are organized in the `__tests__/` directory:

```text
__tests__/
├── components/       # Component unit tests
├── services/         # API service tests
├── utils/           # Utility function tests
└── example.test.tsx # Example test template
```

### Writing Tests

Use the `example.test.tsx` file as a template for creating new tests:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import YourComponent from '../components/YourComponent';

describe('YourComponent', () => {
  it('should render successfully', () => {
    render(<YourComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### Test Utilities

The `src/test-setup.ts` file provides:

- **Jest-DOM matchers** for better assertions
- **Automatic cleanup** after each test
- **window.matchMedia mock** for components using media queries
- **React 18 compatibility** setup

## 📁 Project Structure

```text
apps/frontend/
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # shadcn/ui base components
│   │   └── figma/          # Figma-specific components
│   ├── services/           # API services
│   ├── styles/             # Global styles
│   └── main.tsx            # Application entry point
├── __tests__/              # Test files
├── public/                 # Static assets
├── build/                  # Production build output
└── vite.config.ts          # Vite configuration
```

## 🔧 Configuration Files

- `vite.config.ts` - Vite configuration with SWC plugin and proxy setup
- `vitest.config.ts` - Vitest test configuration
- `eslint.config.js` - ESLint rules for React and TypeScript
- `postcss.config.cjs` - PostCSS with Tailwind CSS
- `tsconfig.json` - TypeScript compiler options

## 🌐 API Integration

The frontend communicates with the backend API through:

- **Development**: Vite proxy forwards `/api` requests to `http://localhost:3001`
- **Production**: Configure `VITE_API_URL` environment variable

## 🎨 UI Components

This project uses [shadcn/ui](https://ui.shadcn.com/), a collection of
re-usable components built with Radix UI and Tailwind CSS. Components are
located in `src/components/ui/`.

## 🔌 Vite Plugins

- **@vitejs/plugin-react-swc** - Fast Refresh using SWC instead of Babel for improved performance

## 📝 ESLint Configuration

The project uses TypeScript ESLint with:

- Recommended TypeScript rules
- React Hooks rules
- React Refresh rules
- Special rules for test files

## 🔗 Related

- [Backend README](../backend/README.md)
- [Project Root Documentation](../../README.md)
- [Shared Types Package](../../packages/shared-types/)

## 📄 License

Part of the GitRay project.
  