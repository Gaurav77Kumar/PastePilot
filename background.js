import { readSnippets, writeSnippets, ensureSeeded } from './lib/storage.js';

// Right-click capture: "Save selection as snippet"
const CAPTURE_MENU_ID = 'pp-save-selection';
const CAPTURE_KEY = 'pp_capture';

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureSeeded();
  // removeAll keeps this idempotent across updates (re-creating the same id
  // would log unchecked duplicate-id errors).
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CAPTURE_MENU_ID,
      title: 'Save "%s" as a PastePilot snippet',
      contexts: ['selection']
    });
  });
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'editor/editor.html?welcome=1' });
  }
});

// Clicking the menu item counts as invoking the extension, so activeTab is
// granted and tab.url is readable here without the "tabs" permission.
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CAPTURE_MENU_ID) return;
  const text = (info.selectionText || '').trim();
  if (!text) return;
  let site = '';
  try {
    site = new URL(tab && tab.url || '').hostname.replace(/^www\./, '');
  } catch (e) { site = ''; }
  try {
    await chrome.storage.session.set({ [CAPTURE_KEY]: { text, site, page: (tab && tab.title) || '' } });
    await chrome.tabs.create({ url: 'editor/editor.html?capture=1' });
  } catch (e) {
    console.warn('PastePilot could not open the capture editor:', e.message);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'quick-pick') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['content/quickpick.js']
    });
  } catch (e) {
    // Restricted page (chrome://, Web Store, PDF viewer) — nothing to do
    console.warn('PastePilot quick-pick could not inject:', e.message);
  }
});

// Content scripts can't import the storage module, so they report usage here.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'pp-usage' && msg.id) {
    (async () => {
      const snippets = await readSnippets();
      const s = snippets.find((x) => x.id === msg.id);
      if (s) {
        s.usageCount = (s.usageCount || 0) + 1;
        s.lastUsed = Date.now();
        await writeSnippets(snippets);
      }
      sendResponse({ ok: true });
    })();
    return true; // async sendResponse
  }
});
