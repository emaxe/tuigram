import { EventEmitter } from "node:events";
import { filterDialogsByTab, searchDialogs } from "./telegram/dialogs.js";

/**
 * Централизованное реактивное состояние TuiGram.
 */
class AppState extends EventEmitter {
    constructor() {
        super();
        this.me = null;
        this.connectionStatus = "connecting"; // "connecting" | "connected" | "disconnected"

        /** @type {Array<object>} */
        this.dialogs = [];
        this.currentFilterTab = "all"; // "all" | "users" | "groups" | "channels" | "bots" | "unread" | "archived"
        this.searchQuery = "";
        this.selectedDialogIndex = 0;

        /** @type {object|null} */
        this.activeChat = null;

        /** @type {Map<string, Array<object>>} */
        this.messagesByChat = new Map();

        /** @type {Map<string, boolean>} */
        this.hasMoreHistory = new Map();

        /** @type {Map<string, { name: string, expiresAt: number }>} */
        this.typingByChat = new Map();

        /** Режим ответа на сообщение */
        this.replyTarget = null;
        /** Режим редактирования своего сообщения */
        this.editTarget = null;

        /** Индекс выбранного сообщения в ленте (для контекстного меню) */
        this.selectedMessageIndex = -1;

        /** Черновики ввода по ID чата */
        this.draftsByChat = new Map();
    }

    /**
     * Возвращает отфильтрованный список диалогов с учётом активной вкладки и поискового запроса.
     * @returns {Array<object>}
     */
    getVisibleDialogs() {
        const tabFiltered = filterDialogsByTab(this.dialogs, this.currentFilterTab, this.activeChat?.id);
        if (!this.searchQuery) return tabFiltered;
        return searchDialogs(tabFiltered, this.searchQuery);
    }

    /**
     * Устанавливает список всех диалогов.
     * @param {Array<object>} dialogs
     */
    setDialogs(dialogs) {
        this.dialogs = dialogs;
        this.emit("dialogs_updated", this.getVisibleDialogs());
    }

    /**
     * Устанавливает статус подключения.
     * @param {"connecting"|"connected"|"disconnected"} status
     */
    setConnectionStatus(status) {
        this.connectionStatus = status;
        this.emit("status_changed", status);
    }

    /**
     * Переключает вкладку фильтрации диалогов.
     * @param {"all"|"users"|"groups"|"channels"|"bots"|"unread"|"archived"} tab
     */
    setFilterTab(tab) {
        this.currentFilterTab = tab;
        this.selectedDialogIndex = 0;
        this.emit("filter_changed", { tab, dialogs: this.getVisibleDialogs() });
    }

    /**
     * Устанавливает строку поиска.
     * @param {string} query
     */
    setSearchQuery(query) {
        this.searchQuery = query;
        this.selectedDialogIndex = 0;
        this.emit("search_changed", { query, dialogs: this.getVisibleDialogs() });
    }

    /**
     * Устанавливает активный открытый чат.
     * @param {object} dialog
     */
    setActiveChat(dialog) {
        this.activeChat = dialog;
        this.replyTarget = null;
        this.editTarget = null;
        this.selectedMessageIndex = -1;
        this.emit("active_chat_changed", dialog);
    }

    /**
     * Обновляет счётчик непрочитанных сообщений и максимальный прочитанный ID диалога.
     * @param {string} chatId
     * @param {number} unreadCount
     * @param {number} [readInboxMaxId]
     */
    updateDialogUnread(chatId, unreadCount, readInboxMaxId) {
        const dialog = this.dialogs.find((d) => d.id === chatId);
        if (!dialog) return;

        const countChanged = dialog.unreadCount !== unreadCount;
        const idChanged = typeof readInboxMaxId === "number" && readInboxMaxId > (dialog.readInboxMaxId || 0);

        if (countChanged || idChanged) {
            dialog.unreadCount = Math.max(0, unreadCount);
            if (dialog.unreadCount === 0) {
                dialog.unreadMentionsCount = 0;
            }
            if (idChanged) {
                dialog.readInboxMaxId = readInboxMaxId;
            }
            this.emit("dialogs_updated", this.getVisibleDialogs());
        }
    }

    /**
     * Получает список сообщений для указанного чата.
     * @param {string} chatId
     * @returns {Array<object>}
     */
    getMessages(chatId) {
        return this.messagesByChat.get(chatId) || [];
    }

    /**
     * Устанавливает или дополняет список сообщений для чата.
     * @param {string} chatId
     * @param {Array<object>} newMessages
     * @param {boolean|object} [options=false] Если true — добавляет старые сообщения в начало
     */
    setMessages(chatId, newMessages, options = false) {
        const prepend = typeof options === "boolean" ? options : Boolean(options?.prepend);
        const firstUnreadId = typeof options === "object" ? (options?.firstUnreadId || null) : null;
        const existing = this.messagesByChat.get(chatId) || [];
        let combined = [];

        if (prepend) {
            // Добавление старой истории в начало
            const existingIds = new Set(existing.map((m) => m.id));
            const uniqueOlder = newMessages.filter((m) => !existingIds.has(m.id));
            combined = [...uniqueOlder, ...existing];
        } else {
            // Слияние новых сообщений
            const map = new Map();
            for (const m of existing) map.set(m.id, m);
            for (const m of newMessages) map.set(m.id, m);
            combined = Array.from(map.values());
        }

        // Сортировка сообщений по дате / ID (хронологически снизу вверх)
        combined.sort((a, b) => (a.date || 0) - (b.date || 0) || (a.id - b.id));

        this.messagesByChat.set(chatId, combined);
        this.emit("messages_updated", { chatId, messages: combined, isPrepend: prepend, isUpdate: false, firstUnreadId });
    }

    /**
     * Добавляет одно входящее или отправленное сообщение.
     * @param {string} chatId
     * @param {object} message
     */
    addMessage(chatId, message) {
        const list = this.getMessages(chatId);
        const exists = list.some((m) => m.id === message.id);
        if (!exists) {
            list.push(message);
            list.sort((a, b) => (a.date || 0) - (b.date || 0) || (a.id - b.id));
            this.messagesByChat.set(chatId, list);
        }

        // Обновляем последнее сообщение диалога в списке чатов
        const dialog = this.dialogs.find((d) => d.id === chatId);
        if (dialog) {
            dialog.lastMessage = {
                id: message.id,
                date: message.date,
                text: message.text,
                out: message.out,
                fromId: message.fromId,
                mediaType: message.media?.className || null,
            };
            dialog.date = message.date;
            if (this.activeChat?.id !== chatId && !message.out) {
                dialog.unreadCount = (dialog.unreadCount || 0) + 1;
            }
            // Перемещаем чат наверх
            this.dialogs.sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                return (b.date || 0) - (a.date || 0);
            });
            this.emit("dialogs_updated", this.getVisibleDialogs());
        }

        this.emit("messages_updated", { chatId, messages: list, isPrepend: false, isNewMessage: true });
    }

    /**
     * Обновляет изменённое сообщение.
     * @param {string} chatId
     * @param {object} updatedMessage
     */
    updateMessage(chatId, updatedMessage) {
        const list = this.getMessages(chatId);
        const index = list.findIndex((m) => m.id === updatedMessage.id);
        if (index !== -1) {
            list[index] = { ...list[index], ...updatedMessage };
            this.emit("messages_updated", { chatId, messages: list, isPrepend: false, isUpdate: true });
        }
    }

    /**
     * Удаляет сообщения по их ID.
     * @param {string} chatId
     * @param {Array<number>} deletedIds
     */
    removeMessages(chatId, deletedIds) {
        const list = this.getMessages(chatId);
        const idSet = new Set(deletedIds);
        const filtered = list.filter((m) => !idSet.has(m.id));
        this.messagesByChat.set(chatId, filtered);
        this.emit("messages_updated", { chatId, messages: filtered, isPrepend: false, isUpdate: true });
    }

    /**
     * Устанавливает статус набора текста в чате.
     * @param {string} chatId
     * @param {string} userName
     */
    setTyping(chatId, userName) {
        this.typingByChat.set(chatId, {
            name: userName,
            expiresAt: Date.now() + 5000,
        });
        this.emit("typing_changed", { chatId, userName });
    }

    /**
     * Возвращает имя пользователя, который сейчас печатает в чате.
     * @param {string} chatId
     * @returns {string|null}
     */
    getTypingUser(chatId) {
        const info = this.typingByChat.get(chatId);
        if (!info) return null;
        if (Date.now() > info.expiresAt) {
            this.typingByChat.delete(chatId);
            return null;
        }
        return info.name;
    }
}

export const state = new AppState();
