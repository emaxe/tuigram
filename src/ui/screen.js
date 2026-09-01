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
    // C-a — меню действий над выделенным сообщением, f12 — тумблер захвата мыши
    "C-a",
    "f12",
    // escape — чтобы можно было прервать отправку файла из любого места
    "escape",
];

/**
 * Включение мыши: 1000 — кнопки, 1002 — клики/перетаскивание/колесо,
 * 1006 — SGR-кодирование координат, 1015 — urxvt как запасной вариант.
 * Режимы 1003 (все движения) и 1005 (UTF-8) явно гасим: они ломают разбор в blessed.
 */
const ENABLE_MOUSE_SEQ = "\x1b[?1003l\x1b[?1005l\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[?1015h";
const DISABLE_MOUSE_SEQ = "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l";

/**
 * Пишет escape-последовательность напрямую в терминал.
 * @param {import("neo-blessed").Widgets.Screen} screen
 * @param {string} seq
 */
function writeSeq(screen, seq) {
    try {
        if (screen.program?.output && typeof screen.program.output.write === "function") {
            screen.program.output.write(seq);
        }
    } catch {
        // Игнорируем в headless/тестах
    }
}

/**
 * Включает или выключает захват мыши терминалом приложения.
 * Пока захват включён, терминал не отдаёт пользователю выделение текста мышью,
 * поэтому нужен способ временно его отпустить (F12).
 * @param {import("neo-blessed").Widgets.Screen} screen
 * @param {boolean} enabled
 */
export function setMouseCapture(screen, enabled) {
    screen.mouseCaptured = enabled;
    if (enabled) {
        writeSeq(screen, ENABLE_MOUSE_SEQ);
        screen.program.enableMouse();
    } else {
        try {
            screen.program.disableMouse();
        } catch {
            // Игнорируем в headless/тестах
        }
        writeSeq(screen, DISABLE_MOUSE_SEQ);
    }
}

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

    screen.mouseCaptured = true;
    writeSeq(screen, ENABLE_MOUSE_SEQ);
    screen.enableMouse();

    // Режимы мыши переотправляются после каждой перерисовки и при ресайзе.
    // Это выглядит избыточным, но без этого часть терминалов перестаёт слать
    // события мыши приложению: попытка убрать переотправку ломала клики целиком.
    // Не удалять без проверки в живом терминале — headless-тесты этого не ловят.
    function restoreMouse() {
        if (screen.mouseCaptured) writeSeq(screen, ENABLE_MOUSE_SEQ);
    }

    screen.on("render", restoreMouse);
    screen.on("resize", restoreMouse);

    // Пробрасываем событие click на уровне экрана при mouseup
    screen.on("mouseup", (data) => {
        screen.emit("click", data);
    });

    // Обработка закрытия терминала или аварийного прерывания
    function cleanExit() {
        try {
            setMouseCapture(screen, false);
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
