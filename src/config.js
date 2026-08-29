import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Корень пакета (там, где лежит package.json). */
const packageRoot = path.resolve(__dirname, "..");

/** Имя приложения — используется в путях пользовательских директорий. */
const APP_DIR_NAME = "tuigram";

/**
 * Директория пользовательских настроек.
 * Пакет может быть установлен глобально в системную папку без прав на запись,
 * поэтому ни настройки, ни сессия внутри самого пакета не хранятся.
 * @returns {string}
 */
function resolveConfigDir() {
    if (process.env.TUIGRAM_CONFIG_DIR) {
        return path.resolve(process.env.TUIGRAM_CONFIG_DIR);
    }
    if (process.platform === "win32") {
        const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
        return path.join(appData, APP_DIR_NAME);
    }
    const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    return path.join(xdg, APP_DIR_NAME);
}

/**
 * Директория пользовательских данных (сессия, загрузки).
 * @returns {string}
 */
function resolveDataDir() {
    if (process.env.TUIGRAM_DATA_DIR) {
        return path.resolve(process.env.TUIGRAM_DATA_DIR);
    }
    if (process.env.DATA_DIR) {
        // Обратная совместимость со старым .env: относительные пути
        // разрешаются от корня пакета, как было раньше.
        return path.resolve(packageRoot, process.env.DATA_DIR);
    }
    if (process.platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
        return path.join(localAppData, APP_DIR_NAME);
    }
    const xdg = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
    return path.join(xdg, APP_DIR_NAME);
}

const configDir = resolveConfigDir();
const configEnvPath = path.join(configDir, ".env");

// Порядок загрузки = приоритет: dotenv не перетирает уже заданные переменные.
// 1. Переменные окружения процесса (наивысший приоритет — ничего не грузим).
// 2. .env в корне пакета — рабочий режим при запуске из клона репозитория
//    (в опубликованный пакет этот файл не попадает, см. "files" в package.json).
// 3. .env в пользовательской директории настроек — режим установленного CLI.
const localEnvPath = path.join(packageRoot, ".env");
if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath, quiet: true });
}
if (fs.existsSync(configEnvPath)) {
    dotenv.config({ path: configEnvPath, quiet: true });
}

const dataDir = resolveDataDir();
const sessionPath = path.join(dataDir, "session.txt");
const downloadsDir = path.join(dataDir, "downloads");

/** Путь к сессии в старом формате (внутри пакета) — для одноразовой миграции. */
const legacySessionPath = path.resolve(packageRoot, "data", "session.txt");

/**
 * Переносит сессию из старого расположения (`<пакет>/data/session.txt`)
 * в пользовательскую директорию. Выполняется один раз и молча:
 * отсутствие прав или файла не должно ломать запуск.
 * @returns {boolean} true, если сессия была перенесена
 */
function migrateLegacySession() {
    try {
        if (sessionPath === legacySessionPath) return false;
        if (!fs.existsSync(legacySessionPath)) return false;
        if (fs.existsSync(sessionPath)) return false;

        const session = fs.readFileSync(legacySessionPath, "utf8").trim();
        if (!session) return false;

        fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
        fs.writeFileSync(sessionPath, session, { encoding: "utf8", mode: 0o600 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Версия из package.json — единственный источник правды для `--version`.
 * @returns {string}
 */
function readVersion() {
    try {
        const raw = fs.readFileSync(path.join(packageRoot, "package.json"), "utf8");
        return JSON.parse(raw).version || "0.0.0";
    } catch {
        return "0.0.0";
    }
}

export const config = {
    packageRoot,
    /** @deprecated оставлено для обратной совместимости, равно packageRoot */
    rootDir: packageRoot,
    configDir,
    configEnvPath,
    dataDir,
    sessionPath,
    downloadsDir,
    legacySessionPath,
    version: readVersion(),

    apiId: parseInt(process.env.TELEGRAM_API_ID || "0", 10),
    apiHash: process.env.TELEGRAM_API_HASH || "",

    theme: process.env.TUI_THEME || "default",
    autoScroll: String(process.env.AUTO_SCROLL || "true").toLowerCase() === "true",
    showTyping: String(process.env.SHOW_TYPING || "true").toLowerCase() === "true",

    /**
     * Путь к файлу сессии.
     * @returns {string}
     */
    getSessionFilePath() {
        return sessionPath;
    },

    migrateLegacySession,

    /**
     * Проверяет наличие ключей API.
     */
    assertCredentials() {
        if (!config.apiId || !config.apiHash) {
            throw new Error(
                "Не заданы TELEGRAM_API_ID / TELEGRAM_API_HASH.\n" +
                "  1. Получите ключи на https://my.telegram.org (API development tools)\n" +
                "  2. Запустите: tuigram init\n" +
                `     (ключи будут сохранены в ${configEnvPath})\n` +
                "  Либо задайте их через переменные окружения TELEGRAM_API_ID и TELEGRAM_API_HASH."
            );
        }
    }
};

migrateLegacySession();
