import blessed from "neo-blessed";
import { escapeBlessed } from "../../telegram/formatter.js";
import { fg, badge } from "../theme.js";

import { getInputContextActionAt } from "../../utils/mouse.js";

/**
 * Создаёт компонент поля ввода сообщения (нижняя панель).
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @param {object} callbacks
 * @param {(text: string, context: { mode: string|null, target: object|null }) => void} callbacks.onSubmit
 * @param {() => void} [callbacks.onCancelContext]
 * @param {(command: string, args: string[]) => void} [callbacks.onSlashCommand]
 * @param {() => void} [callbacks.onReplyLast]
 * @param {() => void} [callbacks.onEditLast]
 */
export function createInputBox(screen, theme, {
    onSubmit,
    onCancelContext,
    onSlashCommand,
    onReplyLast,
    onEditLast,
} = {}) {
    // Высота 5 = рамка (2) + контекстная плашка (1) + две строки ввода (2).
    // При autoPadding у blessed рамка съедает по строке сверху и снизу, поэтому
    // меньшая высота оставляет textarea нулевую высоту и вводимый текст не виден.
    const container = blessed.box({
        parent: screen,
        bottom: 1,
        left: "35%",
        right: 0,
        height: 5,
        mouse: true,
        border: {
            type: "line",
        },
        style: {
            bg: theme.input.bg,
            fg: theme.input.fg,
            border: {
                fg: theme.borders.fg,
            },
        },
    });

    // 1. Контекстная плашка (Ответ / Редактирование / Подсказка)
    const contextBar = blessed.box({
        parent: container,
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        tags: true,
        mouse: true,
        clickable: true,
        style: {
            bg: theme.input.contextBg,
            fg: theme.input.contextFg,
        },
    });

    // 2. Поле ввода текста
    const textarea = blessed.textarea({
        parent: container,
        top: 1,
        left: 0,
        right: 0,
        bottom: 0,
        inputOnFocus: true,
        scrollable: true,
        // keys: false намеренно: при keys:true blessed перехватывает Ctrl+E внутри
        // textarea и запускает внешний $EDITOR, ломая TUI. Ввод работает через
        // inputOnFocus, поэтому эта опция здесь не нужна.
        keys: false,
        mouse: true,
        style: {
            bg: theme.input.bg,
            fg: theme.input.fg,
        },
    });

    /** Подсвечивает рамку, когда ввод в фокусе — иначе непонятно, куда идут символы. */
    function setFocusHighlight(active) {
        container.style.border.fg = active ? theme.borders.focusFg : theme.borders.fg;
        screen.render();
    }

    textarea.on("focus", () => setFocusHighlight(true));
    textarea.on("blur", () => setFocusHighlight(false));

    let currentMode = null; // null | "reply" | "edit"
    let currentTarget = null; // object message

    const history = [];
    let historyIndex = -1;

    function renderContext() {
        if (currentMode === "reply" && currentTarget) {
            const author = escapeBlessed(currentTarget.senderName || "Собеседник");
            const preview = escapeBlessed((currentTarget.text || "").slice(0, 30));
            contextBar.setContent(
                badge(theme.input.replyBg, theme.input.replyFg,
                    `{bold} ↩️ Ответ на [${author}]: "${preview}..." {/bold}[Esc: Отмена] `)
            );
        } else if (currentMode === "edit" && currentTarget) {
            const preview = escapeBlessed((currentTarget.text || "").slice(0, 30));
            contextBar.setContent(
                badge(theme.input.editBg, theme.input.editFg,
                    `{bold} ✏️ Редактирование #${currentTarget.id}: "${preview}..." {/bold}[Esc: Отмена] `)
            );
        } else {
            const key = (label) => fg(theme.accent, label);
            contextBar.setContent(
                ` ${fg(theme.input.contextFg, "Введите сообщение...")}  ` +
                `${key("[Enter]")} ${fg(theme.input.contextFg, "Отправить")}  ` +
                `${key("[Ctrl+J]")} ${fg(theme.input.contextFg, "Новая строка")}  ` +
                `${key("[Ctrl+R]")} ${fg(theme.input.contextFg, "Ответ")}  ` +
                `${key("[Ctrl+E]")} ${fg(theme.input.contextFg, "Правка")}  ` +
                `${key("[/]")} ${fg(theme.input.contextFg, "Команды")}`
            );
        }
        screen.render();
    }

    contextBar.on("click", (data) => {
        const relX = data.x - (contextBar.aleft || 0);
        const action = getInputContextActionAt(relX, currentMode);
        if (action === "cancel") {
            if (currentMode) {
                currentMode = null;
                currentTarget = null;
                renderContext();
                onCancelContext?.();
            }
        } else if (action === "reply") {
            onReplyLast?.();
        } else if (action === "edit") {
            onEditLast?.();
        } else if (action === "commands") {
            textarea.setValue("/");
            textarea.focus();
            screen.render();
        }
    });

    textarea.on("click", () => {
        textarea.focus();
        screen.render();
    });

    textarea.key(["enter"], () => {
        const value = textarea.getValue().trim();
        if (!value) {
            // Textarea уже успел дописать перевод строки в своём обработчике — убираем его.
            textarea.setValue("");
            screen.render();
            return;
        }

        // Обработка слэш-команд
        if (value.startsWith("/")) {
            const [cmd, ...args] = value.slice(1).split(" ");
            textarea.setValue("");
            history.push(value);
            historyIndex = -1;
            onSlashCommand?.(cmd.toLowerCase(), args);
            screen.render();
            return;
        }

        history.push(value);
        historyIndex = -1;
        textarea.setValue("");

        const ctx = { mode: currentMode, target: currentTarget };
        currentMode = null;
        currentTarget = null;
        renderContext();

        onSubmit?.(value, ctx);
    });

    // Перенос строки без отправки: Ctrl+J приходит как "linefeed" и вставляется
    // самим textarea, поэтому отдельный обработчик не нужен (иначе будет двойной \n).

    textarea.key(["escape"], () => {
        if (currentMode) {
            currentMode = null;
            currentTarget = null;
            renderContext();
            onCancelContext?.();
        }
    });

    textarea.key(["up"], () => {
        if (history.length === 0) return;
        if (historyIndex === -1) {
            historyIndex = history.length - 1;
        } else if (historyIndex > 0) {
            historyIndex--;
        }
        textarea.setValue(history[historyIndex]);
        screen.render();
    });

    textarea.key(["down"], () => {
        if (historyIndex === -1) return;
        if (historyIndex < history.length - 1) {
            historyIndex++;
            textarea.setValue(history[historyIndex]);
        } else {
            historyIndex = -1;
            textarea.setValue("");
        }
        screen.render();
    });

    renderContext();

    return {
        container,
        textarea,
        contextBar,
        setContext: (mode, target) => {
            currentMode = mode;
            currentTarget = target;
            if (mode === "edit" && target?.text) {
                textarea.setValue(target.text);
            }
            renderContext();
            textarea.focus();
        },
        /**
         * Текущий режим ввода — нужен, чтобы отправить файл ответом.
         * @returns {{ mode: string|null, target: object|null }}
         */
        getContext: () => ({ mode: currentMode, target: currentTarget }),
        clearContext: () => {
            currentMode = null;
            currentTarget = null;
            renderContext();
        },
        clear: () => {
            textarea.setValue("");
            screen.render();
        },
        focus: () => textarea.focus(),
        /**
         * Завершает режим ввода, отдавая фокус предыдущей панели.
         * Нужно вызывать перед открытием модального окна: иначе textarea по blur
         * вызывает screen.rewindFocus() и забирает фокус обратно у модалки.
         */
        release: () => {
            if (textarea._reading && typeof textarea._done === "function") {
                textarea._done("stop");
            }
        },
    };
}
