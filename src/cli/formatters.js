import { cyan, green, yellow, magenta, gray, bold, blue, red } from "colorette";
import { formatFullDateTime } from "../utils/time.js";

/**
 * Форматирует строку диалога для консольного вывода таблицы.
 * @param {object} d
 * @returns {string}
 */
export function formatDialogRow(d) {
    const typeColor =
        d.type === "channel" ? magenta :
        d.type === "supergroup" || d.type === "group" ? cyan :
        d.type === "bot" ? yellow :
        d.type === "saved" ? green : blue;

    const pin = d.pinned ? "📌 " : "   ";
    const type = typeColor(`[${d.type.padEnd(10)}]`);
    const title = bold((d.title || "Без названия").slice(0, 32).padEnd(32));
    const unread = d.unreadCount > 0 ? green(` (+${d.unreadCount})`) : "";
    const id = gray(`id=${d.id}`);

    return `${pin}${type} ${title} ${id}${unread}`;
}

/**
 * Форматирует сообщение для вывода истории в консоль.
 * @param {object} m
 * @returns {string}
 */
export function formatHistoryMessage(m) {
    const time = gray(`[${formatFullDateTime(m.date)}]`);
    const id = gray(`#${m.id}`);
    const author = (m.out && !m.post) ? green(bold("Вы:")) : cyan(bold(`${m.senderName || (m.post ? "Канал" : "Собеседник")}:`));
    const text = m.text || (m.mediaDescription ? m.mediaDescription.replace(/\{[a-z0-9\-]+\}/gi, "") : "");
    const reply = m.replyToMsgId ? gray(` (в ответ на #${m.replyToMsgId})`) : "";
    const edited = m.editDate ? gray(" (изменено)") : "";

    return `${time} ${id} ${author}${reply} ${text}${edited}`;
}

/**
 * Форматирует живое событие для CLI потока.
 * @param {string} kind
 * @param {object} data
 * @returns {string}
 */
export function formatStreamEvent(kind, data) {
    const time = gray(`[${new Date().toLocaleTimeString()}]`);
    switch (kind) {
        case "new_message": {
            const m = data.message;
            const peer = yellow(`[${data.peerId}]`);
            const author = (m.out && !m.post) ? green("Вы") : cyan(m.senderName || (m.post ? "Канал" : "Собеседник"));
            const text = m.text || "[медиа]";
            return `${time} ${green("+ НОВОЕ")} ${peer} ${author}: ${text}`;
        }
        case "edited_message": {
            const m = data.message;
            const peer = yellow(`[${data.peerId}]`);
            return `${time} ${yellow("~ ИЗМЕНЕНО")} ${peer} #${m.id}: ${m.text}`;
        }
        case "deleted_messages": {
            const peer = yellow(`[${data.peerId}]`);
            return `${time} ${red("- УДАЛЕНО")} ${peer} IDs: ${data.deletedIds.join(", ")}`;
        }
        case "typing": {
            return `${time} ${gray("✍️ ПЕЧАТАЕТ")} чат: ${data.chatId}`;
        }
        default:
            return `${time} ${gray(kind)}`;
    }
}
