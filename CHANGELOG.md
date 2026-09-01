# Changelog

[English](./CHANGELOG.md) · [Русский](./CHANGELOG.ru.md)

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Planned

- English localization of the TUI and CLI interface strings.

## [1.3.0] — 2026-09-01

### Added

- Comprehensive mouse support across the entire TUI:
  - Direct panel focus on click (left panel for dialog list, middle panel for message feed, bottom panel for input box).
  - Single-click dialog selection and immediate opening.
  - Smooth mouse wheel scrolling for dialog list and message feed with automatic loading of older history when scrolling up past the top.
  - Clicking on any message opens its contextual action menu (reactions, replies, edits, downloads, deletion).
  - Clickable filter tabs (`1:Все`, `2:ЛС`, `3:Группы`, `4:Каналы`, `5:Боты`, `6:Непроч`) and search input focusing.
  - Interactive status bar buttons (`[Tab]`, `[1-6]`, `[/]`, `[F1]`, `[Ctrl+A]`, `[Ctrl+P]`, `[Ctrl+Q]`).
  - Interactive header elements: click logo for Help, click chat title for Chat Info, click status badge for network state.
  - Interactive context bar in input box: click to cancel reply/edit mode or trigger shortcuts.
  - Full mouse navigation inside modals (button clicks, checkbox toggles, file browsing) and dismissing any modal by clicking outside its boundary.
- Robust terminal mouse mode initialization (`\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[?1015h`) supporting modern terminals (macOS Terminal.app, iTerm2, Alacritty, Kitty, Windows Terminal, xterm).
- Pure mouse coordinate calculation utilities (`src/utils/mouse.js`) with full test coverage in `test/unit.test.js`.

## [1.2.0] — 2026-09-01

### Added

- Display color image previews directly in chat messages using high-resolution Unicode half-block characters (`▀` `U+2580`) with instant rendering of Telegram stripped thumbnails (`PhotoStrippedSize`).
- Configuration options `SHOW_IMAGES`, `IMAGE_MAX_WIDTH`, and `IMAGE_MAX_HEIGHT` to control image preview rendering in `.env` and `config.js`.

## [1.1.0] — 2026-08-31

### Added

- Support for HTTP/HTTPS (via HTTP CONNECT) and SOCKS5/SOCKS4 proxies with optional username and password authentication.
- Proxy configuration options via `.env` (`PROXY_URL` or `PROXY_TYPE`/`PROXY_HOST`/`PROXY_PORT`/`PROXY_USERNAME`/`PROXY_PASSWORD`) and standard environment variables (`HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY`).
- Display of active proxy status with password masking in `tuigram paths`.

## [1.0.1] — 2026-08-29

Documentation and packaging only — no runtime changes.

### Added

- English `README.md` and Russian `README.ru.md` with a language switcher, a table of
  contents and a contributing section.
- `CHANGELOG.md` and `CHANGELOG.ru.md` in Keep a Changelog format.
- A "Screenshots" section: ASCII captures of the main window, chat search, the help,
  action, send-file, file-browser and chat-info modals, plus sample CLI output.
- `AGENTS.md` with `.agents/rules/` — codebase rules for humans and AI agents
  (architecture, code style, neo-blessed UI, tests, secrets, docs and release),
  with thin pointers for Copilot, Cursor and Claude Code.

### Changed

- The npm package now ships `README.ru.md`, `CHANGELOG.md` and `CHANGELOG.ru.md`;
  `scripts/check-package.js` treats them as required files.

## [1.0.0] — 2026-08-29

First public release.

### Added

**TUI**

- Two-pane adaptive terminal interface: dialog list on the left, message history
  and input box on the right.
- Keyboard and mouse control — clicks and wheel scrolling.
- Dialog categories (`1`–`6`): All, Direct messages, Groups, Channels, Bots, Unread.
- Instant chat search and filtering by title and `@username` (`/`).
- Live typing indicator for the active chat.
- Rendering of Telegram entities with color: bold, italic, monospace code, code blocks,
  URLs, mentions, hashtags and spoilers.
- Media attachment indicators: photo, video, document, voice, sticker, poll, geo,
  contact, venue, dice and web page previews.
- Message reactions (👍, 🔥, ❤️) via the action menu.
- Infinite upward pagination of message history (`PageUp` / `Ctrl+U`).
- Reply (`Ctrl+R`) and edit (`Ctrl+E`) modes with a context banner above the input box.
- Modal windows: help (`F1` / `?`), chat info (`Ctrl+P`), message actions (`Ctrl+A`),
  send file (`Ctrl+O`), file browser (`Ctrl+F`) and confirmation dialogs.
- Slash commands in the input box: `/help`, `/info`, `/sendfile`, `/clear`, `/logout`.
- Downloading incoming media through the message action menu.
- Three themes selectable via `TUI_THEME`: `default` (dark), `nord`, `light`.
  All colors are hex values that reduce to xterm-256 indices ≥ 16, so a terminal's
  own palette cannot repaint them.

**CLI**

- `tuigram init` — interactive and non-interactive (`--api-id`, `--api-hash`)
  storage of Telegram API credentials.
- `tuigram paths` — prints the configuration and data paths plus the current state.
- `tuigram login` — login wizard with 2FA support.
- `tuigram dialogs [--limit N]` — list of dialogs.
- `tuigram history <peer> [--limit N]` — chat history, where `<peer>` is a `@username`,
  an ID, or `me` for Saved Messages.
- `tuigram send <peer> <text>` — send a text message.
- `tuigram sendfile <peer> <path...> [--caption ...] [--as-file]` — send files;
  up to 10 paths are sent as a single album.
- `tuigram listen` — live stream of MTProto updates.
- `./run.sh` — interactive launcher menu for development.

**Configuration and storage**

- Credentials and session are stored in OS user directories, not inside the package,
  so a global install stays read-only and survives `npm update`.
- Path overrides via `TUIGRAM_CONFIG_DIR` / `TUIGRAM_DATA_DIR`, with `XDG_CONFIG_HOME`
  and `XDG_DATA_HOME` honored.
- Settings precedence: process environment → project `.env` (repository clone only)
  → the user `.env`.
- Automatic migration of a session from the legacy `<project>/data/session.txt` location.

**Security**

- The session file and the settings file are written with `0600` permissions.
- `scripts/check-package.js` — a pre-publish check that fails if `.env`, `data/`,
  a session string, logs or tests would end up in the npm tarball; it also verifies
  the shebang and the executable bit on `bin/tuigram.js`.
- `/logout` revokes the authorization key on the server and deletes the local session file.

**Tests**

- Unit tests (`npm test`) covering time formatting, peer parsing and entity types,
  Telegram-entity rendering, slash-command argument parsing, `.env` writing and
  credential validation, non-interactive login guards, and package configuration.
- A WCAG contrast test (3:1 threshold) applied to every theme **after** conversion
  to xterm-256 — the colors are checked exactly as the user sees them.

[Unreleased]: https://github.com/emaxe/tuigram/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/emaxe/tuigram/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/emaxe/tuigram/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/emaxe/tuigram/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/emaxe/tuigram/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/emaxe/tuigram/releases/tag/v1.0.0
