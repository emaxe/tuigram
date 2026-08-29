import blessed from "neo-blessed";
import { fg } from "../../theme.js";

/**
 * Создаёт модальное окно подтверждения действия (Да / Нет).
 *
 * Важно: blessed рассылает клавиши только СФОКУСИРОВАННОМУ элементу, поэтому
 * обработчики висят на самих кнопках, а не на контейнере модалки.
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @returns {{ ask: (message: string, onConfirm: () => void) => void, hide: () => void }}
 */
export function createConfirmModal(screen, theme) {
    const modal = blessed.box({
        parent: screen,
        top: "center",
        left: "center",
        width: "50%",
        height: 8,
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
                fg: theme.warning,
            },
        },
    });

    const msgBox = blessed.box({
        parent: modal,
        top: 1,
        left: 2,
        right: 2,
        height: 2,
        align: "center",
        tags: true,
        style: {
            bg: theme.modal.bg,
            fg: theme.modal.fg,
        },
    });

    const hint = blessed.box({
        parent: modal,
        bottom: 0,
        left: 2,
        right: 2,
        height: 1,
        align: "center",
        tags: true,
        content: fg(theme.modal.hintFg, "[←/→ или Tab] Выбор  [Enter] Подтвердить  [Y] Да  [N/Esc] Нет"),
        style: {
            bg: theme.modal.bg,
            fg: theme.modal.fg,
        },
    });

    const yesBtn = blessed.button({
        parent: modal,
        bottom: 2,
        left: 6,
        width: 12,
        height: 1,
        mouse: true,
        content: " [ Да ] ",
        align: "center",
        style: {
            bg: theme.modal.dangerBg,
            fg: theme.modal.dangerFg,
            focus: { bg: theme.modal.buttonFocusBg, fg: theme.modal.buttonFocusFg, bold: true },
        },
    });

    const noBtn = blessed.button({
        parent: modal,
        bottom: 2,
        right: 6,
        width: 12,
        height: 1,
        mouse: true,
        content: " [ Нет ] ",
        align: "center",
        style: {
            bg: theme.modal.neutralBg,
            fg: theme.modal.neutralFg,
            focus: { bg: theme.modal.buttonFocusBg, fg: theme.modal.buttonFocusFg, bold: true },
        },
    });

    let currentCallback = null;
    let previousFocus = null;

    function hide() {
        modal.hide();
        currentCallback = null;
        if (previousFocus) {
            previousFocus.focus();
            previousFocus = null;
        }
        screen.render();
    }

    function confirm() {
        const cb = currentCallback;
        hide();
        cb?.();
    }

    yesBtn.on("press", confirm);
    noBtn.on("press", hide);

    // Клавиши вешаем на обе кнопки — активна всегда одна из них.
    for (const btn of [yesBtn, noBtn]) {
        btn.key(["escape", "n"], hide);
        btn.key(["y"], confirm);
        btn.key(["left", "right", "tab", "S-tab", "h", "l"], () => {
            (screen.focused === yesBtn ? noBtn : yesBtn).focus();
            screen.render();
        });
    }

    return {
        modal,
        ask: (text, onConfirm) => {
            currentCallback = onConfirm;
            previousFocus = screen.focused;
            msgBox.setContent(`{bold}${text}{/bold}`);
            modal.show();
            modal.setFront();
            noBtn.focus();
            screen.render();
        },
        hide,
    };
}
