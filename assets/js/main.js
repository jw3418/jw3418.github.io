/* Reading progress bar */
(function () {
  var bar = document.getElementById('progress-bar');
  if (!bar) return;

  function update() {
    var scrolled = window.scrollY;
    var total = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = total > 0 ? (scrolled / total * 100) + '%' : '0%';
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
})();

/* Back-to-top button */
(function () {
  var btn = document.getElementById('back-to-top');
  if (!btn) return;

  window.addEventListener('scroll', function () {
    btn.classList.toggle('visible', window.scrollY > 320);
  }, { passive: true });

  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

/* Code copy buttons */
(function () {
  var blocks = document.querySelectorAll('.post-content .highlight, .post-content pre');

  blocks.forEach(function (block) {
    /* Don't add a second button if .highlight wraps a <pre> */
    if (block.tagName === 'PRE' && block.closest('.highlight')) return;

    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'copy';

    btn.addEventListener('click', function () {
      var code = block.querySelector('code');
      if (code && code.classList.contains('language-mermaid')) return;
      var text = (code ? code.textContent : block.textContent) || '';

      var done = function (ok) {
        btn.textContent = ok ? 'copied!' : 'error';
        if (ok) btn.classList.add('copied');
        setTimeout(function () {
          btn.textContent = 'copy';
          btn.classList.remove('copied');
        }, 1600);
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { done(true); }).catch(function () { done(false); });
      } else {
        /* Fallback for non-https / older browsers */
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          done(true);
        } catch (e) {
          done(false);
        }
        document.body.removeChild(ta);
      }
    });

    var codeEl = block.querySelector('code');
    if (codeEl && codeEl.classList.contains('language-mermaid')) return;

    /* position:relative is set in CSS already */
    block.appendChild(btn);
  });
})();

/* Mermaid diagrams */
(function () {
  if (typeof mermaid === 'undefined') return;

  var mermaidCodes = document.querySelectorAll('.post-content code.language-mermaid');
  if (!mermaidCodes.length) return;

  mermaidCodes.forEach(function (code) {
    var pre = code.closest('pre');
    if (!pre) return;

    var wrapper = document.createElement('div');
    wrapper.className = 'mermaid';
    wrapper.textContent = code.textContent;

    pre.replaceWith(wrapper);
  });

  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    flowchart: {
      htmlLabels: true,
      useMaxWidth: true,
      curve: 'linear'
    },
    sequence: {
      useMaxWidth: true
    }
  });

  mermaid.run({ querySelector: '.mermaid' });
})();

/* Estimated reading time */
(function () {
  var el = document.getElementById('reading-time');
  if (!el) return;

  var content = document.querySelector('.post-content');
  if (!content) return;

  var words = content.textContent.trim().split(/\s+/).length;
  /* ~200 Korean chars/min is roughly equivalent to ~200 words/min */
  var minutes = Math.max(1, Math.round(words / 200));
  el.textContent = minutes;
})();

/* Category filter */
(function () {
  var buttons = document.querySelectorAll('.cat-btn');
  var items   = document.querySelectorAll('#post-list li');
  var empty   = document.getElementById('post-list-empty');
  if (!buttons.length || !items.length) return;

  function applyFilter(cat) {
    var visible = 0;
    items.forEach(function (li) {
      if (cat === 'all') {
        li.style.display = '';
        visible++;
      } else {
        var cats = (li.dataset.categories || '').split(/\s+/).filter(Boolean);
        var show = cats.indexOf(cat) !== -1;
        li.style.display = show ? '' : 'none';
        if (show) visible++;
      }
    });
    if (empty) empty.style.display = visible === 0 ? '' : 'none';
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      buttons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      applyFilter(btn.dataset.cat);
    });
  });
})();
