import blessed from "neo-blessed";
import { fg } from "../../theme.js";
import { renderImageBuffer } from "../../../utils/image.js";

/**
 * Создаёт полноэкранный просмотрщик изображений.
 *
 * Сначала показывается встроенная в сообщение миниатюра (мгновенно, без сети),
 * затем она заменяется полноразмерной версией, как только та скачается.
 *
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @param {object} callbacks
 * @param {(msg: object) => Promise<{ buffer: Buffer, mimeType: string }>} [callbacks.onLoadFullImage]
 * @param {(msg: object, size: { maxWidth: number, maxHeight: number }) => string} [callbacks.onRenderPlaceholder]
 * @returns {{ modal: object, show: (msg: object) => void, hide: () => void, isVisible: () => boolean }}
 */
export function createImageViewerModal(screen, theme, { onLoadFullImage, onRenderPlaceholder } = {}) {
    const modal = blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        hidden: true,
        mouse: true,
        style: {
            bg: theme.bg,
            fg: theme.fg,
        },
    });

    const canvas = blessed.box({
        parent: modal,
        top: 0,
        left: 0,
        right: 0,
        bottom: 1,
        tags: true,
        align: "center",
        valign: "middle",
        style: {
            bg: theme.bg,
            fg: theme.fg,
        },
    });

    const footer = blessed.box({
        parent: modal,
        bottom: 0,
        left: 0,
        right: 0,
        height: 1,
        tags: true,
        style: {
            bg: theme.status.bg,
            fg: theme.status.fg,
        },
    });

    let currentMsg = null;
    let fullImage = null;
    let statusText = "";
    let previousFocus = null;
    /** Счётчик открытий: результат опоздавшей загрузки не должен затирать новую картинку. */
    let token = 0;

    /** Размер холста в ячейках терминала. */
    function viewportSize() {
        return {
            maxWidth: Math.max(8, (screen.width || 80) - 2),
            maxHeight: Math.max(4, (screen.height || 24) - 2),
        };
    }

    function renderFooter() {
        const id = currentMsg ? `#${currentMsg.id}` : "";
        const status = statusText ? `${fg(theme.warning, statusText)} ${fg(theme.dim, "│")} ` : "";
        footer.setContent(
            ` ${fg(theme.accent, id)} ${fg(theme.dim, "│")} ${status}${fg(theme.muted, "[Esc] закрыть · клик — закрыть")}`
        );
    }

    /** Перерисовывает картинку под текущий размер терминала. */
    function repaint() {
        if (!currentMsg) return;
        const size = viewportSize();

        let content = "";
        if (fullImage?.buffer) {
            content = renderImageBuffer(fullImage.buffer, {
                mimeType: fullImage.mimeType,
                maxWidth: size.maxWidth,
                maxHeight: size.maxHeight,
            });
        }
        if (!content) {
            content = onRenderPlaceholder?.(currentMsg, size) || "";
        }
        if (!content) {
            content = fg(theme.muted, "Изображение недоступно");
        }

        canvas.setContent(content);
        renderFooter();
        screen.render();
    }

    function hide() {
        // Инвалидируем незавершённую загрузку: её результат уже не нужен
        token++;
        modal.hide();
        currentMsg = null;
        fullImage = null;
        statusText = "";
        canvas.setContent("");
        if (previousFocus) {
            previousFocus.focus();
            previousFocus = null;
        }
        screen.render();
    }

    /**
     * Открывает изображение сообщения на весь экран.
     * @param {object} msg нормализованное сообщение
     */
    function show(msg) {
        if (!msg) return;

        const myToken = ++token;
        currentMsg = msg;
        fullImage = null;
        statusText = "Загрузка полного изображения...";
        previousFocus = screen.focused;

        repaint();
        modal.show();
        modal.setFront();
        modal.focus();
        screen.render();

        Promise.resolve()
            .then(() => onLoadFullImage?.(msg))
            .then((result) => {
                if (myToken !== token || !result?.buffer) return;
                fullImage = result;
                statusText = "";
                repaint();
            })
            .catch((err) => {
                if (myToken !== token) return;
                statusText = `Не удалось загрузить: ${err.message}`;
                renderFooter();
                screen.render();
            });
    }

    modal.key(["escape", "q", "enter", "return", "space"], hide);
    modal.on("click", hide);

    screen.on("resize", () => {
        if (modal.visible) repaint();
    });

    return {
        modal,
        show,
        hide,
        isVisible: () => modal.visible,
    };
}
