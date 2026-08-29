/**
 * Утилиты форматирования дат, времени и размеров данных.
 */

/**
 * Преобразует unix-timestamp (секунды или Date) в объект Date.
 * @param {number|Date|string} time
 * @returns {Date}
 */
export function toDate(time) {
    if (!time) return new Date();
    if (time instanceof Date) return time;
    if (typeof time === "number") {
        // Если timestamp в секундах (как в Telegram), умножаем на 1000
        return new Date(time < 1e11 ? time * 1000 : time);
    }
    return new Date(time);
}

/**
 * Форматирует время для отображения в списке чатов (например, "14:32" или "29 авг").
 * @param {number|Date|string} time
 * @returns {string}
 */
export function formatChatTime(time) {
    if (!time) return "";
    const date = toDate(time);
    const now = new Date();

    const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

    if (isToday) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
        date.getDate() === yesterday.getDate() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
        return "Вчера";
    }

    const isSameYear = date.getFullYear() === now.getFullYear();
    if (isSameYear) {
        return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    }

    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/**
 * Форматирует время для сообщения (HH:MM).
 * @param {number|Date|string} time
 * @returns {string}
 */
export function formatMessageTime(time) {
    if (!time) return "";
    const date = toDate(time);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Форматирует полную дату и время (DD.MM.YYYY HH:MM:SS).
 * @param {number|Date|string} time
 * @returns {string}
 */
export function formatFullDateTime(time) {
    if (!time) return "";
    const date = toDate(time);
    return date.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}

/**
 * Возвращает строку разделителя даты для ленты сообщений (например "29 августа 2026").
 * @param {number|Date|string} time
 * @returns {string}
 */
export function formatDateDivider(time) {
    if (!time) return "";
    const date = toDate(time);
    return date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

/**
 * Форматирует размер файла в человекопонятный вид (KB, MB, GB).
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = (bytes / Math.pow(1024, i)).toFixed(1);
    return `${size} ${units[i]}`;
}

/**
 * Форматирует длительность в секундах (MM:SS или HH:MM:SS).
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
    if (!seconds) return "0:00";
    const sec = Math.floor(seconds);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m < 60) {
        return `${m}:${s.toString().padStart(2, "0")}`;
    }
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}:${remM.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
