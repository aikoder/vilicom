<div align="center">

# ⚡ ViliCom

### Next-Gen Industrial Serial Studio · 新一代工业级跨平台串口调试工作站

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-v0.1.0--alpha-emerald.svg)](https://github.com/vilinox/vilicom)
[![Rust](https://img.shields.io/badge/Rust-1.90%2B-orange.svg)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2.x-indigo.svg)](https://tauri.app/)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)](#-跨平台编译与打包指南)

**ViliCom** 是由 **Vilinox** 公司研发并开源的一款面向嵌入式研发、物联网（IoT）通信、固件测试及自动化产线的高性能、工业级跨平台桌面串口终端工具。

[功能特性](#-核心特性与技术亮点) • [快速开始](#-快速安装与启动) • [编译与打包](#-跨平台编译与打包指南) • [使用指南](#-使用指南与推荐配置) • [架构解析](#-三线程分离流水线架构) • [开源协议](#-开源许可与版权)

</div>

---

## 🌟 为什么选择 ViliCom？

在嵌入式开发中，传统调试工具（如 Moserial、SecureCRT、Putty、串口助手）长期存在三大痛点：
1. **高频日志卡死**：开发板高速吐 log（如 ESP32 在 921600 / 1000000 波特率下输出大量调试信息）时，界面直接假死卡屏。
2. **多字节中文乱码**：汉字在串口传输中容易跨分包被切断，传统软件无法重组，出现大量 `` 问号乱码。
3. **长时注视视觉疲劳**：传统高饱和黑底白字或高亮刺眼界面在连续 8 小时以上的调试工作中容易造成严重的眼睛干涩与疲劳。

**ViliCom 专为解决上述痛点而生。**

---

## 🎯 核心特性与技术亮点

### 1. 三线程分离流水线架构 (Three-Thread Pipeline)
- **线程 1：串口采集线程 (Serial Reader)**
  - 纯原生 OS 线程，以最高优先级非阻塞轮询读取底层串口裸字节流，实时推入无锁环形同步通道。
- **线程 2：独立磁盘落盘线程 (Disk Writer / Record 引擎)**
  - 独立于 UI 渲染管道，采用带缓存的 `BufWriter` 异步落盘，每 100ms 定时刷新，杜绝设备突然掉电或强退丢包。
  - **内置 ANSI 控制符清洗器**：自动正则过滤 `\x1b[...m` 终端色彩控制码，确保保存的 `.log` 为纯净文本，在第三方文本编辑器（VS Code、Sublime、Notepad++）中打开干净无乱码。
  - 支持插入微秒级时间戳（`[YYYY-MM-DD HH:MM:SS.ffffff]`）。
- **线程 3：UI 渲染节流与增量 UTF-8 流式解码线程**
  - **增量 UTF-8 流式解码算法**：针对跨串口数据包截断的汉字多字节（如 UTF-8 3 字节汉字被分割在不同数据包），自动在环形缓冲区中留存残片并拼装，彻底根除中文乱码！
  - **30 FPS 渲染节流**：毫秒级合并帧数据批量推送到前端，保证无论开发板输出频率多高，界面响应永远丝滑跟手。

### 2. 长时间舒适调试 · 人体工学护眼调色板与排版
- **低眩光柔和色系**：默认采用全球开发者广泛认可的 **Catppuccin Mocha（摩卡暖柔）** 护眼调色板，告别刺眼高对比纯黑底和高饱和霓虹色；同时提供 **Tokyo Night（东京夜色）**、**Nordic Frost（北欧极地）**、**Obsidian Dark（经典黑曜）** 与 **Clean Light（现代素雅）** 5 组专业主题一键无缝切换。
- **防疲劳开源等宽字体引擎**：
  - 默认集成 **JetBrains Mono**：拥有比普通等宽字体高出 8.5% 的大 x-height 高度设计，`0/O`、`1/l/I` 极度清晰辨识，字符间距更符合人眼自然扫描习惯。
  - 内置 **Fira Code**（优雅连字特性）、**Cascadia Code**（微软现代等宽）、**Ubuntu Mono**（经典工控紧凑）供随时随心切换。
  - 舒适行高设定为 `1.65`，开启亚像素抗锯齿平滑渲染。

### 3. 全面工业硬件支持
- **任意非标波特率直通**：不仅支持常用波特率，还支持直接键盘键入任何非标数值（如 **1M** / `1000000`、**2M** / `2000000`、ESP Boot 专用的 `74880`、ESP32 专用的 `76880`、`1500000` 等）。
- **智能日志滚动与 ENTER 一键直达**：
  - 向上回溯历史日志时智能暂停自动滚屏，防止视线被新到的大量数据冲刷打断；
  - 在日志界面任意位置按下键盘 **`ENTER`** 键（或点击副工具栏 **`⤓ 最新行 (Enter)`** 按钮），即可瞬时跳转至最新行并恢复实时跟随滚屏。
- **10 组快捷 AT 指令群**：预设常用 AT 模组软复位、WiFi 扫描、查固件版本、透传指令；支持可视化重命名与修改，双击/点击即发，配置自动本地持久化。
- **Moserial 录制系统**：支持前缀/时间戳规则命名、自定义文件名、TX/RX 独立录制开关、原生系统文件夹选择。
- **极致轻量体积**：基于 Tauri v2 架构，直接调用宿主系统原生 WebView，**完全摒弃 Chromium 打包冗余**，安装包仅 **~5.0MB**，剥离符号后二进制仅 **~12MB**，内存占用不到传统 Electron 串口助手的 1/10。

---

## 📦 快速安装与启动

### Linux (Ubuntu / Debian)

#### 方式 A：使用预编译 `.deb` 安装包（推荐）
```bash
# 下载或构建得到 deb 安装包后安装：
sudo dpkg -i ViliCom_0.1.0-alpha_amd64.deb

# 若提示缺少依赖，执行以下命令自动补全：
sudo apt-get install -f
```

#### 方式 B：直接运行便携版二进制
```bash
chmod +x ./vilicom
./vilicom
```

> **⚠️ Linux 串口访问权限说明（重要）**  
> Linux 默认仅允许 `dialout` 或 `plugdev` 组用户读写串口设备（如 `/dev/ttyUSB0`）。若打开串口提示权限不足，请执行以下命令将当前用户加入串口组并注销重新登录：
> ```bash
> sudo usermod -aG dialout,plugdev $USER
> ```

---

## 🛠️ 跨平台编译与打包指南

本项目源码完全开源，支持在 Linux、macOS 与 Windows 下原生编译打包。

### 1. 安装基础开发环境

- **Rust 工具链** (建议 Rust 1.85+ / 1.90+)：
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  source $HOME/.cargo/env
  ```
- **Tauri CLI v2**：
  ```bash
  cargo install tauri-cli --version "^2.0"
  ```

### 2. 各平台系统依赖准备

#### Ubuntu / Debian Linux
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

#### macOS (Apple Silicon M 系列 / Intel)
- 安装 Xcode 命令行工具：`xcode-select --install`
- 系统自带 WebKit 支持，无需安装额外 GUI 库。

#### Windows (Win 10 / 11)
- 安装 [Microsoft Visual Studio C++ 生成工具](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（勾选“使用 C++ 的桌面开发”）。
- 系统自带 Edge WebView2 运行时。

---

### 3. 开发调试与全平台构建

#### 本地实时热重载开发
```bash
# 在项目根目录下执行
cargo tauri dev
```

#### ① Linux 打包
```bash
# 打包 Debian / Ubuntu 安装包 (.deb)
cargo tauri build --bundles deb
# 产物生成于: src-tauri/target/release/bundle/deb/ViliCom_0.1.0-alpha_amd64.deb

# 打包 Linux 通用便携包 (.AppImage)
cargo tauri build --bundles appimage
# 产物生成于: src-tauri/target/release/bundle/appimage/
```

#### ② macOS 打包 (在 macOS 环境下执行)
```bash
# 打包 DMG 安装镜像与 .app 应用
cargo tauri build --bundles dmg
# 产物生成于: src-tauri/target/release/bundle/dmg/
```

#### ③ Windows 打包 (在 Windows 环境下执行)
```bash
# 打包 NSIS 安装向导 (.exe)
cargo tauri build --bundles nsis
# 产物生成于: src-tauri/target/release/bundle/nsis/
```

---

## 📖 使用指南与推荐配置

### 1. 串口配置与连接
- **串口选择**：插入 USB 串口适配器（如 CH340、CP2102、FT232、PL2303），点击下拉框即可实时扫描识别（如 `/dev/ttyUSB0 (USB (FT232R USB UART))`）。
- **波特率设定**：
  - 支持下拉预设（`9600`、`115200`、`1M (1000000)`、`2M (2000000)` 等）。
  - 支持键盘输入 `1M`、`2M`、`74880` 等任意数值，软件会自动识别为标准整型。
- **流控**：默认选择 `None (无)`；对具备硬件握手的工控流控卡可选 `RTS / CTS`。
- 点击 **“打开串口”**，连接成功后按钮变为红色 **“关闭串口”** 保护状态。

### 2. Moserial 风格后台原子落盘录制
1. 点击顶部录制栏的 **“⚙️ 日志配置”**：
   - 可点击 **“浏览...”** 调用系统文件管理器选择目标存储文件夹。
   - 配置命名规则（时间戳自动生成、固定文件覆写、自定义每次弹窗）。
   - 按需勾选：是否记录 TX 数据、是否添加微秒时间戳、**是否自动清洗 ANSI 颜色码**。
2. 点击 **“⏺ 开始录制”**：
   - 呼吸红灯闪烁，后台开启独立 `BufWriter` 线程，每 100ms 刷新保护。
   - 顶部实时显示已录制时长与累计落盘大小（KB）。
3. 再次点击 **“停止录制”**，缓冲区数据完整落盘关闭。

### 3. AT 快捷指令侧边栏
- 点击顶部 **“⚡ 快捷 AT 指令”** 可展开/折叠右侧 10 组快捷键面板。
- 点击任意按键直接发送；点击右侧 ✏️ 图标可随时更改按钮名称与发送命令内容。
- 配置自动同步至本地缓存，下次启动不丢失。

### 4. 护眼界面与字体配置
- 点击顶部 **“🎨 外观字体”**：
  - **主题风格**：推荐选择 **摩卡暖柔 (Catppuccin Mocha)**，对比度适中柔和，专为防蓝光与防视疲劳优化；亦可选择极夜蓝、冷雾灰、黑曜黑或素雅白。
  - **开源字体**：推荐 **JetBrains Mono** 或 **Fira Code**。
  - **字体大小**：支持 11px ~ 22px 实时无极平滑滑块缩放。

---

## 🧩 自动化单元测试验证

项目内置了针对增量解码断包拼接、ANSI 正则过滤、路径解析等核心功能的自动化测试：

```bash
cd src-tauri
cargo test -- --nocapture
```

测试输出：
```text
running 4 tests
test serial_manager::tests::test_ansi_cleaning ... ok
test serial_manager::tests::test_incremental_utf8_split_chinese_characters ... ok
test serial_manager::tests::test_resolve_path ... ok
test serial_manager::tests::test_open_real_device_if_present ... ok

test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

---

## 🗺️ 后续迭代规划 (Roadmap)

- [x] v0.1.0-alpha:
  - [x] 基于 Tauri v2 的三线程分离架构（采集/落盘/节流解码）。
  - [x] 任意非标波特率（1M/2M/74880等）支持与 FT232/ESP32 实测。
  - [x] Moserial 风格原子落盘录制与 ANSI 净化引擎。
  - [x] 10 组 AT 快捷指令群与本地状态持久化。
  - [x] Catppuccin Mocha 护眼色彩体系与 JetBrains Mono 字体引擎。
  - [x] Linux WebKitGTK 下拉框视觉样式优化与 `.deb` 构建发布。
- [ ] v0.2.0:
  - [ ] 串口波形绘图模式（实时曲线图、类似 Serial Studio 协议解析）。
  - [ ] 自动化脚本任务与周期性宏指令支持。
  - [ ] XMODEM / YMODEM / ZMODEM 固件空中升级传输协议支持。

---

## 🤝 参与贡献

欢迎全球开发者与硬件工程师向 **ViliCom** 提交 Issue 或 Pull Request！
- 代码仓库：[GitHub](https://github.com/vilinox/vilicom) / [GitCode](https://gitcode.com/vilinox/vilicom)
- 提交 PR 前请确保通过 `cargo test` 及 `cargo check`。

---

## 📄 开源许可与版权

本项目采用 **Apache License 2.0** 开源许可证。详细内容参见 [LICENSE](LICENSE) 文件。

```text
Copyright (c) 2026 Vilinox

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```
