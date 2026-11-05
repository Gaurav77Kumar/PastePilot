// PastePilot — public import page (site/import.html, GitHub Pages).
// Renders a snippet shared via #pp=<base64url> and copies the payload so the
// recipient can paste it into the editor's "⤵ Import shared" box.
// Classic script on purpose: the page must work standalone, no build step.
(function () {
  'use strict';

  function fromB64Url(s) {
    let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    const bin = atob(t);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  const titleEl = document.getElementById('t');
  const bodyEl = document.getElementById('b');
  const metaEl = document.getElementById('m');
  const copyBtn = document.getElementById('copy');
  const howEl = document.getElementById('how');

  let raw = '';
  try { raw = decodeURIComponent(location.hash.replace(/^#pp=/, '')); }
  catch (e) { raw = location.hash.replace(/^#pp=/, ''); }

  let snip = null;
  try {
    const o = JSON.parse(fromB64Url(raw));
    if (o && o.v === 1 && typeof o.body === 'string' && o.body.trim()) snip = o;
  } catch (e) { snip = null; }

  if (!snip) {
    titleEl.textContent = 'No snippet in this link';
    bodyEl.textContent = 'This import link is missing its data. Ask the sender for a fresh share link — or open PastePilot and share one yourself.';
    copyBtn.style.display = 'none';
    howEl.style.display = 'none';
    return;
  }

  titleEl.textContent = snip.title || 'Shared snippet';
  bodyEl.textContent = snip.body;
  const bits = [];
  if (Array.isArray(snip.tags) && snip.tags.length) bits.push(snip.tags.join(', '));
  if (Array.isArray(snip.sites) && snip.sites.length) bits.push('for ' + snip.sites.join(', '));
  metaEl.textContent = bits.join(' · ');

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      copyBtn.textContent = '✓ Copied — open PastePilot → Editor → ⤵ Import shared';
    } catch (e) {
      copyBtn.textContent = 'Copy failed — copy the address-bar URL instead';
    }
  });
})();
