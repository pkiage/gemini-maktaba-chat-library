# Privacy Policy for Maktaba

**Effective Date:** 15-Jan-2026

## 1. Data Collection and Usage

Maktaba ("The Extension") is designed to prioritize user privacy. The Extension does not collect, transmit, or sell any user data to the developer or any third parties.

**We do not have access to your personal information, chat history, or login credentials.**

## 2. Local and Synced Storage

The Extension stores your data (folder structures, tags, chat titles, and notes) using Chrome's built-in storage system (`chrome.storage.sync`).

* **Purpose:** This allows your library organization to sync across your signed-in Chrome devices automatically.
* **Security:** This data is associated with your Google Account and handled according to Google's privacy policies for Chrome Sync. The developer cannot access this data.

## 3. Permissions

* **Host Permissions:** The extension accesses `https://gemini.google.com/*` strictly to inject the sidebar interface and read the metadata (Title and URL) of the chats you explicitly choose to save. It never accesses, reads, or stores the actual text content of your messages or the AI's responses.
* **Storage:** Used solely to save your organization preferences locally on your device.

## 4. Third-Party Services

The Extension operates entirely within your browser. It does not communicate with external servers, analytics tools, or tracking scripts.

## 5. Contact

If you have questions about this policy or need to report a privacy concern, please open an issue on the GitHub repository: https://github.com/pkiage/gemini-maktaba-chat-library/issues