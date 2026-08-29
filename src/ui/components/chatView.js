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
        alwaysScroll: true,
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
            if (msg.mediaDescription) {
                bodyText = bodyText ? `${msg.mediaDescription}\n  ${bodyText}` : msg.mediaDescription;
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
        scrollBox.setContent(renderMessages(messages));
        if (autoScrollToBottom) {
            scrollBox.setScrollPerc(100);
        }
        screen.render();
    }

    // Обработка прокрутки вверх для подгрузки истории
    scrollBox.key(["pageup", "C-u"], () => {
        scrollBox.scroll(-10);
        if (scrollBox.getScroll() <= 0) {
            onLoadMoreHistory?.();
        }
        screen.render();
    });

    scrollBox.key(["pagedown", "C-d"], () => {
        scrollBox.scroll(10);
        screen.render();
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
        scrollToBottom: () => {
            scrollBox.setScrollPerc(100);
            screen.render();
        },
        focus: () => scrollBox.focus(),
    };
}
