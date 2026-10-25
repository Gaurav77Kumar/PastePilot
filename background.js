import { readSnippets, writeSnippets, ensureSeeded } from './lib/storage.js';

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureSeeded();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'editor/editor.html?welcome=1' });
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
