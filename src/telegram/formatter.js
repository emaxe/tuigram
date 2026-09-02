import { formatFileSize, formatDuration } from "../utils/time.js";

/**
 * Палитра для разметки сообщений и медиа-плашек.
 *
 * Значения по умолчанию рассчитаны на тёмный фон и заданы hex-ом: именованные
 * цвета терминала (особенно "blue" и "gray") на тёмном фоне почти не читаются.
 * TUI подменяет палитру активной темой через setMessagePalette().
 */
const colors = {
    code: "#e0af68",
    codeBg: "#1f2335",
    pre: "#e0af68",
    link: "#7dcfff",
    url: "#7aa2f7",
    mention: "#bb9af7",
    hashtag: "#7aa2f7",
    spoiler: "#565f89",
    photo: "#e0af68",
    voice: "#7dcfff",
    audio: "#9ece6a",
    video: "#bb9af7",
    sticker: "#e0af68",
    document: "#7aa2f7",
    poll: "#bb9af7",
    geo: "#9ece6a",
    contact: "#7dcfff",
    venue: "#9ece6a",
    dice: "#e0af68",
    webpage: "#7dcfff",
    unknown: "#565f89",
};

/**
 * Подменяет палитру разметки цветами активной темы.
 * @param {object} theme
 */
export function setMessagePalette(theme) {
    if (!theme) return;
    Object.assign(colors, {
        code: theme.warning,
        codeBg: theme.surfaceHigh,
        pre: theme.warning,
        link: theme.info,
        url: theme.accent,
        mention: theme.chatView.mediaFg,
        hashtag: theme.accent,
        spoiler: theme.dim,
        photo: theme.warning,
        voice: theme.info,
        audio: theme.success,
        video: theme.chatView.mediaFg,
        sticker: theme.warning,
        document: theme.accent,
        poll: theme.chatView.mediaFg,
        geo: theme.success,
        contact: theme.info,
        venue: theme.success,
        dice: theme.warning,
        webpage: theme.info,
        unknown: theme.dim,
    });
}

/**
 * Экранирует спецсимволы тегов blessed в обычном тексте сообщений,
 * чтобы фигурные скобки { ... } в коде или тексте пользователя не ломали рендер.
 * @param {string} text
 * @returns {string}
 */
export function escapeBlessed(text) {
    if (!text) return "";
    return String(text).replace(/[{}]/g, (ch) => (ch === "{" ? "{open}" : "{close}"));
}

/**
 * Преобразует разметку сообщения Telegram (entities) в форматированный Blessed-текст.
 * @param {string} rawText 
 * @param {Array<object>} [entities=[]]
 * @returns {string}
 */
export function formatMessageText(rawText, entities = []) {
    if (!rawText) return "";
    if (!entities || entities.length === 0) {
        return escapeBlessed(rawText);
    }

    // Сортируем entities по смещению от начала к концу
    const sorted = [...entities].sort((a, b) => (a.offset || 0) - (b.offset || 0));

    let result = "";
    let currentIndex = 0;

    for (const entity of sorted) {
        const offset = entity.offset || 0;
        const length = entity.length || 0;
        if (offset < currentIndex || offset > rawText.length) continue;

        // Неформатированный фрагмент до текущего entity
        if (offset > currentIndex) {
            result += escapeBlessed(rawText.slice(currentIndex, offset));
        }

        const fragment = rawText.slice(offset, offset + length);
        const escaped = escapeBlessed(fragment);
        const className = entity.className || "";

        switch (className) {
            case "MessageEntityBold":
                result += `{bold}${escaped}{/bold}`;
                break;
            case "MessageEntityItalic":
                result += `{|}${escaped}{/|}`;
                break;
            case "MessageEntityCode":
                result += `{${colors.code}-fg}{${colors.codeBg}-bg}${escaped}{/${colors.codeBg}-bg}{/${colors.code}-fg}`;
                break;
            case "MessageEntityPre":
                result += `{${colors.pre}-fg}\n${escaped}\n{/${colors.pre}-fg}`;
                break;
            case "MessageEntityTextUrl":
                result += `{${colors.link}-fg}{underline}${escaped}{/underline}{/${colors.link}-fg} ({${colors.url}-fg}${escapeBlessed(entity.url || "")}{/${colors.url}-fg})`;
                break;
            case "MessageEntityUrl":
                result += `{${colors.link}-fg}{underline}${escaped}{/underline}{/${colors.link}-fg}`;
                break;
            case "MessageEntityMention":
            case "MessageEntityMentionName":
                result += `{${colors.mention}-fg}${escaped}{/${colors.mention}-fg}`;
                break;
            case "MessageEntityHashtag":
                result += `{${colors.hashtag}-fg}${escaped}{/${colors.hashtag}-fg}`;
                break;
            case "MessageEntityStrike":
                result += `{${colors.spoiler}-fg}${escaped}{/${colors.spoiler}-fg}`;
                break;
            case "MessageEntityUnderline":
                result += `{underline}${escaped}{/underline}`;
                break;
            case "MessageEntitySpoiler":
                result += `{inverse}${escaped}{/inverse}`;
                break;
            default:
                result += escaped;
        }

        currentIndex = offset + length;
    }

    if (currentIndex < rawText.length) {
        result += escapeBlessed(rawText.slice(currentIndex));
    }

    return result;
}

/**
 * Возвращает краткое описание медиа-вложения для сообщения.
 * @param {object} media
 * @returns {string}
 */
export function describeMedia(media) {
    if (!media) return "";
    const type = media.className || "";

    switch (type) {
        case "MessageMediaPhoto": {
            return `{${colors.photo}-fg}[📷 Фотография]{/${colors.photo}-fg}`;
        }
        case "MessageMediaDocument": {
            const doc = media.document || {};
            const attributes = doc.attributes || [];
            let fileName = "файл";
            let isVoice = false;
            let isAudio = false;
            let isVideo = false;
            let isSticker = false;
            let duration = 0;
            let performer = "";
            let title = "";

            for (const attr of attributes) {
                if (attr.className === "DocumentAttributeFilename") {
                    fileName = attr.fileName || fileName;
                }
                if (attr.className === "DocumentAttributeAudio") {
                    if (attr.voice) isVoice = true;
                    else isAudio = true;
                    duration = attr.duration || 0;
                    performer = attr.performer || "";
                    title = attr.title || "";
                }
                if (attr.className === "DocumentAttributeVideo") {
                    isVideo = true;
                    duration = attr.duration || 0;
                }
                if (attr.className === "DocumentAttributeSticker") {
                    isSticker = true;
                    if (attr.alt) fileName = `Стикер ${attr.alt}`;
                }
            }

            const size = formatFileSize(doc.size || 0);

            if (isVoice) {
                return `{${colors.voice}-fg}[🎤 Голосовое сообщение (${formatDuration(duration)})]{/${colors.voice}-fg}`;
            }
            if (isAudio) {
                const track = [performer, title].filter(Boolean).join(" - ") || fileName;
                return `{${colors.audio}-fg}[🎵 Аудио: ${escapeBlessed(track)} (${formatDuration(duration)}, ${size})]{/${colors.audio}-fg}`;
            }
            if (isVideo) {
                return `{${colors.video}-fg}[📹 Видео (${formatDuration(duration)}, ${size})]{/${colors.video}-fg}`;
            }
            if (isSticker) {
                return `{${colors.sticker}-fg}[🖼 ${escapeBlessed(fileName)}]{/${colors.sticker}-fg}`;
            }
            return `{${colors.document}-fg}[📄 Документ: ${escapeBlessed(fileName)} (${size})]{/${colors.document}-fg}`;
        }
        case "MessageMediaPoll": {
            const poll = media.poll || {};
            const question = poll.question?.text || poll.question || "Опрос";
            return `{${colors.poll}-fg}[📊 Опрос: "${escapeBlessed(question)}"]{/${colors.poll}-fg}`;
        }
        case "MessageMediaGeo":
        case "MessageMediaGeoLive": {
            return `{${colors.geo}-fg}[📍 Геолокация]{/${colors.geo}-fg}`;
        }
        case "MessageMediaContact": {
            const contact = media;
            const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
            return `{${colors.contact}-fg}[👤 Контакт: ${escapeBlessed(name)} (${escapeBlessed(contact.phoneNumber || "")})]{/${colors.contact}-fg}`;
        }
        case "MessageMediaVenue": {
            return `{${colors.venue}-fg}[🏢 Место: ${escapeBlessed(media.title || "")}]{/${colors.venue}-fg}`;
        }
        case "MessageMediaDice": {
            return `{${colors.dice}-fg}[🎲 Игральная кость: ${media.value || ""} (${escapeBlessed(media.emoticon || "")})]{/${colors.dice}-fg}`;
        }
        case "MessageMediaWebPage": {
            const page = media.webpage || {};
            const title = page.title || page.displayUrl || page.url || "";
            return title ? `{${colors.webpage}-fg}[🔗 Ссылка: ${escapeBlessed(title)}]{/${colors.webpage}-fg}` : "";
        }
        default:
            return `{${colors.unknown}-fg}[Вложение: ${escapeBlessed(type)}]{/${colors.unknown}-fg}`;
    }
}
