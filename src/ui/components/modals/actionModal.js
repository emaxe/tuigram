import blessed from "neo-blessed";
import { escapeBlessed } from "../../../telegram/formatter.js";
import { fg } from "../../theme.js";

/**
 * Создаёт модальное окно контекстных действий над сообщением.
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @param {object} callbacks
 * @param {(action: string, msg: object) => void} callbacks.onAction
 * @returns {{ show: (msg: object) => void, hide: () => void }}
 */
export function createActionModal(screen, theme, { onAction } = {}) {
    const modal = blessed.box({
        parent: screen,
        top: "center",
        left: "center",
        width: "50%",
        height: "55%",
        hidden: true,
        tags: true,
        border: {
            type: "line",
        },
        shadow: true,
        style: {
            bg: theme.modal.bg,
            fg: theme.modal.fg,
            border: {
                fg: theme.modal.borderFg,
            },
        },
    });

    const header = blessed.box({
        parent: modal,
        top: 0,
        left: 1,
        right: 1,
        height: 2,
        tags: true,
        style: {
            bg: theme.modal.bg,
            fg: theme.modal.fg,
        },
    });

    const list = blessed.list({
        parent: modal,
        top: 2,
        left: 1,
        right: 1,
        bottom: 1,
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        style: {
            bg: theme.modal.bg,
            fg: theme.modal.fg,
            selected: {
                bg: theme.modal.selectedBg,
                fg: theme.modal.selectedFg,
                bold: true,
            },
        },
    });

    let currentMsg = null;
    let currentActions = [];
    let previousFocus = null;

    function hide() {
        modal.hide();
        if (previousFocus) {
            previousFocus.focus();
            previousFocus = null;
        }
        screen.render();
    }

    function show(msg) {
        if (!msg) return;
        currentMsg = msg;

        const snippet = escapeBlessed((msg.text || msg.mediaDescription || "").slice(0, 35));
        header.setContent(
            ` {bold}Действия над сообщением #${msg.id}{/bold}\n ${fg(theme.modal.hintFg, `"${snippet}..."`)}`
        );

        currentActions = [
            { id: "reply", label: "↩️  Ответить (Reply)" },
        ];

        if (msg.out) {
            currentActions.push({ id: "edit", label: "✏️  Редактировать текст" });
        }

        currentActions.push(
            { id: "delete", label: "🗑️  Удалить сообщение" },
            { id: "react_like", label: "👍  Поставить реакцию 👍" },
            { id: "react_fire", label: "🔥  Поставить реакцию 🔥" },
            { id: "react_heart", label: "❤️  Поставить реакцию ❤️" }
        );

        if (msg.media) {
            currentActions.push({ id: "download", label: "📥  Скачать медиа-вложение" });
        }

        currentActions.push({ id: "copy", label: "📋  Скопировать текст в ввод" });

        list.setItems(currentActions.map((a) => a.label));
        previousFocus = screen.focused;
        modal.show();
        modal.setFront();
        list.focus();
        screen.render();
    }

    list.on("select", (item, index) => {
        const action = currentActions[index];
        if (action && currentMsg) {
            hide();
            onAction?.(action.id, currentMsg);
        }
    });

    // Фокус получает список — на нём и живут клавиши закрытия.
    list.key(["escape", "q"], hide);

    return {
        modal,
        show,
        hide,
    };
}
