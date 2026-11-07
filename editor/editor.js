
import { readSnippets, writeSnippets, getProfile, saveProfile } from '../lib/storage.js';
import { PROFILE_FIELDS, PROFILE_TEXTAREAS, getCustomFields } from '../lib/identity.js';
import { encodeShare, decodeShare, encodePack, decodePack } from '../lib/share.js';
import { encryptText, decryptText } from '../lib/vault.js';

// Where shared-snippet links point. The page at /site/import.html is served
// by GitHub Pages once enabled; it previews the snippet and hands the data
// over via the editor's "⤵ Import shared" paste box.
const SHARE_URL_BASE = 'https://gaurav77kumar.github.io/PastePilot/site/import.html#pp=';
const PACK_URL_BASE = 'https://gaurav77kumar.github.io/PastePilot/site/import.html#pack=';

// Vault session state: which snippet's plaintext is in the textarea, and the
// passphrase used (5-minute TTL — fill prompts keep their own short cache).
let revealedSnippetId = null;
let revealedPlain = null;
let vaultPassCache = null;

function vaultPass() {
  if (vaultPassCache && vaultPassCache.until > Date.now()) return vaultPassCache.pass;
  return null;
}

let snippets = [];
let currentId = null;
let dirty = false;

const els = {
  search: document.getElementById('search'),
  sidebarList: document.getElementById('sidebarList'),
  countLabel: document.getElementById('countLabel'),
  editorPane: document.getElementById('editorPane'),
  emptyPane: document.getElementById('emptyPane'),
  fTitle: document.getElementById('fTitle'),
  fBody: document.getElementById('fBody'),
  fTags: document.getElementById('fTags'),
  fSites: document.getElementById('fSites'),
  fKeywords: document.getElementById('fKeywords'),
  charCount: document.getElementById('charCount'),
  savedMsg: document.getElementById('savedMsg'),
  fav: document.getElementById('favBtn'),
  vault: document.getElementById('vaultBtn')
};

function uid() {
  return 'pp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

// Auto-title for captured selections: first non-empty line, trimmed to 60 chars.
function deriveTitle(text) {
  const line = text.split('\n').map((t) => t.trim()).find(Boolean) || 'Captured snippet';
  return line.length > 60 ? line.slice(0, 57) + '…' : line;
}

// Right-click capture: the service worker hands over the selection via
// chrome.storage.session, then opens this page with ?capture=1. The new
// snippet is created unsaved (dirty) so the user can adjust title/tags first.
async function captureSelection() {
  let cap = null;
  try {
    const o = await chrome.storage.session.get('pp_capture');
    cap = o && o.pp_capture;
    await chrome.storage.session.remove('pp_capture');
  } catch (e) { cap = null; }
  if (!cap || !cap.text || !cap.text.trim()) return;
  const s = {
    id: uid(),
    title: deriveTitle(cap.text),
    body: cap.text,
    tags: [],
    sites: [cap.site || '*'],
    keywords: '',
    usageCount: 0,
    lastUsed: 0,
    createdAt: Date.now()
  };
  snippets.unshift(s);
  dirty = true;
  selectSnippet(s.id);
  els.fTitle.focus();
  els.fTitle.select();
}

function currentSnippet() {
  return snippets.find((s) => s.id === currentId) || null;
}

function showSaved() {
  els.savedMsg.hidden = false;
  setTimeout(() => { els.savedMsg.hidden = true; }, 1500);
}

// Creates an unsaved snippet from shared/captured data and selects it.
function addImportedSnippet(data) {
  const s = {
    id: uid(),
    title: data.title || 'Shared snippet',
    body: data.body || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    sites: Array.isArray(data.sites) && data.sites.length ? data.sites : ['*'],
    keywords: data.keywords || '',
    usageCount: 0,
    lastUsed: 0,
    createdAt: Date.now()
  };
  snippets.unshift(s);
  selectSnippet(s.id);
  dirty = true;
  els.fTitle.focus();
  els.fTitle.select();
  return s;
}

// Bulk import from a pack: one unshift, first snippet selected.
function importPackSnippets(pack) {
  const now = Date.now();
  const created = pack.snippets.map((sn, i) => ({
    id: uid(),
    title: sn.title,
    body: sn.body,
    tags: sn.tags,
    sites: sn.sites,
    keywords: sn.keywords,
    usageCount: 0,
    lastUsed: 0,
    createdAt: now + i
  }));
  snippets.unshift(...created);
  renderSidebar();
  selectSnippet(created[0].id);
  dirty = true;
  alert(`Imported ${created.length} snippet${created.length === 1 ? '' : 's'} from "${pack.name}". Review and save them.`);
}

function renderSidebar() {
  const q = els.search.value.trim().toLowerCase();
  els.sidebarList.innerHTML = '';
  const list = snippets.filter((s) =>
    !q || (s.title + ' ' + s.body).toLowerCase().includes(q));
  list.forEach((s) => {
    const div = document.createElement('div');
    div.className = 'ed-side-item' + (s.id === currentId ? ' active' : '');
    div.innerHTML = `<div class="t"></div><div class="s"></div>`;
    div.querySelector('.t').textContent = (s.favorite ? '★ ' : '') + (s.title || 'Untitled');
    div.querySelector('.s').textContent = s.body.replace(/\s+/g, ' ').slice(0, 60);
    div.addEventListener('click', () => {
      if (dirty && !confirm('Discard unsaved changes?')) return;
      selectSnippet(s.id);
    });
    els.sidebarList.appendChild(div);
  });
  els.countLabel.textContent = `${snippets.length} snippet${snippets.length === 1 ? '' : 's'}`;
}

// Keeps the favorite button in sync with the selected snippet.
function updateFavBtn(s) {
  els.fav.textContent = s && s.favorite ? '★ Favorited' : '☆ Favorite';
}

// Applies the locked/revealed UI for vault snippets (no-op for normal ones).
function refreshVaultUi(s) {
  if (!s || !s.vault) {
    els.fBody.readOnly = false;
    els.fBody.classList.remove('ed-vaulted');
    els.fBody.placeholder = 'The text that gets filled. Use the variable buttons above.';
    els.vault.textContent = '🔒 Vault';
    return;
  }
  if (revealedSnippetId === s.id && els.fBody.value) {
    els.fBody.readOnly = false;
    els.fBody.placeholder = '';
    els.vault.textContent = '🔒 Re-lock';
    return;
  }
  els.fBody.readOnly = true;
  els.fBody.classList.add('ed-vaulted');
  els.fBody.value = '';
  els.fBody.placeholder = '🔒 Encrypted at rest — click 🔓 Reveal to view';
  els.vault.textContent = '🔓 Reveal';
}

function selectSnippet(id) {
  currentId = id;
  dirty = false;
  const s = currentSnippet();
  els.editorPane.hidden = !s;
  els.emptyPane.hidden = !!s;
  updateFavBtn(s);
  if (!s) {
    refreshVaultUi(null);
    return;
  }
  els.fTitle.value = s.title || '';
  els.fBody.value = s.body || '';
  els.fTags.value = (s.tags || []).join(', ');
  els.fSites.value = (s.sites || []).join(', ');
  els.fKeywords.value = s.keywords || '';
  els.charCount.textContent = (s.body || '').length;
  refreshVaultUi(s);
  renderSidebar();
}

function newSnippet() {
  if (dirty && !confirm('Discard unsaved changes?')) return;
  const s = {
    id: uid(),
    title: '',
    body: '',
    tags: [],
    sites: ['*'],
    keywords: '',
    usageCount: 0,
    lastUsed: 0,
    createdAt: Date.now()
  };
  snippets.unshift(s);
  dirty = true; // unsaved until user hits Save
  selectSnippet(s.id);
  els.fTitle.focus();
}

async function saveSnippet() {
  const s = currentSnippet();
  if (!s) return;
  if (!els.fTitle.value.trim()) { alert('Please give the snippet a title.'); return; }
  s.title = els.fTitle.value.trim();
  s.tags = els.fTags.value.split(',').map((t) => t.trim()).filter(Boolean);
  s.sites = els.fSites.value.split(',').map((t) => t.trim()).filter(Boolean);
  if (!s.sites.length) s.sites = ['*'];
  s.keywords = els.fKeywords.value.trim();

  if (s.vault) {
    // Plaintext never persists — revealed edits are re-encrypted on save.
    if (revealedSnippetId === s.id) {
      const plain = els.fBody.value;
      if (!plain.trim()) {
        if (!confirm('The content is empty. Remove the vault and save as a normal snippet?')) return;
        delete s.vault;
        s.body = '';
        revealedSnippetId = null;
        revealedPlain = null;
      } else if (plain !== revealedPlain) {
        let pass = vaultPass();
        if (!pass) {
          const p = prompt('Passphrase to re-encrypt your changes:');
          if (p === null) return;
          pass = p;
        }
        try {
          s.vault = await encryptText(pass, plain);
        } catch (e) {
          alert('Re-encryption failed: ' + e.message);
          return;
        }
        vaultPassCache = { pass, until: Date.now() + 5 * 60 * 1000 };
        revealedPlain = plain;
      }
      s.body = '';
    }
  } else {
    s.body = els.fBody.value;
  }

  dirty = false;
  await writeSnippets(snippets);
  showSaved();
  renderSidebar();
}

async function deleteSnippet() {
  const s = currentSnippet();
  if (!s) return;
  if (!confirm(`Delete "${s.title || 'Untitled'}"? This cannot be undone.`)) return;
  snippets = snippets.filter((x) => x.id !== s.id);
  currentId = null;
  dirty = false;
  await writeSnippets(snippets);
  selectSnippet(null);
}

// Form wiring

document.getElementById('newBtn').addEventListener('click', newSnippet);
document.getElementById('saveBtn').addEventListener('click', saveSnippet);
document.getElementById('deleteBtn').addEventListener('click', deleteSnippet);
els.search.addEventListener('input', renderSidebar);

// ---- Favorites (pin to top) -------------------------------------------------

els.fav.addEventListener('click', async () => {
  const s = currentSnippet();
  if (!s) return;
  s.favorite = !s.favorite;
  updateFavBtn(s);
  await writeSnippets(snippets);
  renderSidebar();
  showSaved();
});

// ---- Vault (passphrase-encrypted snippets) ----------------------------------

els.vault.addEventListener('click', async () => {
  const s = currentSnippet();
  if (!s) return;

  if (!s.vault) {
    // Vault it now: encrypt the current content, store no plaintext.
    const body = els.fBody.value;
    if (!body.trim()) { alert('Write the snippet content first, then vault it.'); return; }
    const pass = prompt('Set a passphrase for this snippet (you will need it every time you fill it):');
    if (pass === null) return;
    if (!pass.trim()) { alert('Passphrase cannot be empty.'); return; }
    const pass2 = prompt('Repeat the passphrase:');
    if (pass2 === null) return;
    if (pass !== pass2) { alert('Passphrases do not match.'); return; }
    try {
      s.vault = await encryptText(pass, body);
    } catch (e) {
      alert('Encryption failed: ' + e.message);
      return;
    }
    s.body = '';
    revealedSnippetId = null;
    revealedPlain = null;
    dirty = false;
    await writeSnippets(snippets);
    selectSnippet(s.id);
    return;
  }

  if (revealedSnippetId === s.id) {
    // Re-lock: re-encrypt if the revealed content was edited, then hide.
    const plain = els.fBody.value;
    if (plain !== revealedPlain) {
      let pass = vaultPass();
      if (!pass) {
        const p = prompt('Passphrase to re-encrypt your changes:');
        if (p === null) return;
        pass = p;
      }
      try {
        s.vault = await encryptText(pass, plain);
      } catch (e) {
        alert('Re-encryption failed: ' + e.message);
        return;
      }
      vaultPassCache = { pass, until: Date.now() + 5 * 60 * 1000 };
      revealedPlain = plain;
    }
    s.body = '';
    revealedSnippetId = null;
    dirty = false;
    await writeSnippets(snippets);
    selectSnippet(s.id);
    return;
  }

  // Reveal: ask for the passphrase, show the plaintext (editable).
  let pass = vaultPass();
  if (!pass) {
    const p = prompt('Passphrase to reveal this snippet:');
    if (p === null) return;
    pass = p;
  }
  let plain;
  try {
    plain = await decryptText(pass, s.vault);
  } catch (e) {
    alert('Wrong passphrase.');
    return;
  }
  vaultPassCache = { pass, until: Date.now() + 5 * 60 * 1000 };
  revealedSnippetId = s.id;
  revealedPlain = plain;
  els.fBody.readOnly = false;
  els.fBody.classList.remove('ed-vaulted');
  els.fBody.value = plain;
  els.fBody.placeholder = '';
  els.vault.textContent = '🔒 Re-lock';
  els.charCount.textContent = plain.length;
});

// ---- Share (copy link) -----------------------------------------------------

document.getElementById('shareBtn').addEventListener('click', async () => {
  const current = currentSnippet();
  if (current && current.vault) {
    alert("Vault snippets can't be shared — that's the point 🙂");
    return;
  }
  const s = {
    title: els.fTitle.value.trim(),
    body: els.fBody.value,
    tags: els.fTags.value.split(',').map((t) => t.trim()).filter(Boolean),
    sites: els.fSites.value.split(',').map((t) => t.trim()).filter(Boolean),
    keywords: els.fKeywords.value.trim()
  };
  if (!s.body.trim()) { alert('Nothing to share yet — write the snippet content first.'); return; }
  const url = SHARE_URL_BASE + encodeShare(s);
  const btn = document.getElementById('shareBtn');
  try {
    await navigator.clipboard.writeText(url);
    const old = btn.textContent;
    btn.textContent = '✓ Link copied!';
    setTimeout(() => { btn.textContent = old; }, 1600);
  } catch (e) {
    alert('Copy failed — select and copy this link manually:\n\n' + url);
  }
});

// ---- Import shared (paste link) -------------------------------------------

const importPanel = document.getElementById('importPanel');
const importText = document.getElementById('importText');

function applyImport() {
  const single = decodeShare(importText.value);
  if (single.ok) {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    importPanel.hidden = true;
    addImportedSnippet(single.snippet);
    return;
  }
  const pack = decodePack(importText.value);
  if (!pack.ok) { alert('Import failed: ' + single.error); return; }
  if (dirty && !confirm(`Import ${pack.snippets.length} snippet${pack.snippets.length === 1 ? '' : 's'} and discard unsaved changes?`)) return;
  importPanel.hidden = true;
  importPackSnippets(pack);
}

document.getElementById('pasteImportBtn').addEventListener('click', () => {
  importPanel.hidden = !importPanel.hidden;
  if (!importPanel.hidden) { importText.value = ''; importText.focus(); }
});
document.getElementById('importApplyBtn').addEventListener('click', applyImport);
document.getElementById('importCancelBtn').addEventListener('click', () => { importPanel.hidden = true; });
importText.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') applyImport();
});

// ---- Pack links (multi-snippet share) --------------------------------------

const packPanel = document.getElementById('packPanel');
const packName = document.getElementById('packName');
const packList = document.getElementById('packList');

document.getElementById('packBtn').addEventListener('click', () => {
  if (!snippets.length) { alert('No snippets to pack yet.'); return; }
  packName.value = 'My PastePilot pack';
  packList.innerHTML = '';
  snippets.forEach((s) => {
    const lab = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.id = s.id;
    if (s.vault) {
      cb.disabled = true;
      lab.classList.add('locked');
      lab.append(cb, document.createTextNode('🔒 ' + (s.title || 'Untitled') + " — vault snippets can't travel"));
    } else {
      lab.append(cb, document.createTextNode((s.favorite ? '★ ' : '') + (s.title || 'Untitled')));
    }
    packList.appendChild(lab);
  });
  packPanel.hidden = false;
});

document.getElementById('packCancelBtn').addEventListener('click', () => { packPanel.hidden = true; });

document.getElementById('packCopyBtn').addEventListener('click', async () => {
  const chosen = snippets.filter((s) => {
    const cb = packList.querySelector('input[data-id="' + s.id + '"]');
    return cb && cb.checked && !cb.disabled;
  });
  if (!chosen.length) { alert("Select at least one snippet — vault snippets can't be packed."); return; }
  const name = packName.value.trim() || 'My PastePilot pack';
  const url = PACK_URL_BASE + encodePack(name, chosen);
  const btn = document.getElementById('packCopyBtn');
  try {
    await navigator.clipboard.writeText(url);
    const old = btn.textContent;
    btn.textContent = '✓ Pack link copied!';
    setTimeout(() => { btn.textContent = old; }, 1600);
    packPanel.hidden = true;
  } catch (e) {
    alert('Copy failed — select and copy this link manually:\n\n' + url);
  }
});

document.querySelectorAll('.ed-var').forEach((btn) => {
  btn.addEventListener('click', () => {
    const v = btn.dataset.var;
    const start = els.fBody.selectionStart != null ? els.fBody.selectionStart : els.fBody.value.length;
    const end = els.fBody.selectionEnd != null ? els.fBody.selectionEnd : els.fBody.value.length;
    els.fBody.value = els.fBody.value.slice(0, start) + v + els.fBody.value.slice(end);
    els.fBody.dispatchEvent(new Event('input'));
    els.fBody.focus();
    els.fBody.setSelectionRange(start + v.length, start + v.length);
  });
});

[els.fTitle, els.fBody, els.fTags, els.fSites, els.fKeywords].forEach((el) => {
  el.addEventListener('input', () => {
    dirty = true;
    els.charCount.textContent = els.fBody.value.length;
  });
  el.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveSnippet();
    }
  });
});


const els2 = {
  snippetsMain: document.getElementById('snippetsMain'),
  detailsMain: document.getElementById('detailsMain'),
  tabSnippets: document.getElementById('tabSnippets'),
  tabDetails: document.getElementById('tabDetails'),
  snippetActions: document.getElementById('snippetActions'),
  detailsFields: document.getElementById('detailsFields'),
  saveProfileBtn: document.getElementById('saveProfileBtn'),
  profileSavedMsg: document.getElementById('profileSavedMsg')
};

function cfId() {
  return 'cf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function customFieldRow(cf) {
  const row = document.createElement('div');
  row.className = 'ed-custom-field';
  row.dataset.id = cf.id || cfId();

  const label = document.createElement('input');
  label.type = 'text';
  label.className = 'cf-label';
  label.placeholder = 'Field label — e.g. Last previous company';
  label.value = cf.label || '';

  const value = document.createElement('input');
  value.type = 'text';
  value.className = 'cf-value';
  value.placeholder = 'Value — e.g. Infosys';
  value.value = cf.value || '';

  const keywords = document.createElement('input');
  keywords.type = 'text';
  keywords.className = 'cf-keywords';
  keywords.placeholder = 'Optional keywords, comma separated (blank = use the label)';
  keywords.value = cf.keywords || '';

  const del = document.createElement('button');
  del.className = 'cf-del ed-btn ed-btn-danger';
  del.textContent = '✕';
  del.title = 'Remove this field';
  del.addEventListener('click', () => row.remove());

  const top = document.createElement('div');
  top.className = 'ed-custom-row';
  top.append(label, del);
  row.append(top, value, keywords);
  return row;
}

function buildDetailsForm(profile) {
  els2.detailsFields.innerHTML = '';
  for (const f of PROFILE_FIELDS) {
    const wrap = document.createElement('label');
    wrap.className = 'ed-detail-field';
    const isArea = PROFILE_TEXTAREAS.includes(f.key);
    const input = isArea
      ? Object.assign(document.createElement('textarea'), { rows: 5 })
      : Object.assign(document.createElement('input'), { type: 'text' });
    input.dataset.key = f.key;
    input.value = profile[f.key] || '';
    input.placeholder = f.label;
    wrap.appendChild(document.createTextNode(f.label));
    wrap.appendChild(input);
    els2.detailsFields.appendChild(wrap);
  }

  const list = document.getElementById('customFields');
  list.innerHTML = '';
  for (const cf of getCustomFields(profile)) {
    list.appendChild(customFieldRow(cf));
  }
}

function collectDetailsForm() {
  const profile = {};
  els2.detailsFields.querySelectorAll('[data-key]').forEach((input) => {
    const v = input.value.trim();
    if (v) profile[input.dataset.key] = v;
  });
  const custom = [];
  document.querySelectorAll('#customFields .ed-custom-field').forEach((row) => {
    const label = row.querySelector('.cf-label').value.trim();
    const value = row.querySelector('.cf-value').value.trim();
    const keywords = row.querySelector('.cf-keywords').value.trim();
    if (label && value) custom.push({ id: row.dataset.id, label, value, keywords });
  });
  if (custom.length) profile.custom = custom;
  return profile;
}

function showView(view) {
  const details = view === 'details';
  els2.detailsMain.hidden = !details;
  els2.snippetsMain.hidden = details;
  els2.snippetActions.style.display = details ? 'none' : '';
  els2.tabSnippets.classList.toggle('active', !details);
  els2.tabDetails.classList.toggle('active', details);
  if (details) buildDetailsForm(currentProfile);
}

els2.tabSnippets.addEventListener('click', () => showView('snippets'));
els2.tabDetails.addEventListener('click', () => showView('details'));

els2.saveProfileBtn.addEventListener('click', async () => {
  currentProfile = collectDetailsForm();
  await saveProfile(currentProfile);
  els2.profileSavedMsg.hidden = false;
  setTimeout(() => { els2.profileSavedMsg.hidden = true; }, 1500);
});

document.getElementById('addCustomBtn').addEventListener('click', () => {
  document.getElementById('customFields').appendChild(customFieldRow({}));
});

let currentProfile = {};

(async function init() {
  snippets = await readSnippets();
  currentProfile = await getProfile();
  renderSidebar();
  selectSnippet(null);
  const params = new URLSearchParams(location.search);
  if (location.hash === '#details') {
    showView('details');
  } else if (params.get('capture') === '1') {
    await captureSelection();
  } else if (location.hash.startsWith('#pp=')) {
    // Direct import: editor opened with a share payload in the fragment
    let data = location.hash.slice(4);
    try { data = decodeURIComponent(data); } catch (e) { /* already plain */ }
    const res = decodeShare(data);
    if (res.ok) addImportedSnippet(res.snippet);
  } else if (location.hash.startsWith('#pack=')) {
    let data = location.hash.slice(6);
    try { data = decodeURIComponent(data); } catch (e) { /* already plain */ }
    const pack = decodePack(data);
    if (pack.ok) importPackSnippets(pack);
  } else if (params.get('welcome') === '1' && snippets.length) {
    selectSnippet(snippets[0].id);
  }
})();
