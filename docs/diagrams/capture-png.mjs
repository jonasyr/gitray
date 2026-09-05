/**
 * Renders every delivered Archify diagram in this directory to a PNG in ./img/.
 *
 * The PNGs are what the Markdown audits embed inline; the .html files stay the
 * interactive source of truth. Re-run this after `archify deliver` changes any
 * diagram, or the embedded images silently drift from the diagrams they claim
 * to show.
 *
 * The page is captured under its own `@media print` stylesheet, which is what
 * hides the viewer chrome (toolbar, guided-views bar, navigation dock), forces
 * the light palette, and reveals the node detail tags. Nothing is drawn here
 * that the delivered artifact does not already contain.
 *
 *   ARCHIFY_CHROME=<path to chrome/edge> node docs/diagrams/capture-png.mjs
 *
 * ARCHIFY_SKILL overrides the Archify install location; ARCHIFY_CHROME is only
 * needed when no Chrome or Chromium is discoverable on PATH.
 */
/* global process, console, Buffer, URL */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL = process.env.ARCHIFY_SKILL
  || path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'skills', 'archify');
const visualCheck = path.join(SKILL, 'bin', 'visual-check.mjs');
if (!fs.existsSync(visualCheck)) {
  throw new Error(`Archify not found at ${SKILL}. Set ARCHIFY_SKILL to its directory.`);
}
const { findChrome, ChromeVisualBrowser } = await import(pathToFileURL(visualCheck).href);

const DIA = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIA, 'img');
const WIDTH = 1600;
const SCALE = Number(process.env.CAPTURE_SCALE || 2);

fs.mkdirSync(OUT, { recursive: true });
const files = fs.readdirSync(DIA)
  .filter((f) => f.endsWith('.html') && !f.includes('.visual-check.'))
  .sort();

const chrome = findChrome({});
if (!chrome) throw new Error('No Chrome or Chromium found. Set ARCHIFY_CHROME.');

const browser = new ChromeVisualBrowser(chrome);
const sessionId = await browser.sessionPromise;
const { cdp } = browser;

const evaluate = async (expression) => {
  const result = await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
};

// Settle fonts and layout, balance the print card grid, and measure the page shell.
const SETTLE = `(function () {
  document.documentElement.setAttribute('data-motion', 'still');
  var ready = (document.fonts && document.fonts.ready)
    ? document.fonts.ready.catch(function () {})
    : Promise.resolve();
  return ready.then(function () {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { requestAnimationFrame(resolve); });
    });
  }).then(function () {
    var cards = document.querySelector('.cards');
    if (cards) {
      var columns = cards.children.length <= 3 ? cards.children.length : 2;
      var style = document.createElement('style');
      style.textContent = '.cards{grid-template-columns:repeat(' + columns + ',1fr) !important;}';
      document.head.appendChild(style);
    }
    var shell = document.querySelector('.container').getBoundingClientRect();
    return { x: shell.x, y: shell.y, w: shell.width, h: shell.height, bottom: shell.bottom };
  });
})()`;

for (const file of files) {
  let height = 1000;
  let rect = null;
  // The page is not scrolled; grow the viewport until the whole shell is on screen.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height, deviceScaleFactor: 1, mobile: false,
    }, sessionId);
    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
    const url = new URL(pathToFileURL(path.join(DIA, file)).href);
    url.searchParams.set('theme', 'light');
    const loaded = cdp.waitFor('Page.loadEventFired', sessionId);
    const navigation = await cdp.send('Page.navigate', { url: url.href }, sessionId);
    if (navigation.errorText) throw new Error(`Navigation failed: ${navigation.errorText}`);
    await loaded;
    rect = await evaluate(SETTLE);
    if (rect.bottom <= height - 8) break;
    height = Math.ceil(rect.bottom + 60);
  }

  const capture = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: SCALE },
  }, sessionId, 30000);
  if (!capture.data) throw new Error(`Empty capture for ${file}`);

  const out = path.join(OUT, file.replace(/\.html$/, '.png'));
  fs.writeFileSync(out, Buffer.from(capture.data, 'base64'));
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`${path.basename(out)}  ${Math.round(rect.w)}x${Math.round(rect.h)} @${SCALE}x  ${kb}K`);
}

await browser.close();
