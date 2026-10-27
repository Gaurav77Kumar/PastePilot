// Service worker behavior with a mocked chrome API: install seeding,
// welcome-tab, quick-pick command injection, and the pp-usage message flow.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const installed = { onInstalled: [], onCommand: [], onMessage: [] };
const createdTabs = [];
const injections = [];

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
    return Object.fromEntries(m);
  },
  set: async (obj) => { for (const [k, v] of Object.entries(obj)) m.set(k, v); },
  remove: async (keys) => { for (const k of [].concat(keys)) m.delete(k); }
});

globalThis.chrome = {
  storage: { sync: area(syncMap), local: area(localMap) },
  runtime: {
    onInstalled: { addListener: (f) => installed.onInstalled.push(f) },
    onMessage: { addListener: (f) => installed.onMessage.push(f) }
  },
  commands: { onCommand: { addListener: (f) => installed.onCommand.push(f) } },
  tabs: {
    query: async () => [{ id: 7, url: 'https://example.com/form', title: 'Form' }],
    create: async (opts) => { createdTabs.push(opts); }
  },
  scripting: {
    executeScript: async (opts) => { injections.push(opts); return [{ result: { filled: true } }]; }
  }
};

const { readSnippets, writeSnippets } = await import('../lib/storage.js');
await import('../background.js');

test('service worker registers its three listeners', () => {
  assert.equal(installed.onInstalled.length, 1);
  assert.equal(installed.onCommand.length, 1);
  assert.equal(installed.onMessage.length, 1);
});

test('install seeds snippets and opens the editor welcome page', async () => {
  await installed.onInstalled[0]({ reason: 'install' });
  assert.equal((await readSnippets()).length >= 1, true);
  assert.equal(createdTabs.length, 1);
  assert.match(createdTabs[0].url, /editor\/editor\.html\?welcome=1/);
});

test('update does not re-open the welcome tab', async () => {
  createdTabs.length = 0;
  await installed.onInstalled[0]({ reason: 'update' });
  assert.equal(createdTabs.length, 0);
});

test('quick-pick command injects content/quickpick.js into the active tab', async () => {
  injections.length = 0;
  await installed.onCommand[0]('quick-pick');
  assert.equal(injections.length, 1);
  assert.deepEqual(injections[0].files, ['content/quickpick.js']);
  assert.equal(injections[0].target.tabId, 7);
  assert.equal(injections[0].target.allFrames, true);
});

test('quick-pick on a restricted page is caught, not thrown', async () => {
  const origQuery = globalThis.chrome.tabs.query;
  globalThis.chrome.tabs.query = async () => [{ id: 1 }];
  globalThis.chrome.scripting.executeScript = async () => {
    throw new Error('Cannot access contents of the page.');
  };
  try {
    await installed.onCommand[0]('quick-pick'); // must not reject
  } finally {
    globalThis.chrome.tabs.query = origQuery;
  }
});

test('unknown command is ignored', async () => {
  injections.length = 0;
  await installed.onCommand[0]('not-a-command');
  assert.equal(injections.length, 0);
});

test('pp-usage message bumps usageCount and lastUsed', async () => {
  const handler = installed.onMessage[0];
  const snips = [{ id: 'u1', title: 'U', body: 'b', tags: [], sites: ['*'], keywords: '', usageCount: 2, lastUsed: 0 }];
  await writeSnippets(snips);

  const response = await new Promise((resolve) => {
    const keptAlive = handler({ type: 'pp-usage', id: 'u1' }, {}, resolve);
    assert.equal(keptAlive, true, 'handler must keep the message channel open for the async reply');
  });
  assert.deepEqual(response, { ok: true });

  const [s] = await readSnippets();
  assert.equal(s.usageCount, 3);
  assert.ok(s.lastUsed > 0);
});

test('pp-usage for an unknown id still answers ok', async () => {
  const handler = installed.onMessage[0];
  const response = await new Promise((resolve) => handler({ type: 'pp-usage', id: 'nope' }, {}, resolve));
  assert.deepEqual(response, { ok: true });
});

test('other message types do not claim the response channel', () => {
  const handler = installed.onMessage[0];
  assert.equal(handler({ type: 'other' }, {}, () => {}), undefined);
  assert.equal(handler(null, {}, () => {}), undefined);
});
