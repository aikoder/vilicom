# 角色与工程目标
你是一名精通 Rust 系统级编程与现代化跨平台桌面 GUI 开发的资深架构师。
你的任务是为 **Vilinox** 公司开发并开源一款现代化、工业级、跨平台的串口终端桌面软件，项目命名为 **"ViliCom"**（版本号：`v0.1.0-alpha`）。

---

## ⚠️ 核心红线约束（最高优先级，严禁自由发挥 UI）
本工程的**前端界面与交互逻辑已经 100% 确认定稿**，完整代码存放在项目根目录的 **`serial_studio.html`** 中。
1. **严禁重新设计或手写任何新的 HTML/CSS 布局！**
2. **必须将 `serial_studio.html` 直接作为前端主入口（重命名为 `src/index.html`）**。
3. 必须原封不动保留原型中的：
   - 工业级深色配色变量（Obsidian Dark `--bg-base: #0f141c` 等）。
   - Ubuntu Mono 默认开源字体。
   - 顶部硬件配置栏、Moserial 风格 Record 录制呼吸灯面板、右侧可折叠 10 组 AT 快捷指令栏。
   - 所有的 DOM 结构、CSS 类名和布局比例。
4. **你的前端开发任务仅有一项**：在保留原有 UI 和样式的绝对前提下，引入 `@tauri-apps/api`，将原型中 `mock` 假数据和占位函数替换为真实的 Tauri IPC 后端调用！

---

## 1. 项目基础信息与开源规范
- **软件名称**：ViliCom (Next-Gen Industrial Serial Studio)
- **所属公司 / 版权方**：Vilinox
- **初始版本**：`v0.1.0-alpha`
- **开源协议**：Apache License 2.0
- **目标平台**：跨平台原生编译（Ubuntu/Debian Linux, macOS ARM/Intel, Windows 10/11）

---

## 2. 技术栈架构规范

### 2.1 框架与库
- **框架**：**Tauri v2**（Rust 后端 + 本地原生 WebView 前端，禁止打包 Chromium，保持安装包在 15MB 左右）。
- **后端语言**：Rust (Edition 2021)
  - 串口库：`serialport = "4.3"`
  - 异步运行时：`tokio = { version = "1", features = ["full"] }`
  - 辅助工具：`regex`（ANSI 清洗）、`chrono`（微秒时间戳）。
- **前端资源**：直接采用根目录的 `serial_studio.html`，保留开源字体 `Ubuntu Mono`。

### 2.2 并发与数据安全架构（解决性能与乱码）
必须实现**三线程分离流水线**，杜绝界面卡死与字符乱码：
1. **串口采集线程 (Serial Reader)**：以最高优先级非阻塞读取底层串口裸字节，推入无锁环形队列。
2. **磁盘录制线程 (Disk Writer / Record 引擎)**：
   - 独立于 UI，采用 `BufWriter` 异步落盘，每 100ms 刷新一次。
   - 内置 **ANSI 控制码清洗器**（利用正则表达式过滤 `\x1b[...m` 控制字符），确保落盘的日志为干净纯文本，第三方编辑器打开不乱码。
3. **UI 渲染节流与 UTF-8 流式解码线程**：
   - 必须实现**增量 UTF-8 流式解码（Incremental Decoder）**，针对跨串口分包被切断的汉字多字节进行缓存拼接，彻底消灭 moserial 的多字节中文乱码缺陷。
   - 限制每秒最多向前端 IPC 推送 30~60 帧，防止开发板高频吐 log 把界面卡死。

---

## 3. 后端功能需打通的 Tauri IPC 接口清单
前端 `serial_studio.html` 已具备完整的操作入口，后端 Rust 需提供对应的 Tauri Commands 进行绑定：

1. **串口控制**：
   - `list_ports()`: 扫描系统串口（Linux `/dev/ttyUSB*`、macOS `/dev/cu.*`、Win `COM*`）。
   - `open_port(port, baud_rate, flow_control, data_bits, stop_bits, parity)`: 打开串口。**波特率必须支持接收任意自定义整数（如 ESP32 常用的 74880、76880）**。
   - `close_port()`: 关闭当前串口。
2. **数据发送与定时器**：
   - `send_data(content, is_hex, line_ending)`: 支持普通 ASCII 与十六进制 HEX 发送。
   - 定时发送逻辑前端已就绪，调用相同的发送接口。
3. **Moserial 风格 Record 录制系统**：
   - `start_record(config)`: 接收前端“日志配置弹窗”传来的参数（目录路径、文件名前缀、是否记录 TX、是否加时间戳、是否清洗 ANSI），在后台原子创建文件并开始落盘。
   - `stop_record()`: 刷新缓冲区并关闭文件句柄。
   - 后端定时推送已录制时长与文件大小给前端渲染。
4. **配置持久化**：
   - 10 组自定义 AT 指令的标题与内容、日志配置偏好设置，保存至本地配置文件或 LocalStorage。

---

## 4. 实施与交付步骤规划

请按以下顺序开始施工：
- **第一步：环境与工程脚手架**
  - 创建 Tauri v2 标准工程骨架（`src-tauri` 与 `src`）。
  - 将项目根目录的 `serial_studio.html` 部署为 `src/index.html`。
  - 配置 `Cargo.toml` 与 `tauri.conf.json`（设定窗口标题为 "ViliCom v0.1.0-alpha"，配置最低窗口尺寸 960x640）。
- **第二步：Rust 串口通信核心模块**
  - 编写 `serial_manager.rs`，实现端口枚举、多线程环形缓冲读取、UTF-8 分包流式组包、后台独立日志落盘。
- **第三步：打通前后端 IPC**
  - 编写 Tauri Command 函数，并修改 `src/index.html` 中的 JS 代码，用 `window.__TAURI__.core.invoke` 替换原有的前端模拟函数。
- **第四步：构建与打包验证**
  - 给出跨平台编译命令（构建 Linux `.deb`/`.AppImage`、macOS `.dmg`、Windows `.exe`）。

请立即开始第一步：输出目录树结构、`Cargo.toml` 和 `tauri.conf.json` 配置。
