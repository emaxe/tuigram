import fs from "node:fs";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";
import { Logger, LogLevel } from "teleproto/extensions/Logger.js";
import { config } from "../config.js";
import { saveSessionFile, readFileSafe } from "../utils/storage.js";

/**
 * Читает сохранённую строку сессии.
 * @returns {string}
 */
export function readSession() {
    return readFileSafe(config.sessionPath, "").trim();
}

/**
 * Сохраняет строку сессии.
 * @param {string} sessionString 
 */
export function saveSession(sessionString) {
    saveSessionFile(config.sessionPath, sessionString);
}

/**
 * Удаляет файл локальной сессии.
 */
export function clearSession() {
    if (fs.existsSync(config.sessionPath)) {
        try {
            fs.unlinkSync(config.sessionPath);
        } catch {
            // Игнорируем ошибку удаления
        }
    }
}

/**
 * Создаёт экземпляр клиента MTProto.
 * @param {string} [sessionString] 
 * @returns {TelegramClient}
 */
export function buildClient(sessionString = readSession()) {
    config.assertCredentials();

    const client = new TelegramClient(
        new StringSession(sessionString),
        config.apiId,
        config.apiHash,
        {
            connectionRetries: 10,
            autoReconnect: true,
            retryDelay: 1500,
            baseLogger: new Logger(LogLevel.ERROR),
            useWSS: false,
        }
    );

    return client;
}

/**
 * Подключает и проверяет авторизацию клиента.
 * @returns {Promise<TelegramClient>}
 */
export async function connectClient() {
    const session = readSession();
    if (!session) {
        throw new Error("Сессия не найдена. Требуется авторизация: запустите логин.");
    }

    const client = buildClient(session);
    await client.connect();

    const isAuth = await client.isUserAuthorized();
    if (!isAuth) {
        throw new Error("Сессия недействительна или была отозвана. Требуется повторный логин.");
    }

    return client;
}

/**
 * Выполняет действие с клиентом и корректно закрывает соединение после.
 * @template T
 * @param {(client: TelegramClient) => Promise<T>} fn 
 * @returns {Promise<T>}
 */
export async function withClient(fn) {
    const client = await connectClient();
    try {
        return await fn(client);
    } finally {
        await client.disconnect().catch(() => {});
        await client.destroy?.().catch(() => {});
    }
}
