import { EventEmitter } from "node:events";
import { Api } from "teleproto";
import { NewMessage, EditedMessage, DeletedMessage, Raw } from "teleproto/events/index.js";
import { normalizeMessage } from "./messages.js";
import { idToString, toMarkedId, entityCache, getEntityDisplayName } from "./entities.js";

/**
 * Приводит идентификатор чата из сырого апдейта к маркированному виду (как dialog.id).
 * @param {object} update
 * @returns {string}
 */
function updateChatId(update) {
    if (update.peer) return toMarkedId(update.peer);
    if (update.channelId) return toMarkedId(new Api.PeerChannel({ channelId: update.channelId }));
    if (update.chatId) return toMarkedId(new Api.PeerChat({ chatId: update.chatId }));
    return "";
}

/**
 * Запускает фоновое прослушивание живых событий Telegram и транслирует их в шину событий.
 * @param {import("teleproto").TelegramClient} client
 * @returns {EventEmitter & { stop: () => void }}
 */
export function startTelegramListener(client) {
    const bus = new EventEmitter();
    bus.setMaxListeners(0);

    const handlers = [];
    const on = (handler, event) => {
        client.addEventHandler(handler, event);
        handlers.push(handler);
    };

    // 1. Новые сообщения
    on(async (event) => {
        try {
            const msg = event.message;
            if (!msg) return;

            // Кэшируем сущности события, если они пришли в апдейте
            if (event.originalUpdate?._entities && typeof event.originalUpdate._entities.values === "function") {
                for (const ent of event.originalUpdate._entities.values()) {
                    if (ent?.id) entityCache.set(ent.id, ent);
                }
            }

            let sender = null;
            try {
                sender = await event.getSender?.();
                if (sender) entityCache.set(sender.id, sender);
            } catch {
                // Игнорируем
            }

            let chat = null;
            try {
                chat = await event.getChat?.();
                if (chat) entityCache.set(chat.id, chat);
            } catch {
                // Игнорируем
            }

            const normalized = normalizeMessage(msg, chat || sender);
            if (sender && (!normalized.senderName || normalized.senderName === "Собеседник")) {
                const baseName = getEntityDisplayName(sender);
                normalized.senderName = msg.postAuthor ? `${baseName} (${msg.postAuthor})` : baseName;
            }

            const peerId = normalized.peerId;
            const fromId = normalized.fromId;

            bus.emit("new_message", {
                peerId,
                fromId,
                message: normalized,
                rawEvent: event,
            });
        } catch (err) {
            bus.emit("error", err);
        }
    }, new NewMessage({}));

    // 2. Изменённые сообщения
    on(async (event) => {
        try {
            const msg = event.message;
            if (!msg) return;

            if (event.originalUpdate?._entities && typeof event.originalUpdate._entities.values === "function") {
                for (const ent of event.originalUpdate._entities.values()) {
                    if (ent?.id) entityCache.set(ent.id, ent);
                }
            }

            let sender = null;
            try {
                sender = await event.getSender?.();
                if (sender) entityCache.set(sender.id, sender);
            } catch {
                // Игнорируем
            }

            let chat = null;
            try {
                chat = await event.getChat?.();
                if (chat) entityCache.set(chat.id, chat);
            } catch {
                // Игнорируем
            }

            const normalized = normalizeMessage(msg, chat || sender);
            if (sender && (!normalized.senderName || normalized.senderName === "Собеседник")) {
                const baseName = getEntityDisplayName(sender);
                normalized.senderName = msg.postAuthor ? `${baseName} (${msg.postAuthor})` : baseName;
            }

            bus.emit("edited_message", {
                peerId: normalized.peerId,
                message: normalized,
                rawEvent: event,
            });
        } catch (err) {
            bus.emit("error", err);
        }
    }, new EditedMessage({}));

    // 3. Удалённые сообщения
    on(async (event) => {
        try {
            bus.emit("deleted_messages", {
                peerId: toMarkedId(event.chatId),
                deletedIds: event.deletedIds || [],
                rawEvent: event,
            });
        } catch (err) {
            bus.emit("error", err);
        }
    }, new DeletedMessage({}));

    // 4. Статус набора текста («печатает...») и другие апдейты
    on(async (update) => {
        try {
            const className = update?.className;
            if (!className) return;

            if (className === "UpdateUserTyping" || className === "UpdateChatUserTyping" || className === "UpdateChannelUserTyping") {
                const userId = idToString(update.userId || update.fromId?.userId);
                // channelId/chatId приходят немаркированными — приводим к формату dialog.id
                const chatId = updateChatId(update) || userId;
                const action = update.action?.className || "SendMessageTypingAction";

                bus.emit("typing", {
                    chatId,
                    userId,
                    action,
                });
            } else if (className === "UpdateReadHistoryInbox" || className === "UpdateReadChannelInbox") {
                bus.emit("read_inbox", {
                    peerId: updateChatId(update),
                    maxId: update.maxId,
                    stillUnreadCount: update.stillUnreadCount || 0,
                });
            } else if (className === "UpdateReadHistoryOutbox" || className === "UpdateReadChannelOutbox") {
                bus.emit("read_outbox", {
                    peerId: updateChatId(update),
                    maxId: update.maxId,
                });
            }
        } catch (err) {
            // Игнорируем ошибки парсинга сырых апдейтов
        }
    }, new Raw({}));

    /** Останавливает все обработчики */
    bus.stop = () => {
        for (const handler of handlers) {
            try {
                client.removeEventHandler(handler);
            } catch {
                // Игнорируем
            }
        }
        bus.removeAllListeners();
    };

    return bus;
}
