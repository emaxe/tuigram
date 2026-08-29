/**
 * Цветовые схемы и стили элементов интерфейса TuiGram.
 *
 * Все цвета заданы hex-значениями намеренно: именованные ("blue", "cyan")
 * занимают индексы 0-15, которые тема терминала перекрашивает как хочет —
 * из-за этого синий фон рисовался бирюзовым, а серый текст пропадал.
 *
 * Важно: blessed сам сводит hex к ближайшему цвету xterm-256 и иногда попадает
 * в те же индексы 0-15. Поэтому значения подобраны так, чтобы после конверсии
 * индекс был >= 16 — это проверяется тестом в test/unit.test.js.
 */

/**
 * Собирает тему из плоской палитры, чтобы контраст задавался в одном месте.
 * @param {object} p палитра
 * @returns {object} тема
 */
function buildTheme(p) {
    return {
        name: p.name,
        bg: p.bg,
        fg: p.fg,
        surface: p.surface,
        surfaceHigh: p.surfaceHigh,

        // Семантика — для компонентов, которым нужен цвет «по смыслу»
        accent: p.accent,
        onAccent: p.onAccent,
        muted: p.muted,
        dim: p.dim,
        success: p.green,
        warning: p.yellow,
        error: p.red,
        info: p.cyan,

        header: {
            bg: p.surface,
            fg: p.fgBright,
            bold: true,
        },
        borders: {
            fg: p.border,
            focusFg: p.accent,
        },
        chatList: {
            bg: p.bg,
            fg: p.fg,
            selectedBg: p.surfaceHigh,
            selectedFg: p.fgBright,
            itemHoverBg: p.surface,
            itemMuted: p.dim,
            itemUnreadBg: p.accent,
            itemUnreadFg: p.onAccent,
            pinnedFg: p.yellow,
            previewFg: p.muted,
            timeFg: p.dim,
        },
        tabs: {
            bg: p.bg,
            fg: p.muted,
            activeBg: p.accent,
            activeFg: p.onAccent,
        },
        chatView: {
            bg: p.bg,
            fg: p.fg,
            incomingName: p.cyan,
            outgoingName: p.green,
            time: p.dim,
            dateDivider: p.yellow,
            replyBorder: p.muted,
            systemMsg: p.yellow,
            mediaFg: p.magenta,
            reactionFg: p.yellow,
        },
        input: {
            bg: p.bg,
            fg: p.fgBright,
            contextBg: p.surface,
            contextFg: p.muted,
            replyBg: p.cyan,
            replyFg: p.onAccent,
            editBg: p.yellow,
            editFg: p.onAccent,
        },
        modal: {
            bg: p.surface,
            fg: p.fgBright,
            borderFg: p.accent,
            selectedBg: p.accent,
            selectedFg: p.onAccent,
            labelFg: p.fg,
            hintFg: p.muted,
            inputBg: p.bg,
            inputFg: p.fgBright,
            inputFocusBg: p.surfaceHigh,
            inputFocusFg: p.fgBright,
            buttonBg: p.green,
            buttonFg: p.onAccent,
            dangerBg: p.red,
            dangerFg: p.onDanger,
            neutralBg: p.surfaceHigh,
            neutralFg: p.fg,
            buttonFocusBg: p.accent,
            buttonFocusFg: p.onAccent,
        },
        picker: {
            // filemanager сам красит элементы в light-blue/light-cyan —
            // эти значения подставляются вместо них (см. filePickerModal.js)
            dirFg: p.accent,
            fileFg: p.fgBright,
            linkFg: p.cyan,
        },
        search: {
            bg: p.bg,
            fg: p.yellow,
            placeholderFg: p.dim,
        },
        scrollbar: {
            bg: p.border,
            fg: p.accent,
        },
        status: {
            bg: p.bg,
            fg: p.muted,
            online: p.green,
            connecting: p.yellow,
            offline: p.red,
        },
    };
}

export const themes = {
    default: buildTheme({
        name: "Default Dark",
        bg: "#16161e",
        surface: "#1f2335",
        surfaceHigh: "#2f3549",
        border: "#3b4261",
        fg: "#a9b1d6",
        fgBright: "#c0caf5",
        muted: "#8288a6",
        dim: "#6874a0",
        accent: "#7aa2f7",
        onAccent: "#16161e",
        onDanger: "#16161e",
        cyan: "#7dcfff",
        green: "#9ece6a",
        yellow: "#e0af68",
        red: "#f7768e",
        magenta: "#bb9af7",
    }),

    nord: buildTheme({
        name: "Nord",
        bg: "#2e3440",
        surface: "#3b4252",
        surfaceHigh: "#434c5e",
        border: "#4c566a",
        fg: "#d8dee9",
        fgBright: "#eceff4",
        muted: "#8b98b0",
        dim: "#7e879b",
        accent: "#88c0d0",
        onAccent: "#2e3440",
        onDanger: "#2e3440",
        cyan: "#8fbcbb",
        green: "#a3be8c",
        yellow: "#ebcb8b",
        red: "#d07a83",
        magenta: "#b48ead",
    }),

    light: buildTheme({
        name: "Light",
        bg: "#f5f6f8",
        surface: "#eceff4",
        surfaceHigh: "#d8dee9",
        border: "#c0c5ce",
        fg: "#3b4252",
        fgBright: "#2e3440",
        muted: "#5f6672",
        dim: "#6f7788",
        accent: "#2d6df6",
        onAccent: "#f5f6f8",
        onDanger: "#f5f6f8",
        cyan: "#0b7285",
        green: "#2f7d32",
        yellow: "#a16207",
        red: "#c02c38",
        magenta: "#7048b6",
    }),
};

/**
 * Оборачивает текст в цветовой тег blessed.
 * @param {string} color hex или именованный цвет
 * @param {string} text
 * @returns {string}
 */
export function fg(color, text) {
    return `{${color}-fg}${text}{/${color}-fg}`;
}

/**
 * Оборачивает текст в тег фона с явным цветом текста.
 * @param {string} bgColor
 * @param {string} fgColor
 * @param {string} text
 * @returns {string}
 */
export function badge(bgColor, fgColor, text) {
    return `{${bgColor}-bg}{${fgColor}-fg}${text}{/${fgColor}-fg}{/${bgColor}-bg}`;
}

/**
 * Получает активную тему по её названию из конфигурации.
 * @param {string} themeName
 * @returns {typeof themes.default}
 */
export function getTheme(themeName = "default") {
    return themes[themeName] || themes.default;
}
