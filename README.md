# ViliCom

ViliCom 是一个基于 Tauri v2 与 Rust 构建的轻量、跨平台串口调试与日志记录工具，适用于嵌入式开发、单片机调试及日常通信测试。

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-v0.1.0--alpha-green.svg)](https://github.com/vilinox/vilicom)
[![Rust](https://img.shields.io/badge/Rust-1.85%2B-orange.svg)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2.x-indigo.svg)](https://tauri.app/)

---

## 功能介绍

- **串口通讯支持**
  - 支持常用波特率（9600、115200 等）及非标准/高速波特率（如 1000000 / 1M、2000000 / 2M、74880 等），支持手动直接输入数值。
  - 支持设置数据位、停止位、校验位以及硬件流控（None、RTS/CTS、DTR/DSR）。
  - 支持串口热插拔检测与断开提示。

- **终端日志交互**
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
