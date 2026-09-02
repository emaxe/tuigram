/**
 * Консольная команда установки и настройки зависимостей для воспроизведения видео.
 * Проверяет наличие ffmpeg, скачивает статическую сборку при необходимости
 * и активирует функционал ENABLE_VIDEO=true в файле настроек .env.
 */

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { bold, cyan, green, yellow, dim, red } from "colorette";
import { config } from "../config.js";
import { upsertEnv } from "./init.js";
import { findFfmpegPath, findFfplayPath, extractFirstFileFromZip } from "../utils/video.js";

/** Ссылки на стабильные статические сборки ffmpeg по платформам. */
const FFMPEG_URLS = {
    "darwin:x64": "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-osx-64.zip",
    "darwin:arm64": "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-osx-64.zip",
    "linux:x64": "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-linux-64.zip",
    "linux:arm64": "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-linux-arm-64.zip",
    "linux:arm": "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-linux-armel-32.zip",
    "win32:x64": "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-win-64.zip",
    "win32:ia32": "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-win-32.zip",
};

/**
 * Скачивает буфер по URL с поддержкой HTTP(S) редиректов.
 * @param {string} targetUrl
 * @param {number} [redirects=0]
 * @returns {Promise<Buffer>}
 */
function fetchBuffer(targetUrl, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 5) {
            return reject(new Error("Слишком много редиректов при загрузке"));
        }
        https.get(targetUrl, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchBuffer(res.headers.location, redirects + 1));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`Ошибка HTTP ${res.statusCode}: ${res.statusMessage}`));
            }
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve(Buffer.concat(chunks)));
            res.on("error", reject);
        }).on("error", reject);
    });
}

/**
 * Активирует флаг ENABLE_VIDEO=true в .env файлах.
 * @returns {string[]} список обновлённых файлов
 */
export function enableVideoInEnv() {
    const updated = [];
    const targets = [config.configEnvPath];

    const localEnv = path.join(config.packageRoot, ".env");
    if (fs.existsSync(localEnv) && localEnv !== config.configEnvPath) {
        targets.push(localEnv);
    }

    for (const target of targets) {
        try {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            let text = "";
            try {
                text = fs.readFileSync(target, "utf8");
            } catch {
                text = "# TuiGram настройки\n";
            }
            const newText = upsertEnv(text, { ENABLE_VIDEO: "true" });
            fs.writeFileSync(target, newText, { encoding: "utf8", mode: 0o600 });
            updated.push(target);
        } catch {
            // Игнорируем ошибку записи отдельного файла
        }
    }

    return updated;
}

/**
 * Консольная команда установки зависимостей для видео (`tuigram install-video`).
 * @param {Record<string, string|boolean>} [flags]
 * @returns {Promise<void>}
 */
export function cmdInstallVideo(flags = {}) {
    return (async () => {
        console.log(bold("\n🎬 TuiGram — Установка поддержки воспроизведения видео\n"));

        const existingFfmpeg = findFfmpegPath();
        const force = Boolean(flags.force);

        if (existingFfmpeg && !force) {
            console.log(green(`✓ ffmpeg обнаружен: ${existingFfmpeg}`));
            try {
                const ver = spawnSync(existingFfmpeg, ["-version"], { encoding: "utf8", timeout: 2000 });
                if (ver.stdout) {
                    const firstLine = ver.stdout.trim().split(/\r?\n/)[0];
                    console.log(dim(`  Версия: ${firstLine}`));
                }
            } catch {
                // Игнорируем
            }

            const updated = enableVideoInEnv();
            console.log(green("\n✓ Опция ENABLE_VIDEO=true активирована в .env!"));
            for (const file of updated) {
                console.log(dim(`  Файл: ${file}`));
            }

            printUsageInstructions();
            return;
        }

        const platformKey = `${process.platform}:${process.arch}`;
        const downloadUrl = FFMPEG_URLS[platformKey] || FFMPEG_URLS[`${process.platform}:x64`];

        if (!downloadUrl) {
            console.log(yellow(`Платформа ${platformKey} не поддерживает автоматическую загрузку бинарника.`));
            printManualInstallInstructions();
            return;
        }

        console.log(`Платформа: ${cyan(platformKey)}`);
        console.log(`Загрузка статической сборки ffmpeg из GitHub Releases...`);
        console.log(dim(`URL: ${downloadUrl}\n`));

        try {
            const zipBuffer = await fetchBuffer(downloadUrl);
            console.log(`✓ Загружено ${Math.round(zipBuffer.length / 1024 / 1024 * 10) / 10} MB. Распаковка...`);

            const { data } = extractFirstFileFromZip(zipBuffer);
            const binDir = path.join(config.dataDir, "bin");
            fs.mkdirSync(binDir, { recursive: true });

            const isWin = process.platform === "win32";
            const binaryName = isWin ? "ffmpeg.exe" : "ffmpeg";
            const destPath = path.join(binDir, binaryName);

            fs.writeFileSync(destPath, data, { mode: 0o755 });
            fs.chmodSync(destPath, 0o755);

            // Проверка запуска
            const testRun = spawnSync(destPath, ["-version"], { encoding: "utf8", timeout: 3000 });
            if (testRun.status !== 0) {
                throw new Error(`Бинарник не запустился (код ошибки: ${testRun.status})`);
            }

            console.log(green(`✓ ffmpeg успешно установлен: ${destPath}`));

            const updated = enableVideoInEnv();
            console.log(green("✓ Опция ENABLE_VIDEO=true активирована в .env!"));
            for (const file of updated) {
                console.log(dim(`  Файл: ${file}`));
            }

            printUsageInstructions();
        } catch (err) {
            console.error(red(`\nОшибка автоматической установки ffmpeg: ${err.message}`));
            printManualInstallInstructions();
        }
    })();
}

function printUsageInstructions() {
    console.log(bold("\n▶ Как воспроизводить видео в TuiGram:"));
    console.log("  1. Запустите TUI интерфейс: tuigram (или npm start)");
    console.log("  2. В ленте чата кликните мышью по превью видео");
    console.log("     или выберите сообщение и нажмите Enter → «Воспроизвести видео»");
    console.log("  3. Управление в плеере: [Пробел] — пауза/воспроизведение, [r] — с начала, [Esc] или [q] — закрыть.\n");
}

function printManualInstallInstructions() {
    console.log(bold("\n📦 Установка ffmpeg вручную через системный пакетный менеджер:"));
    console.log("  • macOS (Homebrew):     brew install ffmpeg");
    console.log("  • Ubuntu / Debian:       sudo apt update && sudo apt install -y ffmpeg");
    console.log("  • Arch Linux:            sudo pacman -S ffmpeg");
    console.log("  • Fedora:                sudo dnf install ffmpeg");
    console.log("  • Windows (winget):      winget install Gyan.FFmpeg\n");
    console.log("После установки добавьте в ваш .env файл:");
    console.log(cyan("  ENABLE_VIDEO=true\n"));
}
