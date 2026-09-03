import blessed from "neo-blessed";
import { formatMessageTime, formatDateDivider } from "../../utils/time.js";
import { formatMessageText, escapeBlessed } from "../../telegram/formatter.js";
import { fg } from "../theme.js";

import { getMessagePartAtPoint, isRightClick, stringCellWidth } from "../../utils/mouse.js";
import { isMessageVideo } from "../../utils/video.js";

/** Отступ тела сообщения от левого края ленты, в ячейках. */
const BODY_INDENT = 2;

/**
 * Создаёт компонент просмотра сообщений чата (правая центральная панель).
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @param {object} callbacks
 * @param {() => void} [callbacks.onLoadMoreHistory]
 * @param {(msg: object) => void} [callbacks.onActionMenu] правый клик / Enter / Ctrl+A
 * @param {(msg: object) => void} [callbacks.onSelectMessage] сообщение выделено
 * @param {(msg: object) => void} [callbacks.onOpenImage] клик по превью изображения
 * @param {(msg: object) => void} [callbacks.onPlayVideo] клик по превью видео
 * @param {() => void} [callbacks.onFocusRequest] вызывается перед взятием фокуса мышью
 * @param {(maxReadId: number) => void} [callbacks.onMessagesRead] вызывается при прокрутке и прочтении сообщений
 * @param {(visibleMessages: Array<object>) => void} [callbacks.onVisibleMessagesChanged] вызывается при смене видимой области для Lazy Loading превью
 */
export function createChatView(screen, theme, {
    onLoadMoreHistory,
    onActionMenu,
    onSelectMessage,
    onOpenImage,
    onPlayVideo,
    onFocusRequest,
    onMessagesRead,
    onVisibleMessagesChanged,
} = {}) {
    const container = blessed.box({
        parent: screen,
        top: 4,
        left: "35%",
        right: 0,
        bottom: 6,
        mouse: true,
        border: {
            type: "line",
        },
        style: {
            bg: theme.chatView.bg,
            fg: theme.chatView.fg,
            border: {
                fg: theme.borders.fg,
            },
        },
    });

    const scrollBox = blessed.box({
        parent: container,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        tags: true,
        scrollable: true,
        // alwaysScroll обязателен: без него blessed копит смещение в childOffset,
        // не двигая содержимое (первые щелчки колеса «проглатываются»), а getScroll()
        // перестаёт совпадать с реальным сдвигом ленты — клики попадали не в то сообщение.
        alwaysScroll: true,
        mouse: true,
        // keys/vi намеренно выключены: их встроенные обработчики скроллят ленту на
        // стрелках, а стрелки здесь двигают выделение. Все клавиши навешаны явно ниже.
        scrollbar: {
            ch: "│",
            style: {
                bg: theme.scrollbar.bg,
                fg: theme.scrollbar.fg,
            },
        },
        style: {
            bg: theme.chatView.bg,
            fg: theme.chatView.fg,
        },
    });

    // blessed сам вешает на scrollable-box с mouse:true прокрутку колесом на пол-экрана.
    // Вместе с нашими обработчиками получалось height/2 + 3 строки за щелчок.
    scrollBox.removeAllListeners("wheelup");
    scrollBox.removeAllListeners("wheeldown");

    /** Подсвечивает рамку, когда лента сообщений в фокусе. */
    function setFocusHighlight(active) {
        container.style.border.fg = active ? theme.borders.focusFg : theme.borders.fg;
        screen.render();
    }

    scrollBox.on("focus", () => setFocusHighlight(true));
    scrollBox.on("blur", () => setFocusHighlight(false));

    let currentMessages = [];
    let currentRanges = [];
    let selectedId = null;
    let currentFirstUnreadId = null;
    let lastReportedMaxReadId = 0;

    // Кэш отформатированных строк сообщений для мгновенной перерисовки и прокрутки ленты
    const messageLinesCache = new Map();
    const MAX_LINES_CACHE = 1000;

    /**
     * Форматирует одиночное сообщение или возвращает готовые строки из кэша.
     * @param {object} msg
     * @returns {{ lines: Array<string>, bodyStartOffset: number, imageMeta: object|null }}
     */
    function getFormattedMessage(msg) {
        const previewLen = msg.imagePreview ? msg.imagePreview.length : 0;
        const reactionsCount = msg.reactions?.length || 0;
        const cacheKey = `${msg.id}_${msg.editDate || 0}_${previewLen}_${reactionsCount}_${msg.senderName || ""}_${msg.text || ""}`;

        if (messageLinesCache.has(cacheKey)) {
            return messageLinesCache.get(cacheKey);
        }

        const time = formatMessageTime(msg.date);
        const timeTag = fg(theme.chatView.time, `[${time}]`);

        // Отправитель
        let authorTag = "";
        if (msg.out && !msg.post) {
            const readCheck = fg(theme.chatView.outgoingName, "✓✓");
            authorTag = `${fg(theme.chatView.outgoingName, "{bold}Вы{/bold}")} ${timeTag} ${readCheck}`;
        } else {
            const name = escapeBlessed(msg.senderName || (msg.post ? "Канал" : "Собеседник"));
            authorTag = `${fg(theme.chatView.incomingName, `{bold}${name}{/bold}`)} ${timeTag}`;
        }

        // Метка редактирования
        const editedTag = msg.editDate ? ` ${fg(theme.chatView.time, "(изменено)")}` : "";
        const lines = [` ${authorTag}${editedTag}`];

        // Блок ответа (Reply)
        if (msg.replyToMsgId) {
            lines.push(`  ${fg(theme.chatView.replyBorder, `┌─ Ответ на сообщение #${msg.replyToMsgId}`)}`);
        }

        // Текст сообщения и entities
        let bodyText = formatMessageText(msg.text, msg.entities);

        // Блок медиа-вложения и превью изображения
        let mediaBlock = "";
        if (msg.imagePreview) {
            mediaBlock = msg.mediaDescription
                ? `${msg.mediaDescription}\n${msg.imagePreview}`
                : msg.imagePreview;
        } else if (msg.mediaDescription) {
            mediaBlock = msg.mediaDescription;
        }

        if (mediaBlock) {
            bodyText = bodyText ? `${mediaBlock}\n${bodyText}` : mediaBlock;
        }

        // Строка, с которой начинается тело — нужна для координат превью
        const bodyStartOffset = lines.length;
        for (const line of bodyText.split("\n")) {
            lines.push(`  ${line}`);
        }

        // Реакции
        if (msg.reactions && msg.reactions.length > 0) {
            const list = msg.reactions.map((r) => `${r.emoticon} ${r.count}`).join("  ");
            lines.push(`  ${fg(theme.chatView.reactionFg, `{bold}${list}{/bold}`)}`);
        }

        let imageMeta = null;
        if (msg.imagePreview) {
            const descLines = msg.mediaDescription ? msg.mediaDescription.split("\n").length : 0;
            const previewLines = msg.imagePreview.split("\n");
            const width = previewLines.reduce((max, line) => Math.max(max, stringCellWidth(line)), 0);
            imageMeta = {
                descLines,
                lineCount: previewLines.length,
                width,
            };
        }

        const result = { lines, bodyStartOffset, imageMeta };
        if (messageLinesCache.size >= MAX_LINES_CACHE) {
            const firstKey = messageLinesCache.keys().next().value;
            messageLinesCache.delete(firstKey);
        }
        messageLinesCache.set(cacheKey, result);
        return result;
    }

    /**
     * Форматирует список сообщений в единую ленту текста с разметкой Blessed
     * и вычисляет координаты строк каждого сообщения для кликов мыши.
     * @param {Array<object>} messages
     * @param {number|null} [firstUnreadId=null]
     * @returns {{ text: string, ranges: Array<object> }}
     */
    function renderMessagesWithRanges(messages, firstUnreadId = null) {
        if (!messages || messages.length === 0) {
            return {
                text: `\n\n  ${fg(theme.muted, "Сообщений пока нет. Напишите первое сообщение ниже!")}`,
                ranges: [],
            };
        }

        let output = "";
        let lastDateString = "";
        const ranges = [];
        let lineCursor = 0;

        for (const msg of messages) {
            // Разделитель дат
            const dateStr = formatDateDivider(msg.date);
            if (dateStr && dateStr !== lastDateString) {
                output += `\n  ${fg(theme.chatView.dateDivider, `─────── ${escapeBlessed(dateStr)} ───────`)}\n\n`;
                lineCursor += 3;
                lastDateString = dateStr;
            }

            // Разделитель непрочитанных сообщений
            if (firstUnreadId && msg.id === firstUnreadId) {
                const unreadColor = theme.chatView.unreadDivider || theme.accent;
                output += `\n  ${fg(unreadColor, "─────── Непрочитанные сообщения ───────")}\n\n`;
                lineCursor += 3;
            }

            const { lines, bodyStartOffset, imageMeta } = getFormattedMessage(msg);
            const startLine = lineCursor;

            // Прямоугольник превью изображения внутри сообщения
            let image = null;
            if (imageMeta) {
                const imageStart = startLine + bodyStartOffset + imageMeta.descLines;
                image = {
                    startLine: imageStart,
                    endLine: imageStart + imageMeta.lineCount - 1,
                    left: BODY_INDENT,
                    right: BODY_INDENT + imageMeta.width,
                };
            }

            // Выделенное сообщение помечается полосой в первой колонке. Первая колонка
            // каждой строки — пробел отступа, поэтому ширина строк не меняется и карта
            // координат остаётся верной.
            const isSelected = msg.id === selectedId;
            const rendered = isSelected
                ? lines.map((line) => `${fg(theme.accent, "▌")}${line.slice(1)}`)
                : lines;

            ranges.push({
                message: msg,
                startLine,
                endLine: startLine + lines.length - 1,
                image,
            });

            // lines.length строк + одна пустая строка-разделитель между сообщениями
            lineCursor += lines.length + 1;
            output += `${rendered.join("\n")}\n\n`;
        }

        return { text: output, ranges };
    }

    /**
     * Вычисляет фактическую видимую высоту окна ленты сообщений в строках терминала.
     * @returns {number}
     */
    function getVisibleHeight() {
        const lpos = scrollBox.lpos || scrollBox._getCoords();
        if (lpos && lpos.yl > lpos.yi) {
            return Math.max(1, lpos.yl - lpos.yi - (scrollBox.iheight || 0));
        }
        return Math.max(1, (screen.height || 24) - 10);
    }

    /**
     * Точно прокручивает ленту к указанной строке содержимого, избегая багов blessed с относительными высотами.
     * @param {number} targetLine
     */
    function scrollToLine(targetLine) {
        const totalLines = scrollBox._clines?.length || scrollBox.getScrollHeight() || 0;
        const visible = getVisibleHeight();
        const maxBase = Math.max(0, totalLines - visible);
        const clamped = Math.max(0, Math.min(targetLine, maxBase));
        scrollBox.childBase = clamped;
        scrollBox.childOffset = 0;
    }

    /**
     * Прокручивает ленту в самый низ (к последнему сообщению).
     */
    function scrollToBottom() {
        const totalLines = scrollBox._clines?.length || scrollBox.getScrollHeight() || 0;
        const visible = getVisibleHeight();
        scrollBox.childBase = Math.max(0, totalLines - visible);
        scrollBox.childOffset = 0;
    }

    /** Перерисовывает ленту, сохраняя позицию прокрутки (например, после смены выделения). */
    function redraw() {
        const prevBase = scrollBox.childBase || 0;
        const rendered = renderMessagesWithRanges(currentMessages, currentFirstUnreadId);
        currentRanges = rendered.ranges;
        scrollBox.setContent(rendered.text);
        scrollToLine(prevBase);
        screen.render();
    }

    /**
     * Вычисляет видимые в данный момент сообщения, уведомляет о прочитанных
     * и передаёт видимые сообщения для ленивой подгрузки превью (Lazy Loading).
     */
    function checkVisibleMessages() {
        if (!currentRanges || currentRanges.length === 0) return;

        const visibleHeight = getVisibleHeight();
        const viewportTop = scrollBox.childBase || 0;
        const viewportBottom = viewportTop + visibleHeight - 1;

        // Буфер в 5 строк сверху и снизу для плавной подгрузки перед появлением на экране
        const bufferTop = Math.max(0, viewportTop - 5);
        const bufferBottom = viewportBottom + 5;

        let maxVisibleId = 0;
        const visibleMessages = [];

        for (const range of currentRanges) {
            const startRendered = toRenderedLine(range.startLine, "first");
            const endRendered = toRenderedLine(range.endLine, "last");

            // Проверка для отметки прочитанных (сообщение началось до низа экрана)
            if (startRendered <= viewportBottom) {
                if (range.message.id > maxVisibleId) {
                    maxVisibleId = range.message.id;
                }
            }

            // Проверка попадания в видимый диапазон (для Lazy Loading)
            if (endRendered >= bufferTop && startRendered <= bufferBottom) {
                visibleMessages.push(range.message);
            }
        }

        if (maxVisibleId > lastReportedMaxReadId) {
            lastReportedMaxReadId = maxVisibleId;
            onMessagesRead?.(maxVisibleId);
        }

        if (visibleMessages.length > 0) {
            onVisibleMessagesChanged?.(visibleMessages);
        }
    }

    /**
     * Устанавливает сообщения в ленту.
     * @param {Array<object>} messages
     * @param {boolean|object} [scrollOption=true]
     */
    function setMessages(messages, scrollOption = true) {
        currentMessages = messages;
        const prevScroll = scrollBox.childBase || 0;
        const prevHeight = scrollBox.getScrollHeight();

        let autoScrollToBottom = true;
        let firstUnreadId = null;
        let preserveScroll = false;

        if (typeof scrollOption === "boolean") {
            autoScrollToBottom = scrollOption;
            preserveScroll = !scrollOption;
        } else if (scrollOption && typeof scrollOption === "object") {
            autoScrollToBottom = Boolean(scrollOption.autoScrollToBottom);
            firstUnreadId = scrollOption.firstUnreadId !== undefined ? scrollOption.firstUnreadId : null;
            preserveScroll = Boolean(scrollOption.preserveScroll);
        }

        if (firstUnreadId !== undefined) {
            currentFirstUnreadId = firstUnreadId;
        }

        // Выделенное сообщение могло быть удалено или относиться к другому чату
        if (selectedId !== null && !messages.some((m) => m.id === selectedId)) {
            selectedId = null;
        }

        const rendered = renderMessagesWithRanges(messages, currentFirstUnreadId);
        currentRanges = rendered.ranges;
        scrollBox.setContent(rendered.text);

        if (currentFirstUnreadId) {
            const range = currentRanges.find((r) => r.message.id === currentFirstUnreadId);
            if (range) {
                const targetLine = toRenderedLine(range.startLine, "first");
                scrollToLine(Math.max(0, targetLine - 2));
            } else if (autoScrollToBottom) {
                scrollToBottom();
            }
        } else if (autoScrollToBottom) {
            scrollToBottom();
        } else if (preserveScroll) {
            // Сохраняем относительную позицию скролла: если добавились старые сообщения сверху,
            // компенсируем сдвиг высоты ленты
            const newHeight = scrollBox.getScrollHeight();
            const addedLines = newHeight - prevHeight;
            if (addedLines > 0 && prevScroll > 0) {
                scrollToLine(prevScroll + addedLines);
            } else if (prevScroll > 0) {
                scrollToLine(prevScroll);
            }
        }
        screen.render();
        checkVisibleMessages();
    }

    /**
     * Переводит номер отрисованной строки в номер строки исходного содержимого.
     * blessed переносит длинные строки, поэтому напрямую индексы не совпадают.
     * @param {number} renderedLine
     * @returns {number}
     */
    function toContentLine(renderedLine) {
        const rtof = scrollBox._clines?.rtof;
        if (Array.isArray(rtof) && renderedLine >= 0 && renderedLine < rtof.length) {
            return rtof[renderedLine];
        }
        return renderedLine;
    }

    /**
     * Обратное преобразование: первая и последняя отрисованные строки для строки содержимого.
     * @param {number} contentLine
     * @param {"first"|"last"} edge
     * @returns {number}
     */
    function toRenderedLine(contentLine, edge = "first") {
        const ftor = scrollBox._clines?.ftor;
        const mapped = Array.isArray(ftor) ? ftor[contentLine] : null;
        if (!Array.isArray(mapped) || mapped.length === 0) return contentLine;
        return edge === "first" ? mapped[0] : mapped[mapped.length - 1];
    }

    /** Подкручивает ленту так, чтобы выделенное сообщение было видно целиком. */
    function scrollMessageIntoView(range) {
        if (!range) return;
        const visible = getVisibleHeight();
        const base = scrollBox.childBase || 0;
        const top = toRenderedLine(range.startLine, "first");
        const bottom = toRenderedLine(range.endLine, "last");

        if (top < base) {
            scrollToLine(top);
        } else if (bottom >= base + visible) {
            scrollToLine(Math.max(0, bottom - visible + 1));
        }
    }

    /**
     * Выделяет сообщение по идентификатору.
     * @param {number|null} id
     * @param {object} [options]
     * @param {boolean} [options.scrollIntoView=false]
     * @param {boolean} [options.notify=false] вызвать onSelectMessage
     */
    function setSelected(id, { scrollIntoView = false, notify = false } = {}) {
        if (selectedId === id && !scrollIntoView) return;
        selectedId = id;
        redraw();

        const range = currentRanges.find((r) => r.message.id === id);
        if (scrollIntoView && range) {
            scrollMessageIntoView(range);
            screen.render();
        }
        if (notify && range) {
            onSelectMessage?.(range.message);
        }
    }

    /** @returns {object|null} выделенное сообщение */
    function getSelected() {
        if (selectedId === null) return null;
        return currentMessages.find((m) => m.id === selectedId) || null;
    }

    /** Сообщение, над которым выполняются действия: выделенное, иначе последнее. */
    function getTargetMessage() {
        return getSelected() || currentMessages[currentMessages.length - 1] || null;
    }

    /**
     * Двигает выделение на step сообщений и подкручивает ленту к нему.
     * @param {number} step
     */
    function selectByOffset(step) {
        if (currentMessages.length === 0) return;

        const currentIndex = currentMessages.findIndex((m) => m.id === selectedId);
        let nextIndex;
        if (currentIndex === -1) {
            nextIndex = currentMessages.length - 1;
        } else {
            nextIndex = Math.min(currentMessages.length - 1, Math.max(0, currentIndex + step));
        }

        setSelected(currentMessages[nextIndex].id, { scrollIntoView: true, notify: true });

        // Дошли до верха ленты — подтягиваем предыдущую страницу истории
        if (nextIndex === 0 && step < 0) {
            onLoadMoreHistory?.();
        }
    }

    // Обработка прокрутки вверх для подгрузки истории
    function handleScrollUp(step = 10) {
        const current = scrollBox.childBase || 0;
        scrollToLine(Math.max(0, current - step));
        if ((scrollBox.childBase || 0) <= 0) {
            onLoadMoreHistory?.();
        }
        screen.render();
        checkVisibleMessages();
    }

    function handleScrollDown(step = 10) {
        const current = scrollBox.childBase || 0;
        scrollToLine(current + step);
        screen.render();
        checkVisibleMessages();
    }

    scrollBox.key(["pageup", "C-u"], () => handleScrollUp(10));
    scrollBox.key(["pagedown", "C-d"], () => handleScrollDown(10));
    scrollBox.key(["up", "k"], () => selectByOffset(-1));
    scrollBox.key(["down", "j"], () => selectByOffset(1));
    scrollBox.key(["home"], () => {
        scrollToLine(0);
        onLoadMoreHistory?.();
        screen.render();
        checkVisibleMessages();
    });
    scrollBox.key(["end"], () => {
        scrollToBottom();
        screen.render();
        checkVisibleMessages();
    });

    scrollBox.on("wheelup", () => handleScrollUp(3));
    scrollBox.on("wheeldown", () => handleScrollDown(3));
    container.on("wheelup", () => handleScrollUp(3));
    container.on("wheeldown", () => handleScrollDown(3));

    scrollBox.on("click", (data) => {
        const renderedLine = data.y - (scrollBox.atop || 0) - (scrollBox.itop || 0) + (scrollBox.childBase || 0);
        const relX = data.x - (scrollBox.aleft || 0) - (scrollBox.ileft || 0);
        const hit = getMessagePartAtPoint(toContentLine(renderedLine), relX, currentRanges);

        if (!hit) {
            // Клик по пустому месту ленты — просто передаём ей фокус
            onFocusRequest?.();
            scrollBox.focus();
            screen.render();
            return;
        }

        if (isRightClick(data)) {
            setSelected(hit.message.id);
            onActionMenu?.(hit.message);
            return;
        }

        if (hit.part === "image") {
            setSelected(hit.message.id);
            if (isMessageVideo(hit.message) && onPlayVideo) {
                onPlayVideo(hit.message);
            } else {
                onOpenImage?.(hit.message);
            }
            return;
        }

        onFocusRequest?.();
        scrollBox.focus();
        setSelected(hit.message.id, { notify: true });
    });

    // Ctrl+M терминал шлёт как "\r" (имя клавиши "return"), поэтому меню действий
    // висит на Ctrl+A — иначе оно недостижимо.
    scrollBox.key(["C-a", "enter", "return"], () => {
        const msg = getTargetMessage();
        if (msg) {
            setSelected(msg.id);
            onActionMenu?.(msg);
        }
    });

    // Отслеживание прокрутки для обновления прочитанных сообщений
    scrollBox.on("scroll", () => {
        checkVisibleMessages();
    });

    return {
        container,
        scrollBox,
        setMessages,
        setSelected,
        getSelected,
        getTargetMessage,
        selectByOffset,
        resetReadState: (initialReadMaxId = 0) => {
            lastReportedMaxReadId = initialReadMaxId;
            currentFirstUnreadId = null;
        },
        checkVisibleMessages,
        loadMore: () => onLoadMoreHistory?.(),
        scrollToBottom: () => {
            scrollToBottom();
            screen.render();
            checkVisibleMessages();
        },
        focus: () => scrollBox.focus(),
    };
}
