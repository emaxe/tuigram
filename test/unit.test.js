import assert from "node:assert/strict";
import { parsePeer, idToString, toMarkedId, detectChatType, getEntityDisplayName } from "../src/telegram/entities.js";
import { Api } from "teleproto";
import { formatMessageText, escapeBlessed, describeMedia, setMessagePalette } from "../src/telegram/formatter.js";
import { getTheme, themes } from "../src/ui/theme.js";
import { formatChatTime, formatMessageTime, formatDateDivider, formatFileSize, formatDuration } from "../src/utils/time.js";
import { upsertEnv, escapeEnvValue, isValidApiId, isValidApiHash, saveCredentials } from "../src/cli/init.js";
import { parseProxyConfig, formatProxyUrl } from "../src/config.js";
import { createHttpConnectSocket, TuiGramNetSockets } from "../src/telegram/socket.js";
import { assertInteractiveInput } from "../src/telegram/auth.js";
import { strippedPhotoToJpg, decodeImageBuffer, calculateTargetDimensions, resizeRgba, rgbaToHex, rgbaToHalfBlockBlessed, renderImageBuffer, renderStrippedThumbnail, imagePreviewCache } from "../src/utils/image.js";
import { stringCellWidth, isInsideBox, isRightClick, getTabByCoordinate, getMessageAtLine, getMessagePartAtPoint, getStatusBarActionAt, getHeaderActionAt, getInputContextActionAt } from "../src/utils/mouse.js";
import { normalizeMessage } from "../src/telegram/messages.js";
import jpegJs from "jpeg-js";
import { PNG } from "pngjs";
import { isMessageVideo, rgb24ToHalfBlockBlessed, extractFirstFileFromZip, findFfmpegPath, isFfmpegAvailable } from "../src/utils/video.js";
import { config } from "../src/config.js";
import blessed from "neo-blessed";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import zlib from "node:zlib";

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

    // Тесты chatView: прокрутка, сохранение позиции и подгрузка истории
    const { createChatView } = await import("../src/ui/components/chatView.js");
    let loadMoreTriggered = false;
    const chatView = createChatView(screen, theme, {
        onLoadMoreHistory: () => {
            loadMoreTriggered = true;
        },
    });

    const testMsgs = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        date: Date.now() + i * 1000,
        out: i % 2 === 0,
        text: `Сообщение ${i + 1}\nВторая строка ${i + 1}`,
        senderName: "User",
    }));

    // Установка сообщений со скроллом в конец
    chatView.setMessages(testMsgs, true);
    assert.ok(chatView.scrollBox.getScrollHeight() > chatView.scrollBox.height);

    // Стрелка вверх двигает выделение: без выделения берётся последнее сообщение
    chatView.scrollBox.emit("key up");
    assert.equal(chatView.getSelected()?.id, 30, "стрелка вверх без выделения выделяет последнее сообщение");
    chatView.scrollBox.emit("key up");
    assert.equal(chatView.getSelected()?.id, 29, "стрелка вверх поднимает выделение на сообщение выше");

    // Достигнув первого сообщения, выделение подтягивает предыдущую страницу истории
    loadMoreTriggered = false;
    chatView.setSelected(2);
    chatView.scrollBox.emit("key up");
    assert.equal(chatView.getSelected()?.id, 1);
    assert.equal(loadMoreTriggered, true, "стрелка вверх на первом сообщении должна вызывать onLoadMoreHistory");

    // Прокрутка колесом наверх тоже подгружает историю
    loadMoreTriggered = false;
    chatView.setSelected(null);
    chatView.scrollBox.scrollTo(0);
    chatView.scrollBox.emit("wheelup");
    assert.equal(loadMoreTriggered, true, "wheelup на 0 строке должен вызывать onLoadMoreHistory");

    // setMessages с autoScrollToBottom=false сохраняет позицию.
    // Реальный сдвиг ленты — это childBase: getScroll() прибавляет к нему childOffset,
    // который в blessed зависит от направления последней прокрутки.
    chatView.scrollBox.scrollTo(15);
    const prevPos = chatView.scrollBox.childBase;
    assert.equal(prevPos, 15);
    chatView.setMessages(testMsgs, false);
    assert.equal(chatView.scrollBox.childBase, prevPos, "позиция скролла должна сохраняться при фоновом обновлении");

    // Тест флагов событий state
    const { state } = await import("../src/state.js");
    let lastEvent = null;
    const onUpdate = (payload) => { lastEvent = payload; };
    state.on("messages_updated", onUpdate);

    state.setMessages("test_chat", [{ id: 999, text: "initial" }]);
    state.updateMessage("test_chat", { id: 999, text: "updated" });
    assert.equal(lastEvent?.isUpdate, true);
    assert.equal(lastEvent?.isPrepend, false);

    state.addMessage("test_chat", { id: 1000, text: "new" });
    assert.equal(lastEvent?.isNewMessage, true);
    assert.equal(lastEvent?.isUpdate, undefined);

    // Тесты подсветки рамок активного блока при фокусе
    const releaseInputs = () => {
        chatList.release?.();
        inputBox.release?.();
    };

    assert.equal(chatList.container.style.border.fg, theme.borders.fg);
    assert.equal(chatView.container.style.border.fg, theme.borders.fg);
    assert.equal(inputBox.container.style.border.fg, theme.borders.fg);

    chatList.focus();
    assert.equal(chatList.container.style.border.fg, theme.borders.focusFg, "chatList должен подсвечиваться при фокусе");
    assert.equal(chatView.container.style.border.fg, theme.borders.fg);
    assert.equal(inputBox.container.style.border.fg, theme.borders.fg);

    chatList.searchBox.focus();
    assert.equal(chatList.container.style.border.fg, theme.borders.focusFg, "chatList должен оставаться подсвеченным в поиске");

    releaseInputs();
    chatView.focus();
    assert.equal(chatList.container.style.border.fg, theme.borders.fg, "chatList не должен подсвечиваться после потери фокуса");
    assert.equal(chatView.container.style.border.fg, theme.borders.focusFg, "chatView должен подсвечиваться при фокусе");
    assert.equal(inputBox.container.style.border.fg, theme.borders.fg);

    releaseInputs();
    inputBox.focus();
    assert.equal(chatView.container.style.border.fg, theme.borders.fg, "chatView не должен подсвечиваться после потери фокуса");
    assert.equal(inputBox.container.style.border.fg, theme.borders.focusFg, "inputBox должен подсвечиваться при фокусе");
    assert.equal(chatList.container.style.border.fg, theme.borders.fg);

    releaseInputs();
    chatList.focus();
    assert.equal(inputBox.container.style.border.fg, theme.borders.fg, "inputBox не должен подсвечиваться после потери фокуса");
    assert.equal(chatList.container.style.border.fg, theme.borders.focusFg, "chatList снова должен подсвечиваться при фокусе");

    state.off("messages_updated", onUpdate);

    screen.destroy();
    console.log("  ✓ ui geometry & chatView scroll tests passed");
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

// ─── Тесты прокси (парсинг конфигурации и сетевые сокеты) ─────────────────────
{
    // 1. Парсинг PROXY_URL
    const httpNoAuth = parseProxyConfig({ PROXY_URL: "http://127.0.0.1:8080" });
    assert.deepEqual(httpNoAuth, {
        type: "http",
        host: "127.0.0.1",
        port: 8080,
        ip: "127.0.0.1",
        timeout: 10,
        http: true,
    });

    const httpWithAuth = parseProxyConfig({ PROXY_URL: "http://admin:secret123@proxy.example.com:3128" });
    assert.deepEqual(httpWithAuth, {
        type: "http",
        host: "proxy.example.com",
        port: 3128,
        username: "admin",
        password: "secret123",
        ip: "proxy.example.com",
        timeout: 10,
        http: true,
    });

    const socks5NoAuth = parseProxyConfig({ PROXY_URL: "socks5://127.0.0.1:1080" });
    assert.deepEqual(socks5NoAuth, {
        type: "socks5",
        host: "127.0.0.1",
        port: 1080,
        ip: "127.0.0.1",
        socksType: 5,
        timeout: 10,
    });

    const socks5WithAuth = parseProxyConfig({ PROXY_URL: "socks5://myuser:mypass@10.0.0.5:1080", PROXY_TIMEOUT: "15" });
    assert.deepEqual(socks5WithAuth, {
        type: "socks5",
        host: "10.0.0.5",
        port: 1080,
        username: "myuser",
        password: "mypass",
        ip: "10.0.0.5",
        socksType: 5,
        timeout: 15,
    });

    const socks4Proxy = parseProxyConfig({ PROXY_URL: "socks4://127.0.0.1:1080" });
    assert.deepEqual(socks4Proxy, {
        type: "socks4",
        host: "127.0.0.1",
        port: 1080,
        ip: "127.0.0.1",
        socksType: 4,
        timeout: 10,
    });

    // Декодирование спецсимволов в логине/пароле
    const encodedAuth = parseProxyConfig({ PROXY_URL: "http://user%40domain:p%40ss%3Aword@127.0.0.1:8080" });
    assert.equal(encodedAuth.username, "user@domain");
    assert.equal(encodedAuth.password, "p@ss:word");

    // Парсинг через отдельные переменные окружения
    const separateVars = parseProxyConfig({
        PROXY_TYPE: "socks5",
        PROXY_HOST: "192.168.1.100",
        PROXY_PORT: "9050",
        PROXY_USERNAME: "toruser",
        PROXY_PASSWORD: "torpassword",
    });
    assert.deepEqual(separateVars, {
        type: "socks5",
        host: "192.168.1.100",
        port: 9050,
        username: "toruser",
        password: "torpassword",
        ip: "192.168.1.100",
        socksType: 5,
        timeout: 10,
    });

    // Фолбэк на HTTPS_PROXY / HTTP_PROXY / ALL_PROXY (и их строчные варианты)
    const fallbackHttps = parseProxyConfig({ HTTPS_PROXY: "http://proxy.local:8080" });
    assert.equal(fallbackHttps.host, "proxy.local");
    assert.equal(fallbackHttps.port, 8080);

    const fallbackLower = parseProxyConfig({ all_proxy: "socks5://127.0.0.1:9050" });
    assert.equal(fallbackLower.type, "socks5");
    assert.equal(fallbackLower.port, 9050);

    // Некорректные/пустые конфигурации
    assert.equal(parseProxyConfig({}), null);
    assert.equal(parseProxyConfig({ PROXY_URL: "" }), null);
    assert.equal(parseProxyConfig({ PROXY_HOST: "" }), null);
    assert.equal(parseProxyConfig({ PROXY_URL: "not-a-valid-url:::" }), null);

    // 2. Форматирование прокси для вывода (маскирование пароля)
    assert.equal(formatProxyUrl(null), "не используется");
    assert.equal(formatProxyUrl(httpNoAuth), "http://127.0.0.1:8080");
    assert.equal(formatProxyUrl(httpWithAuth), "http://admin:***@proxy.example.com:3128");
    assert.equal(formatProxyUrl(socks5WithAuth), "socks5://myuser:***@10.0.0.5:1080");
    assert.equal(formatProxyUrl({ type: "http", host: "127.0.0.1", port: 8080, username: "admin" }), "http://admin@127.0.0.1:8080");

    // 3. Тесты HTTP CONNECT туннелирования с мок-сервером
    const mockHttpProxy = http.createServer();
    const validHttpAuth = "Basic " + Buffer.from("proxyuser:proxypass").toString("base64");

    mockHttpProxy.on("connect", (req, clientSocket, head) => {
        const auth = req.headers["proxy-authorization"];
        if (req.url === "auth-required.target:443" && auth !== validHttpAuth) {
            clientSocket.write("HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"Proxy\"\r\n\r\n");
            clientSocket.end();
            return;
        }
        if (req.url === "forbidden.target:443") {
            clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            clientSocket.end();
            return;
        }
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        clientSocket.on("data", (data) => clientSocket.write(data));
    });

    await new Promise((resolve) => mockHttpProxy.listen(0, "127.0.0.1", resolve));
    const proxyPort = mockHttpProxy.address().port;

    try {
        // Успешное HTTP CONNECT без авторизации
        const socketNoAuth = await createHttpConnectSocket({
            proxyHost: "127.0.0.1",
            proxyPort,
            targetHost: "open.target",
            targetPort: 443,
        });
        const receivedData = await new Promise((resolve) => {
            socketNoAuth.on("data", (data) => resolve(data.toString()));
            socketNoAuth.write("PING");
        });
        assert.equal(receivedData, "PING");
        socketNoAuth.destroy();

        // Успешное HTTP CONNECT с авторизацией
        const socketWithAuth = await createHttpConnectSocket({
            proxyHost: "127.0.0.1",
            proxyPort,
            targetHost: "auth-required.target",
            targetPort: 443,
            username: "proxyuser",
            password: "proxypass",
        });
        const receivedAuthData = await new Promise((resolve) => {
            socketWithAuth.on("data", (data) => resolve(data.toString()));
            socketWithAuth.write("AUTH_PING");
        });
        assert.equal(receivedAuthData, "AUTH_PING");
        socketWithAuth.destroy();

        // Ошибка 407 при неверной авторизации
        await assert.rejects(
            async () => {
                await createHttpConnectSocket({
                    proxyHost: "127.0.0.1",
                    proxyPort,
                    targetHost: "auth-required.target",
                    targetPort: 443,
                    username: "wronguser",
                    password: "wrongpass",
                });
            },
            /407 Proxy Authentication Required/,
            "должна быть ошибка 407 при неверных учетных данных"
        );

        // Ошибка при коде ответа 403
        await assert.rejects(
            async () => {
                await createHttpConnectSocket({
                    proxyHost: "127.0.0.1",
                    proxyPort,
                    targetHost: "forbidden.target",
                    targetPort: 443,
                });
            },
            /403/,
            "должна быть ошибка при коде ответа 403"
        );

        // Тест TuiGramNetSockets через HTTP CONNECT
        const netSocket = new TuiGramNetSockets({
            type: "http",
            host: "127.0.0.1",
            port: proxyPort,
        });
        await netSocket.connect(443, "open.target");
        netSocket.write(Buffer.from("NET_SOCKET_TEST"));
        const netData = await netSocket.readExactly("NET_SOCKET_TEST".length);
        assert.equal(netData.toString(), "NET_SOCKET_TEST");
        await netSocket.close();
    } finally {
        mockHttpProxy.close();
    }

    // 4. Тесты SOCKS5 прокси с мок-сервером
    function createMockSocks5Server(expectedAuth = null) {
        return net.createServer((socket) => {
            let state = "init";
            socket.on("data", (data) => {
                if (state === "init") {
                    if (data[0] !== 5) return socket.destroy();
                    if (expectedAuth) {
                        socket.write(Buffer.from([5, 2]));
                        state = "auth";
                    } else {
                        socket.write(Buffer.from([5, 0]));
                        state = "connect";
                    }
                } else if (state === "auth") {
                    const ulen = data[1];
                    const user = data.subarray(2, 2 + ulen).toString();
                    const plen = data[2 + ulen];
                    const pass = data.subarray(3 + ulen, 3 + ulen + plen).toString();
                    if (user === expectedAuth.user && pass === expectedAuth.pass) {
                        socket.write(Buffer.from([1, 0]));
                        state = "connect";
                    } else {
                        socket.write(Buffer.from([1, 1]));
                        socket.destroy();
                    }
                } else if (state === "connect") {
                    if (data[1] !== 1) return socket.destroy();
                    socket.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
                    state = "pipe";
                    socket.on("data", (d) => socket.write(d));
                }
            });
        });
    }

    // Тест SOCKS5 без авторизации
    const mockSocksNoAuth = createMockSocks5Server(null);
    await new Promise((resolve) => mockSocksNoAuth.listen(0, "127.0.0.1", resolve));
    const socksPortNoAuth = mockSocksNoAuth.address().port;

    try {
        const socksSocket = new TuiGramNetSockets({
            type: "socks5",
            host: "127.0.0.1",
            port: socksPortNoAuth,
        });
        await socksSocket.connect(443, "149.154.167.50");
        socksSocket.write(Buffer.from("SOCKS5_PING"));
        const socksData = await socksSocket.readExactly("SOCKS5_PING".length);
        assert.equal(socksData.toString(), "SOCKS5_PING");
        await socksSocket.close();
    } finally {
        mockSocksNoAuth.close();
    }

    // Тест SOCKS5 с авторизацией
    const mockSocksAuth = createMockSocks5Server({ user: "tguser", pass: "tgpass" });
    await new Promise((resolve) => mockSocksAuth.listen(0, "127.0.0.1", resolve));
    const socksPortAuth = mockSocksAuth.address().port;

    try {
        const socksSocketAuth = new TuiGramNetSockets({
            type: "socks5",
            host: "127.0.0.1",
            port: socksPortAuth,
            username: "tguser",
            password: "tgpass",
        });
        await socksSocketAuth.connect(443, "149.154.167.50");
        socksSocketAuth.write(Buffer.from("SOCKS5_AUTH_PING"));
        const authData = await socksSocketAuth.readExactly("SOCKS5_AUTH_PING".length);
        assert.equal(authData.toString(), "SOCKS5_AUTH_PING");
        await socksSocketAuth.close();

        // Проверка отказа при неверных реквизитах
        const socksWrongAuth = new TuiGramNetSockets({
            type: "socks5",
            host: "127.0.0.1",
            port: socksPortAuth,
            username: "baduser",
            password: "badpass",
        });
        await assert.rejects(
            async () => {
                await socksWrongAuth.connect(443, "149.154.167.50");
            },
            /authentication|rejected|closed/i
        );
    } finally {
        mockSocksAuth.close();
    }

    console.log("  ✓ proxy parsing and network socket tests passed");
}

// ─── Тесты обработки изображений и генерации превью (image.js) ────────────────
{
    // 1. Тест rgbaToHex
    assert.equal(rgbaToHex(255, 0, 128), "#ff0080");
    assert.equal(rgbaToHex(0, 5, 10), "#00050a");
    assert.equal(rgbaToHex(255, 255, 255), "#ffffff");

    // 2. Тест calculateTargetDimensions
    // Горизонтальное изображение 800x600 (4:3) при maxWidth=36, maxHeight=14 (maxPixelH=28)
    const horiz = calculateTargetDimensions(800, 600, 36, 14);
    assert.equal(horiz.dstW, 36);
    assert.equal(horiz.dstH, 28);
    assert.equal(horiz.rows, 14);

    // Вертикальное изображение 600x800 (3:4)
    const vert = calculateTargetDimensions(600, 800, 36, 14);
    assert.ok(vert.dstW <= 36);
    assert.equal(vert.dstH, 28);
    assert.equal(vert.rows, 14);
    assert.equal(vert.dstW, 21);

    // Квадратное изображение 100x100 (1:1)
    const square = calculateTargetDimensions(100, 100, 36, 14);
    assert.equal(square.dstH, 28);
    assert.equal(square.dstW, 28);
    assert.equal(square.rows, 14);

    // Четность высоты для корректных пар полублоков
    assert.equal(horiz.dstH % 2, 0);
    assert.equal(vert.dstH % 2, 0);
    assert.equal(square.dstH % 2, 0);

    // 3. Тест resizeRgba (билинейная интерполяция)
    // Создаем 2x2 градиент RGBA:
    // [Красный, Зеленый]
    // [Синий,   Белый  ]
    const src2x2 = new Uint8Array([
        255, 0, 0, 255,     0, 255, 0, 255,
        0, 0, 255, 255,     255, 255, 255, 255
    ]);
    const resized4x4 = resizeRgba(src2x2, 2, 2, 4, 4);
    assert.equal(resized4x4.length, 4 * 4 * 4);
    // Проверка, что альфа-канал сохранился
    for (let i = 3; i < resized4x4.length; i += 4) {
        assert.equal(resized4x4[i], 255);
    }

    // 4. Тест rgbaToHalfBlockBlessed
    // 2x2 пикселя -> 2 колонки x 1 строка терминала
    const halfBlockBlessed = rgbaToHalfBlockBlessed(src2x2, 2, 2);
    assert.ok(halfBlockBlessed.includes("▀"), "должен содержать символ полублока ▀");
    assert.ok(halfBlockBlessed.includes("-fg"), "должен содержать тег цвета текста");
    assert.ok(halfBlockBlessed.includes("-bg"), "должен содержать тег цвета фона");
    assert.ok(halfBlockBlessed.endsWith("{/}"), "должен сбрасывать стили в конце строки");
    assert.equal(halfBlockBlessed.split("\n").length, 1, "2 пикселя по вертикали должны давать 1 строку терминала");

    // 5. Тест strippedPhotoToJpg
    const syntheticStripped = Buffer.concat([
        Buffer.from([1, 20, 30]), // version 1, height 20, width 30
        Buffer.from([0xaa, 0xbb, 0xcc])
    ]);
    const unpackedJpg = strippedPhotoToJpg(syntheticStripped);
    assert.ok(unpackedJpg.length > 200, "распакованный JPEG должен содержать таблицы квантования и заголовок");
    assert.equal(unpackedJpg[0], 0xff);
    assert.equal(unpackedJpg[1], 0xd8); // JPEG SOI
    assert.equal(unpackedJpg[164], 20, "высота должна быть записана в байт 164");
    assert.equal(unpackedJpg[166], 30, "ширина должна быть записана в байт 166");
    assert.equal(unpackedJpg[unpackedJpg.length - 2], 0xff);
    assert.equal(unpackedJpg[unpackedJpg.length - 1], 0xd9); // JPEG EOI

    // Некорректный буфер возвращается без падений
    assert.deepEqual(strippedPhotoToJpg(Buffer.from([2, 20, 30])), Buffer.from([2, 20, 30]));

    // 6. Тесты decodeImageBuffer и renderImageBuffer для JPEG и PNG
    // Кодируем валидный тестовый JPEG
    const testJpg = jpegJs.encode({
        data: Buffer.from(src2x2),
        width: 2,
        height: 2
    }, 100).data;

    const decodedJpg = decodeImageBuffer(testJpg);
    assert.equal(decodedJpg.width, 2);
    assert.equal(decodedJpg.height, 2);
    assert.equal(decodedJpg.data.length, 16);

    const renderedJpg = renderImageBuffer(testJpg, { maxWidth: 10, maxHeight: 5 });
    assert.ok(renderedJpg.length > 0);
    assert.ok(renderedJpg.includes("▀"));

    // Кодируем валидный тестовый PNG
    const pngObj = new PNG({ width: 2, height: 2 });
    pngObj.data = Buffer.from(src2x2);
    const testPng = PNG.sync.write(pngObj);

    const decodedPng = decodeImageBuffer(testPng);
    assert.equal(decodedPng.width, 2);
    assert.equal(decodedPng.height, 2);

    const renderedPng = renderImageBuffer(testPng, { maxWidth: 10, maxHeight: 5, cacheKey: "test_png_cache" });
    assert.ok(renderedPng.length > 0);
    assert.ok(renderedPng.includes("▀"));

    // Проверка кэширования: размер входит в ключ, иначе полноэкранный рендер
    // вытеснял бы миниатюру той же картинки в ленте сообщений
    assert.ok(imagePreviewCache.has("test_png_cache@10x5"));
    assert.equal(
        renderImageBuffer(testPng, { maxWidth: 10, maxHeight: 5, cacheKey: "test_png_cache" }),
        renderedPng,
        "повторный рендер того же размера должен браться из кэша"
    );

    renderImageBuffer(testPng, { maxWidth: 20, maxHeight: 10, cacheKey: "test_png_cache" });
    assert.ok(imagePreviewCache.has("test_png_cache@20x10"), "другой размер должен кэшироваться отдельно");

    // 7. Тест интеграции с normalizeMessage
    const msgWithPhoto = {
        id: 42,
        date: 1700000000,
        out: false,
        message: "Смотри фото!",
        media: {
            className: "MessageMediaPhoto",
            photo: {
                id: 12345n,
                sizes: [
                    {
                        className: "PhotoStrippedSize",
                        type: "i",
                        bytes: Buffer.concat([Buffer.from([1, 2, 2]), testJpg.subarray(20, testJpg.length - 2)])
                    }
                ]
            }
        }
    };
    const norm = normalizeMessage(msgWithPhoto);
    assert.equal(norm.id, 42);
    assert.ok(norm.imagePreview !== undefined);
    assert.ok(norm.mediaDescription.includes("Фотография"));

    // 8. Защита от поврежденных буферов
    assert.equal(renderImageBuffer(Buffer.from([0, 1, 2, 3])), "");
    assert.equal(renderStrippedThumbnail(Buffer.from([])), "");

    console.log("  ✓ image.js & preview rendering tests passed");
}

// 13. Тесты поддержки мыши и утилит mouse.js
{
    // 1. Тест stringCellWidth
    assert.equal(stringCellWidth("Hello"), 5);
    assert.equal(stringCellWidth("{bold}Hello{/bold}"), 5);
    assert.equal(stringCellWidth("🚀"), 2);
    assert.equal(stringCellWidth(""), 0);

    // 2. Тест isInsideBox
    const box = { left: 10, top: 5, width: 20, height: 10 };
    assert.equal(isInsideBox(10, 5, box), true);
    assert.equal(isInsideBox(29, 14, box), true);
    assert.equal(isInsideBox(9, 5, box), false);
    assert.equal(isInsideBox(30, 5, box), false);
    assert.equal(isInsideBox(10, 4, box), false);
    assert.equal(isInsideBox(10, 15, box), false);
    assert.equal(isInsideBox(10, 10, null), false);

    // 3. Тест getTabByCoordinate
    // " 1:Все " (7 cells: 0..6)
    // " 2:ЛС " (6 cells: 7..12)
    // " 3:Группы " (10 cells: 13..22)
    // " 4:Каналы " (10 cells: 23..32)
    // " 5:Боты " (8 cells: 33..40)
    // " 6:Непроч " (10 cells: 41..50)
    assert.equal(getTabByCoordinate(0), "all");
    assert.equal(getTabByCoordinate(5), "all");
    assert.equal(getTabByCoordinate(7), "users");
    assert.equal(getTabByCoordinate(12), "users");
    assert.equal(getTabByCoordinate(15), "groups");
    assert.equal(getTabByCoordinate(25), "channels");
    assert.equal(getTabByCoordinate(35), "bots");
    assert.equal(getTabByCoordinate(45), "unread");
    assert.equal(getTabByCoordinate(60), null);
    assert.equal(getTabByCoordinate(-1), null);

    // 4. Тест getMessageAtLine и getMessagePartAtPoint
    // Карту строк строит ChatView; здесь проверяется только поиск по готовой карте.
    const ranges = [
        { message: { id: 1 }, startLine: 0, endLine: 1, image: null },
        {
            message: { id: 2 },
            startLine: 3,
            endLine: 9,
            image: { startLine: 5, endLine: 8, left: 2, right: 38 },
        },
    ];

    assert.equal(getMessageAtLine(0, ranges)?.id, 1);
    assert.equal(getMessageAtLine(1, ranges)?.id, 1);
    assert.equal(getMessageAtLine(2, ranges), null, "пустая строка между сообщениями");
    assert.equal(getMessageAtLine(9, ranges)?.id, 2);
    assert.equal(getMessageAtLine(999, ranges), null);
    assert.equal(getMessageAtLine(-1, ranges), null);
    assert.equal(getMessageAtLine(0, []), null);

    // Попадание в превью изображения и мимо него
    assert.deepEqual(getMessagePartAtPoint(6, 10, ranges), { message: { id: 2 }, part: "image" });
    assert.equal(getMessagePartAtPoint(6, 1, ranges)?.part, "body", "левее превью — тело сообщения");
    assert.equal(getMessagePartAtPoint(6, 38, ranges)?.part, "body", "правее превью — тело сообщения");
    assert.equal(getMessagePartAtPoint(4, 10, ranges)?.part, "body", "выше превью — тело сообщения");
    assert.equal(getMessagePartAtPoint(0, 10, ranges)?.part, "body", "сообщение без картинки");
    assert.equal(getMessagePartAtPoint(2, 10, ranges), null);

    // Правая кнопка мыши
    assert.equal(isRightClick({ button: "right" }), true);
    assert.equal(isRightClick({ button: "left" }), false);
    assert.equal(isRightClick(undefined), false);

    // 5. Тест getStatusBarActionAt
    assert.equal(getStatusBarActionAt(5, 120), "focus");
    assert.equal(getStatusBarActionAt(20, 120), "select");
    assert.equal(getStatusBarActionAt(45, 120), "tabs");
    assert.equal(getStatusBarActionAt(60, 120), "search");
    assert.equal(getStatusBarActionAt(75, 120), "help");
    assert.equal(getStatusBarActionAt(92, 120), "actions");
    assert.equal(getStatusBarActionAt(108, 120), "info");
    assert.equal(getStatusBarActionAt(120, 120), null);
    assert.equal(getStatusBarActionAt(-5, 120), null);

    // 6. Тест getHeaderActionAt
    assert.equal(getHeaderActionAt(5, 1, { hasActiveChat: false }), "help");
    assert.equal(getHeaderActionAt(25, 1, { hasActiveChat: false }), "status");
    assert.equal(getHeaderActionAt(10, 2, { hasActiveChat: true }), "info");
    assert.equal(getHeaderActionAt(10, 2, { hasActiveChat: false }), null);
    assert.equal(getHeaderActionAt(10, 0), null);
    assert.equal(getHeaderActionAt(10, 3), null);

    // 7. Тест getInputContextActionAt
    assert.equal(getInputContextActionAt(10, "reply"), "cancel");
    assert.equal(getInputContextActionAt(10, "edit"), "cancel");
    // Границы совпадают с реально отрисованной строкой подсказок:
    // " Введите сообщение...  " 0-22 · "[Enter] Отправить  " 23-41 ·
    // "[Ctrl+J] Новая строка  " 42-64 · "[Ctrl+R] Ответ  " 65-80 ·
    // "[Ctrl+E] Правка  " 81-97 · "[/] Команды" 98-108
    assert.equal(getInputContextActionAt(10, null), null, "клик по подсказке ввода ничего не делает");
    assert.equal(getInputContextActionAt(60, null), null, "клик по [Ctrl+J] ничего не делает");
    assert.equal(getInputContextActionAt(65, null), "reply");
    assert.equal(getInputContextActionAt(80, null), "reply");
    assert.equal(getInputContextActionAt(81, null), "edit");
    assert.equal(getInputContextActionAt(97, null), "edit");
    assert.equal(getInputContextActionAt(98, null), "commands");
    assert.equal(getInputContextActionAt(108, null), "commands");
    assert.equal(getInputContextActionAt(200, null), null);
    assert.equal(getInputContextActionAt(-1, null), null);

    // 8. Интеграционные тесты мыши на компонентах UI
    const { createHeader } = await import("../src/ui/components/header.js");
    const { createStatusBar } = await import("../src/ui/components/statusBar.js");
    const { createChatList } = await import("../src/ui/components/chatList.js");
    const { createChatView } = await import("../src/ui/components/chatView.js");
    const { createInputBox } = await import("../src/ui/components/inputBox.js");
    const { createHelpModal } = await import("../src/ui/components/modals/helpModal.js");
    const { createConfirmModal } = await import("../src/ui/components/modals/confirmModal.js");
    const { createActionModal } = await import("../src/ui/components/modals/actionModal.js");
    const { getTheme } = await import("../src/ui/theme.js");
    const blessed = (await import("neo-blessed")).default;
    const { PassThrough } = await import("node:stream");
    const fs = await import("node:fs");

    const output = fs.createWriteStream("/dev/null");
    output.isTTY = true;
    output.columns = 120;
    output.rows = 40;
    const input = new PassThrough();
    input.isTTY = true;
    input.setRawMode = () => {};

    const testScreen = blessed.screen({
        smartCSR: true,
        fullUnicode: true,
        input,
        output,
        terminal: "xterm-256color",
    });
    const testTheme = getTheme("default");

    // Проверка кликов в Header
    let headerHelpClicked = false;
    let headerInfoClicked = false;
    const testHeader = createHeader(testScreen, testTheme, {
        onHelp: () => { headerHelpClicked = true; },
        onChatInfo: () => { headerInfoClicked = true; },
    });
    testHeader.updateInfo({ me: { firstName: "Test" }, activeChat: { title: "Active Chat", type: "user" } });
    testHeader.emit("click", { x: 5, y: 1 });
    assert.equal(headerHelpClicked, true, "клик по логотипу в header должен вызывать onHelp");
    testHeader.emit("click", { x: 5, y: 2 });
    assert.equal(headerInfoClicked, true, "клик по активному чату в header должен вызывать onChatInfo");

    // Проверка кликов в StatusBar
    let sbHelpClicked = false;
    let sbFocusClicked = false;
    const testStatusBar = createStatusBar(testScreen, testTheme, {
        onHelp: () => { sbHelpClicked = true; },
        onFocusNext: () => { sbFocusClicked = true; },
    });
    testStatusBar.emit("click", { x: 5, y: 39 });
    assert.equal(sbFocusClicked, true, "клик по Tab в statusBar должен вызывать onFocusNext");
    testStatusBar.emit("click", { x: 75, y: 39 });
    assert.equal(sbHelpClicked, true, "клик по F1 в statusBar должен вызывать onHelp");

    // Проверка клика по вкладкам в ChatList
    let selectedTab = null;
    let selectedChat = null;
    const testChatList = createChatList(testScreen, testTheme, {
        onTabChange: (tab) => { selectedTab = tab; },
        onSelectDialog: (d) => { selectedChat = d; },
    });
    testChatList.setDialogs([{ id: "10", title: "Test Chat" }]);
    testChatList.container.children[0].emit("click", { x: 9, y: 4 }); // клик по ЛС (x=9)
    assert.equal(selectedTab, "users", "клик по вкладке ЛС должен переключать вкладку на users");

    // Проверка выбора диалога по клику на элемент
    const firstItem = testChatList.list.getItem(0);
    firstItem.emit("click");
    assert.equal(selectedChat?.id, "10", "клик по элементу диалога должен вызывать onSelectDialog");

    // Проверка кликов и выделения в ChatView
    let actionModalMsg = null;
    let selectedMsg = null;
    let openedImageMsg = null;
    const testChatView = createChatView(testScreen, testTheme, {
        onActionMenu: (msg) => { actionModalMsg = msg; },
        onSelectMessage: (msg) => { selectedMsg = msg; },
        onOpenImage: (msg) => { openedImageMsg = msg; },
    });

    // Превью — две строки псевдографики шириной 4 ячейки
    const fakePreview = "{#112233-fg}▀▀▀▀{/}\n{#112233-fg}▀▀▀▀{/}";
    const now = Date.now();
    testChatView.setMessages([
        { id: 123, text: "Clickable message", date: now },
        { id: 124, text: "", date: now, mediaDescription: "[📷 Фотография]", imagePreview: fakePreview },
    ]);
    testScreen.render();

    const atop = testChatView.scrollBox.atop || 0;
    const scroll = testChatView.scrollBox.childBase || 0;
    /** Экранная координата Y для строки содержимого ленты. */
    const lineY = (contentLine) => atop - scroll + contentLine;

    // Строка 0 — разделитель даты (пустая), 1 — сама дата, 2 — пустая, 3 — автор первого сообщения
    testChatView.scrollBox.emit("click", { x: 50, y: lineY(3), button: "left" });
    assert.equal(selectedMsg?.id, 123, "левый клик по сообщению должен выделять его");
    assert.equal(testChatView.getSelected()?.id, 123);
    assert.equal(actionModalMsg, null, "левый клик не должен открывать меню действий");

    testChatView.scrollBox.emit("click", { x: 50, y: lineY(3), button: "right" });
    assert.equal(actionModalMsg?.id, 123, "правый клик должен открывать меню действий");

    // Второе сообщение: строка 6 — автор, 7 — описание медиа, 8-9 — превью
    const boxLeft = testChatView.scrollBox.aleft || 0;
    testChatView.scrollBox.emit("click", { x: boxLeft + 3, y: lineY(8), button: "left" });
    assert.equal(openedImageMsg?.id, 124, "клик по превью должен открывать просмотрщик");

    openedImageMsg = null;
    testChatView.scrollBox.emit("click", { x: boxLeft + 30, y: lineY(8), button: "left" });
    assert.equal(openedImageMsg, null, "клик правее превью не открывает просмотрщик");
    assert.equal(testChatView.getSelected()?.id, 124, "но выделяет сообщение");

    // Перемещение выделения клавишами
    testChatView.selectByOffset(-1);
    assert.equal(testChatView.getSelected()?.id, 123, "selectByOffset(-1) поднимает выделение");
    testChatView.selectByOffset(-1);
    assert.equal(testChatView.getSelected()?.id, 123, "выделение не уходит выше первого сообщения");
    testChatView.selectByOffset(1);
    assert.equal(testChatView.getSelected()?.id, 124);

    // Цель действий: выделенное сообщение, а без выделения — последнее в ленте
    assert.equal(testChatView.getTargetMessage()?.id, 124);
    testChatView.setSelected(null);
    assert.equal(testChatView.getSelected(), null);
    assert.equal(testChatView.getTargetMessage()?.id, 124, "без выделения действует последнее сообщение");

    // Проверка кликов в InputBox contextBar
    let cancelContextCalled = false;
    const testInputBox = createInputBox(testScreen, testTheme, {
        onCancelContext: () => { cancelContextCalled = true; },
    });
    testInputBox.setContext("reply", { id: 99, text: "reply target" });
    testInputBox.contextBar.emit("click", { x: 50, y: 35 });
    assert.equal(cancelContextCalled, true, "клик по contextBar в режиме ответа должен отменять контекст");

    // Проверка закрытия модальных окон при клике вне окна.
    // blessed шлёт клик экрану сразу после элемента, поэтому окно не должно
    // закрываться тем же кликом, которым его открыли, — только следующим.
    const nextTickClick = () => new Promise((resolve) => setImmediate(resolve));

    const testConfirm = createConfirmModal(testScreen, testTheme);
    testConfirm.ask("Confirm?", () => {});
    assert.equal(testConfirm.modal.visible, true);
    testScreen.emit("click", { x: 0, y: 0 }); // клик, которым окно открыли
    assert.equal(testConfirm.modal.visible, true, "открывающий клик не должен закрывать confirmModal");
    await nextTickClick();
    testScreen.emit("click", { x: 0, y: 0 }); // клик в угол экрана мимо модалки
    assert.equal(testConfirm.modal.visible, false, "клик вне confirmModal должен закрывать окно");

    const testAction = createActionModal(testScreen, testTheme);
    testAction.show({ id: 55, text: "Action item" });
    assert.equal(testAction.modal.visible, true);
    testScreen.emit("click", { x: 0, y: 0 });
    assert.equal(testAction.modal.visible, true, "открывающий клик не должен закрывать actionModal");
    await nextTickClick();
    testScreen.emit("click", { x: 0, y: 0 });
    assert.equal(testAction.modal.visible, false, "клик вне actionModal должен закрывать окно");

    const testHelp = createHelpModal(testScreen, testTheme);
    testHelp.show();
    assert.equal(testHelp.modal.visible, true);
    await nextTickClick();
    testScreen.emit("click", { x: 0, y: 0 });
    assert.equal(testHelp.modal.visible, false, "клик вне helpModal должен закрывать окно");

    // Полноэкранный просмотрщик изображений
    const { createImageViewerModal } = await import("../src/ui/components/modals/imageViewerModal.js");

    let viewerLoadCalls = 0;
    const testViewer = createImageViewerModal(testScreen, testTheme, {
        onLoadFullImage: () => {
            viewerLoadCalls++;
            return Promise.reject(new Error("нет сети"));
        },
        onRenderPlaceholder: () => "{#112233-fg}▀▀▀▀{/}",
    });

    testViewer.show({ id: 321, rawMessage: {} });
    assert.equal(testViewer.isVisible(), true, "просмотрщик должен открываться сразу, не дожидаясь сети");

    // Загрузка идёт асинхронно, а отказ не должен ни ронять окно, ни закрывать его
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(viewerLoadCalls, 1, "просмотрщик должен запрашивать полное изображение");
    assert.equal(testViewer.isVisible(), true, "ошибка загрузки не закрывает просмотрщик");

    testViewer.hide();
    assert.equal(testViewer.isVisible(), false, "просмотрщик должен закрываться");

    testScreen.destroy();
    console.log("  ✓ mouse support & mouse.js tests passed");
}

// 14. Тесты воспроизведения видео (video.js, videoPlayerModal.js и конфигурации)
{
    // 14.1 Определение видеосообщений
    const videoDocMsg = {
        media: {
            className: "MessageMediaDocument",
            document: {
                attributes: [{ className: "DocumentAttributeVideo", duration: 15 }],
            },
        },
    };
    assert.equal(isMessageVideo(videoDocMsg), true, "сообщение с DocumentAttributeVideo должно определяться как видео");

    const mimeVideoMsg = {
        media: {
            className: "MessageMediaDocument",
            document: {
                mimeType: "video/mp4",
                attributes: [],
            },
        },
    };
    assert.equal(isMessageVideo(mimeVideoMsg), true, "сообщение с mimeType video/* должно определяться как видео");

    const photoMsg = {
        media: {
            className: "MessageMediaPhoto",
        },
    };
    assert.equal(isMessageVideo(photoMsg), false, "фотография не должна определяться как видео");

    const plainDocMsg = {
        media: {
            className: "MessageMediaDocument",
            document: {
                mimeType: "application/pdf",
                attributes: [{ className: "DocumentAttributeFilename", fileName: "test.pdf" }],
            },
        },
    };
    assert.equal(isMessageVideo(plainDocMsg), false, "PDF не должен определяться как видео");
    assert.equal(isMessageVideo(null), false);
    assert.equal(isMessageVideo({}), false);

    // 14.2 Конвертация RGB24 в Half-Block Blessed
    // 2x2 пикселя: (255,0,0), (0,255,0) сверху и (0,0,255), (255,255,255) снизу
    const rgbData = Buffer.from([
        255, 0, 0,    0, 255, 0,
        0, 0, 255,    255, 255, 255
    ]);
    const halfBlock = rgb24ToHalfBlockBlessed(rgbData, 2, 2);
    assert.ok(halfBlock.includes("▀"), "должен содержать символ полублока ▀");
    assert.ok(halfBlock.includes("#ff0000"), "должен содержать красный верхний пиксель #ff0000");
    assert.ok(halfBlock.includes("#0000ff"), "должен содержать синий нижний пиксель #0000ff");
    assert.ok(halfBlock.includes("#00ff00"), "должен содержать зелёный верхний пиксель #00ff00");
    assert.ok(halfBlock.includes("#ffffff"), "должен содержать белый нижний пиксель #ffffff");

    assert.equal(rgb24ToHalfBlockBlessed(null, 2, 2), "");
    assert.equal(rgb24ToHalfBlockBlessed(Buffer.alloc(2), 2, 2), "");

    // 14.3 Проверка конфигурации видео
    assert.equal(typeof config.enableVideo, "boolean", "config.enableVideo должен быть boolean");
    assert.ok(config.videoFps >= 1 && config.videoFps <= 30, "config.videoFps должен быть в диапазоне 1..30");
    assert.equal(typeof config.videoAudio, "boolean", "config.videoAudio должен быть boolean");

    // 14.4 Распаковка ZIP-архива в памяти
    // Создаём минимальный валидный ZIP-архив с 1 файлом (метод 0 - store)
    const testFileName = "test.bin";
    const testPayload = Buffer.from("ffmpeg test binary payload", "utf8");
    const nameBuf = Buffer.from(testFileName, "utf8");

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Сигнатура
    localHeader.writeUInt16LE(20, 4);         // Версия
    localHeader.writeUInt16LE(0, 6);          // Флаги
    localHeader.writeUInt16LE(0, 8);          // Метод 0 = Store
    localHeader.writeUInt16LE(0, 10);         // Время
    localHeader.writeUInt16LE(0, 12);         // Дата
    localHeader.writeUInt32LE(0, 14);         // CRC32
    localHeader.writeUInt32LE(testPayload.length, 18); // Compressed size
    localHeader.writeUInt32LE(testPayload.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);     // Name length
    localHeader.writeUInt16LE(0, 28);                  // Extra field length

    const zipBuf = Buffer.concat([localHeader, nameBuf, testPayload]);
    const extracted = extractFirstFileFromZip(zipBuf);
    assert.equal(extracted.name, testFileName);
    assert.equal(extracted.data.toString("utf8"), "ffmpeg test binary payload");

    // 14.5 Тест модального окна видеоплеера
    const { createVideoPlayerModal } = await import("../src/ui/components/modals/videoPlayerModal.js");
    const testScreen = blessed.screen({ smartCSR: true, dump: false, warnings: false });
    const testTheme = getTheme("default");

    let videoLoadCalls = 0;
    const testVideoModal = createVideoPlayerModal(testScreen, testTheme, {
        onLoadVideoFile: () => {
            videoLoadCalls++;
            return Promise.resolve("/tmp/fake_video.mp4");
        },
        onRenderPlaceholder: () => "{#112233-fg}▀▀▀▀{/}",
    });

    assert.equal(testVideoModal.isVisible(), false);
    testVideoModal.play(videoDocMsg);
    assert.equal(testVideoModal.isVisible(), true, "плеер должен отображаться при вызове play");
    testVideoModal.hide();
    assert.equal(testVideoModal.isVisible(), false, "плеер должен скрываться при вызове hide");

    testScreen.destroy();
    console.log("  ✓ video.js & videoPlayerModal.js tests passed");
}

console.log("\n\u2705 Все юнит-тесты TuiGram успешно пройдены!\n");



