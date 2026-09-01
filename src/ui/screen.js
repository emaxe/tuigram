import blessed from "neo-blessed";

/**
 * Глобальные сочетания, которые должны работать даже когда поле ввода или строка
 * поиска перехватили клавиатуру (blessed выставляет screen.grabKeys = true и
 * перестаёт рассылать screen-события всему, чего нет в ignoreLocked).
 */
export const GLOBAL_KEYS = [
    "C-c",
    "C-q",
    "tab",
    "S-tab",
    "f1",
    "C-o",
    "C-r",
    "C-e",
    "C-p",
    // escape — чтобы можно было прервать отправку файла из любого места
    "escape",
];

/**
 * Создаёт и настраивает главный экран терминального интерфейса.
 * @param {object} [options]
 * @param {object} [options.theme] активная тема (для фона экрана)
 * @param {() => void} [options.onExit] вызывается перед завершением процесса по Ctrl+C
 * @returns {blessed.Widgets.Screen}
 */
export function createScreen({ theme, onExit } = {}) {
    // Форсируем поддержку SGR и CellMotion режимов в neo-blessed для современных терминалов
    process.env.BLESSED_FORCE_MODES = "SGRMOUSE=1,CELLMOTION=1,VT200MOUSE=1,UTFMOUSE=0,ALLMOTION=0,URXVTMOUSE=1";

    const screen = blessed.screen({
        smartCSR: true,
        title: "TuiGram - Telegram Terminal Client",
        fullUnicode: true,
        dockBorders: true,
        sendFocus: true,
        cursor: {
            synthetic: true,
            blink: true,
            shape: "line",
        },
        style: {
            bg: theme?.bg ?? "black",
            fg: theme?.fg ?? "white",
        },
    });

    screen.ignoreLocked = [...GLOBAL_KEYS];

    // Настраиваем режимы мыши в program:
    // SGR (1006) — стандарт для macOS Terminal, iTerm2, Alacritty, Kitty, Windows Terminal
    // CellMotion (1002) — клики, зажатия и скролл
    // VT200 (1000) — базовая поддержка кнопок
    // urxvt (1015) — fallback
    screen.program.setMouse({
        vt200Mouse: true,
        cellMotion: true,
        allMotion: false,
        sgrMouse: true,
        urxvtMouse: true,
        utfMouse: false,
    }, true);

    const enableMouseSeq = "\x1b[?1003l\x1b[?1005l\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[?1015h";
    const disableMouseSeq = "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l";

    function sendEnableMouse() {
        try {
            if (screen.program && screen.program.output && typeof screen.program.output.write === "function") {
                screen.program.output.write(enableMouseSeq);
            }
        } catch {
            // Игнорируем в headless/тестах
        }
    }

    sendEnableMouse();
    screen.enableMouse();

    // Отправляем escape-последовательности повторно при перерендере/ресайзе экрана
    screen.on("render", sendEnableMouse);
    screen.on("resize", sendEnableMouse);

    // Пробрасываем событие click на уровне экрана при mouseup
    screen.on("mouseup", (data) => {
        screen.emit("click", data);
    });

    // Обработка закрытия терминала или аварийного прерывания
    function cleanExit() {
        try {
            if (screen.program && screen.program.output && typeof screen.program.output.write === "function") {
                screen.program.output.write(disableMouseSeq);
            }
            screen.program.disableMouse();
            onExit?.();
        } catch {
            // Выходим в любом случае
        }
        screen.destroy();
        process.exit(0);
    }

    screen.key(["C-c"], cleanExit);

    return screen;
}
