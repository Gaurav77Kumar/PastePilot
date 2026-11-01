// PastePilot — popup: search, per-site grouping, click-to-fill, fill-all.

import { snippetsForSite, snippetMatchesSite, hostFromUrl } from '../lib/rules.js';
import { resolveVars, splitCursor, extractAsks, substituteAsks } from '../lib/variables.js';
import { readSnippets, writeSnippets, getProfile } from '../lib/storage.js';
import { PROFILE_FIELDS, CORE_PROFILE_KEYS, getCustomFields, customFieldKeywords } from '../lib/identity.js';
import { PP_FILL_FN, PP_FILL_ALL_FN } from '../lib/pagefill.js';

let ALL_SNIPPETS = [];
let CURRENT_TAB = null;
let CURRENT_URL = '';
let PROFILE = {};

const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const siteTagEl = document.getElementById('siteTag');
const toastEl = document.getElementById('toast');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function toast(msg, kind) {
  toastEl.textContent = msg;
  toastEl.className = 'pp-toast' + (kind ? ' pp-toast-' + kind : '');
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

// Fuzzy-ish scoring: substring beats subsequence; earlier matches score higher.
function matchScore(snippet, q) {
  const hay = (snippet.title + ' ' + snippet.body + ' ' + (snippet.tags || []).join(' ')).toLowerCase();
  const idx = hay.indexOf(q);
  if (idx === 0) return 100;
  if (idx > 0) return 60 - Math.min(idx, 40);
  // subsequence fallback
  let hi = 0;
  for (const ch of q) {
    hi = hay.indexOf(ch, hi);
    if (hi === -1) return -1;
    hi++;
  }
  return 10;
}

function sortSnippets(snips) {
  return snips.slice().sort((a, b) =>
    (b.usageCount || 0) - (a.usageCount || 0) || (b.lastUsed || 0) - (a.lastUsed || 0));
}

function renderItem(s, onClick) {
  const div = document.createElement('div');
  div.className = 'pp-item';
  const preview = s.body
    .replace(/\{\{\s*cursor\s*\}\}/gi, '')
    .replace(/\{\{\s*ask\s*:[^}]*\}\}/gi, '[blank]')
    .replace(/\s+/g, ' ').trim();
  const tags = (s.tags || []).slice(0, 3)
    .map((t) => `<span class="pp-tag">${esc(t)}</span>`).join('');
  div.innerHTML = `
    <div class="pp-item-title"><span>${esc(s.title)}</span>${s.usageCount ? `<span class="pp-uses">${s.usageCount}×</span>` : ''}</div>
    <div class="pp-item-preview">${esc(preview.slice(0, 90))}</div>
    ${tags ? `<div class="pp-item-tags">${tags}</div>` : ''}`;
  div.addEventListener('click', () => onClick(s));
  return div;
}

function render() {
  const q = searchEl.value.trim().toLowerCase();
  listEl.innerHTML = '';

  const siteSnips = sortSnippets(snippetsForSite(ALL_SNIPPETS, CURRENT_URL));
  const genericSnips = sortSnippets(
    ALL_SNIPPETS.filter((s) => !snippetMatchesSite(s, CURRENT_URL))
  );

  const filter = (arr) => {
    if (!q) return arr;
    return arr
      .map((s) => ({ s, score: matchScore(s, q) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.s);
  };

  const siteFiltered = filter(siteSnips);
  const genericFiltered = filter(genericSnips);

  if (!siteFiltered.length && !genericFiltered.length) {
    const empty = document.createElement('div');
    empty.className = 'pp-empty';
    empty.innerHTML = `
      <div class="pp-empty-icon">✈</div>
      ${q ? `No snippets match “${esc(q)}”.` : `No snippets yet.<br><span class="pp-empty-action" id="addFirst">Create your first snippet</span>`}`;
    listEl.appendChild(empty);
    const add = document.getElementById('addFirst');
    if (add) add.addEventListener('click', () => chrome.runtime.openOptionsPage());
    return;
  }

  if (siteFiltered.length) {
    const lbl = document.createElement('div');
    lbl.className = 'pp-section-label';
    lbl.textContent = `For this site (${siteTagEl.textContent || 'current page'})`;
    listEl.appendChild(lbl);
    siteFiltered.forEach((s) => listEl.appendChild(renderItem(s, fillSnippet)));
  }
  if (genericFiltered.length) {
    const lbl = document.createElement('div');
    lbl.className = 'pp-section-label';
    lbl.textContent = 'All snippets';
    listEl.appendChild(lbl);
    genericFiltered.forEach((s) => listEl.appendChild(renderItem(s, fillSnippet)));
  }

  document.getElementById('footCount').textContent =
    `${siteFiltered.length + genericFiltered.length} shown · ${ALL_SNIPPETS.length} total`;
}

async function getClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch (e) {
    return null;
  }
}

// ---- {{ask:...}} fill-in-the-blank prompts ---------------------------------

async function getAskMemory() {
  try {
    const o = await chrome.storage.local.get('pp_ask_memory');
    return (o && o.pp_ask_memory) || {};
  } catch (e) {
    return {};
  }
}

async function rememberAsks(values) {
  try {
    const mem = await getAskMemory();
    for (const k of Object.keys(values)) {
      if (values[k]) mem[k] = String(values[k]).slice(0, 200);
    }
    await chrome.storage.local.set({ pp_ask_memory: mem });
  } catch (e) { /* memory is best-effort */ }
}

// Renders a small form in place of the snippet list; onDone(values) fires on
// submit with one trimmed value per label.
function renderAskForm(asks, prefilled, onDone) {
  const wrap = document.createElement('div');
  wrap.className = 'pp-ask-form';
  const head = document.createElement('div');
  head.className = 'pp-ask-head';
  head.textContent = 'Fill in the blanks';
  wrap.appendChild(head);
  const inputs = asks.map((label) => {
    const lab = document.createElement('label');
    lab.className = 'pp-ask-field';
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = prefilled[label] || prefilled[label.toLowerCase()] || '';
    input.placeholder = label;
    input.dataset.label = label;
    lab.appendChild(input);
    wrap.appendChild(lab);
    return input;
  });
  const actions = document.createElement('div');
  actions.className = 'pp-ask-actions';
  const fillBtn = document.createElement('button');
  fillBtn.className = 'pp-btn pp-btn-ink';
  fillBtn.textContent = 'Fill';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pp-btn pp-btn-ghost';
  cancelBtn.textContent = 'Cancel';
  actions.append(fillBtn, cancelBtn);
  wrap.appendChild(actions);
  listEl.innerHTML = '';
  listEl.appendChild(wrap);
  if (inputs[0]) inputs[0].focus();
  const submit = async () => {
    const values = {};
    inputs.forEach((i) => { values[i.dataset.label] = i.value.trim(); });
    await rememberAsks(values);
    onDone(values);
  };
  fillBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', () => render());
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.stopPropagation(); render(); }
  });
}

async function fillSnippet(s) {
  let body = s.body;
  if (/\{\{\s*clipboard\s*\}\}/i.test(body)) {
    const clip = await getClipboard();
    if (clip == null) {
      toast('Clipboard unavailable — remove {{clipboard}} or grant copy access', 'err');
      return;
    }
    body = resolveVars(body, { clipboardText: clip });
  }
  body = resolveVars(body, { url: CURRENT_URL, title: CURRENT_TAB ? CURRENT_TAB.title : '' });
  const asks = extractAsks(body);
  if (asks.length) {
    const mem = await getAskMemory();
    renderAskForm(asks, mem, async (values) => {
      await fillResolved(substituteAsks(body, values), s);
    });
    return;
  }
  await fillResolved(body, s);
}

async function fillResolved(body, s) {
  const { before, after } = splitCursor(body);

  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: CURRENT_TAB.id, allFrames: true },
      func: PP_FILL_FN,
      args: [before, after]
    });
    const out = res && res.result;
    if (out && out.filled) {
      s.usageCount = (s.usageCount || 0) + 1;
      s.lastUsed = Date.now();
      await writeSnippets(ALL_SNIPPETS);
      toast('Filled ✓', 'ok');
      setTimeout(() => window.close(), 350);
    } else {
      toast('Click into a form field first, then try again', 'err');
    }
  } catch (e) {
    toast("Can't fill this page (restricted)", 'err');
  }
}

// Resolve variables for whole-field fills (fill-all): the {{cursor}} marker
// has nowhere to land, so it's dropped after resolution.
function resolveForMapping(text) {
  const resolved = resolveVars(text, { url: CURRENT_URL, title: CURRENT_TAB ? CURRENT_TAB.title : '' });
  const { before, after } = splitCursor(resolved);
  return before + after;
}

async function executeFillAll(mapping) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: CURRENT_TAB.id, allFrames: true },
      func: PP_FILL_ALL_FN,
      args: [mapping]
    });
    return (res && res.result) || { filled: 0, candidates: 0 };
  } catch (e) {
    return null;
  }
}

// Snippets with {{ask:}} blanks can't go through fill-all (they need their
// prompt first) — they're skipped and counted for the toast.
function splitAskSnips(snips) {
  const usable = snips.filter((s) => !extractAsks(s.body).length);
  return { usable, skipped: snips.length - usable.length };
}

async function fillAll() {
  const all = snippetsForSite(ALL_SNIPPETS, CURRENT_URL)
    .filter((s) => s.keywords && s.keywords.trim());
  const { usable, skipped } = splitAskSnips(all);
  if (!usable.length) {
    toast(skipped ? 'Snippet has {{ask:}} blanks — click it individually instead' : 'Add "auto-fill keywords" to snippets in Manage first', 'err');
    return;
  }
  const mapping = usable.map((s) => ({
    keywords: s.keywords.split(',').map((k) => k.trim()).filter(Boolean),
    text: resolveForMapping(s.body)
  }));
  const out = await executeFillAll(mapping);
  if (!out) { toast("Can't fill this page (restricted)", 'err'); return; }
  if (out.filled > 0) {
    const extra = skipped ? ` (${skipped} with blanks skipped)` : '';
    toast(`Filled ${out.filled} field${out.filled > 1 ? 's' : ''} ✓${extra}`, 'ok');
  } else {
    toast('No matching empty fields found on this page', 'err');
  }
}

async function fillMyDetails() {
  const coreMap = PROFILE_FIELDS
    .filter((f) => PROFILE[f.key])
    .map((f) => ({ keywords: f.keywords, text: resolveForMapping(PROFILE[f.key]) }));
  const customMap = getCustomFields(PROFILE)
    .filter((c) => c.label && c.value)
    .map((c) => ({ keywords: customFieldKeywords(c), text: resolveForMapping(c.value) }));
  const identityMap = [...coreMap, ...customMap];
  if (!identityMap.length) {
    openDetailsSetup();
    return;
  }
  const all = snippetsForSite(ALL_SNIPPETS, CURRENT_URL)
    .filter((s) => s.keywords && s.keywords.trim());
  const { usable, skipped } = splitAskSnips(all);
  const snippetMap = usable.map((s) => ({
    keywords: s.keywords.split(',').map((k) => k.trim()).filter(Boolean),
    text: resolveForMapping(s.body)
  }));
  const out = await executeFillAll([...identityMap, ...snippetMap]);
  if (!out) { toast("Can't fill this page (restricted)", 'err'); return; }
  if (out.filled > 0) {
    const extra = skipped ? ` (${skipped} with blanks skipped)` : '';
    toast(`Filled ${out.filled} field${out.filled > 1 ? 's' : ''} ✓${extra}`, 'ok');
  } else {
    toast('No matching empty fields found on this page', 'err');
  }
}

async function fillProfileValue(label, value) {
  let text = resolveVars(value, { url: CURRENT_URL, title: CURRENT_TAB ? CURRENT_TAB.title : '' });
  const { before, after } = splitCursor(text);
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: CURRENT_TAB.id, allFrames: true },
      func: PP_FILL_FN,
      args: [before, after]
    });
    const out = res && res.result;
    if (out && out.filled) {
      toast(`${label} filled ✓`, 'ok');
      setTimeout(() => window.close(), 300);
    } else {
      toast('Click into a form field first, then try again', 'err');
    }
  } catch (e) {
    toast("Can't fill this page (restricted)", 'err');
  }
}

function openDetailsSetup() {
  chrome.tabs.create({ url: chrome.runtime.getURL('editor/editor.html#details') });
  window.close();
}

function renderMe() {
  const card = document.getElementById('meCard');
  const hasAny = PROFILE_FIELDS.some((f) => PROFILE[f.key]);
  if (!hasAny) {
    card.innerHTML = `
      <div class="pp-me-setup">
        <span>Save your name, email, phone, GitHub & LinkedIn once — then fill any form in one click.</span>
        <button id="meSetupBtn" class="pp-btn pp-btn-ink">Set up my details</button>
      </div>`;
    document.getElementById('meSetupBtn').addEventListener('click', openDetailsSetup);
    return;
  }

  const coreCount = CORE_PROFILE_KEYS.filter((k) => PROFILE[k]).length;
  const chipItems = [
    ...PROFILE_FIELDS.filter((f) => PROFILE[f.key]).map((f) => ({ label: f.label, value: PROFILE[f.key] })),
    ...getCustomFields(PROFILE).filter((c) => c.label && c.value).map((c) => ({ label: c.label, value: c.value }))
  ];
  card.innerHTML = `
    <div class="pp-me-row">
      <div>
        <div class="pp-me-title">My details</div>
        <div class="pp-me-sub">${coreCount} core fields ready${chipItems.length > coreCount ? ` · ${chipItems.length - coreCount} custom` : ''}</div>
      </div>
      <button id="fillDetailsBtn" class="pp-btn pp-btn-ink" title="Fill every matching empty field on this page">⚡ Fill form</button>
    </div>
    <div class="pp-me-chips">
      ${chipItems.map((c, i) => `<button class="pp-chip" data-idx="${i}" title="${esc(String(c.value).slice(0, 120))}">${esc(c.label)}</button>`).join('')}
    </div>`;
  document.getElementById('fillDetailsBtn').addEventListener('click', fillMyDetails);
  card.querySelectorAll('.pp-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const item = chipItems[Number(chip.dataset.idx)];
      if (item) fillProfileValue(item.label, item.value);
    });
  });
}

async function init() {
  [CURRENT_TAB] = await chrome.tabs.query({ active: true, currentWindow: true });
  CURRENT_URL = CURRENT_TAB ? CURRENT_TAB.url || '' : '';
  const host = hostFromUrl(CURRENT_URL);
  siteTagEl.textContent = host || '';
  siteTagEl.title = host || '';

  ALL_SNIPPETS = await readSnippets();
  PROFILE = await getProfile();
  renderMe();

  // Per-tab badge: how many snippets are relevant on this site
  try {
    const n = snippetsForSite(ALL_SNIPPETS, CURRENT_URL).length;
    await chrome.action.setBadgeText({ tabId: CURRENT_TAB.id, text: n > 0 ? String(n) : '' });
    await chrome.action.setBadgeBackgroundColor({ tabId: CURRENT_TAB.id, color: '#4f6ef7' });
  } catch (e) { /* tab may be gone; ignore */ }

  render();

  searchEl.addEventListener('input', render);
  searchEl.focus();

  document.getElementById('manageBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('fillAllBtn').addEventListener('click', fillAll);
}

init();
