import { Api, errors } from "teleproto";
import { idToString, toMarkedId, getEntityDisplayName, entityCache, resolveEntity } from "./entities.js";
import { describeMedia } from "./formatter.js";
import { config } from "../config.js";
import { renderStrippedThumbnail, renderImageBuffer } from "../utils/image.js";

const { FloodWaitError } = errors;

/**
 * Преобразует объект Message из MTProto в нормализованный объект для TUI.
 * @param {object} message
 * @returns {object}
 */
export function normalizeMessage(message) {
    if (!message) return null;

    // fromId остаётся немаркированным: по нему ищется сущность в entityCache,
    // куда объекты кладутся по entity.id (тоже без маркера).
    const fromId = idToString(message.fromId?.userId || message.fromId?.channelId || message.fromId?.chatId);
    // peerId маркируется, чтобы совпадать с dialog.id (см. toMarkedId).
    const peerId = toMarkedId(message.peerId);

    // Извлекаем имя отправителя из кэша сущностей, если доступно
    let senderName = message.out ? "Вы" : "Собеседник";
    const cachedSender = entityCache.get(fromId);
    if (cachedSender) {
        senderName = getEntityDisplayName(cachedSender);
    }

    // Реакции
    const reactions = [];
    if (message.reactions?.results) {
        for (const r of message.reactions.results) {
            const emoticon = r.reaction?.emoticon || (r.reaction?.className === "ReactionCustomEmoji" ? "✨" : "👍");
            reactions.push({
                emoticon,
                count: r.count || 1,
                chosen: Boolean(r.chosenOrder),
            });
        }
    }

    // Извлечение и рендеринг PhotoStrippedSize в псевдографику
    let imagePreview = null;
    if (config.showImages && message.media) {
        const media = message.media;
        const photo = media.photo;
        const doc = media.document;
        const sizes = photo?.sizes || doc?.thumbs || [];
        const stripped = sizes.find((s) => s?.className === "PhotoStrippedSize" || s?.type === "i" || (s?.bytes && s.bytes.length > 0));

        if (stripped?.bytes) {
            const cacheKey = photo?.id
                ? `photo_${photo.id}`
                : (doc?.id ? `doc_${doc.id}` : `msg_${message.id}`);
            imagePreview = renderStrippedThumbnail(stripped.bytes, {
                maxWidth: config.imageMaxWidth,
                maxHeight: config.imageMaxHeight,
                cacheKey,
            }) || null;
        }
    }

    return {
        id: message.id,
        date: message.date ? message.date * 1000 : Date.now(),
        editDate: message.editDate ? message.editDate * 1000 : null,
        out: Boolean(message.out),
        text: message.message || "",
        fromId,
        senderName,
        peerId,
        replyToMsgId: message.replyTo?.replyToMsgId || null,
        pinned: Boolean(message.pinned),
        views: message.views || null,
        forwards: message.forwards || null,
        media: message.media || null,
        mediaDescription: describeMedia(message.media),
        imagePreview,
        entities: message.entities || [],
        reactions,
        rawMessage: message,
    };
}

/**
 * Загружает историю сообщений чата с защитой от FloodWait.
 * @param {import("teleproto").TelegramClient} client
 * @param {string|number|bigint} rawPeer
 * @param {object} [options]
 * @param {number} [options.limit=40]
 * @param {number} [options.offsetId=0]
 * @param {boolean} [options.reverse=false]
 * @returns {Promise<{ peer: object, messages: Array<object> }>}
 */
export async function fetchHistory(client, rawPeer, { limit = 40, offsetId = 0, reverse = false } = {}) {
    const entity = await resolveEntity(client, rawPeer);
    const messages = [];

    const load = async () => {
        for await (const msg of client.iterMessages(entity, { limit, offsetId, reverse })) {
            if (msg && msg.className !== "MessageEmpty") {
                messages.push(normalizeMessage(msg));
            }
        }
    };

    try {
        await load();
    } catch (err) {
        if (err instanceof FloodWaitError || typeof err?.seconds === "number") {
            const wait = (err.seconds || 5) + 1;
            await new Promise((resolve) => setTimeout(resolve, wait * 1000));
            messages.length = 0;
            await load();
        } else {
            throw err;
        }
    }

    return {
        peer: entity,
        messages,
    };
}

/**
 * Отправляет текстовое сообщение в чат.
 * @param {import("teleproto").TelegramClient} client
 * @param {string|number|bigint} rawPeer
 * @param {string} text
 * @param {object} [options]
 * @param {number} [options.replyTo] ID сообщения, на которое отвечаем
 * @returns {Promise<object>}
 */
export async function sendMessage(client, rawPeer, text, { replyTo } = {}) {
    const entity = await resolveEntity(client, rawPeer);
    const params = {
        message: text,
    };

    if (replyTo) {
        params.replyTo = replyTo;
    }

    const sent = await client.sendMessage(entity, params);
    return normalizeMessage(sent);
}

/**
 * Редактирует существующее текстовое сообщение.
 * @param {import("teleproto").TelegramClient} client
 * @param {string|number|bigint} rawPeer
 * @param {number} messageId
 * @param {string} newText
 * @returns {Promise<object>}
 */
export async function editMessage(client, rawPeer, messageId, newText) {
    const entity = await resolveEntity(client, rawPeer);
    const edited = await client.editMessage(entity, {
        message: messageId,
        text: newText,
    });
    return normalizeMessage(edited);
}

/**
 * Удаляет сообщения в чате.
 * @param {import("teleproto").TelegramClient} client
 * @param {string|number|bigint} rawPeer
 * @param {Array<number>} messageIds
 * @param {object} [options]
 * @param {boolean} [options.revoke=true] Удалить для всех участников
 */
export async function deleteMessages(client, rawPeer, messageIds, { revoke = true } = {}) {
    const entity = await resolveEntity(client, rawPeer);
    return await client.deleteMessages(entity, messageIds, { revoke });
}

/** Максимум вложений в одном альбоме Telegram. */
export const ALBUM_LIMIT = 10;

/**
 * Отправляет один или несколько файлов. Массив уходит альбомом (media group).
 * @param {import("teleproto").TelegramClient} client
 * @param {string|number|bigint} rawPeer
 * @param {string|Buffer|Array<string|Buffer>} files
 * @param {object} [options]
 * @param {string} [options.caption=""]
 * @param {number} [options.replyTo]
 * @param {boolean} [options.forceDocument=false] отправить без сжатия, файлом
 * @param {(progress: number) => void} [options.progressCallback] прогресс 0..1
 * @returns {Promise<Array<object>>} нормализованные отправленные сообщения
 */
export async function sendFiles(client, rawPeer, files, { caption = "", replyTo, forceDocument = false, progressCallback } = {}) {
    const list = Array.isArray(files) ? files : [files];
    if (list.length === 0) {
        throw new Error("Не указан ни один файл для отправки");
    }
    if (list.length > ALBUM_LIMIT) {
        throw new Error(`За раз можно отправить не больше ${ALBUM_LIMIT} файлов (передано ${list.length})`);
    }

    const entity = await resolveEntity(client, rawPeer);
    const params = {
        // Один файл передаём как есть: массив из одного элемента увёл бы teleproto
        // в _sendAlbum и Telegram получил бы медиагруппу вместо обычного фото.
        file: list.length === 1 ? list[0] : list,
        caption,
        forceDocument,
        progressCallback,
    };
    if (replyTo) {
        params.replyTo = replyTo;
    }

    // При массиве teleproto уходит в _sendAlbum и возвращает массив сообщений
    const sent = await client.sendFile(entity, params);
    return (Array.isArray(sent) ? sent : [sent]).filter(Boolean).map(normalizeMessage);
}

/**
 * Отправляет один файл / медиа в чат.
 * @param {import("teleproto").TelegramClient} client
 * @param {string|number|bigint} rawPeer
 * @param {string|Buffer} file
 * @param {object} [options] см. {@link sendFiles}
 * @returns {Promise<object>}
 */
export async function sendFile(client, rawPeer, file, options = {}) {
    const sent = await sendFiles(client, rawPeer, file, options);
    return sent[0];
}

/**
 * Скачивает медиа-вложение сообщения на локальный диск.
 * @param {import("teleproto").TelegramClient} client
 * @param {object} rawMessage
 * @param {object} [options]
 * @param {string} [options.outputFile]
 * @param {(progress: number) => void} [options.progressCallback]
 * @returns {Promise<string|Buffer>}
 */
export async function downloadMedia(client, rawMessage, { outputFile, progressCallback } = {}) {
    if (!rawMessage?.media) {
        throw new Error("У сообщения нет медиа-вложения для скачивания.");
    }
    return await client.downloadMedia(rawMessage.media, {
        outputFile,
        progressCallback,
    });
}

/**
 * Отправляет реакцию (эмодзи) на сообщение.
 * @param {import("teleproto").TelegramClient} client
 * @param {string|number|bigint} rawPeer
 * @param {number} messageId
 * @param {string} [emoji="👍"]
 */
export async function sendReaction(client, rawPeer, messageId, emoji = "👍") {
    const entity = await resolveEntity(client, rawPeer);
    return await client.invoke(
        new Api.messages.SendReaction({
            peer: entity,
            msgId: messageId,
            reaction: [new Api.ReactionEmoji({ emoticon: emoji })],
        })
    );
}

/**
 * Отмечает сообщения в чате прочитанными.
 * @param {import("teleproto").TelegramClient} client
 * @param {string|number|bigint} rawPeer
 * @param {number} [maxId=0]
 */
export async function markAsRead(client, rawPeer, maxId = 0) {
    const entity = await resolveEntity(client, rawPeer);
    try {
        if (maxId > 0) {
            await client.sendReadAcknowledge(entity, { maxId });
        } else {
            await client.markAsRead(entity);
        }
    } catch {
        // Игнорируем незначительные сетевые ошибки прочтения
    }
}

/**
 * Асинхронно загружает и декодирует превью изображения сообщения через MTProto.
 * @param {import("teleproto").TelegramClient} client
 * @param {object} rawMessage
 * @param {object} [options]
 * @param {number} [options.maxWidth]
 * @param {number} [options.maxHeight]
 * @returns {Promise<string>}
 */
export async function loadMessageImagePreview(client, rawMessage, { maxWidth = config.imageMaxWidth, maxHeight = config.imageMaxHeight } = {}) {
    if (!rawMessage?.media) return "";
    const media = rawMessage.media;
    const isPhoto = media.className === "MessageMediaPhoto";
    const isDoc = media.className === "MessageMediaDocument";
    if (!isPhoto && !isDoc) return "";

    const cacheKey = isPhoto
        ? `photo_full_${media.photo?.id || rawMessage.id}`
        : `doc_full_${media.document?.id || rawMessage.id}`;

    try {
        const thumbBuf = await client.downloadMedia(media, { thumb: 1 });
        if (!thumbBuf || thumbBuf.length === 0) return "";
        return renderImageBuffer(thumbBuf, {
            maxWidth,
            maxHeight,
            cacheKey,
        });
    } catch {
        return "";
    }
}

