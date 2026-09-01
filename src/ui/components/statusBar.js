import blessed from "neo-blessed";
import { fg } from "../theme.js";

import { getStatusBarActionAt } from "../../utils/mouse.js";

/**
 * Создаёт нижнюю строку состояния (Status Bar) с подсказками и временными тостами.
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @param {object} [callbacks]
 * @param {() => void} [callbacks.onFocusNext]
 * @param {() => void} [callbacks.onSelectOrSubmit]
 * @param {() => void} [callbacks.onFilterTabs]
 * @param {() => void} [callbacks.onSearch]
 * @param {() => void} [callbacks.onHelp]
 * @param {() => void} [callbacks.onAction]
 * @param {() => void} [callbacks.onChatInfo]
 * @param {() => void} [callbacks.onQuit]
 * @returns {blessed.Widgets.BoxElement & { showMessage: (text: string, type?: string, duration?: number) => void }}
 */
export function createStatusBar(screen, theme, {
    onFocusNext,
    onSelectOrSubmit,
    onFilterTabs,
    onSearch,
    onHelp,
    onAction,
    onChatInfo,
    onQuit,
} = {}) {
    const statusBar = blessed.box({
        parent: screen,
        bottom: 0,
        left: 0,
        width: "100%",
        height: 1,
        tags: true,
        mouse: true,
        style: {
            bg: theme.status.bg,
            fg: theme.status.fg,
        },
    });

    statusBar.on("click", (data) => {
        const relX = data.x - (statusBar.aleft || 0);
        const action = getStatusBarActionAt(relX, statusBar.width || 120);
        switch (action) {
            case "focus":
                onFocusNext?.();
                break;
            case "select":
                onSelectOrSubmit?.();
                break;
            case "tabs":
                onFilterTabs?.();
                break;
            case "search":
                onSearch?.();
                break;
            case "help":
                onHelp?.();
                break;
            case "actions":
                onAction?.();
                break;
            case "info":
                onChatInfo?.();
                break;
            case "quit":
                onQuit?.();
                break;
        }
    });

    let currentTimeout = null;

    const key = (label) => `{bold}${fg(theme.accent, label)}{/bold}`;
    const defaultHints =
        ` ${key("[Tab]")} Панель ${fg(theme.dim, "│")} ${key("[Enter]")} Выбрать/Отправить ` +
        `${fg(theme.dim, "│")} ${key("[1-6]")} Вкладки ${fg(theme.dim, "│")} ${key("[/]")} Поиск ` +
        `${fg(theme.dim, "│")} ${key("[F1]")} Помощь ${fg(theme.dim, "│")} ${key("[Ctrl+A]")} Действия ` +
        `${fg(theme.dim, "│")} ${key("[Ctrl+P]")} Инфо ${fg(theme.dim, "│")} ${key("[Ctrl+Q]")} Выход`;

    statusBar.setContent(defaultHints);

    /**
     * Показывает временное статусное сообщение (тост).
     * @param {string} text
     * @param {"info"|"success"|"warning"|"error"} [type="info"]
     * @param {number} [duration=4000]
     */
    statusBar.showMessage = function (text, type = "info", duration = 4000) {
        if (currentTimeout) {
            clearTimeout(currentTimeout);
        }

        const palette = {
            info: [theme.info, "ℹ"],
            success: [theme.success, "✓"],
            warning: [theme.warning, "⚠️"],
            error: [theme.error, "✕"],
        };
        const [color, icon] = palette[type] || palette.info;

        statusBar.setContent(` ${fg(color, `${icon} ${text}`)}`);
        screen.render();

        currentTimeout = setTimeout(() => {
            statusBar.setContent(defaultHints);
            screen.render();
        }, duration);
    };

    return statusBar;
}
