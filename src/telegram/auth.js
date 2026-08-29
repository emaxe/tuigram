import input from "input";
import { buildClient, readSession, saveSession, clearSession } from "./client.js";
import { config } from "../config.js";
import { entityCache } from "./entities.js";

/**
 * Проверяет текущий статус авторизации.
 * @returns {Promise<{ authorized: boolean, me: object|null, client: any|null }>}
 */
export async function checkAuthStatus() {
    const session = readSession();
    if (!session) {
        return { authorized: false, me: null, client: null };
    }

    try {
        const client = buildClient(session);
        await client.connect();
        const isAuth = await client.isUserAuthorized();
        if (isAuth) {
            const me = await client.getMe();
            if (me) {
                entityCache.set(me.id, me);
            }
            return { authorized: true, me, client };
        }
        await client.disconnect().catch(() => {});
        return { authorized: false, me: null, client: null };
    } catch {
        return { authorized: false, me: null, client: null };
    }
}

/**
 * Проверяет, что интерактивный ввод вообще возможен.
 *
 * Без TTY промис `input.text` не резолвится никогда: teleproto молча получает
 * пустой код (см. свой же try/catch вокруг `authParams.phoneCode`), а процесс
 * выходит с кодом 0, так и не авторизовавшись. Отсекаем это заранее — до
 * `client.start`, чтобы ошибка не превратилась внутри библиотеки
 * в невнятный AUTH_USER_CANCEL.
 *
 * @param {object} [callbacks] пользовательские промпты — с ними терминал не нужен
 * @param {boolean} [isTty] состояние stdin (параметром — ради тестируемости)
 */
export function assertInteractiveInput(callbacks = {}, isTty = process.stdin.isTTY) {
    const covered =
        Boolean(callbacks.getPhoneNumber) &&
        Boolean(callbacks.getPhoneCode) &&
        Boolean(callbacks.getPassword);

    if (covered || isTty) return;

    throw new Error(
        "Авторизация требует интерактивного терминала (stdin не подключён к TTY).\n" +
        "  • Запустите tuigram login вручную в терминале.\n" +
        "  • Либо перенесите готовый session.txt в директорию данных\n" +
        `    (${config.sessionPath}) — путь показывает команда tuigram paths.`
    );
}

/**
 * Интерактивный CLI-процесс авторизации.
 * @param {object} [callbacks]
 * @param {() => Promise<string>} [callbacks.getPhoneNumber]
 * @param {() => Promise<string>} [callbacks.getPassword]
 * @param {() => Promise<string>} [callbacks.getPhoneCode]
 * @param {(err: Error) => boolean} [callbacks.onError]
 * @returns {Promise<object>} возвращает объект авторизованного пользователя
 */
export async function loginInteractive(callbacks = {}) {
    config.assertCredentials();

    const existing = readSession();
    if (existing) {
        try {
            const client = buildClient(existing);
            await client.connect();
            if (await client.isUserAuthorized()) {
                const me = await client.getMe();
                console.log(`\nВы уже авторизованы как: ${me.firstName || ""} ${me.lastName || ""} (@${me.username || "без username"}), id=${me.id}`);
                // Без терминала спрашивать некого: действующая сессия — рабочий
                // результат, менять аккаунт молча мы не вправе.
                const reLogin = process.stdin.isTTY
                    ? await input.confirm("Хотите войти под другим аккаунтом?", { default: false })
                    : false;
                if (!reLogin) {
                    await client.disconnect().catch(() => {});
                    return me;
                }
            }
            await client.disconnect().catch(() => {});
        } catch {
            // Сессия недействительна — продолжаем логин
        }
    }

    // Дальше без диалога не обойтись: телефон, код из Telegram и, возможно, 2FA.
    assertInteractiveInput(callbacks);

    const client = buildClient("");

    const phonePrompt = callbacks.getPhoneNumber || (async () => await input.text("Введите номер телефона (+79991234567): "));
    const passPrompt = callbacks.getPassword || (async () => await input.password("Введите пароль двухфакторной аутентификации (2FA): "));
    const codePrompt = callbacks.getPhoneCode || (async () => await input.text("Введите код подтверждения из Telegram: "));

    await client.start({
        phoneNumber: phonePrompt,
        password: passPrompt,
        phoneCode: codePrompt,
        onError: callbacks.onError || ((err) => {
            console.error("Ошибка входа:", err?.message || err);
            return true;
        }),
    });

    const sessionString = client.session.save();
    saveSession(sessionString);

    const me = await client.getMe();
    if (me) {
        entityCache.set(me.id, me);
    }

    console.log(`\nУспешный вход! ${me.firstName || ""} ${me.lastName || ""} (@${me.username || "нет"}), ID: ${me.id}`);
    console.log(`Сессия сохранена в ${config.sessionPath}`);

    await client.disconnect().catch(() => {});
    return me;
}

/**
 * Завершает сеанс и удаляет локальную сессию.
 * @param {import("teleproto").TelegramClient} [client]
 */
export async function logout(client) {
    if (client) {
        try {
            await client.logOut();
        } catch {
            // Игнорируем сетевые ошибки логаута
        }
        await client.disconnect().catch(() => {});
    }
    clearSession();
}
