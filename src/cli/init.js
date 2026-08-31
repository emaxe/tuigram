import fs from "node:fs";
import path from "node:path";
import input from "input";
import { bold, cyan, green, yellow, dim } from "colorette";
import { config, formatProxyUrl } from "../config.js";

/** Сколько раз переспрашивать значение, прежде чем сдаться. */
const MAX_ATTEMPTS = 3;

/**
 * Экранирует значение для записи в .env: переносы строк и кавычки
 * ломают формат, поэтому оборачиваем в кавычки при необходимости.
 * @param {string} value
 * @returns {string}
 */
export function escapeEnvValue(value) {
    const clean = String(value ?? "").trim();
    if (/^[A-Za-z0-9_.\-/]*$/.test(clean)) return clean;
    return `"${clean.replace(/(["\\])/g, "\\$1").replace(/\n/g, "\\n")}"`;
}

/**
 * Обновляет (или добавляет) переменные в тексте .env, сохраняя остальные строки
 * и комментарии пользователя.
 * @param {string} original
 * @param {Record<string, string>} values
 * @returns {string}
 */
export function upsertEnv(original, values) {
    let text = String(original ?? "");
    for (const [key, value] of Object.entries(values)) {
        const line = `${key}=${escapeEnvValue(value)}`;
        const pattern = new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, "m");
        text = pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\s*$/, "")}\n${line}\n`;
    }
    return text.replace(/^\n+/, "");
}

/** Заголовок, который пишется в свежесозданный конфиг. */
const HEADER = `# TuiGram — настройки пользователя
# Ключи API выдаются на https://my.telegram.org (API development tools).
`;

/** @param {unknown} value @returns {boolean} */
export const isValidApiId = (value) => /^\d+$/.test(String(value ?? "").trim());
/** @param {unknown} value @returns {boolean} */
export const isValidApiHash = (value) => /^[a-f0-9]{32}$/i.test(String(value ?? "").trim());

/**
 * Записывает ключи в пользовательский .env с правами 0600, сохраняя
 * остальное содержимое файла.
 * @param {string} apiId
 * @param {string} apiHash
 * @param {string} [targetPath=config.configEnvPath]
 * @returns {string} путь к записанному файлу
 */
export function saveCredentials(apiId, apiHash, targetPath = config.configEnvPath) {
    if (!isValidApiId(apiId)) throw new Error(`Некорректный api_id: ${apiId}`);
    if (!isValidApiHash(apiHash)) throw new Error("Некорректный api_hash: ожидается 32 hex-символа");

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    let existingText = HEADER;
    try {
        existingText = fs.readFileSync(targetPath, "utf8");
    } catch {
        // файла ещё нет — пишем с заголовком
    }

    const text = upsertEnv(existingText, {
        TELEGRAM_API_ID: String(apiId).trim(),
        TELEGRAM_API_HASH: String(apiHash).trim()
    });

    fs.writeFileSync(targetPath, text, { encoding: "utf8", mode: 0o600 });
    // Если файл уже существовал, mode в writeFileSync игнорируется — выставляем явно.
    fs.chmodSync(targetPath, 0o600);
    return targetPath;
}

/**
 * Спрашивает значение с валидацией. Отдельно обрабатывает EOF (закрытый stdin,
 * запуск в CI или из пайпа): без этого цикл переспрашивания молча вырождается
 * в «успешный» выход без сохранения настроек.
 * @param {string} label
 * @param {(value: unknown) => boolean} validate
 * @param {string} hint
 * @returns {Promise<string>}
 */
async function promptValidated(label, validate, hint) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const answer = await input.text(label);

        if (answer === undefined || answer === null) {
            throw new Error(
                "Ввод недоступен (stdin закрыт). Запустите tuigram init в интерактивном терминале\n" +
                "  либо задайте ключи без диалога:\n" +
                "  tuigram init --api-id <ID> --api-hash <HASH>"
            );
        }

        const value = String(answer).trim();
        if (validate(value)) return value;

        if (attempt < MAX_ATTEMPTS) {
            console.log(yellow(`  ${hint} Попробуйте ещё раз.`));
        }
    }
    throw new Error(`Не удалось получить корректное значение (${MAX_ATTEMPTS} попытки). ${hint}`);
}

/**
 * Интерактивная (или неинтерактивная — через флаги) первичная настройка.
 * @param {Record<string, string|boolean>} [flags]
 * @returns {Promise<void>}
 */
export async function cmdInit(flags = {}) {
    const flagApiId = flags["api-id"] ?? flags.apiId;
    const flagApiHash = flags["api-hash"] ?? flags.apiHash;

    // Неинтерактивный режим: оба ключа переданы флагами.
    if (flagApiId || flagApiHash) {
        if (!flagApiId || !flagApiHash) {
            throw new Error("Нужны оба флага сразу: --api-id <ID> --api-hash <HASH>");
        }
        const saved = saveCredentials(String(flagApiId), String(flagApiHash));
        console.log(green(`\n✓ Настройки сохранены: ${saved}`));
        console.log(dim("  Права доступа: 0600 (только владелец).\n"));
        return;
    }

    // Без TTY промис ввода не резолвится вовсе, и процесс молча выходит
    // с кодом 0, ничего не сохранив. Отсекаем это заранее понятной ошибкой.
    if (!process.stdin.isTTY) {
        throw new Error(
            "Интерактивный ввод недоступен (stdin не подключён к терминалу).\n" +
            "  Задайте ключи без диалога:\n" +
            "  tuigram init --api-id <ID> --api-hash <HASH>"
        );
    }

    console.log(bold("\n🚀 Настройка TuiGram\n"));
    console.log(`Файл настроек: ${cyan(config.configEnvPath)}`);
    console.log(`Данные и сессия: ${cyan(config.dataDir)}\n`);
    console.log(dim("Ключи API выдаются на https://my.telegram.org → API development tools.\n"));

    if (config.apiId && config.apiHash) {
        console.log(yellow(`Ключи уже заданы (api_id: ${config.apiId}).`));
        const overwrite = await input.confirm("Перезаписать их?", { default: false });
        if (!overwrite) {
            console.log(dim("\nОтменено, настройки не изменены."));
            return;
        }
        console.log("");
    }

    const apiId = await promptValidated(
        "TELEGRAM_API_ID: ",
        isValidApiId,
        "api_id — это число, например 1234567."
    );
    const apiHash = await promptValidated(
        "TELEGRAM_API_HASH: ",
        isValidApiHash,
        "api_hash — 32 шестнадцатеричных символа."
    );

    const saved = saveCredentials(apiId, apiHash);

    console.log(green(`\n✓ Настройки сохранены: ${saved}`));
    console.log(dim("  Права доступа: 0600 (только владелец).\n"));
    console.log("Следующий шаг — авторизация:");
    console.log(`  ${bold("tuigram login")}   вход по номеру телефона`);
    console.log(`  ${bold("tuigram")}         запуск интерфейса\n`);
}

/**
 * Печатает актуальные пути и состояние конфигурации — для диагностики.
 */
export function cmdPaths() {
    const sessionExists = fs.existsSync(config.sessionPath);
    const configExists = fs.existsSync(config.configEnvPath);
    const localEnv = path.join(config.packageRoot, ".env");

    console.log(bold("\n📂 Пути TuiGram\n"));
    console.log(`  Версия:          ${config.version}`);
    console.log(`  Корень пакета:   ${config.packageRoot}`);
    console.log(`  Настройки:       ${config.configEnvPath} ${configExists ? green("(есть)") : dim("(нет)")}`);
    if (fs.existsSync(localEnv)) {
        console.log(`  Локальный .env:  ${localEnv} ${green("(есть, имеет приоритет)")}`);
    }
    console.log(`  Данные:          ${config.dataDir}`);
    console.log(`  Сессия:          ${config.sessionPath} ${sessionExists ? green("(есть)") : dim("(нет)")}`);
    console.log(`  Загрузки:        ${config.downloadsDir}`);
    console.log(`  Ключи API:       ${config.apiId && config.apiHash ? green("заданы") : yellow("не заданы — запустите tuigram init")}`);
    console.log(`  Прокси:          ${config.proxy ? green(formatProxyUrl(config.proxy)) : dim("не используется")}`);
    console.log("");
}
