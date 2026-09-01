import blessed from "neo-blessed";
import { formatMessageTime, formatDateDivider } from "../../utils/time.js";
import { formatMessageText, escapeBlessed } from "../../telegram/formatter.js";
import { fg } from "../theme.js";

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

    let currentMessages = [];

    /**
     * Форматирует список сообщений в единую ленту текста с разметкой Blessed.
     * @param {Array<object>} messages
     * @returns {string}
     */
    function renderMessages(messages) {
        if (!messages || messages.length === 0) {
            return `\n\n  ${fg(theme.muted, "Сообщений пока нет. Напишите первое сообщение ниже!")}`;
        }

        let output = "";
        let lastDateString = "";

        for (const msg of messages) {
            // Разделитель дат
            const dateStr = formatDateDivider(msg.date);
            if (dateStr && dateStr !== lastDateString) {
                output += `\n  ${fg(theme.chatView.dateDivider, `─────── ${escapeBlessed(dateStr)} ───────`)}\n\n`;
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
            if (msg.replyToMsgId) {
                replyBlock = `  ${fg(theme.chatView.replyBorder, `┌─ Ответ на сообщение #${msg.replyToMsgId}`)}\n`;
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

            // Реакции
            let reactionsLine = "";
            if (msg.reactions && msg.reactions.length > 0) {
                const list = msg.reactions.map((r) => `${r.emoticon} ${r.count}`).join("  ");
                reactionsLine = `\n  ${fg(theme.chatView.reactionFg, `{bold}${list}{/bold}`)}`;
            }

            // Метка редактирования
            let editedTag = "";
            if (msg.editDate) {
                editedTag = ` ${fg(theme.chatView.time, "(изменено)")}`;
            }

            output += ` ${authorTag}${editedTag}\n${replyBlock}${indentedBody}${reactionsLine}\n\n`;
        }

        return output;
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

        scrollBox.setContent(renderMessages(messages));

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
        if (scrollBox.getScroll() <= 0) {
            onLoadMoreHistory?.();
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
