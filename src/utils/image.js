/**
 * Модуль обработки и рендеринга изображений в терминале (Unicode Half-Block).
 * Преобразует растровые изображения (JPEG, PNG, PhotoStrippedSize) в псевдографику
 * высокого разрешения с разметкой blessed и 24-битными hex-цветами.
 */

import jpegJs from "jpeg-js";
import { PNG } from "pngjs";
import { stringCellWidth } from "./mouse.js";

/** Заголовок стандартного JPEG для распаковки Telegram PhotoStrippedSize. */
const JPEG_HEADER = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x28, 0x1c, 0x1e, 0x23, 0x1e, 0x19, 0x28, 0x23, 0x21, 0x23, 0x2d,
    0x2b, 0x28, 0x30, 0x3c, 0x64, 0x41, 0x3c, 0x37, 0x37, 0x3c, 0x7b, 0x58,
    0x5d, 0x49, 0x64, 0x91, 0x80, 0x99, 0x96, 0x8f, 0x80, 0x8c, 0x8a, 0xa0,
    0xb4, 0xe6, 0xc3, 0xa0, 0xaa, 0xda, 0xad, 0x8a, 0x8c, 0xc8, 0xff, 0xcb,
    0xda, 0xee, 0xf5, 0xff, 0xff, 0xff, 0x9b, 0xc1, 0xff, 0xff, 0xf7, 0xfa,
    0xff, 0xe6, 0xfd, 0xff, 0xf8, 0xff, 0xdb, 0x00, 0x43, 0x01, 0x2b, 0x2d,
    0x2d, 0x3c, 0x35, 0x3c, 0x75, 0x41, 0x41, 0x75, 0xf8, 0xa5, 0x8c, 0xa5,
    0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8,
    0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8,
    0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8,
    0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xff, 0xc0, 0x00,
    0x11, 0x08, 0x00, 0x00, 0x00, 0x00, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11,
    0x01, 0x03, 0x11, 0x01, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05,
    0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
    0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03, 0x03, 0x02,
    0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d, 0x01, 0x02,
    0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51,
    0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42,
    0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09,
    0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a,
    0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47,
    0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63,
    0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77,
    0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92,
    0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
    0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8,
    0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2,
    0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4,
    0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6,
    0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xc4, 0x00, 0x1f, 0x01, 0x00, 0x03, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
    0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x11, 0x00, 0x02, 0x01, 0x02, 0x04, 0x04,
    0x03, 0x04, 0x07, 0x05, 0x04, 0x04, 0x00, 0x01, 0x02, 0x77, 0x00, 0x01,
    0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07,
    0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1,
    0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16,
    0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28,
    0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46,
    0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a,
    0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76,
    0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
    0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
    0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
    0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3,
    0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6,
    0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02,
    0x11, 0x03, 0x11, 0x00, 0x3f, 0x00
]);

/** Завершающий маркер JPEG (End Of Image). */
const JPEG_FOOTER = Buffer.from([0xff, 0xd9]);

/**
 * Память кэша для готовых строк псевдографики.
 * @type {Map<string, string>}
 */
export const imagePreviewCache = new Map();
const MAX_CACHE_SIZE = 500;

/**
 * Распаковывает PhotoStrippedSize Telegram в валидный JPEG буфер.
 * @param {Buffer|Uint8Array} stripped
 * @returns {Buffer}
 */
export function strippedPhotoToJpg(stripped) {
    if (!stripped || stripped.length < 3) {
        return Buffer.isBuffer(stripped) ? stripped : Buffer.from(stripped || []);
    }
    const buf = Buffer.isBuffer(stripped) ? stripped : Buffer.from(stripped);
    if (buf[0] !== 1) {
        return buf;
    }
    const header = Buffer.from(JPEG_HEADER);
    header[164] = buf[1];
    header[166] = buf[2];
    return Buffer.concat([header, buf.subarray(3), JPEG_FOOTER]);
}

/**
 * Декодирует буфер изображения (JPEG или PNG) в сырой RGBA буфер.
 * @param {Buffer|Uint8Array} buffer
 * @param {string} [mimeType]
 * @returns {{ width: number, height: number, data: Uint8Array }}
 */
export function decodeImageBuffer(buffer, mimeType = "") {
    if (!buffer || buffer.length === 0) {
        throw new Error("Пустой буфер изображения");
    }

    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    // Определение формата по magic bytes или mimeType
    const isPng = (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
        || mimeType.includes("png");

    if (isPng) {
        const png = PNG.sync.read(buf);
        return {
            width: png.width,
            height: png.height,
            data: png.data,
        };
    }

    // По умолчанию считаем JPEG
    const decoded = jpegJs.decode(buf, { useTArray: true, formatAsRGBA: true });
    return {
        width: decoded.width,
        height: decoded.height,
        data: decoded.data,
    };
}

/**
 * Рассчитывает целевые размеры изображения в терминале с сохранением пропорций.
 * Каждый терминальный ряд Half-Block вмещает 2 вертикальных субпикселя.
 * @param {number} srcW Исходная ширина в пикселях
 * @param {number} srcH Исходная высота в пикселях
 * @param {number} [maxWidth=36] Максимальная ширина в колонках символов
 * @param {number} [maxHeight=14] Максимальная высота в строках терминала
 * @returns {{ dstW: number, dstH: number, rows: number }}
 */
export function calculateTargetDimensions(srcW, srcH, maxWidth = 36, maxHeight = 14) {
    const safeW = Math.max(1, srcW || 1);
    const safeH = Math.max(1, srcH || 1);
    const maxPixelH = Math.max(2, maxHeight * 2);

    const aspect = safeW / safeH;
    const maxAspect = maxWidth / maxPixelH;

    let dstW = maxWidth;
    let dstPixelH = maxPixelH;

    if (aspect >= maxAspect) {
        dstW = Math.min(maxWidth, safeW);
        dstPixelH = Math.max(2, Math.round(dstW / aspect));
    } else {
        dstPixelH = Math.min(maxPixelH, safeH * 2);
        dstW = Math.max(1, Math.round(dstPixelH * aspect));
    }

    // Округляем пиксельную высоту до четного числа (для парных субпикселей ▀)
    const rows = Math.max(1, Math.ceil(dstPixelH / 2));
    dstPixelH = rows * 2;

    return { dstW, dstH: dstPixelH, rows };
}

/**
 * Масштабирует RGBA буфер методом билинейной интерполяции.
 * @param {Uint8Array} src RGBA буфер исходного изображения
 * @param {number} srcW Исходная ширина
 * @param {number} srcH Исходная высота
 * @param {number} dstW Целевая ширина
 * @param {number} dstH Целевая высота
 * @returns {Uint8Array} Результирующий RGBA буфер длины dstW * dstH * 4
 */
export function resizeRgba(src, srcW, srcH, dstW, dstH) {
    const dst = new Uint8Array(dstW * dstH * 4);
    if (srcW === dstW && srcH === dstH) {
        dst.set(src);
        return dst;
    }

    const xRatio = srcW / dstW;
    const yRatio = srcH / dstH;

    for (let dy = 0; dy < dstH; dy++) {
        const srcY = (dy + 0.5) * yRatio - 0.5;
        const y0 = Math.max(0, Math.min(srcH - 1, Math.floor(srcY)));
        const y1 = Math.max(0, Math.min(srcH - 1, y0 + 1));
        const yWeight = Math.max(0, Math.min(1, srcY - y0));

        const y0Offset = y0 * srcW * 4;
        const y1Offset = y1 * srcW * 4;
        const dstRowOffset = dy * dstW * 4;

        for (let dx = 0; dx < dstW; dx++) {
            const srcX = (dx + 0.5) * xRatio - 0.5;
            const x0 = Math.max(0, Math.min(srcW - 1, Math.floor(srcX)));
            const x1 = Math.max(0, Math.min(srcW - 1, x0 + 1));
            const xWeight = Math.max(0, Math.min(1, srcX - x0));

            const p00 = y0Offset + x0 * 4;
            const p10 = y0Offset + x1 * 4;
            const p01 = y1Offset + x0 * 4;
            const p11 = y1Offset + x1 * 4;

            const dstOffset = dstRowOffset + dx * 4;

            // Интерполяция 4 каналов: R, G, B, A
            for (let c = 0; c < 4; c++) {
                const top = (1 - xWeight) * src[p00 + c] + xWeight * src[p10 + c];
                const bot = (1 - xWeight) * src[p01 + c] + xWeight * src[p11 + c];
                dst[dstOffset + c] = Math.round((1 - yWeight) * top + yWeight * bot);
            }
        }
    }

    return dst;
}

/** Таблица предвычисленных двухсимвольных hex-значений 00-ff для быстрого рендеринга. */
const HEX_TABLE = Array.from({ length: 256 }, (_, i) => (i < 16 ? "0" : "") + i.toString(16));

/**
 * Преобразует компоненты цвета R, G, B в hex-строку вида "#rrggbb".
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
export function rgbaToHex(r, g, b) {
    return `#${HEX_TABLE[r & 0xff]}${HEX_TABLE[g & 0xff]}${HEX_TABLE[b & 0xff]}`;
}

/**
 * Преобразует масштабированный RGBA буфер в многострочный текст Blessed
 * с использованием символов верхнего полублока (▀ U+2580).
 *
 * Верхний пиксель ячейки задаётся через тег цвета текста (`{ #rrggbb-fg }`),
 * нижний пиксель — через тег цвета фона (`{ #rrggbb-bg }`).
 *
 * @param {Uint8Array} data RGBA буфер
 * @param {number} width Ширина в символах/пикселях
 * @param {number} height Высота в пикселях (должна быть четной, = rows * 2)
 * @returns {string}
 */
export function rgbaToHalfBlockBlessed(data, width, height) {
    const rows = Math.floor(height / 2);
    const lines = [];

    for (let r = 0; r < rows; r++) {
        let line = "";
        let currentFg = null;
        let currentBg = null;

        const topRowOffset = (r * 2) * width * 4;
        const botRowOffset = (r * 2 + 1) * width * 4;

        for (let x = 0; x < width; x++) {
            const topOffset = topRowOffset + x * 4;
            const botOffset = botRowOffset + x * 4;

            const topHex = `#${HEX_TABLE[data[topOffset]]}${HEX_TABLE[data[topOffset + 1]]}${HEX_TABLE[data[topOffset + 2]]}`;
            const botHex = `#${HEX_TABLE[data[botOffset]]}${HEX_TABLE[data[botOffset + 1]]}${HEX_TABLE[data[botOffset + 2]]}`;

            if (topHex !== currentFg) {
                line += `{${topHex}-fg}`;
                currentFg = topHex;
            }
            if (botHex !== currentBg) {
                line += `{${botHex}-bg}`;
                currentBg = botHex;
            }

            line += "▀";
        }

        if (currentFg || currentBg) {
            line += "{/}";
        }

        lines.push(line);
    }

    return lines.join("\n");
}

/**
 * Выполняет полный цикл декодирования, масштабирования и рендеринга изображения в Blessed-строку.
 * @param {Buffer|Uint8Array} buffer Исходный буфер изображения (JPEG или PNG)
 * @param {object} [options]
 * @param {string} [options.mimeType=""] MIME-тип изображения
 * @param {number} [options.maxWidth=36] Максимальная ширина
 * @param {number} [options.maxHeight=14] Максимальная высота
 * @param {string} [options.cacheKey] Ключ для сохранения в кэш
 * @returns {string}
 */
export function renderImageBuffer(buffer, { mimeType = "", maxWidth = 36, maxHeight = 14, cacheKey } = {}) {
    // Размер входит в ключ: одно и то же фото рисуется и миниатюрой в ленте, и на весь
    // экран в просмотрщике. Без размера полноэкранный рендер подменял бы превью в ленте.
    const key = cacheKey ? `${cacheKey}@${maxWidth}x${maxHeight}` : null;
    if (key && imagePreviewCache.has(key)) {
        return imagePreviewCache.get(key);
    }

    try {
        const decoded = decodeImageBuffer(buffer, mimeType);
        const { dstW, dstH } = calculateTargetDimensions(decoded.width, decoded.height, maxWidth, maxHeight);
        const resized = resizeRgba(decoded.data, decoded.width, decoded.height, dstW, dstH);
        const blessedText = rgbaToHalfBlockBlessed(resized, dstW, dstH);

        if (key) {
            if (imagePreviewCache.size >= MAX_CACHE_SIZE) {
                const firstKey = imagePreviewCache.keys().next().value;
                imagePreviewCache.delete(firstKey);
            }
            imagePreviewCache.set(key, blessedText);
        }

        return blessedText;
    } catch {
        return "";
    }
}

/**
 * Синхронно распаковывает и рендерит PhotoStrippedSize Telegram в Blessed Half-Block строку.
 * @param {Buffer|Uint8Array} strippedBytes Байты PhotoStrippedSize
 * @param {object} [options]
 * @param {number} [options.maxWidth=36]
 * @param {number} [options.maxHeight=14]
 * @param {string} [options.cacheKey]
 * @returns {string}
 */
export function renderStrippedThumbnail(strippedBytes, { maxWidth = 36, maxHeight = 14, cacheKey } = {}) {
    if (!strippedBytes || strippedBytes.length < 3) return "";

    // Кэш проверяет renderImageBuffer: только он знает итоговый ключ с размером
    try {
        const jpgBuf = strippedPhotoToJpg(strippedBytes);
        return renderImageBuffer(jpgBuf, { mimeType: "image/jpeg", maxWidth, maxHeight, cacheKey });
    } catch {
        return "";
    }
}

/**
 * Извлекает исходные размеры медиа (ширину и высоту в пикселях) из объекта сообщения Telegram.
 * @param {object} rawMessage исходное сообщение или объект медиа
 * @returns {{ width: number, height: number }|null}
 */
export function getMediaDimensions(rawMessage) {
    const media = rawMessage?.media || rawMessage;
    if (!media) return null;

    // 1. Фотография
    if (media.className === "MessageMediaPhoto" || media.photo) {
        const photo = media.photo || media;
        let maxW = 0;
        let maxH = 0;
        for (const s of photo.sizes || []) {
            if (s && typeof s.w === "number" && typeof s.h === "number" && s.w > 0 && s.h > 0) {
                if (s.w * s.h > maxW * maxH) {
                    maxW = s.w;
                    maxH = s.h;
                }
            }
        }
        if (maxW > 0 && maxH > 0) {
            return { width: maxW, height: maxH };
        }
    }

    // 2. Документ (видео, изображение, gif)
    if (media.className === "MessageMediaDocument" || media.document) {
        const doc = media.document || media;
        const attributes = doc.attributes || [];
        for (const attr of attributes) {
            if ((attr.className === "DocumentAttributeVideo" || attr.className === "DocumentAttributeImageSize") && attr.w && attr.h) {
                return { width: attr.w, height: attr.h };
            }
        }
        let maxW = 0;
        let maxH = 0;
        for (const t of doc.thumbs || []) {
            if (t && typeof t.w === "number" && typeof t.h === "number" && t.w > 0 && t.h > 0) {
                if (t.w * t.h > maxW * maxH) {
                    maxW = t.w;
                    maxH = t.h;
                }
            }
        }
        if (maxW > 0 && maxH > 0) {
            return { width: maxW, height: maxH };
        }
    }

    // 3. Веб-страница (встроенное медиа статьи/ссылки)
    if (media.className === "MessageMediaWebPage" || media.webpage) {
        const page = media.webpage || media;
        if (page.photo) {
            const dims = getMediaDimensions(page.photo);
            if (dims) return dims;
        }
        if (page.document) {
            const dims = getMediaDimensions(page.document);
            if (dims) return dims;
        }
    }

    return null;
}

/**
 * Проверяет, является ли вложение визуальным медиа (фото, видео, анимация),
 * для которого отображается визуальное превью в ленте сообщений.
 * @param {object} rawMessage
 * @returns {boolean}
 */
export function isPreviewableMedia(rawMessage) {
    const media = rawMessage?.media || rawMessage;
    if (!media) return false;

    if (media.className === "MessageMediaPhoto" || media.photo) {
        return true;
    }

    if (media.className === "MessageMediaDocument" || media.document) {
        const doc = media.document || media;
        if (typeof doc.mimeType === "string") {
            if (doc.mimeType.startsWith("video/") || doc.mimeType.startsWith("image/")) {
                return true;
            }
        }

        const attributes = doc.attributes || [];
        for (const attr of attributes) {
            if (
                attr.className === "DocumentAttributeVideo" ||
                attr.className === "DocumentAttributeImageSize" ||
                attr.className === "DocumentAttributeAnimated" ||
                attr.className === "DocumentAttributeSticker"
            ) {
                return true;
            }
        }

        if (Array.isArray(doc.thumbs) && doc.thumbs.length > 0) {
            const isAudio = attributes.some((a) => a.className === "DocumentAttributeAudio");
            if (!isAudio) {
                return true;
            }
        }
    }

    if (media.className === "MessageMediaWebPage" || media.webpage) {
        const page = media.webpage || media;
        return Boolean(page.photo || (page.document && isPreviewableMedia(page.document)));
    }

    return false;
}

/** Цветовая палитра по умолчанию для прелоадера медиа-вложений. */
const DEFAULT_PRELOADER_PALETTE = {
    bg: "#1f2335",
    border: "#3b4261",
    fg: "#8288a6",
    accent: "#7aa2f7",
    dim: "#6874a0",
};

/**
 * Генерирует строку Blessed-разметки для прелоадера / плейсхолдера медиа-вложения
 * точного целевого размера, чтобы избежать скачков интерфейса и сдвигов сообщений
 * при асинхронной подгрузке превью.
 *
 * @param {object} rawMessage исходное сообщение или объект медиа
 * @param {object} [options]
 * @param {number} [options.maxWidth=36]
 * @param {number} [options.maxHeight=14]
 * @param {string} [options.customLabel] пользовательская подпись
 * @param {object} [options.palette] цвета темы (border, bg, fg, accent)
 * @returns {string}
 */
export function renderMediaPreloader(rawMessage, {
    maxWidth = 36,
    maxHeight = 14,
    customLabel,
    palette,
} = {}) {
    const dims = getMediaDimensions(rawMessage);
    const srcW = dims?.width || 320;
    const srcH = dims?.height || 240;
    const { dstW, rows } = calculateTargetDimensions(srcW, srcH, maxWidth, maxHeight);

    const p = { ...DEFAULT_PRELOADER_PALETTE, ...(palette || {}) };

    const media = rawMessage?.media || rawMessage;
    const isDoc = media?.className === "MessageMediaDocument" || Boolean(media?.document);
    const doc = media?.document || (isDoc ? media : null);
    const attributes = doc?.attributes || [];

    const isVideo = (typeof doc?.mimeType === "string" && doc.mimeType.startsWith("video/")) ||
        attributes.some((a) => a?.className === "DocumentAttributeVideo");
    const isGif = doc?.mimeType === "image/gif" ||
        attributes.some((a) => a?.className === "DocumentAttributeAnimated");
    const isSticker = attributes.some((a) => a?.className === "DocumentAttributeSticker");

    // Определение длительности видео, если доступна
    let duration = 0;
    if (isVideo) {
        const videoAttr = attributes.find((a) => a?.className === "DocumentAttributeVideo");
        if (videoAttr?.duration) {
            duration = videoAttr.duration;
        }
    }

    // Подготовка текстовых меток
    let primaryLabel = customLabel || "";
    if (!primaryLabel) {
        if (isVideo) {
            primaryLabel = dstW >= 24 ? "⏳ Загрузка видео..." : (dstW >= 16 ? "⏳ Видео..." : "⏳ Видео");
        } else if (isGif) {
            primaryLabel = dstW >= 22 ? "⏳ Загрузка GIF..." : "⏳ GIF";
        } else if (isSticker) {
            primaryLabel = dstW >= 24 ? "⏳ Загрузка стикера..." : "⏳ Стикер";
        } else {
            primaryLabel = dstW >= 22 ? "⏳ Загрузка фото..." : (dstW >= 16 ? "⏳ Фото..." : "⏳ Фото");
        }
    }

    let secondaryLabel = "";
    if (duration > 0 && dims?.width && dims?.height) {
        const minSec = `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}`;
        secondaryLabel = dstW >= 22 ? `${minSec} · ${dims.width}×${dims.height}` : minSec;
    } else if (duration > 0) {
        secondaryLabel = `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}`;
    } else if (dims?.width && dims?.height) {
        secondaryLabel = `${dims.width}×${dims.height}`;
    }

    const innerWidth = Math.max(1, dstW - 2);
    const innerHeight = Math.max(1, rows - 2);

    const borderTag = `{${p.border}-fg}`;
    const borderClose = `{/${p.border}-fg}`;
    const bgTag = p.bg ? `{${p.bg}-bg}` : "";
    const bgClose = p.bg ? `{/${p.bg}-bg}` : "";
    const textTag = `{${p.fg}-fg}`;
    const textClose = `{/${p.fg}-fg}`;
    const dimTag = `{${p.dim}-fg}`;
    const dimClose = `{/${p.dim}-fg}`;

    // Если места слишком мало для рамки (высота 1-2 строки)
    if (rows <= 1) {
        const line = `[ ${primaryLabel} ]`;
        const pad = Math.max(0, dstW - stringCellWidth(line));
        return `${bgTag}${textTag}${line}${" ".repeat(pad)}${textClose}${bgClose}`;
    }

    if (rows === 2) {
        const topLine = `${borderTag}┌─ ${borderClose}${textTag}${primaryLabel}${textClose} ${borderTag}${"─".repeat(Math.max(0, innerWidth - stringCellWidth(primaryLabel) - 3))}┐${borderClose}`;
        const botLine = `${borderTag}└${"─".repeat(innerWidth)}┘${borderClose}`;
        return `${bgTag}${topLine}${bgClose}\n${bgTag}${botLine}${bgClose}`;
    }

    const lines = [];

    // Верхняя граница
    lines.push(`${bgTag}${borderTag}┌${"─".repeat(innerWidth)}┐${borderClose}${bgClose}`);

    // Вычисление строки размещения подписей
    const hasSecondary = Boolean(secondaryLabel) && innerHeight >= 3 && stringCellWidth(secondaryLabel) <= innerWidth;
    const contentLinesCount = hasSecondary ? 2 : 1;
    const startContentRow = Math.max(0, Math.floor((innerHeight - contentLinesCount) / 2));

    for (let r = 0; r < innerHeight; r++) {
        let content = "";
        if (r === startContentRow) {
            let label = primaryLabel;
            if (stringCellWidth(label) > innerWidth) {
                label = label.slice(0, Math.max(1, innerWidth - 1)) + "…";
            }
            const width = stringCellWidth(label);
            const leftPad = Math.max(0, Math.floor((innerWidth - width) / 2));
            const rightPad = Math.max(0, innerWidth - width - leftPad);
            content = " ".repeat(leftPad) + textTag + label + textClose + " ".repeat(rightPad);
        } else if (hasSecondary && r === startContentRow + 1) {
            let label = secondaryLabel;
            if (stringCellWidth(label) > innerWidth) {
                label = label.slice(0, Math.max(1, innerWidth - 1));
            }
            const width = stringCellWidth(label);
            const leftPad = Math.max(0, Math.floor((innerWidth - width) / 2));
            const rightPad = Math.max(0, innerWidth - width - leftPad);
            content = " ".repeat(leftPad) + dimTag + label + dimClose + " ".repeat(rightPad);
        } else {
            content = " ".repeat(innerWidth);
        }

        lines.push(`${bgTag}${borderTag}│${borderClose}${content}${borderTag}│${borderClose}${bgClose}`);
    }

    // Нижняя граница
    lines.push(`${bgTag}${borderTag}└${"─".repeat(innerWidth)}┘${borderClose}${bgClose}`);

    return lines.join("\n");
}

/**
 * Извлекает готовое превью изображения из кэша по объекту сообщения, если оно уже рендерилось.
 * @param {object} rawMessage
 * @param {object} [options]
 * @param {number} [options.maxWidth=36]
 * @param {number} [options.maxHeight=14]
 * @returns {string|null}
 */
export function getCachedImagePreview(rawMessage, { maxWidth = 36, maxHeight = 14 } = {}) {
    const media = rawMessage?.media || rawMessage;
    if (!media) return null;

    const photo = media.photo || (media.className === "MessageMediaPhoto" ? media : null);
    const doc = media.document || (media.className === "MessageMediaDocument" ? media : null);

    const keysToCheck = [];
    if (photo?.id) {
        keysToCheck.push(`photo_${photo.id}@${maxWidth}x${maxHeight}`);
        keysToCheck.push(`photo_full_${photo.id}@${maxWidth}x${maxHeight}`);
    }
    if (doc?.id) {
        keysToCheck.push(`doc_${doc.id}@${maxWidth}x${maxHeight}`);
        keysToCheck.push(`doc_full_${doc.id}@${maxWidth}x${maxHeight}`);
    }
    if (rawMessage?.id) {
        keysToCheck.push(`msg_${rawMessage.id}@${maxWidth}x${maxHeight}`);
        keysToCheck.push(`photo_full_${rawMessage.id}@${maxWidth}x${maxHeight}`);
        keysToCheck.push(`doc_full_${rawMessage.id}@${maxWidth}x${maxHeight}`);
    }

    for (const key of keysToCheck) {
        if (imagePreviewCache.has(key)) {
            return imagePreviewCache.get(key);
        }
    }

    return null;
}
