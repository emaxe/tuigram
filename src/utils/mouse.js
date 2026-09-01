/**
 * Утилиты для обработки координат и сценариев взаимодействия с мышью в TUI.
 */

import unicode from "neo-blessed/lib/unicode.js";

/** Пиктограммы и эмодзи, занимающие две ячейки терминала. */
const EMOJI_REGEX = /\p{Extended_Pictographic}/u;

/**
 * Вычисляет ширину строки в терминальных ячейках.
 * Учитывает двухъячеечные эмодзи и разметку blessed.
 * @param {string} text
 * @returns {number}
 */
export function stringCellWidth(text) {
    if (!text) return 0;
    const clean = text.replace(/\{[^{}]+\}/g, "");
    let width = 0;
    for (const char of clean) {
        const byBlessed = unicode.strWidth(char);
        width += EMOJI_REGEX.test(char) ? Math.max(2, byBlessed) : byBlessed;
    }
    return width;
}

/**
 * Проверяет, попадают ли координаты (x, y) внутрь прямоугольной области.
 * @param {number} x абсолютная или относительная X-координата
 * @param {number} y абсолютная или относительная Y-координата
 * @param {{ left: number, top: number, width: number, height: number }} bounds
 * @returns {boolean}
 */
export function isInsideBox(x, y, bounds) {
    if (!bounds) return false;
    const { left = 0, top = 0, width = 0, height = 0 } = bounds;
    return x >= left && x < left + width && y >= top && y < top + height;
}

const DEFAULT_TAB_KEYS = ["all", "users", "groups", "channels", "bots", "unread"];
const DEFAULT_TAB_NAMES = ["1:Все", "2:ЛС", "3:Группы", "4:Каналы", "5:Боты", "6:Непроч"];

/**
 * Определяет ключ вкладки диалогов по относительному горизонтальному смещению курсора мыши.
 * @param {number} relativeX смещение по X от левого края строки вкладок (в ячейках)
 * @param {string[]} [tabKeys] ключи вкладок
 * @param {string[]} [tabNames] отображаемые названия вкладок
 * @returns {string|null} ключ выбранной вкладки или null
 */
export function getTabByCoordinate(relativeX, tabKeys = DEFAULT_TAB_KEYS, tabNames = DEFAULT_TAB_NAMES) {
    if (relativeX < 0) return null;

    let currentX = 0;
    for (let i = 0; i < tabNames.length; i++) {
        // Каждая вкладка оформляется с одним ведущим и одним замыкающим пробелом
        const tabWidth = stringCellWidth(` ${tabNames[i]} `);
        if (relativeX >= currentX && relativeX < currentX + tabWidth) {
            return tabKeys[i] || null;
        }
        currentX += tabWidth;
    }

    return null;
}

/**
 * Строит карту диапазонов строк для каждого сообщения в ленте чата.
 * Нужна для точного определения сообщения, по которому кликнули мышью в ChatView.
 * @param {Array<object>} messages список сообщений чата
 * @returns {Array<{ message: object, startLine: number, endLine: number }>}
 */
export function buildMessageLineRanges(messages) {
    if (!messages || messages.length === 0) return [];

    const ranges = [];
    let currentLine = 0;
    let lastDateString = "";

    for (const msg of messages) {
        // 1. Проверяем разделитель дат (если дата изменилась)
        const dateDivider = msg.date ? new Date(msg.date).toLocaleDateString("ru-RU") : "";
        if (dateDivider && dateDivider !== lastDateString) {
            // Форматтер добавляет: \n ─────── дата ─────── \n\n (3 строки)
            currentLine += 3;
            lastDateString = dateDivider;
        }

        const startLine = currentLine;

        // 2. Строка автора/времени
        currentLine += 1;

        // 3. Блок ответа (Reply), если есть
        if (msg.replyToMsgId) {
            currentLine += 1;
        }

        // 4. Тело сообщения (текст + медиа-описание + превью)
        let bodyLinesCount = 1;
        const parts = [];
        if (msg.mediaDescription) parts.push(msg.mediaDescription);
        if (msg.imagePreview) parts.push(msg.imagePreview);
        if (msg.text) parts.push(msg.text);

        if (parts.length > 0) {
            const fullBody = parts.join("\n");
            bodyLinesCount = fullBody.split("\n").length;
        }
        currentLine += bodyLinesCount;

        // 5. Реакции, если есть
        if (msg.reactions && msg.reactions.length > 0) {
            currentLine += 1;
        }

        // 6. Замыкающий отступ между сообщениями (\n\n)
        const endLine = currentLine;
        currentLine += 2;

        ranges.push({
            message: msg,
            startLine,
            endLine,
        });
    }

    return ranges;
}

/**
 * Находит сообщение в ленте по номеру отображаемой строки с учётом текущей прокрутки.
 * @param {number} lineIndex индекс строки в буфере ленты (0-based)
 * @param {Array<{ message: object, startLine: number, endLine: number }>} ranges
 * @returns {object|null}
 */
export function getMessageAtLine(lineIndex, ranges) {
    if (!ranges || ranges.length === 0 || lineIndex < 0) return null;

    for (const item of ranges) {
        if (lineIndex >= item.startLine && lineIndex <= item.endLine) {
            return item.message;
        }
    }

    return null;
}

/**
 * Определяет действие по клику на строку состояния внизу экрана.
 * @param {number} relativeX смещение по X от левого края строки состояния
 * @param {number} [totalWidth=120] общая ширина терминала
 * @returns {"focus"|"select"|"tabs"|"search"|"help"|"actions"|"info"|"quit"|null}
 */
export function getStatusBarActionAt(relativeX, totalWidth = 120) {
    if (relativeX < 0 || relativeX >= totalWidth) return null;

    // Сегменты подсказок в строке состояния:
    // [Tab] Панель │ [Enter] Выбрать/Отправить │ [1-6] Вкладки │ [/] Поиск │ [F1] Помощь │ [Ctrl+A] Действия │ [Ctrl+P] Инфо │ [Ctrl+Q] Выход
    const segments = [
        { id: "focus", label: " [Tab] Панель " },
        { id: "select", label: " [Enter] Выбрать/Отправить " },
        { id: "tabs", label: " [1-6] Вкладки " },
        { id: "search", label: " [/] Поиск " },
        { id: "help", label: " [F1] Помощь " },
        { id: "actions", label: " [Ctrl+A] Действия " },
        { id: "info", label: " [Ctrl+P] Инфо " },
        { id: "quit", label: " [Ctrl+Q] Выход" },
    ];

    let currentX = 0;
    for (const seg of segments) {
        const segWidth = stringCellWidth(seg.label) + 1; // +1 на разделитель "│"
        if (relativeX >= currentX && relativeX < currentX + segWidth) {
            return seg.id;
        }
        currentX += segWidth;
    }

    return null;
}

/**
 * Определяет действие при клике на верхнюю шапку приложения.
 * @param {number} relativeX смещение по X от левого края шапки
 * @param {number} relativeY смещение по Y от верхнего края шапки (0..3)
 * @param {object} [options]
 * @param {boolean} [options.hasActiveChat=false] есть ли выбранный активный чат
 * @returns {"help"|"info"|"status"|null}
 */
export function getHeaderActionAt(relativeX, relativeY, { hasActiveChat = false } = {}) {
    // Внутренняя строка 1 (верхняя линия контента): логотип TuiGram, имя пользователя, статус
    if (relativeY === 1) {
        if (relativeX >= 1 && relativeX <= 14) {
            return "help";
        }
        return "status";
    }

    // Внутренняя строка 2 (нижняя линия контента): активный чат
    if (relativeY === 2) {
        if (hasActiveChat) {
            return "info";
        }
    }

    return null;
}

/**
 * Определяет действие при клике на контекстную строку поля ввода.
 * @param {number} relativeX смещение по X от левого края контекстной строки
 * @param {string|null} mode текущий режим ("reply"|"edit"|null)
 * @returns {"cancel"|"reply"|"edit"|"commands"|null}
 */
export function getInputContextActionAt(relativeX, mode) {
    if (mode === "reply" || mode === "edit") {
        // Любой клик по плашке ответа/редактирования (или по кнопке [Esc: Отмена]) сбрасывает режим
        return "cancel";
    }

    if (relativeX < 0) return null;

    // Подсказки в обычном режиме:
    //  Введите сообщение...   [Enter] Отправить   [Ctrl+J] Новая строка   [Ctrl+R] Ответ   [Ctrl+E] Правка   [/] Команды
    if (relativeX >= 55 && relativeX < 73) {
        return "reply";
    }
    if (relativeX >= 73 && relativeX < 91) {
        return "edit";
    }
    if (relativeX >= 91) {
        return "commands";
    }

    return null;
}
