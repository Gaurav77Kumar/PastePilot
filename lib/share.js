// PastePilot — snippet share links. Zero servers: the snippet is encoded into
// the URL fragment itself (#pp=<base64url>), so sharing works with nothing but
// a link. Fragments are never sent to any server.
//
// Accepts a snippet { title, body, tags, sites, keywords }. decodeShare is
// defensive on purpose: shared links are untrusted input.

const SHARE_VERSION = 1;
const MAX_DECODED_CHARS = 20000;

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

// encodeShare(snippet) -> opaque data string (the part that follows #pp=)
function encodeShare(snippet) {
  const s = snippet || {};
  const payload = {
    v: SHARE_VERSION,
    title: String(s.title || '').slice(0, 120),
    body: String(s.body || ''),
    tags: Array.isArray(s.tags) ? s.tags.slice(0, 8).map(String) : [],
    sites: Array.isArray(s.sites) ? s.sites.slice(0, 8).map(String) : [],
    keywords: String(s.keywords || '')
  };
  return toB64Url(JSON.stringify(payload));
}

// decodeShare(dataOrUrl) -> { ok: true, snippet } | { ok: false, error }
// Accepts the raw data string or a full share URL containing "#pp=...".
function decodeShare(dataOrUrl) {
  try {
    const raw = String(dataOrUrl || '').trim();
    const m = raw.match(/#pp=([A-Za-z0-9\-_]+)/);
    const b64 = m ? m[1] : raw;
    if (!b64) return { ok: false, error: 'Nothing to import' };
    const json = fromB64Url(b64);
    if (!json || json.length > MAX_DECODED_CHARS) {
      return { ok: false, error: 'Snippet too large to import' };
    }
    const o = JSON.parse(json);
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
  } catch (e) {
    return { ok: false, error: 'Could not read this share' };
  }
}

export { encodeShare, decodeShare };
