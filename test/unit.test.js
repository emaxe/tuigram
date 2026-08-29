import assert from "node:assert/strict";
import { parsePeer, idToString, toMarkedId, detectChatType, getEntityDisplayName } from "../src/telegram/entities.js";
import { Api } from "teleproto";
import { formatMessageText, escapeBlessed, describeMedia, setMessagePalette } from "../src/telegram/formatter.js";
import { getTheme, themes } from "../src/ui/theme.js";
import { formatChatTime, formatMessageTime, formatDateDivider, formatFileSize, formatDuration } from "../src/utils/time.js";
import { upsertEnv, escapeEnvValue, isValidApiId, isValidApiHash, saveCredentials } from "../src/cli/init.js";
import { assertInteractiveInput } from "../src/telegram/auth.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

console.log("▶ Запуск юнит-тестов TuiGram...");

// 1. Тесты утилит времени
{
    assert.equal(formatFileSize(1024), "1.0 KB");
    assert.equal(formatFileSize(1024 * 1024 * 5.5), "5.5 MB");
    assert.equal(formatDuration(45), "0:45");
    assert.equal(formatDuration(125), "2:05");
    assert.equal(formatDuration(3665), "1:01:05");

    const fixedDate = new Date("2026-08-29T12:30:00Z");
    assert.ok(formatMessageTime(fixedDate).length > 0);
    assert.ok(formatDateDivider(fixedDate).includes("2026"));
    console.log("  ✓ time.js tests passed");
}

// 2. Тесты entities
{
    assert.equal(parsePeer("me"), "me");
    assert.equal(parsePeer("self"), "me");
    assert.equal(parsePeer("durov"), "@durov");
    assert.equal(parsePeer("@durov"), "@durov");
    assert.equal(parsePeer("-1001234567890"), -1001234567890n);

    assert.equal(idToString(12345n), "12345");
    assert.equal(idToString({ userId: "9988" }), "9988");

    assert.equal(detectChatType({ isUser: true }), "user");
    assert.equal(detectChatType({ isUser: true, entity: { bot: true } }), "bot");
    assert.equal(detectChatType({ isChannel: true, entity: { broadcast: true } }), "channel");
    assert.equal(detectChatType({ isChannel: true, entity: { broadcast: false } }), "supergroup");
    assert.equal(detectChatType({ isSelf: true }), "saved");

    assert.equal(getEntityDisplayName({ firstName: "Pavel", lastName: "Durov" }), "Pavel Durov");
    assert.equal(getEntityDisplayName({ username: "durov" }), "@durov");
    assert.equal(getEntityDisplayName({ isSelf: true }), "Избранное (Saved Messages)");

    // ID сообщения должен совпадать с dialog.id, а тот у teleproto "маркированный"
    assert.equal(toMarkedId(new Api.PeerUser({ userId: 123n })), "123");
    assert.equal(toMarkedId(new Api.PeerChat({ chatId: 456n })), "-456");
    assert.equal(toMarkedId(new Api.PeerChannel({ channelId: 789n })), "-100789");
    assert.equal(toMarkedId(null), "");
    assert.equal(toMarkedId("-1001234567890"), "-1001234567890");
    console.log("  ✓ entities.js tests passed");
}

// 3. Тесты форматтера разметки
{
    assert.equal(escapeBlessed("Hello {world}"), "Hello \\{world\\}");

    const raw = "Hello bold world";
    const entities = [{ className: "MessageEntityBold", offset: 6, length: 4 }];
    const formatted = formatMessageText(raw, entities);
    assert.equal(formatted, "Hello {bold}bold{/bold} world");

    // Цвета разметки берутся из палитры темы, поэтому проверяем структуру,
    // а не конкретные значения
    const codeRaw = "Use npm start command";
    const codeEntities = [{ className: "MessageEntityCode", offset: 4, length: 9 }];
    const formattedCode = formatMessageText(codeRaw, codeEntities);
    assert.match(formattedCode, /^Use \{[^}]+-fg\}\{[^}]+-bg\}npm start\{\/[^}]+-bg\}\{\/[^}]+-fg\} command$/);

    const photoMedia = { className: "MessageMediaPhoto" };
    assert.ok(describeMedia(photoMedia).includes("Фотография"));

    // setMessagePalette подменяет цвета активной темой
    setMessagePalette(getTheme("nord"));
    const nordCode = formatMessageText(codeRaw, codeEntities);
    assert.ok(nordCode.includes(themes.nord.warning), "палитра nord не применилась к коду");
    setMessagePalette(getTheme("light"));
    assert.ok(formatMessageText(codeRaw, codeEntities).includes(themes.light.warning));
    setMessagePalette(getTheme("default"));
    assert.ok(formatMessageText(codeRaw, codeEntities).includes(themes.default.warning));

    console.log("  ✓ formatter.js tests passed");
}

// 4. Тесты геометрии TUI (blessed рисует только то, чему хватило строк)
{
    const { createHeader } = await import("../src/ui/components/header.js");
    const { createInputBox } = await import("../src/ui/components/inputBox.js");
    const { createChatList } = await import("../src/ui/components/chatList.js");
    const { getTheme } = await import("../src/ui/theme.js");
    const blessed = (await import("neo-blessed")).default;
    const fs = await import("node:fs");

    // Экран на фейковом TTY — тесты должны работать в CI без терминала
    const output = fs.createWriteStream("/dev/null");
    output.isTTY = true;
    output.columns = 120;
    output.rows = 40;
    const { PassThrough } = await import("node:stream");
    const input = new PassThrough();
    input.isTTY = true;
    input.setRawMode = () => {};

    const screen = blessed.screen({
        smartCSR: true,
        fullUnicode: true,
        input,
        output,
        terminal: "xterm-256color",
    });
    const theme = getTheme("default");

    const header = createHeader(screen, theme);
    assert.equal(header.height - header.iheight, 2, "шапке нужны 2 внутренние строки");

    const inputBox = createInputBox(screen, theme, {});
    assert.ok(inputBox.textarea.height >= 1, "поле ввода не должно быть нулевой высоты");
    assert.equal(inputBox.textarea.height, 2);

    const chatList = createChatList(screen, theme, {});
    chatList.setDialogs([
        {
            id: "1",
            type: "user",
            title: "Pavel Durov",
            pinned: true,
            unreadCount: 3,
            date: Date.now(),
            lastMessage: { text: "Первая строка\nвторая строка" },
        },
    ]);
    const item = chatList.list.getItem(0).getContent();
    assert.ok(!item.includes("\n"), "элемент списка чатов должен быть однострочным");
    assert.ok(item.includes("Pavel Durov"));
    assert.ok(item.includes("[3]"));

    screen.destroy();
    console.log("  ✓ ui geometry tests passed");
}

// 5. Тесты работы с локальными путями (отправка файлов)
{
    const os = await import("node:os");
    const fsp = await import("node:fs");
    const nodePath = await import("node:path");
    const { resolveLocalPath, inspectLocalFile, detectFileKind } = await import("../src/utils/storage.js");
    const { parseSendFileArgs } = await import("../src/utils/commands.js");

    const home = os.homedir();

    // Раскрытие "~", кавычек и shell-экранирования
    assert.equal(resolveLocalPath("~/x.png"), nodePath.join(home, "x.png"));
    assert.equal(resolveLocalPath("~"), home);
    assert.equal(resolveLocalPath('"/tmp/a b.png"'), "/tmp/a b.png");
    assert.equal(resolveLocalPath("'/tmp/a b.png'"), "/tmp/a b.png");
    assert.equal(resolveLocalPath("/tmp/a\\ b.png"), "/tmp/a b.png");
    assert.equal(resolveLocalPath(""), "");
    assert.equal(resolveLocalPath("   "), "");
    assert.ok(nodePath.isAbsolute(resolveLocalPath("./package.json")));
    // Windows-путь не должен покалечиться снятием экранирования
    assert.ok(resolveLocalPath("C:\\Users\\x").endsWith("C:\\Users\\x"));

    // Определение того, чем Telegram покажет файл
    assert.equal(detectFileKind("a.png"), "photo");
    assert.equal(detectFileKind("a.JPG"), "photo");
    assert.equal(detectFileKind("a.jpeg"), "photo");
    assert.equal(detectFileKind("a.mp4"), "video");
    assert.equal(detectFileKind("a.pdf"), "document");
    assert.equal(detectFileKind("a.webp"), "document"); // teleproto шлёт webp документом

    // Валидация файла
    const tmpDir = fsp.mkdtempSync(nodePath.join(os.tmpdir(), "tuigram-test-"));
    const okFile = nodePath.join(tmpDir, "photo.png");
    const emptyFile = nodePath.join(tmpDir, "empty.png");
    fsp.writeFileSync(okFile, "x".repeat(2048));
    fsp.writeFileSync(emptyFile, "");

    const good = inspectLocalFile(okFile);
    assert.equal(good.ok, true);
    assert.equal(good.name, "photo.png");
    assert.equal(good.size, 2048);
    assert.equal(good.kind, "photo");

    assert.match(inspectLocalFile("").error, /Не указан путь/);
    assert.match(inspectLocalFile(nodePath.join(tmpDir, "нет.png")).error, /Файл не найден/);
    assert.match(inspectLocalFile(tmpDir).error, /Это папка/);
    assert.match(inspectLocalFile(emptyFile).error, /пустой/);

    fsp.rmSync(tmpDir, { recursive: true, force: true });

    // Разбор /sendfile путь [| путь] [-- подпись]
    assert.deepEqual(parseSendFileArgs("~/a.png"), { paths: ["~/a.png"], caption: "" });
    assert.deepEqual(parseSendFileArgs("~/a.png -- Вот картинка"), {
        paths: ["~/a.png"],
        caption: "Вот картинка",
    });
    assert.deepEqual(parseSendFileArgs("~/a.png | ~/b.png -- Две штуки"), {
        paths: ["~/a.png", "~/b.png"],
        caption: "Две штуки",
    });
    // Путь с пробелами не должен разваливаться
    assert.deepEqual(parseSendFileArgs("~/Мои файлы/отчёт.pdf -- Отчёт"), {
        paths: ["~/Мои файлы/отчёт.pdf"],
        caption: "Отчёт",
    });
    // Подпись сама может содержать "--"
    assert.deepEqual(parseSendFileArgs("~/a.png -- тире -- внутри"), {
        paths: ["~/a.png"],
        caption: "тире -- внутри",
    });
    assert.deepEqual(parseSendFileArgs(["~/a.png", "--", "из", "массива"]), {
        paths: ["~/a.png"],
        caption: "из массива",
    });
    assert.deepEqual(parseSendFileArgs(""), { paths: [], caption: "" });

    console.log("  ✓ file path & command parsing tests passed");
}

// 6. Тесты модалки отправки файла (геометрия, кольцо фокуса, валидация)
{
    const os = await import("node:os");
    const fsp = await import("node:fs");
    const nodePath = await import("node:path");
    const { createFileModal } = await import("../src/ui/components/modals/fileModal.js");
    const { getTheme } = await import("../src/ui/theme.js");
    const blessed = (await import("neo-blessed")).default;

    const output = fsp.createWriteStream("/dev/null");
    output.isTTY = true;
    output.columns = 120;
    output.rows = 40;
    const { PassThrough } = await import("node:stream");
    const input = new PassThrough();
    input.isTTY = true;
    input.setRawMode = () => {};

    const screen = blessed.screen({
        smartCSR: true,
        fullUnicode: true,
        input,
        output,
        terminal: "xterm-256color",
    });
    const theme = getTheme("default");

    let sentFiles = null;
    const fileModal = createFileModal(screen, theme, {
        onSendFile: (files, options) => {
            sentFiles = { files, options };
        },
    });

    fileModal.show();

    // Ни один элемент не должен схлопнуться в нулевую высоту
    const parts = {
        pathInput: fileModal.pathInput,
        captionInput: fileModal.captionInput,
        asDocumentCheck: fileModal.asDocumentCheck,
        statusLine: fileModal.statusLine,
    };
    for (const [name, el] of Object.entries(parts)) {
        assert.ok(el.height >= 1, `${name} схлопнулся в нулевую высоту`);
    }
    // Поля не должны накладываться друг на друга
    assert.ok(fileModal.captionInput.top > fileModal.pathInput.top);
    assert.ok(fileModal.asDocumentCheck.top > fileModal.captionInput.top);
    assert.ok(fileModal.statusLine.top > fileModal.asDocumentCheck.top);

    // Кольцо фокуса из 5 элементов; Tab не должен оставлять "\t" в значении
    const ringOrder = [];
    for (let i = 0; i < 5; i++) {
        input.write("\t");
        await new Promise((r) => setTimeout(r, 40));
        ringOrder.push(screen.focused?.type);
    }
    assert.equal(ringOrder.length, 5);
    assert.ok(!fileModal.pathInput.getValue().includes("\t"), "Tab попал в значение поля пути");
    assert.ok(!fileModal.captionInput.getValue().includes("\t"), "Tab попал в подпись");

    // Ctrl+D переключает "как файл" и не попадает в значение
    fileModal.pathInput.focus();
    await new Promise((r) => setTimeout(r, 40));
    const before = Boolean(fileModal.asDocumentCheck.checked);
    input.write("\x04");
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(Boolean(fileModal.asDocumentCheck.checked), !before, "Ctrl+D не переключил чекбокс");
    assert.ok(!fileModal.pathInput.getValue().includes("\x04"));

    // Ошибка валидации НЕ затирает введённый путь
    const missing = nodePath.join(os.tmpdir(), "tuigram-нет-такого.png");
    fileModal.pathInput.setValue(missing);
    fileModal.captionInput.setValue("");
    fileModal.asDocumentCheck.uncheck();
    fileModal.pathInput.emit("submit");
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(fileModal.pathInput.getValue(), missing, "путь затёрся сообщением об ошибке");
    assert.match(fileModal.statusLine.getContent(), /не найден/i);

    // Успешная валидация: сводка с именем, размером и способом отправки
    const tmpDir = fsp.mkdtempSync(nodePath.join(os.tmpdir(), "tuigram-modal-"));
    const photo = nodePath.join(tmpDir, "photo.png");
    fsp.writeFileSync(photo, "x".repeat(1024));
    fileModal.pathInput.setValue(photo);
    fileModal.pathInput.emit("submit");
    await new Promise((r) => setTimeout(r, 40));
    assert.match(fileModal.statusLine.getContent(), /photo\.png/);
    assert.match(fileModal.statusLine.getContent(), /1\.0 KB/);
    assert.match(fileModal.statusLine.getContent(), /как фото/);

    // Отправка отдаёт наверх разобранные файлы и опции
    fileModal.captionInput.setValue("подпись");
    fileModal.captionInput.emit("submit");
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(sentFiles, "onSendFile не вызвался");
    assert.equal(sentFiles.files.length, 1);
    assert.equal(sentFiles.files[0].filePath, photo);
    assert.equal(sentFiles.options.caption, "подпись");
    assert.equal(sentFiles.options.asDocument, false);

    // Несколько путей через "|" собираются в альбом
    sentFiles = null;
    const photo2 = nodePath.join(tmpDir, "second.jpg");
    fsp.writeFileSync(photo2, "y".repeat(2048));
    fileModal.show();
    fileModal.pathInput.setValue(`${photo} | ${photo2}`);
    fileModal.pathInput.emit("submit");
    await new Promise((r) => setTimeout(r, 40));
    assert.match(fileModal.statusLine.getContent(), /Альбом из 2 файлов/);
    fileModal.captionInput.emit("submit");
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(sentFiles.files.length, 2);

    fsp.rmSync(tmpDir, { recursive: true, force: true });
    screen.destroy();
    console.log("  ✓ file modal tests passed");
}

// 7. Тесты цветовой схемы: контраст и отсутствие «невидимого» текста
{
    const { themes } = await import("../src/ui/theme.js");
    const blessedColors = (await import("neo-blessed/lib/colors.js")).default;

    /**
     * Цвет, который реально увидит пользователь: blessed сводит hex к ближайшему
     * цвету xterm-256, поэтому контраст надо считать по результату конверсии.
     */
    function rendered(hex) {
        return blessedColors.vcolors[blessedColors.convert(hex)];
    }
    /** Относительная яркость по WCAG. */
    function luminance(rgb) {
        const [r, g, b] = rgb.map((v) => v / 255);
        const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    }
    /** Коэффициент контраста WCAG (1..21) для пары hex-цветов после конверсии. */
    function contrast(a, b) {
        const [hi, lo] = [luminance(rendered(a)), luminance(rendered(b))].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
    }

    for (const [name, theme] of Object.entries(themes)) {
        // Все цвета должны быть hex: именованные занимают первые 16 индексов
        // xterm и в каждом терминале выглядят по-разному (синий рисовался бирюзовым)
        const walk = (node, trail) => {
            for (const [key, value] of Object.entries(node)) {
                if (typeof value === "object" && value !== null) walk(value, `${trail}.${key}`);
                else if (typeof value === "string" && key !== "name") {
                    assert.match(value, /^#[0-9a-f]{6}$/i, `${name}${trail}.${key} = ${value} — не hex`);
                    // Индексы 0-15 терминал перекрашивает своей темой: именно из-за
                    // этого "blue" рисовался бирюзовым, а серый текст пропадал
                    const index = blessedColors.convert(value);
                    assert.ok(
                        index >= 16,
                        `${name}${trail}.${key} = ${value} сводится к индексу ${index} — его перекрасит тема терминала`
                    );
                }
            }
        };
        walk(theme, "");

        // Пары «текст на фоне», которые обязаны читаться
        const pairs = [
            ["текст на фоне", theme.fg, theme.bg],
            ["шапка", theme.header.fg, theme.header.bg],
            ["модалка", theme.modal.fg, theme.modal.bg],
            ["подсказка в модалке", theme.modal.hintFg, theme.modal.bg],
            ["папки в браузере файлов", theme.picker.dirFg, theme.modal.bg],
            ["файлы в браузере файлов", theme.picker.fileFg, theme.modal.bg],
            ["симлинки в браузере файлов", theme.picker.linkFg, theme.modal.bg],
            ["поле ввода в модалке", theme.modal.inputFg, theme.modal.inputBg],
            ["кнопка «Отправить»", theme.modal.buttonFg, theme.modal.buttonBg],
            ["кнопка «Отмена»", theme.modal.dangerFg, theme.modal.dangerBg],
            ["выбранный чат", theme.chatList.selectedFg, theme.chatList.selectedBg],
            ["превью чата", theme.chatList.previewFg, theme.chatList.bg],
            ["время в списке", theme.chatList.timeFg, theme.chatList.bg],
            ["бейдж непрочитанных", theme.chatList.itemUnreadFg, theme.chatList.itemUnreadBg],
            ["активная вкладка", theme.tabs.activeFg, theme.tabs.activeBg],
            ["неактивная вкладка", theme.tabs.fg, theme.tabs.bg],
            ["имя собеседника", theme.chatView.incomingName, theme.chatView.bg],
            ["своё имя", theme.chatView.outgoingName, theme.chatView.bg],
            ["время сообщения", theme.chatView.time, theme.chatView.bg],
            ["подсказка в поле ввода", theme.input.contextFg, theme.input.contextBg],
            ["плашка ответа", theme.input.replyFg, theme.input.replyBg],
            ["плашка правки", theme.input.editFg, theme.input.editBg],
            ["код в сообщении", theme.warning, theme.surfaceHigh],
            ["текст на приподнятой поверхности", theme.fg, theme.surface],
            ["статус-бар", theme.status.fg, theme.status.bg],
            ["ошибка в статус-баре", theme.error, theme.status.bg],
            ["успех в статус-баре", theme.success, theme.status.bg],
        ];

        for (const [label, front, back] of pairs) {
            const ratio = contrast(front, back);
            assert.ok(
                ratio >= 3,
                `тема "${name}": ${label} — контраст ${ratio.toFixed(2)} (${front} на ${back}), нужно >= 3`
            );
        }
    }

    console.log(`  ✓ theme contrast tests passed (${Object.keys(themes).length} темы)`);
}

// 8. Тесты строки списка чатов: никаких переносов и обрезанных бейджей
{
    const fsp = await import("node:fs");
    const { PassThrough } = await import("node:stream");
    const blessed = (await import("neo-blessed")).default;
    const unicode = (await import("neo-blessed/lib/unicode.js")).default;
    const { createChatList } = await import("../src/ui/components/chatList.js");
    const { getTheme } = await import("../src/ui/theme.js");
    const { normalizeDialog } = await import("../src/telegram/dialogs.js");

    const output = fsp.createWriteStream("/dev/null");
    output.isTTY = true;
    output.columns = 96;
    output.rows = 24;
    const input = new PassThrough();
    input.isTTY = true;
    input.setRawMode = () => {};

    const screen = blessed.screen({
        smartCSR: true,
        fullUnicode: true,
        dockBorders: true,
        input,
        output,
        terminal: "xterm-256color",
    });
    const chatList = createChatList(screen, getTheme("default"), {});
    const now = Date.now();

    chatList.setDialogs([
        // Эмодзи в превью: терминал рисует их в две ячейки, blessed — в одну
        { id: "0", type: "supergroup", title: "НЕЙРОДВИЖ", unreadCount: 12, date: now,
          lastMessage: { text: "Фермер 🧑НЕЙРОДВИЖ 🐝подсказал" } },
        { id: "1", type: "supergroup", title: "Чат лабы", unreadCount: 3, date: now,
          lastMessage: { text: "любая подойдет, главное" } },
        // Длинное название + трёхзначный счётчик — самый тесный случай
        { id: "2", type: "supergroup", title: "Тихон | Помогаю разрабам", unreadCount: 289, date: now,
          lastMessage: { text: "что-то" } },
        // Эмодзи в самом названии
        { id: "3", type: "channel", title: "🎬 Кино 🍿 и 🎭 театр", unreadCount: 724, date: now,
          lastMessage: { text: "🎉🎊🥳 премьера" } },
        { id: "4", type: "user", title: "Rafik", unreadCount: 0, date: now,
          lastMessage: { text: "Классный плакат! 🎨Советская пропаганда" } },
        { id: "5", type: "channel", title: "Mash", unreadCount: 99999, date: now,
          lastMessage: { text: "🎬 Видео" } },
    ]);
    screen.render();

    const plain = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");

    chatList.list.items.forEach((item, i) => {
        const raw = chatList.list.ritems[i];
        const drawn = plain(item._clines.join(""));

        // Перенос на вторую строку = хвост исчезает, а фон бейджа заливает
        // остаток строки до края панели
        assert.equal(item._clines.length, 1, `строка ${i} перенеслась: ${JSON.stringify(raw)}`);

        // Счётчик непрочитанных не должен обрезаться
        const badge = (raw.match(/\[\d+\]/) || [])[0];
        if (badge) {
            assert.ok(drawn.includes(badge), `строка ${i}: бейдж ${badge} обрезан (${JSON.stringify(drawn)})`);
        }

        // Ничего не вылезает за пределы элемента
        assert.ok(
            unicode.strWidth(drawn) <= item.width,
            `строка ${i}: ширина ${unicode.strWidth(drawn)} > ${item.width}`
        );

        // Фон бейджа обязан закрываться, иначе им зальётся хвост строки
        const opens = (item._clines[0].match(/\x1b\[48;5;\d+m/g) || []).length;
        const closes = (item._clines[0].match(/\x1b\[49m/g) || []).length;
        assert.ok(opens <= closes, `строка ${i}: фон бейджа не закрыт`);
    });

    // Превью медиа не должно показывать литеральную разметку blessed:
    // цвета стали hex-ными, и старая регулярка их не срезала
    const mediaDialog = normalizeDialog({
        id: 1n,
        entity: { className: "Chat", id: 1n, title: "Канал" },
        message: { id: 5, date: Math.floor(now / 1000), media: { className: "MessageMediaPhoto" } },
    });
    assert.ok(
        !/\{|\}/.test(mediaDialog.lastMessage.text),
        `в превью осталась разметка: ${JSON.stringify(mediaDialog.lastMessage.text)}`
    );
    assert.ok(mediaDialog.lastMessage.text.includes("Фотография"));

    screen.destroy();
    console.log("  ✓ chat list row tests passed");
}

// ─── Конфигурация пакета: запись пользовательского .env ───────────────────────
{
    // Валидация ключей: api_id — число, api_hash — 32 hex-символа
    assert.ok(isValidApiId("1234567"));
    assert.ok(isValidApiId("  1234567  "), "пробелы по краям должны срезаться");
    assert.ok(!isValidApiId("not-a-number"));
    assert.ok(!isValidApiId(""));
    assert.ok(!isValidApiId(undefined), "EOF даёт undefined — не должен проходить как валидный");

    assert.ok(isValidApiHash("fedcba9876543210fedcba9876543210"));
    assert.ok(isValidApiHash("FEDCBA9876543210FEDCBA9876543210"), "регистр не важен");
    assert.ok(!isValidApiHash("fedcba"), "слишком короткий");
    assert.ok(!isValidApiHash("zedcba9876543210fedcba9876543210"), "не hex");

    // Значения без спецсимволов пишутся как есть, остальные — в кавычках
    assert.equal(escapeEnvValue("1234567"), "1234567");
    assert.equal(escapeEnvValue(' a "b" '), '"a \\"b\\""');

    // upsertEnv заменяет существующий ключ и не плодит дубликаты
    const before = "# коммент\nTELEGRAM_API_ID=111\nTUI_THEME=nord\n";
    const after = upsertEnv(before, { TELEGRAM_API_ID: "222", TELEGRAM_API_HASH: "a".repeat(32) });
    assert.equal((after.match(/^TELEGRAM_API_ID=/gm) || []).length, 1, "ключ продублирован");
    assert.ok(after.includes("TELEGRAM_API_ID=222"));
    assert.ok(after.includes("TUI_THEME=nord"), "чужие настройки должны сохраняться");
    assert.ok(after.includes("# коммент"), "комментарии пользователя должны сохраняться");

    // saveCredentials пишет файл с правами 0600 и создаёт директорию
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tuigram-test-"));
    const target = path.join(tmpDir, "nested", ".env");
    saveCredentials("7654321", "fedcba9876543210fedcba9876543210", target);

    const written = fs.readFileSync(target, "utf8");
    assert.ok(written.includes("TELEGRAM_API_ID=7654321"));
    assert.ok(written.includes("TELEGRAM_API_HASH=fedcba9876543210fedcba9876543210"));
    if (process.platform !== "win32") {
        assert.equal(fs.statSync(target).mode & 0o777, 0o600, "секреты должны быть 0600");
    }

    // Повторный вызов перезаписывает ключи, сохраняя права и не дублируя строки
    saveCredentials("1112223", "0123456789abcdef0123456789abcdef", target);
    const rewritten = fs.readFileSync(target, "utf8");
    assert.equal((rewritten.match(/^TELEGRAM_API_ID=/gm) || []).length, 1);
    assert.ok(rewritten.includes("TELEGRAM_API_ID=1112223"));
    if (process.platform !== "win32") {
        assert.equal(fs.statSync(target).mode & 0o777, 0o600, "права должны остаться 0600 после перезаписи");
    }

    // Некорректные значения не должны попадать в файл
    assert.throws(() => saveCredentials("abc", "fedcba9876543210fedcba9876543210", target));
    assert.throws(() => saveCredentials("123", "short", target));

    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log("  \u2713 package config tests passed");
}

// ─── Авторизация: требование интерактивного терминала ─────────────────────────
{
    const allCallbacks = {
        getPhoneNumber: async () => "+70000000000",
        getPhoneCode: async () => "12345",
        getPassword: async () => "secret"
    };

    // С TTY диалог возможен — вопросов нет
    assert.doesNotThrow(() => assertInteractiveInput({}, true));

    // Без TTY и без колбэков ввод невозможен: должна быть внятная ошибка,
    // иначе процесс молча зависает на неразрешимом промисе input.text
    assert.throws(
        () => assertInteractiveInput({}, false),
        /интерактивного терминала/,
        "без TTY авторизация обязана падать с объяснением"
    );

    // Свои промпты (например, из TUI или тестов) снимают требование TTY
    assert.doesNotThrow(() => assertInteractiveInput(allCallbacks, false));

    // Частично заданные колбэки не спасают: недостающий промпт всё равно
    // упрётся в отсутствующий терминал
    assert.throws(() => assertInteractiveInput({ getPhoneNumber: allCallbacks.getPhoneNumber }, false));
    assert.throws(
        () => assertInteractiveInput(
            { getPhoneNumber: allCallbacks.getPhoneNumber, getPhoneCode: allCallbacks.getPhoneCode },
            false
        ),
        /интерактивного терминала/,
        "без getPassword 2FA спросить будет нечем"
    );

    // В подсказке должен быть путь к сессии — иначе непонятно, куда её класть
    try {
        assertInteractiveInput({}, false);
        assert.fail("ожидалась ошибка");
    } catch (err) {
        assert.ok(err.message.includes("session.txt"), "в подсказке нет пути к сессии");
        assert.ok(err.message.includes("tuigram paths"), "в подсказке нет команды диагностики");
    }

    console.log("  \u2713 auth interactivity tests passed");
}

console.log("\n\u2705 Все юнит-тесты TuiGram успешно пройдены!\n");
