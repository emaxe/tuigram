/**
 * Резолвинг пиров, типов сущностей и безопасная работа с ID Telegram.
 */
import { getPeerId } from "teleproto/Utils.js";

/**
 * Приводит идентификатор Telegram к строковому представлению.
 * @param {unknown} value
 * @returns {string}
 */
export function idToString(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "bigint" || typeof value === "number") return value.toString();
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
        if (typeof value.value !== "undefined") return idToString(value.value);
        if (typeof value.userId !== "undefined") return idToString(value.userId);
        if (typeof value.channelId !== "undefined") return idToString(value.channelId);
        if (typeof value.chatId !== "undefined") return idToString(value.chatId);
        if (typeof value.toString === "function") return value.toString();
    }
    return String(value);
}

/**
 * Приводит пир (Peer* из MTProto, сущность или готовый ID) к "маркированному"
 * строковому ID в том же формате, в каком его отдаёт teleproto для диалогов:
 * пользователь -> "123", группа -> "-456", канал/супергруппа -> "-100789".
 *
 * Без этого ID сообщения (немаркированный channelId) не совпадает с ID диалога
 * и входящие сообщения групп/каналов не попадают в открытый чат.
 * @param {unknown} peer
 * @returns {string}
 */
export function toMarkedId(peer) {
    if (peer === null || peer === undefined) return "";
    try {
        const id = getPeerId(peer);
        if (id !== null && id !== undefined && id !== "") return String(id);
    } catch {
        // Не Peer-объект — падаем на обычное строковое представление
    }
    return idToString(peer);
}

/**
 * Преобразует пользовательский ввод в формат, понятный MTProto.
 * @param {string|number|bigint} raw "@username" | "username" | "-1001234567890" | "me"
 * @returns {string|bigint}
 */
export function parsePeer(raw) {
    const value = String(raw || "").trim();
    if (!value) throw new Error("Не указан идентификатор чата (peer)");
    if (value === "me" || value === "self") return "me";
    if (/^-?\d+$/.test(value)) {
        return BigInt(value);
    }
    return value.startsWith("@") ? value : `@${value}`;
}

/**
 * Определяет тип диалога.
 * @param {object} dialog
 * @returns {"user"|"bot"|"group"|"supergroup"|"channel"|"saved"|"unknown"}
 */
export function detectChatType(dialog) {
    if (!dialog) return "unknown";
    if (dialog.id === "me" || dialog.isSelf) return "saved";
    const entity = dialog.entity || {};
    if (dialog.isUser || entity.className === "User") {
        if (entity.isSelf) return "saved";
        return entity.bot ? "bot" : "user";
    }
    if (dialog.isChannel || entity.className === "Channel") {
        return entity.broadcast ? "channel" : "supergroup";
    }
    if (dialog.isGroup || entity.className === "Chat") {
        return entity.megagroup ? "supergroup" : "group";
    }
    return "unknown";
}

/**
 * Возвращает отображаемое имя для сущности (пользователя, канала или чата).
 * @param {object} entity
 * @returns {string}
 */
export function getEntityDisplayName(entity) {
    if (!entity) return "Неизвестный чат";
    if (entity.isSelf) return "Избранное (Saved Messages)";
    if (entity.title) return entity.title;
    const parts = [entity.firstName, entity.lastName].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    if (entity.username) return `@${entity.username}`;
    if (entity.id) return `Чат ${idToString(entity.id)}`;
    return "Без названия";
}

/**
 * Кэш сущностей (пользователи, каналы, чаты) для быстрого доступа.
 */
class EntityCache {
    constructor() {
        /** @type {Map<string, object>} */
        this.cache = new Map();
    }

    set(id, entity) {
        if (!id || !entity) return;
        const key = idToString(id);
        this.cache.set(key, entity);
        if (entity.username) {
            this.cache.set(`@${entity.username.toLowerCase()}`, entity);
        }
    }

    get(idOrUsername) {
        if (!idOrUsername) return null;
        const key = String(idOrUsername).toLowerCase();
        return this.cache.get(key) || this.cache.get(idToString(idOrUsername)) || null;
    }

    has(idOrUsername) {
        return this.get(idOrUsername) !== null;
    }

    clear() {
        this.cache.clear();
    }
}

export const entityCache = new EntityCache();

/**
 * Разрешает сущность чата по строковому представлению с обработкой частых ошибок.
 * @param {import("teleproto").TelegramClient} client
 * @param {string|number|bigint} rawPeer
 * @returns {Promise<object>}
 */
export async function resolveEntity(client, rawPeer) {
    const peer = parsePeer(rawPeer);
    try {
        const entity = await client.getEntity(peer);
        if (entity) {
            entityCache.set(entity.id, entity);
        }
        return entity;
    } catch (err) {
        const msg = err?.message || String(err);
        if (/CHANNEL_PRIVATE/i.test(msg)) {
            throw new Error(`Нет доступа к ${rawPeer}: канал приватный или аккаунт в нём не состоит.`);
        }
        if (/USERNAME_NOT_OCCUPIED|USERNAME_INVALID|Cannot find any entity/i.test(msg)) {
            throw new Error(`Чат ${rawPeer} не найден. Проверьте правильность username или ID.`);
        }
        throw err;
    }
}
