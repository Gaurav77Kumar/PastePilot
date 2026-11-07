// PastePilot — snippet share links. Zero servers: the snippet is encoded into
// the URL fragment itself (#pp=<base64url>), so sharing works with nothing but
// a link. Fragments are never sent to any server.
//
// Accepts a snippet { title, body, tags, sites, keywords }. decodeShare is
// defensive on purpose: shared links are untrusted input.

const SHARE_VERSION = 1;
const MAX_DECODED_CHARS = 20000;
const PACK_MAX_SNIPPETS = 20;
const MAX_DECODED_PACK_CHARS = 60000;

function toB64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s) {
  let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// Clamps a snippet into its shareable form. Local-only fields (favorite,
// vault) are intentionally dropped — they never travel.
function sanitizeSnippet(s) {
  const o = s || {};
  return {
    title: String(o.title || '').slice(0, 120),
    body: String(o.body || ''),
    tags: Array.isArray(o.tags) ? o.tags.slice(0, 8).map(String) : [],
    sites: Array.isArray(o.sites) ? o.sites.slice(0, 8).map(String) : [],
    keywords: String(o.keywords || '')
  };
}

// encodeShare(snippet) -> opaque data string (the part that follows #pp=)
function encodeShare(snippet) {
  const payload = { v: SHARE_VERSION, ...sanitizeSnippet(snippet) };
  return toB64Url(JSON.stringify(payload));
}

// Shared payload parsing: accepts the raw data string or a full URL whose
// fragment contains "#<marker>=<data>".
function parsePayload(dataOrUrl, marker, maxChars) {
  const raw = String(dataOrUrl || '').trim();
  const m = raw.match(new RegExp('#' + marker + '=([A-Za-z0-9_-]+)'));
  const b64 = m ? m[1] : raw;
  if (!b64) return null;
  let json;
  try {
    json = fromB64Url(b64);
  } catch (e) {
    return null; // invalid base64 — hostile/corrupt link, fail gracefully
  }
  if (!json || json.length > maxChars) return null;
  try {
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

// decodeShare(dataOrUrl) -> { ok: true, snippet } | { ok: false, error }
// Accepts the raw data string or a full share URL containing "#pp=...".
function decodeShare(dataOrUrl) {
  const o = parsePayload(dataOrUrl, 'pp', MAX_DECODED_CHARS);
  if (!o || o.v !== SHARE_VERSION || typeof o.body !== 'string' || !o.body.trim()) {
    return { ok: false, error: 'Not a valid PastePilot share' };
  }
  return {
    ok: true,
    snippet: {
      title: String(o.title || 'Shared snippet'),
      body: o.body,
      tags: Array.isArray(o.tags) ? o.tags : [],
      sites: Array.isArray(o.sites) && o.sites.length ? o.sites : ['*'],
      keywords: typeof o.keywords === 'string' ? o.keywords : ''
    }
  };
}

// encodePack(name, snippets) -> opaque data string (follows #pack=).
// Vault snippets are excluded (they cannot travel — that is the point).
function encodePack(name, snippets) {
  const list = (Array.isArray(snippets) ? snippets : [])
    .filter((s) => s && !s.vault && typeof s.body === 'string' && s.body.trim())
    .slice(0, PACK_MAX_SNIPPETS)
    .map(sanitizeSnippet);
  const payload = {
    v: SHARE_VERSION,
    type: 'pack',
    name: String(name || 'Snippet pack').slice(0, 80),
    snippets: list
  };
  return toB64Url(JSON.stringify(payload));
}

// decodePack(dataOrUrl) -> { ok: true, name, snippets } | { ok: false, error }
function decodePack(dataOrUrl) {
  const o = parsePayload(dataOrUrl, 'pack', MAX_DECODED_PACK_CHARS);
  if (!o || o.v !== SHARE_VERSION || o.type !== 'pack' || !Array.isArray(o.snippets)) {
    return { ok: false, error: 'Not a valid PastePilot pack' };
  }
  const snippets = o.snippets
    .filter((s) => s && typeof s.body === 'string' && s.body.trim())
    .map((s) => ({
      title: String(s.title || 'Shared snippet'),
      body: s.body,
      tags: Array.isArray(s.tags) ? s.tags : [],
      sites: Array.isArray(s.sites) && s.sites.length ? s.sites : ['*'],
      keywords: typeof s.keywords === 'string' ? s.keywords : ''
    }));
  if (!snippets.length) return { ok: false, error: 'Pack contains no usable snippets' };
  return { ok: true, name: String(o.name || 'Snippet pack'), snippets };
}

export { encodeShare, decodeShare, encodePack, decodePack };
