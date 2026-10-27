import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVars, splitCursor } from '../lib/variables.js';

const DATE_OPTS = { year: 'numeric', month: 'short', day: 'numeric' };
const TIME_OPTS = { hour: '2-digit', minute: '2-digit' };

test('{{date}} resolves to today in locale format', () => {
  const expected = new Date().toLocaleDateString(undefined, DATE_OPTS);
  assert.equal(resolveVars('on {{date}}', {}), `on ${expected}`);
});

test('{{date+N}} and {{date-N}} shift days', () => {
  const plus = new Date();
  plus.setDate(plus.getDate() + 7);
  const minus = new Date();
  minus.setDate(minus.getDate() - 1);
  assert.equal(resolveVars('{{date+7}}', {}), plus.toLocaleDateString(undefined, DATE_OPTS));
  assert.equal(resolveVars('{{date-1}}', {}), minus.toLocaleDateString(undefined, DATE_OPTS));
});

test('{{time}} and {{year}} resolve', () => {
  const now = new Date();
  assert.equal(resolveVars('{{year}}', {}), String(now.getFullYear()));
  assert.equal(resolveVars('{{time}}', {}), now.toLocaleTimeString(undefined, TIME_OPTS));
});

test('{{url}} and {{title}} come from the fill context', () => {
  const out = resolveVars('from {{url}} — {{title}}', { url: 'https://x.com/a', title: 'Page T' });
  assert.equal(out, 'from https://x.com/a — Page T');
  assert.equal(resolveVars('{{url}}', {}), '');
});

test('{{clipboard}} uses provided text, or is left untouched when unavailable', () => {
  assert.equal(resolveVars('p: {{clipboard}}', { clipboardText: 'hello' }), 'p: hello');
  assert.equal(resolveVars('p: {{clipboard}}', {}), 'p: {{clipboard}}');
});

test('variables are case-insensitive and tolerate spaces', () => {
  assert.equal(resolveVars('{{ YEAR }}', {}), String(new Date().getFullYear()));
  assert.equal(resolveVars('{{Date+2}}', {}).length > 0, true);
});

test('unknown variables are left as-is', () => {
  assert.equal(resolveVars('{{foo}} {{bar baz}}', {}), '{{foo}} {{bar baz}}');
});

test('splitCursor splits at the marker and reports none when absent', () => {
  assert.deepEqual(splitCursor('Hi {{cursor}}, bye'), { before: 'Hi ', after: ', bye', hasCursor: true });
  assert.deepEqual(splitCursor('no marker'), { before: 'no marker', after: '', hasCursor: false });
  const two = splitCursor('a {{cursor}} b {{cursor}} c');
  assert.equal(two.before, 'a ');
  assert.equal(two.after, ' b {{cursor}} c');
});
