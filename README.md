# 🚀 TuiGram

**English** · [Русский](./README.ru.md)

[![npm](https://img.shields.io/npm/v/@emaxe/tuigram)](https://www.npmjs.com/package/@emaxe/tuigram)
[![node](https://img.shields.io/node/v/@emaxe/tuigram)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@emaxe/tuigram)](./LICENSE)
[![downloads](https://img.shields.io/npm/dm/@emaxe/tuigram)](https://www.npmjs.com/package/@emaxe/tuigram)
[![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)](#-installation)

A full-featured Telegram terminal client (TUI + CLI) for Node.js, built on the MTProto protocol (`teleproto`).

TuiGram lets you use Telegram entirely from the terminal: browse your dialog list split into categories, read conversations with formatting preserved (bold, italic, links, code highlighting), send messages, reply, edit, delete, react and send files.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🚀 TuiGram │ Alex Rivers (@alex_rivers) │ ● В сети                                          │
│ 👥 Tech Chat [1420 уч.]                        ✍️ Sam печатает...                           │
├──────────────────────────────┬──────────────────────────────────────────────────────────────┤
│ [1:Все] [2:ЛС] [3:Группы] …  │ ──────────────── Сегодня ────────────────                    │
│ [/] Поиск чатов...           │                                                              │
│ 📌 👤 Sam Lee · Let me know… │ Sam Lee [13:40]                                              │
│ 👥 Tech Chat · Nice work! [3]│   Have you checked the latest release?                       │
│ 🤖 Deploy Bot · Done!   12:10│                                                              │
│ 📢 News Channel · Дайд… [12] │ Sam Lee [13:41]                                              │
│ 👤 Mia Novak · 📷 Фото  9:41 │   📷 Фото · 1.8 MB                                           │
│ 💾 Избранное · Ссылка     вчр│                                                              │
│                              │ Вы [13:42] ✓✓                                                │
│                              │   ┌─ Ответ на сообщение #1042                                │
│                              │   Yes, testing it right now!                                 │
│                              │   👍 4  🔥 2                                                 │
│                              ├──────────────────────────────────────────────────────────────┤
│                              │ ↩️ Ответ на [Sam Lee]: "Have you checked…"  [Esc]            │
│                              │ Пишу ответ прямо здесь█                                      │
├──────────────────────────────┴──────────────────────────────────────────────────────────────┤
│ [Tab] Панель │ [Enter] Отправить │ [1-6] Вкладки │ [F1] Помощь │ [Ctrl+Q] Выход             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

> **Note on localization.** The TUI and CLI interface strings are currently in Russian only.
> The client itself works with any language of chat content. Localization of the UI is planned —
> see [CHANGELOG.md](./CHANGELOG.md).

---

## 📑 Table of contents

- [Features](#-features)
- [Screenshots](#-screenshots)
- [Installation](#-installation)
- [First run](#-first-run)
- [Where files are stored](#-where-files-are-stored)
- [Development](#-development)
- [Keyboard shortcuts](#️-keyboard-shortcuts)
- [Mouse controls](#-mouse-controls)
- [Slash commands](#-slash-commands-in-the-input-box)
- [Sending files and images](#-sending-files-and-images)
- [Themes](#-themes)
- [Inline image previews](#️-inline-image-previews)
- [Video playback in pseudographics](#-video-playback-in-pseudographics)
- [Proxy configuration](#-proxy-configuration)
- [Command line usage (CLI)](#️-command-line-usage-cli)
- [Project structure](#-project-structure)
- [Security](#-security)
- [Changelog](#-changelog)
- [Contributing](#-contributing)
- [License](#-license)

---

## ⚡ Features

- **A complete interactive TUI**:
  - Two-pane adaptive layout (dialog list on the left, history and input box on the right);
  - Keyboard and mouse control (left click selects a message, right click opens the action
    menu, clicking an image opens it full screen, clicking a video plays it, wheel scrolling);
  - Chat categories: All, Direct messages, Groups, Channels, Bots, Unread;
  - Instant search and filtering of chats by title and `@username` (`/`);
  - Live typing indicator ("… is typing");
  - Colored rendering of Telegram entities (bold, italic, monospace code, URLs, mentions, spoilers);
  - High-resolution inline image previews (Unicode Half-Block `▀` pixel art);
  - Terminal video and video note playback (Unicode Half-Block + synchronized audio);
  - Media attachment indicators (photo, video, document, voice, sticker, poll);
  - Message reactions (👍, 🔥, ❤️);
  - Infinite upward pagination of message history (`PageUp` / `Ctrl+U`);
  - Contextual quick-reply (`Ctrl+R`) and edit (`Ctrl+E`) modes;
  - Modal windows: Help (`F1` / `?`), Chat info (`Ctrl+P`), Action menu (`Ctrl+A`), Send file (`Ctrl+O`), Full-screen image viewer, Video player.
- **Standalone CLI mode**:
  - Send messages and files straight from the command line;
  - List dialogs and print chat history in the terminal;
  - Stream live updates.
- **Sensible configuration**:
  - Credentials and session live in OS user directories — the package stays read-only and survives updates;
  - Session and credentials are written with `0600` permissions.

---

## 🖼 Screenshots

TuiGram lives in the terminal, so instead of images here are exact text captures of its
screens. Labels, hints and output formats are taken from the interface code rather than
invented; the data in the examples is fictional.

Note that the interface strings are Russian — the screens below show the client as it
actually looks today.

The main window is shown at the top of this README. Below are the remaining screens.

### Chat search and filtering

`/` starts an instant search by title and `@username`; the digits `1`–`6` switch categories
(All, Direct messages, Groups, Channels, Bots, Unread).

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🚀 TuiGram │ Alex Rivers (@alex_rivers) │ ● В сети                                          │
├──────────────────────────────┬──────────────────────────────────────────────────────────────┤
│ [1:Все] [2:ЛС] [3:Группы] …  │ ──────────────── Сегодня ────────────────                    │
│ [/] tech█                    │                                                              │
│ 👥 Tech Chat · Nice work! [3]│ Sam Lee [11:02]                                              │
│ 📢 Tech Digest · Выпуск…     │   Let me know how it goes.                                   │
│ 🤖 TechSupport Bot · Ок      │                                                              │
│                              │ Вы [11:05] ✓✓                                                │
│ 3 из 214 чатов               │   Will do 👍                                                 │
│                              ├──────────────────────────────────────────────────────────────┤
│                              │ Введите сообщение…█                                          │
└──────────────────────────────┴──────────────────────────────────────────────────────────────┘
```

<details>
<summary><b>Help — <code>F1</code> / <code>?</code></b></summary>

The full list of shortcuts and slash commands, right inside the client.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 🚀 TuiGram — Горячие клавиши и управление                                │
│                                                                          │
│ Навигация и фокус:                                                       │
│   [Tab] / [Shift+Tab]   Фокус: Чаты → Сообщения → Ввод                   │
│   [↑] / [↓]             Перемещение по списку чатов                      │
│   [Enter]               Открыть чат / Загрузить историю                  │
│   [PageUp] / [Ctrl+U]   Прокрутка вверх / старая история                 │
│                                                                          │
│ Вкладки фильтрации диалогов:                                             │
│   [1] Все чаты      [2] Личные (ЛС)      [3] Группы                      │
│   [4] Каналы        [5] Боты             [6] Непрочитанные               │
│   [/] Поиск чатов по названию/username                                   │
│                                                                          │
│ Работа с сообщениями:                                                    │
│   [Enter]   Отправить      [Ctrl+R]  Ответить (Reply)                    │
│   [Ctrl+J]  Перенос строки [Ctrl+E]  Редактировать сообщение             │
│   [Ctrl+A]  Меню действий  [Ctrl+O]  Отправить файл / фото               │
│   [Ctrl+P]  Инфо о чате    [Esc]     Закрыть окно / режим                │
│                                                                          │
│ Слэш-команды в поле ввода:                                               │
│   /help  /info  /sendfile  /sendfile <путь>  /clear  /logout             │
│                                                                          │
│ Выход:                                                                   │
│   [Ctrl+Q] или [Ctrl+C]   Безопасный выход из клиента                    │
│                                                                          │
│                         [ Закрыть ]                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

</details>

<details>
<summary><b>Message action menu — <code>Ctrl+A</code></b></summary>

Reply, edit, delete, reactions and attachment download. "Edit" and
"Download" appear only where they actually apply.

```
┌──────────────────────────────────────────────────────┐
│ ⚡ Действия с сообщением #1042                       │
│ Sam Lee: Have you checked the latest release?        │
├──────────────────────────────────────────────────────┤
│ ↩️  Ответить (Reply)                                 │
│ ✏️  Редактировать текст                              │
│ 🗑️  Удалить сообщение                                │
│ 👍  Поставить реакцию 👍                             │
│ 🔥  Поставить реакцию 🔥                             │
│ ❤️  Поставить реакцию ❤️                             │
│ 📥  Скачать медиа-вложение                           │
│ 📋  Скопировать текст в ввод                         │
├──────────────────────────────────────────────────────┤
│ [↑↓] Выбор   [Enter] Выполнить   [Esc] Отмена        │
└──────────────────────────────────────────────────────┘
```

</details>

<details>
<summary><b>Send file — <code>Ctrl+O</code></b></summary>

Several paths separated by `|` are sent as a single album. The line under the
checkbox states exactly what the file will become on Telegram's side.

```
┌────────────────────────────────────────────────────────────┐
│ 📤 Отправка файла или документа                            │
├────────────────────────────────────────────────────────────┤
│ Путь к файлу (несколько — через |)         [Ctrl+F] Обзор  │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ~/Desktop/photo.png | ~/Desktop/chart.png█             │ │
│ └────────────────────────────────────────────────────────┘ │
│ Подпись (необязательно):                                   │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Две картинки с релиза                                  │ │
│ └────────────────────────────────────────────────────────┘ │
│ [ ] Как файл, без сжатия      [Ctrl+D]                     │
│ ✓ photo.png · 2.4 MB · уйдёт как фото                      │
├────────────────────────────────────────────────────────────┤
│            [ Отправить ]        [ Отмена ]                 │
│ [Tab] Поля  [Enter] Далее  [Ctrl+F] Обзор  [Esc] Выход     │
└────────────────────────────────────────────────────────────┘
```

</details>

<details>
<summary><b>File browser — <code>Ctrl+F</code></b></summary>

Navigate folders with the arrow keys; the size of the highlighted file is shown
at the bottom.

```
┌──────────────────────────────────────────────────────────┐
│ 📁 Выбор файла: /Users/alex/Desktop                      │
├──────────────────────────────────────────────────────────┤
│   ..                                             <папка> │
│   screenshots/                                   <папка> │
│ ▸ photo.png                                       2.4 MB │
│   chart.png                                       812 KB │
│   report.pdf                                      1.1 MB │
│   archive.zip                                    18.7 MB │
├──────────────────────────────────────────────────────────┤
│ photo.png · 2.4 MB                                       │
│ [↑↓] Навигация  [Enter] Выбрать  [Esc] Назад             │
└──────────────────────────────────────────────────────────┘
```

</details>

<details>
<summary><b>Chat info — <code>Ctrl+P</code></b></summary>

ID, type, username, member count and description.

```
┌──────────────────────────────────────────────────────┐
│ ℹ Информация о чате                                  │
├──────────────────────────────────────────────────────┤
│ Название:        Tech Chat                           │
│ Тип:             supergroup                          │
│ ID:              -1001234567890                      │
│ Username:        @techchat                           │
│ Участников:      1420                                │
│ Уведомления:     Включены                            │
│                                                      │
│ О чате / О себе:                                     │
│   Чат про терминальные клиенты и MTProto.            │
├──────────────────────────────────────────────────────┤
│                    [ Закрыть ]                       │
└──────────────────────────────────────────────────────┘
```

</details>

### Command line mode

<details>
<summary><b>CLI command output</b></summary>

**`tuigram dialogs --limit 8`**

```
📂 Загрузка диалогов (макс. 8)...

📌 [user      ] Sam Lee                          id=100200301
   [supergroup] Tech Chat                        id=-1001234567890 (+3)
   [bot       ] Deploy Bot                       id=100200302
   [channel   ] News Channel                     id=-1009876543210 (+12)
   [saved     ] Избранное                        id=100200300
   [user      ] Mia Novak                        id=100200303 (+1)
   [group     ] Team Terminal                    id=-400112233
   [user      ] Nina Ivanova                     id=100200304

Всего получено: 8 диалогов
```

**`tuigram history @sam_lee --limit 5`**

```
💬 Загрузка истории для @sam_lee (макс. 5 сообщений)...

[29.08.2026, 11:02:14] #1040 Sam Lee: Let me know how it goes.
[29.08.2026, 11:05:41] #1041 Вы: Will do 👍
[29.08.2026, 13:40:07] #1042 Sam Lee: Have you checked the latest release?
[29.08.2026, 13:41:22] #1043 Sam Lee: 📷 Фото
[29.08.2026, 13:42:55] #1044 Вы (в ответ на #1042): Yes, testing it right now! (изменено)

Всего отображено: 5 сообщений
```

**`tuigram listen`**

```
🟢 Подключено как: Alex Rivers (@alex_rivers)
Слушаю обновления в реальном времени... Нажмите Ctrl+C для выхода.

[13:40:07] + НОВОЕ [-1001234567890] Sam Lee: Have you checked the latest release?
[13:41:19] ✍️ ПЕЧАТАЕТ чат: -1001234567890
[13:42:55] + НОВОЕ [-1001234567890] Вы: Yes, testing it right now!
[13:43:30] ~ ИЗМЕНЕНО [-1001234567890] #1044: Yes, testing it right now! 🚀
[13:44:02] - УДАЛЕНО [123456789] IDs: 1039, 1038
```

</details>

---

## 📦 Installation

### Option 1: global install from npm (recommended)

```bash
npm install -g @emaxe/tuigram
```

The `tuigram` command is then available from any directory.

### Option 2: one-off run without installing

```bash
npx @emaxe/tuigram
```

### Option 3: from source (for development)

```bash
git clone https://github.com/emaxe/tuigram.git
cd tuigram
npm install
npm start
```

---

## ⚙️ First run

### 1. Telegram API credentials

Get your `api_id` and `api_hash` at [https://my.telegram.org](https://my.telegram.org) (*API development tools*), then run:

```bash
tuigram init
```

The command asks for both keys and stores them with `0600` permissions. For scripts and CI there is a non-interactive form:

```bash
tuigram init --api-id 1234567 --api-hash 0123456789abcdef0123456789abcdef
```

Alternatively, use the `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` environment variables — they take precedence over the settings file.

### 2. Authorization and launch

```bash
tuigram
```

On first launch TuiGram asks for your phone number, the confirmation code from Telegram and your 2FA password (if enabled). The session is then saved and subsequent launches are instant.

You can also authorize separately with `tuigram login`.

> **In a non-interactive environment** (CI, a pipe, `< /dev/null`) phone login is impossible:
> `tuigram login` exits immediately with a clear error instead of hanging. If a session
> already exists, the command simply reports who you are signed in as and returns exit
> code `0`. For automation, drop a ready `session.txt` into the data directory
> (`tuigram paths` prints the location).

---

## 📂 Where files are stored

Nothing is written inside the package itself — this matters for global installs, where `node_modules` is usually not writable and is wiped on update.

| What | macOS / Linux | Windows |
|---|---|---|
| Settings (`.env`) | `~/.config/tuigram/.env` | `%APPDATA%\tuigram\.env` |
| Session | `~/.local/share/tuigram/session.txt` | `%LOCALAPPDATA%\tuigram\session.txt` |
| Downloads from chats | `~/.local/share/tuigram/downloads/` | `%LOCALAPPDATA%\tuigram\downloads\` |

To inspect the actual paths and configuration state:

```bash
tuigram paths
```

Locations can be overridden with `TUIGRAM_CONFIG_DIR` and `TUIGRAM_DATA_DIR` (`XDG_CONFIG_HOME` / `XDG_DATA_HOME` are honored too).

**Settings precedence** (top to bottom, first match wins):
1. process environment variables;
2. `.env` in the project root — only when running from a repository clone;
3. `~/.config/tuigram/.env` — the main file for an installed CLI.

A session from an older installation (`<project>/data/session.txt`) is migrated to the new location automatically on first run — no need to log in again.

---

## 🛠 Development

When running from a repository clone, an interactive launcher menu is available:

```bash
./run.sh      # or npm run menu
```

It offers a convenient choice of mode (TUI, login, dialogs, send, tests, cleanup).

Tests and a check of the future npm package contents:

```bash
npm test                        # unit tests
node scripts/check-package.js   # verifies that .env and the session do not leak into the package
```

---

## ⌨️ Keyboard shortcuts

| Shortcut | Scope | Action |
|---|---|---|
| `Tab` / `Shift+Tab` | Global | Cycle focus: dialog list → message feed → input box |
| `↑` / `↓` | Dialog list | Select a chat |
| `↑` / `↓`, `k` / `j` | Message feed | Move the selection between messages |
| `Enter` | Dialog list | Open the selected chat and load its history |
| `Enter` | Message feed | Action menu for the selected message |
| `1` .. `6` | Dialog list | Switch category: `1:All`, `2:DM`, `3:Groups`, `4:Channels`, `5:Bots`, `6:Unread` |
| `/` | Dialog list | Search / filter chats |
| `Enter` | Input box | Send the typed message |
| `Ctrl+J` | Input box | Insert a line break without sending |
| `Ctrl+R` | Chat / Input | Reply to the selected message, or the last one |
| `Ctrl+E` | Chat / Input | Edit the selected message of yours, or your last one |
| `Ctrl+A` | Global | Context action menu (reactions, delete, download, reply) |
| `Ctrl+O` | Global | Send a file / photo / document |
| `Ctrl+F` | Send dialog | File browser (navigate folders) |
| `Ctrl+D` | Send dialog | Send uncompressed, as a document |
| `Ctrl+P` | Global | Info about the current chat (ID, members, links) |
| `PageUp` / `Ctrl+U` | History | Scroll up / load older history |
| `PageDown` / `Ctrl+D` | History | Scroll down |
| `Home` / `End` | History | Jump to the top (loads history) / to the last message |
| `Esc` | Modals | Close the modal / cancel reply or edit |
| `F1` or `?` | Global | Help window with every shortcut |
| `F12` | Global | Hand the mouse to the terminal for text selection (press again to return) |
| `Ctrl+Q` / `Ctrl+C` | Global | Safely exit the client |

---

## 🖱 Mouse controls

TuiGram fully supports mouse interaction in terminals that support mouse reporting (macOS Terminal, iTerm2, Alacritty, Kitty, Windows Terminal, Linux virtual terminals):

| Action | Target | Result |
|---|---|---|
| Left click | Left / Middle / Bottom panel | Focus the clicked panel |
| Left click | Chat item in dialog list | Immediately select and open the chat |
| Left click | Filter tabs `1:Все` .. `6:Непроч` | Switch chat category filter |
| Left click | Search bar `[/]` | Focus search box and clear placeholder |
| Wheel scroll | Dialog list / Message feed | Smooth scroll (scrolling up to the top loads older messages) |
| **Left click** | **Message in the feed** | **Select the message — a `▌` bar marks it on the left** |
| **Right click** | **Message in the feed** | **Open the action menu (reactions, reply, edit, download, delete)** |
| **Left click** | **Image preview inside a message** | **Open the image full screen** |
| **Left click** | **Video preview inside a message** | **Play video in modal player** |
| Left click | Empty area of the feed | Focus the message feed |
| Left click | Header logo 🚀 | Open Help window |
| Left click | Header active chat title | Open Chat Info window |
| Left click | Header connection badge | Show active network status |
| Left click | Input context bar | Cancel reply/edit mode, trigger `[Ctrl+R]` / `[Ctrl+E]` or insert `/` |
| Left click | Status bar items | Trigger corresponding action (`[Tab]`, `[F1]`, `[Ctrl+A]`, `[Ctrl+Q]`, etc.) |
| Click | Outside any modal window | Dismiss / close modal |
| Click | Buttons in modals | Click buttons (`[ Отправить ]`, `[ Отмена ]`, `[ Закрыть ]`, toggle checkboxes) |

### Message selection

A left click selects a message: a colored `▌` bar appears to the left of all its lines.
`↑` / `↓` (and `k` / `j`) move the selection between messages and scroll it into view;
reaching the topmost message loads the previous page of history. Plain scrolling stays on
`PageUp` / `PageDown`, the wheel and `Home` / `End`.

The selected message becomes the target for actions: `[Enter]` and right click open the
action menu, `[Ctrl+R]` replies to it, `[Ctrl+E]` edits it (when it is yours). With nothing
selected these actions apply to the last message in the chat, as before.

### Full-screen image viewer

A left click on a preview opens the image across the whole terminal. The thumbnail that
already arrived with the message is shown instantly, then it is replaced by the full-size
version as soon as it downloads. For videos and documents the largest available thumbnail
is shown — the file itself is never downloaded. Close with `[Esc]`, `[Q]`, `[Enter]` or a
click anywhere.

### Right click and terminal text selection

> **macOS Terminal.app** captures the right click for its own context menu and never passes
> it to the application. Use `[Enter]` or `[Ctrl+A]` on the selected message there. Right
> click works in iTerm2, Ghostty, Alacritty, Kitty and Windows Terminal.

While the app captures the mouse, the terminal cannot select text for copying. Press `[F12]`
to hand the mouse back to the terminal, and `[F12]` again to return control to the interface.

---

## 💬 Slash commands in the input box

Quick commands are available in the message input box (they start with `/`):

- `/help` — open the help window;
- `/info` — detailed information about the current chat;
- `/sendfile` — open the send-file dialog;
- `/sendfile <path>` — send a file right away;
- `/sendfile <path> -- <caption>` — file with a caption;
- `/sendfile <path> | <path> -- <caption>` — an album of several files;
- `/clear` — clear the on-screen message feed;
- `/logout` — sign out of the Telegram account.

---

## 📎 Sending files and images

Three ways: the `Ctrl+O` dialog, the `/sendfile` slash command, and the `sendfile` console command.

**The send dialog (`Ctrl+O`)**

- `Ctrl+F` — file browser: navigate folders with the arrow keys, `Enter` enters a folder or picks a file, `Esc` goes back. The size of the highlighted file is shown at the bottom.
- You can also just type a path: `~/Desktop/photo.png`, quoted paths and escaped spaces are understood — so dragging a file into the terminal works.
- Multiple files — separate them with `|` in the path field (or add them one by one via the browser). Up to 10 are sent as a single album.
- `Ctrl+D` — send uncompressed, as a document. Useful when the original image quality matters.
- The line under the checkbox shows exactly what will be sent: `✓ photo.png · 2.4 MB · will be sent as a photo`.
- If reply mode (`Ctrl+R`) is active at that moment, the file is sent **as a reply** to that message.

**What goes as a photo and what as a document**

Telegram accepts `.png`, `.jpg`, `.jpeg` as compressed photos; video formats (`.mp4`, `.mov`, `.mkv`, etc.) as video; everything else, including `.webp` and `.heic`, as a document. The "As a file, uncompressed" checkbox (`Ctrl+D`, or `--as-file` in the CLI) forces anything to be sent as a document.

**Progress and cancellation**

The status bar shows a percentage during upload. `Esc` aborts the transfer.

**Downloading incoming media**

`Ctrl+A` on a message → "Download attachment". The file is saved to the downloads directory.

---

## 🎨 Themes

The theme is set in `.env`:

```env
TUI_THEME=default   # dark (default)
TUI_THEME=nord      # Nord
TUI_THEME=light     # light
```

All colors are given as hex values and are reduced to the xterm-256 palette (indices ≥ 16).
Named colors (`blue`, `cyan`, `gray`) are deliberately avoided: they occupy indices 0–15,
which the terminal theme repaints as it pleases — that is why a blue background could render
as teal and gray text could disappear entirely.

The contrast of every "text on background" pair is verified by an automated WCAG test
(threshold 3:1) **after** conversion to xterm-256 — that is, exactly as the user will see it.

---

## 🖼️ Inline image previews

TuiGram displays color image previews directly in the chat history using high-resolution Unicode half-block characters (`▀` `U+2580`). Each character cell renders 2 vertical subpixels with 24-bit RGB colors, producing crisp, proportional pixel art that scrolls naturally with messages and works across all terminals.

Previews are enabled by default and can be configured in `.env`:

```env
# Enable/disable image previews in chat (true/false)
SHOW_IMAGES=true

# Maximum preview size in terminal characters (width x height)
IMAGE_MAX_WIDTH=36
IMAGE_MAX_HEIGHT=14
```

---

## 🎬 Video playback in pseudographics

TuiGram supports video playback directly in the terminal using Unicode Half-Block characters (`▀`) and 24-bit RGB truecolor, with synchronized audio playback via system audio or `ffplay`.

### Setup
Video playback requires `ffmpeg`. You can install it and enable video playback automatically with a single command:
```bash
tuigram install-video
```
This command checks for existing `ffmpeg`, downloads a static binary if needed, and sets `ENABLE_VIDEO=true` in your `.env`.

### Configuration in `.env`:
```env
# Enable video playback in terminal (true/false)
ENABLE_VIDEO=true

# Playback frame rate (FPS, 1..30, default: 15)
VIDEO_FPS=15

# Play audio track (true/false)
VIDEO_AUDIO=true

# Optional custom binary paths
# FFMPEG_PATH=/usr/local/bin/ffmpeg
# FFPLAY_PATH=/usr/local/bin/ffplay
```

### Controls:
- Click on any video message preview or choose **▶️ Play video** from the action menu (`[Enter]` / right click).
- `[Space]` — Pause / Resume
- `[r]` — Replay from beginning
- `[Esc]` or `[q]` — Close video player

---

## 🌐 Proxy configuration

TuiGram supports routing MTProto connections through HTTP (including HTTPS CONNECT) and SOCKS5/SOCKS4 proxies — both with and without username/password authentication.

Proxy options can be configured in `.env` (or via environment variables):

**Single URL:**
```env
PROXY_URL=http://127.0.0.1:8080
PROXY_URL=http://user:password@proxy.example.com:8080
PROXY_URL=socks5://127.0.0.1:1080
PROXY_URL=socks5://user:password@127.0.0.1:1080
```

**Or separate variables:**
```env
PROXY_TYPE=http         # http, https, socks5, socks4
PROXY_HOST=127.0.0.1
PROXY_PORT=8080
PROXY_USERNAME=user     # optional
PROXY_PASSWORD=password # optional
PROXY_TIMEOUT=10        # timeout in seconds (default: 10)
```

Standard environment variables `HTTPS_PROXY`, `HTTP_PROXY`, and `ALL_PROXY` are also supported as fallbacks.
The active proxy status can be inspected using `tuigram paths`.

---

## 🛠️ Command line usage (CLI)

TuiGram can be used as a set of console utilities (when running from a repository
clone, substitute `node bin/tuigram.js` for `tuigram`):

```bash
# Authorization
tuigram login

# Install video playback dependencies & enable video in .env
tuigram install-video

# List dialogs
tuigram dialogs --limit 30

# View chat history (@username, ID, or `me` for Saved Messages)
tuigram history @sam_lee --limit 20
tuigram history me

# Send a text message
tuigram send me "Hello from the terminal!"
tuigram send @friend "See you at 18:00"

# Send a file (multiple paths are sent as one album)
tuigram sendfile me ./screenshot.png
tuigram sendfile me ~/a.png ~/b.png --caption "Two pictures"
tuigram sendfile me ~/photo.png --as-file   # uncompressed, as a document

# Live stream of real-time updates
tuigram listen
```

---

## 📁 Project structure

```
TuiGram/
├── bin/
│   └── tuigram.js               # CLI executable
├── src/
│   ├── index.js                 # Main entry point (TUI / CLI router)
│   ├── config.js                # User directory paths and .env loader
│   ├── state.js                 # Reactive centralized state store
│   ├── telegram/
│   │   ├── client.js            # MTProto client creation and management
│   │   ├── socket.js            # MTProto network transport and proxy tunneling (HTTP/SOCKS5)
│   │   ├── auth.js              # Interactive login wizard and 2FA
│   │   ├── dialogs.js           # Fetching, filtering and searching dialogs
│   │   ├── messages.js          # History loading, sending, editing, files, reactions
│   │   ├── listener.js          # Live background MTProto event listener
│   │   ├── entities.js          # Peer parsing, chat types and entity cache
│   │   └── formatter.js         # Telegram entities -> Blessed ANSI formatting
│   ├── ui/
│   │   ├── screen.js            # Blessed screen management
│   │   ├── theme.js             # Themes (Default Dark, Nord, Light)
│   │   ├── app.js               # Main interface coordinator
│   │   └── components/
│   │       ├── header.js        # Top header and connection status
│   │       ├── chatList.js      # Dialog list with scrolling, tabs and search
│   │       ├── chatView.js      # Message feed with autoscroll and formatting
│   │       ├── inputBox.js      # Input box with reply/edit banner and history
│   │       ├── statusBar.js     # Bottom hint line and toasts
│   │       └── modals/
│   │           ├── helpModal.js     # Help window
│   │           ├── chatInfoModal.js # Chat info window
│   │           ├── actionModal.js   # Message action menu
│   │           ├── fileModal.js     # Send-file dialog
│   │           ├── imageViewerModal.js # Full-screen image viewer
│   │           ├── videoPlayerModal.js # Video player modal
│   │           └── confirmModal.js  # Confirmation dialog
│   ├── cli/
│   │   ├── cliCommands.js       # Standalone CLI commands
│   │   ├── init.js              # tuigram init / paths — setup and diagnostics
│   │   ├── videoSetup.js        # tuigram install-video — ffmpeg setup & config
│   │   └── formatters.js        # Console table and log formatters
│   └── utils/
│       ├── image.js             # Image decoding, resizing and Half-Block ANSI rendering
│       ├── video.js             # Video playback utilities, ffmpeg detection & decoding
│       ├── storage.js           # File operations and session persistence
│       └── time.js              # Time and date formatting
├── scripts/
│   └── check-package.js         # Pre-publish npm package check
├── test/
│   └── unit.test.js             # Unit tests
├── .env.example                 # Configuration example
├── run.sh                       # Development launcher menu
├── AGENTS.md                    # Codebase rules (source of truth for AI agents)
├── CHANGELOG.md
├── LICENSE
├── package.json
├── README.md
└── README.ru.md
```

> The published npm package contains only `bin/`, `src/`, `README.md`, `README.ru.md`,
> `CHANGELOG.md`, `LICENSE` and `.env.example` — see the `files` field in `package.json`.

---

## 🔒 Security

**Where the authorization lives.** A single file — `session.txt` in the data directory
(`~/.local/share/tuigram/` or `%LOCALAPPDATA%\tuigram\`; the location can be changed with
`TUIGRAM_DATA_DIR` and inspected with `tuigram paths`). It holds an MTProto `StringSession`:
the format version, the data-center number, its address and port, and a 256-byte `authKey`,
base64-encoded. Neither your password nor the confirmation code is stored there.

- The session file and the settings file are written with `0600` permissions — owner read/write only.
- Neither the session nor the credentials live inside the package: `npm update` does not touch them.
- `data/` and `.env` are in `.gitignore` and excluded from the npm package via the `files` field;
  `node scripts/check-package.js` fails if a secret ends up in the build anyway.
- **The `authKey` is stored in the clear**: base64 is an encoding, not encryption.
  Anyone who reads the file gets full access to the account without the phone, the code or 2FA.
  Do not put it in shared folders or unencrypted backups. If the file leaks,
  terminate the session in an official client (*Settings → Devices*) — that revokes the key
  on the server and makes the string useless.
- `/logout` in the TUI revokes the key on the server and deletes the session file.
- No data is sent to third-party servers — the client connects directly to the official
  Telegram MTProto servers.

---

## 📜 Changelog

All notable changes are recorded in [CHANGELOG.md](./CHANGELOG.md).
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versioning follows [SemVer](https://semver.org/).

---

## 🤝 Contributing

Bug reports and pull requests are welcome:
[issues](https://github.com/emaxe/tuigram/issues).

Before submitting changes:

```bash
npm test                        # unit tests must be green
node scripts/check-package.js   # .env and the session must not reach the package
```

Codebase rules for humans and AI agents live in [AGENTS.md](./AGENTS.md) — the single
source of truth for architecture, style, testing and security. If you work with
Claude Code, Cursor or Copilot, start there.

Both README versions (`README.md` and `README.ru.md`) must be updated together.

---

## 📄 License

[MIT](./LICENSE) © Maksim Klisin

TuiGram is an unofficial client. The project is not affiliated with,
nor endorsed by, Telegram Messenger Inc.
