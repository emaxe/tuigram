import blessed from "neo-blessed";
import { escapeBlessed } from "../../../telegram/formatter.js";
import { idToString } from "../../../telegram/entities.js";
import { fg } from "../../theme.js";

import { bindOutsideClickClose } from "../../modalMouse.js";

/**
 * Создаёт модальное окно информации о текущем чате.
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @returns {{ show: (chat: object) => void, hide: () => void }}
 */
export function createChatInfoModal(screen, theme) {
    const modal = blessed.box({
        parent: screen,
        top: "center",
        left: "center",
        width: "60%",
        height: "60%",
        hidden: true,
        tags: true,
        mouse: true,
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

    const infoText = blessed.box({
        parent: modal,
        top: 1,
        left: 2,
        right: 2,
        bottom: 3,
        tags: true,
        mouse: true,
        scrollable: true,
        style: {
            bg: theme.modal.bg,
            fg: theme.modal.fg,
        },
    });

    const closeBtn = blessed.button({
        parent: modal,
        bottom: 1,
        left: "center",
        width: 16,
        height: 1,
        mouse: true,
        content: " [ Закрыть ] ",
        align: "center",
        tags: true,
        style: {
            bg: theme.accent,
            fg: theme.onAccent,
            focus: {
                bg: theme.modal.buttonFocusBg,
                fg: theme.modal.buttonFocusFg,
                bold: true,
            },
        },
    });

    let previousFocus = null;

    function hide() {
        modal.hide();
        if (previousFocus) {
            previousFocus.focus();
            previousFocus = null;
        }
        screen.render();
    }

    function show(chat) {
        if (!chat) return;

        const entity = chat.entity || {};
        const title = escapeBlessed(chat.title || "Без названия");
        const id = escapeBlessed(idToString(chat.id));
        const username = chat.username ? `@${escapeBlessed(chat.username)}` : "—";
        const type = escapeBlessed(chat.type || "unknown");
        const participants = entity.participantsCount ? `${entity.participantsCount}` : "Неизвестно";
        const isMuted = chat.isMuted
            ? fg(theme.warning, "Выключены")
            : fg(theme.success, "Включены");
        const about = escapeBlessed(entity.about || "Нет описания");

        const body = `
 {bold}{underline}ℹ Информация о чате{/underline}{/bold}

 {bold}Название:{/bold}        ${title}
 {bold}Тип:{/bold}             ${type}
 {bold}ID:{/bold}              ${id}
 {bold}Username:{/bold}        ${username}
 {bold}Участников:{/bold}      ${participants}
 {bold}Уведомления:{/bold}     ${isMuted}

 {bold}О чате / О себе:{/bold}
   ${about}
`;

        infoText.setContent(body);
        previousFocus = screen.focused;
        armOutsideClose();
        modal.show();
        modal.setFront();
        closeBtn.focus();
        screen.render();
    }

    closeBtn.on("press", hide);
    closeBtn.on("click", hide);
    // Клавиши вешаем на кнопку: blessed отдаёт события только сфокусированному элементу.
    closeBtn.key(["escape", "q"], hide);

    // Закрытие при клике мышью мимо модального окна
    const armOutsideClose = bindOutsideClickClose(screen, modal, hide);

    return {
        modal,
        show,
        hide,
    };
}
