# ViliCom

<p align="right">
  <a href="README.md">简体中文</a> | <b>English</b>
</p>

ViliCom is a lightweight, cross-platform serial communication and log recording studio built with Tauri v2 and Rust, designed for embedded developers, firmware testing, and hardware debugging.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-v0.1.0--alpha-green.svg)](https://github.com/vilinox/vilicom)
[![Rust](https://img.shields.io/badge/Rust-1.85%2B-orange.svg)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2.x-indigo.svg)](https://tauri.app/)
[![AI-Assisted](https://img.shields.io/badge/Built%20with-AI%20Pair%20Programming-blueviolet.svg)](#-ai-pair-programming--open-source-prompts)

> 💡 **A Note on AI-Assisted Open-Source Development**  
> **This entire project—including the multi-threaded Rust serial pipeline, incremental UTF-8 stream reassembly algorithm, Tauri IPC bindings, automated tests, and desktop icons—was developed through pair programming between a human developer and an AI assistant.**  
> In this new era of AI, the barrier to software creation has been democratized. Anyone can express clear architectural requirements to build production-grade tools. In that spirit, we not only open-source the code, but also **fully open-source the core architectural prompt that drove this project's creation**. Feel free to inspect, reproduce, or adapt it for your own tools!

---

## 💡 AI Pair Programming & Open-Source Prompts

In this project, the developer defined the **core architectural constraints, engineering redlines, and edge-case requirements**, while the AI wrote the **system-level Rust code, tuned concurrency, resolved WebKitGTK platform quirks, and constructed automated unit tests**.

The complete initial architecture prompt is archived in this repository:
- 📄 **Full Development Prompt**: [`docs/dev_prompt.md`](docs/dev_prompt.md)

### Key Takeaways in Prompt Engineering:
1. **Uncompromising UI Redlines**: Explicitly lock down the frontend UI layout and HTML/CSS design prototype, instructing the AI not to reinvent the UI but to focus strictly on Tauri IPC bridging and backend stability.
2. **Robust Multi-Threaded Pipeline Architecture**: Demand a three-thread decoupled pipeline upfront (Serial Reader thread, Disk Writer thread, and UI Throttle/Decoder thread) to eliminate UI freezes and race conditions from day one.
3. **Addressing Concrete Hardware Edge Cases**: Direct the AI to solve domain-specific embedded pain points, such as cross-packet multi-byte UTF-8 character truncation (using an incremental buffer assembly algorithm) and ANSI escape sequence sanitization for log files.
4. **Iterative Delivery with Automated Test Verification**: Guide the AI to write unit tests (`cargo test`) to autonomously verify algorithms against packet splits and edge conditions.

---

## Features

- **Serial Communication**
  - Supports standard baud rates (9600, 115200, etc.) as well as high-speed and non-standard rates (e.g. 1M / `1000000`, 2M / `2000000`, ESP Boot `74880`), with arbitrary manual number input.
  - Configurable data bits, stop bits, parity, and hardware/software flow control (None, RTS/CTS, DTR/DSR).
  - Serial port auto-discovery and hot-plug disconnection detection.

- **Terminal & Log Interaction**
  - **Live Log Filtering**: Supports "Include" and "Exclude" modes with `*` and `?` wildcard and regular expression support, with instant row count stats.
  - **Multi-Color Keyword Highlighting**: Add custom highlight keywords with color selection (6 eye-friendly palette presets + native full-spectrum color picker), automatically persistent across sessions.
  - **Search with Wildcards & Regex (Ctrl+F)**: Dedicated search bar with real-time match counter (`current/total`), case sensitivity toggle, wildcard (`*`, `?`) and regex modes, with smooth scroll navigation (`Enter` / `Shift+Enter`).
  - **Incremental UTF-8 Stream Decoding**: Solves the common multi-byte Chinese/UTF-8 character truncation issue caused by serial packet fragmentation.
  - **Render Anti-Freeze Protection**: Throttles log stream pushes to the webview at a smooth 30 FPS, preventing UI hangs during high-frequency log dumps.
  - **Smart Scrolling & Enter Key Shortcut**: Automatically pauses auto-scrolling when scrolling up to read historical logs. Press the **`ENTER`** key (or click the toolbar button) anywhere in the terminal view to immediately jump to the newest line and resume live following.
  - **Themes & Ergonomic Typography**: 5 built-in low-glare eye-comfort themes (Catppuccin Mocha default, Tokyo Night, Nordic Frost, Obsidian Dark, Clean Light) with JetBrains Mono and Fira Code monospace fonts, plus continuous font size scaling.

- **Background File Recording (Moserial Style)**
  - Background `BufWriter` disk recording thread with periodic 100ms flush protection against sudden power-offs or unexpected exits.
  - Customizable storage directory and file naming conventions (timestamp automatic generation, fixed overwrite/append, or prompt per session).
  - Configurable TX logging, microsecond timestamp insertion, and automatic ANSI escape code filtering.

- **Quick Presets & Data Transmission**
  - 10 editable quick AT / debugging command preset buttons with instant send and local storage persistence.
  - Bottom transmission bar supporting ASCII / HEX modes, periodic cyclic auto-sending, and custom line endings (CRLF / LF / None).

---

## Quick Installation & Running

### Linux (Ubuntu / Debian)

#### 1. Install via `.deb` Package
```bash
sudo dpkg -i ViliCom_0.1.0-alpha_amd64.deb

# If there are missing system dependencies, fix them with:
sudo apt-get install -f
```

#### 2. Run the Portable Binary
```bash
chmod +x ./vilicom
./vilicom
```

> **Note: Linux Serial Permissions**  
> On Linux, regular users may not have read/write access to serial devices (e.g. `/dev/ttyUSB0`) by default, resulting in a "Permission Denied" error.  
> Add your user to the `dialout` group and log out/in:
> ```bash
> sudo usermod -aG dialout $USER
> ```

---

## 📁 Project Directory Structure

```text
vilicom/
├── .github/                      # GitHub Actions CI & Issue templates
│   ├── workflows/ci.yml          # Automated build & test workflow
│   └── ISSUE_TEMPLATE/           # Bug report & feature request templates
├── assets/                       # Branding assets & icon masters
│   └── branding/                 # 1024x1024 high-res app icon & logo
├── docs/                         # Project documentation & design archives
│   ├── dev_prompt.md             # AI architecture & requirements prompt
│   └── prototype.html            # Original UI design prototype reference
├── src/                          # Frontend Web UI (native, lightweight, no bundler bloat)
│   ├── css/
│   │   ├── app.css               # Main layout & component styles
│   │   └── themes.css            # 5 eye-comfort color palettes
│   ├── js/
│   │   └── app.js                # Frontend controller & Tauri IPC event bus
│   ├── icon.png                  # Window favicon
│   └── index.html                # Semantic main UI entrypoint
├── src-tauri/                    # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── commands.rs           # Tauri IPC command routing
│   │   ├── serial_manager.rs     # 3-thread serial engine & unit tests
│   │   ├── lib.rs                # App library entrypoint & plugin setup
│   │   └── main.rs               # Binary entrypoint
│   ├── icons/                    # Multi-platform app icons (.ico, .icns, .png)
│   ├── Cargo.toml                # Rust dependencies & metadata
│   └── tauri.conf.json           # Tauri v2 runtime configuration
├── CHANGELOG.md                  # Release change history
├── CONTRIBUTING.md               # Contribution guidelines
├── LICENSE                       # Apache-2.0 open-source license
├── README.md                     # Documentation (Chinese)
└── README_en.md                  # Documentation (English)
```

---

## Build from Source

### 1. Prerequisites

- **Rust toolchain** (Rust 1.85 or newer recommended):
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  source $HOME/.cargo/env
  ```
- **Tauri CLI v2**:
  ```bash
  cargo install tauri-cli --version "^2.0"
  ```

### 2. System Dependencies

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
- Install Xcode Command Line Tools:
  ```bash
  xcode-select --install
  ```

#### Windows
- Install [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (with the "Desktop development with C++" workload).

---

### 3. Development & Packaging

Clone the repository and enter the directory:

```bash
git clone https://github.com/vilinox/vilicom.git
cd vilicom
```

#### Run in Local Development Mode
```bash
cargo tauri dev
```

#### Build Release Packages

- **Linux**
  ```bash
  # Build Debian (.deb) package
  cargo tauri build --bundles deb
  # Output path: src-tauri/target/release/bundle/deb/ViliCom_0.1.0-alpha_amd64.deb

  # Build AppImage
  cargo tauri build --bundles appimage
  ```

- **macOS**
  ```bash
  cargo tauri build --bundles dmg
  # Output path: src-tauri/target/release/bundle/dmg/
  ```

- **Windows**
  ```bash
  cargo tauri build --bundles nsis
  # Output path: src-tauri/target/release/bundle/nsis/
  ```

---

## Automated Unit Tests

Run the built-in unit tests for incremental UTF-8 split-packet reassembly, ANSI escape sequence filtering, and path resolution:

```bash
cd src-tauri
cargo test -- --nocapture
```

---

## License

This project is licensed under the [Apache License 2.0](LICENSE). Issues and Pull Requests are warmly welcome!
