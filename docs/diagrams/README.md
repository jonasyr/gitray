<!-- markdownlint-disable MD013 -->

# GitRay architecture diagrams

Twelve interactive, self-contained HTML diagrams produced with Archify. Open any `.html` directly
in a browser — no server or build step required. Each supports pan/zoom, search, relationship
tracing, guided views, light/dark themes and PNG/SVG export.

Each diagram also exists as a PNG in [`img/`](img), so it renders inline in Markdown. Those PNGs are
what [`../BACKEND_ARCHITECTURE_AUDIT.md`](../BACKEND_ARCHITECTURE_AUDIT.md) embeds in the section
each diagram belongs to. They are generated from the `.html`, never drawn by hand — see
[Regenerating](#regenerating). The gallery below shows all twelve.

Every diagram was validated at Archify's `showcase` profile (9/9 artifact checks, 0 errors,
0 warnings) and verified in a real browser at 1440x900, 1600x1000, 1920x1080 and 2048x1320 in both
themes.

## Current state — what the repository actually is

| Diagram | Shows |
| --- | --- |
| [`gitray-current-architecture.html`](gitray-current-architecture.html) | System context, containers and backend components, including the three clone paths and the duplicate route surface |
| [`gitray-module-dependencies.html`](gitray-module-dependencies.html) | The six-module strongly connected component and fan-in distribution |
| [`gitray-persistence-architecture.html`](gitray-persistence-architecture.html) | The four persistence mechanisms — stands in for an ER diagram, as there is no database |
| [`gitray-request-lifecycle.html`](gitray-request-lifecycle.html) | Cold-path request sequence; pagination never reaches the data path |
| [`gitray-auth.html`](gitray-auth.html) | Public analytics versus the admin-token path |
| [`gitray-background-jobs.html`](gitray-background-jobs.html) | Eight recurring timers, how each starts, and which cannot be stopped |
| [`gitray-external.html`](gitray-external.html) | External systems and the SSRF boundary |
| [`gitray-lock-collision.html`](gitray-lock-collision.html) | How the dashboard triggers C-1 — the defect reproduced on the running system |

## Target state — four options, drawn to be comparable

| Diagram | Option |
| --- | --- |
| [`gitray-option-a.html`](gitray-option-a.html) | A — Minimal stabilisation |
| [`gitray-target-architecture.html`](gitray-target-architecture.html) | **B — required foundation (Phases 0-5)** |
| [`gitray-option-c.html`](gitray-option-c.html) | **C — PostgreSQL + job queue ⭐ recommended destination** |
| [`gitray-option-d.html`](gitray-option-d.html) | D — Single process, no Redis (optional) |

The recommendation is **C reached through B's phases**: B is the prerequisite that makes the
persisted index correct, not an alternative to it. See the audit §15.1.

`gitray-option-c.html` was revised on 2026-09-05 after the team's planning vault was read: its cost
figures now include branch and tag coverage, and its cards carry the schema decisions that the
roadmap, the pricing tiers and GDPR make load-bearing (audit §17.9).

Option A reuses the exact node positions of the current-state diagram so the two can be flipped
between; B, C and D share a second common layout for the same reason.

## Gallery

Every image links to its interactive version.

### Current architecture — §4.1

[![System context, containers and backend components, including the three clone paths and the duplicate route surface](img/gitray-current-architecture.png)](gitray-current-architecture.html)

### Module dependencies — §5.1

[![Backend module dependency graph showing the six-module strongly connected component and the fan-in distribution](img/gitray-module-dependencies.png)](gitray-module-dependencies.html)

### Persistence — §7.1

[![The four persistence mechanisms: in-process cache, Redis, repository clones on disk, and advisory lock files](img/gitray-persistence-architecture.png)](gitray-persistence-architecture.html)

### Request lifecycle — §6.1

[![Cold-path request sequence for the dashboard load, showing pagination that never reaches the data path](img/gitray-request-lifecycle.png)](gitray-request-lifecycle.html)

### Authentication — §8.1

[![Public analytics endpoints versus the admin-token path](img/gitray-auth.png)](gitray-auth.html)

### Background jobs — §4.5

[![Eight recurring background timers, how each is started, and which cannot be stopped](img/gitray-background-jobs.png)](gitray-background-jobs.html)

### External systems — §9

[![External systems reached by GitRay and the SSRF validation boundary](img/gitray-external.png)](gitray-external.html)

### C-1, the lock collision — §10.1

[![Sequence showing how the dashboard's concurrent requests trigger the lock coalescing defect C-1](img/gitray-lock-collision.png)](gitray-lock-collision.html)

### Option A — minimal stabilisation

[![Option A: the current topology with the defects repaired and nothing moved](img/gitray-option-a.png)](gitray-option-a.html)

### Option B — required foundation

[![Option B: one clone path, one cache, one route style](img/gitray-target-architecture.png)](gitray-target-architecture.html)

### Option C — recommended destination

[![Option C: PostgreSQL-backed index with a two-phase job queue](img/gitray-option-c.png)](gitray-option-c.html)

### Option D — single process, no Redis

[![Option D: a single process with Redis dropped](img/gitray-option-d.png)](gitray-option-d.html)

## Regenerating

The `.json` files are the sources. To rebuild one:

```bash
archify deliver architecture gitray-current.architecture.json gitray-current-architecture.html \
  --quality showcase --repo-root <path-to-repo>
```

Then regenerate every embedded PNG, or the Markdown will keep showing the previous diagram:

```bash
node capture-png.mjs
```

`capture-png.mjs` drives the delivered `.html` in headless Chrome under its own `@media print`
stylesheet — which is what hides the viewer chrome, forces the light palette and reveals the node
detail tags — and writes `img/<name>.png` at 1600 CSS px wide, 2x. Set `ARCHIFY_CHROME` if no
Chrome or Chromium is on `PATH`, and `ARCHIFY_SKILL` if Archify is not at `~/.claude/skills/archify`.
It adds nothing the delivered artifact does not already contain.

Full analysis: [`../BACKEND_ARCHITECTURE_AUDIT.md`](../BACKEND_ARCHITECTURE_AUDIT.md)
