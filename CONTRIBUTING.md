# Contributing to ViliCom

Thank you for your interest in contributing to **ViliCom**! We welcome bug reports, feature requests, documentation improvements, and pull requests.

## Development Workflow

### Prerequisites
- **Rust** (1.85+): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Tauri CLI v2**: `cargo install tauri-cli --version "^2.0"`
- System dependencies: see the [README.md](README.md#源码编译指南) for your operating system.

### Running in Development Mode
```bash
cargo tauri dev
```

### Running Tests
Before submitting a PR, make sure all automated unit tests pass:
```bash
cd src-tauri
cargo test
cargo check
```

## Project Structure Overview

```text
vilicom/
├── assets/                       # Branding assets & master app icons
│   └── branding/
├── docs/                         # Architecture specifications & original design prototype
│   ├── dev_prompt.md             # AI development prompts
│   └── prototype.html            # UI design prototype reference
├── src/                          # Frontend Web UI (clean HTML/CSS/JS)
│   ├── css/
│   │   ├── app.css               # Component layout & styles
│   │   └── themes.css            # Catppuccin, Tokyo Night, Nordic, Obsidian, Clean Light
│   ├── js/
│   │   └── app.js                # Frontend IPC event bus & UI controller
│   ├── icon.png                  # Window favicon
│   └── index.html                # Main UI markup
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands.rs           # Tauri IPC command definitions
│   │   ├── serial_manager.rs     # Core 3-thread serial pipeline & unit tests
│   │   ├── lib.rs                # App setup & plugin builder
│   │   └── main.rs               # Entrypoint
│   ├── icons/                    # Multi-platform app icons (.ico, .icns, .png)
│   ├── Cargo.toml
│   └── tauri.conf.json
└── README.md
```

## Code Style & Guidelines
- **Rust**: Follow standard `rustfmt` formatting.
- **Frontend**: Keep HTML, CSS, and JS modular and standard-compliant.
- **Commit Messages**: Follow standard conventional commits format (e.g. `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`).

## License
By contributing to ViliCom, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
