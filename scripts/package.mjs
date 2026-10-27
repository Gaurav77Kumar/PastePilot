// Builds dist/pastepilot-v<version>.zip from this repo (the extension root),
// with manifest.json at the zip root — exactly what the Chrome Web Store
// expects. Development files (tests, scripts, CI, docs) are excluded so the
// store package contains only what the extension needs to run.
// Pure Node (STORED entries, no compression): zero dependencies, works the
// same on Windows, macOS and Linux. The Web Store accepts stored zips.

import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(SRC, 'dist');
const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));
const OUT = join(DIST, `pastepilot-v${manifest.version}.zip`);

// Dev-only entries that must never end up in the store package.
const EXCLUDED_DIRS = new Set([
  '.git', '.github', 'dist', 'node_modules',
  'tests', 'test', 'scripts', 'docs'
]);
const EXCLUDED_FILES = new Set([
  'package.json', 'package-lock.json', 'README.md', '.gitignore'
]);
const EXCLUDED_EXT = /\.(zip|crx|pem|log)$/i;
const EXCLUDED_NAMES = new Set(['.DS_Store', 'Thumbs.db']);

function isExcluded(rel) {
  const parts = rel.split(sep);
  const base = parts[parts.length - 1];
  return parts.some((p) => EXCLUDED_DIRS.has(p)) ||
    EXCLUDED_FILES.has(base) || EXCLUDED_EXT.test(base) || EXCLUDED_NAMES.has(base);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

function buildZip(files) {
  const now = dosDateTime(new Date());
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // UTF-8 names
    local.writeUInt16LE(0, 8);           // STORED
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);        // version made by
    central.writeUInt16LE(20, 6);        // version needed
    central.writeUInt16LE(0x0800, 8);    // UTF-8 names
    central.writeUInt16LE(0, 10);        // STORED
    central.writeUInt16LE(now.time, 12);
    central.writeUInt16LE(now.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const files = walk(SRC)
  .map((p) => ({ p, rel: relative(SRC, p) }))
  .filter(({ rel }) => !isExcluded(rel))
  .map(({ p, rel }) => ({
    name: rel.split(sep).join('/'),
    data: readFileSync(p)
  }));

if (!files.some((f) => f.name === 'manifest.json')) {
  console.error('FATAL: manifest.json not found — refusing to build a bad zip.');
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });
writeFileSync(OUT, buildZip(files));
console.log(`Built ${relative(SRC, OUT)} (${files.length} files, manifest at zip root)`);
