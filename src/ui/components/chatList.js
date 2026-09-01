import blessed from "neo-blessed";
import { formatChatTime } from "../../utils/time.js";
import { escapeBlessed } from "../../telegram/formatter.js";
import { fg, badge } from "../theme.js";
import unicode from "neo-blessed/lib/unicode.js";

import { getTabByCoordinate } from "../../utils/mouse.js";

/**
 * Создаёт компонент списка диалогов (левая панель).
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @param {object} callbacks
 * @param {(dialog: object) => void} callbacks.onSelectDialog
 * @param {(tab: string) => void} callbacks.onTabChange
 * @param {(query: string) => void} callbacks.onSearchChange
 */
export function createChatList(screen, theme, { onSelectDialog, onTabChange, onSearchChange } = {}) {
    const container = blessed.box({
        parent: screen,
        top: 4,
        left: 0,
        width: "35%",
        bottom: 1,
        mouse: true,
        border: {
            type: "line",
        },
        style: {
            bg: theme.chatList.bg,
            fg: theme.chatList.fg,
            border: {
                fg: theme.borders.fg,
            },
        },
    });

    // 1. Вкладки фильтрации сверху списка
    const tabsBox = blessed.box({
        parent: container,
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        tags: true,
        mouse: true,
        clickable: true,
        style: {
            bg: theme.tabs.bg,
            fg: theme.tabs.fg,
        },
    });

    /** Пиктограммы, которые терминал рисует в две ячейки. */
    const EMOJI = /\p{Extended_Pictographic}/u;

    const TAB_KEYS = ["all", "users", "groups", "channels", "bots", "unread"];
    const TAB_NAMES = ["1:Все", "2:ЛС", "3:Группы", "4:Каналы", "5:Боты", "6:Непроч"];
    let currentTab = "all";

    function renderTabs() {
        const rendered = TAB_KEYS.map((key, idx) => {
            const name = TAB_NAMES[idx];
            if (key === currentTab) {
                return badge(theme.tabs.activeBg, theme.tabs.activeFg, `{bold} ${name} {/bold}`);
            }
            return fg(theme.tabs.fg, ` ${name} `);
        }).join("");
        tabsBox.setContent(rendered);
    }

    tabsBox.on("click", (data) => {
        const relX = data.x - (tabsBox.aleft || 0);
        const tabKey = getTabByCoordinate(relX, TAB_KEYS, TAB_NAMES);
        if (tabKey) {
            currentTab = tabKey;
            renderTabs();
            onTabChange?.(currentTab);
            screen.render();
        }
    });

    // 2. Строка поиска / фильтра
    const searchBox = blessed.textbox({
        parent: container,
        top: 1,
        left: 0,
        right: 0,
        height: 1,
        inputOnFocus: true,
        mouse: true,
        style: {
            bg: theme.search.bg,
            fg: theme.search.fg,
        },
    });
    const SEARCH_PLACEHOLDER = "[/] Поиск чатов...";
    searchBox.setValue(SEARCH_PLACEHOLDER);

    searchBox.on("click", () => {
        if (searchBox.getValue() === SEARCH_PLACEHOLDER) {
            searchBox.setValue("");
        }
        searchBox.focus();
        screen.render();
    });

    // 3. Список диалогов
    const list = blessed.list({
        parent: container,
        top: 2,
        left: 0,
        right: 0,
        bottom: 0,
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        scrollbar: {
            ch: "│",
            style: {
                bg: theme.scrollbar.bg,
                fg: theme.scrollbar.fg,
            },
        },
        style: {
            bg: theme.chatList.bg,
            fg: theme.chatList.fg,
            selected: {
                bg: theme.chatList.selectedBg,
                fg: theme.chatList.selectedFg,
                bold: true,
            },
            item: {
                hover: {
                    bg: theme.chatList.itemHoverBg,
                },
            },
        },
    });

    // Элемент списка — всегда одна строка. По умолчанию blessed переносит
    // не влезающий хвост на вторую строку, которой в элементе высотой 1 просто
    // нет: хвост исчезал, а начатый перед разрывом фон бейджа непрочитанных
    // оставался залитым до края панели. С wrap: false лишнее просто обрезается.
    // По клику мыши сразу выбираем и открываем диалог.
    const baseCreateItem = list.createItem.bind(list);
    list.createItem = (content) => {
        const item = baseCreateItem(content);
        item.wrap = false;
        item.on("click", () => {
            const index = list.getItemIndex(item);
            if (index !== -1 && currentDialogs[index]) {
                list.select(index);
                onSelectDialog?.(currentDialogs[index]);
            }
        });
        return item;
    };

    container.on("wheelup", () => {
        list.select(list.selected - 2);
        screen.render();
    });

    container.on("wheeldown", () => {
        list.select(list.selected + 2);
        screen.render();
    });

    let currentDialogs = [];

    /**
     * Ширина строки в ячейках терминала по той же модели, которой пользуется
     * blessed при отрисовке. Считать через .length нельзя: эмодзи занимают
     * две ячейки, а в UTF-16 это одна-две единицы — из-за расхождения строка
     * вылезала за край, blessed резал её посреди бейджа непрочитанных и хвост
     * оставался залит фоном бейджа.
     * @param {string} text
     * @returns {number}
     */
    function cellWidth(text) {
        let width = 0;
        for (const char of text) {
            const byBlessed = unicode.strWidth(char);
            // Эмодзи терминал рисует в две ячейки, а blessed считает их за одну.
            // Берём максимум: бюджет должен быть верен для обеих моделей, иначе
            // строка вылезает за край в реальном терминале.
            width += EMOJI.test(char) ? Math.max(2, byBlessed) : byBlessed;
        }
        return width;
    }

    /**
     * Обрезает строку до заданной ширины В ЯЧЕЙКАХ, добавляя многоточие.
     * @param {string} text
     * @param {number} maxCells
     * @returns {string}
     */
    function truncate(text, maxCells) {
        if (maxCells <= 1) return "";
        if (cellWidth(text) <= maxCells) return text;

        let width = 0;
        let result = "";
        for (const char of text) {
            const charCells = cellWidth(char);
            if (width + charCells > maxCells - 1) break;
            width += charCells;
            result += char;
        }
        return `${result}…`;
    }

    /**
     * Форматирует элемент диалога в ОДНУ строку.
     * blessed.list жёстко задаёт элементам height: 1, поэтому любой перевод строки
     * в содержимом теряется без предупреждения.
     * @param {object} d
     * @param {number} width доступная ширина строки в символах
     * @returns {string}
     */
    function formatDialogItem(d, width) {
        const pinIcon = d.pinned ? "📌 " : "";
        const typeIcon =
            d.type === "channel" ? "📢 " :
            d.type === "supergroup" || d.type === "group" ? "👥 " :
            d.type === "bot" ? "🤖 " :
            d.type === "saved" ? "⭐ " : "👤 ";

        const timeStr = formatChatTime(d.date);
        const unreadStr = d.unreadCount > 0 ? ` [${d.unreadCount}]` : "";

        // Всё меряем в ячейках терминала: иконки — это эмодзи переменной ширины
        const fixedCells =
            cellWidth(pinIcon) + cellWidth(typeIcon) + cellWidth(timeStr) + cellWidth(unreadStr) + 2;
        const available = Math.max(10, (width || 40) - fixedCells);

        const rawTitle = d.title || "Чат";
        const rawPreview = (d.lastMessage?.text || "").replace(/\s+/g, " ").trim();

        // Название важнее превью: оно получает до 60% ширины (но не меньше 16 ячеек)
        // и никогда не больше доступного места — иначе строка вылезет за край и
        // бейдж непрочитанных обрежется. Превью занимает остаток и на узких
        // терминалах просто исчезает.
        const titleMax = Math.min(
            cellWidth(rawTitle),
            available,
            Math.max(16, Math.floor(available * 0.6))
        );
        const title = truncate(rawTitle, titleMax);
        const previewMax = available - cellWidth(title) - 3;
        const preview = previewMax >= 6 ? truncate(rawPreview, previewMax) : "";

        const unreadBadge = unreadStr
            ? ` ${badge(theme.chatList.itemUnreadBg, theme.chatList.itemUnreadFg, `{bold}${unreadStr}{/bold}`)}`
            : "";
        const previewPart = preview
            ? ` ${fg(theme.chatList.previewFg, `· ${escapeBlessed(preview)}`)}`
            : "";
        const titlePart = d.pinned
            ? fg(theme.chatList.pinnedFg, `{bold}${escapeBlessed(title)}{/bold}`)
            : `{bold}${escapeBlessed(title)}{/bold}`;

        return `${pinIcon}${typeIcon}${titlePart}${previewPart} ${fg(theme.chatList.timeFg, timeStr)}${unreadBadge}`;
    }

    /**
     * Обновляет отображаемый список диалогов.
     * @param {Array<object>} dialogs
     */
    function setDialogs(dialogs) {
        currentDialogs = dialogs;
        // Элементы списка живут внутри list и ещё на колонку уже из-за скроллбара
        // -1 колонка скроллбара, -1 запас: при подсчёте переноса blessed
        // прибавляет к ширине часть символов разметки
        const width = Math.max(10, list.width - 2);
        const items = dialogs.map((d) => formatDialogItem(d, width));
        list.setItems(items);
        screen.render();
    }

    // Обработка выбора диалога
    list.on("select", (item, index) => {
        if (currentDialogs[index]) {
            onSelectDialog?.(currentDialogs[index]);
        }
    });

    // Горячие клавиши для переключения вкладок внутри списка
    list.key(["1", "2", "3", "4", "5", "6"], (ch) => {
        const idx = parseInt(ch, 10) - 1;
        if (TAB_KEYS[idx]) {
            currentTab = TAB_KEYS[idx];
            renderTabs();
            onTabChange?.(currentTab);
        }
    });

    // Быстрый вход в режим поиска по нажатию "/"
    list.key(["/"], () => {
        searchBox.setValue("");
        searchBox.focus();
        screen.render();
    });

    // Обработка ввода в поле поиска
    searchBox.on("submit", (value) => {
        onSearchChange?.(value === SEARCH_PLACEHOLDER ? "" : value);
        list.focus();
    });

    searchBox.on("cancel", () => {
        searchBox.setValue(SEARCH_PLACEHOLDER);
        onSearchChange?.("");
        list.focus();
    });

    renderTabs();

    /** Подсвечивает рамку, когда список диалогов или строка поиска в фокусе. */
    function setFocusHighlight(active) {
        container.style.border.fg = active ? theme.borders.focusFg : theme.borders.fg;
        screen.render();
    }

    list.on("focus", () => setFocusHighlight(true));
    list.on("blur", (newTarget) => {
        if (newTarget !== searchBox && screen.focused !== searchBox) {
            setFocusHighlight(false);
        }
    });
    searchBox.on("focus", () => setFocusHighlight(true));
    searchBox.on("blur", (newTarget) => {
        if (newTarget !== list && screen.focused !== list) {
            setFocusHighlight(false);
        }
    });

    return {
        container,
        list,
        searchBox,
        setDialogs,
        setTab: (tab) => {
            currentTab = tab;
            renderTabs();
        },
        focus: () => list.focus(),
        /** Завершает режим ввода в строке поиска (см. inputBox.release). */
        release: () => {
            if (searchBox._reading && typeof searchBox._done === "function") {
                searchBox._done("stop");
            }
        },
    };
}
