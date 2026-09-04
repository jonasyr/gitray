<!-- markdownlint-disable MD013 -->

# GitRay architecture diagrams

Twelve interactive, self-contained HTML diagrams produced with Archify. Open any `.html` directly
in a browser — no server or build step required. Each supports pan/zoom, search, relationship
tracing, guided views, light/dark themes and PNG/SVG export.

Every diagram was validated at Archify's `showcase` profile (9/9 artifact checks, 0 errors,
0 warnings) and verified in a real browser at 1440x900, 1600x1000, 1920x1080 and 2048x1320 in both
themes.

## Current state — what the repository actually is

| Diagram | Shows |
| --- | --- |
| `gitray-current-architecture.html` | System context, containers and backend components, including the three clone paths and the duplicate route surface |
| `gitray-module-dependencies.html` | The six-module strongly connected component and fan-in distribution |
| `gitray-persistence-architecture.html` | The four persistence mechanisms — stands in for an ER diagram, as there is no database |
| `gitray-request-lifecycle.html` | Cold-path request sequence; pagination never reaches the data path |
| `gitray-auth.html` | Public analytics versus the admin-token path |
| `gitray-background-jobs.html` | Eight recurring timers, how each starts, and which cannot be stopped |
| `gitray-external.html` | External systems and the SSRF boundary |
| `gitray-lock-collision.html` | How the dashboard triggers C-1 — the defect reproduced on the running system |

## Target state — four options, drawn to be comparable

| Diagram | Option |
| --- | --- |
| `gitray-option-a.html` | A — Minimal stabilisation |
| `gitray-target-architecture.html` | **B — Incremental modular refactor (recommended)** |
| `gitray-option-c.html` | C — PostgreSQL + job queue |
| `gitray-option-d.html` | D — Single process, no Redis |

Option A reuses the exact node positions of the current-state diagram so the two can be flipped
between; B, C and D share a second common layout for the same reason.

## Regenerating

The `.json` files are the sources. To rebuild one:

```bash
archify deliver architecture gitray-current.architecture.json gitray-current-architecture.html \
  --quality showcase --repo-root <path-to-repo>
```

Full analysis: [`../BACKEND_ARCHITECTURE_AUDIT.md`](../BACKEND_ARCHITECTURE_AUDIT.md)
