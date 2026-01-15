// Virtual File System
class VirtualFileSystem {
    constructor() {
        this.currentDir = '/home/user';
        this.fs = this.loadFS() || {
            '/': { type: 'dir', children: ['home', 'etc', 'var', 'tmp'] },
            '/home': { type: 'dir', children: ['user'] },
            '/home/user': { type: 'dir', children: ['Desktop', 'Documents', 'Downloads'] },
            '/home/user/Desktop': { type: 'dir', children: [] },
            '/home/user/Documents': { type: 'dir', children: [] },
            '/home/user/Downloads': { type: 'dir', children: [] },
            '/etc': { type: 'dir', children: [] },
            '/var': { type: 'dir', children: [] },
            '/tmp': { type: 'dir', children: [] }
        };
        this.saveFS();
    }

    loadFS() {
        try {
            const data = localStorage.getItem('vfs');
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    }

    saveFS() {
        try {
            localStorage.setItem('vfs', JSON.stringify(this.fs));
        } catch (e) {
            console.error('Failed to save filesystem', e);
        }
    }

    resolvePath(path) {
        if (path.startsWith('/')) return path;
        if (path === '~') return '/home/user';
        if (path.startsWith('~/')) return '/home/user' + path.slice(1);
        if (path === '.') return this.currentDir;
        if (path === '..') {
            const parts = this.currentDir.split('/').filter(p => p);
            parts.pop();
            return '/' + parts.join('/') || '/';
        }
        return this.currentDir + (this.currentDir.endsWith('/') ? '' : '/') + path;
    }

    exists(path) {
        return this.fs[path] !== undefined;
    }

    isDir(path) {
        return this.exists(path) && this.fs[path].type === 'dir';
    }

    isFile(path) {
        return this.exists(path) && this.fs[path].type === 'file';
    }

    mkdir(path) {
        path = this.resolvePath(path);
        if (this.exists(path)) return { error: 'mkdir: cannot create directory: File exists' };

        const parent = path.substring(0, path.lastIndexOf('/')) || '/';
        if (!this.isDir(parent)) return { error: 'mkdir: cannot create directory: No such file or directory' };

        const name = path.substring(path.lastIndexOf('/') + 1);
        this.fs[path] = { type: 'dir', children: [] };
        this.fs[parent].children.push(name);
        this.saveFS();
        return { success: true };
    }

    touch(path) {
        path = this.resolvePath(path);
        if (this.exists(path)) return { success: true }; // File exists, just update timestamp

        const parent = path.substring(0, path.lastIndexOf('/')) || '/';
        if (!this.isDir(parent)) return { error: 'touch: cannot touch: No such file or directory' };

        const name = path.substring(path.lastIndexOf('/') + 1);
        this.fs[path] = { type: 'file', content: '', created: Date.now() };
        this.fs[parent].children.push(name);
        this.saveFS();
        return { success: true };
    }

    writeFile(path, content, append = false) {
        path = this.resolvePath(path);
        if (!this.exists(path)) {
            const result = this.touch(path);
            if (result.error) return result;
        }

        if (!this.isFile(path)) return { error: 'cannot write: Is a directory' };

        if (append) {
            this.fs[path].content += content;
        } else {
            this.fs[path].content = content;
        }
        this.saveFS();
        return { success: true };
    }

    readFile(path) {
        path = this.resolvePath(path);
        if (!this.exists(path)) return { error: 'cat: No such file or directory' };
        if (!this.isFile(path)) return { error: 'cat: Is a directory' };
        return { content: this.fs[path].content || '' };
    }

    ls(path = '.', showHidden = false) {
        path = this.resolvePath(path);
        if (!this.exists(path)) return { error: 'ls: cannot access: No such file or directory' };
        if (!this.isDir(path)) return { items: [path.substring(path.lastIndexOf('/') + 1)] };

        let items = [...this.fs[path].children];
        if (!showHidden) items = items.filter(i => !i.startsWith('.'));
        return { items };
    }

    rm(path, recursive = false) {
        path = this.resolvePath(path);
        if (!this.exists(path)) return { error: 'rm: cannot remove: No such file or directory' };

        if (this.isDir(path) && !recursive) {
            return { error: 'rm: cannot remove: Is a directory (use -r)' };
        }

        const parent = path.substring(0, path.lastIndexOf('/')) || '/';
        const name = path.substring(path.lastIndexOf('/') + 1);

        if (this.isDir(path) && recursive) {
            // Remove all children first
            const children = [...this.fs[path].children];
            for (const child of children) {
                this.rm(path + '/' + child, true);
            }
        }

        delete this.fs[path];
        const idx = this.fs[parent].children.indexOf(name);
        if (idx > -1) this.fs[parent].children.splice(idx, 1);
        this.saveFS();
        return { success: true };
    }

    cd(path) {
        path = this.resolvePath(path);
        if (!this.exists(path)) return { error: 'cd: no such file or directory' };
        if (!this.isDir(path)) return { error: 'cd: not a directory' };
        this.currentDir = path;
        return { success: true, path };
    }

    pwd() {
        return this.currentDir;
    }

    cp(src, dest) {
        src = this.resolvePath(src);
        dest = this.resolvePath(dest);

        if (!this.exists(src)) return { error: 'cp: cannot stat: No such file or directory' };
        if (this.isDir(src)) return { error: 'cp: omitting directory (use -r for recursive)' };

        const content = this.readFile(src);
        if (content.error) return content;

        return this.writeFile(dest, content.content);
    }

    mv(src, dest) {
        const cpResult = this.cp(src, dest);
        if (cpResult.error) return cpResult;
        return this.rm(src);
    }
}

class OS {
    constructor() {
        this.desktop = document.getElementById('desktop');
        this.windowArea = document.getElementById('window-area');
        this.windows = {};
        this.zIndex = 100;
        this.nextId = 1;
        this.vfs = new VirtualFileSystem(); // Virtual File System

        this.startClock();
        this.setupDrag();
        this.setupResize();
    }

    startClock() {
        setInterval(() => {
            document.getElementById('clock').innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }, 1000);
    }

    /* --- Window Management --- */

    openApp(appType, arg = null) {
        let content = '';
        let title = '';
        let width = 400;
        let height = 300;

        switch (appType) {
            case 'notepad':
                title = 'Notepad';
                const savedNote = localStorage.getItem('yesos_notepad_cache') || '';
                // Escape saved content to prevent HTML injection issues in template literal
                const safeNote = savedNote.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
                content = `<textarea class="notepad-area" placeholder="Type here... (Auto-saved)" oninput="localStorage.setItem('yesos_notepad_cache', this.value)">${safeNote}</textarea>`;
                break;
            case 'calculator':
                title = 'Calculator';
                width = 300;
                height = 400;
                content = this.getCalculatorHTML();
                break;
            case 'browser':
                title = 'Web Surf';
                width = 800;
                height = 600;
                const initialUrl = arg || 'https://www.wikipedia.org';
                // If it's a blob URL, we might want to show a friendly name in the bar, but for now show real URL
                // Check if it's a blob to determine if we need proxy
                const isBlob = initialUrl.startsWith('blob:');
                const srcUrl = isBlob ? initialUrl : (initialUrl.startsWith('http') ? 'https://api.allorigins.win/raw?url=' + encodeURIComponent(initialUrl) : initialUrl);

                content = `
                    <div class="browser-chrome">
                        <button onclick="os.browserBack(this)">⬅</button>
                        <input type="text" class="url-bar" value="${initialUrl}" onkeydown="if(event.key==='Enter') os.browserGo(this)">
                        <button onclick="os.browserGo(this.previousElementSibling)">Go</button>
                    </div>
                    <iframe src="${srcUrl}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
                `;
                break;
            case 'htmlviewer':
                title = 'HTML Viewer';
                width = 800;
                height = 600;
                // arg should be the blob URL
                content = `
                    <div style="width:100%; height:100%; display:flex; flex-direction:column; background:#fff;">
                         <div style="background:#eee; padding:5px 10px; border-bottom:1px solid #ccc; font-size:0.8rem; color:#555;">
                            Previewing File
                        </div>
                        <iframe src="${arg}" style="flex:1; border:none; width:100%; height:100%;" sandbox="allow-scripts allow-forms allow-popups"></iframe>
                    </div>
                `;
                break;
            case 'aibot':
                title = 'YesAI Assistant';
                width = 350;
                height = 500;
                content = `
                    <div class="chat-container">
                        <div class="chat-history" id="ai-history-${this.nextId}"></div>
                        <div class="chat-input-area">
                            <input class="chat-input" type="text" placeholder="Ask me anything..." onkeydown="if(event.key==='Enter') os.aiSend(this)">
                            <button class="chat-send" onclick="os.aiSend(this.previousElementSibling)">➤</button>
                        </div>
                    </div>
                `;
                break;
            case 'terminal':
                title = 'Terminal';
                width = 600;
                height = 400;
                content = `
                    <div class="terminal-window" onclick="this.querySelector('input').focus()">
                        <div class="term-output">
                            <div class="term-line">Welcome to YesOS Linux</div>
                            <div class="term-line">Type 'help' for available commands</div>
                            <br>
                        </div>
                        <div class="term-input-line">
                            <span class="term-prompt">user@yesos:~$</span>
                            <input class="term-input" type="text" onkeydown="os.termEnter(event)">
                        </div>
                    </div>
                `;
                break;
            case 'settings':
                title = 'Settings';
                content = `
                    <div style="padding:20px; color:#fff;">
                        <h3>System Settings</h3>
                        <p>Customize your Yes Browser experience.</p>
                        <br>
                        <label>Background Style</label>
                        <select style="width:100%; padding:5px; margin-top:5px; background:#333; color:#fff; border:1px solid #555;">
                            <option>Deep Space (Default)</option>
                            <option>Nebula</option>
                            <option>Black Hole</option>
                        </select>
                        <br><br>
                        <label>AI API Key (Gemini or OpenAI/ChatGPT)</label>
                        <input type="password" id="gemini-key-input" placeholder="Paste API Key here..." style="width:100%; padding:5px; margin-top:5px; background:#333; color:#fff; border:1px solid #555;">
                        <button onclick="os.saveSettings()" style="margin-top:10px; padding:8px 15px; background:var(--accent); border:none; color:#000; font-weight:bold; cursor:pointer;">Save Settings</button>
                    </div>`;
                break;
            case 'fileexplorer':
                title = 'File Explorer';
                width = 700;
                height = 500;
                content = `
                    <div class="explorer-container">
                        <div class="explorer-toolbar">
                            <button onclick="os.navigateExplorer('${this.nextId}', '..')">⬆ Up</button>
                            <button onclick="os.navigateExplorer('${this.nextId}', '~')">🏠 Home</button>
                            <div class="explorer-path" id="path-${this.nextId}">/home/user</div>
                            <button onclick="os.explorerMkdir('${this.nextId}')">📁 New Folder</button>
                            <button onclick="os.explorerDownload('${this.nextId}')">🌐 Download URL</button>
                            <label class="explorer-toolbar-btn" style="cursor:pointer; background:rgba(255,255,255,0.1); padding:5px 10px; border-radius:4px; font-size:0.85rem;">
                                📤 Upload
                                <input type="file" style="display:none" onchange="os.explorerUpload('${this.nextId}', event)">
                            </label>
                        </div>
                        <div class="file-grid" id="grid-${this.nextId}"></div>
                    </div>
                `;
                break;
        }

        this.createWindow(title, content, width, height, appType);
    }

    createWindow(title, content, width, height, type) {
        const id = 'win_' + this.nextId++;
        const win = document.createElement('div');
        win.className = 'window';
        win.id = id;
        win.style.width = width + 'px';
        win.style.height = height + 'px';
        win.style.zIndex = ++this.zIndex;

        // Random pos
        const top = 50 + (this.nextId * 20) % 300;
        const left = 50 + (this.nextId * 20) % 500;
        win.style.top = top + 'px';
        win.style.left = left + 'px';

        win.innerHTML = `
            <div class="title-bar" onmousedown="os.startDrag(event, '${id}')">
                <h4>${title}</h4>
                <div class="window-controls">
                    <div class="control-btn min-btn"></div>
                    <div class="control-btn max-btn"></div>
                    <div class="control-btn close-btn" onclick="os.closeWindow('${id}')"></div>
                </div>
            </div>
            <div class="window-content">${content}</div>
            <div class="resize-handle" onmousedown="os.startResize(event, '${id}')"></div>
        `;

        win.onmousedown = () => this.focusWindow(id);
        this.windowArea.appendChild(win);
        this.windows[id] = win;

        // Post-render init for apps
        if (type === 'calculator') this.initCalculator(id);
        if (type === 'aibot') setTimeout(() => this.aiGreet(id), 500);
        if (type === 'fileexplorer') {
            const winNum = id.split('_')[1];
            this.renderFileExplorer(winNum, '/home/user');
        }
    }

    closeWindow(id) {
        const win = document.getElementById(id);
        if (win) {
            // Animate out?
            win.remove();
            delete this.windows[id];
        }
    }

    focusWindow(id) {
        const win = document.getElementById(id);
        if (win) {
            win.style.zIndex = ++this.zIndex;
        }
    }

    toggleHelp() {
        const overlay = document.getElementById('help-overlay');
        if (overlay) {
            overlay.classList.toggle('hidden');
        }
    }
    /* --- Window Dragging --- */
    setupDrag() {
        this.dragState = { active: false, currentWin: null, offsetX: 0, offsetY: 0 };

        document.addEventListener('mousemove', (e) => {
            if (this.dragState.active && this.dragState.currentWin) {
                const win = this.dragState.currentWin;
                win.style.top = (e.clientY - this.dragState.offsetY) + 'px';
                win.style.left = (e.clientX - this.dragState.offsetX) + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            this.dragState.active = false;
            this.dragState.currentWin = null;
        });
    }

    startDrag(e, id) {
        // Only drag if left click
        if (e.button !== 0) return;

        const win = document.getElementById(id);
        this.focusWindow(id);

        const rect = win.getBoundingClientRect();
        this.dragState.active = true;
        this.dragState.currentWin = win;
        this.dragState.offsetX = e.clientX - rect.left;
        this.dragState.offsetY = e.clientY - rect.top;
    }

    // --- Window Resizing ---
    setupResize() {
        this.resizeState = { active: false, currentWin: null, startX: 0, startY: 0, startW: 0, startH: 0 };

        document.addEventListener('mousemove', (e) => {
            if (this.resizeState.active && this.resizeState.currentWin) {
                const win = this.resizeState.currentWin;
                const newWidth = Math.max(200, this.resizeState.startW + (e.clientX - this.resizeState.startX));
                const newHeight = Math.max(150, this.resizeState.startH + (e.clientY - this.resizeState.startY));

                win.style.width = newWidth + 'px';
                win.style.height = newHeight + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            this.resizeState.active = false;
            this.resizeState.currentWin = null;
        });
    }

    startResize(e, id) {
        e.preventDefault();
        e.stopPropagation();

        const win = document.getElementById(id);
        this.focusWindow(id);

        this.resizeState.active = true;
        this.resizeState.currentWin = win;
        this.resizeState.startX = e.clientX;
        this.resizeState.startY = e.clientY;
        this.resizeState.startW = parseInt(win.style.width);
        this.resizeState.startH = parseInt(win.style.height);
    }

    /* --- App Specific Logic --- */

    // Browser
    // AI Bot
    // AI Bot
    async aiGreet(winId) {
        const win = document.getElementById(winId);
        if (!win) return;
        const history = win.querySelector('.chat-history');

        let msg = "Hello! I am YesAI.";
        const key = localStorage.getItem('gemini_key');

        if (key && key.startsWith('sk-or-')) {
            msg += " Connected to ChatGPT (via OpenRouter) 🟢.";
        } else if (key && key.length > 5) {
            msg += " Connected to Gemini Cloud ☁️.";
        } else if (navigator.onLine) {
            msg += " Connected to Pollinations AI (Free Cloud) 🌸. No key needed!";
        } else {
            msg += " I'm running offline (Local Mode).";
        }

        this.addAiMsg(history, msg);
    }

    async aiSend(input) {
        const text = input.value.trim();
        if (!text) return;

        const history = input.parentElement.previousElementSibling;
        this.addAiMsg(history, text, true);
        input.value = '';

        // Simulate thinking UI
        const thinkingId = 'thinking-' + Date.now();
        const thinkingMsg = document.createElement('div');
        thinkingMsg.className = 'chat-msg ai';
        thinkingMsg.id = thinkingId;
        thinkingMsg.innerText = '...';
        history.appendChild(thinkingMsg);
        history.scrollTop = history.scrollHeight;

        try {
            let response = "";
            let command = null;
            const apiKey = localStorage.getItem('gemini_key');

            // 1. Paid/Private Cloud (Gemini / OpenAI)
            if (apiKey && apiKey.length > 5) {
                const isOpenRouter = apiKey.startsWith('sk-or-');
                try {
                    let apiResp;
                    if (isOpenRouter) {
                        apiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                            body: JSON.stringify({
                                "model": "openai/gpt-4o-mini",
                                "messages": [{ "role": "user", "content": text }]
                            })
                        });
                        if (apiResp.ok) {
                            const data = await apiResp.json();
                            response = data.choices[0].message.content.trim();
                        }
                    } else {
                        // Gemini
                        apiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                            method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text }] }] })
                        });
                        if (!apiResp.ok) apiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                            method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text }] }] })
                        });

                        if (apiResp.ok) {
                            const data = await apiResp.json();
                            response = data.candidates[0].content.parts[0].text.trim();
                        }
                    }
                } catch (e) { console.error("Key API failed", e); }
            }

            // 2. Pollinations AI (Free Cloud - No Key)
            if (!response && navigator.onLine) {
                try {
                    const systemPrompt = "You are YesAI. If user wants to open an app (calculator, notepad, browser, terminal), reply ONLY with 'OPEN: appname'. Otherwise answer normally.";
                    const url = `https://text.pollinations.ai/${encodeURIComponent(systemPrompt + " User: " + text)}`;

                    const pollResp = await fetch(url);
                    if (pollResp.ok) {
                        response = await pollResp.text();
                    }
                } catch (e) {
                    console.warn("Pollinations failed", e);
                }
            }

            // 3. Fallback (Native or Local)
            if (!response) {
                if (window.ai) {
                    try {
                        const session = await window.ai.createTextSession();
                        response = await session.prompt(text);
                        session.destroy();
                    } catch (e) { }
                }
            }

            // 4. SimpleNLP (Offline)
            if (!response) {
                const nlp = new SimpleNLP();
                const result = nlp.process(text);
                if (result.intent === 'OPEN_APP') {
                    command = { type: 'OPEN_APP', app: result.entity };
                    response = "Opening " + result.entity + "...";
                } else {
                    response = result.answer;
                }
            }

            // Command Parsing (Generic for all providers)
            if (response && response.startsWith("OPEN:")) {
                const app = response.split(":")[1].trim().toLowerCase();
                command = { type: 'OPEN_APP', app: app };
                response = "Opening " + app + "...";
            }

            // Cleanup Thinking
            const thinkingEl = document.getElementById(thinkingId);
            if (thinkingEl) thinkingEl.remove();

            this.addAiMsg(history, response || "Error");

            // Execute Command
            if (command && command.type === 'OPEN_APP') {
                setTimeout(() => this.openApp(command.app), 500);
            }

        } catch (err) {
            const thinkingEl = document.getElementById(thinkingId);
            if (thinkingEl) thinkingEl.remove();
            this.addAiMsg(history, "Connectivity Error.");
            console.error(err);
        }
    }

    addAiMsg(historyDiv, text, isUser = false) {
        const msg = document.createElement('div');
        msg.className = `chat-msg ${isUser ? 'user' : 'ai'}`;
        msg.innerText = text;
        historyDiv.appendChild(msg);
        historyDiv.scrollTop = historyDiv.scrollHeight;
    }

    saveSettings() {
        const input = document.getElementById('gemini-key-input');
        if (input) {
            localStorage.setItem('gemini_key', input.value.trim());
            alert('Settings Saved! AI upgraded.');
        }
    }

    // --- File Explorer Logic ---

    renderFileExplorer(winNum, path) {
        console.log('renderFileExplorer called with winNum:', winNum, 'path:', path);
        path = this.vfs.resolvePath(path);
        console.log('Resolved path:', path);

        const grid = document.getElementById(`grid-${winNum}`);
        const pathDisplay = document.getElementById(`path-${winNum}`);
        console.log('Grid element:', grid, 'Path element:', pathDisplay);

        if (!grid || !pathDisplay) {
            console.error('Grid or path display not found for winNum:', winNum);
            return;
        }

        pathDisplay.innerText = path;
        const result = this.vfs.ls(path);
        console.log('VFS ls result:', result);

        if (result.error) {
            grid.innerHTML = `<div style="padding:20px; color:#ff5555;">Error: ${result.error}</div>`;
            return;
        }

        grid.innerHTML = '';

        // Add ".." if not root
        if (path !== '/') {
            this.addFileItem(grid, '..', 'dir', () => this.navigateExplorer(winNum, '..'));
        }

        result.items.forEach(name => {
            const filePath = path === '/' ? '/' + name : path + '/' + name;
            const isDir = this.vfs.isDir(filePath);
            const type = isDir ? 'dir' : 'file';
            console.log('Adding item:', name, 'path:', filePath, 'isDir:', isDir);

            this.addFileItem(grid, name, type, () => {
                console.log('Item clicked:', name, 'filePath:', filePath, 'isDir:', isDir);
                if (isDir) {
                    this.navigateExplorer(winNum, filePath);
                } else {
                    this.openFile(filePath);
                }
            });
        });
    }

    addFileItem(container, name, type, onclick) {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.onclick = onclick;

        const icon = document.createElement('div');
        icon.className = 'file-icon';
        icon.innerText = type === 'dir' ? '📁' : '📄';
        if (name.endsWith('.png') || name.endsWith('.jpg')) icon.innerText = '🖼️';
        if (name.endsWith('.mp3')) icon.innerText = '🎵';

        const label = document.createElement('div');
        label.className = 'file-name';
        label.innerText = name;

        item.appendChild(icon);
        item.appendChild(label);
        container.appendChild(item);
    }

    navigateExplorer(winNum, path) {
        console.log('navigateExplorer called with winNum:', winNum, 'path:', path);
        // We need to know the current path of this explorer window
        // For simplicity, we get it from the UI or store it in a map
        const pathDisplay = document.getElementById(`path-${winNum}`);
        const currentPath = pathDisplay ? pathDisplay.innerText : '/home/user';
        console.log('Current path from UI:', currentPath);

        // Temporarily set vfs current dir to resolve relative paths
        const oldDir = this.vfs.currentDir;
        this.vfs.currentDir = currentPath;
        const newPath = this.vfs.resolvePath(path);
        this.vfs.currentDir = oldDir;
        console.log('New path resolved to:', newPath);

        this.renderFileExplorer(winNum, newPath);
    }

    explorerMkdir(winNum) {
        const path = document.getElementById(`path-${winNum}`).innerText;
        const name = prompt('Enter folder name:');
        if (name) {
            const oldDir = this.vfs.currentDir;
            this.vfs.currentDir = path;
            this.vfs.mkdir(name);
            this.vfs.currentDir = oldDir;
            this.renderFileExplorer(winNum, path);
        }
    }

    explorerDownload(winNum) {
        const currentPath = document.getElementById(`path-${winNum}`).innerText;
        const url = prompt('Enter file URL:');
        if (!url) return;

        const name = url.substring(url.lastIndexOf('/') + 1) || 'downloaded_file';

        // Use CORS proxy for cross-origin requests
        const corsProxy = 'https://api.allorigins.win/raw?url=';
        const fetchUrl = corsProxy + encodeURIComponent(url);

        console.log('Downloading from:', url);
        console.log('Using proxy URL:', fetchUrl);

        fetch(fetchUrl)
            .then(res => {
                if (!res.ok) throw new Error('Network response was not ok');
                return res.text();
            })
            .then(content => {
                const oldDir = this.vfs.currentDir;
                this.vfs.currentDir = currentPath;
                this.vfs.writeFile(name, content);
                this.vfs.currentDir = oldDir;
                this.renderFileExplorer(winNum, currentPath);
                alert(`Downloaded ${name} successfully!`);
            })
            .catch(err => {
                console.error('Download error:', err);
                alert('Failed to download: ' + err.message);
            });
    }

    explorerUpload(winNum, event) {
        const currentPath = document.getElementById(`path-${winNum}`).innerText;
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const oldDir = this.vfs.currentDir;
            this.vfs.currentDir = currentPath;
            this.vfs.writeFile(file.name, content);
            this.vfs.currentDir = oldDir;
            this.renderFileExplorer(winNum, currentPath);
            alert(`Uploaded ${file.name} successfully!`);
        };
        reader.readAsText(file); // For simplicity, handle as text
    }

    openFile(path) {
        const ext = path.split('.').pop().toLowerCase();

        if (ext === 'html') {
            const content = this.vfs.readFile(path);
            const blob = new Blob([content], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            this.openApp('htmlviewer', url);
        }
        else if (['txt', 'js', 'css', 'json', 'md'].includes(ext)) {
            this.openFileEditor(path);
        } else {
            // Default to Notepad
            const result = this.vfs.readFile(path);
            if (!result.error) {
                this.openApp('notepad');
                // Find latest notepad window and set content
                setTimeout(() => {
                    const notepad = document.querySelector('.notepad-area');
                    if (notepad) notepad.value = result.content;
                }, 100);
            }
        }
    }


    // Browser
    browserGo(input) {
        let url = input.value.trim();
        if (!url) return;

        if (!url.startsWith('http')) {
            if (url.includes('.') && !url.includes(' ')) {
                url = 'https://' + url;
            } else {
                url = 'https://www.google.com/search?q=' + encodeURIComponent(url) + '&igu=1';
            }
        }

        input.value = url;
        const iframe = input.parentElement.nextElementSibling;
        const errorMsg = iframe.parentElement.querySelector('.iframe-error');

        // Clear previous error
        if (errorMsg) errorMsg.remove();

        // Always use public CORS proxy for static hosting compatibility
        const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
        console.log('Browser navigating to:', url, 'via proxy');

        iframe.src = proxyUrl;

        // Only show error on actual load failures
        iframe.onerror = () => {
            this.showBrowserError(iframe.parentElement, url);
        };
    }

    showBrowserError(container, url) {
        const existing = container.querySelector('.iframe-error');
        if (existing) return; // Already showing error

        const errorDiv = document.createElement('div');
        errorDiv.className = 'iframe-error';
        errorDiv.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #fff;">
                <h3>⚠️ Cannot Embed This Site</h3>
                <p>This website cannot be displayed in an iframe due to security restrictions.</p>
                <button onclick="window.open('${url}', '_blank')" style="
                    padding: 10px 20px;
                    background: var(--accent);
                    border: none;
                    border-radius: 5px;
                    color: #000;
                    font-weight: bold;
                    cursor: pointer;
                    margin-top: 15px;
                ">Open in New Tab</button>
            </div>
        `;
        container.appendChild(errorDiv);
    }

    browserBack(btn) {
        // Can't really go back in cross-origin iframe due to security
        console.log('Back button clicked (not implemented for iframes)');
    }

    // Calculator
    getCalculatorHTML() {
        return `
            <div class="calc-grid" id="calc-app">
                <div class="calc-display" id="calc-disp">0</div>
                <button class="calc-btn" onclick="os.calcIn('C')">C</button>
                <button class="calc-btn" onclick="os.calcIn('/')">/</button>
                <button class="calc-btn" onclick="os.calcIn('*')">*</button>
                <button class="calc-btn" onclick="os.calcIn('del')">←</button>
                
                <button class="calc-btn" onclick="os.calcIn('7')">7</button>
                <button class="calc-btn" onclick="os.calcIn('8')">8</button>
                <button class="calc-btn" onclick="os.calcIn('9')">9</button>
                <button class="calc-btn op" onclick="os.calcIn('-')">-</button>
                
                <button class="calc-btn" onclick="os.calcIn('4')">4</button>
                <button class="calc-btn" onclick="os.calcIn('5')">5</button>
                <button class="calc-btn" onclick="os.calcIn('6')">6</button>
                <button class="calc-btn op" onclick="os.calcIn('+')">+</button>
                
                <button class="calc-btn" onclick="os.calcIn('1')">1</button>
                <button class="calc-btn" onclick="os.calcIn('2')">2</button>
                <button class="calc-btn" onclick="os.calcIn('3')">3</button>
                <button class="calc-btn eq" style="grid-row: span 2" onclick="os.calcIn('=')">=</button>
                
                <button class="calc-btn" onclick="os.calcIn('0')" style="grid-column: span 2">0</button>
                <button class="calc-btn" onclick="os.calcIn('.')">.</button>
            </div>
        `;
    }

    initCalculator(id) {
        this.windows[id].calcValue = '';
    }

    calcIn(val) {
        // This is a global handler, need to find which window is active or find the target
        // For simplicity, we just look for the open calculator (demo limitation: assumes one calc or uses event target logic)
        // Better: Pass the window ID or local scope. 
        // Quick fix: find the calc display in the window closest to top or last clicked.
        // Actually, let's use document.activeElement but buttons steal focus. 
        // We will just find ANY calc display.
        const displays = document.querySelectorAll('.calc-display');
        if (displays.length === 0) return;
        const display = displays[displays.length - 1]; // Use last opened/rendered

        let current = display.innerText;
        if (current === '0' || current === 'Error') current = '';

        if (val === 'C') {
            display.innerText = '0';
        } else if (val === 'del') {
            display.innerText = current.slice(0, -1) || '0';
        } else if (val === '=') {
            try {
                display.innerText = eval(current); // Simple eval for calc
            } catch {
                display.innerText = 'Error';
            }
        }
    }

    // File Editor
    openFileEditor(filename) {
        const filepath = this.vfs.resolvePath(filename);

        // Read existing content or create new file
        let content = '';
        const readResult = this.vfs.readFile(filepath);
        if (!readResult.error) {
            content = readResult.content;
        } else {
            // File doesn't exist, will be created on save
            this.vfs.touch(filepath);
        }

        // Create editor modal
        const modal = document.createElement('div');
        modal.className = 'editor-modal';
        modal.innerHTML = `
            <div class="editor-container">
                <div class="editor-header">
                    <span>Editing: ${filename}</span>
                    <div>
                        <button onclick="os.saveAndCloseEditor(this, '${filepath}')">Save & Close</button>
                        <button onclick="os.closeEditor(this)">Cancel</button>
                    </div>
                </div>
                <textarea class="editor-textarea">${content}</textarea>
                <div class="editor-footer">Ctrl+S to save | ESC to cancel</div>
            </div>
        `;

        document.body.appendChild(modal);
        const textarea = modal.querySelector('.editor-textarea');
        textarea.focus();

        // Keyboard shortcuts
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeEditor(modal);
            } else if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveAndCloseEditor(modal, filepath);
            }
        });
    }

    saveAndCloseEditor(element, filepath) {
        const modal = element.closest ? element.closest('.editor-modal') : element;
        const textarea = modal.querySelector('.editor-textarea');
        const content = textarea.value;

        this.vfs.writeFile(filepath, content);
        this.closeEditor(modal);
    }

    closeEditor(element) {
        const modal = element.closest ? element.closest('.editor-modal') : element;
        modal.remove();
    }

    // Terminal
    termEnter(e) {
        if (e.key === 'Enter') {
            const input = e.target;
            const cmd = input.value;
            const output = input.parentElement.previousElementSibling;

            // Add previous line with current directory
            const historyLine = document.createElement('div');
            historyLine.className = 'term-line';
            const promptDir = this.vfs.pwd().replace('/home/user', '~');
            historyLine.innerHTML = `<span class="term-prompt">user@yesos:${promptDir}$</span> ${cmd}`;
            output.appendChild(historyLine);

            const responseLine = document.createElement('div');
            responseLine.className = 'term-line';

            this.runTermCmd(cmd, responseLine);
            output.appendChild(responseLine);

            input.value = '';
            // Auto scroll
            input.parentElement.parentElement.scrollTop = input.parentElement.parentElement.scrollHeight;
        }
    }

    runTermCmd(cmd, el) {
        const parts = cmd.trim().split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        // Help
        if (command === 'help') {
            el.innerText = `Available commands:
File Operations: ls, cd, pwd, mkdir, touch, rm, cp, mv, cat, nano, vim
Text Processing: echo, grep, head, tail, wc
System Info: whoami, uname, date, uptime, ps, top, df, free
Network: ping, curl, wget
Utilities: clear, history, export`;
            return;
        }

        // Clear
        if (command === 'clear' || command === 'cls') {
            el.parentElement.innerHTML = '';
            el.innerText = '';
            return;
        }

        // File System Commands
        if (command === 'ls' || command === 'dir') {
            const showAll = args.includes('-a') || args.includes('-la') || args.includes('-al');
            const longFormat = args.includes('-l') || args.includes('-la') || args.includes('-al');
            const path = args.find(a => !a.startsWith('-')) || '.';

            const result = this.vfs.ls(path, showAll);
            if (result.error) {
                el.innerText = result.error;
            } else {
                if (longFormat) {
                    el.innerText = result.items.map(i => {
                        const fullPath = this.vfs.resolvePath(path + '/' + i);
                        const isDir = this.vfs.isDir(fullPath);
                        return `${isDir ? 'd' : '-'}rw-r--r-- 1 user user 0 Jan 1 00:00 ${i}`;
                    }).join('\n') || 'total 0';
                } else {
                    el.innerText = result.items.join('  ') || '';
                }
            }
            return;
        }

        if (command === 'cd') {
            const path = args[0] || '~';
            const result = this.vfs.cd(path);
            el.innerText = result.error || '';
            return;
        }

        if (command === 'pwd') {
            el.innerText = this.vfs.pwd();
            return;
        }

        if (command === 'mkdir') {
            if (!args[0]) {
                el.innerText = 'mkdir: missing operand';
                return;
            }
            const result = this.vfs.mkdir(args[0]);
            el.innerText = result.error || '';
            return;
        }

        if (command === 'touch') {
            if (!args[0]) {
                el.innerText = 'touch: missing file operand';
                return;
            }
            const result = this.vfs.touch(args[0]);
            el.innerText = result.error || '';
            return;
        }

        if (command === 'rm') {
            if (!args[0]) {
                el.innerText = 'rm: missing operand';
                return;
            }
            const recursive = args.includes('-r') || args.includes('-rf');
            const file = args.find(a => !a.startsWith('-'));
            const result = this.vfs.rm(file, recursive);
            el.innerText = result.error || '';
            return;
        }

        if (command === 'cp') {
            if (args.length < 2) {
                el.innerText = 'cp: missing file operand';
                return;
            }
            const result = this.vfs.cp(args[0], args[1]);
            el.innerText = result.error || '';
            return;
        }

        if (command === 'mv') {
            if (args.length < 2) {
                el.innerText = 'mv: missing file operand';
                return;
            }
            const result = this.vfs.mv(args[0], args[1]);
            el.innerText = result.error || '';
            return;
        }

        if (command === 'cat') {
            if (!args[0]) {
                el.innerText = 'cat: missing file operand';
                return;
            }
            const result = this.vfs.readFile(args[0]);
            el.innerText = result.error || result.content || '';
            return;
        }

        if (command === 'nano' || command === 'vim' || command === 'vi') {
            if (!args[0]) {
                el.innerText = `${command}: missing file operand`;
                return;
            }
            this.openFileEditor(args[0]);
            el.innerText = '';
            return;
        }

        // Echo with redirection
        if (command === 'echo') {
            const fullCmd = cmd.trim();
            if (fullCmd.includes('>')) {
                const [echopart, filepart] = fullCmd.split('>').map(s => s.trim());
                const text = echopart.substring(5).replace(/^["']|["']$/g, ''); // Remove quotes
                const append = fullCmd.includes('>>');
                const filename = filepart.replace('>', '').trim();
                const result = this.vfs.writeFile(filename, text + '\n', append);
                el.innerText = result.error || '';
            } else {
                el.innerText = args.join(' ');
            }
            return;
        }

        // Text Processing
        if (command === 'grep') {
            if (args.length < 2) {
                el.innerText = 'grep: missing pattern or file';
                return;
            }
            const pattern = args[0];
            const file = args[1];
            const result = this.vfs.readFile(file);
            if (result.error) {
                el.innerText = result.error;
            } else {
                const lines = result.content.split('\n').filter(l => l.includes(pattern));
                el.innerText = lines.join('\n') || `grep: no matches found`;
            }
            return;
        }

        if (command === 'wc') {
            if (!args[0]) {
                el.innerText = 'wc: missing file operand';
                return;
            }
            const result = this.vfs.readFile(args[0]);
            if (result.error) {
                el.innerText = result.error;
            } else {
                const lines = result.content.split('\n').length;
                const words = result.content.split(/\s+/).filter(w => w).length;
                const chars = result.content.length;
                el.innerText = `  ${lines}  ${words}  ${chars} ${args[0]}`;
            }
            return;
        }

        if (command === 'head' || command === 'tail') {
            if (!args[0]) {
                el.innerText = `${command}: missing file operand`;
                return;
            }
            const result = this.vfs.readFile(args[0]);
            if (result.error) {
                el.innerText = result.error;
            } else {
                const lines = result.content.split('\n');
                const output = command === 'head' ? lines.slice(0, 10) : lines.slice(-10);
                el.innerText = output.join('\n');
            }
            return;
        }

        // System Info
        if (command === 'whoami') {
            el.innerText = 'user';
            return;
        }

        if (command === 'uname') {
            if (args.includes('-a')) {
                el.innerText = 'YesOS 1.0.0 Linux x86_64 GNU/Linux';
            } else {
                el.innerText = 'YesOS';
            }
            return;
        }

        if (command === 'date') {
            el.innerText = new Date().toString();
            return;
        }

        if (command === 'uptime') {
            el.innerText = 'up 42 days, 13:37, 1 user, load average: 0.00, 0.01, 0.05';
            return;
        }

        if (command === 'ps') {
            el.innerText = `  PID TTY          TIME CMD
    1 pts/0    00:00:00 bash
   42 pts/0    00:00:00 yesos
  420 pts/0    00:00:00 ps`;
            return;
        }

        if (command === 'top') {
            el.innerText = `top - simulated
Tasks: 3 total, 1 running
%Cpu(s): 0.3 us, 0.1 sy
MiB Mem: 8192 total, 2048 free
  PID USER      PR  NI    VIRT    RES  %CPU  %MEM COMMAND
    1 user      20   0   12345   1234   0.1   0.1 yesos`;
            return;
        }

        if (command === 'df') {
            el.innerText = `Filesystem     1K-blocks    Used Available Use% Mounted on
/dev/vfs        10485760 1048576   9437184  10% /`;
            return;
        }

        if (command === 'free') {
            el.innerText = `              total        used        free
Mem:        8388608     2097152     6291456
Swap:             0           0           0`;
            return;
        }

        // Network
        if (command === 'ping') {
            const host = args[0] || 'localhost';
            el.innerText = `PING ${host} (127.0.0.1): 56 data bytes
64 bytes from 127.0.0.1: icmp_seq=0 ttl=64 time=0.1 ms
64 bytes from 127.0.0.1: icmp_seq=1 ttl=64 time=0.1 ms`;
            return;
        }

        if (command === 'curl' || command === 'wget') {
            if (!args[0]) {
                el.innerText = `${command}: missing URL`;
                return;
            }
            el.innerText = `${command}: simulated download (use File Explorer for real downloads)`;
            return;
        }

        // Utilities
        if (command === 'history') {
            el.innerText = 'history: command history not implemented yet';
            return;
        }

        if (command === 'export') {
            el.innerText = args.length ? '' : 'export: environment variables not implemented';
            return;
        }

        // Empty command
        if (command === '') {
            return;
        }

        // Unknown command
        el.innerText = `bash: ${command}: command not found`;
    }
}

// Simple Logic Engine (Fallback)
// Enhanced Logic Engine (Local / No Key)
class SimpleNLP {
    constructor() {
        this.common = {
            greetings: ["Hello there!", "Hi! How can I help?", "Greetings, user.", "Ready to work."],
            jokes: [
                "Why do programmers prefer dark mode? Because light attracts bugs.",
                "I would tell you a UDP joke, but you might not get it.",
                "How many programmers does it take to change a light bulb? None, that's a hardware problem.",
                "Knock, knock. Who's there? Ascii. Ascii who? Ascii stupid question, get a stupid answer."
            ],
            facts: [
                "The first computer bug was an actual moth.",
                "JavaScript was created in just 10 days.",
                "The Apollo 11 guidance computer had less processing power than a modern toaster.",
                "There are 10 types of people in the world: those who understand binary, and those who don't."
            ],
            unknown: [
                "I'm not sure about that. Try 'open calculator' or 'what is 2 + 2'.",
                "I'm running in offline mode. I can open apps or do math!",
                "Command not recognized. Try 'launch browser' or 'tell me a joke'."
            ]
        };
    }

    process(text) {
        const t = text.toLowerCase().trim();

        // 1. Math solving (Regex for basic arithmetic)
        // Matches "what is 5 + 5", "calc 10 * 10", "20 / 4"
        const mathMatch = t.match(/([\d\.]+)\s*([\+\-\*\/])\s*([\d\.]+)/);
        if (mathMatch || t.startsWith("calc ") || t.startsWith("math ")) {
            try {
                // Safe extraction of math part
                const cleanMath = t.replace(/[^\d\+\-\*\/\.\(\)]/g, '');
                if (cleanMath.length > 2) {
                    // Very basic safety check before eval
                    const result = eval(cleanMath);
                    return { intent: 'MATH', answer: `The answer is ${result}.` };
                }
            } catch (e) {
                return { intent: 'MATH', answer: "I couldn't calculate that. Try '5 * 5'." };
            }
        }

        // 2. App Opening Logic (Expanded key words)
        const apps = {
            'calculator': ['calc', 'math', 'numbers', 'add', 'multiply', 'calculator'],
            'notepad': ['note', 'write', 'text', 'editor', 'jot', 'notepad'],
            'terminal': ['term', 'console', 'command', 'cmd', 'shell', 'bash', 'terminal'],
            'browser': ['web', 'internet', 'surf', 'google', 'site', 'browser', 'chrome'],
            'settings': ['config', 'setup', 'options', 'setting', 'preferences', 'key', 'change'],
            'aibot': ['ai', 'bot', 'chat', 'assistant', 'help']
        };

        for (const [app, keywords] of Object.entries(apps)) {
            // Direct checks
            if (t === app || t === "open " + app) return { intent: 'OPEN_APP', entity: app };

            for (const k of keywords) {
                // "run calc", "launch browser", "i want to write"
                if (t.includes(k) && (t.includes('open') || t.includes('launch') || t.includes('run') || t.includes('start') || t.includes('use') || t.includes('go to'))) {
                    return { intent: 'OPEN_APP', entity: app };
                }
            }
        }

        // 3. Conversational Logic
        if (t.includes('time') || t.includes('clock')) return { intent: 'TIME', answer: "It's " + new Date().toLocaleTimeString() };
        if (t.includes('date') || t.includes('day')) return { intent: 'DATE', answer: "Today is " + new Date().toLocaleDateString() };

        if (t.includes('joke')) return { intent: 'JOKE', answer: this.pickRandom(this.common.jokes) };
        if (t.includes('fact')) return { intent: 'FACT', answer: this.pickRandom(this.common.facts) };

        if (t.includes('hello') || t.includes('hi ') || t === 'hi' || t.includes('hey')) return { intent: 'GREET', answer: this.pickRandom(this.common.greetings) };

        if (t.includes('who are you') || t.includes('what are you')) return { intent: 'INFO', answer: "I am YesAI (Local Edition). I can control the OS and do math without any API keys!" };
        if (t.includes('thank')) return { intent: 'POLITE', answer: "You're welcome!" };

        // 4. Fallback
        return { intent: 'UNKNOWN', answer: this.pickRandom(this.common.unknown) };
    }

    pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
}

const os = new OS();

// Show help on first load
setTimeout(() => {
    os.toggleHelp();
}, 800);


