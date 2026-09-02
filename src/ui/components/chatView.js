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
 */
export function createChatView(screen, theme, {
    onLoadMoreHistory,
    onActionMenu,
    onSelectMessage,
    onOpenImage,
    onPlayVideo,
    onFocusRequest,
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

    /**
     * Форматирует список сообщений в единую ленту текста с разметкой Blessed
     * и вычисляет координаты строк каждого сообщения для кликов мыши.
     * @param {Array<object>} messages
     * @returns {{ text: string, ranges: Array<object> }}
     */
    function renderMessagesWithRanges(messages) {
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

            const time = formatMessageTime(msg.date);
            const timeTag = fg(theme.chatView.time, `[${time}]`);

            // Отправитель
            let authorTag = "";
            if (msg.out) {
                const readCheck = fg(theme.chatView.outgoingName, "✓✓");
                authorTag = `${fg(theme.chatView.outgoingName, "{bold}Вы{/bold}")} ${timeTag} ${readCheck}`;
            } else {
                const name = escapeBlessed(msg.senderName || "Собеседник");
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

            const startLine = lineCursor;

            // Прямоугольник превью изображения внутри сообщения
            let image = null;
            if (msg.imagePreview) {
                const descLines = msg.mediaDescription ? msg.mediaDescription.split("\n").length : 0;
                const previewLines = msg.imagePreview.split("\n");
                const imageStart = startLine + bodyStartOffset + descLines;
                const width = previewLines.reduce((max, line) => Math.max(max, stringCellWidth(line)), 0);
                image = {
                    startLine: imageStart,
                    endLine: imageStart + previewLines.length - 1,
                    left: BODY_INDENT,
                    right: BODY_INDENT + width,
                };
            }

            // Выделенное сообщение помечается полосой в первой колонке. Первая колонка
            // каждой строки — пробел отступа, поэтому ширина строк не меняется и карта
            // координат остаётся верной.
            const rendered = msg.id === selectedId
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

    /** Перерисовывает ленту, сохраняя позицию прокрутки (например, после смены выделения). */
    function redraw() {
        const prevBase = scrollBox.childBase || 0;
        const rendered = renderMessagesWithRanges(currentMessages);
        currentRanges = rendered.ranges;
        scrollBox.setContent(rendered.text);
        scrollBox.scrollTo(prevBase);
        screen.render();
    }

    /**
     * Устанавливает сообщения в ленту.
     * @param {Array<object>} messages
     * @param {boolean} [autoScrollToBottom=true]
     */
    function setMessages(messages, autoScrollToBottom = true) {
        currentMessages = messages;
        const prevScroll = scrollBox.childBase || 0;
        const prevHeight = scrollBox.getScrollHeight();

        // Выделенное сообщение могло быть удалено или относиться к другому чату
        if (selectedId !== null && !messages.some((m) => m.id === selectedId)) {
            selectedId = null;
        }

        const rendered = renderMessagesWithRanges(messages);
        currentRanges = rendered.ranges;
        scrollBox.setContent(rendered.text);

        if (autoScrollToBottom) {
            scrollBox.setScrollPerc(100);
        } else {
            // Сохраняем относительную позицию скролла: если добавились старые сообщения сверху,
            // компенсируем сдвиг высоты ленты
            const newHeight = scrollBox.getScrollHeight();
            const addedLines = newHeight - prevHeight;
            if (addedLines > 0 && prevScroll > 0) {
                scrollBox.scrollTo(prevScroll + addedLines);
            } else if (prevScroll > 0) {
                scrollBox.scrollTo(prevScroll);
            }
        }
        screen.render();
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
        const visible = scrollBox.height - scrollBox.iheight;
        const base = scrollBox.childBase || 0;
        const top = toRenderedLine(range.startLine, "first");
        const bottom = toRenderedLine(range.endLine, "last");

        if (top < base) {
            scrollBox.scrollTo(top);
        } else if (bottom >= base + visible) {
            scrollBox.scrollTo(Math.max(0, bottom - visible + 1));
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
        scrollBox.scroll(-step);
        if ((scrollBox.childBase || 0) <= 0) {
            onLoadMoreHistory?.();
        }
        screen.render();
    }

    function handleScrollDown(step = 10) {
        scrollBox.scroll(step);
        screen.render();
    }

    scrollBox.key(["pageup", "C-u"], () => handleScrollUp(10));
    scrollBox.key(["pagedown", "C-d"], () => handleScrollDown(10));
    scrollBox.key(["up", "k"], () => selectByOffset(-1));
    scrollBox.key(["down", "j"], () => selectByOffset(1));
    scrollBox.key(["home"], () => {
        scrollBox.scrollTo(0);
        onLoadMoreHistory?.();
        screen.render();
    });
    scrollBox.key(["end"], () => {
        scrollBox.setScrollPerc(100);
        screen.render();
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

    return {
        container,
        scrollBox,
        setMessages,
        setSelected,
        getSelected,
        getTargetMessage,
        selectByOffset,
        loadMore: () => onLoadMoreHistory?.(),
        scrollToBottom: () => {
            scrollBox.setScrollPerc(100);
            screen.render();
        },
        focus: () => scrollBox.focus(),
    };
}
