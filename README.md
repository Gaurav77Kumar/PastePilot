# PastePilot — Site-Aware Snippets for Chrome

**Clipboard snippets that know which site you're on.** One-click fill of the text you
paste every day — formatted addresses, job-application answers, support replies —
directly into the web page you're on.

- No accounts, no servers, no analytics — data never leaves your browser
- Requests only `activeTab`, `scripting`, `storage` — **no broad host permissions**
- Vanilla JS, Manifest V3, zero dependencies, no build step

This folder is the whole project: the extension itself plus its tests, CI and
packaging. Load it directly via `chrome://extensions` → **Load unpacked**.

## Project layout

```
manifest.json        Manifest V3 (activeTab, scripting, storage only)
background.js        service worker: seeding, quick-pick command, usage persistence
popup/               popup UI: search + per-site groups + click-to-fill
editor/              full-page snippet manager (also the options page)
content/quickpick.js in-page Ctrl+Shift+S menu (injected on demand)
lib/                 storage, site rules, variables, page-fill engine, identity
assets/icons/        16/32/48/128 px icons
test/form.html       local test page for manual QA
tests/               Node test suite (zero dependencies, node --test)
scripts/             check.mjs (syntax gate) + package.mjs (store-ready zip)
docs/                privacy policy (host on GitHub Pages for the store listing)
.github/workflows/   CI: syntax + tests + packaging on every push/PR
```

## Run it locally

1. Chrome → `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder (the one with `manifest.json`)
3. Click the PastePilot icon on any page (or press `Ctrl+Shift+S` in a form field)

## Tests & CI

```
npm run check    # node --check every JS file
npm test         # unit tests + store-readiness gates (manifest, icons, MV3 CSP)
npm run package  # build dist/pastepilot-v<version>.zip (store files only)
npm run verify   # all three
```

Only Node 18+ required — no `npm install` needed. GitHub Actions runs
`npm run verify` on every push and PR; pushing a tag `v1.2.3` attaches the zip
to a GitHub Release.

## Manual QA

Serve the folder and open the test form:

```
python -m http.server 8123
# → http://127.0.0.1:8123/test/form.html
```

Click into a field, then fill via the popup or `Ctrl+Shift+S`. The page logs
when the framework-safe `input` event fires.

## Ship it

The store zip is built by `npm run package` (and by CI) with `manifest.json` at
the zip root and all dev files excluded. Publishing steps, listing copy and
permission justifications live in the project workspace `docs/` (see the
publishing guide); the privacy policy in `docs/privacy-policy.md` should be
hosted publicly (GitHub Pages) before submission.
