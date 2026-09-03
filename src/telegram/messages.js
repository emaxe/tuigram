import { Api, errors } from "teleproto";
import { idToString, toMarkedId, detectChatType, getEntityDisplayName, entityCache, resolveEntity } from "./entities.js";
import { describeMedia } from "./formatter.js";
import { config } from "../config.js";
import { renderStrippedThumbnail, renderImageBuffer, renderMediaPreloader, getCachedImagePreview, isPreviewableMedia } from "../utils/image.js";

const { FloodWaitError } = errors;

/**
 * Синхронно рисует миниатюру, встроенную в само сообщение (PhotoStrippedSize).
 * Сеть не нужна — байты уже пришли вместе с сообщением, поэтому картинку можно
 * показать мгновенно, пока качается полноразмерная версия.
 * @param {object} rawMessage
 * @param {object} [options]
 * @param {number} [options.maxWidth]
 * @param {number} [options.maxHeight]
 * @param {boolean} [options.useCache=true] класть результат в кэш псевдографики
 * @returns {string} разметка blessed или пустая строка
 */
export function renderMessageThumbnail(rawMessage, {
    maxWidth = config.imageMaxWidth,
    maxHeight = config.imageMaxHeight,
    useCache = true,
} = {}) {
    const media = rawMessage?.media;
    if (!media) return "";

    const photo = media.photo;
    const doc = media.document;
    const sizes = photo?.sizes || doc?.thumbs || [];
    const stripped = sizes.find((s) => s?.className === "PhotoStrippedSize" || s?.type === "i" || (s?.bytes && s.bytes.length > 0));
    if (!stripped?.bytes) return "";

    // Полноэкранные рендеры не кэшируем: одна такая строка весит сотни килобайт
    const cacheKey = useCache
        ? (rawMessage.id ? `thumb_${rawMessage.id}@${maxWidth}x${maxHeight}` : null)
        : null;

    return renderStrippedThumbnail(stripped.bytes, { maxWidth, maxHeight, cacheKey });
}

/**
 * Преобразует объект Message из MTProto в нормализованный объект для TUI.
 * @param {object} message
 * @param {object|null} [chatEntity=null] сущность чата (канал, пользователь, группа)
 * @returns {object}
 */
export function normalizeMessage(message, chatEntity = null) {
    if (!message) return null;

    // fromId остаётся немаркированным: по нему ищется сущность в entityCache,
    // куда объекты кладутся по entity.id (тоже без маркера).
    const fromId = idToString(message.fromId?.userId || message.fromId?.channelId || message.fromId?.chatId || message.senderId);
    // peerId маркируется, чтобы совпадать с dialog.id (см. toMarkedId).
    const peerId = toMarkedId(message.peerId);

    const postAuthor = message.postAuthor ? String(message.postAuthor).trim() : null;
    const isPost = Boolean(
        message.post ||
        chatEntity?.broadcast ||
        (chatEntity && detectChatType({ entity: chatEntity }) === "channel")
    );

    // Ищем сущность отправителя:
    // 1. Уже прикреплённый teleproto sender
    // 2. Вложенный кэш сущностей сообщения message._entities
    // 3. Глобальный entityCache
    let senderEntity = message.sender || null;
    if (!senderEntity && message._entities && typeof message._entities.get === "function") {
        senderEntity = (fromId && message._entities.get(fromId)) ||
            (message.senderId && message._entities.get(idToString(message.senderId))) ||
            (message.fromId && message._entities.get(toMarkedId(message.fromId))) ||
            null;
    }
    if (!senderEntity) {
        senderEntity = (fromId && entityCache.get(fromId)) ||
            (message.senderId && entityCache.get(message.senderId)) ||
            (message.fromId && entityCache.get(message.fromId)) ||
            null;
    }
    if (senderEntity && senderEntity.id) {
        entityCache.set(senderEntity.id, senderEntity);
    }

    let senderName = "";
    if (isPost) {
        // В вещательных каналах автор — сам канал (или подпись автора)
        const channelEntity = senderEntity || chatEntity || message.chat || entityCache.get(peerId) || null;
        const channelTitle = channelEntity ? getEntityDisplayName(channelEntity) : (chatEntity?.title || "");
        if (postAuthor) {
            senderName = channelTitle ? `${channelTitle} (${postAuthor})` : postAuthor;
        } else {
            senderName = channelTitle || "Канал";
        }
    } else if (message.out) {
        senderName = "Вы";
    } else if (senderEntity) {
        const baseName = getEntityDisplayName(senderEntity);
        senderName = postAuthor ? `${baseName} (${postAuthor})` : baseName;
    } else if (chatEntity && (chatEntity.className === "User" || detectChatType({ entity: chatEntity }) === "user")) {
        // В личном диалоге (1-на-1) входящее сообщение всегда от собеседника чата
        senderName = getEntityDisplayName(chatEntity);
    } else if (postAuthor) {
        senderName = postAuthor;
    } else {
        senderName = "Собеседник";
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

    // Извлечение и рендеринг PhotoStrippedSize в псевдографику или прелоадера
    let imagePreview = null;
    let isPreviewLoading = false;

    if (config.showImages && isPreviewableMedia(message)) {
        const cached = getCachedImagePreview(message, {
            maxWidth: config.imageMaxWidth,
            maxHeight: config.imageMaxHeight,
        });
        if (cached) {
            imagePreview = cached;
            isPreviewLoading = false;
        } else {
            const strippedThumb = renderMessageThumbnail(message);
            if (strippedThumb) {
                imagePreview = strippedThumb;
                isPreviewLoading = false;
            } else {
                imagePreview = renderMediaPreloader(message, {
                    maxWidth: config.imageMaxWidth,
                    maxHeight: config.imageMaxHeight,
                });
                isPreviewLoading = true;
            }
        }
    }

    return {
        id: message.id,
        date: message.date ? message.date * 1000 : Date.now(),
        editDate: message.editDate ? message.editDate * 1000 : null,
        out: Boolean(message.out),
        post: isPost,
        postAuthor,
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
        isPreviewLoading,
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
                // Сохраняем сущности, которые Telegram прислал вместе с сообщениями
                if (msg._entities && typeof msg._entities.values === "function") {
                    for (const ent of msg._entities.values()) {
                        if (ent?.id) {
                            entityCache.set(ent.id, ent);
                        }
                    }
                }
                messages.push(normalizeMessage(msg, entity));
            }
        }
        if (!reverse) {
            messages.reverse();
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

    // Резолвим отправителей, которых ещё нет в кэше сущностей,
    // чтобы в диалоге отображались реальные имена, а не «Собеседник».
    for (const msg of messages) {
        if (!msg.out && (!msg.senderName || msg.senderName === "Собеседник")) {
            // 1. Попытка через rawMessage.getSender()
            if (msg.rawMessage?.getSender) {
                try {
                    const sender = await msg.rawMessage.getSender();
                    if (sender) {
                        entityCache.set(sender.id, sender);
                        const baseName = getEntityDisplayName(sender);
                        msg.senderName = msg.postAuthor ? `${baseName} (${msg.postAuthor})` : baseName;
                        continue;
                    }
                } catch {
                    // Игнорируем
                }
            }

            // 2. Попытка через resolveEntity по targetPeer
            const targetPeer = msg.rawMessage?.fromId || msg.fromId || msg.rawMessage?.peerId || msg.peerId;
            if (targetPeer) {
                try {
                    const sender = await resolveEntity(client, targetPeer);
                    if (sender) {
                        const baseName = getEntityDisplayName(sender);
                        msg.senderName = msg.postAuthor ? `${baseName} (${msg.postAuthor})` : baseName;
                    }
                } catch {
                    // Имя не резолвится — останется fallback
                }
            }
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
 * Находит первое непрочитанное входящее сообщение в хронологическом списке сообщений.
 * @param {Array<object>} messages
 * @param {object} [options]
 * @param {number} [options.readInboxMaxId=0]
 * @param {number} [options.unreadCount=0]
 * @returns {object|null}
 */
export function findFirstUnreadMessage(messages, { readInboxMaxId = 0, unreadCount = 0 } = {}) {
    if (!Array.isArray(messages) || messages.length === 0 || unreadCount === 0) {
        return null;
    }

    // Всегда сортируем сообщения по возрастанию ID/даты перед поиском
    const sorted = [...messages].sort((a, b) => (a.date || 0) - (b.date || 0) || (a.id - b.id));

    if (readInboxMaxId > 0) {
        const first = sorted.find((m) => !m.out && m.id > readInboxMaxId);
        if (first) return first;
    }

    if (unreadCount > 0) {
        const incoming = sorted.filter((m) => !m.out);
        if (incoming.length > 0) {
            const unreadIncoming = incoming.slice(-unreadCount);
            return unreadIncoming[0] || null;
        }
    }

    return null;
}

/**
 * Вычисляет количество оставшихся непрочитанных сообщений в чате на основе прочитанного maxId.
 * @param {Array<object>} messages
 * @param {number} maxReadId
 * @param {number} [totalUnreadCount]
 * @returns {number}
 */
export function calculateRemainingUnreadCount(messages, maxReadId = 0, totalUnreadCount) {
    if (!Array.isArray(messages) || messages.length === 0) return 0;

    const unreadInLoaded = messages.filter((m) => !m.out && m.id > maxReadId).length;

    if (typeof totalUnreadCount === "number" && totalUnreadCount > 0) {
        const incomingInLoaded = messages.filter((m) => !m.out).length;
        if (totalUnreadCount > incomingInLoaded) {
            const notLoadedCount = totalUnreadCount - incomingInLoaded;
            return notLoadedCount + unreadInLoaded;
        }
    }

    return unreadInLoaded;
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
            await client.markAsRead(entity, maxId);
        } else {
            await client.markAsRead(entity);
        }
    } catch {
        // Игнорируем незначительные сетевые ошибки прочтения
    }
}

/**
 * Выбирает самую крупную растровую миниатюру документа.
 * PhotoPathSize (SVG-контур) и PhotoStrippedSize непригодны для полноэкранного показа.
 * @param {Array<object>} thumbs
 * @returns {object|null}
 */
function pickLargestThumb(thumbs) {
    if (!Array.isArray(thumbs) || thumbs.length === 0) return null;

    const weight = (t) => {
        if (typeof t?.size === "number") return t.size;
        if (Array.isArray(t?.sizes) && t.sizes.length > 0) return Math.max(...t.sizes);
        return 0;
    };

    const usable = thumbs.filter((t) => t?.className !== "PhotoPathSize" && weight(t) > 0);
    if (usable.length === 0) return null;

    return usable.reduce((best, t) => (weight(t) > weight(best) ? t : best), usable[0]);
}

/**
 * Загружает изображение сообщения в максимальном доступном качестве — для просмотра
 * на весь экран.
 *
 * Фото качается оригиналом. У документа (видео, gif, файл) качается только самая
 * крупная миниатюра: сам файл может весить сотни мегабайт и всё равно не рисуется.
 *
 * @param {import("teleproto").TelegramClient} client
 * @param {object} rawMessage
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
export async function downloadImageBuffer(client, rawMessage) {
    const media = rawMessage?.media;
    if (!media) {
        throw new Error("У сообщения нет изображения.");
    }

    if (media.className === "MessageMediaPhoto") {
        // Без thumb teleproto отдаёт самый большой размер фотографии
        const buffer = await client.downloadMedia(media, {});
        if (!buffer || buffer.length === 0) {
            throw new Error("Не удалось загрузить изображение.");
        }
        return { buffer, mimeType: "image/jpeg" };
    }

    if (media.className === "MessageMediaDocument") {
        const thumb = pickLargestThumb(media.document?.thumbs);
        if (!thumb) {
            throw new Error("У вложения нет пригодной для показа миниатюры.");
        }
        const buffer = await client.downloadMedia(media, { thumb });
        if (!buffer || buffer.length === 0) {
            throw new Error("Не удалось загрузить миниатюру вложения.");
        }
        return { buffer, mimeType: "image/jpeg" };
    }

    throw new Error("Этот тип вложения нельзя показать как изображение.");
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

    const cached = getCachedImagePreview(rawMessage, { maxWidth, maxHeight });
    if (cached) return cached;

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

