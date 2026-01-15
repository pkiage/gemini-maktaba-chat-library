# Frequently Asked Question

## 1. Privacy & Security

### Where is my data stored?

Your data is stored exclusively within your browser’s local chrome.storage.sync database. No chat content, folder structures, or tags are ever sent to external servers; the extension operates entirely "Local-First".

### Is my data encrypted?

Yes. Because the extension utilizes the standard Chrome Sync infrastructure, your data is encrypted by Google using the same protocols that secure your bookmarks and saved passwords.

## 2. Storage & Quotas

### What is the storage limit?

Chrome enforces a strict 100KB (102,400 bytes) total quota for synced extension data. You can monitor your usage via the "Storage Health" bar in the Settings panel, which turns red when usage exceeds 90%.

### How does the extension optimize space?

We use a Flyweight Pattern (Normalized Data). Instead of duplicating data, the system maintains a central repository of chat metadata (allChats) and simply references "Chat IDs" within folders. This allows a single chat to exist in multiple folders without using extra storage.

### How do I free up space?

If you hit the limit, use the "Prune Unlinked" utility in Settings. This identifies and deletes "orphan" chat metadata that is not currently assigned to any folder.

## 3. Organization & Hierarchy

### Can I sort my chats?

Yes, you can set a unique sort preference for each folder. Click the sort icon in the folder header to toggle between:

- **Last Updated (Default)**: Most recently active chats at the top.
- **Date Added**: Chronological order based on when you saved the chat.
- **Name (A-Z)**: Alphabetical order by title.

### How do I create nested subfolders?

- **Direct creation**: You can create subfolders directly under any Root Folder using the 📂+ button.
- **Advanced nesting**: The 📂+ button is only available on Root folders. To create deeper hierarchies (e.g., Project A > Q1 > Drafts), create the "Drafts" folder at the root level first, then use the Move Folder (➡) menu to nest it inside "Q1".

### Can I move folders after creating them?

Yes. The Move Manager allows you to reorganize your tree structure freely. You can move a folder inside another to nest it, or select "Make Root Folder" to move a subfolder back to the top level.

### What is the difference between "Remove" and "Delete"?

- **Remove (Folder View):** Clicking × on a chat inside a folder only removes it from that specific folder. The chat remains in your library (and other folders).
- **Global Delete (Search View):** If you search for a chat and click ×, you are performing a Global Delete. This removes the chat from all folders and deletes its metadata permanently.
- **Last Folder Warning:** If you try to remove a chat from its last remaining folder, Maktaba will warn you that this action will permanently delete the chat from your library.

## 4. Usage & Features

### Does this work across multiple tabs?

Yes. The extension uses an event listener on chrome.storage.onChanged to sync changes in real-time. If you save a chat in one tab, the sidebar in all other open Gemini tabs will update instantly without a refresh.

### Can I save the same chat to multiple folders?

Yes. Since folders only store references, you can link a single chat to unlimited folders. Chats that exist in multiple locations are marked with a 🔗 icon; clicking this icon opens a menu showing all current locations for that chat.

### What are the advanced search options?

The search bar supports specific syntax:

- `#tag`: Filters for chats containing specific tags.
- `term`: Standard text search.
- `"exact phrase"`: Use quotes to find specific word sequences (e.g., "quarterly review").
- `-term` / `-#tag`: Exclusion logic to narrow down results of specific tags or terms.
- `-"exact phrase"`: Excludes chats containing a specific quoted phrase.

Pinning: You can "Pin" complex searches to your dashboard for one-click access.

### Does Maktaba work on mobile?

The Maktaba sidebar is a Chrome Extension, which only runs on desktop browsers. However, you can access your organized library on mobile by exporting your folder structure to a cloud-based note app like Workflowy, Notion, or Obsidian.

### How do I export to Workflowy or Notion for mobile access?

You can "sync" your library to external tools using the Markdown export:

1. Go to Settings > Export Data.
2. Click 📋 Copy as Markdown.
3. Open Workflowy, Notion, or Obsidian on your desktop and paste (Ctrl+V).
4. On Mobile: Open that app on your phone. The hierarchy will be preserved, and clicking any chat link will launch that specific conversation in your mobile browser or if support on the Gemini app.

## 5. Data Export & Recovery

### How do I back up my library?

Go to Settings (⚙️) to access export options:

- JSON Backup: A full system backup including hierarchy and metadata, capable of restoring your entire library.
- CSV Export: A spreadsheet-friendly list including folder paths and Gemini URLs.
- Markdown: Copies a formatted hierarchical list to your clipboard for apps like Obsidian or Notion.

### I accidentally deleted a folder. Are the chats lost?

Not necessarily. Deleting a folder only removes the organizational structure. The chat metadata remains in the database as "unlinked" data. You can recover these by running "Archive Unlinked" in Settings, which moves all orphan chats into a new "Recovered" folder.

### What is the "Diagnostic Log"?

Found in the Maintenance section, this downloads a technical file containing system statistics (storage usage, item counts, health checks). If you report a bug, attaching this log helps us debug the issue faster. It does not contain your chat titles or private notes.
