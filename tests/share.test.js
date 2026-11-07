// Share-link codec: round-trips snippets through URL-safe base64. Shared
// links are untrusted input, so decodeShare must be strict.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, encodePack, decodePack } from '../lib/share.js';

test('share round-trips a snippet, unicode safe', () => {
  const s = {
    title: 'Résumé ✈',
    body: 'Line1\nLine2 — {{cursor}} 🚀',
    tags: ['jobs'],
    sites: ['linkedin.com'],
    keywords: 'k'
  };
  const data = encodeShare(s);
  assert.match(data, /^[A-Za-z0-9\-_]+$/, 'data must be URL-safe base64');
  const r = decodeShare(data);
  assert.equal(r.ok, true);
  assert.equal(r.snippet.title, 'Résumé ✈');
  assert.equal(r.snippet.body, s.body);
  assert.deepEqual(r.snippet.sites, ['linkedin.com']);
  assert.deepEqual(r.snippet.tags, ['jobs']);
});

test('decodeShare accepts a full share URL, not just raw data', () => {
  const data = encodeShare({ title: 'T', body: 'B' });
  const r = decodeShare('https://gaurav77kumar.github.io/PastePilot/site/import.html#pp=' + data);
  assert.equal(r.ok, true);
  assert.equal(r.snippet.body, 'B');
});

test('decodeShare rejects garbage, empty input and wrong versions', () => {
  assert.equal(decodeShare('').ok, false);
  assert.equal(decodeShare(null).ok, false);
  assert.equal(decodeShare('not valid base64 !!!').ok, false);
  const badVersion = Buffer.from(JSON.stringify({ v: 99, body: 'x' })).toString('base64url');
  assert.equal(decodeShare(badVersion).ok, false);
  const noBody = Buffer.from(JSON.stringify({ v: 1, title: 'x' })).toString('base64url');
  assert.equal(decodeShare(noBody).ok, false);
});

test('decodeShare applies defaults: sites ["*"], fallback title', () => {
  const r = decodeShare(encodeShare({ body: 'only body' }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.snippet.sites, ['*']);
  assert.equal(r.snippet.title, 'Shared snippet');
  assert.deepEqual(r.snippet.tags, []);
});

test('decodeShare clamps oversized titles/long tag lists from hostile links', () => {
  const longTitle = 'x'.repeat(500);
  const r = decodeShare(encodeShare({ title: longTitle, body: 'b', tags: ['1','2','3','4','5','6','7','8','9','10'] }));
  assert.equal(r.ok, true);
  assert.ok(r.snippet.title.length <= 120);
  assert.ok(r.snippet.tags.length <= 8);
});

// ---- Pack links -------------------------------------------------------------

test('pack round-trips multiple snippets with its name', () => {
  const snippets = [
    { title: 'A', body: 'Body A', tags: ['t'], sites: ['x.com'], keywords: '' },
    { title: 'B', body: 'Body B' }
  ];
  const r = decodePack(encodePack('My pack', snippets));
  assert.equal(r.ok, true);
  assert.equal(r.name, 'My pack');
  assert.equal(r.snippets.length, 2);
  assert.equal(r.snippets[0].body, 'Body A');
  assert.deepEqual(r.snippets[1].sites, ['*']);
});

test('decodePack accepts a full pack URL', () => {
  const data = encodePack('P', [{ title: 'T', body: 'B' }]);
  const r = decodePack('https://gaurav77kumar.github.io/PastePilot/site/import.html#pack=' + data);
  assert.equal(r.ok, true);
  assert.equal(r.snippets[0].body, 'B');
});

test('packs drop local-only fields (favorite/vault never travel)', () => {
  const r = decodePack(encodePack('P', [{ title: 'A', body: 'b', favorite: true }]));
  assert.equal(r.ok, true);
  assert.equal(r.snippets[0].favorite, undefined);
  assert.equal(r.snippets[0].vault, undefined);
});

test('packs exclude vault snippets and empty bodies at encode time', () => {
  const r = decodePack(encodePack('P', [
    { title: 'Locked', body: 'x', vault: { v: 1, salt: 's', iv: 'i', ct: 'c' } },
    { title: 'Empty', body: '   ' },
    { title: 'Good', body: 'kept' }
  ]));
  assert.equal(r.ok, true);
  assert.equal(r.snippets.length, 1);
  assert.equal(r.snippets[0].title, 'Good');
});

test('packs are capped at 20 snippets', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ title: 'S' + i, body: 'b' + i }));
  const r = decodePack(encodePack('Big', many));
  assert.equal(r.ok, true);
  assert.equal(r.snippets.length, 20);
});

test('decodePack rejects empty packs and garbage', () => {
  assert.equal(decodePack(encodePack('Empty', [])).ok, false);
  assert.equal(decodePack('').ok, false);
  assert.equal(decodePack('garbage!!').ok, false);
});
