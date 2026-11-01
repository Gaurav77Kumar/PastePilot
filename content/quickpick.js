// PastePilot — in-page quick-pick overlay (injected on Ctrl+Shift+S).
// Runs in the isolated world; chrome.storage and location are both available.
(function () {
  if (window.__ppQuickpick) {
    window.__ppQuickpick.toggle();
    return;
  }

  const CSS = `
    .pp-overlay { position: fixed; inset: 0; z-index: 2147483646; background: rgba(46, 36, 20, 0.32); animation: pp-fade .15s ease-out; }
    .pp-panel {
      position: fixed; top: 16%; left: 50%; transform: translateX(-50%) rotate(-0.4deg);
      width: 480px; max-width: 92vw; max-height: 62vh;
      background: #fdfaf1;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/><feColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.28 0 0 0 0 0.16 0 0 0 0.05 0'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>");
      border: 1px solid #e3d8bf;
      border-radius: 10px;
      box-shadow: 0 2px 4px rgba(46,36,20,0.18), 0 24px 70px rgba(46,36,20,0.4);
      z-index: 2147483647;
      font: 13px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; color: #33291c;
      animation: pp-pop .18s cubic-bezier(0.2, 0.9, 0.3, 1.15);
      overflow: hidden;
      display: flex; flex-direction: column;
    }
    @keyframes pp-pop { from { opacity: 0; transform: translateX(-50%) translateY(-10px) rotate(1deg); } to { opacity: 1; transform: translateX(-50%) translateY(0) rotate(-0.4deg); } }
    @keyframes pp-fade { from { opacity: 0; } to { opacity: 1; } }
    .pp-panel input {
      width: 100%; box-sizing: border-box; background: transparent; color: #33291c;
      border: none; outline: none; padding: 15px 18px; font-size: 15px;
      border-bottom: 1px dashed #e0d5bc;
      font-family: Georgia, "Iowan Old Style", serif; font-style: italic;
    }
    .pp-panel input::placeholder { color: #a2937a; }
    .pp-q-results { overflow-y: auto; padding: 8px; }
    .pp-panel .pp-q-section {
      padding: 8px 6px 4px;
      font-size: 9.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
      color: #a2937a;
      display: flex; align-items: center; gap: 8px;
    }
    .pp-panel .pp-q-section::after { content: ""; flex: 1; border-top: 1px dashed #e0d5bc; }
    .pp-panel .pp-q-item {
      position: relative;
      padding: 9px 14px; cursor: pointer; border-radius: 8px;
      border: 1px solid transparent; margin: 3px 0;
      background: #fdfaf1;
      box-shadow: 0 1px 2px rgba(87,70,40,0.10), 0 2px 6px rgba(87,70,40,0.07);
      transition: transform .13s ease, box-shadow .13s ease, border-color .13s ease;
    }
    .pp-panel .pp-q-item .pp-q-title { font-weight: 700; font-family: Georgia, "Iowan Old Style", serif; font-size: 13.5px; }
    .pp-panel .pp-q-item .pp-q-preview { color: #6d604a; font-size: 11px; font-family: ui-monospace, Consolas, "Courier New", monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
    .pp-panel .pp-q-item.pp-q-active {
      border-color: #3a5a80;
      box-shadow: inset 3px 0 0 #3a5a80, 0 1px 2px rgba(87,70,40,0.10), 0 3px 10px rgba(87,70,40,0.12);
      transform: translateY(-1px);
    }
    .pp-panel .pp-q-empty { padding: 22px 14px; color: #6d604a; text-align: center; font-family: Georgia, serif; font-style: italic; }
    .pp-panel .pp-q-foot {
      padding: 9px 16px; color: #a2937a; font-size: 10.5px;
      border-top: 1px dashed #e0d5bc;
      background: repeating-linear-gradient(180deg, transparent 0 3px, rgba(87,70,40,0.028) 3px 4px), #efe7d4;
    }
    .pp-panel kbd {
      background: #fdfaf1; border: 1px solid #e3d8bf; border-bottom-width: 2px;
      border-radius: 4px; padding: 0 5px; font-size: 9.5px;
      font-family: ui-monospace, Consolas, monospace; color: #6d604a;
    }
    .pp-q-results::-webkit-scrollbar { width: 10px; }
    .pp-q-results::-webkit-scrollbar-thumb { background: #e3d8bf; border-radius: 99px; border: 3px solid #fdfaf1; }
    .pp-q-ask { padding: 2px 8px 10px; }
    .pp-q-ask-field { margin: 10px 6px 0; }
    .pp-q-ask-field span { display: block; font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #a2937a; margin-bottom: 3px; }
    .pp-q-ask-field input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #e3d8bf; border-radius: 7px; background: #fffdf6; color: #33291c; font: 13px Georgia, "Iowan Old Style", serif; outline: none; }
    .pp-q-ask-field input:focus { border-color: #3a5a80; }
    .pp-q-ask-fill { margin: 12px 6px 2px; padding: 8px 16px; border: none; border-radius: 7px; background: #3a5a80; color: #fdfaf1; font-weight: 700; font-size: 12.5px; cursor: pointer; }
    .pp-q-ask-fill:hover { background: #2f4a6b; }
  `;

  let root = null;
  let filtered = [];
  let activeIdx = 0;
  let snippets = [];
  let details = [];

  // Mirror of lib/identity.js core fields (classic script — can't import ES modules)
  const CORE_DETAILS = [
    ['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'],
    ['phone', 'Phone number'], ['fullName', 'Full name'], ['github', 'GitHub'],
    ['linkedin', 'LinkedIn'], ['portfolio', 'Portfolio / site'], ['location', 'Location'],
    ['headline', 'Headline'], ['about', 'About / summary']
  ];

  function loadDetails(profile) {
    const items = [];
    for (const [key, label] of CORE_DETAILS) {
      if (profile[key]) items.push({ kind: 'detail', label, value: String(profile[key]) });
    }
    if (Array.isArray(profile.custom)) {
      for (const c of profile.custom) {
        if (c.label && c.value) items.push({ kind: 'detail', label: c.label, value: String(c.value) });
      }
    }
    return items;
  }

  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return !el.disabled && !el.readOnly;
    if (tag === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      return !el.disabled && !el.readOnly && type !== 'hidden' && type !== 'submit' && type !== 'button' && type !== 'checkbox' && type !== 'radio' && type !== 'file';
    }
    return el.isContentEditable === true;
  }

  function siteMatches(pattern) {
    const host = location.hostname.replace(/^www\./, '');
    const p = String(pattern).trim().toLowerCase();
    if (p === '*' || !p) return true;
    if (p.startsWith('*.')) return host.endsWith('.' + p.slice(2));
    return host === p || host.endsWith('.' + p);
  }

  function findEditableTarget() {
    let el = document.activeElement;
    if (!isEditable(el)) {
      // Some widgets move focus to body; look inside open shadow roots
      function findFocused(root) {
        for (const child of root.querySelectorAll('*')) {
          if (child.shadowRoot) {
            const f = child.shadowRoot.activeElement || findFocused(child.shadowRoot);
            if (f && f !== child.shadowRoot) return f;
          }
        }
        return null;
      }
      const deep = findFocused(document);
      if (isEditable(deep)) el = deep;
    }
    return isEditable(el) ? el : null;
  }

  // Capture the field the user was in BEFORE the overlay steals focus,
  // otherwise the fill would land in the quick-pick's own search box.
  let fillTarget = null;

  function fillActive(before, after) {
    const target = fillTarget && isEditable(fillTarget) ? fillTarget : findEditableTarget();
    if (!target) return false;
    const text = before + after;
    try {
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        const proto = target.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        const start = target.selectionStart != null ? target.selectionStart : target.value.length;
        const end = target.selectionEnd != null ? target.selectionEnd : target.value.length;
        nativeSetter.call(target, target.value.slice(0, start) + text + target.value.slice(end));
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        if (after) target.setSelectionRange(start + before.length, start + before.length);
        return true;
      }
      target.focus();
      if (!document.execCommand('insertText', false, text)) {
        target.textContent = text;
        target.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function resolveVars(text) {
    const now = new Date();
    return text.replace(/\{\{\s*(date|time|year)(?:\s*([+-])\s*(\d+))?\s*\}\}/gi, (m, name, sign, num) => {
      if (name.toLowerCase() === 'year') return String(now.getFullYear());
      if (name.toLowerCase() === 'time') {
        try { return now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); } catch (e) { return m; }
      }
      const d = new Date(now);
      if (sign && num) d.setDate(d.getDate() + parseInt(num, 10) * (sign === '-' ? -1 : 1));
      try { return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return d.toDateString(); }
    });
  }

  function splitCursor(text) {
    const m = text.match(/\{\{\s*cursor\s*\}\}/i);
    if (!m) return { before: text, after: '' };
    return { before: text.slice(0, m.index), after: text.slice(m.index + m[0].length) };
  }

  // Mirror of lib/variables.js {{ask:...}} helpers (classic script — no imports)
  function extractAsks(text) {
    const out = [];
    const re = /\{\{\s*ask\s*:\s*([^{}]+?)\s*\}\}/gi;
    let m;
    while ((m = re.exec(String(text || '')))) {
      const label = m[1].trim();
      if (label && !out.some((x) => x.toLowerCase() === label.toLowerCase())) out.push(label);
    }
    return out;
  }

  function substituteAsks(text, values) {
    const norm = {};
    for (const k of Object.keys(values || {})) norm[k.toLowerCase()] = values[k];
    return String(text || '').replace(/\{\{\s*ask\s*:\s*([^{}]+?)\s*\}\}/gi, (m, label) => {
      const v = norm[String(label).trim().toLowerCase()];
      return v === undefined ? m : v;
    });
  }

  function pick(entry) {
    if (entry.kind === 'snippet' && extractAsks(entry.s.body).length) {
      openAskForm(entry, extractAsks(entry.s.body));
      return;
    }
    let text;
    if (entry.kind === 'detail') {
      text = entry.value;
    } else {
      text = resolveVars(entry.s.body);
    }
    const { before, after } = splitCursor(text);
    if (fillActive(before, after)) {
      if (entry.kind === 'snippet') {
        // Persist usage via the service worker, which owns the storage format
        try {
          chrome.runtime.sendMessage({ type: 'pp-usage', id: entry.s.id });
        } catch (e) { /* extension context gone; ignore */ }
      }
      close();
    } else {
      flash('Click into a form field first');
    }
  }

  // {{ask:}} blanks: swap the results list for a tiny form, then fill with
  // the collected values. Recent answers are remembered per label.
  function openAskForm(entry, asks) {
    const results = root.querySelector('.pp-q-results');
    chrome.storage.local.get('pp_ask_memory', (mem) => {
      const memory = (mem && mem.pp_ask_memory) || {};
      results.innerHTML = '';
      const form = document.createElement('div');
      form.className = 'pp-q-ask';
      const head = document.createElement('div');
      head.className = 'pp-q-section';
      head.textContent = 'Fill in the blanks';
      form.appendChild(head);
      const inputs = asks.map((label) => {
        const field = document.createElement('div');
        field.className = 'pp-q-ask-field';
        const span = document.createElement('span');
        span.textContent = label;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = memory[label] || memory[label.toLowerCase()] || '';
        input.placeholder = label;
        input.dataset.label = label;
        field.appendChild(span);
        field.appendChild(input);
        form.appendChild(field);
        return input;
      });
      const fillBtn = document.createElement('button');
      fillBtn.className = 'pp-q-ask-fill';
      fillBtn.textContent = 'Fill';
      form.appendChild(fillBtn);
      results.appendChild(form);
      if (inputs[0]) inputs[0].focus();
      const submit = () => {
        const values = {};
        inputs.forEach((i) => { values[i.dataset.label] = i.value.trim(); });
        try {
          chrome.storage.local.get('pp_ask_memory', (o) => {
            const memory2 = (o && o.pp_ask_memory) || {};
            for (const k of Object.keys(values)) {
              if (values[k]) memory2[k] = String(values[k]).slice(0, 200);
            }
            chrome.storage.local.set({ pp_ask_memory: memory2 });
          });
        } catch (e) { /* memory is best-effort */ }
        fillAsk(entry, values);
      };
      fillBtn.addEventListener('click', submit);
      form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
      });
    });
  }

  function fillAsk(entry, values) {
    const text = resolveVars(substituteAsks(entry.s.body, values));
    const { before, after } = splitCursor(text);
    if (fillActive(before, after)) {
      try {
        chrome.runtime.sendMessage({ type: 'pp-usage', id: entry.s.id });
      } catch (e) { /* extension context gone; ignore */ }
      close();
    } else {
      flash('Click into a form field first');
    }
  }

  function flash(msg) {
    const foot = root.querySelector('.pp-q-foot');
    if (foot) {
      const old = foot.textContent;
      foot.textContent = msg;
      setTimeout(() => { foot.textContent = old; }, 1600);
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderList() {
    const wrap = root.querySelector('.pp-q-results');
    wrap.innerHTML = '';
    const q = root.querySelector('input').value.trim().toLowerCase();

    const detItems = details.filter((d) => !q || (d.label + ' ' + d.value).toLowerCase().includes(q));
    const siteSnips = snippets.filter((s) => siteMatches((s.sites || ['*'])[0]) || (s.sites || []).some(siteMatches));
    const snipItems = siteSnips.filter((s) => !q || (s.title + ' ' + s.body).toLowerCase().includes(q));

    filtered = [];
    if (!detItems.length && !snipItems.length) {
      wrap.innerHTML = '<div class="pp-q-empty">No snippets match.</div>';
      return;
    }

    const addItem = (entry, title, preview) => {
      const i = filtered.length;
      const div = document.createElement('div');
      div.className = 'pp-q-item' + (i === activeIdx ? ' pp-q-active' : '');
      div.innerHTML = `<div class="pp-q-title">${esc(title)}</div>
        <div class="pp-q-preview">${esc(preview)}</div>`;
      div.addEventListener('click', () => pick(entry));
      div.addEventListener('mousemove', () => { if (activeIdx !== i) { activeIdx = i; highlight(); } });
      wrap.appendChild(div);
      filtered.push(entry);
    };

    if (detItems.length) {
      const head = document.createElement('div');
      head.className = 'pp-q-section';
      head.textContent = 'My details';
      wrap.appendChild(head);
      detItems.forEach((d) => addItem(d, d.label, d.value.replace(/\s+/g, ' ').slice(0, 80)));
    }
    if (snipItems.length) {
      const head = document.createElement('div');
      head.className = 'pp-q-section';
      head.textContent = 'Snippets';
      wrap.appendChild(head);
      snipItems.forEach((s) => addItem(
        { kind: 'snippet', s },
        s.title,
        s.body.replace(/\{\{\s*cursor\s*\}\}/gi, '').replace(/\{\{\s*ask\s*:[^}]*\}\}/gi, '[blank]').replace(/\s+/g, ' ').trim().slice(0, 80)
      ));
    }
  }

  function highlight() {
    root.querySelectorAll('.pp-q-item').forEach((el, i) => el.classList.toggle('pp-q-active', i === activeIdx));
    const active = root.querySelector('.pp-q-item.pp-q-active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function close() {
    if (root) { root.remove(); root = null; }
    window.__ppQuickpickOpen = false;
  }

  function open() {
    if (root) return;
    fillTarget = findEditableTarget();
    root = document.createElement('div');
    root.innerHTML = `
      <div class="pp-overlay"></div>
      <div class="pp-panel">
        <input type="text" placeholder="Search details & snippets…">
        <div class="pp-q-results"></div>
        <div class="pp-q-foot"><kbd>↑↓</kbd> navigate · <kbd>Enter</kbd> fill · <kbd>Esc</kbd> close</div>
      </div>`;
    document.documentElement.appendChild(root);
    const style = document.createElement('style');
    style.textContent = CSS;
    root.prepend(style);

    root.querySelector('.pp-overlay').addEventListener('click', close);
    const input = root.querySelector('input');
    input.addEventListener('input', () => { activeIdx = 0; renderList(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { activeIdx = Math.min(activeIdx + 1, filtered.length - 1); highlight(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { activeIdx = Math.max(activeIdx - 1, 0); highlight(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (filtered[activeIdx]) pick(filtered[activeIdx]); e.preventDefault(); }
    });
    input.focus();
    renderList();
    window.__ppQuickpickOpen = true;
  }

  window.__ppQuickpick = { toggle: () => (window.__ppQuickpickOpen ? close() : open()), open, close };

  // Load details + snippets, then open
  chrome.storage.sync.get('pp_profile', (pd) => {
    details = loadDetails(pd.pp_profile || {});
    chrome.storage.local.get('pp_local_mirror', (d) => {
      try {
        snippets = JSON.parse(d.pp_local_mirror || '[]');
      } catch (e) {
        snippets = [];
      }
      open();
    });
  });
})();
