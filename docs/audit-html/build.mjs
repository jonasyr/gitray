/**
 * Renders docs/BACKEND_ARCHITECTURE_AUDIT.md into a single self-contained file:
 *
 *   docs/GitRay-Architecture-Audit.html   (send it to anyone; opens offline)
 *   docs/GitRay-Architecture-Audit.pdf    (with --pdf)
 *
 * Everything is inlined - stylesheet, the twelve diagram PNGs as data URIs, the
 * five Mermaid figures pre-rendered to SVG, syntax highlighting applied at build
 * time. The output makes no network requests. Relative links to the interactive
 * diagrams are rewritten to the branch on GitHub, because they cannot resolve
 * from a standalone file.
 *
 * Re-run after editing the audit, or the HTML and PDF silently keep showing the
 * previous version:
 *
 *   ARCHIFY_CHROME=<path to chrome/edge> node docs/audit-html/build.mjs --pdf
 *
 * Inputs beside this file: style.css (design), transform.js (runs in the page:
 * ids, contents, figures, chips, cross-references), runtime.js (ships with the
 * output: progress, scroll-spy, contents filter).
 *
 * Requirements: Node 20+, a Chrome or Chromium (ARCHIFY_CHROME if not on PATH),
 * the repo's markdown-it, and network access on first run to cache the pinned
 * Mermaid and highlight.js bundles into ./.cache/.
 */
/* global process, console, fetch, Buffer */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const SRC = path.join(REPO, 'docs/BACKEND_ARCHITECTURE_AUDIT.md');
const OUT = path.join(REPO, 'docs/GitRay-Architecture-Audit.html');
const OUT_PDF = path.join(REPO, 'docs/GitRay-Architecture-Audit.pdf');
const CACHE = path.join(HERE, '.cache');
const WANT_PDF = process.argv.includes('--pdf');

const BRANCH = process.env.DOC_BRANCH || 'docs/architecture-audit';
const BLOB = `https://github.com/jonasyr/gitray/blob/${BRANCH}/docs`;

const require = createRequire(pathToFileURL(path.join(REPO, 'package.json')).href);
const MarkdownIt = require('markdown-it');

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ------------------------------------------------------------- CDN bundles ---
const BUNDLES = {
  'mermaid.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js',
  'highlight.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  'typescript.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/typescript.min.js',
  'bash.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/bash.min.js',
  'sql.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/sql.min.js',
};

fs.mkdirSync(CACHE, { recursive: true });
for (const [file, url] of Object.entries(BUNDLES)) {
  const target = path.join(CACHE, file);
  if (fs.existsSync(target)) continue;
  process.stderr.write(`fetching ${file}\n`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch ${url}: HTTP ${response.status}`);
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}
const lib = (f) => fs.readFileSync(path.join(CACHE, f), 'utf8');

// ---------------------------------------------------------------- markdown ---
let md = fs.readFileSync(SRC, 'utf8');
md = md.replace(/^<!-- markdownlint-disable MD013 -->\n+/, '');

const DOC_TITLE = md.match(/^# (.+)$/m)[1].trim();
md = md.replace(/^# .+\n/, '');

const front = {};
md = md.split('\n').filter((line) => {
  const m = line.match(/^\*\*(Version|Date|Supersedes|Repository state):\*\* (.+)$/);
  if (!m) return true;
  front[m[1]] = m[2].trim();
  return false;
}).join('\n');
md = md.replace(/^\s*---\s*\n/, '');

const mermaidBlocks = [];
const mdit = new MarkdownIt({ html: true, linkify: true, typographer: false });
const defaultFence = mdit.renderer.rules.fence.bind(mdit.renderer.rules);
mdit.renderer.rules.fence = (tokens, idx, options, env, self) => {
  if ((tokens[idx].info || '').trim() === 'mermaid') {
    const i = mermaidBlocks.push(tokens[idx].content) - 1;
    return `<div class="mermaid-src" data-idx="${i}"></div>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

let html = mdit.render(md);

// ------------------------------------------------------------ inline assets --
const imgDir = path.join(REPO, 'docs/diagrams/img');
let inlined = 0;
html = html.replace(/src="diagrams\/img\/([a-z0-9-]+\.png)"/g, (_, file) => {
  const p = path.join(imgDir, file);
  if (!fs.existsSync(p)) throw new Error(`Missing diagram image: ${p}. Run docs/diagrams/capture-png.mjs.`);
  inlined += 1;
  return `src="data:image/png;base64,${fs.readFileSync(p).toString('base64')}"`;
});

let rewritten = 0;
html = html.replace(/href="diagrams\/([a-z0-9-]+\.html)"/g, (_, file) => {
  rewritten += 1;
  return `href="${BLOB}/diagrams/${file}"`;
});

// ------------------------------------------------------------------ browser --
const archify = process.env.ARCHIFY_SKILL
  || path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'skills', 'archify');
const visualCheck = path.join(archify, 'bin', 'visual-check.mjs');
if (!fs.existsSync(visualCheck)) {
  throw new Error(`Archify not found at ${archify}. Set ARCHIFY_SKILL to its directory.`);
}
const { findChrome, ChromeVisualBrowser } = await import(pathToFileURL(visualCheck).href);
const chrome = findChrome({});
if (!chrome) throw new Error('No Chrome or Chromium found. Set ARCHIFY_CHROME.');

const browser = new ChromeVisualBrowser(chrome);
const sessionId = await browser.sessionPromise;
const { cdp } = browser;

const evaluate = async (expression) => {
  const r = await cdp.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  }, sessionId, 180000);
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result?.value;
};

// A scratch page carrying Mermaid and highlight.js, where the DOM work happens.
const stagePath = path.join(CACHE, 'stage.html');
fs.writeFileSync(stagePath, `<!doctype html><html><head><meta charset="utf-8"><title>stage</title>
<script>${lib('highlight.min.js')}</script>
<script>${lib('typescript.min.js')}</script>
<script>${lib('bash.min.js')}</script>
<script>${lib('sql.min.js')}</script>
<script>${lib('mermaid.min.js')}</script>
</head><body><div id="src"></div></body></html>`);

let loaded = cdp.waitFor('Page.loadEventFired', sessionId);
await cdp.send('Page.navigate', { url: pathToFileURL(stagePath).href }, sessionId);
await loaded;

const transform = fs.readFileSync(path.join(HERE, 'transform.js'), 'utf8');
const result = await evaluate(
  `window.__payload = ${JSON.stringify({ html, mermaid: mermaidBlocks })};\n`
  + `(${transform})(window.__payload)`,
);
if (result.errors.length) throw new Error('Transform errors:\n' + result.errors.join('\n'));

// ----------------------------------------------------------------- assemble --
const css = fs.readFileSync(path.join(HERE, 'style.css'), 'utf8');
const runtime = fs.readFileSync(path.join(HERE, 'runtime.js'), 'utf8');

const SPLIT = ' — ';
const [PRODUCT, SUBJECT] = DOC_TITLE.includes(SPLIT) ? DOC_TITLE.split(SPLIT) : ['GitRay', DOC_TITLE];

const STANDFIRST = 'An evidence-based audit of the GitRay monorepo: what the system actually is, '
  + 'five verified defects including a live cross-request data-corruption bug, and a measured, '
  + 'phased route to a PostgreSQL-backed index.';

const metaHtml = [
  ['Version', front.Version],
  ['Date', front.Date],
  ['Repository state', front['Repository state']],
  ['Supersedes', front.Supersedes, 'wide'],
].filter(([, v]) => v)
  .map(([k, v, cls]) => `<div${cls ? ` class="${cls}"` : ''}><dt>${esc(k)}</dt>`
    + `<dd>${mdit.renderInline(v)}</dd></div>`)
  .join('\n        ');


fs.writeFileSync(OUT, `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(DOC_TITLE)}</title>
<meta name="description" content="${esc(STANDFIRST)}">
<meta name="color-scheme" content="light">
<style>
${css}
</style>
</head>
<body>
<div id="progress" role="presentation"></div>
<div class="shell">
  <aside class="rail">
    <div class="rail-brand">
      <b>${esc(PRODUCT)}</b>
      <span>Architecture Audit</span>
    </div>
    <input class="rail-filter" id="tocFilter" type="search" placeholder="Filter contents" aria-label="Filter contents">
    <nav class="toc" id="tocRail" aria-label="Table of contents">
      ${result.toc}
    </nav>
    <p class="rail-foot">${esc(front.Version || '')} &middot; ${esc(front.Date || '')}<br>Self-contained &mdash; no network required.</p>
  </aside>

  <main>
    <div class="inner">
      <header class="masthead">
        <p class="eyebrow">${esc(PRODUCT)} &middot; Internal engineering report</p>
        <h1>${esc(SUBJECT)}</h1>
        <p class="standfirst">${esc(STANDFIRST)}</p>
        <dl class="meta">
        ${metaHtml}
        </dl>
      </header>

      <details class="toc-mobile">
        <summary>Contents</summary>
        <nav class="toc" aria-label="Table of contents">${result.toc}</nav>
      </details>

      <article class="prose" id="prose">
${result.content}
      </article>

      <p class="colophon">Rendered from <code>docs/BACKEND_ARCHITECTURE_AUDIT.md</code>
      (version ${esc(front.Version || '')}, ${esc(front.Date || '')}) by
      <code>docs/audit-html/build.mjs</code>. Diagrams are the delivered Archify artifacts; Mermaid
      figures are rendered from the source in the Markdown. Every figure links to its interactive
      version on the branch.</p>
    </div>
  </main>
</div>
<script>
${runtime}
</script>
</body>
</html>
`);

const report = {
  html: OUT,
  bytes: fs.statSync(OUT).size,
  imagesInlined: inlined,
  diagramLinksRewritten: rewritten,
  mermaidRendered: result.mermaidCount,
  headings: result.headingCount,
  tocEntries: result.tocCount,
  tables: result.tableCount,
  figures: result.figureCount,
  chips: result.chipCount,
  crossReferences: result.xrefCount,
  codeBlocksHighlighted: result.codeCount,
  separatorRulesDropped: result.rulesDropped,
};

// ---------------------------------------------------------------------- pdf --
if (WANT_PDF) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false,
  }, sessionId);
  loaded = cdp.waitFor('Page.loadEventFired', sessionId);
  await cdp.send('Page.navigate', { url: pathToFileURL(OUT).href }, sessionId);
  await loaded;
  await evaluate(`(document.fonts && document.fonts.ready
    ? document.fonts.ready.catch(function () {})
    : Promise.resolve()).then(function () {
      return new Promise(function (r) { setTimeout(r, 400); });
    })`);

  const chromeFont = 'font:8px -apple-system,Segoe UI,Arial;color:#97a1ad;width:100%;padding:0 14mm;';
  const pdf = await cdp.send('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="${chromeFont}"><span style="float:left">`
      + 'GitRay &middot; Architecture Audit &amp; Refactoring Strategy</span></div>',
    footerTemplate: `<div style="${chromeFont}"><span style="float:right">`
      + '<span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  }, sessionId, 300000);
  fs.writeFileSync(OUT_PDF, Buffer.from(pdf.data, 'base64'));
  report.pdf = OUT_PDF;
  report.pdfBytes = fs.statSync(OUT_PDF).size;
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
