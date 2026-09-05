# Changelog

[English](./CHANGELOG.md) · [Русский](./CHANGELOG.ru.md)

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Planned

- English localization of the TUI and CLI interface strings.

## [1.6.0] — 2026-09-05

### Added

- Message loading preloader: switching to a dialog now displays an animated loading indicator until message history is fetched, preventing premature "No messages yet" placeholder.
- Scroll-to-bottom button ("↓ Вниз") and `End` / `G` keyboard shortcuts to quickly jump to the latest messages in the active chat; button appears when scrolling up and hides automatically at the bottom.
- Automatic selection and opening of the first dialog upon application startup.
- Message input field locking for channels and groups where the user lacks posting permissions (showing lock icon 🔒 and restriction reason).

## [1.5.1] — 2026-09-03

### Fixed

- Message sender attribution across TUI and CLI: channel posts now display the channel title (along with author signature if present) instead of generic "Собеседник" or marking owner posts as "Вы ✓✓".
- Sender names in direct 1-on-1 chats and groups are now properly resolved and cached from Telegram entities instead of falling back to "Собеседник".
- Live typing indicator in the active chat now displays the typing user's display name instead of generic "Собеседник".
- Contextual reply preview bar in the input box displays the channel name when replying to channel posts.
- Resolution of Telegram Peer objects and channel IDs in `entityCache` and `parsePeer`.

## [1.5.0] — 2026-09-02

### Added

- Video playback support in ANSI pseudographics (Unicode Half-Block) with synchronized audio track.
- New CLI command `tuigram install-video` to check and automatically install static `ffmpeg` binaries and enable video in `.env`.
- New configuration settings in `.env`: `ENABLE_VIDEO`, `VIDEO_FPS`, `VIDEO_AUDIO`, `FFMPEG_PATH`, `FFPLAY_PATH`.
- Video player modal with playback controls (`[Space]` for pause/resume, `[r]` to replay, `[Esc]` / `[q]` to exit).
- Interactive video playback via message action menu and by clicking on video message preview in chat view.

### Changed

- Enhanced unread message badge in dialog list: counters above 99 are shown as `[99+]`, and the right block (time and unread badge) is always right-aligned, truncating long chat titles with an ellipsis when space is constrained.

### Fixed

- Opening a chat with unread messages now scrolls and positions directly at the first unread message with an unread separator divider instead of always jumping to the last message.
- Unread message badge and counter in the dialog list now dynamically decrease in real-time as messages are scrolled and read in the active chat.

## [1.4.0] — 2026-09-01

### Added

- Message selection in the chat feed: a left click marks a message with a colored `▌` bar
  along all of its lines. `↑` / `↓` (and `k` / `j`) move the selection between messages and
  scroll it into view; reaching the topmost message loads the previous page of history.
- The message action menu now opens with the right mouse button, and with `[Enter]` on the
  selected message. Previously any click opened it, so a message could not simply be picked.
- The selected message became the target for actions: `[Ctrl+R]` replies to it, `[Ctrl+E]`
  edits it (when it is yours), `[Ctrl+A]` and the status bar `[Ctrl+A]` button open the menu
  for it. With nothing selected the previous behaviour applies — the last message in the chat.
- Full-screen image viewer opened by clicking an image preview: the thumbnail that arrived
  with the message is shown instantly, then replaced by the full-size version. For videos and
  documents the largest thumbnail is used and the file itself is never downloaded. Close with
  `[Esc]`, `[Q]`, `[Enter]` or a click; the image is re-rendered when the terminal is resized.
- The `[Ctrl+A]` shortcut (action menu) now works from every panel, including the input box.
- `[F12]` temporarily hands the mouse back to the terminal so text can be selected and
  copied, and restores the capture when pressed again.

### Fixed

- A modal window was closed by the very click that opened it: blessed delivers a click to the
  element first and to the screen immediately after. As a result the status bar buttons
  `[F1]`, `[Ctrl+A]`, `[Ctrl+P]`, `[Ctrl+Q]`, the header logo and the chat title did not work
  with the mouse at all, and the action menu only stayed open when the click happened to land
  inside the future modal rectangle.
- Clicking a message hit the wrong message in a scrolled feed: the position was read from
  `getScroll()`, which adds a blessed-internal offset to the actual content shift.
- The mouse wheel scrolled the feed twice per notch (a custom handler on top of the built-in
  blessed one), and scrolling up from the bottom of the feed did nothing for the first notches.
- `PageUp` / `PageDown` scrolled the feed twice as far while it had focus.
- Clicks on the input hints were off by about 10 cells: clicking `[Ctrl+E] Правка` triggered
  commands, and clicking the "Введите сообщение…" text switched to reply mode.
- A right click behaved like a left one: it opened chats in the list and pressed status bar
  buttons and filter tabs.
- The feed layout map drifted by one line per message, so click coordinates diverged from the
  actual text the longer the history grew.
- A full-screen image render could evict and replace the same image's thumbnail in the feed:
  the render size is now part of the pseudo-graphics cache key.

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

[Unreleased]: https://github.com/emaxe/tuigram/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/emaxe/tuigram/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/emaxe/tuigram/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/emaxe/tuigram/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/emaxe/tuigram/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/emaxe/tuigram/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/emaxe/tuigram/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/emaxe/tuigram/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/emaxe/tuigram/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/emaxe/tuigram/releases/tag/v1.0.0
