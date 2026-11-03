/**
 * ViliCom - Desktop Serial & Log Studio
 * Frontend Application Controller
 * Handles Tauri v2 IPC, Serial Connection, Terminal UI, Record Engine, and AT Presets.
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
// 2. Tauri IPC Helpers
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

function logSystemMessage(msg, className = 'log-info') {
    const time = new Date().toTimeString().split(' ')[0];
    const div = document.createElement('div');
    div.innerHTML = `<span class="log-time">[${time}]</span><span class="${className}">${escapeHtml(msg)}</span>`;
    terminal.appendChild(div);
    scrollBottom();
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
                // 优先选择用户当前接入的 USB 串口 (如 /dev/ttyUSB0 或 COM)
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

    const div = document.createElement('div');
    div.innerHTML = `<span class="log-time">[${time}]</span><span class="log-tx">TX ➡ [${isHex ? 'HEX' : 'ASCII'}]: ${escapeHtml(val)}</span>`;
    terminal.appendChild(div);
    scrollBottom();

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
// 7. Terminal Display & Scrolling (Enter Key Shortcut)
// =============================================================================
function toggleWrap() {
    const isWrap = document.getElementById('autowrap').checked;
    terminal.className = isWrap ? "terminal-screen wrap" : "terminal-screen nowrap";
}

function clearTerm() {
    terminal.innerHTML = '';
}

terminal.addEventListener('scroll', () => {
    // 离底端超过 35px 判定为向上查阅历史，智能挂起自动滚屏
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

// 监听回车键 (Enter)：日志区域敲击直接跳到最新行
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const active = document.activeElement;
        // 如果用户正在底部的指令输入框准备发送指令，保留原有的 doSend()
        if (active && active.id === 'send-input') {
            return;
        }
        // 如果正在弹窗中的输入控件内操作，不拦截回车
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
// 8. Themes & Typography Settings
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
// 9. Tauri Backend Event Listeners
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
            const span = document.createElement('span');
            span.textContent = payload.text;
            terminal.appendChild(span);

            // 避免长时高频输出致 DOM 节点无限膨胀
            if (terminal.childNodes.length > 2500) {
                for (let i = 0; i < 200; i++) {
                    if (terminal.firstChild) terminal.removeChild(terminal.firstChild);
                }
            }
            scrollBottom();
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
    loadLogConfig();
    loadAppearanceConfig();
    setupEventListeners();
});
