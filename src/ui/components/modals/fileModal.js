import blessed from "neo-blessed";
import path from "node:path";
import { inspectLocalFile } from "../../../utils/storage.js";
import { formatFileSize } from "../../../utils/time.js";
import { createFilePickerModal } from "./filePickerModal.js";
import { fg } from "../../theme.js";
import { isInsideBox } from "../../../utils/mouse.js";

/** Разделитель нескольких путей в поле ввода. */
const PATH_SEPARATOR = "|";

/**
 * Создаёт модальное окно отправки локальных файлов.
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @param {object} callbacks
 * @param {(files: Array<object>, options: { caption: string, asDocument: boolean }) => void} callbacks.onSendFile
 * @returns {{ show: () => void, hide: () => void }}
 */
export function createFileModal(screen, theme, { onSendFile } = {}) {
    // Высота 14 = рамка (2) + 12 внутренних строк под поля, чекбокс,
    // строку состояния, кнопки и подсказку.
    const modal = blessed.box({
        parent: screen,
        top: "center",
        left: "center",
        width: "60%",
        height: 14,
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

    blessed.box({
        parent: modal,
        top: 0,
        left: 1,
        right: 1,
        height: 1,
        tags: true,
        content: " {bold}📤 Отправка файла или документа{/bold}",
        style: { bg: theme.modal.bg, fg: theme.modal.fg },
    });

    const browseBar = blessed.box({
        parent: modal,
        top: 2,
        left: 2,
        right: 2,
        height: 1,
        tags: true,
        mouse: true,
        clickable: true,
        content: `Путь к файлу ${fg(theme.modal.hintFg, `(несколько — через ${PATH_SEPARATOR})`)}{|}${fg(theme.accent, "[Ctrl+F] Обзор")} `,
        style: { bg: theme.modal.bg, fg: theme.modal.fg },
    });

    const pathInput = blessed.textbox({
        parent: modal,
        top: 3,
        left: 2,
        right: 2,
        height: 1,
        inputOnFocus: true,
        mouse: true,
        style: {
            bg: theme.modal.inputBg,
            fg: theme.modal.inputFg,
            focus: { bg: theme.modal.inputFocusBg, fg: theme.modal.inputFocusFg },
        },
    });

    blessed.box({
        parent: modal,
        top: 5,
        left: 2,
        right: 2,
        height: 1,
        content: "Подпись (необязательно):",
        style: { bg: theme.modal.bg, fg: theme.modal.fg },
    });

    const captionInput = blessed.textbox({
        parent: modal,
        top: 6,
        left: 2,
        right: 2,
        height: 1,
        inputOnFocus: true,
        mouse: true,
        style: {
            bg: theme.modal.inputBg,
            fg: theme.modal.inputFg,
            focus: { bg: theme.modal.inputFocusBg, fg: theme.modal.inputFocusFg },
        },
    });

    const asDocumentCheck = blessed.checkbox({
        parent: modal,
        top: 8,
        left: 2,
        right: 2,
        height: 1,
        mouse: true,
        text: "Как файл, без сжатия      [Ctrl+D]",
        style: {
            bg: theme.modal.bg,
            fg: theme.modal.fg,
            focus: { bg: theme.modal.selectedBg, fg: theme.modal.selectedFg, bold: true },
        },
    });

    const statusLine = blessed.box({
        parent: modal,
        top: 9,
        left: 2,
        right: 2,
        height: 1,
        tags: true,
        style: { bg: theme.modal.bg, fg: theme.modal.fg },
    });

    const sendBtn = blessed.button({
        parent: modal,
        bottom: 1,
        left: 4,
        width: 14,
        height: 1,
        mouse: true,
        content: " [ Отправить ] ",
        align: "center",
        style: {
            bg: theme.modal.buttonBg,
            fg: theme.modal.buttonFg,
            focus: { bg: theme.modal.buttonFocusBg, fg: theme.modal.buttonFocusFg, bold: true },
        },
    });

    const cancelBtn = blessed.button({
        parent: modal,
        bottom: 1,
        right: 4,
        width: 14,
        height: 1,
        mouse: true,
        content: " [ Отмена ] ",
        align: "center",
        style: {
            bg: theme.modal.dangerBg,
            fg: theme.modal.dangerFg,
            focus: { bg: theme.modal.buttonFocusBg, fg: theme.modal.buttonFocusFg, bold: true },
        },
    });

    blessed.box({
        parent: modal,
        bottom: 0,
        left: 2,
        right: 2,
        height: 1,
        tags: true,
        align: "center",
        content: fg(theme.modal.hintFg, "[Tab] Поля  [Enter] Далее  [Ctrl+F] Обзор  [Ctrl+D] Без сжатия  [Esc] Выход"),
        style: { bg: theme.modal.bg, fg: theme.modal.fg },
    });

    const picker = createFilePickerModal(screen, theme);

    let previousFocus = null;
    let lastDir = null;

    const KIND_LABEL = { photo: "уйдёт как фото", video: "уйдёт как видео", document: "уйдёт как документ" };

    /** Разбирает поле пути в список введённых путей. */
    function currentPaths() {
        return pathInput
            .getValue()
            .split(PATH_SEPARATOR)
            .map((part) => part.trim())
            .filter(Boolean);
    }

    function setError(text) {
        statusLine.setContent(fg(theme.error, `✕ ${text}`));
        screen.render();
    }

    /**
     * Проверяет введённые пути и обновляет строку состояния.
     * Значение поля НИКОГДА не перезаписывается — ошибка живёт отдельно.
     * @returns {Array<object>|null} валидные файлы либо null при ошибке
     */
    function validate({ quiet = false } = {}) {
        const raw = currentPaths();
        if (raw.length === 0) {
            statusLine.setContent("");
            screen.render();
            return null;
        }

        const files = [];
        for (const entry of raw) {
            const info = inspectLocalFile(entry);
            if (!info.ok) {
                if (!quiet) setError(info.error);
                return null;
            }
            files.push(info);
        }

        lastDir = path.dirname(files[files.length - 1].filePath);

        const asDocument = Boolean(asDocumentCheck.checked);
        const totalSize = files.reduce((sum, f) => sum + f.size, 0);

        if (files.length === 1) {
            const [file] = files;
            const kind = asDocument ? "уйдёт как файл" : KIND_LABEL[file.kind];
            statusLine.setContent(fg(theme.success, `✓ ${file.name} · ${formatFileSize(file.size)} · ${kind}`));
        } else {
            statusLine.setContent(
                fg(theme.success, `✓ Альбом из ${files.length} файлов · ${formatFileSize(totalSize)}`)
            );
        }
        screen.render();
        return files;
    }

    function hide() {
        picker.hide();
        modal.hide();
        if (previousFocus) {
            previousFocus.focus();
            previousFocus = null;
        }
        screen.render();
    }

    function show() {
        pathInput.setValue("");
        captionInput.setValue("");
        asDocumentCheck.uncheck();
        statusLine.setContent("");
        previousFocus = screen.focused;
        modal.show();
        modal.setFront();
        pathInput.focus();
        screen.render();
    }

    function submit() {
        const files = validate();
        if (!files) {
            if (currentPaths().length === 0) setError("Укажите путь к файлу или нажмите Ctrl+F");
            pathInput.focus();
            return;
        }

        const caption = captionInput.getValue().trim();
        const asDocument = Boolean(asDocumentCheck.checked);
        hide();
        onSendFile?.(files, { caption, asDocument });
    }

    /** Завершает режим чтения textbox — иначе он заберёт фокус обратно по blur. */
    function releaseInputs() {
        for (const el of [pathInput, captionInput]) {
            if (el._reading && typeof el._done === "function") el._done("stop");
        }
    }

    function openPicker() {
        releaseInputs();
        picker.pick(
            lastDir,
            (filePath) => {
                const existing = currentPaths();
                existing.push(filePath);
                pathInput.setValue(existing.join(` ${PATH_SEPARATOR} `));
                validate();
            },
            () => {
                // И после выбора, и после отмены возвращаемся в поле пути
                modal.setFront();
                pathInput.focus();
                screen.render();
            }
        );
    }

    function toggleAsDocument() {
        asDocumentCheck.toggle();
        validate({ quiet: true });
        screen.render();
    }

    // --- Кольцо фокуса ---
    const RING = [pathInput, captionInput, asDocumentCheck, sendBtn, cancelBtn];

    function moveFocus(step) {
        // blessed вставляет "\t" в значение textbox ДО вызова обработчика
        for (const el of [pathInput, captionInput]) {
            if (typeof el.getValue === "function") {
                const cleaned = el.getValue().replace(/\t+$/, "");
                if (cleaned !== el.getValue()) el.setValue(cleaned);
            }
        }
        const current = RING.indexOf(screen.focused);
        const index = current === -1 ? 0 : current;
        releaseInputs();
        RING[(index + step + RING.length) % RING.length].focus();
        screen.render();
    }

    for (const el of RING) {
        el.key(["tab"], () => moveFocus(1));
        el.key(["S-tab"], () => moveFocus(-1));
        el.key(["C-f"], openPicker);
        el.key(["C-d"], toggleAsDocument);
    }

    // Escape: у textbox он приходит событием "cancel", у остальных — клавишей
    pathInput.on("cancel", hide);
    captionInput.on("cancel", hide);
    asDocumentCheck.key(["escape"], hide);
    sendBtn.key(["escape"], hide);
    cancelBtn.key(["escape"], hide);

    // Enter ведёт по цепочке, с последнего поля — отправляет
    pathInput.on("submit", () => {
        validate();
        captionInput.focus();
    });
    captionInput.on("submit", submit);
    sendBtn.on("press", submit);
    sendBtn.on("click", submit);
    cancelBtn.on("press", hide);
    cancelBtn.on("click", hide);
    asDocumentCheck.on("check", () => validate({ quiet: true }));
    asDocumentCheck.on("uncheck", () => validate({ quiet: true }));

    browseBar.on("click", openPicker);
    pathInput.on("click", () => {
        pathInput.focus();
        screen.render();
    });
    captionInput.on("click", () => {
        captionInput.focus();
        screen.render();
    });

    // Закрытие при клике мышью мимо модального окна
    screen.on("click", (data) => {
        if (!modal.visible || picker.modal.visible) return;
        const inside = isInsideBox(data.x, data.y, {
            left: modal.aleft,
            top: modal.atop,
            width: modal.width,
            height: modal.height,
        });
        if (!inside) {
            hide();
        }
    });

    return {
        modal,
        pathInput,
        captionInput,
        asDocumentCheck,
        statusLine,
        picker,
        show,
        hide,
    };
}
