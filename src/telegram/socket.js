/**
 * Сетевой транспорт для MTProto с поддержкой прокси (HTTP CONNECT, SOCKS5, SOCKS4).
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { PromisedNetSockets } from "teleproto/extensions/PromisedNetSockets.js";
import { SocksClient } from "socks";

/**
 * Создаёт TCP-туннель через HTTP/HTTPS прокси методом HTTP CONNECT.
 * Поддерживает как прокси с Basic-авторизацией, так и без неё.
 * @param {object} params
 * @param {boolean} [params.isHttps=false] подключение к прокси-серверу по TLS
 * @param {string} params.proxyHost адрес прокси-сервера
 * @param {number} params.proxyPort порт прокси-сервера
 * @param {string} params.targetHost адрес целевого сервера Telegram MTProto
 * @param {number} params.targetPort порт целевого сервера Telegram MTProto
 * @param {string} [params.username] логин для авторизации на прокси
 * @param {string} [params.password] пароль для авторизации на прокси
 * @param {number} [params.timeout=10000] таймаут установки соединения в миллисекундах
 * @returns {Promise<import("node:net").Socket>}
 */
export function createHttpConnectSocket({
    isHttps = false,
    proxyHost,
    proxyPort,
    targetHost,
    targetPort,
    username,
    password,
    timeout = 10000,
}) {
    return new Promise((resolve, reject) => {
        const clientModule = isHttps ? https : http;

        const headers = {
            Host: `${targetHost}:${targetPort}`,
            "User-Agent": "TuiGram",
            "Proxy-Connection": "Keep-Alive",
        };

        if (username || password) {
            const auth = Buffer.from(`${username || ""}:${password || ""}`).toString("base64");
            headers["Proxy-Authorization"] = `Basic ${auth}`;
        }

        const req = clientModule.request({
            host: proxyHost,
            port: proxyPort,
            method: "CONNECT",
            path: `${targetHost}:${targetPort}`,
            headers,
            timeout,
        });

        let finished = false;

        const cleanup = () => {
            req.removeAllListeners();
        };

        req.on("connect", (res, socket, head) => {
            if (finished) return;
            finished = true;
            cleanup();

            if (res.statusCode >= 200 && res.statusCode < 300) {
                // Если в заголовке ответа уже были данные следующего протокола, возвращаем их в сокет
                if (head && head.length > 0) {
                    socket.unshift(head);
                }
                resolve(socket);
            } else if (res.statusCode === 407) {
                socket.destroy();
                reject(new Error("Ошибка авторизации на HTTP-прокси (407 Proxy Authentication Required)"));
            } else {
                socket.destroy();
                reject(new Error(`HTTP-прокси вернул код ошибки: ${res.statusCode} ${res.statusMessage || ""}`.trim()));
            }
        });

        req.on("response", (res) => {
            if (finished) return;
            finished = true;
            cleanup();
            if (res.statusCode === 407) {
                reject(new Error("Ошибка авторизации на HTTP-прокси (407 Proxy Authentication Required)"));
            } else {
                reject(new Error(`HTTP-прокси вернул код ошибки: ${res.statusCode} ${res.statusMessage || ""}`.trim()));
            }
        });

        req.on("timeout", () => {
            if (finished) return;
            finished = true;
            cleanup();
            req.destroy(new Error(`Таймаут подключения к HTTP-прокси (${proxyHost}:${proxyPort})`));
        });

        req.on("error", (err) => {
            if (finished) return;
            finished = true;
            cleanup();
            reject(new Error(`Не удалось подключиться к HTTP-прокси (${proxyHost}:${proxyPort}): ${err.message}`));
        });

        req.end();
    });
}

/**
 * Расширенный сокет для teleproto с поддержкой HTTP CONNECT и SOCKS5/4 туннелирования.
 */
export class TuiGramNetSockets extends PromisedNetSockets {
    /**
     * @param {object} [proxy]
     * @param {number} [keepAliveInterval]
     */
    constructor(proxy, keepAliveInterval) {
        // Передаём undefined в базовый класс, чтобы обойти валидацию socksType для HTTP-прокси
        super(undefined, keepAliveInterval);
        this.proxy = proxy;
    }

    /**
     * Устанавливает сетевое соединение с дата-центром Telegram.
     * @param {number} port
     * @param {string} ip
     * @returns {Promise<this>}
     */
    async connect(port, ip) {
        this.chunks = [];
        this.headOffset = 0;
        this.available = 0;
        let connected = false;

        if (this.proxy) {
            const proxyType = (this.proxy.type || "").toLowerCase();
            const host = this.proxy.host || this.proxy.ip;
            const proxyPort = Number(this.proxy.port);
            const timeout = (this.proxy.timeout || 10) * 1000;

            if (proxyType === "socks5" || proxyType === "socks4" || this.proxy.socksType) {
                const socksType = this.proxy.socksType || (proxyType === "socks4" ? 4 : 5);
                const info = await SocksClient.createConnection({
                    proxy: {
                        host,
                        port: proxyPort,
                        type: socksType,
                        userId: this.proxy.username,
                        password: this.proxy.password,
                    },
                    command: "connect",
                    timeout,
                    destination: {
                        host: ip,
                        port: port,
                    },
                });
                this.client = info.socket;
                connected = true;
            } else if (proxyType === "http" || proxyType === "https" || this.proxy.http) {
                this.client = await createHttpConnectSocket({
                    isHttps: proxyType === "https",
                    proxyHost: host,
                    proxyPort: proxyPort,
                    targetHost: ip,
                    targetPort: port,
                    username: this.proxy.username,
                    password: this.proxy.password,
                    timeout,
                });
                connected = true;
            } else {
                throw new Error(`Неподдерживаемый тип прокси: ${this.proxy.type}`);
            }
        } else {
            this.client = new net.Socket();
        }

        this.canRead = new Promise((resolve) => {
            this.resolveRead = resolve;
        });
        this.closed = false;

        return new Promise((resolve, reject) => {
            if (!this.client) {
                return reject(new Error("Сетевой сокет не инициализирован"));
            }

            const tune = (socket) => {
                socket.setNoDelay(true);
                socket.setKeepAlive(this.keepAliveInterval > 0, Math.max(0, this.keepAliveInterval));
            };

            if (connected) {
                tune(this.client);
                this.receive();
                resolve(this);
            } else {
                this.client.connect(port, ip, () => {
                    tune(this.client);
                    this.receive();
                    resolve(this);
                });
            }

            this.client.on("error", reject);
            this.client.on("close", () => {
                if (this.client && this.client.destroyed) {
                    if (this.resolveRead) {
                        this.resolveRead(false);
                    }
                    this.closed = true;
                }
            });
        });
    }

    toString() {
        return "TuiGramNetSocket";
    }
}
