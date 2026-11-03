/**
 * ViliCom - Desktop Serial & Log Studio
 * Frontend Application Controller
 * Handles Tauri v2 IPC, Serial Connection, Terminal UI, Search, Filter, Multi-Color Highlighting, and AT Presets.
 */

// =============================================================================
// 1. DOM References & Global State
// =============================================================================
const portSelect = document.getElementById('port');
const baudInput = document.getElementById('baud');
const flowSelect = document.getElementById('flow');
const btnConnect = document.getElementById('btn-connect');
const terminal = document.getElementById('terminal');
const autoscroll = document.getElementById('autoscroll');
const sendInput = document.getElementById('send-input');
const btnRecord = document.getElementById('btn-record');
const recText = document.getElementById('rec-btn-text');
const recInfo = document.getElementById('rec-info');

let isConnected = false;
let isRecording = false;
let userScrolledUp = false;
let sendTimer = null;
let currentLogDir = "~/serial_logs/";

// =============================================================================
// 2. Tauri IPC Helpers & Matcher Utility
// =============================================================================
function getTauriInvoke() {
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
        return window.__TAURI__.core.invoke;
    }
    return null;
}

function getTauriListen() {
    if (window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.listen) {
        return window.__TAURI__.event.listen;
    }
    return null;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function parseBaudRate(val) {
    if (!val) return 1000000;
    let s = val.toString().trim().toUpperCase();
    if (s.endsWith('M')) {
        return Math.round(parseFloat(s) * 1000000);
    }
    if (s.endsWith('K')) {
        return Math.round(parseFloat(s) * 1000);
    }
    return parseInt(s, 10) || 1000000;
}

/**
 * 智能通配符与正则表达式构造器
 * 支持：普通子串、通配符 (* 任意多个字符, ? 单个字符)、全正则表达式 (/pattern/flags 或开启 wildcard/regex 模式)
 */
function createMatcher(pattern, enableWildcardOrRegex = false, caseSensitive = false) {
    if (!pattern) return null;
    const flags = caseSensitive ? 'g' : 'gi';

    // 1. 如果用户手动输入了标准 JS 正则表达式语法：/regex/flags
    if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
        const lastSlash = pattern.lastIndexOf('/');
        const expr = pattern.slice(1, lastSlash);
        const f = pattern.slice(lastSlash + 1) || (caseSensitive ? '' : 'i');
        try {
            return new RegExp(expr, f.includes('g') ? f : f + 'g');
        } catch (e) {
            // fallback to literal
        }
    }

    // 2. 如果启用了通配符或正则表达式模式
    if (enableWildcardOrRegex) {
        try {
            // 转义普通正则元字符，但保留 * 和 ? 并转换为正则通配
            const wildcardRegexStr = pattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');
            return new RegExp(wildcardRegexStr, flags);
        } catch (e) {
            // fallback
        }
    }

    // 3. 默认安全字面量全匹配
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, flags);
}

// =============================================================================
// 3. Serial Port Management (Scan, Open, Close)
// =============================================================================
async function refreshPorts() {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    try {
        const ports = await invoke('list_ports');
        const prev = portSelect.value;
        portSelect.innerHTML = '';
        if (ports && ports.length > 0) {
            ports.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.textContent = `${p.name} (${p.port_type})`;
                portSelect.appendChild(opt);
            });
            if (prev && [...portSelect.options].some(o => o.value === prev)) {
                portSelect.value = prev;
            } else {
                // 优先选择用户接入的真实 USB 串口设备
                const usbIdx = ports.findIndex(p => p.name.includes('ttyUSB') || p.name.includes('ttyACM') || p.name.includes('COM'));
                portSelect.selectedIndex = usbIdx >= 0 ? usbIdx : 0;
            }
        } else {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '未检测到可用串口 (点击刷新)';
            portSelect.appendChild(opt);
        }
    } catch (err) {
        console.error('Failed to list ports:', err);
    }
}

portSelect.addEventListener('focus', refreshPorts);
portSelect.addEventListener('click', () => {
    if (portSelect.options.length <= 1) refreshPorts();
});

btnConnect.addEventListener('click', async () => {
    const invoke = getTauriInvoke();
    if (!invoke) {
        alert('Tauri IPC 核心未就绪');
        return;
    }

    if (!isConnected) {
        const portName = portSelect.value;
        if (!portName) {
            alert('请先选择有效的串口！');
            return;
        }
        const baudRate = parseBaudRate(baudInput.value);
        const flowControl = flowSelect.value;

        try {
            await invoke('open_port', {
                port: portName,
                baudRate: baudRate,
                flowControl: flowControl,
                dataBits: 8,
                stopBits: 1,
                parity: 'none'
            });
            isConnected = true;
            btnConnect.textContent = '关闭串口';
            btnConnect.style.background = 'var(--accent-danger)';
            btnConnect.style.borderColor = 'var(--accent-danger)';
            logSystemMessage(`[PORT] 已成功打开串口: ${portName}，波特率: ${baudRate}，流控: ${flowControl}`);
        } catch (err) {
            alert(`打开串口失败: ${err}`);
            logSystemMessage(`[ERROR] 打开串口失败: ${err}`, 'log-warn');
        }
    } else {
        try {
            await invoke('close_port');
            isConnected = false;
            btnConnect.textContent = '打开串口';
            btnConnect.style.background = '';
            btnConnect.style.borderColor = '';
            logSystemMessage(`[PORT] 串口已正常关闭`);
        } catch (err) {
            logSystemMessage(`[ERROR] 关闭串口异常: ${err}`, 'log-warn');
        }
    }
});

// =============================================================================
// 4. Data Transmission (ASCII / HEX & Timer)
// =============================================================================
async function doSend() {
    const val = sendInput.value;
    if (!val) return;
    const isHex = document.getElementById('hex-send').checked;
    const lineEnding = document.getElementById('line-ending').value;
    const time = new Date().toTimeString().split(' ')[0];

    const fullText = `[${time}] TX ➡ [${isHex ? 'HEX' : 'ASCII'}]: ${val}`;
    appendLogLine(fullText, true);

    if (!isConnected) {
        logSystemMessage(`[HINT] 串口未连接，数据未发送`, 'log-warn');
        return;
    }

    const invoke = getTauriInvoke();
    if (invoke) {
        try {
            await invoke('send_data', {
                content: val,
                isHex: isHex,
                lineEnding: lineEnding
            });
        } catch (err) {
            logSystemMessage(`[TX ERROR] 发送失败: ${err}`, 'log-warn');
        }
    }
}

sendInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSend();
});

function toggleTimerSend() {
    const chk = document.getElementById('timer-send');
    const badge = document.getElementById('timer-badge');
    const interval = parseInt(document.getElementById('timer-interval').value) || 1000;

    if (chk.checked) {
        badge.style.display = 'inline-block';
        sendTimer = setInterval(() => {
            if (!sendInput.value) sendInput.value = "AT";
            doSend();
        }, interval);
    } else {
        badge.style.display = 'none';
        clearInterval(sendTimer);
    }
}

// =============================================================================
// 5. Moserial Log Record Engine
// =============================================================================
btnRecord.onclick = async () => {
    const invoke = getTauriInvoke();
    if (!invoke) return;

    if (!isRecording) {
        const namingRule = document.getElementById('log-naming').value;
        let customFilename = null;
        if (namingRule === 'custom') {
            customFilename = prompt('请输入本次录制的文件名 (例如 test_run.log):', 'session.log');
            if (customFilename === null) return;
        }

        const config = {
            dir_path: document.getElementById('log-dir').value || currentLogDir,
            naming_rule: namingRule,
            custom_filename: customFilename,
            log_rx: document.getElementById('log-rx').checked,
            log_tx: document.getElementById('log-tx').checked,
            log_timestamp: document.getElementById('log-timestamp').checked,
            log_clean_ansi: document.getElementById('log-clean-ansi').checked,
        };

        try {
            const filePath = await invoke('start_record', { config });
            isRecording = true;
            btnRecord.classList.add('recording');
            recText.innerText = "停止录制";
            logSystemMessage(`[RECORD] 开始后台落盘录制: ${filePath}`);
        } catch (err) {
            alert(`启动录制失败: ${err}`);
            logSystemMessage(`[RECORD ERROR] 启动录制失败: ${err}`, 'log-warn');
        }
    } else {
        try {
            const summary = await invoke('stop_record');
            isRecording = false;
            btnRecord.classList.remove('recording');
            recText.innerText = "开始录制 (Record)";
            const kb = (summary.bytes_written / 1024).toFixed(1);
            recInfo.innerText = `录制完成: ${summary.file_path} (${summary.duration_secs}s, ${kb} KB)`;
            logSystemMessage(`[RECORD] 录制完成，文件已完整落盘: ${summary.file_path} (${kb} KB)`);
        } catch (err) {
            logSystemMessage(`[RECORD ERROR] 停止录制失败: ${err}`, 'log-warn');
        }
    }
};

async function browseLogDir() {
    const invoke = getTauriInvoke();
    if (invoke) {
        try {
            const selected = await invoke('select_directory');
            if (selected) {
                document.getElementById('log-dir').value = selected;
            }
        } catch (err) {
            console.error('选择目录失败:', err);
        }
    }
}

function openLogConfigModal() { document.getElementById('log-config-modal').style.display = 'flex'; }
function closeLogConfigModal() { document.getElementById('log-config-modal').style.display = 'none'; }

function saveLogConfig() {
    currentLogDir = document.getElementById('log-dir').value;
    if (!currentLogDir.endsWith('/') && !currentLogDir.endsWith('\\')) currentLogDir += '/';
    recInfo.innerText = `就绪: ${currentLogDir}`;

    const savedConfig = {
        dir: currentLogDir,
        naming: document.getElementById('log-naming').value,
        rx: document.getElementById('log-rx').checked,
        tx: document.getElementById('log-tx').checked,
        ts: document.getElementById('log-timestamp').checked,
        ansi: document.getElementById('log-clean-ansi').checked,
    };
    localStorage.setItem('vilicom_log_config', JSON.stringify(savedConfig));
    closeLogConfigModal();
}

function loadLogConfig() {
    try {
        const saved = JSON.parse(localStorage.getItem('vilicom_log_config') || '{}');
        if (saved.dir) {
            currentLogDir = saved.dir;
            document.getElementById('log-dir').value = saved.dir;
            recInfo.innerText = `就绪: ${saved.dir}`;
        }
        if (saved.naming) document.getElementById('log-naming').value = saved.naming;
        if (saved.rx !== undefined) document.getElementById('log-rx').checked = saved.rx;
        if (saved.tx !== undefined) document.getElementById('log-tx').checked = saved.tx;
        if (saved.ts !== undefined) document.getElementById('log-timestamp').checked = saved.ts;
        if (saved.ansi !== undefined) document.getElementById('log-clean-ansi').checked = saved.ansi;
    } catch (e) {}
}

// =============================================================================
// 6. 10 AT Command Presets & Persistence
// =============================================================================
const defaultAtPresets = [
    { name: "测试 AT", cmd: "AT" },
    { name: "模块软复位", cmd: "AT+RST" },
    { name: "查固件版本", cmd: "AT+GMR" },
    { name: "设为 STA 模式", cmd: "AT+CWMODE=1" },
    { name: "扫描周边 WiFi", cmd: "AT+CWLAP" },
    { name: "查看当前 IP", cmd: "AT+CIFSR" },
    { name: "查询连接状态", cmd: "AT+CIPSTATUS" },
    { name: "进入透传模式", cmd: "AT+CIPMODE=1" },
    { name: "深度休眠 5000ms", cmd: "AT+GSLP=5000" },
    { name: "恢复出厂设置", cmd: "AT+RESTORE" },
];

let atPresets = defaultAtPresets;
try {
    const saved = localStorage.getItem('vilicom_at_presets');
    if (saved) atPresets = JSON.parse(saved);
} catch (e) {}

function saveAtPresets() {
    localStorage.setItem('vilicom_at_presets', JSON.stringify(atPresets));
}

function renderAtList() {
    const container = document.getElementById('at-container');
    container.innerHTML = '';
    atPresets.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'at-item';
        row.innerHTML = `
            <span class="at-index">${idx+1}</span>
            <button class="at-btn-send" onclick="sendCustomCmd('${escapeHtml(item.cmd)}')" title="点击发送: ${escapeHtml(item.cmd)}">
                <b>${escapeHtml(item.name)}</b> <span style="opacity: 0.5; font-size: 11px;">(${escapeHtml(item.cmd)})</span>
            </button>
            <button class="at-edit-btn" onclick="editAtCmd(${idx})" title="编辑指令">✏️</button>
        `;
        container.appendChild(row);
    });
}

function editAtCmd(idx) {
    const cur = atPresets[idx];
    const newName = prompt(`编辑按键 [${idx+1}] 标题:`, cur.name);
    if (newName === null) return;
    const newCmd = prompt(`编辑按键 [${idx+1}] 发送指令:`, cur.cmd);
    if (newCmd === null) return;
    atPresets[idx] = { name: newName || `指令 ${idx+1}`, cmd: newCmd };
    saveAtPresets();
    renderAtList();
}

function sendCustomCmd(cmd) {
    sendInput.value = cmd;
    doSend();
}

function toggleAtSidebar() {
    document.getElementById('at-sidebar').classList.toggle('collapsed');
}

// =============================================================================
// 7. Multi-Color Keyword Highlighting Engine (多色关键词高亮引擎)
// =============================================================================
const defaultHighlightRules = [
    { id: '1', keyword: 'ERROR', color: '#f38ba8', textColor: '#11111b' },
    { id: '2', keyword: 'WARN', color: '#f9e2af', textColor: '#11111b' },
    { id: '3', keyword: 'BOOT', color: '#fab387', textColor: '#11111b' },
    { id: '4', keyword: 'INIT', color: '#89b4fa', textColor: '#11111b' },
    { id: '5', keyword: 'RECORD', color: '#a6e3a1', textColor: '#11111b' },
];

let highlightRules = defaultHighlightRules;
try {
    const saved = localStorage.getItem('vilicom_highlights');
    if (saved) highlightRules = JSON.parse(saved);
} catch (e) {}

let selectedHlColor = '#f38ba8';

function getContrastTextColor(hexColor) {
    if (!hexColor || !hexColor.startsWith('#')) return '#11111b';
    const c = hexColor.replace('#', '');
    const r = parseInt(c.substr(0, 2), 16) || 0;
    const g = parseInt(c.substr(2, 2), 16) || 0;
    const b = parseInt(c.substr(4, 2), 16) || 0;
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 140) ? '#11111b' : '#ffffff';
}

function selectHlColor(el) {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
    el.classList.add('selected');
    selectedHlColor = el.dataset.color;
    const picker = document.getElementById('hl-custom-color');
    if (picker) picker.value = selectedHlColor;
}

function onCustomColorChange(color) {
    selectedHlColor = color;
    document.querySelectorAll('.color-dot').forEach(d => {
        d.classList.toggle('selected', d.dataset.color.toLowerCase() === color.toLowerCase());
    });
}

function addHighlightRule() {
    const input = document.getElementById('hl-input');
    const keyword = input.value.trim();
    if (!keyword) return;

    if (highlightRules.some(r => r.keyword.toLowerCase() === keyword.toLowerCase())) {
        input.value = '';
        return;
    }

    const newRule = {
        id: Date.now().toString(),
        keyword: keyword,
        color: selectedHlColor,
        textColor: getContrastTextColor(selectedHlColor)
    };

    highlightRules.push(newRule);
    saveHighlightRules();
    renderHighlightChips();
    reapplyAllHighlights();
    input.value = '';
}

document.getElementById('hl-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addHighlightRule();
    }
});

function deleteHighlightRule(id) {
    highlightRules = highlightRules.filter(r => r.id !== id);
    saveHighlightRules();
    renderHighlightChips();
    reapplyAllHighlights();
}

function saveHighlightRules() {
    localStorage.setItem('vilicom_highlights', JSON.stringify(highlightRules));
}

function renderHighlightChips() {
    const container = document.getElementById('hl-tags-list');
    if (!container) return;
    container.innerHTML = '';
    highlightRules.forEach(rule => {
        const chip = document.createElement('span');
        chip.className = 'hl-chip';
        chip.style.backgroundColor = rule.color;
        chip.style.color = rule.textColor;
        chip.innerHTML = `
            <span>${escapeHtml(rule.keyword)}</span>
            <button class="hl-chip-del" onclick="deleteHighlightRule('${rule.id}')" title="删除此高亮规则">✕</button>
        `;
        container.appendChild(chip);
    });
}

function formatHighlightedHtml(rawText) {
    let escaped = escapeHtml(rawText);
    
    // 遍历所有高亮规则进行着色替换
    highlightRules.forEach(rule => {
        if (!rule.keyword) return;
        const matcher = createMatcher(rule.keyword, false, false);
        if (matcher) {
            escaped = escaped.replace(matcher, (match) => {
                return `<mark class="term-hl" style="background-color:${rule.color}; color:${rule.textColor};">${match}</mark>`;
            });
        }
    });

    return escaped;
}

function reapplyAllHighlights() {
    terminal.querySelectorAll('.term-line').forEach(line => {
        const raw = line.dataset.raw !== undefined ? line.dataset.raw : line.textContent;
        line.innerHTML = formatHighlightedHtml(raw);
    });
    if (isSearchActive) {
        performSearch(false);
    }
}

// =============================================================================
// 8. Log Filtering Engine (Include / Exclude with Wildcards)
// =============================================================================
let filterWildcardEnabled = true;

function toggleFilterPanel() {
    const panel = document.getElementById('term-filter-panel');
    const btn = document.getElementById('btn-toggle-filter');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (btn) btn.classList.toggle('active', !panel.classList.contains('hidden'));
}

function toggleFilterWildcard() {
    filterWildcardEnabled = !filterWildcardEnabled;
    const btn = document.getElementById('filter-wildcard-btn');
    if (btn) btn.classList.toggle('active', filterWildcardEnabled);
    applyFilter();
}

function checkLineMatchesFilter(rawText) {
    const input = document.getElementById('filter-input');
    if (!input || !input.value.trim()) return true;

    const filterText = input.value.trim();
    const mode = document.getElementById('filter-mode').value;
    const matcher = createMatcher(filterText, filterWildcardEnabled, false);
    if (!matcher) return true;

    const matched = matcher.test(rawText);
    return mode === 'include' ? matched : !matched;
}

function applyFilter() {
    const lines = terminal.querySelectorAll('.term-line');
    let visibleCount = 0;
    const input = document.getElementById('filter-input');
    const filterActive = input && input.value.trim().length > 0;

    lines.forEach(line => {
        const raw = line.dataset.raw !== undefined ? line.dataset.raw : line.textContent;
        const visible = checkLineMatchesFilter(raw);
        line.style.display = visible ? '' : 'none';
        if (visible) visibleCount++;
    });

    const stat = document.getElementById('filter-stat');
    if (stat) {
        if (!filterActive) {
            stat.textContent = `全部显示 (${lines.length} 行)`;
        } else {
            stat.textContent = `已过滤: 显示 ${visibleCount}/${lines.length} 行`;
        }
    }

    if (isSearchActive) {
        performSearch(true);
    }
}

function clearFilter() {
    const input = document.getElementById('filter-input');
    if (input) input.value = '';
    applyFilter();
}

// =============================================================================
// 9. Search Engine (Wildcards, Regex, Case-Sensitivity & Navigation)
// =============================================================================
let isSearchActive = false;
let searchWildcardEnabled = true;
let searchCaseSensitive = false;
let searchMatches = [];
let currentMatchIndex = -1;

function toggleSearchBar() {
    const bar = document.getElementById('term-search-bar');
    const btn = document.getElementById('btn-toggle-search');
    if (!bar) return;
    const isHidden = bar.classList.contains('hidden');
    if (isHidden) {
        bar.classList.remove('hidden');
        if (btn) btn.classList.add('active');
        isSearchActive = true;
        const input = document.getElementById('search-input');
        if (input) {
            input.focus();
            input.select();
            if (input.value) performSearch(true);
        }
    } else {
        closeSearchBar();
    }
}

function closeSearchBar() {
    const bar = document.getElementById('term-search-bar');
    const btn = document.getElementById('btn-toggle-search');
    if (bar) bar.classList.add('hidden');
    if (btn) btn.classList.remove('active');
    isSearchActive = false;
    clearSearchHighlights();
}

function toggleSearchWildcard() {
    searchWildcardEnabled = !searchWildcardEnabled;
    const btn = document.getElementById('search-wildcard-btn');
    if (btn) btn.classList.toggle('active', searchWildcardEnabled);
    performSearch(true);
}

function toggleSearchCase() {
    searchCaseSensitive = !searchCaseSensitive;
    const btn = document.getElementById('search-case-btn');
    if (btn) btn.classList.toggle('active', searchCaseSensitive);
    performSearch(true);
}

function clearSearchHighlights() {
    terminal.querySelectorAll('.search-match').forEach(mark => {
        const parent = mark.parentNode;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
    });
    searchMatches = [];
    currentMatchIndex = -1;
    const countEl = document.getElementById('search-count');
    if (countEl) countEl.textContent = '0/0';
}

function performSearch(resetIndex = true) {
    clearSearchHighlights();
    const input = document.getElementById('search-input');
    if (!input || !input.value.trim()) return;

    const query = input.value.trim();
    const matcher = createMatcher(query, searchWildcardEnabled, searchCaseSensitive);
    if (!matcher) return;

    // 仅在当前可见的行中搜索
    const lines = terminal.querySelectorAll('.term-line:not([style*="display: none"])');
    lines.forEach(line => {
        highlightTextNodes(line, matcher);
    });

    searchMatches = Array.from(terminal.querySelectorAll('.search-match'));
    const total = searchMatches.length;

    if (total > 0) {
        if (resetIndex || currentMatchIndex < 0 || currentMatchIndex >= total) {
            currentMatchIndex = 0;
        }
        updateCurrentMatchView();
    } else {
        currentMatchIndex = -1;
        const countEl = document.getElementById('search-count');
        if (countEl) countEl.textContent = '0/0';
    }
}

function highlightTextNodes(element, matcher) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    const nodesToReplace = [];
    let textNode;

    while ((textNode = walker.nextNode())) {
        if (textNode.parentNode && textNode.parentNode.classList && textNode.parentNode.classList.contains('search-match')) {
            continue;
        }
        const text = textNode.nodeValue;
        matcher.lastIndex = 0;
        if (matcher.test(text)) {
            nodesToReplace.push(textNode);
        }
    }

    nodesToReplace.forEach(node => {
        const text = node.nodeValue;
        matcher.lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let lastIdx = 0;
        let match;

        while ((match = matcher.exec(text)) !== null) {
            if (match[0].length === 0) {
                matcher.lastIndex++;
                continue;
            }
            if (match.index > lastIdx) {
                fragment.appendChild(document.createTextNode(text.substring(lastIdx, match.index)));
            }
            const mark = document.createElement('mark');
            mark.className = 'search-match';
            mark.textContent = match[0];
            fragment.appendChild(mark);
            lastIdx = match.index + match[0].length;
        }

        if (lastIdx < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIdx)));
        }

        if (node.parentNode) {
            node.parentNode.replaceChild(fragment, node);
        }
    });
}

function updateCurrentMatchView() {
    searchMatches.forEach((m, idx) => {
        m.classList.toggle('current', idx === currentMatchIndex);
    });

    const countEl = document.getElementById('search-count');
    if (countEl) {
        countEl.textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
    }

    if (currentMatchIndex >= 0 && searchMatches[currentMatchIndex]) {
        searchMatches[currentMatchIndex].scrollIntoView({
            block: 'nearest',
            behavior: 'smooth'
        });
    }
}

function searchNext() {
    if (searchMatches.length === 0) {
        performSearch(true);
        return;
    }
    currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
    updateCurrentMatchView();
}

function searchPrev() {
    if (searchMatches.length === 0) {
        performSearch(true);
        return;
    }
    currentMatchIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    updateCurrentMatchView();
}

const searchInputEl = document.getElementById('search-input');
searchInputEl.addEventListener('input', () => {
    performSearch(true);
});

searchInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
            searchPrev();
        } else {
            searchNext();
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSearchBar();
    }
});

// =============================================================================
// 10. Terminal Display, Logging & Scrolling
// =============================================================================
let rxBuffer = '';
let rxFlushTimer = null;

function appendLogLine(rawText, isTx = false) {
    const div = document.createElement('div');
    div.className = 'term-line';
    div.dataset.raw = rawText;

    if (isTx) {
        div.style.fontStyle = 'italic';
    }

    // 检查过滤规则
    if (!checkLineMatchesFilter(rawText)) {
        div.style.display = 'none';
    }

    // 格式化并高亮
    div.innerHTML = formatHighlightedHtml(rawText);

    terminal.appendChild(div);

    // 控制最大 DOM 节点防止溢出
    if (terminal.childNodes.length > 3000) {
        for (let i = 0; i < 200; i++) {
            if (terminal.firstChild) terminal.removeChild(terminal.firstChild);
        }
    }

    scrollBottom();

    // 如果搜索正在开启，动态高亮新行中的匹配词
    if (isSearchActive) {
        const input = document.getElementById('search-input');
        if (input && input.value.trim() && div.style.display !== 'none') {
            const matcher = createMatcher(input.value.trim(), searchWildcardEnabled, searchCaseSensitive);
            if (matcher && matcher.test(rawText)) {
                highlightTextNodes(div, matcher);
                searchMatches = Array.from(terminal.querySelectorAll('.search-match'));
                const countEl = document.getElementById('search-count');
                if (countEl) countEl.textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
            }
        }
    }
}

function logSystemMessage(msg, className = 'log-info') {
    const time = new Date().toTimeString().split(' ')[0];
    const fullText = `[${time}] ${msg}`;
    appendLogLine(fullText, false);
}

function toggleWrap() {
    const isWrap = document.getElementById('autowrap').checked;
    terminal.className = isWrap ? "terminal-screen wrap" : "terminal-screen nowrap";
}

function clearTerm() {
    terminal.innerHTML = '';
    clearSearchHighlights();
    const stat = document.getElementById('filter-stat');
    if (stat) stat.textContent = '全部显示 (0 行)';
}

terminal.addEventListener('scroll', () => {
    const isNearBottom = terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight <= 35;
    userScrolledUp = !isNearBottom;
});

function jumpToLatestLine() {
    terminal.scrollTop = terminal.scrollHeight;
    userScrolledUp = false;
    const autoscrollChk = document.getElementById('autoscroll');
    if (autoscrollChk) autoscrollChk.checked = true;
}

function scrollBottom() {
    if (autoscroll.checked && !userScrolledUp) {
        terminal.scrollTop = terminal.scrollHeight;
    }
}

// 全局快捷键监听 (Ctrl+F 搜索、Esc 退出、Enter 直达最新行)
document.addEventListener('keydown', (e) => {
    // Ctrl+F / Cmd+F 呼出或聚焦搜索框
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        toggleSearchBar();
        return;
    }

    if (e.key === 'Escape') {
        if (isSearchActive) {
            e.preventDefault();
            closeSearchBar();
            return;
        }
    }

    if (e.key === 'Enter') {
        const active = document.activeElement;
        // 如果用户正在底部的指令输入框准备发送指令，保留原有的 doSend()
        if (active && active.id === 'send-input') {
            return;
        }
        // 如果正在搜索框或添加高亮或过滤框内操作，不拦截回车
        const tag = active ? active.tagName.toUpperCase() : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            return;
        }
        
        e.preventDefault();
        jumpToLatestLine();
    }
});

terminal.addEventListener('click', () => {
    terminal.focus();
});

// =============================================================================
// 11. Themes & Typography Settings
// =============================================================================
function openSettingsModal() { document.getElementById('settings-modal').style.display = 'flex'; }
function closeSettingsModal() { document.getElementById('settings-modal').style.display = 'none'; }

function changeTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vilicom_theme', theme);
}

function changeFont(fontValue) {
    terminal.style.fontFamily = fontValue;
    const fontName = fontValue.split(',')[0].replace(/'/g, "");
    document.getElementById('current-font-label').innerText = fontName;
    localStorage.setItem('vilicom_font', fontValue);
}

function changeFontSize(size) {
    terminal.style.fontSize = size + 'px';
    document.getElementById('font-size-val').innerText = size + 'px';
    localStorage.setItem('vilicom_font_size', size);
}

function loadAppearanceConfig() {
    try {
        const theme = localStorage.getItem('vilicom_theme') || 'mocha';
        document.documentElement.setAttribute('data-theme', theme);
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) themeSelect.value = theme;

        const font = localStorage.getItem('vilicom_font') || "'JetBrains Mono', 'Fira Code', 'Noto Sans Mono CJK SC', monospace";
        changeFont(font);
        const fontSelect = document.getElementById('font-family');
        if (fontSelect) fontSelect.value = font;

        const size = localStorage.getItem('vilicom_font_size') || '14';
        changeFontSize(size);
        const rangeInput = document.querySelector('#settings-modal input[type="range"]');
        if (rangeInput) rangeInput.value = size;
    } catch (e) {}
}

// =============================================================================
// 12. Tauri Backend Event Listeners & Startup
// =============================================================================
function setupEventListeners() {
    const listen = getTauriListen();
    if (!listen) {
        setTimeout(setupEventListeners, 100);
        return;
    }

    // 监听串口底层热插拔/异常断开事件
    listen('port-status', (event) => {
        const payload = event.payload;
        if (!payload.connected && isConnected) {
            isConnected = false;
            btnConnect.textContent = '打开串口';
            btnConnect.style.background = '';
            btnConnect.style.borderColor = '';
            logSystemMessage(`[PORT] 串口已断开: ${payload.port || ''} ${payload.error || ''}`, 'log-warn');
        }
    });

    // 监听串口接收数据流 (经 Rust 增量 UTF-8 流式组包与 30FPS 节流处理)
    listen('serial-rx', (event) => {
        const payload = event.payload;
        if (payload && payload.text) {
            rxBuffer += payload.text;
            if (rxBuffer.includes('\n')) {
                const lines = rxBuffer.split('\n');
                rxBuffer = lines.pop(); // 保留未换行的末尾残片
                for (const line of lines) {
                    appendLogLine(line.replace(/\r$/, ''));
                }
            }

            // 防静默碎片滞留缓冲
            clearTimeout(rxFlushTimer);
            if (rxBuffer.length > 0) {
                rxFlushTimer = setTimeout(() => {
                    if (rxBuffer.length > 0) {
                        appendLogLine(rxBuffer);
                        rxBuffer = '';
                    }
                }, 200);
            }
        }
    });

    // 监听 Moserial 录制落盘状态推送
    listen('record-status', (event) => {
        const stat = event.payload;
        if (stat.recording) {
            isRecording = true;
            btnRecord.classList.add('recording');
            recText.innerText = "停止录制";
            const kb = (stat.bytes_written / 1024).toFixed(1);
            recInfo.innerHTML = `正在保存至: <span style="color:#f87171;">${escapeHtml(stat.file_path)}</span> (${stat.duration_secs}s, ${kb} KB)`;
        } else {
            isRecording = false;
            btnRecord.classList.remove('recording');
            recText.innerText = "开始录制 (Record)";
            const kb = (stat.bytes_written / 1024).toFixed(1);
            recInfo.innerText = `录制完成: ${stat.file_path} (${stat.duration_secs}s, ${kb} KB)`;
        }
    });

    refreshPorts();
}

// 页面初始化
window.addEventListener('DOMContentLoaded', () => {
    renderAtList();
    renderHighlightChips();
    reapplyAllHighlights();
    loadLogConfig();
    loadAppearanceConfig();
    setupEventListeners();
});
