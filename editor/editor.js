
import { readSnippets, writeSnippets, getProfile, saveProfile } from '../lib/storage.js';
import { PROFILE_FIELDS, PROFILE_TEXTAREAS, getCustomFields } from '../lib/identity.js';

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
  savedMsg: document.getElementById('savedMsg')
};

function uid() {
  return 'pp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function currentSnippet() {
  return snippets.find((s) => s.id === currentId) || null;
}

function showSaved() {
  els.savedMsg.hidden = false;
  setTimeout(() => { els.savedMsg.hidden = true; }, 1500);
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
    div.querySelector('.t').textContent = s.title || 'Untitled';
    div.querySelector('.s').textContent = s.body.replace(/\s+/g, ' ').slice(0, 60);
    div.addEventListener('click', () => {
      if (dirty && !confirm('Discard unsaved changes?')) return;
      selectSnippet(s.id);
    });
    els.sidebarList.appendChild(div);
  });
  els.countLabel.textContent = `${snippets.length} snippet${snippets.length === 1 ? '' : 's'}`;
}

function selectSnippet(id) {
  currentId = id;
  dirty = false;
  const s = currentSnippet();
  els.editorPane.hidden = !s;
  els.emptyPane.hidden = !!s;
  if (!s) return;
  els.fTitle.value = s.title || '';
  els.fBody.value = s.body || '';
  els.fTags.value = (s.tags || []).join(', ');
  els.fSites.value = (s.sites || []).join(', ');
  els.fKeywords.value = s.keywords || '';
  els.charCount.textContent = (s.body || '').length;
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
  s.body = els.fBody.value;
  s.tags = els.fTags.value.split(',').map((t) => t.trim()).filter(Boolean);
  s.sites = els.fSites.value.split(',').map((t) => t.trim()).filter(Boolean);
  if (!s.sites.length) s.sites = ['*'];
  s.keywords = els.fKeywords.value.trim();
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

// My details view 

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

// Init

let currentProfile = {};

(async function init() {
  snippets = await readSnippets();
  currentProfile = await getProfile();
  renderSidebar();
  selectSnippet(null);
  if (location.hash === '#details') {
    showView('details');
  } else if (new URLSearchParams(location.search).get('welcome') === '1' && snippets.length) {
    selectSnippet(snippets[0].id);
  }
})();
