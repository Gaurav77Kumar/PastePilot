// Syntax-checks every extension JS file (module + classic) with node --check.
// Resolves the extension root relative to this script, so it works wherever
// the repo lives. Exits nonzero on the first failure, so CI stops here.

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Runtime folders plus dev folders (which should also parse cleanly);
// background.js lives at the root itself.
const SCAN_DIRS = ['lib', 'popup', 'editor', 'content', 'scripts', 'tests', 'test', 'site'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = [];
for (const d of SCAN_DIRS) {
  const p = join(ROOT, d);
  if (statSync(p).isDirectory()) files.push(...walk(p));
}
files.push(join(ROOT, 'background.js'));

let failed = 0;
for (const f of files) {
  const rel = relative(ROOT, f);
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed++;
    console.error(`FAIL ${rel}\n${r.stderr}`);
  } else {
    console.log(`ok   ${rel}`);
  }
}

if (failed) {
  console.error(`\n${failed} file(s) failed the syntax check.`);
  process.exit(1);
}
console.log(`\nAll ${files.length} JS files parse cleanly.`);
