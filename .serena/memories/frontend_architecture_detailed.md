# GitRay - Frontend Architecture (shadcn/ui Migration)

## Overview

The GitRay frontend has been completely redesigned and migrated to use **shadcn/ui**, a modern component library built on Radix UI primitives. This represents a major architectural shift from the previous implementation.

## Current Branch

**Branch**: `87-featfrontend-ui-redesign-migration-to-shadcnui`
**Status**: Active development - UI redesign in progress

## Technology Stack

### Core Technologies

- **React**: 18.3.1 (not 19 as initially documented)
- **TypeScript**: 5.7+ (strict mode)
- **Vite**: 6.3+ (build tool with HMR)
- **Tailwind CSS**: 4.1+ (utility-first styling)

### UI Component Library - shadcn/ui

shadcn/ui is NOT a traditional component library but a collection of re-usable components that you copy into your codebase:

- Built on **Radix UI** primitives (headless, accessible components)
- Styled with **Tailwind CSS**
- Uses **class-variance-authority (CVA)** for variant management
- Customizable and owns the code (no npm package dependency for components)

### Supporting Libraries

- **@radix-ui/react-\***: 30+ Radix UI primitive packages for accessibility
- **class-variance-authority**: Type-safe variant-based styling
- **clsx** & **tailwind-merge**: Conditional and conflict-free className merging
- **next-themes**: Dark/light mode management with system detection
- **lucide-react**: Icon library (consistent, tree-shakeable)
- **sonner**: Toast notification system
- **motion** (Framer Motion): Animation library
- **react-hook-form**: Form state management and validation
- **recharts**: Charting library (replaces ApexCharts)
- **@rive-app/react-canvas**: Rive animation integration
- **embla-carousel-react**: Carousel functionality
- **react-day-picker**: Date picker component
- **react-resizable-panels**: Resizable panel layouts
- **vaul**: Drawer component (mobile-friendly)
- **cmdk**: Command palette component

## Component Architecture

### Directory Structure

```
apps/frontend/src/
├── components/
│   ├── ui/                    # shadcn/ui components (47+)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── tabs.tsx
│   │   ├── dialog.tsx
│   │   ├── drawer.tsx
│   │   ├── ...
│   │   └── utils.ts           # cn() utility
│   ├── figma/                 # Figma design references
│   ├── Header.tsx
│   ├── Footer.tsx
│   ├── LandingPage.tsx
│   ├── DashboardPage.tsx      # Main view
│   ├── [Visualization Components]
│   └── [Feature Components]
├── services/
│   └── api.ts                 # Backend API client
├── App.tsx                    # Root component
├── main.tsx                   # Entry point
└── index.css                  # Global styles + Tailwind
```

### shadcn/ui Component Catalog (components/ui/)

#### Form Controls

- **button**: Primary interaction element with variants (default, destructive, outline, secondary, ghost, link)
- **input**: Text input with error states
- **textarea**: Multi-line text input
- **label**: Accessible form labels
- **select**: Dropdown select (Radix UI based)
- **checkbox**: Checkboxes with indeterminate state
- **radio-group**: Radio button groups
- **switch**: Toggle switches
- **slider**: Range sliders
- **form**: React Hook Form integration

#### Layout & Containers

- **card**: Content card with header, content, footer sections
- **sheet**: Side panel overlays
- **drawer**: Mobile-friendly bottom drawer (vaul)
- **dialog**: Modal dialogs
- **alert-dialog**: Confirmation dialogs
- **popover**: Floating popovers
- **hover-card**: Hover-triggered cards
- **tooltip**: Hover tooltips
- **separator**: Divider lines
- **scroll-area**: Custom scrollbars
- **resizable**: Resizable panels

#### Navigation

- **tabs**: Tab navigation with content panels
- **accordion**: Collapsible sections
- **collapsible**: Simple collapse/expand
- **navigation-menu**: Complex navigation menus
- **menubar**: Menu bar navigation
- **breadcrumb**: Breadcrumb navigation
- **pagination**: Page navigation
- **dropdown-menu**: Context menus and dropdowns
- **context-menu**: Right-click menus

#### Data Display

- **table**: Responsive tables
- **badge**: Status badges and labels
- **avatar**: User avatars with fallbacks
- **alert**: Alert messages with variants
- **skeleton**: Loading skeletons
- **progress**: Progress bars
- **chart**: Recharts wrapper with theming

#### Advanced Components

- **carousel**: Image/content carousels (Embla)
- **command**: Command palette (⌘K)
- **calendar**: Date picker calendar
- **input-otp**: OTP input fields
- **sonner**: Toast notifications
- **toggle**: Toggle buttons
- **toggle-group**: Toggle button groups
- **sidebar**: App sidebar layout
- **aspect-ratio**: Aspect ratio containers

#### Utilities

- **utils.ts**: `cn()` function for merging Tailwind classes
- **use-mobile.ts**: Hook for responsive mobile detection

## Component Design Patterns

### Variant-Based Styling (CVA)

```typescript
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground',
        outline: 'border border-input hover:bg-accent',
        // ...
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
```

### Composition Pattern

```typescript
// Card component composition
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
  <CardFooter>
    {/* Footer */}
  </CardFooter>
</Card>
```

### Accessibility First

All components built on Radix UI primitives ensure:

- Keyboard navigation
- Screen reader support
- Focus management
- ARIA attributes
- Semantic HTML

## Application Components

### Core Pages

1. **App.tsx**: Root component
   - Theme management (dark/light/system)
   - Global state (loading, auth, modal states)
   - Repository data state (commits, heatmap, repo URL)
   - Page routing (landing vs dashboard)

2. **LandingPage.tsx**: Entry page
   - Repository URL input
   - Quick start guide
   - Feature highlights
   - Call-to-action

3. **DashboardPage.tsx**: Main analytics view
   - Tab-based navigation
   - Multiple visualization panels
   - Responsive grid layout
   - Data fetching and state management

### Layout Components

- **Header.tsx**: Top navigation
  - Logo/branding
  - Theme toggle
  - Settings button
  - News notifications
  - Sign-in state

- **Footer.tsx**: Bottom footer
  - Links (privacy, terms, contact)
  - Copyright
  - Social links

### Visualization Components

1. **CommitHeatmap.tsx**: GitHub-style contribution calendar
   - Daily commit counts
   - Color-coded intensity
   - Interactive tooltips
   - Date range filtering

2. **ActivityChart.tsx**: Time-series activity
   - Line/area charts
   - Commit frequency over time
   - Author filtering
   - Recharts-based

3. **CodeChurnChart.tsx**: Code change metrics
   - Lines added/deleted
   - Churn rate visualization
   - Risk level indicators
   - Stability trends

4. **FileDistributionChart.tsx**: File type distribution
   - Pie/donut charts
   - Language breakdown
   - Interactive legends
   - Percentage calculations

5. **FileTypeList.tsx**: Detailed file breakdown
   - Categorized lists (code, docs, config, assets)
   - File counts and percentages
   - Icon indicators
   - Expandable sections

6. **GraphViewTimeline.tsx**: Git graph visualization
   - Branch visualization
   - Commit timeline
   - Merge tracking
   - Interactive navigation

7. **GitDiffViewer.tsx**: Commit diff display
   - Syntax-highlighted diffs
   - Side-by-side or unified view
   - File tree navigation
   - Line-by-line changes

### Feature Components

1. **AIInsights.tsx**: AI-powered analysis
   - Repository health score
   - Code quality recommendations
   - Team insights
   - Predictive analytics
   - **Note**: Likely placeholder for future AI features

2. **PremiumFeatures.tsx**: Premium upsell
   - Feature showcase
   - Pricing information
   - Upgrade prompts
   - Feature comparison

3. **SettingsDrawer.tsx**: User preferences
   - Theme selection
   - Display options
   - Notification preferences
   - Account settings

4. **NewsDrawer.tsx**: Product updates
   - Changelog
   - Feature announcements
   - Unread indicators
   - Dismissible items

5. **InfoModal.tsx**: Contextual help
   - "What is GitRay?"
   - Privacy information
   - Local/remote repo info
   - Tutorial content

### Utility Components

- **LoadingSpinner.tsx**: Loading indicator
- **RiveLoader.tsx**: Animated Rive-based loader
- **RiveLogo.tsx**: Animated logo

## Styling Approach

### Tailwind CSS 4.1

- **Utility-first CSS**: All styling via Tailwind utilities
- **Custom theme**: Defined in `tailwind.config.js`
- **CSS variables**: Theme colors defined as CSS variables for easy theming
- **Dark mode**: Class-based dark mode (`dark:` prefix)
- **Responsive**: Mobile-first breakpoints (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`)

### Theme System

- **next-themes**: System-aware theme switching
- **Theme options**: light, dark, system
- **CSS variables**: Colors defined as HSL values
  - `--background`, `--foreground`
  - `--primary`, `--primary-foreground`
  - `--secondary`, `--secondary-foreground`
  - `--muted`, `--muted-foreground`
  - `--accent`, `--accent-foreground`
  - `--destructive`, `--destructive-foreground`
  - `--border`, `--input`, `--ring`
  - `--chart-1` through `--chart-5`

### Component Styling Pattern

```typescript
import { cn } from './ui/utils';

export function MyComponent({ className, ...props }) {
  return (
    <div
      className={cn(
        "base-styles here",
        className // Allow style overrides
      )}
      {...props}
    />
  );
}
```

## State Management

### Local State (React Hooks)

- `useState` for component-level state
- `useEffect` for side effects (data fetching, theme application)
- `useMemo` for expensive computations
- `useCallback` for memoized callbacks

### No Global State Library

- No Redux, Zustand, or Context API currently
- State lifted to nearest common ancestor
- Props drilling for shared state
- Direct API calls from components

### Repository Data Flow

```
App.tsx (holds commits, heatmapData, repoUrl)
    ↓
DashboardPage.tsx (receives as props)
    ↓
Individual visualization components
```

## API Integration

### Centralized API Client (`services/api.ts`)

- Axios-based HTTP client
- Base URL configuration
- Request/response interceptors
- Error handling
- Type-safe with `@gitray/shared-types`

### API Methods

- `getRepositoryFullData(url, options)`: Fetch all repository data
- Additional methods for specific endpoints

### Type Safety

All API requests/responses typed with interfaces from `@gitray/shared-types`:

- `Commit`, `CommitHeatmapData`, `RepositorySummary`
- `FileTypeDistribution`, `CodeChurnAnalysis`
- Error types: `GitrayError`, `RepositoryError`, `ValidationError`

## Animation & Motion

### Framer Motion (`motion`)

- Component animations
- Page transitions
- Gesture animations
- Stagger effects

### Rive Animations

- Loading animations
- Logo animations
- Interactive illustrations
- Performance-optimized

## User Experience Features

### Toast Notifications (Sonner)

```typescript
import { toast } from 'sonner';

toast.success('Repository loaded successfully!');
toast.error('Failed to load repository');
toast.loading('Loading commits...');
```

### Dark/Light Mode

- System detection by default
- Manual toggle in header
- Persisted preference
- Smooth transitions

### Responsive Design

- Mobile-first approach
- Breakpoints: 640px, 768px, 1024px, 1280px, 1536px
- Adaptive layouts
- Touch-friendly interactions

### Accessibility

- Keyboard navigation
- Screen reader support
- Focus indicators
- Semantic HTML
- ARIA attributes (via Radix UI)

## Testing

### Test Setup (`test-setup.ts`)

- Vitest configuration
- Testing Library setup
- Mock setup for APIs

### Test Locations

- Co-located with components: `ComponentName.test.tsx`
- Located in `__tests__/` directory

### Testing Tools

- **@testing-library/react**: Component testing
- **@testing-library/jest-dom**: DOM matchers
- **@testing-library/user-event**: User interaction simulation
- **Vitest**: Test runner
- **@vitest/coverage-v8**: Coverage reporting

## Build & Development

### Development

```bash
pnpm dev:frontend  # Start Vite dev server (port 5173)
```

### Build

```bash
pnpm build:frontend  # Production build
```

### Build Output

- Optimized bundles in `dist/`
- Code splitting by route/component
- Asset optimization
- Source maps in development

## Migration Notes (Old → New)

### Removed Dependencies

- `react-calendar-heatmap` → Custom heatmap component
- `apexcharts` / `react-apexcharts` → Recharts
- `react-select` → Radix UI Select
- `date-fns` → (May still be in use, check)

### Added Dependencies

- All `@radix-ui/react-*` packages (30+)
- `class-variance-authority`, `clsx`, `tailwind-merge`
- `lucide-react` (icons)
- `sonner` (toasts)
- `next-themes` (theme management)
- `motion` (Framer Motion)
- `recharts` (charts)
- `react-hook-form` (forms)
- `vaul`, `cmdk`, `embla-carousel-react` (advanced components)

### Component Refactors

- Old `ActivityHeatmap.tsx` → New `CommitHeatmap.tsx`
- Old `CommitList.tsx` → Integrated into `DashboardPage.tsx` or removed
- Old `RepoInput.tsx` → Integrated into `LandingPage.tsx`
- New components: `Header`, `Footer`, `SettingsDrawer`, `NewsDrawer`, `InfoModal`
- New visualizations: `ActivityChart`, `CodeChurnChart`, `GraphViewTimeline`, `GitDiffViewer`
- New features: `AIInsights`, `PremiumFeatures`

### Styling Migration

- From custom CSS to Tailwind utilities
- Consistent design system via CSS variables
- Dark mode support added
- Responsive design improved

## Best Practices

### Component Creation

1. Use shadcn/ui components as building blocks
2. Compose with semantic HTML
3. Apply Tailwind utilities for styling
4. Use `cn()` utility for conditional classes
5. Ensure accessibility (keyboard, ARIA, focus)

### Styling Guidelines

1. Prefer Tailwind utilities over custom CSS
2. Use CSS variables for theme colors
3. Follow mobile-first responsive design
4. Use dark mode variants (`dark:`)
5. Keep specificity low

### Type Safety

1. Import types from `@gitray/shared-types`
2. Define component prop interfaces
3. Use strict TypeScript mode
4. Avoid `any` types

### Performance

1. Lazy load heavy components
2. Memoize expensive computations
3. Use proper React keys
4. Optimize re-renders
5. Code split by route

## Future Considerations

### Potential Improvements

- Global state management (Zustand/Context) if state becomes complex
- Route-based code splitting for better performance
- Progressive Web App (PWA) features
- Advanced animation system
- Real-time updates (WebSocket)
- Offline support
- Advanced filtering and search
- Export functionality (PDF, CSV)

### Known Limitations

- No global state management (may become limiting)
- Direct API calls from components (no data layer abstraction)
- Limited error boundary implementation
- No comprehensive loading state management
- AI features appear to be placeholders

## Debugging Tips

### Component Issues

1. Check Radix UI documentation for primitive usage
2. Verify Tailwind class application with browser DevTools
3. Use React DevTools for component hierarchy
4. Check console for accessibility warnings

### Styling Issues

1. Verify CSS variable values in `:root` and `.dark`
2. Check Tailwind class conflicts with browser inspector
3. Use `cn()` utility correctly for class merging
4. Ensure Tailwind CSS is properly imported in `index.css`

### Build Issues

1. Ensure `@gitray/shared-types` is built first
2. Check TypeScript errors: `tsc --noEmit`
3. Verify all imports resolve correctly
4. Clear Vite cache: `rm -rf .vite`
