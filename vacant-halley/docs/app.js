class OS {
    constructor() {
        this.desktop = document.getElementById('desktop');
        this.windowArea = document.getElementById('window-area');
        this.windows = {};
        this.zIndex = 100;
        this.nextId = 1;

        this.startClock();
        this.setupDrag();
    }

    startClock() {
        setInterval(() => {
            document.getElementById('clock').innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }, 1000);
    }

    /* --- Window Management --- */

    openApp(appType) {
        let content = '';
        let title = '';
        let width = 400;
        let height = 300;

        switch (appType) {
            case 'notepad':
                title = 'Notepad';
                content = `<textarea class="notepad-area" placeholder="Type here..."></textarea>`;
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
                content = `
                    <div class="browser-chrome">
                        <button onclick="os.browserBack(this)">⬅</button>
                        <input type="text" class="url-bar" value="https://www.wikipedia.org" onkeydown="if(event.key==='Enter') os.browserGo(this)">
                    </div>
                    <iframe src="https://www.wikipedia.org" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
                `;
                break;
            case 'terminal':
                title = 'Terminal';
                width = 600;
                height = 400;
                content = `
                    <div class="terminal-window" onclick="this.querySelector('input').focus()">
                        <div class="term-output">
                            <div class="term-line">YesOS [Version 1.0.0]</div>
                            <div class="term-line">(c) Yes Browser. All rights reserved.</div>
                            <br>
                        </div>
                        <div class="term-input-line">
                            <span class="term-prompt">C:\\Users\\Guest></span>
                            <input class="term-input" type="text" onkeydown="os.termEnter(event)">
                        </div>
                    </div>
                `;
                break;
            case 'settings':
                title = 'Settings';
                content = `<div style="padding:20px;"><h3>Settings</h3><p>Background: Default</p><p>Theme: Dark</p></div>`;
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
        `;

        win.onmousedown = () => this.focusWindow(id);
        this.windowArea.appendChild(win);
        this.windows[id] = win;

        // Post-render init for apps
        if (type === 'calculator') this.initCalculator(id);
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
        if (win) win.style.zIndex = ++this.zIndex;
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

    /* --- App Specific Logic --- */

    // Browser
    browserGo(input) {
        let url = input.value;
        if (!url.startsWith('http')) url = 'https://' + url;
        // Simple search check
        if (!url.includes('.')) url = 'https://www.google.com/search?q=' + encodeURIComponent(input.value);

        input.value = url;
        const iframe = input.parentElement.nextElementSibling;
        iframe.src = url;
    }
    browserBack(btn) {
        // Can't really go back in cross-origin iframe due to security, but implementation placeholder
        console.log('Back');
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
        } else {
            display.innerText = current + val;
        }
    }

    // Terminal
    termEnter(e) {
        if (e.key === 'Enter') {
            const input = e.target;
            const cmd = input.value;
            const output = input.parentElement.previousElementSibling;

            // Add previous line
            const historyLine = document.createElement('div');
            historyLine.className = 'term-line';
            historyLine.innerHTML = `<span class="term-prompt">C:\\Users\\Guest></span> ${cmd}`;
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
        const c = cmd.trim().toLowerCase();
        if (c === 'help') {
            el.innerText = 'Available commands: help, clear, ping, echo, date';
        } else if (c === 'clear') {
            el.parentElement.innerHTML = '';
            el.innerText = ''; // Clear the response line itself effectively
        } else if (c === 'date') {
            el.innerText = new Date().toString();
        } else if (c.startsWith('echo ')) {
            el.innerText = cmd.substring(5);
        } else if (c === 'ping') {
            el.innerText = 'Pinging localhost... PONG! (1ms)';
        } else if (c === '') {
            // Do nothing
        } else {
            el.innerText = `'${c}' is not recognized as an internal or external command.`;
        }
    }
}

const os = new OS();
