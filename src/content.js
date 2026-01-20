/**
 * @fileoverview Maktaba for Gemini - A Chrome Extension for organizing, 
 * importing, exporting, and backing up Gemini chat sessions.
 */

// Helper for i18n. usage: t('key_name') or t('key_name', ['param1'])
const t = (key, args) => chrome.i18n.getMessage(key, args);

console.log(t('extension_init_log'));

/**
 * @typedef {Object} ChatEntry
 * @property {string} id Unique identifier for the chat.
 * @property {string} title The title of the chat.
 * @property {string[]} tags List of tags associated with the chat.
 * @property {string} annotation Optional note or description.
 * @property {number} timestamp Creation timestamp.
 * @property {number} [updatedAt] Last modification timestamp.
 */

/**
 * @typedef {Object} Folder
 * @property {number} id Unique identifier for the folder.
 * @property {string} name Display name of the folder.
 * @property {string[]} chatIds Array of chat IDs contained in the folder.
 * @property {Folder[]} subfolders Nested folder structures.
 * @property {string} annotation Optional note or description.
 * @property {string} [sortOrder] Preference for sorting chats within the folder.
 */

/**
 * Global state for the library data.
 * @type {{folders: Folder[], allChats: Object<string, ChatEntry>, pinnedSearches: Object[]}}
 */
let folderData = { 
    folders: [], 
    allChats: {}, 
    pinnedSearches: []
};

/**
 * Global statistics tracker for rendering performance and operation skips.
 * @type {{renders: number, skips: number}}
 */
window.maktabaStats = {
    renders: 0,
    skips: 0
};

/**
 * Initializes the extension components and data loading.
 */
function init() {
    renderRightSidebar();
    setupAutoSync();
    loadData();
}

/**
 * Loads data from chrome.storage.sync and refreshes the UI.
 */
function loadData() {
    if (!chrome.runtime?.id) return;
    try {
        chrome.storage.sync.get(['maktaba_folders'], (result) => {
            if (chrome.runtime.lastError) return;
            
            if (result.maktaba_folders) {
                // Case 1: Data found
                folderData = result.maktaba_folders;
                if (!folderData.pinnedSearches) folderData.pinnedSearches = []; 
            } else {
                // Case 2: No data found (New user or empty)
                // Initialize with empty defaults so the UI can render
                folderData = { folders: [], allChats: {}, pinnedSearches: [] };
            }
            
            // Refresh the list, regardless of whether data was found
            refreshFolderList();
        });
    } catch (e) {
        console.log(t('context_invalidated_log'));
    }
}

/**
 * Sets up listeners for storage changes and window focus to keep data in sync.
 */
function setupAutoSync() {
    try {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync' && changes.maktaba_folders) {
                const newData = changes.maktaba_folders.newValue;
                if (JSON.stringify(folderData) !== JSON.stringify(newData)) {
                    folderData = newData || { folders: [], allChats: {}, pinnedSearches: [] };
                    refreshFolderList();
                }
            }
        });
    } catch(e) {}
    window.addEventListener('focus', () => loadData());
}

/**
 * Returns the current date in YYYY-MM-DD format based on the User's Local Timezone.
 */
function getLocalDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Returns a filename-safe timestamp in local time: YYYY-MM-DD_HH-MM-SS
 */
function getLocalFilenameTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    
    return `${date}_${time}`;
}

/**
 * Updates the UI list of pinned searches within the settings manager.
 */
function updatePinnedManager() {
    const manager = document.getElementById('pinned-manager-list');
    if (!manager) return;
    
    manager.innerHTML = folderData.pinnedSearches.map(pin => `
        <div class="manage-pin-row">
            <span>${pin.title}</span>
            <button class="del-pin-btn" data-id="${pin.id}">×</button>
        </div>
    `).join('');
    
    manager.querySelectorAll('.del-pin-btn').forEach(btn => {
        btn.onclick = () => {
            const id = parseInt(btn.getAttribute('data-id'));
            folderData.pinnedSearches = folderData.pinnedSearches.filter(p => p.id !== id);
            saveAndRefresh();
            updatePinnedManager();
        };
    });
}

/**
 * Renders the main sidebar UI and initializes global event listeners.
 */
function renderRightSidebar() {
    if (document.getElementById('maktaba-right-panel')) return;

    const panel = document.createElement('div');
    const iconUrl = chrome.runtime.getURL('icon_png/icon48.png');
    panel.id = 'maktaba-right-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <span>${t('maktaba_library_title')}</span>
            <div class="header-controls">
                <button id="settings-panel-btn" title="${t('settings_btn_title')}">⚙️</button>
                <button id="toggle-panel-btn" title="${t('close_btn_title')}">×</button>
            </div>
        </div>
        
        <div id="settings-overlay" class="hidden">
            <div class="settings-header">
                <span>${t('settings_header')}</span>
                <button id="close-settings-btn">${t('back_btn_label')}</button>
            </div>
            <div class="settings-content">
                <div class="settings-group">
                    <label>${t('backup_restore_label')}</label>
                    <button id="export-json-btn" class="secondary-btn">${t('download_backup_btn')}</button>
                    <button id="import-json-trigger" class="secondary-btn">${t('restore_backup_btn')}</button>
                    <input type="file" id="import-file-input" style="display:none" accept=".json">
                </div>
                <div class="settings-group">
                    <label>${t('export_data_label')}</label>
                    <button id="export-csv-btn" class="secondary-btn">${t('export_csv_btn')}</button>
                    <button id="copy-md-btn" class="secondary-btn">${t('copy_md_btn')}</button>
                </div>
                <div class="settings-group">
                    <label>${t('storage_health_label')}</label>
                    <div id="storage-text" style="font-size:12px; color:#aaa;">${t('calculating_text')}</div>
                    <div class="storage-bar-bg"><div id="storage-bar" class="storage-bar-fill"></div></div>
                </div>
                <div class="settings-group">
                    <<label>${t('maintenance_label')}</label>
                    <button id="btn-diag" class="secondary-btn">${t('download_diag_btn')}</button>
                    <button id="btn-archive" class="secondary-btn btn-archive-warning">${t('archive_unlinked_btn')}</button>
                    <button id="btn-prune" class="secondary-btn btn-prune-warning">${t('prune_unlinked_btn')}</button>
                </div>
            </div>
        </div>

        <div class="panel-controls">
            <div class="search-wrapper">
                <input type="text" id="folder-search-input" placeholder="${t('search_placeholder')}" autocomplete="off">
                <button id="search-help-btn" title="${t('search_syntax_title')}">?</button>
                
                <div id="search-help-tooltip" class="hidden">
                    <div class="help-row">${t('help_row_term')}</div>
                    <div class="help-row">${t('help_row_tag')}</div>
                    <div class="help-row">${t('help_row_exclude')}</div>
                    <div class="help-row">${t('help_row_exclude_tag')}</div>
                    <div class="help-row">${t('help_row_include_phrase')}</div>
                    <div class="help-row">${t('help_row_exclude_phrase')}</div>
                </div>
            </div>
            <button id="create-folder-btn" class="primary-btn">${t('new_root_folder_btn')}</button>
        </div>
        
        <div id="right-folder-list">
            <div class="loading-state">${t('loading_state_text')}</div>
        </div>
        
        <div class="panel-footer">
            <button id="save-current-btn" class="accent-btn">${t('quick_save_btn')}</button>
            <div id="quick-save-menu" class="hidden">
                <div class="quick-save-header">${t('quick_save_header')}</div>
                <div class="input-wrapper" style="position:relative;">
                    <input type="text" id="quick-save-tags" placeholder="${t('tags_input_placeholder')}" class="tag-input" autocomplete="off">
                    <div id="tag-autocomplete-list" class="hidden"></div>
                </div>
                <input type="text" id="quick-save-note" placeholder="${t('note_input_placeholder')}" class="tag-input">
                <div id="quick-save-list"></div>
                <button id="cancel-save-btn">${t('cancel_btn')}</button>
            </div>
        </div>
    `;

    document.body.appendChild(panel);
    
    const floater = document.createElement('button');
    floater.id = 'maktaba-folder-floater';
    floater.innerHTML = `<img src="${iconUrl}" style="width: 24px; height: 24px;">`;
    floater.onclick = () => { panel.classList.add('open'); floater.style.display = 'none'; };
    document.body.appendChild(floater);

    document.getElementById('toggle-panel-btn').onclick = () => {
        panel.classList.remove('open');
        floater.style.display = 'flex';
    };
    
    const settingsOverlay = document.getElementById('settings-overlay');
    
    document.getElementById('settings-panel-btn').onclick = () => {
        settingsOverlay.classList.remove('hidden');
        updateStorageStats(); 
        if (typeof updatePinnedManager === 'function') updatePinnedManager();
    };
    document.getElementById('close-settings-btn').onclick = () => settingsOverlay.classList.add('hidden');

    document.getElementById('export-json-btn').onclick = exportDataAsJSON;
    document.getElementById('import-json-trigger').onclick = () => document.getElementById('import-file-input').click();
    document.getElementById('import-file-input').onchange = importDataFromJSON;
    document.getElementById('export-csv-btn').onclick = exportDataAsCSV;
    document.getElementById('copy-md-btn').onclick = copyDataAsMarkdown;
    document.getElementById('create-folder-btn').onclick = () => createNewFolder(null); 
    document.getElementById('save-current-btn').onclick = showQuickSaveMenu;
    document.getElementById('cancel-save-btn').onclick = hideQuickSaveMenu;
    document.getElementById('folder-search-input').oninput = () => refreshFolderList();
    document.getElementById('search-help-btn').onclick = (e) => {
        e.stopPropagation();
        const tooltip = document.getElementById('search-help-tooltip');
        tooltip.classList.toggle('hidden');
    };
    
    document.getElementById('btn-archive').onclick = archiveUnlinked;

    document.addEventListener('click', (e) => {
        const tooltip = document.getElementById('search-help-tooltip');
        const btn = document.getElementById('search-help-btn');
        if (tooltip && !tooltip.classList.contains('hidden') && e.target !== tooltip && e.target !== btn) {
            tooltip.classList.add('hidden');
        }
    });
    panel.classList.add('open');
    floater.style.display = 'none';
}

/**
 * Exports the current folder data as a downloadable JSON file.
 */
function exportDataAsJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(folderData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", t('filename_backup_prefix') + getLocalFilenameTimestamp() + ".json");    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

/**
 * Imports folder data from a JSON file and overwrites local storage.
 * @param {Event} event The file input change event.
 */
function importDataFromJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (importedData.folders && importedData.allChats) {
                if (confirm(t('confirm_overwrite_backup'))) {
                    folderData = importedData;
                    saveAndRefresh();
                    alert(t('backup_restore_success'));
                    document.getElementById('settings-overlay').classList.add('hidden');
                }
            } else {
                alert(t('invalid_backup_format'));
            }
        } catch (error) {
            alert(t('json_parse_error'));
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

/**
 * Exports chat data into a CSV format for spreadsheet analysis.
 */
function exportDataAsCSV() {
    let csvContent = t('csv_header_row');

    /**
     * Escapes characters for CSV compatibility.
     * @param {string} str
     * @returns {string}
     */
    const escapeCsv = (str) => {
        if (!str) return "";
        let escaped = str.toString().replace(/"/g, '""');
        if (escaped.search(/("|,|\n)/g) >= 0) escaped = `"${escaped}"`;
        return escaped;
    };

    /**
     * Recursively processes folders to build CSV rows.
     * @param {Folder} folder
     * @param {string} pathPrefix
     */
    const processFolder = (folder, pathPrefix) => {
        const currentPath = pathPrefix ? `${pathPrefix} > ${folder.name}` : folder.name;
        
        if (folder.chatIds) {
            folder.chatIds.forEach(id => {
                const chat = folderData.allChats[id];
                if (chat) {
                    const url = `https://gemini.google.com/app/${chat.id}`;
                    const tags = chat.tags ? chat.tags.join(", ") : "";
                    csvContent += `${escapeCsv(currentPath)},${escapeCsv(chat.title)},${escapeCsv(url)},${escapeCsv(tags)},${escapeCsv(chat.annotation)}\n`;
                }
            });
        }
        
        if (folder.subfolders) {
            folder.subfolders.forEach(sf => processFolder(sf, currentPath));
        }
    };

    folderData.folders.forEach(f => processFolder(f, ""));

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${t('filename_csv_prefix')}${getLocalFilenameTimestamp()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Copies the library structure to the clipboard as Markdown.
 */
function copyDataAsMarkdown() {
    let mdContent = t('md_export_header');

    /**
     * Recursively processes folders to build Markdown.
     * @param {Folder} folder
     * @param {number} level Indentation level.
     */
    const processFolder = (folder, level) => {
        const indent = "  ".repeat(level);
        mdContent += `${indent}* **${folder.name}**\n`;
        
        if (folder.chatIds) {
            folder.chatIds.forEach(id => {
                const chat = folderData.allChats[id];
                if (chat) {
                    const url = `https://gemini.google.com/app/${chat.id}`;
                                        const tags = (chat.tags && chat.tags.length) 
                        ? ` ${chat.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}` 
                        : "";

                    const note = chat.annotation ? ` _(${chat.annotation})_` : "";
                    mdContent += `${indent}  * [${chat.title}](${url})${note}${tags}\n`;
                }
            });
        }

        if (folder.subfolders) {
            folder.subfolders.forEach(sf => processFolder(sf, level + 1));
        }
    };

    folderData.folders.forEach(f => processFolder(f, 0));

    navigator.clipboard.writeText(mdContent).then(() => {
        const btn = document.getElementById('copy-md-btn');
        const orig = btn.innerText;
        btn.innerText = t('copy_success_msg');
        setTimeout(() => btn.innerText = orig, 2000);
    });
}

/**
 * Main UI refresh logic. Switches between dashboard and search views.
 */
function refreshFolderList() {
    const list = document.getElementById('right-folder-list');
    const searchInput = document.getElementById('folder-search-input');
    if (!list) return;

    const rawTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";

    if (rawTerm === "") {
        let html = '';

        if (folderData.pinnedSearches && folderData.pinnedSearches.length > 0) {
            html += `<div class="pinned-section-header">📌 ${t('pinned_searches_header')}</div>`;
            folderData.pinnedSearches.forEach(pin => {
                html += `
                    <div class="pinned-search-item" data-query="${pin.query}">
                        <div class="pin-content-wrapper">
                            <span class="pin-icon">🔍</span>
                            <span class="pin-title">${pin.title}</span>
                        </div>
                        <button class="quick-unpin-btn" data-id="${pin.id}" title="${t('unpin_btn')}">×</button>
                    </div>`;
            });
            html += `<div class="section-divider"></div>`;
        }

        if (folderData.folders.length === 0) {
            html += `<div class="empty-state">${t('empty_folders_msg')}</div>`;
        } else {
            folderData.folders.forEach(folder => {
                html += renderFolderCard(folder, 0); 
            });
        }
        
        list.innerHTML = html;
        attachCardListeners(list);
        
        list.querySelectorAll('.pinned-search-item').forEach(item => {
            item.querySelector('.pin-content-wrapper').onclick = (e) => {
                e.stopPropagation();
                if (searchInput) {
                    searchInput.value = item.getAttribute('data-query');
                    refreshFolderList();
                }
            };

            const delBtn = item.querySelector('.quick-unpin-btn');
            if (delBtn) {
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    const id = parseInt(delBtn.getAttribute('data-id'));
                    const title = item.querySelector('.pin-title').innerText;
                    
                    if (confirm(t('unpin_confirm', [title]))) {
                        folderData.pinnedSearches = folderData.pinnedSearches.filter(p => p.id !== id);
                        saveAndRefresh();
                    }
                };
            }
        });
        
        const openFolderIds = Array.from(document.querySelectorAll('.subfolder-container:not(.hidden)')).map(el => el.id);
        openFolderIds.forEach(id => {
            const container = document.getElementById(id);
            const btn = document.querySelector(`.toggle-sub-btn[data-target="${id}"]`);
            if (container) container.classList.remove('hidden');
            if (btn) btn.innerText = '▼';
        });

    } else {
        renderSearchResults(rawTerm, list);
    }
    if (window.maktabaStats) {
            window.maktabaStats.renders++;
    }
}

/**
 * Displays a context menu showing all folder locations for a specific chat.
 * @param {number} x Mouse X coordinate.
 * @param {number} y Mouse Y coordinate.
 * @param {string} chatId
 */
function showSymlinkManager(x, y, chatId) {
    const chat = folderData.allChats[chatId];
    if (!chat) return;

    const locations = findAllFoldersForChat(chatId);
    
    const existing = document.getElementById('symlink-manager-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'symlink-manager-menu';
    menu.style.top = `${y}px`;
    menu.style.left = `${x - 180}px`;

    let html = `<div class="ctx-header">${t('symlink_menu_header', [chat.title.substring(0,20)])}</div>`;
    
    locations.forEach(folder => {
        const pathObjects = getFolderPath(folder.id);
        const fullPath = pathObjects.map(f => f.name).join(' / ');

        html += `
            <div class="ctx-item" data-fid="${folder.id}">
                <span style="margin-right:4px;">📁</span> 
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:220px;" title="${fullPath}">
                    ${fullPath}
                </span>
                <span class="jump-arrow">↗</span>
            </div>`;
    });

    menu.innerHTML = html;
    document.body.appendChild(menu);

    menu.querySelectorAll('.ctx-item').forEach(item => {
        item.onclick = () => {
            const folderId = item.getAttribute('data-fid');
            showFolderContents(folderId); 
            menu.remove();
        };
    });

    const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
}

/**
 * Attaches interaction listeners to chat items in a container.
 * @param {HTMLElement} container
 * @param {number|null} folderId The ID of the folder containing these chats.
 */
function attachChatListeners(container, folderId) {
    container.querySelectorAll('.rename-chat-btn').forEach(btn => {
        btn.onclick = () => renameChat(btn.getAttribute('data-cid'), folderId);
    });
    
    container.querySelectorAll('.multi-link-manager-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const chatId = btn.getAttribute('data-cid');
            showSymlinkManager(e.clientX, e.clientY, chatId);
        };
    });

    container.querySelectorAll('.edit-tags-btn').forEach(btn => {
        btn.onclick = () => editChatTags(btn.getAttribute('data-cid'), folderId);
    });
    container.querySelectorAll('.edit-note-btn').forEach(btn => {
        btn.onclick = () => editChatAnnotation(btn.getAttribute('data-cid'), folderId);
    });
    container.querySelectorAll('.move-chat-btn').forEach(btn => {
        btn.onclick = (e) => showMoveMenu(e.clientX, e.clientY, btn.getAttribute('data-cid'), folderId);
    });
    container.querySelectorAll('.remove-chat-btn').forEach(btn => {
        btn.onclick = () => removeChatFromFolder(btn.getAttribute('data-cid'), folderId);
    });
    
    container.querySelectorAll('.clickable-tag').forEach(tag => {
        tag.onclick = (e) => {
            e.stopPropagation();
            const searchInput = document.getElementById('folder-search-input');
            if (searchInput) {
                searchInput.value = `#${tag.getAttribute('data-tag')}`;
                refreshFolderList();
            }
        };
    });
}

/**
 * Filters chats based on query tokens and renders results.
 * @param {string} query
 * @param {HTMLElement} container
 */
/**
 * Filters chats based on query tokens and renders results.
 * @param {string} query
 * @param {HTMLElement} container
 */
function renderSearchResults(query, container) {
    // NEW: Parse with Regex to handle quotes and minus signs intelligently
    const tokens = [];
    // Regex explanation:
    // Group 1 (-?): Optional leading minus
    // Group 2 ("[^"]+"): Quoted phrase (captures content inside quotes)
    // Group 3 ([^\s]+): Standard word (captures non-whitespace text)
    const regex = /(-?)(?:"([^"]+)"|([^\s]+))/g;
    let match;

    while ((match = regex.exec(query)) !== null) {
        // match[1] is the minus sign (if present)
        // match[2] is the quoted text (if quoted)
        // match[3] is the unquoted text (if not quoted)
        
        const isNegative = match[1] === '-';
        const rawValue = match[2] || match[3];
        
        if (!rawValue) continue;
        
        const val = rawValue.toLowerCase();

        // If it was quoted (match[2]), treat strictly as text (allow spaces in search)
        if (match[2]) {
            tokens.push({ 
                type: isNegative ? 'not_text' : 'text', 
                val: val 
            });
        } else {
            // Unquoted: check for tags vs text
            if (val.startsWith('#')) {
                tokens.push({ 
                    type: isNegative ? 'not_tag' : 'tag', 
                    val: val.substring(1) // remove '#'
                });
            } else {
                tokens.push({ 
                    type: isNegative ? 'not_text' : 'text', 
                    val: val 
                });
            }
        }
    }

    let matchedChats = [];
    Object.keys(folderData.allChats).forEach(id => {
        const chat = folderData.allChats[id];
        if (isMatch(chat, tokens)) {
            const containingFolders = findAllFoldersForChat(id);
            matchedChats.push({ chat, folders: containingFolders });
        }
    });

    if (matchedChats.length === 0) {
        container.innerHTML = `<div class="empty-state">${t('empty_search_results')}</div>`;
        return;
    }

    let html = `
        <div class="search-header">
            <span>${t('search_results_count', [matchedChats.length])}</span>
            <button id="pin-current-search" class="small-action-btn" title="${t('pin_search_tooltip')}">📌 ${t('pin_search_btn')}</button>
        </div>
        <div class="chat-link-list">
    `;

    matchedChats.forEach(match => {
        const badgesHtml = match.folders.map(f => `<span class="folder-badge">📁 ${f.name}</span>`).join('');
        html += renderChatHtml(match.chat, `<div class="folder-context-row">${badgesHtml}</div>`); 
    });
    html += `</div>`;
    
    container.innerHTML = html;
    
    attachChatListeners(container, null); 

    const pinBtn = container.querySelector('#pin-current-search');
    if (pinBtn) {
        pinBtn.onclick = () => {
            if (folderData.pinnedSearches && folderData.pinnedSearches.some(p => p.query === query)) {
                return alert(t('pin_exists_error'));
            }

            if (folderData.pinnedSearches && folderData.pinnedSearches.length >= 5) {
                return alert(t('pin_limit_error'));
            }
            
            // UPDATED: Default to full query without truncation
            const defaultName = query;
            const title = prompt(t('pin_name_prompt'), defaultName);
            
            if (title) {
                if (!folderData.pinnedSearches) folderData.pinnedSearches = [];
                folderData.pinnedSearches.push({ 
                    id: Date.now(), 
                    title: title.trim(), 
                    query: query 
                });
                saveAndRefresh();
                
                const searchInput = document.getElementById('folder-search-input');
                if (searchInput) {
                    searchInput.value = "";
                    refreshFolderList();
                }
            }
        };
    }
}

/**
 * Validates if a chat matches a set of search tokens.
 * @param {ChatEntry} chat
 * @param {Object[]} tokens
 * @returns {boolean}
 */
function isMatch(chat, tokens) {
    return tokens.every(token => {
        const title = chat.title.toLowerCase();
        const note = (chat.annotation || "").toLowerCase();
        const tags = (chat.tags || []).map(t => t.toLowerCase());

        if (token.type === 'tag') return tags.some(t => t.includes(token.val));
        if (token.type === 'not_tag') return !tags.some(t => t.includes(token.val));
        if (token.type === 'not_text') return !title.includes(token.val) && !note.includes(token.val);
        
        return title.includes(token.val) || note.includes(token.val);
    });
}

/**
 * Generates HTML for a folder card in the tree view.
 * Uses textContent for XSS prevention.
 * @param {Folder} f
 * @param {number} level Hierarchy depth.
 * @returns {string} HTML string.
 */
function renderFolderCard(f, level) {
    const isRoot = level === 0;
    const indentClass = isRoot ? '' : 'subfolder-card';
    
    const hasSubfolders = f.subfolders && f.subfolders.length > 0;
    const subHtml = hasSubfolders 
        ? `<div class="subfolder-container hidden" id="sub-${f.id}">${f.subfolders.map(sf => renderFolderCard(sf, level + 1)).join('')}</div>` 
        : '';
    
    const arrow = hasSubfolders ? `<span class="toggle-sub-btn" data-target="sub-${f.id}">▶</span>` : `<span class="spacer"></span>`;
    const newSubBtn = isRoot ? `<button class="action-btn new-sub-btn" title="${t('new_subfolder_tooltip')}">📂+</button>` : '';
    const count = f.chatIds ? f.chatIds.length : 0;

    // Build DOM elements safely 
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        <div class="folder-wrapper ${indentClass}">
            <div class="folder-card" data-id="${f.id}" data-level="${level}">
                <div class="folder-info">
                    ${arrow}
                    <div class="folder-title-group">
                        <span class="folder-name"></span>
                        <span class="rename-folder-btn" title="${t('rename_tooltip')}">✎</span>
                    </div>
                    <span class="folder-count">${count}</span>
                </div>
                <div class="item-annotation"></div>
                <div class="folder-actions">
                    <button class="action-btn add-here-btn" title="${t('save_current_chat_tooltip')}">+</button>
                    ${newSubBtn}
                    <button class="action-btn link-btn" title="${t('add_link_tooltip')}">🔗</button>
                    <button class="action-btn note-folder-btn" title="${t('edit_note_tooltip')}">📝</button>
                    <button class="action-btn move-folder-btn" title="${t('move_folder_tooltip')}">➡</button> 
                    <button class="action-btn open-btn" title="${t('view_contents_tooltip')}">↗</button>
                    <button class="action-btn del-btn" title="${t('delete_tooltip')}">×</button>
                </div>
            </div>
            ${subHtml}
        </div>
    `;

    // Safe Name Injection
    const nameEl = wrapper.querySelector('.folder-name');
    nameEl.textContent = f.name;
    nameEl.title = f.name;

    // Safe Note Injection
    const noteEl = wrapper.querySelector('.item-annotation');
    if (f.annotation) {
        noteEl.textContent = f.annotation;
        noteEl.title = f.annotation;
    } else {
        noteEl.remove();
    }

    return wrapper.innerHTML;
}


/**
 * Generates HTML for a chat item.
 * Use textContent for XSS prevention.
 * @param {ChatEntry} chat
 * @param {string} [contextHtml] Extra HTML for search context/badges.
 * @returns {string} HTML string.
 */
function renderChatHtml(chat, contextHtml) {
    const safeContext = contextHtml || "";

    const createdDate = new Date(chat.timestamp);
    const updatedDate = new Date(chat.updatedAt || chat.timestamp);
    
    const formatDate = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
    
    const createdStr = formatDate(createdDate);
    const updatedStr = formatDate(updatedDate);
    
    const showUpdated = createdStr !== updatedStr;
    
    let dateHtml = `<span title="${t('created_date_tooltip', [createdDate.toLocaleString()])}">📅 ${createdStr}</span>`;
    
    if (showUpdated) {
        dateHtml += `<span class="date-divider">|</span> 
                     <span title="${t('updated_date_tooltip', [updatedDate.toLocaleString()])}">↻ ${updatedStr}</span>`;
    }

    const containingFolders = findAllFoldersForChat(chat.id);
    let linkIconHtml = '';
    if (containingFolders.length > 1) {
        linkIconHtml = `
            <span class="multi-link-manager-btn" 
                data-cid="${chat.id}" 
                title="${t('multi_location_tooltip', [containingFolders.length])}">
                🔗 <small>${containingFolders.length}</small>
            </span>`;
    }

    // Build DOM elements safely
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        <div class="chat-link-item">
            ${safeContext}
            <div class="chat-title-row">
                <a href="https://gemini.google.com/app/${chat.id}" class="chat-title-link"></a>
                ${linkIconHtml}
                <span class="rename-chat-btn" data-cid="${chat.id}" title="${t('rename_chat_tooltip')}">✎</span>
            </div>
            <div class="chat-tags"></div>
            <div class="item-annotation"></div>
            <div class="item-actions">
                <div class="chat-date-label">${dateHtml}</div>
                <button class="edit-tags-btn" data-cid="${chat.id}" title="${t('edit_tags_tooltip')}">🏷️</button>
                <button class="edit-note-btn" data-cid="${chat.id}" title="${t('edit_note_tooltip')}">📝</button>
                <button class="move-chat-btn" data-cid="${chat.id}" title="${t('move_chat_tooltip')}">⇄</button>
                <span class="remove-chat-btn" data-cid="${chat.id}" title="${t('remove_chat_tooltip')}">×</span>
            </div>
        </div>
    `;

    // Safe Title Injection
    const titleLink = wrapper.querySelector('.chat-title-link');
    titleLink.textContent = chat.title;
    titleLink.title = chat.title;

    // Safe Tag Injection
    const tagsContainer = wrapper.querySelector('.chat-tags');
    if (chat.tags && chat.tags.length > 0) {
        chat.tags.forEach(t => {
            const span = document.createElement('span');
            span.className = 'tag-pill clickable-tag';
            span.setAttribute('data-tag', t.replace(/^#/, ''));
            span.textContent = t.startsWith('#') ? t : `#${t}`;
            tagsContainer.appendChild(span);
        });
    } else {
        tagsContainer.remove();
    }

    // Safe Note Injection
    const noteEl = wrapper.querySelector('.item-annotation');
    if (chat.annotation) {
        noteEl.textContent = chat.annotation;
    } else {
        noteEl.remove();
    }

    return wrapper.innerHTML;
}

/**
 * Searches for a folder by ID and returns its context (self, siblings, index).
 * @param {number|string} id
 * @param {Folder[]} [list] Folder list to search within.
 * @returns {Object|null}
 */
function getFolderContext(id, list = folderData.folders) {
    for (let i = 0; i < list.length; i++) {
        if (list[i].id == id) {
            return { folder: list[i], siblings: list, index: i };
        }
        if (list[i].subfolders && list[i].subfolders.length > 0) {
            const context = getFolderContext(id, list[i].subfolders);
            if (context) return context;
        }
    }
    return null;
}

/**
 * Attaches interaction listeners to folder cards in a container.
 * @param {HTMLElement} container
 */
function attachCardListeners(container) {
    container.querySelectorAll('.folder-card').forEach(card => {
        const id = card.getAttribute('data-id');
        const level = parseInt(card.getAttribute('data-level'));
        
        card.querySelector('.open-btn').onclick = (e) => {
            e.stopPropagation();
            showFolderContents(id); 
        };
        card.querySelector('.add-here-btn').onclick = () => saveCurrentChatToFolder(id);
        card.querySelector('.link-btn').onclick = () => addChatByUrl(id);
        
        card.querySelector('.rename-folder-btn').onclick = (e) => { 
            e.stopPropagation(); 
            renameFolder(id); 
        };
        card.querySelector('.note-folder-btn').onclick = (e) => { 
            e.stopPropagation(); 
            editFolderAnnotation(id); 
        };
        card.querySelector('.move-folder-btn').onclick = (e) => { 
            e.stopPropagation(); 
            showMoveFolderMenu(e.clientX, e.clientY, id); 
        };
        
        card.querySelector('.del-btn').onclick = (e) => {
            e.stopPropagation();
            deleteFolder(id);
        };
        
        if (level === 0) {
            const subBtn = card.querySelector('.new-sub-btn');
            if (subBtn) subBtn.onclick = () => createNewFolder(id); 
        }
    });

    container.querySelectorAll('.toggle-sub-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const targetId = btn.getAttribute('data-target');
            const target = document.getElementById(targetId);
            if (target) {
                target.classList.toggle('hidden');
                btn.innerText = target.classList.contains('hidden') ? '▶' : '▼';
            }
        };
    });
}

/**
 * Retrieves a sorted list of all unique tags used across all chats.
 * @returns {string[]}
 */
function getAllUniqueTags() {
    const tags = new Set();
    if (folderData.allChats) {
        Object.values(folderData.allChats).forEach(chat => {
            if (chat.tags && Array.isArray(chat.tags)) {
                chat.tags.forEach(t => {
                    const standardized = `#${t.toString().replace(/^#+/, '')}`;
                    tags.add(standardized);
                });
            }
        });
    }
    return Array.from(tags).sort();
}

/**
 * Finds all folders containing a specific chat ID.
 * @param {string} chatId
 * @returns {Folder[]}
 */
function findAllFoldersForChat(chatId) {
    let results = [];
    const traverse = (list) => {
        list.forEach(f => {
            if (f.chatIds && f.chatIds.includes(chatId)) results.push(f);
            if (f.subfolders) traverse(f.subfolders);
        });
    };
    traverse(folderData.folders);
    return results;
}

/**
 * Persists the current state to storage and refreshes the UI.
 * Includes quota gatekeeper to prevent silent failures.
 */
function saveAndRefresh() {
    refreshFolderList(); 
    try {
        if (chrome.runtime?.id) {
            // --- Quota Gatekeeper Start ---
            const serialized = JSON.stringify(folderData);
            // Calculate size in bytes (approximated for UTF-8)
            const bytesInUse = new Blob([serialized]).size;
            
            // Chrome Sync Limit is 100KB (102,400 bytes).
            // We set a safety buffer of 2KB to ensure metadata overhead fits.
            const QUOTA_LIMIT = 102400; 
            const SAFETY_BUFFER = 2048; 

            if (bytesInUse > (QUOTA_LIMIT - SAFETY_BUFFER)) {
                alert(t('storage_full_alert', [(bytesInUse/1024).toFixed(1)]));
                updateStorageStats(); // Force UI to update immediately
                return; // Abort save to prevent partial write or crash
            }
            // --- Quota Gatekeeper End ---

            chrome.storage.sync.set({ 'maktaba_folders': folderData }, () => {
                 if (chrome.runtime.lastError) {
                     console.warn(chrome.runtime.lastError);
                     // Fallback alert if Chrome rejects it despite our check
                     alert(t('save_error_alert', [chrome.runtime.lastError.message]));
                 }
            });
        }
    } catch(e) {
        alert(t('context_invalidated_alert'));
    }
}

/**
 * Identifies the current active chat and prompts to save it to a folder.
 * @param {number|string} folderId
 */
function saveCurrentChatToFolder(folderId) {
    const currentUrl = window.location.href;
    const chatId = extractChatId(currentUrl);
    if (!chatId) return alert(t('chat_id_error'));

    const context = getFolderContext(folderId);
    if (!context || !context.folder) return;

    const folder = context.folder;
    if (folder && folder.chatIds && folder.chatIds.includes(chatId)) {
        return alert(t('chat_already_in_folder'));
    }

    const chatTitle = getRealChatTitle(chatId);
    const existing = folderData.allChats[chatId];
    const defaultNote = existing ? existing.annotation : "";
    const defaultTags = existing ? (existing.tags ? existing.tags.join(', ') : "") : "";

    const otherFolders = findAllFoldersForChat(chatId).filter(f => f.id != folderId);
    let promptMsg = t('add_tags_prompt');
    if (otherFolders.length > 0) promptMsg += t('already_saved_in_msg', [otherFolders.map(f => f.name).join(', ')]);

    const tagString = prompt(promptMsg, defaultTags);
    if (tagString === null) return;

    const tags = tagString ? tagString.split(',').map(t => t.trim()).filter(t => t) : [];
    const note = prompt(t('add_note_prompt'), defaultNote);

    if (saveChatToFolder(folderId, chatId, chatTitle, tags, note || "")) {
        const folderContainer = document.getElementById(`sub-${folderId}`);
        const toggleBtn = document.querySelector(`.toggle-sub-btn[data-target="sub-${folderId}"]`);
        if (folderContainer) {
            folderContainer.classList.remove('hidden');
            if(toggleBtn) toggleBtn.innerText = '▼';
        }
    }
}

/**
 * Prompts for a URL and metadata to save an external chat link into a folder.
 * @param {number|string} folderId
 */
function addChatByUrl(folderId) {
    const rawUrl = prompt(t('paste_gemini_url_prompt'));
    if (!rawUrl) return;
    const chatId = extractChatId(rawUrl);
    if (!chatId) return alert(t('invalid_url_alert'));

    const context = getFolderContext(folderId);
    if (!context || !context.folder) return alert(t('folder_not_found_alert'));
    const folder = context.folder;
    if (folder && folder.chatIds && folder.chatIds.includes(chatId)) {
        return alert(t('chat_already_in_folder'));
    }

    let chatName = prompt(t('name_chat_prompt'), t('default_saved_link_title'));
    if (chatName === null) return;

    const existing = folderData.allChats[chatId];
    if (existing) chatName = existing.title;

    const otherFolders = findAllFoldersForChat(chatId).filter(f => f.id != folderId);
    let tagPrompt = t('tags_input_label');
    if (otherFolders.length > 0) tagPrompt += t('already_saved_in_msg', [otherFolders.map(f => f.name).join(', ')]);

    const tagString = prompt(tagPrompt, existing ? existing.tags.join(', ') : "");
    const tags = tagString ? tagString.split(',').map(t => t.trim()) : [];
    const note = prompt(t('add_note_prompt_link'), existing ? existing.annotation : "");

    saveChatToFolder(folderId, chatId, chatName || "Untitled", tags, note || "");
}

/**
 * Core logic for adding a chat to a folder's reference array and updating global chat metadata.
 * @param {number|string} folderId
 * @param {string} chatId
 * @param {string} chatTitle
 * @param {string[]} [tags]
 * @param {string} [annotation]
 * @returns {boolean} True if successfully saved.
 */
function saveChatToFolder(folderId, chatId, chatTitle, tags = [], annotation = "") {
    const context = getFolderContext(folderId);
    if (!context || !context.folder) return false;
    
    const folder = context.folder; 

    const sanitizedTags = tags.map(t => {
        return `#${t.trim().replace(/^#+/, '')}`;
    });

    folderData.allChats[chatId] = {
            id: chatId, 
            title: chatTitle, 
            tags: sanitizedTags, 
            annotation: annotation,
            timestamp: folderData.allChats[chatId]?.timestamp || Date.now(),
            updatedAt: Date.now()
     };

    if (!folder.chatIds.includes(chatId)) {
        folder.chatIds.push(chatId);
        saveAndRefresh();
        
        const otherFolders = findAllFoldersForChat(chatId).filter(f => f.id != folderId);
        if (otherFolders.length > 0) showToast(t('save_success_toast_multi', [otherFolders.map(f => f.name).join(', ')]));
        else animateButton(`.folder-card[data-id="${folderId}"] .add-here-btn`);
        
        hideQuickSaveMenu();
        return true;
    }
    return false;
}

/**
 * Deletes a folder by ID.
 * @param {number|string} id
 */
function deleteFolder(id) {
    if (!confirm(t('delete_folder_confirm'))) return;
    const context = getFolderContext(id);
    if (context) {
        context.siblings.splice(context.index, 1);
        saveAndRefresh();
    }
}

/**
 * Prompts to rename a specific folder.
 * @param {number|string} id
 */
function renameFolder(id) {
    const context = getFolderContext(id);
    if (!context || !context.folder) return;
    const folder = context.folder;
    
    const newName = prompt(t('rename_folder_prompt'), folder.name);
    if (newName) { folder.name = newName.trim(); saveAndRefresh(); }
}

/**
 * Updates the title of a chat globally.
 * @param {string} chatId
 * @param {number|string} folderId The context folder ID for refreshing the UI.
 */
function renameChat(chatId, folderId) {
    const chat = folderData.allChats[chatId];
    if (!chat) return;
    const newName = prompt(t('rename_chat_global_prompt'), chat.title);
    if (newName !== null && newName.trim() !== "") {
        chat.title = newName.trim();
        chat.updatedAt = Date.now();
        saveAndRefresh();
        const searchInput = document.getElementById('folder-search-input');
        if (searchInput && searchInput.value.trim() !== "") refreshFolderList();
        else if (folderId) showFolderContents(folderId);
    }
}

/**
 * Prompts to edit the annotation for a folder.
 * @param {number|string} id
 */
function editFolderAnnotation(id) {
    const context = getFolderContext(id);
    if (!context || !context.folder) return;
    const folder = context.folder;

    const newNote = prompt(t('edit_folder_note_prompt'), folder.annotation || "");
    if (newNote !== null) { folder.annotation = newNote.trim(); saveAndRefresh(); }
}

/**
 * Prompts to edit the annotation for a chat.
 * @param {string} chatId
 * @param {number|string} folderId UI context for refresh.
 */
function editChatAnnotation(chatId, folderId) {
    const chat = folderData.allChats[chatId];
    if (!chat) return;
    const newNote = prompt(t('edit_chat_note_prompt'), chat.annotation || "");
    if (newNote !== null) {
        chat.annotation = newNote.trim();
        chat.updatedAt = Date.now();
        saveAndRefresh();
        const searchInput = document.getElementById('folder-search-input');
        if (searchInput && searchInput.value.trim() !== "") refreshFolderList();
        else if (folderId) showFolderContents(folderId);
    }
}

/**
 * Prompts to edit tags for a chat and normalizes input.
 * @param {string} chatId
 * @param {number|string} folderId UI context for refresh.
 */
function editChatTags(chatId, folderId) {
    const chat = folderData.allChats[chatId];
    if (!chat) return;
    
    const currentTags = chat.tags ? chat.tags.join(', ') : '';
    const newTagString = prompt(t('edit_tags_prompt'), currentTags);
    if (newTagString === null) return;

    chat.tags = newTagString.split(',').map(t => {
        const clean = t.trim().replace(/^#+/, '');
        return clean.length > 0 ? `#${clean}` : null;
    }).filter(t => t);
    chat.updatedAt = Date.now();
    saveAndRefresh();
    const searchInput = document.getElementById('folder-search-input');
    if (searchInput && searchInput.value.trim() !== "") refreshFolderList();
    else if (folderId) showFolderContents(folderId);
}

/**
 * Removes a chat reference from a folder. 
 * If folderId is null (Search Mode), it performs a Global Delete (removes from all folders).
 * @param {string} chatId
 * @param {number|string|null} folderId
 */
function removeChatFromFolder(chatId, folderId) {
    // Handle Search Mode (Global Delete)
    if (folderId === null) {
        const containingFolders = findAllFoldersForChat(chatId);
        const folderNames = containingFolders.map(f => f.name).join(', ');
        const confirmMsg = containingFolders.length > 0
            ? t('global_delete_confirm', [folderNames])
            : t('global_delete_simple_confirm');

        if (!confirm(confirmMsg)) return;

        // Remove ID from ALL folders that contain it
        containingFolders.forEach(folder => {
            folder.chatIds = folder.chatIds.filter(id => id !== chatId);
        });

        // Delete the metadata
        delete folderData.allChats[chatId];
        
        saveAndRefresh();
        return;
    }

    // Handle Specific Folder Mode (Local Delete)
    const context = getFolderContext(folderId);
    if (!context || !context.folder) return;
    const folder = context.folder;

    // Check how many folders currently hold this chat
    const currentLinks = findAllFoldersForChat(chatId);
    
    // If this is the only folder containing the chat, warn the user
    if (currentLinks.length === 1) {
        const warningMsg = t('last_folder_warning_confirm');
        if (!confirm(warningMsg)) return;
    }

    // Proceed with removal
    folder.chatIds = folder.chatIds.filter(id => id !== chatId);
    
    // Check if chat is now orphaned (double-check safety)
    const remainingLinks = findAllFoldersForChat(chatId);
    if (remainingLinks.length === 0) {
        delete folderData.allChats[chatId]; // Cleanup metadata
    }
    
    saveAndRefresh();
    showFolderContents(folderId);
}

/**
 * Attempts to retrieve the chat title from the DOM or document metadata.
 * @param {string} chatId
 * @returns {string}
 */
function getRealChatTitle(chatId) {
    const headerTitle = document.querySelector('h1, [data-test-id="chat-title"], .conversation-title');
    if (headerTitle && headerTitle.innerText.trim().length > 0) return headerTitle.innerText.replace(/\n/g, ' ').trim();
    return document.title.replace(/^Gemini\s-\s/, '').replace(/^Google\sGemini/, '').trim() || t('untitled_chat_fallback');
}

/**
 * Extracts a chat ID from a Gemini URL.
 * @param {string} url
 * @returns {string|null}
 */
function extractChatId(url) {
    const match = url.match(/\/app\/(?:chat\/)?([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

/**
 * Plays a simple success animation on a button.
 * @param {string} selector CSS selector for the button.
 */
function animateButton(selector) {
    const btn = document.querySelector(selector);
    if(btn) {
        const orig = btn.innerText;
        btn.innerText = "✓";
        btn.style.background = "#4caf50";
        setTimeout(() => { btn.innerText = orig; btn.style.background = ""; }, 1500);
    }
}

/**
 * Shows a temporary toast message to the user.
 * @param {string} msg
 */
function showToast(msg) {
    const t = document.createElement('div');
    t.innerText = msg;
    t.style.cssText = `position:fixed; bottom:20px; right:20px; background:#333; color:#fff; padding:10px 20px; border-radius:5px; z-index:999999; box-shadow:0 2px 10px rgba(0,0,0,0.5); font-size:13px;`;
    document.body.appendChild(t);
    setTimeout(() => { t.remove(); }, 4000);
}

/**
 * Creates a new folder or subfolder.
 * @param {number|null} parentId ID of the parent folder, or null for root.
 */
function createNewFolder(parentId) {
    const name = prompt(parentId ? t('new_subfolder_prompt') : t('new_root_folder_prompt'));
    if (!name) return;

    const newFolder = { 
        id: Date.now(), 
        name: name.trim(), 
        chatIds: [], 
        subfolders: [], 
        annotation: "" 
    };

    if (parentId) {
        const context = getFolderContext(parentId);
        if (context && context.folder) {
            const parent = context.folder;
            if (!parent.subfolders) parent.subfolders = [];
            parent.subfolders.push(newFolder);
        } else {
            console.error(t('parent_folder_not_found_error'));
            return;
        }
    } else {
        folderData.folders.push(newFolder);
    }

    saveAndRefresh();
}

/**
 * Returns an array of folder objects representing the path to a specific folder.
 * @param {number|string} folderId
 * @returns {Folder[]}
 */
function getFolderPath(folderId) {
    const path = [];
    let currentId = folderId;

    while (currentId) {
        const context = getFolderContext(currentId);
        if (context) {
            path.unshift(context.folder);
            const parent = findParentFolderOfArray(context.siblings);
            currentId = parent ? parent.id : null;
        } else {
            currentId = null;
        }
    }
    return path;
}

/**
 * Internal helper to find the folder that contains a specific subfolders array.
 * Used for upward traversal of the hierarchy.
 * @param {Folder[]} targetArray
 * @param {Folder[]} [list] Search list.
 * @returns {Folder|null}
 */
function findParentFolderOfArray(targetArray, list = folderData.folders) {
    for (const f of list) {
        if (f.subfolders === targetArray) return f;
        if (f.subfolders) {
            const found = findParentFolderOfArray(targetArray, f.subfolders);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Displays a context menu to change the sort order of a folder.
 * @param {number} x
 * @param {number} y
 * @param {number|string} folderId
 */
function showSortMenu(x, y, folderId) {
    const existing = document.getElementById('sort-context-menu'); 
    if (existing) existing.remove();

    const menu = document.createElement('div'); 
    menu.id = 'sort-context-menu';
    menu.className = 'ctx-menu'; 
    menu.style.top = `${y}px`; 
    menu.style.left = `${x - 120}px`;

    const context = getFolderContext(folderId);
    const current = context.folder.sortOrder || 'updated';

    const options = [
        { id: 'updated', icon: '🔄', label: t('sort_last_updated') },
        { id: 'created', icon: '📅', label: t('sort_date_added') },
        { id: 'alpha',   icon: '🔤', label: t('sort_alpha') }
    ];

    let html = `<div class="ctx-header">${t('sort_menu_header')}</div>`;
    
    options.forEach(opt => {
        const isActive = current === opt.id;
        const check = isActive ? '✓' : ''; 
        const style = isActive ? 'color: #a8c7fa; font-weight:bold;' : '';
        
        html += `
            <div class="ctx-item" data-sort="${opt.id}" style="${style}">
                <span style="width:20px">${opt.icon}</span> 
                <span style="flex-grow:1">${opt.label}</span>
                <span>${check}</span>
            </div>`;
    });

    menu.innerHTML = html;
    document.body.appendChild(menu);

    const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);

    menu.querySelectorAll('.ctx-item').forEach(item => {
        item.onclick = () => {
            const sortMethod = item.getAttribute('data-sort');
            context.folder.sortOrder = sortMethod;
            saveAndRefresh();
            showFolderContents(folderId);
        };
    });
}

/**
 * Renders the contents of a specific folder in the primary list view.
 * @param {number|string} folderId
 */
function showFolderContents(folderId) {
    const context = getFolderContext(folderId); 
    if (!context || !context.folder) return;
    
    const folder = context.folder;
    const list = document.getElementById('right-folder-list');
    
    const currentSort = folder.sortOrder || 'updated'; 
    
    let chats = [];
    if (folder.chatIds) {
        chats = folder.chatIds
            .map(id => folderData.allChats[id])
            .filter(chat => chat);
    }

    chats.sort((a, b) => {
        if (currentSort === 'alpha') {
            return a.title.localeCompare(b.title);
        } else if (currentSort === 'created') {
            return (b.timestamp || 0) - (a.timestamp || 0);
        } else {
            const timeA = a.updatedAt || a.timestamp || 0;
            const timeB = b.updatedAt || b.timestamp || 0;
            return timeB - timeA;
        }
    });

    const path = getFolderPath(folderId);
    const breadcrumbHtml = path.map((f, index) => {
        const isLast = index === path.length - 1;
        return isLast 
            ? `<span class="breadcrumb-current">${f.name}</span>`
            : `<span class="breadcrumb-link" data-fid="${f.id}">${f.name}</span> <span class="breadcrumb-sep">/</span>`;
    }).join('');

    let sortLabel = "🕒"; 
    if (currentSort === 'alpha') sortLabel = "🔤";
    if (currentSort === 'created') sortLabel = "📅";

    let html = `
        <div class="sub-header">
            <button id="back-btn" title="${t('back_tooltip')}">←</button>
            <div class="breadcrumb-container">${breadcrumbHtml}</div>
            <button id="sort-folder-btn" title="${t('sort_order_btn_tooltip', [currentSort])}">${sortLabel}</button>
        </div>
        <div class="chat-link-list">
    `;

    if (chats.length === 0) {
        html += `<div class="empty-state">${t('empty_subfolder_msg')}</div>`;
    } else {
        chats.forEach(chat => { 
            html += renderChatHtml(chat, ""); 
        });
    }
    html += `</div>`;
    list.innerHTML = html;

    document.getElementById('back-btn').onclick = refreshFolderList;
    
    document.getElementById('sort-folder-btn').onclick = (e) => {
        e.stopPropagation();
        showSortMenu(e.clientX, e.clientY, folderId);
    };

    list.querySelectorAll('.breadcrumb-link').forEach(link => {
        link.onclick = () => showFolderContents(link.getAttribute('data-fid'));
    });
    attachChatListeners(list, folderId);
}

/**
 * Displays a context menu to move a chat to a different folder.
 * @param {number} x
 * @param {number} y
 * @param {string} chatId
 * @param {number|string} sourceFolderId
 */
function showMoveMenu(x, y, chatId, sourceFolderId) {
    const existing = document.getElementById('move-context-menu'); if (existing) existing.remove();
    const menu = document.createElement('div'); menu.id = 'move-context-menu';
    menu.style.top = `${y}px`; menu.style.left = `${x - 160}px`;
    let allFolders = [];
    const traverse = (list, prefix = "") => {
        list.forEach(f => {
            if (f.id != sourceFolderId && (!f.chatIds || !f.chatIds.includes(chatId))) allFolders.push({ ...f, displayName: prefix + f.name });
            if (f.subfolders) traverse(f.subfolders, prefix + "↳ ");
        });
    };
    traverse(folderData.folders);
    let html = `<div class="ctx-header">${t('move_to_menu_header')}</div>`;
    if (allFolders.length === 0) html += `<div class="ctx-item disabled">${t('no_folders_available')}</div>`;
    else allFolders.forEach(f => { html += `<div class="ctx-item" data-fid="${f.id}">📁 ${f.displayName}</div>`; });
    menu.innerHTML = html; document.body.appendChild(menu);
    const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
    menu.querySelectorAll('.ctx-item').forEach(item => {
        item.onclick = () => { const targetFolderId = item.getAttribute('data-fid'); if (targetFolderId) handleMoveChat(chatId, sourceFolderId, targetFolderId); };
    });
}

/**
 * Logic to transfer a chat reference between folders.
 * @param {string} chatId
 * @param {number|string} sourceFolderId
 * @param {number|string} targetFolderId
 */
function handleMoveChat(chatId, sourceFolderId, targetFolderId) {
    const srcCtx = getFolderContext(sourceFolderId);
    const tgtCtx = getFolderContext(targetFolderId);
    
    if (!srcCtx?.folder || !tgtCtx?.folder) return;
    
    const sourceFolder = srcCtx.folder;
    const targetFolder = tgtCtx.folder;

    if (!targetFolder.chatIds.includes(chatId)) targetFolder.chatIds.push(chatId);
    sourceFolder.chatIds = sourceFolder.chatIds.filter(id => id !== chatId);
    saveAndRefresh();
    
    const searchInput = document.getElementById('folder-search-input');
    if (searchInput && searchInput.value.trim() !== "") refreshFolderList();
    else showFolderContents(sourceFolderId);
}

/**
 * Displays a context menu to reorganize folder hierarchy.
 * @param {number} x
 * @param {number} y
 * @param {number|string} folderId
 */
function showMoveFolderMenu(x, y, folderId) {
    const existing = document.getElementById('move-folder-menu'); if (existing) existing.remove();
    const menu = document.createElement('div'); menu.id = 'move-folder-menu'; 
    menu.style.top = `${y}px`; menu.style.left = `${x - 160}px`;
    const isRoot = folderData.folders.some(f => f.id == folderId);
    let validTargets = [];
    const isDescendant = (parent, childId) => {
        if (!parent.subfolders) return false;
        if (parent.subfolders.some(sf => sf.id == childId)) return true;
        return parent.subfolders.some(sf => isDescendant(sf, childId));
    };
    const traverse = (list, prefix = "") => {
        list.forEach(f => {
            if (f.id == folderId) return;
            const ctxMoving = getFolderContext(folderId);
            const folderMoving = ctxMoving ? ctxMoving.folder : null;
            if (isDescendant(folderMoving, f.id)) return;
            validTargets.push({ ...f, displayName: prefix + f.name });
            if (f.subfolders) traverse(f.subfolders, prefix + "↳ ");
        });
    };
    traverse(folderData.folders);
    let html = `<div class="ctx-header">${t('move_folder_menu_header')}</div>`;
    if (!isRoot) html += `<div class="ctx-item special-action" data-action="make-root">${t('make_root_folder_action')}</div><div style="border-bottom:1px solid #444; margin:4px 0;"></div>`;
    if (validTargets.length === 0) html += `<div class="ctx-item disabled">${t('no_targets_available')}</div>`;
    else validTargets.forEach(f => { html += `<div class="ctx-item" data-fid="${f.id}">📁 ${f.displayName}</div>`; });
    menu.innerHTML = html; document.body.appendChild(menu);
    const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
    menu.querySelectorAll('.ctx-item').forEach(item => {
        item.onclick = () => {
            const action = item.getAttribute('data-action'); const targetId = item.getAttribute('data-fid');
            if (action === 'make-root') handleMoveFolder(folderId, 'root');
            else if (targetId) handleMoveFolder(folderId, targetId);
        };
    });
}

/**
 * Logic to move a folder to a new parent or to the root level.
 * @param {number|string} folderId
 * @param {number|string|'root'} targetParentId
 */
function handleMoveFolder(folderId, targetParentId) {
    const context = getFolderContext(folderId);
    if (!context) return;

    const [folderToMove] = context.siblings.splice(context.index, 1);

    if (targetParentId === 'root') {
        folderData.folders.push(folderToMove);
    } else {
        const targetContext = getFolderContext(targetParentId);
        if (targetContext) {
            if (!targetContext.folder.subfolders) targetContext.folder.subfolders = [];
            targetContext.folder.subfolders.push(folderToMove);
        }
    }
    saveAndRefresh();
}

/**
 * Displays the quick-save UI for the current chat session.
 * Includes tag autocompletion and folder destination selection.
 */
function showQuickSaveMenu() {
    const currentUrl = window.location.href; 
    const chatId = extractChatId(currentUrl);
    if (!chatId) return alert(t('open_chat_first_alert'));

    const menu = document.getElementById('quick-save-menu'); 
    const list = document.getElementById('quick-save-list');
    const tagInput = document.getElementById('quick-save-tags'); 
    const noteInput = document.getElementById('quick-save-note');
    const saveBtn = document.getElementById('save-current-btn');
    const autoList = document.getElementById('tag-autocomplete-list');

    const existing = folderData.allChats[chatId];
    tagInput.value = existing?.tags ? existing.tags.map(t => `#${t.replace(/^#+/, '')}`).join(', ') + ', ' : "";
    noteInput.value = existing?.annotation || "";

    const newTagInput = tagInput.cloneNode(true);
    tagInput.parentNode.replaceChild(newTagInput, tagInput);
    const activeTagInput = document.getElementById('quick-save-tags');

    /**
     * Renders tag suggestions based on user input.
     * @param {string} inputValue
     */
    const renderSuggestions = (inputValue) => {
        const parts = inputValue.split(','); 
        const rawToken = parts[parts.length - 1].trim().toLowerCase();
        const searchToken = rawToken.replace(/^#+/, ''); 
        const allTags = getAllUniqueTags(); 
        
        const usedTags = parts.slice(0, -1).map(p => {
            return p.trim().toLowerCase().replace(/^#+/, '');
        });
        
        const matches = allTags.filter(t => {
            const cleanTag = t.toLowerCase().replace(/^#+/, '');
            const isMatch = searchToken === "" || cleanTag.startsWith(searchToken);
            const isUsed = usedTags.includes(cleanTag);
            const isExact = searchToken !== "" && cleanTag === searchToken;

            return isMatch && !isUsed && !isExact;
        });

        if (matches.length === 0 || !autoList) {
            if(autoList) autoList.classList.add('hidden');
            return;
        }

        autoList.innerHTML = matches.map(t => {
            const cleanDisplay = t.replace(/^#+/, '');
            return `<div class="auto-item">#${cleanDisplay}</div>`;
        }).join('');
        
        autoList.classList.remove('hidden');

        autoList.querySelectorAll('.auto-item').forEach(item => {
            item.onclick = () => {
                parts[parts.length - 1] = item.innerText; 
                activeTagInput.value = parts.join(', ') + ', '; 
                activeTagInput.focus();
                autoList.classList.add('hidden');
            };
        });
    };

    activeTagInput.oninput = function() { renderSuggestions(this.value); };
    activeTagInput.onfocus = function() { renderSuggestions(this.value); };
    activeTagInput.onclick = function(e) { 
        e.stopPropagation(); 
        renderSuggestions(this.value); 
    };

    const closeAuto = (e) => {
        if (autoList && !autoList.classList.contains('hidden') && e.target !== activeTagInput && !autoList.contains(e.target)) {
            autoList.classList.add('hidden');
        }
    };
    document.removeEventListener('click', closeAuto);
    document.addEventListener('click', closeAuto);

    let allFolders = [];
    const traverse = (folders, prefix = "") => {
        folders.forEach(f => {
            allFolders.push({ ...f, displayName: prefix + f.name });
            if (f.subfolders) traverse(f.subfolders, prefix + "↳ ");
        });
    };
    traverse(folderData.folders);

    list.innerHTML = allFolders.map(f => {
        const isSaved = f.chatIds && f.chatIds.includes(chatId);
        return `
            <div class="quick-save-item ${isSaved ? 'already-saved' : ''}" data-id="${f.id}">
                ${f.displayName} 
                ${isSaved ? `<span class="saved-indicator">${t('saved_status_indicator')}</span>` : ''}
            </div>
        `;
    }).join('') || `<div class="empty-state">${t('empty_folders_msg')}</div>`;

    menu.classList.remove('hidden'); 
    saveBtn.style.display = 'none';
    list.scrollTop = 0; 

    list.querySelectorAll('.quick-save-item').forEach(item => {
        item.onclick = () => {
            const rawTags = activeTagInput.value ? activeTagInput.value.split(',') : [];
            const tags = rawTags.map(t => {
                const clean = t.trim().replace(/^#+/, ''); 
                return clean.length > 0 ? `#${clean}` : null;
            }).filter(t => t); 

            const note = noteInput.value.trim();
            const chatTitle = getRealChatTitle(chatId);
            
            if (saveChatToFolder(item.getAttribute('data-id'), chatId, chatTitle, tags, note)) {
                hideQuickSaveMenu();
                document.removeEventListener('click', closeAuto);
            }
        };
    });

    document.getElementById('cancel-save-btn').onclick = () => {
        hideQuickSaveMenu();
        document.removeEventListener('click', closeAuto);
    };
}

/**
 * Hides the quick-save menu and restores the primary save button.
 */
function hideQuickSaveMenu() { 
    document.getElementById('quick-save-menu').classList.add('hidden'); 
    document.getElementById('save-current-btn').style.display = 'block'; 
}

if (document.readyState === 'loading') { 
    document.addEventListener('DOMContentLoaded', init); 
} else { 
    init(); 
}

document.addEventListener('click', (e) => {
    if(e.target.id === 'btn-diag') generateDiagnosticLog();
    if(e.target.id === 'btn-prune') pruneUnlinked();
    if(e.target.id === 'settings-panel-btn') updateStorageStats();
});

/**
 * Calculates current usage against the 100KB chrome.storage.sync quota.
 */
function updateStorageStats() {
    if (!folderData) return;
    const json = JSON.stringify(folderData);
    const bytes = new Blob([json]).size;
    const pct = ((bytes / 102400) * 100).toFixed(1);
    
    const textEl = document.getElementById('storage-text');
    const barEl = document.getElementById('storage-bar');
    
    if(textEl) textEl.innerText = t('storage_used_text', [(bytes/1024).toFixed(2)]);
    if(barEl) {
        barEl.style.width = `${pct}%`;
        barEl.style.backgroundColor = pct > 90 ? '#ffb4ab' : '#a8c7fa';
    }
}

/**
 * Generates and downloads a diagnostic JSON file for troubleshooting data integrity and system performanace.
 */
function generateDiagnosticLog() {
    const bytes = new Blob([JSON.stringify(folderData)]).size;
    const unlinkedCount = findUnlinked().length;
    
    const stats = window.maktabaStats || { renders: 0, skips: 0 };

    const log = {
        meta: { 
            timestamp: new Date().toLocaleString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            offset: new Date().toString().match(/GMT[\+\-]\d{4}/)?.[0] || t('diagnostic_unknown_offset'),
            version: chrome.runtime.getManifest().version
        },
        storage: { 
            bytes_used: bytes, 
            quota_pct: ((bytes/102400)*100).toFixed(2) 
        },
        counts: { 
            folders: folderData.folders.length, 
            chats: Object.keys(folderData.allChats).length,
            unlinked: unlinkedCount,
            pinned: (folderData.pinnedSearches || []).length, 
            tags: getAllUniqueTags().length 
        },
        activity: {
            session_renders: stats.renders,
            session_skips: stats.skips 
        },
        integrity: { 
            is_clean: unlinkedCount === 0 
        }
    };
        const blob = new Blob([JSON.stringify(log, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t('filename_diagnostic_prefix')}${getLocalFilenameTimestamp()}.json`;
    a.click();
}

/**
 * Identifies chat metadata entries that are no longer referenced by any folder.
 * @returns {string[]} List of unlinked chat IDs.
 */
function findUnlinked() {
    const referencedIds = new Set();
    const traverse = (list) => {
        list.forEach(f => {
            if(f.chatIds) f.chatIds.forEach(id => referencedIds.add(id));
            if(f.subfolders) traverse(f.subfolders);
        });
    };
    traverse(folderData.folders);
    
    return Object.keys(folderData.allChats).filter(id => !referencedIds.has(id));
}

/**
 * Removes unlinked chat metadata to free up storage space.
 */
function pruneUnlinked() {
    const unlinked = findUnlinked();
    if (unlinked.length === 0) return alert(t('system_clean_alert'));
    
    if (confirm(t('prune_confirm', [unlinked.length]))) {
        unlinked.forEach(id => delete folderData.allChats[id]);
        saveAndRefresh();
        updateStorageStats();
        alert(t('prune_success_alert', [unlinked.length]));
    }
}

/**
 * Safely moves all unlinked chats into a new visible folder.
 */
function archiveUnlinked() {
    const unlinkedIds = findUnlinked();
    
    if (unlinkedIds.length === 0) {
        return alert(t('system_clean_alert'));
    }

    if (!confirm(t('archive_confirm', [unlinkedIds.length]))) return;

    // Create a new folder containing all these loose IDs
    const recoveryFolder = { 
        id: Date.now(), 
        name: t('recovered_folder_name', [getLocalDateString()]), 
        chatIds: unlinkedIds, 
        subfolders: [], 
        annotation: t('recovered_folder_annotation') 
    };

    // Add to the main folder list
    folderData.folders.push(recoveryFolder);
    saveAndRefresh();
    
    // Update the UI immediately
    updateStorageStats();
    alert(t('archive_success_alert', [recoveryFolder.name, unlinkedIds.length]));
}