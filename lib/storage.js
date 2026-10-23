// PastePilot — storage layer.
// Snippets live in chrome.storage.sync so they follow the user across devices.
// The serialized list is split into chunks because sync limits each item to 8KB.
// A mirror copy is always kept in storage.local so data survives sync quota issues.

const CHUNK_SIZE = 6000; // chars per chunk, safely under the 8192-byte per-item limit
const META_KEY = 'pp_meta';
const CHUNK_PREFIX = 'pp_c_';
const LOCAL_MIRROR_KEY = 'pp_local_mirror';
const PROFILE_KEY = 'pp_profile';

// Identity profile ("My details") — a small flat object, e.g.
// { fullName, firstName, lastName, email, phone, github, linkedin, portfolio, location, headline, about }
export async function getProfile() {
  const o = await chrome.storage.sync.get(PROFILE_KEY);
  return o[PROFILE_KEY] || {};
}

export async function saveProfile(profile) {
  await chrome.storage.sync.set({ [PROFILE_KEY]: profile });
}

function chunkString(str, size) {
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out.length ? out : [''];
}

async function syncGet(keys) {
  return chrome.storage.sync.get(keys);
}

async function writeSnippets(snippets) {
  const json = JSON.stringify(snippets);
  const chunks = chunkString(json, CHUNK_SIZE);
  const meta = { v: 1, chunks: chunks.length, updated: Date.now() };

  // Remove stale chunks from previous saves
  const old = await syncGet(null);
  const staleKeys = Object.keys(old).filter(
    (k) => k.startsWith(CHUNK_PREFIX) && k !== CHUNK_PREFIX + '0'
  );
  const toRemove = [];
  for (let i = chunks.length; i < 60; i++) {
    const k = CHUNK_PREFIX + i;
    if (staleKeys.includes(k)) toRemove.push(k);
  }
  if (toRemove.length) await chrome.storage.sync.remove(toRemove);

  const payload = { [META_KEY]: meta };
  chunks.forEach((c, i) => (payload[CHUNK_PREFIX + i] = c));

  // Local mirror first: it is the safety net, so it must persist even if the
  // sync write fails (sync quota is 100KB total; local is ~5MB).
  await chrome.storage.local.set({ [LOCAL_MIRROR_KEY]: json });

  try {
    await chrome.storage.sync.set(payload);
  } catch (e) {
    // Over sync quota or sync unavailable — data is safe in the local mirror.
    console.warn('PastePilot: sync write failed, kept local mirror:', e && e.message || e);
  }
  return true;
}

async function readSnippets() {
  // Try sync first; fall back to the local mirror if sync is empty or broken
  let data = null;
  try {
    data = await syncGet(null);
  } catch (e) {
    data = null;
  }
  const meta = data && data[META_KEY];
  if (meta && typeof meta.chunks === 'number') {
    let json = '';
    let ok = true;
    for (let i = 0; i < meta.chunks; i++) {
      const part = data[CHUNK_PREFIX + i];
      if (typeof part !== 'string') { ok = false; break; }
      json += part;
    }
    if (ok) {
      try {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { /* fall through to local mirror */ }
    }
  }
  const local = await chrome.storage.local.get(LOCAL_MIRROR_KEY);
  const mirror = local[LOCAL_MIRROR_KEY];
  if (mirror) {
    try {
      const parsed = JSON.parse(mirror);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) { /* corrupted; start fresh */ }
  }
  return [];
}

// Seed helpers ---------------------------------------------------------------

const DEFAULT_SNIPPETS = [
  {
    id: 'pp-seed-1',
    title: 'Home address (formatted)',
    body: '1234 Maple Street, Apt 5B\nSpringfield, IL 62704\nUnited States',
    tags: ['address'],
    sites: ['*'],
    keywords: 'address, street, mailing',
    usageCount: 0,
    lastUsed: 0,
    createdAt: Date.now()
  },
  {
    id: 'pp-seed-2',
    title: 'Follow-up reply',
    body: 'Hi {{cursor}},\n\nThanks for reaching out! Just following up on this — let me know if you need anything else from my side.\n\nBest regards',
    tags: ['email'],
    sites: ['*'],
    keywords: 'reply, follow, message',
    usageCount: 0,
    lastUsed: 0,
    createdAt: Date.now()
  },
  {
    id: 'pp-seed-3',
    title: '"Why do you want this role?" starter',
    body: 'I am drawn to this role because {{cursor}} — and I believe my background in [your field] maps directly onto what the team is building.',
    tags: ['jobs'],
    sites: ['*'],
    keywords: 'why, role, position, cover',
    usageCount: 0,
    lastUsed: 0,
    createdAt: Date.now()
  }
];

async function ensureSeeded() {
  const meta = await chrome.storage.local.get(LOCAL_MIRROR_KEY);
  if (meta[LOCAL_MIRROR_KEY]) return;
  // Snippets synced from another device? Refresh the local mirror from sync
  // instead of seeding — seeding would overwrite the user's synced data.
  let syncMeta = null;
  try {
    const o = await syncGet(META_KEY);
    syncMeta = o && o[META_KEY];
  } catch (e) { syncMeta = null; }
  if (syncMeta && typeof syncMeta.chunks === 'number') {
    const snippets = await readSnippets();
    await chrome.storage.local.set({ [LOCAL_MIRROR_KEY]: JSON.stringify(snippets) });
    return;
  }
  await writeSnippets(DEFAULT_SNIPPETS);
}

export { readSnippets, writeSnippets, ensureSeeded, DEFAULT_SNIPPETS };
