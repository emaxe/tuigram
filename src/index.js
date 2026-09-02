#!/usr/bin/env node
/**
 * TuiGram — Полнофункциональный TUI & CLI клиент Telegram.
 */
import { checkAuthStatus, loginInteractive } from "./telegram/auth.js";
import { connectClient } from "./telegram/client.js";
import { startTui } from "./ui/app.js";
import {
    cmdLogin,
    cmdDialogs,
    cmdHistory,
    cmdSend,
    cmdSendFile,
    cmdListen
} from "./cli/cliCommands.js";
import { cmdInit, cmdPaths } from "./cli/init.js";
import { cmdInstallVideo } from "./cli/videoSetup.js";
import { config } from "./config.js";
import { red, bold } from "colorette";

/**
 * Простой парсер аргументов командной строки.
 * @param {string[]} argv
 * @returns {{ positional: string[], flags: Record<string, string|boolean> }}
 */
function parseArgs(argv) {
    const positional = [];
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            const next = argv[i + 1];
            if (next && !next.startsWith("--")) {
                flags[key] = next;
                i++;
            } else {
                flags[key] = true;
            }
        } else if (arg.startsWith("-")) {
            const key = arg.slice(1);
            flags[key] = true;
        } else {
            positional.push(arg);
        }
    }
    return { positional, flags };
}

const HELP_TEXT = `
${bold("🚀 TuiGram — Терминальный клиент Telegram")}

${bold("Запуск TUI (по умолчанию):")}
  tuigram                        Запустить графический терминальный интерфейс (TUI)
  tuigram tui                    То же самое

${bold("Настройка:")}
  tuigram init                   Ввести ключи Telegram API (api_id / api_hash)
                                 --api-id <ID> --api-hash <HASH>  без диалога
  tuigram paths                  Показать пути к настройкам, сессии и загрузкам
  tuigram install-video          Установить ffmpeg и включить воспроизведение видео

${bold("Консольные команды (CLI):")}
  tuigram login                  Авторизация в аккаунте (телефон, код, 2FA)
  tuigram dialogs [--limit 50]   Список диалогов
  tuigram history <peer> [--limit 30]
                                 История сообщений (@username, ID, me)
  tuigram send <peer> <текст>    Отправить текстовое сообщение
  tuigram sendfile <peer> <путь> [<путь> ...]
                                 Отправить файл(ы); несколько путей уходят альбомом
                                 --caption "текст"  подпись
                                 --as-file          без сжатия, документом
  tuigram listen                 Слушать обновления в реальном времени

${bold("Примеры:")}
  tuigram send me "Привет из TuiGram!"
  tuigram history @durov --limit 20
  tuigram sendfile @friend ./document.pdf
  tuigram sendfile me ~/a.png ~/b.png --caption "Две картинки"
  tuigram sendfile me ~/photo.png --as-file
`;

async function main() {
    const { positional, flags } = parseArgs(process.argv.slice(2));

    if (flags.help || flags.h) {
        console.log(HELP_TEXT);
        return;
    }

    if (flags.version || flags.v) {
        console.log(`TuiGram v${config.version}`);
        return;
    }

    const command = positional[0]?.toLowerCase();

    switch (command) {
        case "init":
        case "setup":
            await cmdInit(flags);
            process.exit(0);
            break;
        case "paths":
        case "config":
            cmdPaths();
            process.exit(0);
            break;
        case "install-video":
        case "setup-video":
        case "install-deps":
            await cmdInstallVideo(flags);
            process.exit(0);
            break;
        case "login":
            await cmdLogin();
            process.exit(0);
            break;
        case "dialogs":
            await cmdDialogs(flags);
            process.exit(0);
            break;
        case "history":
            await cmdHistory(positional[1], flags);
            process.exit(0);
            break;
        case "send": {
            const peer = positional[1];
            const text = positional.slice(2).join(" ");
            await cmdSend(peer, text, flags);
            process.exit(0);
            break;
        }
        case "sendfile":
        case "send-file":
            await cmdSendFile(positional[1], positional.slice(2), flags);
            process.exit(0);
            break;
        case "listen":
            await cmdListen();
            break;
        case "help":
            console.log(HELP_TEXT);
            process.exit(0);
            break;
        case "version":
            console.log(`TuiGram v${config.version}`);
            process.exit(0);
            break;
        case "tui":
        default: {
            if (command && command !== "tui") {
                console.log(red(`\nНеизвестная команда: "${command}"`));
                console.log(HELP_TEXT);
                process.exit(1);
            }

            // Запуск TUI интерфейса
            let { authorized, me, client } = await checkAuthStatus();

            if (!authorized) {
                console.log(bold("\n🔑 Сессия не найдена. Требуется авторизация для входа в TuiGram:\n"));
                me = await loginInteractive();
                client = await connectClient();
            }

            if (!client) {
                client = await connectClient();
            }

            await startTui(client, me);
            break;
        }
    }
}

main().catch((err) => {
    console.error(red(`\nОшибка TuiGram: ${err?.message || err}`));
    process.exit(1);
});
