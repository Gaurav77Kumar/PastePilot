// PastePilot — Vault snippets. Passphrase-encrypted content: AES-GCM-256 with
// a key derived via PBKDF2-SHA256 (310k iterations). The plaintext is never
// stored — only { salt, iv, ciphertext }. Pure module: works in the service
// worker, extension pages and Node tests (WebCrypto is global in all three).

const VAULT_VERSION = 1;
const PBKDF2_ITERATIONS = 310000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function bytesToB64Url(u8) {
  let bin = '';
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToBytes(s) {
  let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// encryptText(pass, text) -> { v, salt, iv, ct } — all b64url strings
async function encryptText(passphrase, text) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(String(text))
  );
  return {
    v: VAULT_VERSION,
    salt: bytesToB64Url(salt),
    iv: bytesToB64Url(iv),
    ct: bytesToB64Url(new Uint8Array(ct))
  };
}

// decryptText(pass, blob) -> plaintext. Throws on wrong passphrase or tampered
// ciphertext (AES-GCM authentication failure).
async function decryptText(passphrase, blob) {
  if (!isValidVaultBlob(blob)) throw new Error('Not a valid vault blob');
  const key = await deriveKey(passphrase, b64UrlToBytes(blob.salt));
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64UrlToBytes(blob.iv) },
    key,
    b64UrlToBytes(blob.ct)
  );
  return new TextDecoder().decode(pt);
}

function isValidVaultBlob(o) {
  return !!o && typeof o === 'object' && o.v === VAULT_VERSION &&
    typeof o.salt === 'string' && o.salt.length > 0 &&
    typeof o.iv === 'string' && o.iv.length > 0 &&
    typeof o.ct === 'string' && o.ct.length > 0;
}

export { encryptText, decryptText, isValidVaultBlob, VAULT_VERSION, PBKDF2_ITERATIONS };
