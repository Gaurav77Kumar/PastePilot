# Privacy Policy — PastePilot

**Last updated: September 12, 2026**

PastePilot ("the extension") is built to keep your data entirely on your machine.

## What we collect

**Nothing.** PastePilot has no servers, no accounts, no analytics, and no tracking of any kind.

## Where your data lives

- Your snippets (titles, content, tags, site rules, usage counts) are stored **only in your browser's local storage** (`chrome.storage.sync` / `chrome.storage.local`).
- If Chrome Sync is enabled in your browser, Chrome itself may sync this storage across your signed-in devices. This is handled entirely by Google's infrastructure under your Google account — PastePilot never transmits anything anywhere.
- You can delete all of your data at any time by removing the extension (or by deleting individual snippets in the editor).

## Permissions PastePilot requests, and why

| Permission | Why it's needed |
|---|---|
| `activeTab` | To fill the field you're focused on, in the tab you clicked the PastePilot icon on. PastePilot cannot read or change any page **until you click its icon or use its keyboard shortcut**. |
| `contextMenus` | To offer "Save selection as snippet" when you right-click selected text. The selected text is handed to PastePilot's own editor and stored only in your browser — it is never sent anywhere. |
| `scripting` | To insert the fill action into the current page when you choose a snippet. |
| `storage` | To save your snippets on your device. |

PastePilot does **not** request broad host permissions (`<all_urls>`), and it does not run any code in the background on pages you haven't invoked it on.

## Third parties

None. No data is sold, shared, rented, or transmitted to any third party, because no data ever leaves your browser.

## Contact

Questions about this policy? Open an issue at the project repository or contact the developer via the Chrome Web Store "Contact the developer" link.
