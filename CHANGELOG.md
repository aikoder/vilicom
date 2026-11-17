# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2-alpha] - 2026-11-17

### Added
- **Terminal HEX Display Mode**: Added a `HEX 显示` toggle in the terminal toolbar to render received serial data as clean 16-byte-per-line hexadecimal rows (`AA 55 ...`) with `localStorage` persistence.

### Fixed
- **Raw Binary RX Emission**: Ensured the Rust UI throttler emits `serial-rx` events whenever raw HEX bytes are queued, even if an incomplete multi-byte UTF-8 sequence is held in the text decoder buffer.

## [0.1.1-alpha] - 2026-11-16

### Added
- **Copy Log Path Button**: Added a one-click `📋 复制路径` button in the log recording toolbar to copy the active/last recorded log file path (or configured log directory when idle) directly to the clipboard with visual confirmation.

## [0.1.0-alpha] - 2026-11-03

### Added
- **Three-Thread Pipeline Architecture**:
  - Independent OS serial reader thread for zero packet loss.
  - Independent atomic `BufWriter` disk recorder with 100ms flush protection.
  - 30 FPS UI frame throttle with incremental UTF-8 stream decoder (resolves cross-packet Chinese character corruption).
- **Serial Communication**:
  - Auto scan and detection of USB UARTs (`/dev/ttyUSB*`, `/dev/ttyACM*`, `COM*`).
  - Support for common and custom/high-speed baud rates (e.g. 1M / `1000000`, 2M / `2000000`, ESP Boot `74880`).
  - Hardware (RTS/CTS) and software flow control options.
- **Terminal UI & Log Search/Filter**:
  - Integrated 5 eye-friendly themes (Catppuccin Mocha default, Tokyo Night, Nordic Frost, Obsidian Dark, Clean Light).
  - Built-in open-source monospace typography (JetBrains Mono, Fira Code, Cascadia Code, Ubuntu Mono).
  - **Live Log Filtering**: Include/Exclude modes with wildcard (*, ?) and regex support.
  - **Multi-Color Keyword Highlighting**: Custom keywords with 6 preset eye-comfort colors and full-spectrum color picker.
  - **Search Bar (Ctrl+F)**: Real-time match counting, navigation (Enter/Shift+Enter), wildcard (*, ?) and regex modes.
  - Auto-wrap and auto-scroll controls.
  - **Enter key shortcut**: Press `ENTER` anywhere in the terminal view or click the toolbar button to instantly jump to the newest log line and resume auto-scrolling.
- **Moserial Record Engine**:
  - Atomic log file creation with timestamp naming, fixed name, or custom name dialog.
  - Real-time duration and file size tracking.
  - Built-in ANSI escape code cleaning regex to preserve clean text logs.
- **AT Command Presets**:
  - 10 editable preset buttons with instant send and local storage persistence.
- **Data Transmission**:
  - ASCII and HEX modes, line ending selector (CRLF, LF, None).
  - Cyclic timer send with configurable interval.
- **Cross-Platform Packaging**:
  - Debian package (`.deb`), AppImage, macOS DMG, and Windows NSIS support.
