import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Создаёт директорию, если она ещё не существует.
 * @param {string} dirPath 
 */
export function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Безопасно читает текстовый файл.
 * @param {string} filePath 
 * @param {string} [defaultValue=""]
 * @returns {string}
 */
export function readFileSafe(filePath, defaultValue = "") {
    try {
        if (!fs.existsSync(filePath)) return defaultValue;
        return fs.readFileSync(filePath, "utf8");
    } catch {
        return defaultValue;
    }
}

/**
 * Записывает файл, создавая родительские папки при необходимости.
 * @param {string} filePath 
 * @param {string} content 
 * @param {object} [options]
 */
export function writeFileSafe(filePath, content, options = {}) {
    const dir = path.dirname(filePath);
    ensureDir(dir);
    fs.writeFileSync(filePath, content, { encoding: "utf8", ...options });
}

/**
 * Сохраняет строку сессии Telegram с правами 0600 (только для владельца).
 * @param {string} filePath 
 * @param {string} sessionString 
 */
export function saveSessionFile(filePath, sessionString) {
    const dir = path.dirname(filePath);
    ensureDir(dir);
    fs.writeFileSync(filePath, sessionString.trim(), { encoding: "utf8", mode: 0o600 });
}

/**
 * Читает JSON-файл или возвращает значение по умолчанию при ошибке.
 * @template T
 * @param {string} filePath 
 * @param {T} [defaultValue=null]
 * @returns {T}
 */
export function readJson(filePath, defaultValue = null) {
    try {
        if (!fs.existsSync(filePath)) return defaultValue;
        const text = fs.readFileSync(filePath, "utf8");
        return JSON.parse(text);
    } catch {
        return defaultValue;
    }
}

/**
 * Записывает объект в JSON-файл.
 * @param {string} filePath 
 * @param {unknown} data 
 * @param {boolean} [pretty=true]
 */
export function writeJson(filePath, data, pretty = true) {
    const dir = path.dirname(filePath);
    ensureDir(dir);
    const text = JSON.stringify(data, null, pretty ? 2 : 0);
    fs.writeFileSync(filePath, text, "utf8");
}

/** Расширения, которые teleproto отправляет как сжатое фото (см. Utils.isImage). */
const PHOTO_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
/** Расширения, которые Telegram показывает как видео. */
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".3gp"]);

/**
 * Приводит введённый пользователем путь к абсолютному:
 * снимает обрамляющие кавычки, shell-экранирование (перетаскивание файла
 * в терминал) и раскрывает "~".
 * @param {string} raw
 * @returns {string} абсолютный путь или "" для пустого ввода
 */
export function resolveLocalPath(raw) {
    let value = String(raw ?? "").trim();
    if (!value) return "";

    const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));

    if (quoted && value.length >= 2) {
        value = value.slice(1, -1);
    } else {
        // Снимаем экранирование только тех символов, которые экранирует shell,
        // чтобы не покалечить windows-путь вида C:\Users\name
        value = value.replace(/\\([ ()'"&!$`;|<>*?\[\]{}~#])/g, "$1");
    }

    value = value.trim();
    if (!value) return "";

    if (value === "~") {
        value = os.homedir();
    } else if (value.startsWith("~/") || value.startsWith("~\\")) {
        value = path.join(os.homedir(), value.slice(2));
    }

    return path.resolve(value);
}

/**
 * Определяет, чем Telegram покажет файл: фото, видео или документом.
 * @param {string} filePath
 * @returns {"photo"|"video"|"document"}
 */
export function detectFileKind(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (PHOTO_EXTENSIONS.has(ext)) return "photo";
    if (VIDEO_EXTENSIONS.has(ext)) return "video";
    return "document";
}

/**
 * Проверяет локальный файл перед отправкой и возвращает понятную ошибку
 * вместо сетевой. Единая точка валидации для TUI, слэш-команд и CLI.
 * @param {string} raw путь в любом виде (с "~", кавычками, экранированием)
 * @returns {{ ok: boolean, filePath: string, name?: string, size?: number, kind?: string, error?: string }}
 */
export function inspectLocalFile(raw) {
    const filePath = resolveLocalPath(raw);
    if (!filePath) {
        return { ok: false, filePath: "", error: "Не указан путь к файлу" };
    }

    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch {
        return { ok: false, filePath, error: `Файл не найден: ${filePath}` };
    }

    if (stat.isDirectory()) {
        return { ok: false, filePath, error: `Это папка, а не файл: ${filePath}` };
    }
    if (!stat.isFile()) {
        return { ok: false, filePath, error: `Не обычный файл: ${filePath}` };
    }
    if (stat.size === 0) {
        return { ok: false, filePath, error: `Файл пустой: ${path.basename(filePath)}` };
    }

    try {
        fs.accessSync(filePath, fs.constants.R_OK);
    } catch {
        return { ok: false, filePath, error: `Нет прав на чтение: ${filePath}` };
    }

    return {
        ok: true,
        filePath,
        name: path.basename(filePath),
        size: stat.size,
        kind: detectFileKind(filePath),
    };
}
