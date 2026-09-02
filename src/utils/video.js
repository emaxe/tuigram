/**
 * Модуль для работы с воспроизведением видео в терминале.
 * Отвечает за обнаружение ffmpeg/ffplay, запуск декодирования видеопотока
 * в сырые RGB24-кадры и их быстрое преобразование в Unicode Half-Block псевдографику.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawn, spawnSync } from "node:child_process";
import { config } from "../config.js";
import { rgbaToHex } from "./image.js";

/**
 * Ищет путь к исполняемому файлу ffmpeg:
 * 1. В переменной окружения FFMPEG_PATH или config.ffmpegPath
 * 2. В пользовательском каталоге данных: <dataDir>/bin/ffmpeg
 * 3. В системном PATH
 * @returns {string|null} абсолютный путь к ffmpeg или null
 */
export function findFfmpegPath() {
    if (config.ffmpegPath && fs.existsSync(config.ffmpegPath)) {
        return path.resolve(config.ffmpegPath);
    }
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
        return path.resolve(process.env.FFMPEG_PATH);
    }

    const localBin = path.join(config.dataDir, "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    if (fs.existsSync(localBin)) {
        return localBin;
    }

    // Проверяем наличие ffmpeg в системном PATH
    try {
        const cmd = process.platform === "win32" ? "where" : "which";
        const res = spawnSync(cmd, ["ffmpeg"], { encoding: "utf8", timeout: 2000 });
        if (res.status === 0 && res.stdout) {
            const firstLine = res.stdout.trim().split(/\r?\n/)[0];
            if (firstLine && fs.existsSync(firstLine)) {
                return firstLine;
            }
            return "ffmpeg";
        }
    } catch {
        // Игнорируем ошибки проверки системного PATH
    }

    return null;
}

/**
 * Ищет путь к утилите ffplay для воспроизведения звука.
 * @returns {string|null}
 */
export function findFfplayPath() {
    if (config.ffplayPath && fs.existsSync(config.ffplayPath)) {
        return path.resolve(config.ffplayPath);
    }
    if (process.env.FFPLAY_PATH && fs.existsSync(process.env.FFPLAY_PATH)) {
        return path.resolve(process.env.FFPLAY_PATH);
    }

    const localBin = path.join(config.dataDir, "bin", process.platform === "win32" ? "ffplay.exe" : "ffplay");
    if (fs.existsSync(localBin)) {
        return localBin;
    }

    try {
        const cmd = process.platform === "win32" ? "where" : "which";
        const res = spawnSync(cmd, ["ffplay"], { encoding: "utf8", timeout: 2000 });
        if (res.status === 0 && res.stdout) {
            const firstLine = res.stdout.trim().split(/\r?\n/)[0];
            if (firstLine && fs.existsSync(firstLine)) {
                return firstLine;
            }
            return "ffplay";
        }
    } catch {
        // Игнорируем ошибки проверки системного PATH
    }

    return null;
}

/**
 * Проверяет, доступен ли ffmpeg для работы.
 * @returns {boolean}
 */
export function isFfmpegAvailable() {
    const ffmpegPath = findFfmpegPath();
    if (!ffmpegPath) return false;
    try {
        const res = spawnSync(ffmpegPath, ["-version"], { encoding: "utf8", timeout: 3000 });
        return res.status === 0;
    } catch {
        return false;
    }
}

/**
 * Проверяет, является ли сообщение видеофайлом или видеозаметкой («кружочком»).
 * @param {object} msg
 * @returns {boolean}
 */
export function isMessageVideo(msg) {
    if (!msg?.media) return false;
    const media = msg.media;
    if (media.className === "MessageMediaDocument") {
        const doc = media.document || {};
        if (typeof doc.mimeType === "string" && doc.mimeType.startsWith("video/")) {
            return true;
        }
        const attributes = doc.attributes || [];
        for (const attr of attributes) {
            if (attr.className === "DocumentAttributeVideo") {
                return true;
            }
        }
    }
    return false;
}

/**
 * Преобразует сырой буфер пикселей RGB24 в многострочную псевдографику Blessed (Unicode Half-Block ▀).
 *
 * Оптимизация: соседние ячейки с одинаковыми цветами группируются, что сокращает размер
 * строки тегов в несколько раз и ускоряет рендеринг в терминале.
 *
 * @param {Buffer|Uint8Array} rgbData буфер сырых байтов RGB24 (длина = width * height * 3)
 * @param {number} width ширина кадра в символах/ячейках
 * @param {number} height высота кадра в пикселях (должна быть четной, = rows * 2)
 * @returns {string}
 */
export function rgb24ToHalfBlockBlessed(rgbData, width, height) {
    if (!rgbData || rgbData.length < width * height * 3) return "";
    const rows = Math.floor(height / 2);
    const lines = [];

    for (let r = 0; r < rows; r++) {
        let line = "";
        let prevFg = "";
        let prevBg = "";

        const topRowOffset = (2 * r) * width * 3;
        const botRowOffset = (2 * r + 1) * width * 3;

        for (let c = 0; c < width; c++) {
            const topIdx = topRowOffset + c * 3;
            const botIdx = botRowOffset + c * 3;

            const r1 = rgbData[topIdx];
            const g1 = rgbData[topIdx + 1];
            const b1 = rgbData[topIdx + 2];

            const r2 = rgbData[botIdx];
            const g2 = rgbData[botIdx + 1];
            const b2 = rgbData[botIdx + 2];

            const fgHex = rgbaToHex(r1, g1, b1);
            const bgHex = rgbaToHex(r2, g2, b2);

            if (fgHex !== prevFg && bgHex !== prevBg) {
                line += `{${fgHex}-fg}{${bgHex}-bg}▀`;
                prevFg = fgHex;
                prevBg = bgHex;
            } else if (fgHex !== prevFg) {
                line += `{${fgHex}-fg}▀`;
                prevFg = fgHex;
            } else if (bgHex !== prevBg) {
                line += `{${bgHex}-bg}▀`;
                prevBg = bgHex;
            } else {
                line += "▀";
            }
        }
        lines.push(line);
    }

    return lines.join("\n");
}

/**
 * Запускает фоновый процесс ffmpeg для декодирования видео в сырые RGB24-кадры
 * и выполняет их синхронизированную по времени выдачу в колбэк onFrame.
 * @param {string} ffmpegPath
 * @param {string} videoPath
 * @param {object} options
 * @param {number} [options.width=60] ширина кадра в символах
 * @param {number} [options.height=30] высота кадра в пикселях (четная)
 * @param {number} [options.fps=15] частота кадров
 * @param {(frameText: string, frameIndex: number) => void} options.onFrame колбэк для каждого кадра
 * @param {() => void} [options.onEnd] колбэк завершения видео
 * @param {(err: Error) => void} [options.onError] колбэк ошибки
 * @returns {{ pause: () => void, resume: () => void, kill: () => void, isPaused: () => boolean }}
 */
export function spawnVideoPlayer(ffmpegPath, videoPath, {
    width = 60,
    height = 30,
    fps = 15,
    onFrame,
    onEnd,
    onError,
} = {}) {
    const frameSize = width * height * 3;
    const args = [
        "-hide_banner",
        "-loglevel", "error",
        "-i", videoPath,
        "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        "-f", "rawvideo",
        "-pix_fmt", "rgb24",
        "-r", String(fps),
        "pipe:1"
    ];

    let child = null;
    let paused = false;
    let killed = false;
    let isEof = false;
    let timer = null;

    let accumulator = Buffer.alloc(0);
    const frameQueue = [];
    let frameCounter = 0;
    let displayedFrameIndex = -1;

    let startTime = null;
    let totalPausedTime = 0;
    let pauseStartTime = 0;

    try {
        child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "ignore"] });
    } catch (err) {
        onError?.(err);
        return { pause() {}, resume() {}, kill() {}, isPaused: () => false };
    }

    const stdout = child.stdout;

    stdout.on("data", (chunk) => {
        if (killed) return;
        accumulator = Buffer.concat([accumulator, chunk]);

        while (accumulator.length >= frameSize) {
            const frameBuf = accumulator.subarray(0, frameSize);
            accumulator = accumulator.subarray(frameSize);
            frameQueue.push({ index: frameCounter++, buffer: frameBuf });
        }

        // Ограничиваем очередь кадров (~2 секунды при 15 fps), чтобы не тратить память
        if (frameQueue.length >= 30 && !stdout.isPaused()) {
            stdout.pause();
        }
    });

    child.on("error", (err) => {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        try { stdout?.destroy(); } catch {}
        if (!killed) {
            onError?.(err);
        }
    });

    child.on("close", () => {
        isEof = true;
    });

    function tick() {
        if (killed || paused) return;

        // Ждем получения первого кадра для точной синхронизации времени старта
        if (startTime === null) {
            if (frameQueue.length === 0) {
                if (isEof) {
                    if (timer) {
                        clearInterval(timer);
                        timer = null;
                    }
                    try { stdout?.destroy(); } catch {}
                    onEnd?.();
                }
                return;
            }
            startTime = performance.now();
        }

        const now = performance.now();
        const elapsed = (now - startTime - totalPausedTime) / 1000;
        const targetFrameIndex = Math.floor(elapsed * fps);

        if (targetFrameIndex > displayedFrameIndex) {
            let frameToRender = null;

            // Выбираем актуальный кадр и отбрасываем устаревшие, если рендеринг отстал от таймера
            while (frameQueue.length > 0 && frameQueue[0].index <= targetFrameIndex) {
                const item = frameQueue.shift();
                if (item.index === targetFrameIndex || frameQueue.length === 0) {
                    frameToRender = item;
                }
            }

            if (frameToRender) {
                displayedFrameIndex = frameToRender.index;
                const text = rgb24ToHalfBlockBlessed(frameToRender.buffer, width, height);
                onFrame?.(text, displayedFrameIndex + 1);
            }

            // Если в буфере освободилось место, возобновляем чтение stdout
            if (frameQueue.length < 15 && stdout.isPaused()) {
                stdout.resume();
            }
        }

        // Проверяем окончание воспроизведения
        if (isEof && frameQueue.length === 0) {
            if (displayedFrameIndex >= frameCounter - 1) {
                if (timer) {
                    clearInterval(timer);
                    timer = null;
                }
                try { stdout?.destroy(); } catch {}
                onEnd?.();
            }
        }
    }

    timer = setInterval(tick, 10);
    if (typeof timer.unref === "function") {
        timer.unref();
    }

    return {
        pause() {
            if (!paused && !killed) {
                paused = true;
                pauseStartTime = performance.now();
                if (child && child.pid) {
                    try {
                        child.kill("SIGSTOP");
                    } catch {
                        // Игнорируем ошибку паузы
                    }
                }
            }
        },
        resume() {
            if (paused && !killed) {
                paused = false;
                if (pauseStartTime > 0) {
                    if (startTime !== null) {
                        totalPausedTime += performance.now() - pauseStartTime;
                    }
                    pauseStartTime = 0;
                }
                if (child && child.pid) {
                    try {
                        child.kill("SIGCONT");
                    } catch {
                        // Игнорируем ошибку возобновления
                    }
                }
            }
        },
        kill() {
            killed = true;
            paused = false;
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            try { stdout?.destroy(); } catch {}
            accumulator = Buffer.alloc(0);
            frameQueue.length = 0;
            if (child) {
                if (child.pid) {
                    try {
                        child.kill("SIGKILL");
                    } catch {
                        // Игнорируем ошибку завершения
                    }
                }
                child = null;
            }
        },
        isPaused() {
            return paused;
        }
    };
}

/**
 * Запускает фоновое воспроизведение звука для видеофайла.
 * На macOS использует встроенный afplay для нативных форматов, на других платформах — ffplay (если найден).
 * @param {string} videoPath
 * @param {object} [options]
 * @param {string} [options.ffplayPath]
 * @returns {{ pause: () => void, resume: () => void, kill: () => void }}
 */
export function spawnAudioPlayer(videoPath, { ffplayPath } = {}) {
    let child = null;
    let paused = false;
    let killed = false;

    const ext = path.extname(videoPath).toLowerCase();
    const isDarwin = process.platform === "darwin";
    const darwinNativeFormats = new Set([".mp4", ".mov", ".m4v", ".m4a", ".mp3", ".wav", ".aac", ".aiff"]);

    try {
        if (isDarwin && darwinNativeFormats.has(ext)) {
            child = spawn("afplay", [videoPath], { stdio: "ignore" });
        } else if (ffplayPath) {
            child = spawn(ffplayPath, ["-nodisp", "-autoexit", "-loglevel", "error", "-i", videoPath], { stdio: "ignore" });
        } else if (isDarwin) {
            child = spawn("afplay", [videoPath], { stdio: "ignore" });
        }
    } catch {
        // Игнорируем ошибки запуска аудиоплеера
    }

    if (child) {
        child.on("error", () => {
            // Игнорируем ошибки аудиоплеера (например, отсутствие звуковой дорожки)
        });
    }

    return {
        pause() {
            if (!paused && child && !killed) {
                paused = true;
                if (child.pid) {
                    try { child.kill("SIGSTOP"); } catch {}
                }
            }
        },
        resume() {
            if (paused && child && !killed) {
                paused = false;
                if (child.pid) {
                    try { child.kill("SIGCONT"); } catch {}
                }
            }
        },
        kill() {
            killed = true;
            if (child) {
                if (child.pid) {
                    try { child.kill("SIGKILL"); } catch {}
                }
                child = null;
            }
        }
    };
}

/**
 * Извлекает первый файл из ZIP-архива в памяти средствами стандартной библиотеки Node.js.
 * @param {Buffer} zipBuffer
 * @returns {{ name: string, data: Buffer }}
 */
export function extractFirstFileFromZip(zipBuffer) {
    let offset = 0;
    while (offset < zipBuffer.length - 30) {
        if (zipBuffer.readUInt32LE(offset) !== 0x04034b50) {
            offset++;
            continue;
        }
        const method = zipBuffer.readUInt16LE(offset + 8);
        const compressedSize = zipBuffer.readUInt32LE(offset + 18);
        const nameLen = zipBuffer.readUInt16LE(offset + 26);
        const extraLen = zipBuffer.readUInt16LE(offset + 28);
        const name = zipBuffer.toString("utf8", offset + 30, offset + 30 + nameLen);
        const dataStart = offset + 30 + nameLen + extraLen;
        const compData = zipBuffer.subarray(dataStart, dataStart + compressedSize);

        if (name.endsWith("/")) {
            offset = dataStart + compressedSize;
            continue;
        }

        let uncompData;
        if (method === 0) {
            uncompData = compData;
        } else if (method === 8) {
            uncompData = zlib.inflateRawSync(compData);
        } else {
            throw new Error(`Неподдерживаемый метод сжатия ZIP: ${method}`);
        }
        return { name, data: uncompData };
    }
    throw new Error("Файл не найден в ZIP-архиве");
}
