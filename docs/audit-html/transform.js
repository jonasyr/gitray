/* This file is stringified and evaluated inside a headless browser page by
   build.mjs, alongside the Mermaid and highlight.js bundles. */
/* global document, mermaid, hljs, NodeFilter */
// eslint-disable-next-line no-unused-vars
async function transform(payload) {
  const errors = [];
  const src = document.getElementById('src');
  src.innerHTML = payload.html;

  // ---------------------------------------------------------- headings ------
  const used = new Set();
  const slug = (text) => {
    let s =
      text
        .toLowerCase()
        .replace(/[`*_]/g, '')
        .replace(/[^a-z0-9À-ɏ]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';
    let out = s;
    let n = 2;
    while (used.has(out)) {
      out = s + '-' + n;
      n += 1;
    }
    used.add(out);
    return out;
  };

  const headings = Array.from(src.querySelectorAll('h2, h3, h4, h5'));
  const numberToId = new Map();
  headings.forEach((h) => {
    h.id = slug(h.textContent);
    // "4.1 Container view" / "17.9 Roadmap..." / "9. External Systems"
    const m = h.textContent.match(/^\s*(\d+(?:\.\d+[a-z]?)?)[.\s]/);
    if (m && !numberToId.has(m[1])) numberToId.set(m[1], h.id);
  });

  // ---------------------------------------------------------- contents ------
  let tocCount = 0;
  const items = headings
    .filter((h) => h.tagName === 'H2' || h.tagName === 'H3')
    .map((h) => {
      tocCount += 1;
      const lvl = h.tagName === 'H2' ? 2 : 3;
      const label = h.textContent.replace(/\s+/g, ' ').trim();
      return `<li class="lvl${lvl}"><a href="#${h.id}">${label
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</a></li>`;
    });
  const toc = `<ol>${items.join('')}</ol>`;

  // ---------------------------------------------------------- mermaid -------
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
    themeVariables: {
      background: '#ffffff',
      primaryColor: '#e7eef4',
      primaryTextColor: '#101720',
      primaryBorderColor: '#15496e',
      secondaryColor: '#f5f7f9',
      tertiaryColor: '#ffffff',
      lineColor: '#67717e',
      textColor: '#101720',
      fontSize: '14px',
      nodeBorder: '#15496e',
      clusterBkg: '#f5f7f9',
      clusterBorder: '#c3ccd6',
      labelBoxBorderColor: '#c3ccd6',
      actorBkg: '#e7eef4',
      actorBorder: '#15496e',
      actorTextColor: '#101720',
      signalColor: '#39434f',
      signalTextColor: '#101720',
      noteBkgColor: '#fdf1e3',
      noteBorderColor: '#c3ccd6',
      noteTextColor: '#101720',
    },
  });

  let mermaidCount = 0;
  const slots = Array.from(src.querySelectorAll('.mermaid-src'));
  for (const slot of slots) {
    const idx = Number(slot.dataset.idx);
    const code = payload.mermaid[idx];
    try {
      const { svg } = await mermaid.render('mmd-' + idx, code);
      const figure = document.createElement('figure');
      figure.className = 'mermaid-fig';
      const body = document.createElement('div');
      body.className = 'figbody';
      body.innerHTML = svg;
      const el = body.querySelector('svg');
      if (el) {
        el.removeAttribute('height');
        el.setAttribute('role', 'img');
      }
      figure.appendChild(body);
      slot.replaceWith(figure);
      mermaidCount += 1;
    } catch (e) {
      errors.push(
        'mermaid[' + idx + ']: ' + (e && e.message ? e.message : String(e))
      );
    }
  }

  // ---------------------------------------------------------- figures -------
  let figureCount = 0;
  Array.from(src.querySelectorAll('p')).forEach((p) => {
    if (p.children.length !== 1) return;
    const a = p.firstElementChild;
    if (a.tagName !== 'A' || a.children.length !== 1) return;
    const img = a.firstElementChild;
    if (img.tagName !== 'IMG') return;
    if (p.textContent.trim() !== '') return;

    const figure = document.createElement('figure');
    figure.appendChild(a);

    const next = p.nextElementSibling;
    if (
      next &&
      next.tagName === 'P' &&
      next.children.length === 1 &&
      next.firstElementChild.tagName === 'EM'
    ) {
      const cap = document.createElement('figcaption');
      cap.innerHTML = next.firstElementChild.innerHTML;
      figure.appendChild(cap);
      next.remove();
    }
    p.replaceWith(figure);
    figureCount += 1;
  });

  // The Markdown uses a horizontal rule before most sections; the h2 carries its
  // own rule, so the pair reads as dead space. Keep rules that divide content.
  var rulesDropped = 0;
  Array.prototype.forEach.call(src.querySelectorAll('hr'), function (hr) {
    var prev = hr.previousElementSibling;
    if (prev && prev.tagName === 'HR') {
      hr.remove();
      rulesDropped += 1;
    }
  });
  Array.prototype.forEach.call(src.querySelectorAll('hr'), function (hr) {
    var next = hr.nextElementSibling;
    if (next && next.tagName === 'H2') {
      hr.remove();
      rulesDropped += 1;
    }
  });

  // ---------------------------------------------------------- tables --------
  let tableCount = 0;
  Array.from(src.querySelectorAll('table')).forEach((t) => {
    const wrap = document.createElement('div');
    wrap.className = 'scroller';
    t.replaceWith(wrap);
    wrap.appendChild(t);
    tableCount += 1;
  });

  // ---------------------------------------------------------- code ----------
  let codeCount = 0;
  const langs = {
    ts: 'typescript',
    typescript: 'typescript',
    bash: 'bash',
    sh: 'bash',
    sql: 'sql',
  };
  Array.from(src.querySelectorAll('pre > code')).forEach((c) => {
    const cls = (c.className.match(/language-([a-z]+)/) || [])[1];
    const lang = langs[cls];
    if (!lang || !hljs.getLanguage(lang)) return;
    try {
      c.innerHTML = hljs.highlight(c.textContent, {
        language: lang,
        ignoreIllegals: true,
      }).value;
      c.classList.add('hljs');
      codeCount += 1;
    } catch (e) {
      errors.push('highlight(' + lang + '): ' + e.message);
    }
  });

  // ---------------------------------------------------------- chips ---------
  let chipCount = 0;
  Array.from(src.querySelectorAll('h4, h5')).forEach((h) => {
    const first = h.firstChild;
    if (!first || first.nodeType !== 3) return;
    const m = first.nodeValue.match(
      /^\s*(?:Finding\s+)?([CSRQ])-(\d+[a-z]?)\b/
    );
    if (!m) return;
    const chip = document.createElement('span');
    chip.className = 'chip chip-' + m[1].toLowerCase();
    chip.textContent = m[1] + '-' + m[2];
    first.nodeValue = first.nodeValue
      .slice(m[0].length)
      .replace(/^\s*[-–—]\s*/, ' ');
    h.insertBefore(chip, first);
    chipCount += 1;
  });

  // ---------------------------------------------------------- xrefs ---------
  let xrefCount = 0;
  const SKIP = new Set([
    'A',
    'CODE',
    'PRE',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'SCRIPT',
    'STYLE',
  ]);
  const walker = document.createTreeWalker(src, NodeFilter.SHOW_TEXT);
  const targets = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    let el = node.parentElement;
    let skip = false;
    while (el && el !== src) {
      if (SKIP.has(el.tagName)) {
        skip = true;
        break;
      }
      el = el.parentElement;
    }
    if (!skip && /§\s?\d/.test(node.nodeValue)) targets.push(node);
  }
  targets.forEach((node) => {
    const parts = node.nodeValue.split(/(§\s?\d+(?:\.\d+[a-z]?)?)/g);
    if (parts.length < 2) return;
    const frag = document.createDocumentFragment();
    parts.forEach((part) => {
      const m = part.match(/^§\s?(\d+(?:\.\d+[a-z]?)?)$/);
      const id = m && numberToId.get(m[1]);
      if (id) {
        const a = document.createElement('a');
        a.className = 'xref';
        a.href = '#' + id;
        a.textContent = part;
        frag.appendChild(a);
        xrefCount += 1;
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    });
    node.replaceWith(frag);
  });

  // ---------------------------------------------------------- h2 measure ----
  Array.from(src.querySelectorAll('h2')).forEach((h) => {
    const span = document.createElement('span');
    span.className = 'inner-h';
    while (h.firstChild) span.appendChild(h.firstChild);
    h.appendChild(span);
  });

  return {
    content: src.innerHTML,
    toc,
    tocCount,
    headingCount: headings.length,
    mermaidCount,
    figureCount,
    tableCount,
    codeCount,
    chipCount,
    xrefCount,
    rulesDropped,
    errors,
  };
}
