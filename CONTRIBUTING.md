# Contributing to Maktaba

Thanks for considering contributing!

## Development Setup

1. **Clone the repo:** `git clone https://github.com/yourusername/maktaba.git`
2. **Load in Chrome:**
    * Go to `chrome://extensions/`
    * Enable **Developer Mode** (top right).
    * Click **Load Unpacked** and select the `/src` folder.
3. **Debug:** Use the Extension Console (Inspect Popup) to see logs.

## Architecture Guidelines

* **Local-First & User-Owned:** The default experience must function 100% locally using `chrome.storage`. We do not operate a backend. We are open to contributions that allow users to connect *their own* external databases, provided these are strictly **opt-in** and the local-only mode remains the primary default.
* **Flyweight Pattern:** We separate the *Folder Tree* from *Chat Metadata*. If you modify the schema, ensure you update both the `folderData` structure and the `allChats` repository.
* **Storage Limits:** Be mindful of the `chrome.storage.sync` quota ([100KB](https://developer.chrome.com/docs/extensions/mv2/reference/storage)). Do not store massive blobs or conversation bodies; store only metadata (Titles, URLs, Tags).

## Localization

We support internationalization (i18n).

1. **No Hardcoded Text:** Do not write English strings directly in `content.js` or HTML.
    * Bad: `button.innerText = "Save"`
    * Good: `button.innerText = t('save_btn')`
2. **No Hardcoded Emojis:** Emojis must be inside the translation string to support RTL layouts and screen readers.
    * Bad: `innerHTML = "💾 " + t('save')`
    * Good: `message: "💾 Save"` in `messages.json`.
3. **Add Keys:** If you add a new UI element, add the corresponding key to `_locales/en/messages.json`.

## Search Logic

We use a specific **Regex parser** for search to support exact phrase exclusion (e.g., `-"foo bar"`). If you modify `renderSearchResults`, ensure you test:

1. Standard text: `term`
2. Tags: `#tag`
3. Exclusions: `-term`
4. Phrases: `"exact phrase"`
5. Negative Phrases: `-"exact phrase"`

## Pull Requests

1. Ensure your code is formatted (standard JS conventions).
2. Update the `README.md` if you change user-facing features.
3. Do not bump the `manifest.json` version number; maintainers will handle releases.
