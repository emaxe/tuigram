import blessed from "neo-blessed";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatFileSize } from "../../../utils/time.js";
import { fg } from "../../theme.js";
import { isInsideBox } from "../../../utils/mouse.js";

/**
 * Модальное окно выбора локального файла (обёртка над blessed.filemanager).
 *
 * Клавиши вешаются на сам список: blessed рассылает события только
 * сфокусированному элементу, обработчики на контейнере не срабатывают.
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @returns {{ modal: object, pick: (startDir: string|null, onPick: (filePath: string) => void) => void, hide: () => void }}
 */
export function createFilePickerModal(screen, theme) {
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

    const header = blessed.box({
        parent: modal,
        top: 0,
        left: 1,
        right: 1,
        height: 1,
        tags: true,
        style: { bg: theme.modal.bg, fg: theme.modal.fg },
    });

    const manager = blessed.filemanager({
        parent: modal,
        top: 1,
        left: 1,
        right: 1,
        bottom: 2,
        keys: true,
        vi: true,
        mouse: true,
        cwd: os.homedir(),
        scrollbar: {
            ch: "│",
            style: { bg: theme.scrollbar.bg, fg: theme.scrollbar.fg },
        },
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

    const footer = blessed.box({
        parent: modal,
        bottom: 0,
        left: 1,
        right: 1,
        height: 2,
        tags: true,
        mouse: true,
        clickable: true,
        style: { bg: theme.modal.bg, fg: theme.modal.fg },
    });

    let onPickCallback = null;
    let onCloseCallback = null;

    function renderHeader() {
        const cwd = manager.cwd.replace(os.homedir(), "~");
        header.setContent(` {bold}📁 Выбор файла:{/bold} ${cwd}`);
    }

    /**
     * Показывает размер подсвеченного файла — filemanager сам этого не умеет.
     * Имя берём из ritems (исходная строка с тегами), а не из getContent():
     * последний уже содержит ANSI-последовательности, из которых имя не вычленить.
     * @param {number} index
     */
    function renderFooter(index) {
        const hint = fg(theme.modal.hintFg, "[↑↓] Выбор  [Enter] Открыть/Выбрать  [Esc] Отмена");
        const raw = manager.ritems?.[index];
        let info = "";

        if (raw) {
            const name = String(raw).replace(/\{[^{}]+\}/g, "").replace(/[@/]$/, "");
            if (name && name !== "..") {
                try {
                    const stat = fs.statSync(path.resolve(manager.cwd, name));
                    info = stat.isDirectory()
                        ? fg(theme.picker.dirFg, `${name}/ — папка`)
                        : fg(theme.success, `${name} · ${formatFileSize(stat.size)}`);
                } catch {
                    info = fg(theme.error, `${name} — недоступен`);
                }
            }
        }
        footer.setContent(` ${info}\n ${hint}`);
    }

    function hide() {
        if (modal.hidden) return;
        modal.hide();
        onPickCallback = null;
        // Куда вернуть фокус, решает вызывающая сторона: собственный previousFocus
        // здесь ненадёжен, потому что textbox по blur успевает сделать rewindFocus.
        const close = onCloseCallback;
        onCloseCallback = null;
        close?.();
        screen.render();
    }

    /**
     * Перекрашивает элементы под тему.
     *
     * blessed.filemanager жёстко вписывает {light-blue-fg} для папок и
     * {light-cyan-fg} для симлинков — на фоне модалки такие имена нечитаемы.
     * Формат "имя" + "/" или "@" сохраняем: по нему виджет находит файл обратно.
     */
    function recolorItems() {
        const source = manager.ritems.slice();
        if (source.length === 0) return;

        const selected = manager.selected;
        const painted = source.map((raw) => {
            const bare = String(raw).replace(/\{[^{}]+\}/g, "");
            if (bare.endsWith("/")) {
                return `${fg(theme.picker.dirFg, bare.slice(0, -1))}/`;
            }
            if (bare.endsWith("@")) {
                return `${fg(theme.picker.linkFg, bare.slice(0, -1))}@`;
            }
            return fg(theme.picker.fileFg, bare);
        });

        if (painted.every((text, i) => text === source[i])) return;
        manager.setItems(painted);
        manager.select(Math.min(selected, painted.length - 1));
    }

    manager.on("refresh", recolorItems);

    manager.on("select item", (item, index) => {
        renderFooter(index);
        screen.render();
    });

    manager.on("cd", () => {
        renderHeader();
        renderFooter(-1);
        screen.render();
    });

    manager.on("file", (filePath) => {
        // Сначала отдаём результат, потом закрываем: onClose возвращает фокус,
        // и вызывающая сторона уже видит проставленное значение.
        const cb = onPickCallback;
        onPickCallback = null;
        cb?.(filePath);
        hide();
    });


    manager.on("error", () => {
        renderFooter(-1);
        screen.render();
    });

    // filemanager сам отдаёт "cancel" по Escape (list.js), но у него нет hide()
    manager.key(["escape", "q"], hide);
    manager.on("cancel", hide);
    footer.on("click", hide);

    // Закрытие при клике мышью мимо модального окна
    screen.on("click", (data) => {
        if (!modal.visible) return;
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
        manager,
        /**
         * @param {string|null} startDir каталог, с которого начать
         * @param {(filePath: string) => void} onPick вызывается при выборе файла
         * @param {() => void} [onClose] вызывается после закрытия — и при выборе, и при отмене
         */
        pick: (startDir, onPick, onClose) => {
            onPickCallback = onPick;
            onCloseCallback = onClose;
            const cwd = startDir && fs.existsSync(startDir) ? startDir : os.homedir();
            modal.show();
            modal.setFront();
            manager.refresh(cwd, () => {
                renderHeader();
                renderFooter(manager.selected);
                manager.focus();
                screen.render();
            });
        },
        hide,
    };
}
