import path from "node:path";
import fs from "node:fs";
import { createScreen, setMouseCapture } from "./screen.js";
import { getTheme } from "./theme.js";
import { createHeader } from "./components/header.js";
import { createChatList } from "./components/chatList.js";
import { createChatView } from "./components/chatView.js";
import { createInputBox } from "./components/inputBox.js";
import { createStatusBar } from "./components/statusBar.js";
import { createHelpModal } from "./components/modals/helpModal.js";
import { createChatInfoModal } from "./components/modals/chatInfoModal.js";
import { createActionModal } from "./components/modals/actionModal.js";
import { createFileModal } from "./components/modals/fileModal.js";
import { createConfirmModal } from "./components/modals/confirmModal.js";
import { createImageViewerModal } from "./components/modals/imageViewerModal.js";
import { createVideoPlayerModal } from "./components/modals/videoPlayerModal.js";
import { state } from "../state.js";
import { config } from "../config.js";
import { entityCache, getEntityDisplayName, resolveEntity, canSendMessages } from "../telegram/entities.js";
import { fetchDialogs } from "../telegram/dialogs.js";
import { setMessagePalette } from "../telegram/formatter.js";
import { fetchHistory, sendMessage, editMessage, deleteMessages, sendFiles, downloadMedia, sendReaction, markAsRead, loadMessageImagePreview, downloadImageBuffer, renderMessageThumbnail, findFirstUnreadMessage, calculateRemainingUnreadCount } from "../telegram/messages.js";
import { startTelegramListener } from "../telegram/listener.js";
import { logout } from "../telegram/auth.js";
import { ensureDir, inspectLocalFile } from "../utils/storage.js";
import { formatFileSize } from "../utils/time.js";
import { parseSendFileArgs } from "../utils/commands.js";
import { isRightClick } from "../utils/mouse.js";
import { renderMediaPreloader } from "../utils/image.js";

/**
 * Запускает полноэкранный TUI-клиент Telegram.
 * @param {import("teleproto").TelegramClient} client
 * @param {object} me
 */
export async function startTui(client, me) {
    const theme = getTheme(config.theme);
    // Разметка сообщений и медиа-плашки красятся той же темой
    setMessagePalette(theme);
    /** @type {{ stop: () => void }|null} */
    let listener = null;
    const screen = createScreen({
        theme,
        onExit: () => {
            flushPendingMarkAsRead();
            listener?.stop();
        },
    });

    state.me = me;
    state.setConnectionStatus("connected");

    // 1. Создание визуальных компонентов
    const header = createHeader(screen, theme, {
        onHelp: () => {
            releaseInputs();
            helpModal.show();
        },
        onChatInfo: () => {
            if (state.activeChat) {
                releaseInputs();
                chatInfoModal.show(state.activeChat);
            } else {
                statusBar.showMessage("Сначала выберите чат слева!", "warning");
            }
        },
        onStatusClick: () => {
            const statusText = state.connectionStatus === "connected"
                ? "Подключение активно: MTProto онлайн"
                : `Статус сети: ${state.connectionStatus}`;
            statusBar.showMessage(statusText, "info");
        },
    });

    const statusBar = createStatusBar(screen, theme, {
        onFocusNext: () => moveFocus(1),
        onSelectOrSubmit: () => {
            const focused = detectFocus();
            if (focused === "input") {
                inputBox.textarea.emit("key enter");
            } else if (focused === "chatList") {
                chatList.list.emit("key enter");
            }
        },
        onFilterTabs: () => {
            releaseInputs();
            chatList.focus();
            statusBar.showMessage("Фильтры: нажмите 1-6 для выбора вкладки", "info");
        },
        onSearch: () => {
            chatList.searchBox.setValue("");
            chatList.searchBox.focus();
            screen.render();
        },
        onHelp: () => {
            releaseInputs();
            helpModal.show();
        },
        onAction: () => {
            if (!state.activeChat) {
                statusBar.showMessage("Сначала выберите чат слева!", "warning");
                return;
            }
            const msg = chatView.getTargetMessage();
            if (msg) {
                releaseInputs();
                actionModal.show(msg);
            }
        },
        onChatInfo: () => {
            if (state.activeChat) {
                releaseInputs();
                chatInfoModal.show(state.activeChat);
            } else {
                statusBar.showMessage("Сначала выберите чат слева!", "warning");
            }
        },
        onQuit: () => {
            releaseInputs();
            confirmModal.ask("Выйти из TuiGram?", () => {
                flushPendingMarkAsRead();
                listener?.stop();
                screen.destroy();
                process.exit(0);
            });
        },
    });

    // Модальные окна
    const helpModal = createHelpModal(screen, theme);
    const chatInfoModal = createChatInfoModal(screen, theme);
    const confirmModal = createConfirmModal(screen, theme);
    const fileModal = createFileModal(screen, theme, {
        onSendFile: (files, options) => sendFilesToActiveChat(files, options),
    });

    const imageViewerModal = createImageViewerModal(screen, theme, {
        onLoadFullImage: (msg) => downloadImageBuffer(client, msg.rawMessage),
        // Пока качается оригинал, показываем встроенную в сообщение миниатюру или прелоадер
        onRenderPlaceholder: (msg, size) => renderMessageThumbnail(msg.rawMessage, {
            maxWidth: size.maxWidth,
            maxHeight: size.maxHeight,
            useCache: false,
        }) || renderMediaPreloader(msg.rawMessage, {
            maxWidth: size.maxWidth,
            maxHeight: size.maxHeight,
            palette: {
                bg: theme.surface,
                border: theme.borders.fg,
                fg: theme.fg,
                accent: theme.accent,
                dim: theme.dim,
            },
        }),
    });

    const videoPlayerModal = createVideoPlayerModal(screen, theme, {
        onLoadVideoFile: async (msg, progressCallback) => {
            const downloadsDir = config.downloadsDir;
            ensureDir(downloadsDir);
            let fileName = `video_${msg.id}.mp4`;
            const doc = msg.rawMessage?.media?.document;
            if (doc?.attributes) {
                for (const attr of doc.attributes) {
                    if (attr.className === "DocumentAttributeFilename" && attr.fileName) {
                        fileName = `msg_${msg.id}_${attr.fileName}`;
                        break;
                    }
                }
            }
            const targetPath = path.join(downloadsDir, fileName);
            if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
                return targetPath;
            }
            const res = await downloadMedia(client, msg.rawMessage, {
                outputFile: targetPath,
                progressCallback,
            });
            return typeof res === "string" ? res : targetPath;
        },
        onRenderPlaceholder: (msg, size) => renderMessageThumbnail(msg.rawMessage, {
            maxWidth: size.maxWidth,
            maxHeight: size.maxHeight,
            useCache: false,
        }) || renderMediaPreloader(msg.rawMessage, {
            maxWidth: size.maxWidth,
            maxHeight: size.maxHeight,
            palette: {
                bg: theme.surface,
                border: theme.borders.fg,
                fg: theme.fg,
                accent: theme.accent,
                dim: theme.dim,
            },
        }),
    });

    const actionModal = createActionModal(screen, theme, {
        onAction: async (actionId, msg) => {
            if (!state.activeChat) return;
            const peerId = state.activeChat.peerId;

            switch (actionId) {
                case "play_video":
                    releaseInputs();
                    videoPlayerModal.play(msg);
                    break;
                case "reply":
                    if (inputBox.isDisabled()) {
                        statusBar.showMessage(inputBox.getDisabledReason() || "Отправка сообщений в этот чат недоступна", "warning");
                    } else {
                        inputBox.setContext("reply", msg);
                    }
                    break;
                case "edit":
                    if (inputBox.isDisabled()) {
                        statusBar.showMessage(inputBox.getDisabledReason() || "Редактирование в этом чате недоступно", "warning");
                    } else {
                        inputBox.setContext("edit", msg);
                    }
                    break;
                case "delete":
                    releaseInputs();
                    confirmModal.ask(`Удалить сообщение #${msg.id} для всех?`, async () => {
                        try {
                            await deleteMessages(client, peerId, [msg.id], { revoke: true });
                            state.removeMessages(state.activeChat.id, [msg.id]);
                            statusBar.showMessage(`Сообщение #${msg.id} удалено`, "success");
                        } catch (err) {
                            statusBar.showMessage(`Ошибка удаления: ${err.message}`, "error");
                        }
                    });
                    break;
                case "react_like":
                case "react_fire":
                case "react_heart": {
                    const emojiMap = { react_like: "👍", react_fire: "🔥", react_heart: "❤️" };
                    const emoji = emojiMap[actionId] || "👍";
                    try {
                        await sendReaction(client, peerId, msg.id, emoji);
                        statusBar.showMessage(`Поставлена реакция ${emoji}`, "success");
                    } catch (err) {
                        statusBar.showMessage(`Ошибка реакции: ${err.message}`, "error");
                    }
                    break;
                }
                case "download": {
                    try {
                        const downloadsDir = config.downloadsDir;
                        ensureDir(downloadsDir);
                        const fileName = `media_${msg.id}_${Date.now()}`;
                        const targetPath = path.join(downloadsDir, fileName);
                        statusBar.showMessage("Скачивание медиа-вложения...", "info");
                        const res = await downloadMedia(client, msg.rawMessage, { outputFile: targetPath });
                        const finalPath = typeof res === "string" ? res : targetPath;
                        statusBar.showMessage(`✓ Файл сохранён: ${finalPath}`, "success");
                    } catch (err) {
                        statusBar.showMessage(`Ошибка скачивания: ${err.message}`, "error");
                    }
                    break;
                }
                case "copy":
                    if (msg.text) {
                        inputBox.textarea.setValue(msg.text);
                        inputBox.focus();
                        statusBar.showMessage("Текст скопирован в поле ввода", "info");
                    }
                    break;
            }
        },
    });

    let readDebounceTimer = null;
    let pendingReadMaxId = 0;
    let pendingReadPeerId = null;

    /**
     * Отправляет подтверждение прочтения на сервер с дебаунсом, чтобы не спамить сеть при скролле.
     * @param {string|number|bigint} peerId
     * @param {number} maxId
     */
    function debouncedMarkAsRead(peerId, maxId) {
        pendingReadPeerId = peerId;
        if (maxId > pendingReadMaxId) {
            pendingReadMaxId = maxId;
        }
        if (readDebounceTimer) clearTimeout(readDebounceTimer);
        readDebounceTimer = setTimeout(() => {
            flushPendingMarkAsRead();
        }, 300);
    }

    /** Сбрасывает накопленный маркер прочтения на сервер без задержки. */
    function flushPendingMarkAsRead() {
        if (readDebounceTimer) {
            clearTimeout(readDebounceTimer);
            readDebounceTimer = null;
        }
        if (pendingReadPeerId && pendingReadMaxId > 0) {
            const peer = pendingReadPeerId;
            const id = pendingReadMaxId;
            pendingReadPeerId = null;
            pendingReadMaxId = 0;
            markAsRead(client, peer, id).catch(() => {});
        }
    }

    /**
     * Открывает диалог, загружает его историю и отображает сообщения.
     * @param {object} dialog
     */
    async function openDialog(dialog) {
        if (!dialog) return;
        flushPendingMarkAsRead();
        state.setActiveChat(dialog);
        chatView.resetReadState(dialog.readInboxMaxId || 0);

        // Если сообщения диалога ещё не подгружены в память, показываем прелоадер
        const cached = state.getMessages(dialog.id);
        if (!cached || cached.length === 0) {
            chatView.showLoading();
        }
        statusBar.showMessage(`Загрузка сообщений: ${dialog.title}...`, "info");

        try {
            // Загружаем всю пачку непрочитанных сообщений + запас из 20 прочитанных
            // для контекста и правильного позиционирования разделителя
            const limit = Math.max(50, Math.min(1000, (dialog.unreadCount || 0) + 20));
            const history = await fetchHistory(client, dialog.peerId, { limit });
            if (state.activeChat?.id !== dialog.id) return;
            const firstUnread = findFirstUnreadMessage(history.messages, dialog);
            state.setMessages(dialog.id, history.messages, { firstUnreadId: firstUnread?.id || null });
            statusBar.showMessage(`Чат: ${dialog.title}`, "info");
        } catch (err) {
            if (state.activeChat?.id === dialog.id) {
                chatView.setMessages([], false);
                statusBar.showMessage(`Ошибка загрузки: ${err.message}`, "error");
            }
        }
    }

    // 2. Список диалогов (левая панель)
    const chatList = createChatList(screen, theme, {
        onSelectDialog: (dialog) => openDialog(dialog),
        onTabChange: (tab) => {
            state.setFilterTab(tab);
        },
        onSearchChange: (query) => {
            state.setSearchQuery(query);
        },
    });

    // 3. Просмотр сообщений (правая центральная панель)
    const chatView = createChatView(screen, theme, {
        onLoadMoreHistory: async () => {
            if (!state.activeChat) return;
            const current = state.getMessages(state.activeChat.id);
            if (current.length === 0) return;

            const oldestId = current[0].id;
            try {
                statusBar.showMessage("Подгрузка более старых сообщений...", "info");
                const older = await fetchHistory(client, state.activeChat.peerId, {
                    limit: 30,
                    offsetId: oldestId,
                });
                if (older.messages.length > 0) {
                    state.setMessages(state.activeChat.id, older.messages, true);
                    statusBar.showMessage(`Загружено ${older.messages.length} предыдущих сообщений`, "info");
                }
            } catch (err) {
                statusBar.showMessage(`Ошибка пагинации: ${err.message}`, "error");
            }
        },
        onActionMenu: (msg) => {
            releaseInputs();
            actionModal.show(msg);
        },
        onSelectMessage: (msg) => {
            const preview = (msg.text || msg.mediaDescription || "вложение").replace(/\s+/g, " ").slice(0, 30);
            statusBar.showMessage(
                `Выделено #${msg.id}: "${preview}" · [Enter] или правый клик — действия`,
                "info",
                3000
            );
        },
        onOpenImage: (msg) => {
            releaseInputs();
            imageViewerModal.show(msg);
        },
        onPlayVideo: (msg) => {
            releaseInputs();
            videoPlayerModal.play(msg);
        },
        onFocusRequest: () => releaseInputs(),
        onMessagesRead: (maxVisibleId) => {
            if (!state.activeChat) return;
            const chatId = state.activeChat.id;
            const dialog = state.dialogs.find((d) => d.id === chatId);
            const messages = state.getMessages(chatId);
            const remainingCount = calculateRemainingUnreadCount(messages, maxVisibleId, dialog?.unreadCount);
            state.updateDialogUnread(chatId, remainingCount, maxVisibleId);
            debouncedMarkAsRead(state.activeChat.peerId, maxVisibleId);
        },
        onVisibleMessagesChanged: (visibleMsgs) => {
            if (!state.activeChat) return;
            fetchMissingImagePreviews(visibleMsgs, state.activeChat.id);
        },
    });

    // 4. Поле ввода (нижняя панель)
    const inputBox = createInputBox(screen, theme, {
        onSubmit: async (text, context) => {
            if (!state.activeChat) {
                statusBar.showMessage("Сначала выберите чат слева!", "warning");
                return;
            }

            const peerId = state.activeChat.peerId;

            if (context.mode === "edit" && context.target) {
                // Редактирование
                try {
                    statusBar.showMessage("Редактирование...", "info");
                    const edited = await editMessage(client, peerId, context.target.id, text);
                    state.updateMessage(state.activeChat.id, edited);
                    statusBar.showMessage("✓ Сообщение изменено", "success");
                } catch (err) {
                    statusBar.showMessage(`Ошибка редактирования: ${err.message}`, "error");
                }
            } else {
                // Отправка нового сообщения или ответа
                try {
                    const replyTo = context.mode === "reply" && context.target ? context.target.id : undefined;
                    const sent = await sendMessage(client, peerId, text, { replyTo });
                    state.addMessage(state.activeChat.id, sent);
                    statusBar.showMessage("✓ Отправлено", "success", 2000);
                } catch (err) {
                    statusBar.showMessage(`Ошибка отправки: ${err.message}`, "error");
                }
            }
        },
        onCancelContext: () => {
            statusBar.showMessage("Режим ответа/редактирования сброшен", "info", 2000);
        },
        onReplyLast: () => startReply(),
        onEditLast: () => startEdit(),
        onSlashCommand: (cmd, args) => {
            switch (cmd) {
                case "help":
                    releaseInputs();
                    helpModal.show();
                    break;
                case "info":
                    releaseInputs();
                    if (state.activeChat) chatInfoModal.show(state.activeChat);
                    else statusBar.showMessage("Сначала выберите чат!", "warning");
                    break;
                case "sendfile": {
                    // Формат: /sendfile путь [| путь ...] [-- подпись]
                    const { paths, caption } = parseSendFileArgs(args);
                    if (paths.length === 0) {
                        releaseInputs();
                        fileModal.show();
                        break;
                    }
                    if (!state.activeChat) {
                        statusBar.showMessage("Сначала выберите чат для отправки файла!", "warning");
                        break;
                    }

                    const files = [];
                    let invalid = null;
                    for (const entry of paths) {
                        const info = inspectLocalFile(entry);
                        if (!info.ok) {
                            invalid = info.error;
                            break;
                        }
                        files.push(info);
                    }
                    if (invalid) {
                        statusBar.showMessage(invalid, "error");
                        break;
                    }

                    sendFilesToActiveChat(files, { caption });
                    break;
                }
                case "clear":
                    if (state.activeChat) {
                        state.messagesByChat.set(state.activeChat.id, []);
                        chatView.setMessages([]);
                        statusBar.showMessage("Лента очищена на экране", "info");
                    }
                    break;
                case "logout":
                    releaseInputs();
                    confirmModal.ask("Вы действительно хотите выйти из аккаунта?", async () => {
                        await logout(client);
                        screen.destroy();
                        console.log("\nВы успешно вышли из аккаунта.");
                        process.exit(0);
                    });
                    break;
                default:
                    statusBar.showMessage(`Неизвестная команда: /${cmd}. Введите /help для справки.`, "warning");
            }
        },
    });

    // Переключение фокуса по клику мышью на любую из трех панелей
    chatList.container.on("click", (data) => {
        if (isRightClick(data)) return;
        if (screen.focused !== chatList.list && screen.focused !== chatList.searchBox) {
            releaseInputs();
            chatList.focus();
            statusBar.showMessage("Фокус: список чатов", "info", 2000);
            screen.render();
        }
    });

    chatView.container.on("click", (data) => {
        if (isRightClick(data)) return;
        if (screen.focused !== chatView.scrollBox) {
            releaseInputs();
            chatView.focus();
            statusBar.showMessage("Фокус: лента сообщений", "info", 2000);
            screen.render();
        }
    });

    inputBox.container.on("click", (data) => {
        if (isRightClick(data)) return;
        if (inputBox.isDisabled()) {
            statusBar.showMessage(inputBox.getDisabledReason() || "Отправка сообщений в этот чат недоступна", "warning", 3000);
            return;
        }
        if (screen.focused !== inputBox.textarea) {
            inputBox.focus();
            statusBar.showMessage("Фокус: поле ввода", "info", 2000);
            screen.render();
        }
    });

    // 5. Реакция на события состояния
    state.on("dialogs_updated", (dialogs) => {
        chatList.setDialogs(dialogs);
    });

    state.on("filter_changed", ({ dialogs }) => {
        chatList.setDialogs(dialogs);
    });

    state.on("search_changed", ({ dialogs }) => {
        chatList.setDialogs(dialogs);
    });

    state.on("active_chat_changed", (chat) => {
        activePreviewLoads.clear();
        header.updateInfo({
            me: state.me,
            status: state.connectionStatus,
            activeChat: chat,
            typingUser: state.getTypingUser(chat?.id),
        });

        // Проверяем возможность отправки сообщений в выбранный чат
        const sendCheck = canSendMessages(chat);
        inputBox.setDisabled(!sendCheck.canSend, sendCheck.reason);

        const msgs = chat ? state.getMessages(chat.id) : [];
        chatView.setSelected(null);
        if (chat && msgs.length > 0) {
            const firstUnread = findFirstUnreadMessage(msgs, chat);
            if (firstUnread) {
                chatView.setMessages(msgs, { firstUnreadId: firstUnread.id, autoScrollToBottom: false });
            } else {
                chatView.setMessages(msgs, true);
            }
        } else if (chat) {
            chatView.showLoading();
        } else {
            chatView.setMessages([], false);
        }
    });

    state.on("messages_updated", ({ chatId, messages, isPrepend, isUpdate, isNewMessage, firstUnreadId }) => {
        if (state.activeChat?.id === chatId) {
            if (firstUnreadId) {
                chatView.setMessages(messages, { firstUnreadId, autoScrollToBottom: false });
            } else {
                // Скроллим в самый низ только если это новое сообщение или первая загрузка чата.
                // При подгрузке старых сообщений (isPrepend) или фоновых обновлениях (isUpdate)
                // позиция скролла сохраняется!
                const shouldScrollToBottom = isNewMessage ? config.autoScroll : (!isPrepend && !isUpdate);
                chatView.setMessages(messages, shouldScrollToBottom);
            }
        }
    });

    state.on("typing_changed", ({ chatId, userName }) => {
        if (state.activeChat?.id === chatId) {
            header.updateInfo({
                me: state.me,
                status: state.connectionStatus,
                activeChat: state.activeChat,
                typingUser: userName,
            });
            setTimeout(() => {
                header.updateInfo({
                    me: state.me,
                    status: state.connectionStatus,
                    activeChat: state.activeChat,
                    typingUser: state.getTypingUser(chatId),
                });
            }, 5000);
        }
    });

    let previewBatchTimer = null;
    let pendingBatchChatId = null;

    /**
     * Планирует пакетное обновление интерфейса после догрузки группы превью.
     * @param {string} chatId
     */
    function scheduleBatchPreviewUpdate(chatId) {
        if (state.activeChat?.id !== chatId) return;
        pendingBatchChatId = chatId;
        if (previewBatchTimer) return;
        previewBatchTimer = setTimeout(() => {
            previewBatchTimer = null;
            if (state.activeChat?.id === pendingBatchChatId) {
                const current = state.getMessages(pendingBatchChatId);
                state.emit("messages_updated", {
                    chatId: pendingBatchChatId,
                    messages: current,
                    isPrepend: false,
                    isUpdate: true,
                });
            }
            pendingBatchChatId = null;
        }, 150);
    }

    /** Множество ID сообщений, для которых прямо сейчас выполняется загрузка превью. */
    const activePreviewLoads = new Set();

    /**
     * Фоново догружает превью изображений только для тех сообщений, которые видны на экране (Lazy Loading).
     * Обновления группируются пакетами, предотвращая фризы и блокировку основного потока.
     * @param {Array<object>} messages
     * @param {string} chatId
     */
    async function fetchMissingImagePreviews(messages, chatId) {
        if (!config.showImages || !messages || messages.length === 0) return;
        const toFetch = messages.filter((m) => m.isPreviewLoading && m.rawMessage && !activePreviewLoads.has(m.id));
        if (toFetch.length === 0) return;

        for (const msg of toFetch) {
            if (state.activeChat?.id !== chatId) break;
            activePreviewLoads.add(msg.id);
            try {
                const preview = await loadMessageImagePreview(client, msg.rawMessage);
                if (preview && state.activeChat?.id === chatId) {
                    msg.imagePreview = preview;
                    msg.isPreviewLoading = false;
                    scheduleBatchPreviewUpdate(chatId);
                }
            } catch {
                // Игнорируем сетевые ошибки фоновой загрузки превью
            } finally {
                activePreviewLoads.delete(msg.id);
            }
            // Даём event loop обработать пользовательский ввод и скролл
            await new Promise((resolve) => setImmediate(resolve));
        }
    }

    // 6. Подключение фонового слушателя MTProto событий
    listener = startTelegramListener(client);

    listener.on("new_message", ({ peerId, message }) => {
        state.addMessage(peerId, message);
        if (message.isPreviewLoading) {
            fetchMissingImagePreviews([message], peerId);
        }

        if (state.activeChat?.id !== peerId && !message.out) {
            const sender = message.senderName || "Новое сообщение";
            const preview = (message.text || "Вложение").slice(0, 30);
            statusBar.showMessage(`💬 ${sender}: "${preview}"`, "info", 5000);
        }
    });

    listener.on("edited_message", ({ peerId, message }) => {
        state.updateMessage(peerId, message);
    });

    listener.on("deleted_messages", ({ peerId, deletedIds }) => {
        state.removeMessages(peerId, deletedIds);
    });

    listener.on("typing", async ({ chatId, userId }) => {
        let cached = entityCache.get(userId);
        if (!cached && userId) {
            try {
                cached = await resolveEntity(client, userId);
            } catch {
                // Фоллбэк
            }
        }
        state.setTyping(chatId, cached ? getEntityDisplayName(cached) : "Собеседник");
    });

    /**
     * Единая точка отправки файлов: прогресс, отмена по Esc, режим «Ответ».
     * @param {Array<{filePath: string, name: string, size: number}>} files
     * @param {object} [options]
     * @param {string} [options.caption]
     * @param {boolean} [options.asDocument]
     */
    async function sendFilesToActiveChat(files, { caption = "", asDocument = false } = {}) {
        if (!state.activeChat) {
            statusBar.showMessage("Сначала выберите чат для отправки файла!", "warning");
            return;
        }
        if (inputBox.isDisabled()) {
            statusBar.showMessage(inputBox.getDisabledReason() || "Отправка файлов в этот чат недоступна", "warning");
            return;
        }
        if (!files || files.length === 0) return;

        const chat = state.activeChat;
        const label = files.length === 1
            ? files[0].name
            : `${files.length} файлов`;
        const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

        // Файл отправляется ответом, если активен режим Reply
        const ctx = inputBox.getContext?.() ?? { mode: null, target: null };
        const replyTo = ctx.mode === "reply" && ctx.target ? ctx.target.id : undefined;

        // Прогресс 0..1 от teleproto; троттлим по целым процентам и по времени
        let lastPercent = -1;
        let lastTick = 0;
        const progressCallback = (progress) => {
            const percent = Math.min(99, Math.round((progress || 0) * 100));
            const now = Date.now();
            if (percent === lastPercent || now - lastTick < 200) return;
            lastPercent = percent;
            lastTick = now;
            statusBar.showMessage(
                `Отправка ${label}: ${percent}% (${formatFileSize(totalSize)}) · [Esc] отменить`,
                "info",
                60000
            );
        };

        // teleproto проверяет isCanceled между чанками и бросает USER_CANCELED
        const cancel = () => {
            progressCallback.isCanceled = true;
            statusBar.showMessage("Отмена отправки...", "warning", 3000);
        };
        screen.key(["escape"], cancel);

        try {
            statusBar.showMessage(`Отправка ${label} (${formatFileSize(totalSize)})...`, "info", 60000);
            const sent = await sendFiles(
                client,
                chat.peerId,
                files.map((f) => f.filePath),
                { caption, replyTo, forceDocument: asDocument, progressCallback }
            );
            for (const msg of sent) {
                state.addMessage(chat.id, msg);
            }
            if (replyTo) inputBox.clearContext();
            statusBar.showMessage(`✓ Отправлено: ${label}`, "success");
        } catch (err) {
            const message = /USER_CANCELED/i.test(err?.message || "")
                ? `Отправка ${label} отменена`
                : `Ошибка отправки файла: ${err.message}`;
            statusBar.showMessage(message, /USER_CANCELED/i.test(err?.message || "") ? "warning" : "error");
        } finally {
            screen.unkey(["escape"], cancel);
        }
    }

    /**
     * Освобождает клавиатуру перед открытием модального окна.
     * blessed-поля ввода (textarea/textbox) держат screen.grabKeys и по blur
     * возвращают себе фокус — без этого модалка открывается «мёртвой».
     */
    function releaseInputs() {
        inputBox.release?.();
        chatList.release?.();
    }

    /** Включает режим ответа на выделенное сообщение, иначе — на последнее в ленте. */
    function startReply() {
        if (!state.activeChat) return;
        if (inputBox.isDisabled()) {
            statusBar.showMessage(inputBox.getDisabledReason() || "Отправка сообщений в этот чат недоступна", "warning");
            return;
        }
        const target = chatView.getTargetMessage();
        if (target) {
            inputBox.setContext("reply", target);
        }
    }

    /** Включает правку выделенного своего сообщения, иначе — последнего своего. */
    function startEdit() {
        if (!state.activeChat) return;
        if (inputBox.isDisabled()) {
            statusBar.showMessage(inputBox.getDisabledReason() || "Редактирование в этом чате недоступно", "warning");
            return;
        }
        const selected = chatView.getSelected();
        if (selected?.out) {
            inputBox.setContext("edit", selected);
            return;
        }
        const ownMsgs = state.getMessages(state.activeChat.id).filter((m) => m.out);
        if (ownMsgs.length > 0) {
            inputBox.setContext("edit", ownMsgs[ownMsgs.length - 1]);
        } else {
            statusBar.showMessage("В этом чате нет ваших сообщений для правки", "warning", 3000);
        }
    }

    // 7. Глобальные сочетания клавиш
    // Цикл фокуса: список чатов -> лента сообщений -> поле ввода -> список чатов.
    // Без ленты в цикле были недостижимы прокрутка, подгрузка истории и меню действий.
    const FOCUS_ORDER = ["chatList", "chatView", "input"];
    const FOCUS_TARGETS = {
        chatList: chatList,
        chatView: chatView,
        input: inputBox,
    };

    /**
     * Определяет текущую панель по реальному фокусу blessed.
     * Нужно потому, что textarea по Escape сама вызывает screen.rewindFocus().
     * @returns {"chatList"|"chatView"|"input"}
     */
    function detectFocus() {
        const el = screen.focused;
        if (el === inputBox.textarea) return "input";
        if (el === chatView.scrollBox) return "chatView";
        return "chatList";
    }

    function moveFocus(step) {
        let current = FOCUS_ORDER.indexOf(detectFocus());
        let nextIndex = (current + step + FOCUS_ORDER.length) % FOCUS_ORDER.length;
        let next = FOCUS_ORDER[nextIndex];
        if (next === "input" && inputBox.isDisabled()) {
            nextIndex = (nextIndex + step + FOCUS_ORDER.length) % FOCUS_ORDER.length;
            next = FOCUS_ORDER[nextIndex];
        }
        // Сначала выпускаем клавиатуру из активного поля ввода, иначе оно
        // заберёт фокус обратно своим обработчиком blur.
        releaseInputs();
        FOCUS_TARGETS[next].focus();
        statusBar.showMessage(
            next === "chatList" ? "Фокус: список чатов" :
            next === "chatView" ? "Фокус: лента сообщений (PageUp/PageDown, Ctrl+A — действия)" :
            "Фокус: поле ввода",
            "info",
            2000
        );
        screen.render();
    }

    screen.key(["tab"], () => moveFocus(1));
    screen.key(["S-tab"], () => moveFocus(-1));

    // Когда лента в фокусе, эти клавиши обрабатывает она сама — иначе прокрутка удваивается
    screen.key(["pageup", "C-u"], () => {
        if (!state.activeChat || screen.focused === chatView.scrollBox) return;
        chatView.scrollBox.scroll(-10);
        if ((chatView.scrollBox.childBase || 0) <= 0) {
            chatView.loadMore?.();
        }
        screen.render();
    });

    screen.key(["pagedown", "C-d"], () => {
        if (!state.activeChat || screen.focused === chatView.scrollBox) return;
        chatView.scrollBox.scroll(10);
        screen.render();
    });

    screen.key(["end", "C-end"], () => {
        if (!state.activeChat || screen.focused === inputBox.textarea) return;
        chatView.scrollToBottom();
    });

    screen.key(["f1", "?"], () => {
        releaseInputs();
        helpModal.show();
    });

    // Ctrl+I терминал шлёт как таб ("\t"), поэтому информация о чате — на Ctrl+P.
    screen.key(["C-p"], () => {
        if (state.activeChat) {
            releaseInputs();
            chatInfoModal.show(state.activeChat);
        } else {
            statusBar.showMessage("Сначала выберите чат слева!", "warning");
        }
    });

    screen.key(["C-o"], () => {
        if (state.activeChat) {
            if (inputBox.isDisabled()) {
                statusBar.showMessage(inputBox.getDisabledReason() || "Отправка файлов в этот чат недоступна", "warning");
                return;
            }
            releaseInputs();
            fileModal.show();
        } else {
            statusBar.showMessage("Сначала выберите чат слева!", "warning");
        }
    });

    screen.key(["C-r"], () => startReply());

    screen.key(["C-e"], () => startEdit());

    // Меню действий над выделенным сообщением из любой панели.
    // Когда лента в фокусе, Ctrl+A обрабатывает она сама.
    screen.key(["C-a"], () => {
        if (screen.focused === chatView.scrollBox) return;
        if (!state.activeChat) {
            statusBar.showMessage("Сначала выберите чат слева!", "warning");
            return;
        }
        const msg = chatView.getTargetMessage();
        if (msg) {
            releaseInputs();
            actionModal.show(msg);
        }
    });

    // Пока мышь захвачена приложением, терминал не даёт выделять текст для копирования
    screen.key(["f12"], () => {
        const enabled = !screen.mouseCaptured;
        setMouseCapture(screen, enabled);
        statusBar.showMessage(
            enabled
                ? "Мышь снова управляет интерфейсом"
                : "Мышь отдана терминалу — можно выделять и копировать текст. [F12] вернуть",
            enabled ? "info" : "warning",
            5000
        );
    });

    screen.key(["C-q"], () => {
        releaseInputs();
        confirmModal.ask("Выйти из TuiGram?", () => {
            flushPendingMarkAsRead();
            listener?.stop();
            screen.destroy();
            process.exit(0);
        });
    });

    // 8. Первоначальная загрузка диалогов
    header.updateInfo({ me, status: "connected", activeChat: null });
    statusBar.showMessage("Загрузка списка диалогов...", "info");
    chatList.focus();

    try {
        const dialogs = await fetchDialogs(client, { limit: 100 });
        state.setDialogs(dialogs);
        if (dialogs.length > 0) {
            chatList.selectIndex(0);
            await openDialog(dialogs[0]);
        } else {
            statusBar.showMessage("Список диалогов пуст", "info");
        }
    } catch (err) {
        statusBar.showMessage(`Ошибка загрузки диалогов: ${err.message}`, "error");
    }

    screen.render();
}
