import blessed from "neo-blessed";
import { formatChatTime } from "../../utils/time.js";
import { escapeBlessed } from "../../telegram/formatter.js";
import { fg, badge, getTheme } from "../theme.js";
import unicode from "neo-blessed/lib/unicode.js";
import { getTabByCoordinate, isRightClick } from "../../utils/mouse.js";

/** Пиктограммы и эмодзи, занимающие две ячейки терминала. */
const WIDE_CHAR = /\p{Extended_Pictographic}|[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/u;

/**
 * Ширина строки в ячейках терминала по той же модели, которой пользуется
 * blessed при отрисовке. Считать через .length нельзя: эмодзи занимают
 * две ячейки, а в UTF-16 это одна-две единицы — из-за расхождения строка
 * вылезала за край, blessed резал её посреди бейджа непрочитанных и хвост
 * оставался залит фоном бейджа.
 * @param {string} text
 * @returns {number}
 */
export function cellWidth(text) {
    if (!text) return 0;
    let width = 0;
    for (const char of text) {
        const byBlessed = unicode.strWidth(char);
        // Эмодзи терминал рисует в две ячейки, а blessed считает их за одну.
        // Берём максимум: бюджет должен быть верен для обеих моделей, иначе
        // строка вылезает за край в реальном терминале.
        width += WIDE_CHAR.test(char) ? Math.max(2, byBlessed) : byBlessed;
    }
    return width;
}

/**
 * Обрезает строку до заданной ширины в ячейках терминала с добавлением многоточия.
 * @param {string} text
 * @param {number} maxCells
 * @returns {string}
 */
export function truncate(text, maxCells) {
    if (maxCells <= 0) return "";
    if (cellWidth(text) <= maxCells) return text;
    if (maxCells === 1) return "…";

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
 * Форматирует элемент диалога в одну строку фиксированной ширины.
 * Бейдж непрочитанных сообщений и время всегда прижаты максимально вправо
 * в единой ровной колонке, а название диалога и превью сообщения обрезаются
 * при нехватке места.
 * @param {object} d данные диалога
 * @param {number} width доступная ширина строки в ячейках
 * @param {object} [theme] активная тема оформления
 * @returns {string}
 */
export function formatDialogItem(d, width, theme = getTheme("default")) {
    const totalWidth = width || 40;
    const pinIcon = d.pinned ? "📌 " : "";
    const typeIcon =
        d.type === "channel" ? "📢 " :
        d.type === "supergroup" || d.type === "group" ? "👥 " :
        d.type === "bot" ? "🤖 " :
        d.type === "saved" ? "⭐ " : "👤 ";

    const timeStr = formatChatTime(d.date);
    const unreadCount = Number(d.unreadCount) || 0;
    const hasUnread = unreadCount > 0;
    const unreadStr = hasUnread ? (unreadCount > 99 ? "[99+]" : `[${unreadCount}]`) : "";

    // 1. Формируем правый блок: время и бейдж непрочитанных (при наличии)
    let rightPart = "";
    let rightCells = 0;

    if (hasUnread) {
        const badgeEl = badge(theme.chatList.itemUnreadBg, theme.chatList.itemUnreadFg, `{bold}${unreadStr}{/bold}`);
        if (timeStr) {
            rightPart = `${fg(theme.chatList.timeFg, timeStr)} ${badgeEl}`;
            rightCells = cellWidth(timeStr) + 1 + cellWidth(unreadStr);
        } else {
            rightPart = badgeEl;
            rightCells = cellWidth(unreadStr);
        }
    } else if (timeStr) {
        rightPart = fg(theme.chatList.timeFg, timeStr);
        rightCells = cellWidth(timeStr);
    }

    // 2. Рассчитываем доступную ширину для левой части
    const maxLeftCells = Math.max(0, totalWidth - rightCells - (rightCells > 0 ? 1 : 0));
    const prefix = `${pinIcon}${typeIcon}`;
    const prefixCells = cellWidth(prefix);
    const maxContentCells = Math.max(0, maxLeftCells - prefixCells);

    const rawTitle = d.title || "Чат";
    const rawPreview = (d.lastMessage?.text || "").replace(/\s+/g, " ").trim();

    let title = "";
    let preview = "";

    if (cellWidth(rawTitle) > maxContentCells) {
        // Название не вмещается полностью — обрезаем с троеточием, превью опускаем
        title = truncate(rawTitle, maxContentCells);
    } else {
        // Название вместилось полностью
        title = rawTitle;
        const remainingForPreview = maxContentCells - cellWidth(title);
        // " · " занимает 3 ячейки, поэтому для текста превью нужно хотя бы ещё 3 ячейки
        if (rawPreview && remainingForPreview >= 6) {
            preview = truncate(rawPreview, remainingForPreview - 3);
        }
    }

    const previewPart = preview
        ? ` ${fg(theme.chatList.previewFg, `· ${escapeBlessed(preview)}`)}`
        : "";
    const titlePart = d.pinned
        ? fg(theme.chatList.pinnedFg, `{bold}${escapeBlessed(title)}{/bold}`)
        : `{bold}${escapeBlessed(title)}{/bold}`;

    const leftPart = `${prefix}${titlePart}${previewPart}`;
    const leftCells = prefixCells + cellWidth(title) + (preview ? 3 + cellWidth(preview) : 0);

    // 3. Выравнивание: дополняем пробелами, чтобы правый блок был прижат к правому краю
    const paddingCells = Math.max(rightCells > 0 && leftCells > 0 ? 1 : 0, totalWidth - leftCells - rightCells);
    const padding = " ".repeat(paddingCells);

    return `${leftPart}${padding}${rightPart}`;
}

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
        if (isRightClick(data)) return;
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
        if (screen.focused !== searchBox) {
            searchBox.focus();
        }
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
        item.on("click", (data) => {
            if (isRightClick(data)) return;
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
     * Вычисляет реальную доступную ширину для элемента списка диалогов.
     * @returns {number}
     */
    function getAvailableWidth() {
        let w = 0;
        if (typeof list.width === "number" && list.width > 0) {
            // list.width — ширина списка внутри рамки контейнера; -1 на полосу скроллбара
            w = list.width - 1;
        } else if (typeof container.width === "number" && container.width > 0) {
            // container.width: -2 рамка, -1 скроллбар
            w = container.width - 3;
        } else if (screen?.cols > 0) {
            // Контейнер 35% от экрана: -2 рамка, -1 скроллбар
            w = Math.floor(screen.cols * 0.35) - 3;
        }
        return Math.max(10, w || 32);
    }

    /**
     * Обновляет отображаемый список диалогов.
     * @param {Array<object>} dialogs
     */
    function setDialogs(dialogs) {
        currentDialogs = dialogs;
        const width = getAvailableWidth();
        const items = dialogs.map((d) => formatDialogItem(d, width, theme));
        list.setItems(items);
        screen.render();
    }

    screen.on("resize", () => {
        if (currentDialogs.length > 0) {
            setDialogs(currentDialogs);
        }
    });

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
