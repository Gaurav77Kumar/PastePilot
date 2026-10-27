import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_FIELDS, PROFILE_TEXTAREAS, CORE_PROFILE_KEYS,
  deriveKeywords, customFieldKeywords, getCustomFields
} from '../lib/identity.js';

test('profile fields have unique keys, labels and non-empty keywords', () => {
  const keys = PROFILE_FIELDS.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const f of PROFILE_FIELDS) {
    assert.ok(f.label, `field ${f.key} needs a label`);
    assert.ok(f.keywords.length > 0, `field ${f.key} needs keywords`);
    for (const kw of f.keywords) assert.ok(kw.length > 1);
  }
});

test('specific name fields score before generic "name" (fill-form ordering)', () => {
  const order = PROFILE_FIELDS.map((f) => f.key);
  assert.ok(order.indexOf('firstName') < order.indexOf('fullName'));
  assert.ok(order.indexOf('lastName') < order.indexOf('fullName'));
});

test('every textarea key refers to a real profile field', () => {
  const keys = new Set(PROFILE_FIELDS.map((f) => f.key));
  for (const k of PROFILE_TEXTAREAS) assert.ok(keys.has(k));
});

test('deriveKeywords: full label plus significant words, deduped', () => {
  const kws = deriveKeywords('Last previous company');
  assert.ok(kws.includes('last previous company'));
  assert.ok(kws.includes('previous'));
  assert.ok(kws.includes('company'));
  assert.equal(new Set(kws).size, kws.length);
  assert.deepEqual(deriveKeywords(''), []);
  assert.deepEqual(deriveKeywords(null), []);
});

test('customFieldKeywords: explicit keywords win, else derived from label', () => {
  assert.deepEqual(customFieldKeywords({ label: 'X', keywords: 'a, b , ,c' }), ['a', 'b', 'c']);
  assert.ok(customFieldKeywords({ label: 'Notice period' }).includes('notice period'));
});

test('getCustomFields tolerates missing or malformed profile data', () => {
  assert.deepEqual(getCustomFields(undefined), []);
  assert.deepEqual(getCustomFields({}), []);
  assert.deepEqual(getCustomFields({ custom: 'nope' }), []);
  const arr = [{ id: 'cf-1', label: 'A', value: '1' }];
  assert.equal(getCustomFields({ custom: arr }), arr);
});

test('CORE_PROFILE_KEYS are all real profile fields', () => {
  const keys = new Set(PROFILE_FIELDS.map((f) => f.key));
  for (const k of CORE_PROFILE_KEYS) assert.ok(keys.has(k));
});
