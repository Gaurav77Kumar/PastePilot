// PastePilot — functions that run INSIDE the page via chrome.scripting.executeScript.
// These are serialized by Chrome, so they must be fully self-contained:
// no imports, no closures, no references to anything outside the function body.

// Fills the currently focused editable element. Runs in every frame (allFrames),
// and only the frame whose activeElement is editable performs the fill.
// eslint-disable-next-line no-unused-vars
function PP_FILL_FN(before, after) {
  function isEditable(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return !el.disabled && !el.readOnly;
    if (tag === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      const texty = ['text', 'search', 'url', 'tel', 'email', 'password', 'number', 'date', 'time'];
      return !el.disabled && !el.readOnly && texty.includes(type);
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  let target = document.activeElement;
  if (!isEditable(target)) {
    // Some widgets move focus to body; look for a focused element inside open shadow roots
    function findFocused(root) {
      const els = root.querySelectorAll('*');
      for (const el of els) {
        if (el.shadowRoot) {
          const f = el.shadowRoot.activeElement || findFocused(el.shadowRoot);
          if (f && f !== el.shadowRoot) return f;
        }
      }
      return null;
    }
    const deep = findFocused(document);
    if (isEditable(deep)) target = deep;
  }

  if (!isEditable(target)) return { filled: false, reason: 'no-focused-field' };

  const text = before + after;

  try {
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      const proto = target.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      const start = target.selectionStart != null ? target.selectionStart : target.value.length;
      const end = target.selectionEnd != null ? target.selectionEnd : target.value.length;
      const newValue = target.value.slice(0, start) + text + target.value.slice(end);
      nativeSetter.call(target, newValue);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      if (after) {
        target.setSelectionRange(start + before.length, start + before.length);
      }
      return { filled: true };
    }

    // contenteditable path
    target.focus();
    let ok = false;
    try {
      ok = document.execCommand('insertText', false, text);
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      // Fallback: overwrite text content (loses caret position)
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        sel.getRangeAt(0).deleteContents();
        sel.getRangeAt(0).insertNode(document.createTextNode(text));
        target.dispatchEvent(new InputEvent('input', { bubbles: true }));
      } else {
        target.textContent = text;
        target.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
    }
    return { filled: true };
  } catch (err) {
    return { filled: false, reason: String(err && err.message || err) };
  }
}

// Auto-fill: scans visible, empty text fields, matches their labels against
// keyword groups, and fills the best match. mapping = [{ keywords: ['street','address'], text: '...' }]
// Returns how many fields were filled.
// eslint-disable-next-line no-unused-vars
function PP_FILL_ALL_FN(mapping) {
  function visible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const type = (el.type || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image'].includes(type)) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  function labelFor(el) {
    let parts = [];
    if (el.id) {
      const lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lbl) parts.push(lbl.textContent);
    }
    const wrap = el.closest('label');
    if (wrap) parts.push(wrap.textContent);
    if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
    if (el.placeholder) parts.push(el.placeholder);
    if (el.name) parts.push(String(el.name).replace(/[_-]+/g, ' '));
    const td = el.closest('td,th');
    if (td && td.previousElementSibling) parts.push(td.previousElementSibling.textContent);
    return parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function score(label, keywords) {
    let s = 0;
    for (const kw of keywords) {
      const k = kw.toLowerCase().trim();
      if (!k) continue;
      if (label === k) s += 10;
      else if (label.includes(k)) s += k.length >= 4 ? 5 : 3;
    }
    return s;
  }

  const fields = [];
  const selector = 'input, textarea';
  document.querySelectorAll(selector).forEach((el) => {
    if (visible(el) && !el.value) fields.push(el);
  });
  // open shadow roots
  document.querySelectorAll('*').forEach((host) => {
    if (host.shadowRoot) {
      host.shadowRoot.querySelectorAll(selector).forEach((el) => {
        if (visible(el) && !el.value) fields.push(el);
      });
    }
  });

  let count = 0;
  for (const el of fields) {
    const label = labelFor(el);
    if (!label) continue;
    let best = null;
    let bestScore = 0;
    for (const entry of mapping) {
      const s = score(label, entry.keywords);
      if (s > bestScore) { bestScore = s; best = entry; }
    }
    if (!best) continue;
    try {
      const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      nativeSetter.call(el, best.text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      count++;
    } catch (e) { /* skip this field */ }
  }
  return { filled: count, candidates: fields.length };
}

// Collects field labels so the popup can preview what "fill all" would do.
// eslint-disable-next-line no-unused-vars
function PP_INSPECT_FN() {
  function visible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const type = (el.type || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image'].includes(type)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  const labels = [];
  document.querySelectorAll('input, textarea').forEach((el) => {
    if (visible(el)) labels.push(el.getAttribute('aria-label') || el.placeholder || el.name || el.id || el.type);
  });
  return { labels: labels.slice(0, 40) };
}

export { PP_FILL_FN, PP_FILL_ALL_FN, PP_INSPECT_FN };
