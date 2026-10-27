// Tests for the storage layer with an in-memory chrome.storage mock.
// Each node --test file runs in its own process, so installing the mock on
// globalThis here is safe.

import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeChromeMock({ syncSetFails = false } = {}) {
  const syncMap = new Map();
  const localMap = new Map();
  const area = (m) => ({
    get: async (keys) => {
      if (keys === null || keys === undefined) return Object.fromEntries(m);
      if (typeof keys === 'string') {
        const out = {};
        if (m.has(keys)) out[keys] = m.get(keys);
        return out;
      }
      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) if (m.has(k)) out[k] = m.get(k);
        return out;
      }
      const out = {};
      for (const k of Object.keys(keys)) out[k] = m.has(k) ? m.get(k) : keys[k];
      return out;
    },
    set: async (obj) => {
      if (m === syncMap && syncSetFails) throw new Error('QUOTA_BYTES exceeded');
      for (const [k, v] of Object.entries(obj)) m.set(k, v);
    },
    remove: async (keys) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) m.delete(k);
    }
  });
  const chrome = {
    storage: { sync: area(syncMap), local: area(localMap) }
  };
  return { chrome, syncMap, localMap };
}

const { chrome, syncMap, localMap } = makeChromeMock();
globalThis.chrome = chrome;

const { readSnippets, writeSnippets, ensureSeeded, DEFAULT_SNIPPETS, getProfile, saveProfile } =
  await import('../lib/storage.js');

test('write then read round-trips snippets through chunks', async () => {
  const snips = [{ id: 'a', title: 'T', body: 'B', tags: [], sites: ['*'], keywords: '' }];
  await writeSnippets(snips);
  assert.deepEqual(await readSnippets(), snips);
});

test('large snippet lists are chunked and stale chunks are cleaned up', async () => {
  const big = Array.from({ length: 30 }, (_, i) => ({
    id: 's' + i, title: 'Snippet ' + i, body: 'x'.repeat(4000), tags: [], sites: ['*'], keywords: ''
  }));
  await writeSnippets(big); // ~120KB → many chunks
  const meta = syncMap.get('pp_meta');
  assert.ok(meta.chunks >= 2, 'expected multiple chunks, got ' + meta.chunks);

  // Now save something much smaller: old high-index chunks must be removed
  const small = [{ id: 'one', title: 'One', body: 'hi', tags: [], sites: ['*'], keywords: '' }];
  await writeSnippets(small);
  const leftover = [...syncMap.keys()].filter((k) => k.startsWith('pp_c_'));
  assert.equal(leftover.length, 1);
  assert.equal(syncMap.get('pp_c_0'), JSON.stringify(small));
  assert.deepEqual(await readSnippets(), small);
});

test('local mirror always holds the full copy', async () => {
  const snips = [{ id: 'm', title: 'M', body: 'mirror', tags: [], sites: ['*'], keywords: '' }];
  await writeSnippets(snips);
  assert.deepEqual(JSON.parse(localMap.get('pp_local_mirror')), snips);
});

test('readSnippets falls back to the local mirror when sync is corrupted', async () => {
  const snips = [{ id: 'mm', title: 'MM', body: 'safe', tags: [], sites: ['*'], keywords: '' }];
  await writeSnippets(snips);
  // Corrupt the first chunk so sync reassembly fails
  syncMap.set('pp_c_0', '{{{not json');
  assert.deepEqual(await readSnippets(), snips);
});

test('fresh install seeds the default snippets', async () => {
  syncMap.clear();
  localMap.clear();
  await ensureSeeded();
  assert.equal((await readSnippets()).length, DEFAULT_SNIPPETS.length);
  assert.ok(localMap.has('pp_local_mirror'));
});

test('second device: existing synced data is mirrored, never clobbered by seeds', async () => {
  // Device 1 wrote user snippets (sync + local). Device 2 installs: local is
  // empty, sync has the user's data. ensureSeeded must NOT write the defaults.
  const userSnips = [{ id: 'user-1', title: 'Mine', body: 'keep me', tags: [], sites: ['*'], keywords: '' }];
  await writeSnippets(userSnips);
  const syncBefore = JSON.stringify([...syncMap.entries()]);
  localMap.clear(); // simulate the fresh device

  await ensureSeeded();
  assert.deepEqual(await readSnippets(), userSnips, 'synced user data must survive');
  assert.deepEqual(JSON.parse(localMap.get('pp_local_mirror')), userSnips, 'mirror refreshed from sync');
  assert.equal(JSON.stringify([...syncMap.entries()]), syncBefore, 'sync untouched by seeding');
});

test('sync write failure is survivable: mirror-first keeps data safe', async () => {
  const failing = makeChromeMock({ syncSetFails: true });
  const savedChrome = globalThis.chrome;
  globalThis.chrome = failing.chrome; // storage.js resolves chrome at call time
  try {
    const snips = [{ id: 'q', title: 'Q', body: 'quota', tags: [], sites: ['*'], keywords: '' }];
    await writeSnippets(snips); // must not reject
    assert.deepEqual(JSON.parse(failing.localMap.get('pp_local_mirror')), snips);
  } finally {
    globalThis.chrome = savedChrome;
  }
});

test('profile is stored and read back', async () => {
  await saveProfile({ fullName: 'Ada Lovelace', email: 'ada@example.com' });
  assert.deepEqual(await getProfile(), { fullName: 'Ada Lovelace', email: 'ada@example.com' });
  assert.deepEqual(await getProfile(), await getProfile());
});
