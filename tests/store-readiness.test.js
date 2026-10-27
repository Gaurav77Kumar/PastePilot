// Store-readiness gates: manifest sanity, icon integrity, MV3 CSP compliance,
// and no remote code. These run in CI so a store-rejection regression can
// never be pushed silently.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only the shipped extension is scanned — dev folders (tests, scripts, docs,
// CI) are excluded, matching exactly what scripts/package.mjs puts in the zip.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEV_DIRS = new Set(['.git', '.github', 'dist', 'node_modules', 'tests', 'test', 'scripts', 'docs']);
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!DEV_DIRS.has(name)) out.push(...walk(p));
    } else out.push(p);
  }
  return out;
}

function pngSize(file) {
  const b = readFileSync(file);
  assert.ok(b.length > 24, `${file} is too small to be a PNG`);
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  assert.ok(isPng, `${file} is not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test('manifest is Manifest V3 with a valid semver version', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+(\.\d+){1,3}$/);
});

test('name and description fit Chrome Web Store limits', () => {
  assert.ok(manifest.name.length > 0 && manifest.name.length <= 75, 'name must be 1-75 chars');
  assert.ok(manifest.description.length > 0 && manifest.description.length <= 132,
    'description must be 1-132 chars, got ' + manifest.description.length);
});

test('permissions stay narrow: no broad hosts, no taboo APIs', () => {
  const allowed = new Set(['activeTab', 'scripting', 'storage']);
  for (const p of manifest.permissions || []) {
    assert.ok(allowed.has(p), `unexpected permission "${p}" — justify it or drop it`);
  }
  assert.equal(manifest.host_permissions, undefined, 'no host_permissions on purpose');
  assert.equal(manifest.content_scripts, undefined, 'no always-injected content scripts on purpose');
});

test('all declared icons exist and have the right pixel size', () => {
  for (const [size, file] of Object.entries(manifest.icons)) {
    const p = join(ROOT, file);
    assert.ok(statSync(p).isFile, `missing icon ${file}`);
    assert.deepEqual(pngSize(p), { w: Number(size), h: Number(size) }, `${file} must be ${size}x${size}`);
  }
  for (const [size, file] of Object.entries(manifest.action.default_icon)) {
    assert.deepEqual(pngSize(join(ROOT, file)), { w: Number(size), h: Number(size) });
  }
});

test('every file the manifest references exists', () => {
  const refs = [
    manifest.action?.default_popup,
    manifest.options_ui?.page,
    manifest.background?.service_worker
  ].filter(Boolean);
  for (const r of refs) assert.ok(statSync(join(ROOT, r)).isFile, `missing ${r}`);
  for (const cmd of Object.values(manifest.commands || {})) {
    assert.ok(cmd.description, 'commands need descriptions (shown to users)');
  }
});

test('module service worker declares type "module"', () => {
  const src = readFileSync(join(ROOT, manifest.background.service_worker), 'utf8');
  const usesImport = /(^|\n)\s*import\s/.test(src);
  if (usesImport) assert.equal(manifest.background.type, 'module');
});

test('extension pages have no inline scripts, handlers or remote code (MV3 CSP)', () => {
  for (const file of walk(ROOT).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const inline = html.match(/<script(?![^>]*\bsrc=)[^>]*>/gi);
    assert.deepEqual(inline, null, `${file}: inline <script> is blocked by MV3 CSP: ${inline}`);
    const handler = html.match(/<[^>]*\son[a-z]+\s*=\s*["']/i);
    assert.equal(handler, null, `${file}: inline event handlers violate MV3 CSP: ${handler}`);
    const remote = html.match(/<script[^>]*src\s*=\s*["']https?:/i);
    assert.equal(remote, null, `${file}: remote scripts are not allowed (remote code rule)`);
    const jsHref = html.match(/href\s*=\s*["']javascript:/i);
    assert.equal(jsHref, null, `${file}: javascript: URLs violate MV3 CSP`);
  }
});

test('extension scripts contain no eval / remote fetch / remote imports', () => {
  for (const file of walk(ROOT).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(file, 'utf8');
    assert.ok(!/\beval\s*\(/.test(src), `${file}: eval() is blocked by MV3 CSP`);
    assert.ok(!/new\s+Function\s*\(/.test(src), `${file}: new Function() is blocked by MV3 CSP`);
    assert.ok(!/\bfetch\s*\(\s*["']https?:/i.test(src), `${file}: no remote fetches allowed`);
    assert.ok(!/XMLHttpRequest/.test(src), `${file}: no XHR to remote hosts`);
    assert.ok(!/import\s*\(\s*["']https?:/i.test(src), `${file}: no remote dynamic imports`);
    assert.ok(!/document\.write/.test(src), `${file}: document.write is unsafe`);
  }
});

test('every script/html/css referenced by extension pages ships in the folder', () => {
  const shipped = new Set(walk(ROOT).map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/')));
  for (const file of walk(ROOT).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    const base = dirname(file).slice(ROOT.length + 1).replace(/\\/g, '/');
    for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
      const ref = m[1];
      if (/^(https?:|data:|#|mailto:)/.test(ref)) continue;
      const resolved = base ? join(base, ...ref.split('/')) : ref.replace(/\//g, '/');
      const norm = resolved.replace(/\\/g, '/');
      assert.ok(shipped.has(norm), `${file} references "${ref}" which is not in the extension folder`);
    }
  }
});
