import blessed from "neo-blessed";
import { formatMessageTime, formatDateDivider } from "../../utils/time.js";
import { formatMessageText, escapeBlessed } from "../../telegram/formatter.js";
import { fg } from "../theme.js";

import { getMessageAtLine } from "../../utils/mouse.js";

/**
 * Создаёт компонент просмотра сообщений чата (правая центральная панель).
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @param {object} callbacks
 * @param {() => void} [callbacks.onLoadMoreHistory]
 * @param {(msg: object) => void} [callbacks.onActionMenu]
 */
export function createChatView(screen, theme, { onLoadMoreHistory, onActionMenu } = {}) {
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
        mouse: true,
        keys: true,
        vi: true,
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

    /** Подсвечивает рамку, когда лента сообщений в фокусе. */
    function setFocusHighlight(active) {
        container.style.border.fg = active ? theme.borders.focusFg : theme.borders.fg;
        screen.render();
    }

    scrollBox.on("focus", () => setFocusHighlight(true));
    scrollBox.on("blur", () => setFocusHighlight(false));

    let currentMessages = [];
    let currentRanges = [];

    /**
     * Форматирует список сообщений в единую ленту текста с разметкой Blessed
     * и вычисляет координаты строк каждого сообщения для кликов мыши.
     * @param {Array<object>} messages
     * @returns {{ text: string, ranges: Array<{ message: object, startLine: number, endLine: number }> }}
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

            // Блок ответа (Reply)
            let replyBlock = "";
            let replyLines = 0;
            if (msg.replyToMsgId) {
                replyBlock = `  ${fg(theme.chatView.replyBorder, `┌─ Ответ на сообщение #${msg.replyToMsgId}`)}\n`;
                replyLines = 1;
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

            // Отступ строк текста сообщения
            const indentedBody = bodyText
                .split("\n")
                .map((line) => `  ${line}`)
                .join("\n");
            const bodyLinesCount = indentedBody.split("\n").length;

            // Реакции
            let reactionsLine = "";
            let reactionLinesCount = 0;
            if (msg.reactions && msg.reactions.length > 0) {
                const list = msg.reactions.map((r) => `${r.emoticon} ${r.count}`).join("  ");
                reactionsLine = `\n  ${fg(theme.chatView.reactionFg, `{bold}${list}{/bold}`)}`;
                reactionLinesCount = 1;
            }

            // Метка редактирования
            let editedTag = "";
            if (msg.editDate) {
                editedTag = ` ${fg(theme.chatView.time, "(изменено)")}`;
            }

            const startLine = lineCursor;
            const totalMsgLines = 1 + replyLines + bodyLinesCount + reactionLinesCount;
            const endLine = startLine + totalMsgLines - 1;

            ranges.push({ message: msg, startLine, endLine });
            lineCursor += totalMsgLines + 2;

            output += ` ${authorTag}${editedTag}\n${replyBlock}${indentedBody}${reactionsLine}\n\n`;
        }

        return { text: output, ranges };
    }

    /**
     * Устанавливает сообщения в ленту.
     * @param {Array<object>} messages
     * @param {boolean} [autoScrollToBottom=true]
     */
    function setMessages(messages, autoScrollToBottom = true) {
        currentMessages = messages;
        const prevScroll = scrollBox.getScroll();
        const prevHeight = scrollBox.getScrollHeight();

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

    // Обработка прокрутки вверх для подгрузки истории
    function handleScrollUp(step = 10) {
        scrollBox.scroll(-step);
        if (scrollBox.getScroll() <= 0) {
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
    scrollBox.key(["up", "k"], () => handleScrollUp(2));
    scrollBox.key(["down", "j"], () => handleScrollDown(2));
    scrollBox.key(["home"], () => {
        scrollBox.scrollTo(0);
        onLoadMoreHistory?.();
        screen.render();
    });
    scrollBox.key(["end"], () => {
        scrollBox.setScrollPerc(100);
        screen.render();
    });

    scrollBox.on("wheelup", () => {
        handleScrollUp(3);
    });

    scrollBox.on("wheeldown", () => {
        handleScrollDown(3);
    });

    container.on("wheelup", () => {
        handleScrollUp(3);
    });

    container.on("wheeldown", () => {
        handleScrollDown(3);
    });

    scrollBox.on("click", (data) => {
        const clickY = data.y;
        const itop = scrollBox.itop || 0;
        const lineIndex = clickY - (scrollBox.atop || 0) + scrollBox.getScroll() - itop;
        const clickedMsg = getMessageAtLine(lineIndex, currentRanges);
        if (clickedMsg) {
            onActionMenu?.(clickedMsg);
        } else {
            scrollBox.focus();
            screen.render();
        }
    });

    // Ctrl+M терминал шлёт как "\r" (имя клавиши "return"), поэтому меню действий
    // висит на Ctrl+A — иначе оно недостижимо.
    scrollBox.key(["C-a"], () => {
        if (currentMessages.length > 0) {
            const lastMsg = currentMessages[currentMessages.length - 1];
            onActionMenu?.(lastMsg);
        }
    });

    return {
        container,
        scrollBox,
        setMessages,
        loadMore: () => onLoadMoreHistory?.(),
        scrollToBottom: () => {
            scrollBox.setScrollPerc(100);
            screen.render();
        },
        focus: () => scrollBox.focus(),
    };
}
