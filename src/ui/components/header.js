import blessed from "neo-blessed";
import { escapeBlessed } from "../../telegram/formatter.js";
import { fg } from "../theme.js";

/**
 * Верхняя шапка приложения с информацией о пользователе, активном чате и статусе соединения.
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @returns {blessed.Widgets.BoxElement & { updateInfo: (data: object) => void }}
 */
export function createHeader(screen, theme) {
    const headerBox = blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        width: "100%",
        // 4 = рамка (2) + две строки контента (профиль + активный чат)
        height: 4,
        tags: true,
        border: {
            type: "line",
        },
        style: {
            bg: theme.header.bg,
            fg: theme.header.fg,
            border: {
                fg: theme.borders.fg,
            },
        },
    });

    /**
     * Обновляет содержимое шапки.
     * @param {object} data
     * @param {object|null} [data.me]
     * @param {string} [data.status]
     * @param {object|null} [data.activeChat]
     * @param {string|null} [data.typingUser]
     */
    headerBox.updateInfo = function ({ me, status = "connected", activeChat, typingUser }) {
        let statusBadge = fg(theme.status.online, "● В сети");
        if (status === "connecting") {
            statusBadge = fg(theme.status.connecting, "◌ Подключение...");
        } else if (status === "disconnected") {
            statusBadge = fg(theme.status.offline, "○ Не в сети");
        }

        const userTitle = me
            ? `${me.firstName || ""} ${me.lastName || ""} ${me.username ? `(@${me.username})` : ""}`.trim()
            : "Авторизация...";

        let chatTitle = fg(theme.muted, "Выберите чат из списка слева");
        if (activeChat) {
            const icon =
                activeChat.type === "channel" ? "📢" :
                activeChat.type === "supergroup" || activeChat.type === "group" ? "👥" :
                activeChat.type === "bot" ? "🤖" :
                activeChat.type === "saved" ? "⭐" : "👤";

            let details = "";
            if (activeChat.username) details += ` (@${activeChat.username})`;
            if (activeChat.entity?.participantsCount) details += ` [${activeChat.entity.participantsCount} уч.]`;

            chatTitle = `{bold}${icon} ${escapeBlessed(activeChat.title)}${escapeBlessed(details)}{/bold}`;
        }

        let typingNotice = "";
        if (typingUser) {
            typingNotice = `  ${fg(theme.warning, `✍️ ${escapeBlessed(typingUser)} печатает...`)}`;
        }

        const divider = fg(theme.dim, "│");
        const leftText = `{bold}🚀 TuiGram{/bold} ${divider} ${escapeBlessed(userTitle)} ${divider} ${statusBadge}`;

        headerBox.setContent(
            ` ${leftText}\n ${chatTitle}${typingNotice}`
        );
        screen.render();
    };

    return headerBox;
}
