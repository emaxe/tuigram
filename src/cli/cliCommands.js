import { connectClient, withClient } from "../telegram/client.js";
import { loginInteractive } from "../telegram/auth.js";
import { fetchDialogs } from "../telegram/dialogs.js";
import { fetchHistory, sendMessage, sendFiles } from "../telegram/messages.js";
import { inspectLocalFile } from "../utils/storage.js";
import { formatFileSize } from "../utils/time.js";
import { startTelegramListener } from "../telegram/listener.js";
import { formatDialogRow, formatHistoryMessage, formatStreamEvent } from "./formatters.js";
import { green, bold, red, yellow } from "colorette";

/**
 * Авторизация в аккаунте через CLI.
 */
export async function cmdLogin() {
    console.log(bold("\n🔑 Интерактивная авторизация в Telegram:\n"));
    await loginInteractive();
}

/**
 * Вывод списка диалогов в консоль.
 * @param {object} flags
 */
export async function cmdDialogs(flags) {
    await withClient(async (client) => {
        const limit = flags.limit ? parseInt(flags.limit, 10) : 50;
        const archived = flags.archived === true ? true : undefined;

        console.log(bold(`\n📂 Загрузка диалогов (макс. ${limit})...\n`));
        const dialogs = await fetchDialogs(client, { limit, archived });

        for (const d of dialogs) {
            console.log(formatDialogRow(d));
        }

        console.log(gray(`\nВсего получено: ${dialogs.length} диалогов\n`));
    });
}

/**
 * Вывод истории сообщений чата.
 * @param {string} peer
 * @param {object} flags
 */
export async function cmdHistory(peer, flags) {
    if (!peer) {
        throw new Error("Укажите идентификатор чата: tuigram history <@username | -100... | me>");
    }

    await withClient(async (client) => {
        const limit = flags.limit ? parseInt(flags.limit, 10) : 30;
        console.log(bold(`\n💬 Загрузка истории для ${peer} (макс. ${limit} сообщений)...\n`));

        const result = await fetchHistory(client, peer, { limit });
        const messages = [...result.messages].reverse();

        for (const m of messages) {
            console.log(formatHistoryMessage(m));
        }

        console.log(gray(`\nВсего отображено: ${messages.length} сообщений\n`));
    });
}

/**
 * Отправка текстового сообщения из CLI.
 * @param {string} peer
 * @param {string} text
 * @param {object} flags
 */
export async function cmdSend(peer, text, flags) {
    if (!peer || !text) {
        throw new Error("Использование: tuigram send <@username|me|id> <текст сообщения>");
    }

    await withClient(async (client) => {
        const replyTo = flags.reply ? parseInt(flags.reply, 10) : undefined;
        console.log(yellow(`Отправка сообщения в ${peer}...`));
        const sent = await sendMessage(client, peer, text, { replyTo });
        console.log(green(`✓ Сообщение успешно отправлено! (ID: ${sent.id})`));
    });
}

/**
 * Отправка файла из CLI.
 * @param {string} peer
 * @param {string} filePath
 * @param {object} flags
 */
export async function cmdSendFile(peer, filePaths, flags) {
    const rawPaths = (Array.isArray(filePaths) ? filePaths : [filePaths]).filter(Boolean);
    if (!peer || rawPaths.length === 0) {
        throw new Error(
            "Использование: tuigram sendfile <@username|me|id> <путь> [ещё_путь ...] [--caption \"текст\"] [--as-file]"
        );
    }

    // Валидируем до подключения: понятная ошибка вместо сетевой
    const files = [];
    for (const raw of rawPaths) {
        const info = inspectLocalFile(raw);
        if (!info.ok) throw new Error(info.error);
        files.push(info);
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const label = files.length === 1 ? files[0].name : `${files.length} файлов`;

    await withClient(async (client) => {
        const caption = flags.caption || "";
        const forceDocument = Boolean(flags["as-file"] || flags.document);

        console.log(yellow(`Отправка ${label} (${formatFileSize(totalSize)}) в ${peer}...`));

        let lastPercent = -1;
        const progressCallback = (progress) => {
            const percent = Math.min(99, Math.round((progress || 0) * 100));
            if (percent === lastPercent) return;
            lastPercent = percent;
            process.stdout.write(`\rЗагрузка: ${percent}%   `);
        };

        const sent = await sendFiles(client, peer, files.map((f) => f.filePath), {
            caption,
            forceDocument,
            progressCallback,
        });

        process.stdout.write("\r                    \r");
        const ids = sent.map((m) => m.id).join(", ");
        console.log(green(`✓ Успешно отправлено! (ID: ${ids})`));
    });
}

/**
 * Режим непрерывного прослушивания живых событий в консоли.
 */
export async function cmdListen() {
    const client = await connectClient();
    const me = await client.getMe();

    console.log(green(bold(`\n🟢 Подключено как: ${me.firstName || ""} ${me.lastName || ""} (@${me.username || me.id})`)));
    console.log(yellow("Слушаю обновления в реальном времени... Нажмите Ctrl+C для выхода.\n"));

    const listener = startTelegramListener(client);

    listener.on("new_message", (data) => console.log(formatStreamEvent("new_message", data)));
    listener.on("edited_message", (data) => console.log(formatStreamEvent("edited_message", data)));
    listener.on("deleted_messages", (data) => console.log(formatStreamEvent("deleted_messages", data)));
    listener.on("typing", (data) => console.log(formatStreamEvent("typing", data)));

    const shutdown = async () => {
        console.log(yellow("\nОстановка слушателя..."));
        listener.stop();
        await client.disconnect().catch(() => {});
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

function gray(text) {
    return `\x1b[90m${text}\x1b[0m`;
}
