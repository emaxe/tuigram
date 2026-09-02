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

/**
 * @typedef {Object} ProxyConfig
 * @property {"http"|"https"|"socks5"|"socks4"} type - Протокол прокси
 * @property {string} host - Адрес сервера прокси
 * @property {number} port - Порт сервера прокси
 * @property {string} [username] - Логин пользователя
 * @property {string} [password] - Пароль пользователя
 * @property {number} [timeout] - Таймаут в секундах
 * @property {string} ip - Хост прокси (для совместимости с MTProto)
 * @property {4|5} [socksType] - Тип SOCKS-прокси
 * @property {boolean} [http] - Флаг HTTP-прокси
 */

/**
 * Нормализует тип прокси из строки протокола.
 * @param {string} [raw]
 * @returns {"http"|"https"|"socks5"|"socks4"}
 */
function normalizeProxyType(raw) {
    const clean = String(raw || "").toLowerCase().replace(/:$/, "").trim();
    if (clean === "https") return "https";
    if (clean === "socks4" || clean === "socks4a") return "socks4";
    if (clean === "socks5" || clean === "socks5h" || clean === "socks") return "socks5";
    return "http";
}

/**
 * Разбирает параметры прокси из переменных окружения или переданного объекта.
 * Поддерживает URL-формат (PROXY_URL, HTTPS_PROXY, HTTP_PROXY, ALL_PROXY)
 * и отдельные переменные (PROXY_TYPE, PROXY_HOST, PROXY_PORT, PROXY_USERNAME, PROXY_PASSWORD).
 * @param {Record<string, string|undefined>} [env=process.env]
 * @returns {ProxyConfig|null}
 */
export function parseProxyConfig(env = process.env) {
    const rawUrl = env.PROXY_URL || env.proxy_url || (!env.PROXY_HOST && !env.PROXY_IP && !env.proxy_host && !env.proxy_ip
        ? (env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy)
        : undefined);

    let type = "http";
    let host = "";
    let port = 0;
    let username = "";
    let password = "";

    if (rawUrl && typeof rawUrl === "string" && rawUrl.trim()) {
        let urlStr = rawUrl.trim();
        // Добавляем схему по умолчанию, если передан host:port без префикса
        if (!/^[a-zA-Z0-9+-.]+:\/\//.test(urlStr)) {
            const defaultScheme = (env.PROXY_TYPE || "http").toLowerCase().replace(/:$/, "");
            urlStr = `${defaultScheme}://${urlStr}`;
        }

        try {
            const parsed = new URL(urlStr);
            type = normalizeProxyType(parsed.protocol);
            host = parsed.hostname.replace(/^\[(.*)\]$/, "$1");
            port = parsed.port ? parseInt(parsed.port, 10) : (type === "https" ? 443 : (type.startsWith("socks") ? 1080 : 8080));
            if (parsed.username) username = decodeURIComponent(parsed.username);
            if (parsed.password) password = decodeURIComponent(parsed.password);
        } catch {
            return null;
        }
    } else if (env.PROXY_HOST || env.PROXY_IP) {
        type = normalizeProxyType(env.PROXY_TYPE || "http");
        host = String(env.PROXY_HOST || env.PROXY_IP).trim();
        const defaultPort = type === "https" ? 443 : (type.startsWith("socks") ? 1080 : 8080);
        port = env.PROXY_PORT ? parseInt(String(env.PROXY_PORT).trim(), 10) : defaultPort;
        username = String(env.PROXY_USERNAME || env.PROXY_USER || "").trim();
        password = String(env.PROXY_PASSWORD || env.PROXY_PASS || "").trim();
    } else {
        return null;
    }

    if (!host || !port || isNaN(port) || port <= 0 || port > 65535) {
        return null;
    }

    const rawTimeout = env.PROXY_TIMEOUT ? parseInt(String(env.PROXY_TIMEOUT).trim(), 10) : 10;
    const timeout = isNaN(rawTimeout) || rawTimeout <= 0 ? 10 : rawTimeout;

    /** @type {ProxyConfig} */
    const result = {
        type,
        host,
        port,
        ip: host,
        timeout,
    };

    if (username) result.username = username;
    if (password) result.password = password;

    if (type === "socks5") {
        result.socksType = 5;
    } else if (type === "socks4") {
        result.socksType = 4;
    } else {
        result.http = true;
    }

    return result;
}

/**
 * Форматирует конфигурацию прокси в строку для вывода в терминал.
 * Пароль маскируется звездочками в целях безопасности.
 * @param {ProxyConfig|null} proxy
 * @returns {string}
 */
export function formatProxyUrl(proxy) {
    if (!proxy) return "не используется";

    let auth = "";
    if (proxy.username) {
        auth = proxy.password
            ? `${encodeURIComponent(proxy.username)}:***@`
            : `${encodeURIComponent(proxy.username)}@`;
    }

    const host = proxy.host.includes(":") ? `[${proxy.host}]` : proxy.host;
    return `${proxy.type}://${auth}${host}:${proxy.port}`;
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
    showImages: String(process.env.SHOW_IMAGES || "true").toLowerCase() !== "false",
    imageMaxWidth: parseInt(process.env.IMAGE_MAX_WIDTH || "36", 10) || 36,
    imageMaxHeight: parseInt(process.env.IMAGE_MAX_HEIGHT || "14", 10) || 14,

    enableVideo: String(process.env.ENABLE_VIDEO || process.env.ENABLE_VIDEO_PLAYBACK || "false").toLowerCase() === "true",
    videoFps: Math.min(30, Math.max(1, parseInt(process.env.VIDEO_FPS || "15", 10) || 15)),
    videoAudio: String(process.env.VIDEO_AUDIO || "true").toLowerCase() !== "false",
    ffmpegPath: process.env.FFMPEG_PATH || null,
    ffplayPath: process.env.FFPLAY_PATH || null,

    proxy: parseProxyConfig(),

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
