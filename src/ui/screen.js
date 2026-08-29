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
    const screen = blessed.screen({
        smartCSR: true,
        title: "TuiGram - Telegram Terminal Client",
        fullUnicode: true,
        dockBorders: true,
        cursor: {
            synthetic: true,
            blink: true,
            shape: "line",
        },
        style: {
            bg: theme?.bg ?? "black",
            fg: theme?.fg ?? "white",
        }
    });

    screen.ignoreLocked = [...GLOBAL_KEYS];

    // Обработка закрытия терминала или аварийного прерывания
    screen.key(["C-c"], () => {
        try {
            onExit?.();
        } catch {
            // Выходим в любом случае
        }
        screen.destroy();
        process.exit(0);
    });

    return screen;
}
