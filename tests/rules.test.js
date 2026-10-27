import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostMatchesPattern, snippetMatchesSite, snippetsForSite, hostFromUrl } from '../lib/rules.js';

test('hostFromUrl extracts the hostname and tolerates junk', () => {
  assert.equal(hostFromUrl('https://www.linkedin.com/in/someone'), 'www.linkedin.com');
  assert.equal(hostFromUrl('http://docs.google.com/forms'), 'docs.google.com');
  assert.equal(hostFromUrl('not a url'), '');
  assert.equal(hostFromUrl(''), '');
});

test('"*" matches every host (even an empty one, so generic snippets still show on restricted pages)', () => {
  assert.equal(hostMatchesPattern('anything.com', '*'), true);
  assert.equal(hostMatchesPattern('', '*'), true);
});

test('bare domain matches the domain and its subdomains', () => {
  assert.equal(hostMatchesPattern('linkedin.com', 'linkedin.com'), true);
  assert.equal(hostMatchesPattern('www.linkedin.com', 'linkedin.com'), true);
  assert.equal(hostMatchesPattern('jobs.linkedin.com', 'linkedin.com'), true);
  assert.equal(hostMatchesPattern('notlinkedin.com', 'linkedin.com'), false);
  assert.equal(hostMatchesPattern('evil-linkedin.com', 'linkedin.com'), false);
});

test('"*.google.com" matches subdomains only, not the bare domain', () => {
  assert.equal(hostMatchesPattern('docs.google.com', '*.google.com'), true);
  assert.equal(hostMatchesPattern('mail.google.com', '*.google.com'), true);
  assert.equal(hostMatchesPattern('google.com', '*.google.com'), false);
});

test('exact host pattern matches only that host', () => {
  assert.equal(hostMatchesPattern('mail.google.com', 'mail.google.com'), true);
  assert.equal(hostMatchesPattern('docs.google.com', 'mail.google.com'), false);
  assert.equal(hostMatchesPattern('google.com', 'mail.google.com'), false);
});

test('patterns are normalized: scheme, path, case and www are stripped', () => {
  assert.equal(hostMatchesPattern('linkedin.com', 'https://LinkedIn.com/jobs/feed'), true);
  assert.equal(hostMatchesPattern('www.linkedin.com', 'WWW.LINKEDIN.COM'), true);
});

test('snippetMatchesSite: empty or missing site rules mean "everywhere"', () => {
  assert.equal(snippetMatchesSite({ sites: [] }, 'https://x.com'), true);
  assert.equal(snippetMatchesSite({}, 'https://x.com'), true);
  assert.equal(snippetMatchesSite({ sites: ['*'] }, 'https://x.com'), true);
});

test('snippetMatchesSite: matches if any pattern matches', () => {
  const s = { sites: ['linkedin.com', 'mail.google.com'] };
  assert.equal(snippetMatchesSite(s, 'https://www.linkedin.com/feed'), true);
  assert.equal(snippetMatchesSite(s, 'https://mail.google.com/u/0'), true);
  assert.equal(snippetMatchesSite(s, 'https://github.com'), false);
});

test('snippetsForSite filters a list', () => {
  const list = [
    { id: 'a', sites: ['linkedin.com'] },
    { id: 'b', sites: ['*'] },
    { id: 'c', sites: ['github.com'] }
  ];
  const got = snippetsForSite(list, 'https://linkedin.com/jobs').map((s) => s.id);
  assert.deepEqual(got, ['a', 'b']);
});
