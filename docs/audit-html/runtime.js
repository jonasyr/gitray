/* This file is inlined into the generated HTML and runs in the browser. */
/* global document, window, Event */
(function () {
  'use strict';

  var progress = document.getElementById('progress');
  var rail = document.getElementById('tocRail');
  var filter = document.getElementById('tocFilter');
  var prose = document.getElementById('prose');

  // Reading progress.
  var ticking = false;
  function paintProgress() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var pct = max > 0 ? (window.scrollY / max) * 100 : 0;
    progress.style.width = Math.min(100, Math.max(0, pct)) + '%';
    ticking = false;
  }
  window.addEventListener(
    'scroll',
    function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(paintProgress);
      }
    },
    { passive: true }
  );
  paintProgress();

  // Scroll-spy: mark the section currently being read. Position-based rather
  // than intersection-based, so jumping straight to an anchor still resolves.
  if (rail && prose) {
    var links = {};
    Array.prototype.forEach.call(
      rail.querySelectorAll('a[href^="#"]'),
      function (a) {
        links[decodeURIComponent(a.getAttribute('href').slice(1))] = a;
      }
    );
    var marks = Array.prototype.filter.call(
      prose.querySelectorAll('h2[id], h3[id]'),
      function (h) {
        return links[h.id];
      }
    );
    var offsets = [];
    var current = null;

    function measure() {
      offsets = marks.map(function (h) {
        return {
          id: h.id,
          top: h.getBoundingClientRect().top + window.scrollY,
        };
      });
    }

    function spy() {
      if (!offsets.length) return;
      var y = window.scrollY + 96;
      var lo = 0;
      var hi = offsets.length - 1;
      var found = 0;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (offsets[mid].top <= y) {
          found = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      var id = offsets[found].id;
      if (id === current) return;
      if (current && links[current]) links[current].classList.remove('here');
      current = id;
      var a = links[id];
      a.classList.add('here');
      var box = a.getBoundingClientRect();
      var frame = rail.getBoundingClientRect();
      if (box.top < frame.top || box.bottom > frame.bottom)
        a.scrollIntoView({ block: 'nearest' });
    }

    measure();
    spy();
    window.addEventListener('scroll', spy, { passive: true });
    window.addEventListener(
      'resize',
      function () {
        measure();
        spy();
      },
      { passive: true }
    );
    window.addEventListener('load', function () {
      measure();
      spy();
    });
  }

  // Filter the contents list.
  if (filter && rail) {
    var entries = Array.prototype.map.call(
      rail.querySelectorAll('li'),
      function (li) {
        return { li: li, text: li.textContent.toLowerCase() };
      }
    );
    filter.addEventListener('input', function () {
      var q = filter.value.trim().toLowerCase();
      entries.forEach(function (entry) {
        entry.li.classList.toggle(
          'hidden',
          q !== '' && entry.text.indexOf(q) === -1
        );
      });
    });
    filter.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        filter.value = '';
        filter.dispatchEvent(new Event('input'));
      }
    });
  }
})();
