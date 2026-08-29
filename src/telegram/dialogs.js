import { idToString, toMarkedId, detectChatType, getEntityDisplayName, entityCache } from "./entities.js";
import { describeMedia } from "./formatter.js";

/**
 * Преобразует объект Dialog из библиотеки в плоскую структуру для UI.
 * @param {object} dialog
 * @returns {object}
 */
export function normalizeDialog(dialog) {
    const entity = dialog.entity || {};
    const message = dialog.message;
    const type = detectChatType(dialog);
    const title = getEntityDisplayName(entity) || dialog.title || dialog.name || "Чат";

    if (entity.id) {
        entityCache.set(entity.id, entity);
    }

    let lastMessageText = "";
    if (message) {
        if (message.message) {
            lastMessageText = message.message;
        } else if (message.media) {
            // Срезаем разметку blessed: цвета теперь hex, поэтому "#" обязателен
            // в классе символов, иначе превью показывало литеральное "{#e0af68-fg}"
            lastMessageText = describeMedia(message.media).replace(/\{\/?[#\w-]+\}/g, "");
        }
    }

    return {
        id: toMarkedId(dialog.id),
        peerId: dialog.id,
        type,
        title,
        username: entity.username || null,
        pinned: Boolean(dialog.pinned),
        archived: Boolean(dialog.archived),
        unreadCount: dialog.unreadCount || 0,
        unreadMentionsCount: dialog.unreadMentionsCount || 0,
        folderId: dialog.folderId || 0,
        date: dialog.date ? dialog.date * 1000 : (message?.date ? message.date * 1000 : Date.now()),
        isMuted: Boolean(dialog.dialog?.notifySettings?.muteUntil > 0),
        lastMessage: message ? {
            id: message.id,
            date: message.date ? message.date * 1000 : Date.now(),
            text: lastMessageText,
            out: Boolean(message.out),
            fromId: idToString(message.fromId?.userId || message.fromId?.channelId || message.fromId?.chatId),
            mediaType: message.media?.className || null,
        } : null,
        entity,
        rawDialog: dialog,
    };
}

/**
 * Загружает список всех диалогов пользователя.
 * @param {import("teleproto").TelegramClient} client
 * @param {object} [options]
 * @param {number} [options.limit=100]
 * @param {boolean} [options.archived]
 * @returns {Promise<Array<object>>}
 */
export async function fetchDialogs(client, { limit = 100, archived } = {}) {
    const params = { limit };
    if (typeof archived === "boolean") {
        params.archived = archived;
    }

    const dialogs = [];
    for await (const dialog of client.iterDialogs(params)) {
        dialogs.push(normalizeDialog(dialog));
    }

    // Сортировка: сначала закреплённые, затем по дате последнего сообщения
    dialogs.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return (b.date || 0) - (a.date || 0);
    });

    return dialogs;
}

/**
 * Фильтрует список диалогов по выбранной категории.
 * @param {Array<object>} dialogs
 * @param {"all"|"users"|"groups"|"channels"|"bots"|"unread"|"archived"} filterTab
 * @returns {Array<object>}
 */
export function filterDialogsByTab(dialogs, filterTab = "all") {
    if (!dialogs) return [];

    switch (filterTab) {
        case "users":
            return dialogs.filter((d) => !d.archived && (d.type === "user" || d.type === "saved"));
        case "groups":
            return dialogs.filter((d) => !d.archived && (d.type === "group" || d.type === "supergroup"));
        case "channels":
            return dialogs.filter((d) => !d.archived && d.type === "channel");
        case "bots":
            return dialogs.filter((d) => !d.archived && d.type === "bot");
        case "unread":
            return dialogs.filter((d) => !d.archived && (d.unreadCount > 0 || d.unreadMentionsCount > 0));
        case "archived":
            return dialogs.filter((d) => d.archived);
        case "all":
        default:
            return dialogs.filter((d) => !d.archived);
    }
}

/**
 * Выполняет поиск по списку диалогов по строке запроса.
 * @param {Array<object>} dialogs
 * @param {string} query
 * @returns {Array<object>}
 */
export function searchDialogs(dialogs, query) {
    if (!query || !query.trim()) return dialogs;
    const q = query.trim().toLowerCase();

    return dialogs.filter((d) => {
        const titleMatch = d.title && d.title.toLowerCase().includes(q);
        const usernameMatch = d.username && d.username.toLowerCase().includes(q);
        const idMatch = d.id && d.id.includes(q);
        const lastMsgMatch = d.lastMessage?.text && d.lastMessage.text.toLowerCase().includes(q);
        return titleMatch || usernameMatch || idMatch || lastMsgMatch;
    });
}
