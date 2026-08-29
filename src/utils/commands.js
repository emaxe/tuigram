/**
 * Разбор аргументов слэш-команд TUI.
 */

/**
 * Разбирает аргументы `/sendfile`.
 *
 * Формат: `путь [| путь ...] [-- подпись]`
 * Разделитель путей — `|`, подпись отделяется первым ` -- `.
 * Всё после первого ` -- ` считается подписью целиком, поэтому подпись
 * сама может содержать двойное тире.
 *
 * @param {string|string[]} rawArgs
 * @returns {{ paths: string[], caption: string }}
 */
export function parseSendFileArgs(rawArgs) {
    const raw = (Array.isArray(rawArgs) ? rawArgs.join(" ") : String(rawArgs ?? "")).trim();
    if (!raw) return { paths: [], caption: "" };

    let pathsPart = raw;
    let caption = "";

    const separator = raw.match(/(^|\s)--(\s|$)/);
    if (separator) {
        pathsPart = raw.slice(0, separator.index);
        caption = raw.slice(separator.index + separator[0].length).trim();
        // Разделитель в начале строки: путей нет вовсе
        if (separator[1] === "") {
            pathsPart = "";
            caption = raw.slice(separator[0].length - (separator[2] === "" ? 0 : 1)).trim();
        }
    }

    const paths = pathsPart
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);

    return { paths, caption };
}
