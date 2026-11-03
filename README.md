# ViliCom

<p align="right">
  <b>简体中文</b> | <a href="README_en.md">English</a>
</p>

ViliCom 是一个基于 Tauri v2 与 Rust 构建的轻量、跨平台串口调试与日志记录工具，适用于嵌入式开发、单片机调试及日常通信测试。

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-v0.1.0--alpha-green.svg)](https://github.com/vilinox/vilicom)
[![Rust](https://img.shields.io/badge/Rust-1.85%2B-orange.svg)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2.x-indigo.svg)](https://tauri.app/)
[![AI-Assisted](https://img.shields.io/badge/Built%20with-AI%20Pair%20Programming-blueviolet.svg)](#-ai-时代协同开发与提示词开源)

> 💡 **写在前面（AI 时代的开源实验）**  
> **本项目（包括 Rust 底层多线程串口管道、增量 UTF-8 乱码拼装算法、Tauri IPC 接口、全套自动化测试及应用图标）全部由开发者通过与 AI 结对协同编程开发完成。**  
> 当前已步入 AI 时代，软件开发的门槛正在被重构，人人都可以表达需求并创造属于自己的生产力工具。为此，我们不仅开源软件源代码，也**完整开源了驱动本项目诞生的核心架构提示词（Prompts）**，欢迎交流、复刻或以此为模版构建你的桌面工具！

---

## 💡 AI 时代协同开发与提示词开源

在本项目中，开发者负责**定义核心架构约束、工业红线与工程边界**，AI 负责**编写系统级 Rust 代码、性能调优、排查 WebKitGTK 兼容性以及自动化测试**。

完整的原始架构设计与开发提示词已归档在项目仓库中：
- 📄 **完整开发提示词**：[`docs/dev_prompt.md`](docs/dev_prompt.md)

### 提示词编写心得与实践要点：
1. **明确不可动摇的红线约束**：提示词中明确锁定前端 UI 结构和样式原型，禁止 AI 自由发挥打乱界面布局，仅专注于前后端 IPC 桥接与核心逻辑。
2. **底层并发与鲁棒性架构指定**：明确提出“三线程分离流水线”（采集线程、磁盘写入线程、UI 解码节流线程），让 AI 在初始设计时就彻底避开界面卡死与数据竞争问题。
3. **针对性攻克工业开发痛点**：精准指导 AI 解决特定场景难题，如跨串口包截断导致的 UTF-8 中文乱码问题（编写增量拼接算法）、日志落盘自动清洗 ANSI 色彩控制符等。
4. **小步快跑与测试闭环**：通过分阶段交付目标与内置的 `cargo test` 单元测试，让 AI 能够自主编写断言用例验证算法正确性。

---

## 功能介绍

- **串口通讯支持**
  - 支持常用波特率（9600、115200 等）及非标准/高速波特率（如 1000000 / 1M、2000000 / 2M、74880 等），支持手动直接输入数值。
  - 支持设置数据位、停止位、校验位以及硬件流控（None、RTS/CTS、DTR/DSR）。
  - 支持串口热插拔检测与断开提示。

- **终端日志交互与高级搜索过滤**
  - **字符过滤 (Filter)**：支持“仅显示包含”与“排除包含”双模式，支持 `*` 和 `?` 通配符及正则表达式，输入即时过滤并实时统计匹配行数。
  - **关键词多色自定义高亮**：支持添加自定义高亮关键词，内置 6 组发光护眼调色盘并附带全色系取色器供任意选色，高亮规则自动持久化保存。
  - **日志搜索 (Ctrl+F)**：支持快捷键呼出搜索栏，实时计算总匹配项与当前定位，支持通配符（`*`, `?`）与正则模式，按 `Enter` / `Shift+Enter` 快速在匹配项间平滑跳转。
  - **增量 UTF-8 流式解码**：解决串口分包导致的多字节中文字符被切断、乱码问题。
  - **渲染防卡死**：接收数据流采用定时批量刷新，应对高速输出场景。
  - **智能滚动与回车跳转**：向上翻阅日志时自动暂停滚屏，按键盘 `ENTER` 键或点击工具栏按钮即可瞬时跳转到底部最新行并恢复自动跟随。
  - **外观与字体**：内置低对比度护眼主题（摩卡、极夜、冷雾、暗黑、素雅）及 JetBrains Mono、Fira Code 等开源等宽字体，支持无极调节字号。

- **后台日志录制**
  - 支持类似 Moserial 的独立落盘录制功能，采用缓冲写入定时 flush，防止异常退出丢失数据。
  - 可自定义保存目录、文件命名规则（按时间戳自动生成或自定义文件名）。
  - 可选是否记录发送数据（TX）、是否添加微秒级时间戳、是否自动过滤 ANSI 终端控制符。

- **快捷指令与发送**
  - 右侧提供 10 组快捷 AT / 调试指令面板，支持自定义标题和内容，点击即发，配置自动保存在本地。
  - 底部发送区支持 ASCII / HEX 格式、定时循环自动发送、自定义行结尾（CRLF / LF / None）。

---

## 快速安装与运行

### Linux (Ubuntu / Debian)

#### 1. 使用 `.deb` 包安装
```bash
sudo dpkg -i ViliCom_0.1.0-alpha_amd64.deb

# 若提示缺少依赖，执行以下命令修复：
sudo apt-get install -f
```

#### 2. 直接运行二进制文件
```bash
chmod +x ./vilicom
./vilicom
```

> **注意：Linux 串口权限设置**  
> Linux 下普通用户默认可能没有串口读写权限，打开设备可能提示 Permission Denied。  
> 请将当前用户加入 `dialout` 用户组并重新登录：
> ```bash
> sudo usermod -aG dialout $USER
> ```

---

## 📁 项目目录结构

```text
vilicom/
├── .github/                      # GitHub Actions CI 与 Issue 模版
│   ├── workflows/ci.yml          # 自动化构建与测试流水线
│   └── ISSUE_TEMPLATE/           # Bug 报告与功能建议模版
├── assets/                       # 品牌设计与图标母版
│   └── branding/                 # 1024x1024 高清应用图标与 Logo
├── docs/                         # 项目文档与初始原型
│   ├── dev_prompt.md             # AI 时代协同开发架构提示词
│   └── prototype.html            # 初始 UI 交互原型存档
├── src/                          # 前端 Web UI (原生轻量化设计，无冗余打包)
│   ├── css/
│   │   ├── app.css               # 布局结构与组件交互样式
│   │   └── themes.css            # 护眼调色板（摩卡、东京夜、极地、黑曜、素雅）
│   ├── js/
│   │   └── app.js                # 前端主控制器与 Tauri IPC 事件总线
│   ├── icon.png                  # 前端窗口 Favicon
│   └── index.html                # 语义化主界面入口
├── src-tauri/                    # Rust 跨平台桌面底层
│   ├── src/
│   │   ├── commands.rs           # Tauri IPC 接口路由层
│   │   ├── serial_manager.rs     # 三线程分离串口核心（读取、落盘、增量解码）
│   │   ├── lib.rs                # 库主入口与插件装配
│   │   └── main.rs               # 二进制执行主入口
│   ├── icons/                    # 全平台应用图标 (.ico, .icns, .png)
│   ├── Cargo.toml                # Rust 依赖与工程配置
│   └── tauri.conf.json           # Tauri v2 桌面运行时配置
├── CHANGELOG.md                  # 迭代更新日志
├── CONTRIBUTING.md               # 开发者贡献指南
├── LICENSE                       # Apache-2.0 开源协议
├── README.md                     # 项目介绍与说明文档 (中文)
└── README_en.md                  # Project Documentation (English)
```

---

## 源码编译指南

### 1. 基础依赖

- **Rust 工具链** (建议 Rust 1.85 或更高版本)：
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  source $HOME/.cargo/env
  ```
- **Tauri CLI v2**：
  ```bash
  cargo install tauri-cli --version "^2.0"
  ```

### 2. 系统依赖库

#### Ubuntu / Debian
```bash
sudo apt-get update && sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libjavascriptcoregtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libudev-dev \
  build-essential \
  curl wget file
```

#### macOS
- 安装 Xcode 命令行工具：
  ```bash
  xcode-select --install
  ```

#### Windows
- 安装 [Visual Studio C++ 生成工具](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（包含“使用 C++ 的桌面开发”工作负载）。

---

### 3. 开发与打包构建

克隆代码仓库后进入项目目录：

```bash
git clone https://github.com/vilinox/vilicom.git
cd vilicom
```

#### 本地启动开发模式
```bash
cargo tauri dev
```

#### 构建正式安装包

- **Linux**
  ```bash
  # 构建 deb 包
  cargo tauri build --bundles deb
  # 产物路径: src-tauri/target/release/bundle/deb/ViliCom_0.1.0-alpha_amd64.deb

  # 构建 AppImage
  cargo tauri build --bundles appimage
  ```

- **macOS**
  ```bash
  cargo tauri build --bundles dmg
  # 产物路径: src-tauri/target/release/bundle/dmg/
  ```

- **Windows**
  ```bash
  cargo tauri build --bundles nsis
  # 产物路径: src-tauri/target/release/bundle/nsis/
  ```

---

## 自动化测试

运行内置的串口数据拼包、ANSI 过滤及路径解析单元测试：

```bash
cd src-tauri
cargo test -- --nocapture
```

---

## 开源协议

本项目采用 [Apache License 2.0](LICENSE) 开源许可证。欢迎提交 Issue 与 Pull Request。
