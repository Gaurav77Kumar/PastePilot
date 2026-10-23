// PastePilot — per-site snippet rules.
// A snippet's `sites` array holds domain patterns:
//   "*"            -> matches every site
//   "linkedin.com" -> matches linkedin.com and any subdomain
//   "*.google.com" -> matches subdomains of google.com (docs.google.com) but not google.com itself
//   "mail.google.com" -> exact host match only

function normalizeHost(host) {
  return (host || '').toLowerCase().replace(/^www\./, '');
}

function patternToHosts(pattern) {
  return pattern.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
}

function hostMatchesPattern(host, pattern) {
  if (!pattern) return false;
  if (pattern === '*') return true;
  const p = patternToHosts(pattern);
  const h = normalizeHost(host);
  if (!h) return false;
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    return h.endsWith('.' + base);
  }
  return h === p || h.endsWith('.' + p);
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return '';
  }
}

function snippetMatchesSite(snippet, url) {
  const host = hostFromUrl(url);
  if (!snippet.sites || snippet.sites.length === 0) return true; // no rules = everywhere
  return snippet.sites.some((p) => hostMatchesPattern(host, p));
}

function snippetsForSite(snippets, url) {
  return snippets.filter((s) => snippetMatchesSite(s, url));
}

export { hostMatchesPattern, snippetMatchesSite, snippetsForSite, hostFromUrl };
