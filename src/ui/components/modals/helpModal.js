import blessed from "neo-blessed";
import { bindOutsideClickClose } from "../../modalMouse.js";

/**
 * Создаёт модальное окно справки по всем горячим клавишам и возможностям.
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @returns {{ show: () => void, hide: () => void }}
 */
export function createHelpModal(screen, theme) {
    const modal = blessed.box({
        parent: screen,
        top: "center",
        left: "center",
        width: "70%",
        height: "80%",
        hidden: true,
        tags: true,
        mouse: true,
        scrollable: true,
        border: {
            type: "line",
        },
        shadow: true,
        style: {
            bg: theme.modal.bg,
            fg: theme.modal.fg,
            border: {
                fg: theme.modal.borderFg,
            },
        },
    });

    const K_CYAN = `{${theme.accent}-fg}`;
    const K_GREEN = `{${theme.success}-fg}`;
    const K_YELLOW = `{${theme.warning}-fg}`;
    const K_MAGENTA = `{${theme.info}-fg}`;
    const K_RED = `{${theme.error}-fg}`;
    const K_GRAY = `{${theme.modal.hintFg}-fg}`;
    const K_END = "{/}";

    const content = `
 {bold}{underline}🚀 TuiGram — Горячие клавиши и управление{/underline}{/bold}

 {bold}Навигация и фокус:{/bold}
   ${K_CYAN}[Tab]${K_END} / ${K_CYAN}[Shift+Tab]${K_END}  Фокус по кругу: Список чатов → Лента сообщений → Ввод
   ${K_CYAN}[↑] / [↓]${K_END}           Список чатов: перемещение · Лента: выделение сообщения
   ${K_CYAN}[Enter]${K_END}             Открыть чат / Меню действий над выделенным сообщением
   ${K_CYAN}[PageUp] / [Ctrl+U]${K_END} Прокрутка сообщений вверх / Подгрузка старой истории
   ${K_CYAN}[PageDown] / [Ctrl+D]${K_END}Прокрутка сообщений вниз
   ${K_CYAN}[Home] / [End]${K_END}       Начало ленты (подгрузка истории) / Последнее сообщение

 {bold}Управление мышью:{/bold}
   ${K_CYAN}Клик по диалогу${K_END}      Мгновенно открыть чат
   ${K_CYAN}Колесо мыши${K_END}          Прокрутка списка чатов и сообщений (вверх — подгрузка истории)
   ${K_CYAN}Левый клик по сообщению${K_END}  Выделить сообщение (помечается полосой ▌ слева)
   ${K_CYAN}Правый клик по сообщению${K_END} Меню действий над сообщением
   ${K_CYAN}Клик по превью фото/видео${K_END}Открыть изображение или воспроизвести видео
   ${K_CYAN}  [Space] / [r]${K_END}          — в видеоплеере: пауза / перезапуск
   ${K_CYAN}Клик по вкладкам/кнопкам${K_END} Переключение фильтров и вызов действий
   ${K_GRAY}macOS Terminal.app перехватывает правый клик — там пользуйтесь [Enter] или [Ctrl+A]${K_END}
   ${K_CYAN}[F12]${K_END}               Отдать мышь терминалу, чтобы выделить и скопировать текст

 {bold}Вкладки фильтрации диалогов (нажмите цифру в списке чатов):{/bold}
   ${K_YELLOW}[1]${K_END} Все чаты       ${K_YELLOW}[2]${K_END} Личные (ЛС)     ${K_YELLOW}[3]${K_END} Группы
   ${K_YELLOW}[4]${K_END} Каналы         ${K_YELLOW}[5]${K_END} Боты            ${K_YELLOW}[6]${K_END} Непрочитанные
   ${K_YELLOW}[/]${K_END} Поиск чатов по названию/username

 {bold}Работа с сообщениями:{/bold}
   ${K_GREEN}[Enter]${K_END}             Отправить набранный текст
   ${K_GREEN}[Ctrl+J]${K_END}            Перенос строки без отправки
   ${K_GREEN}[Ctrl+R]${K_END}            Ответить (Reply) на выделенное, иначе — на последнее
   ${K_GREEN}[Ctrl+E]${K_END}            Редактировать выделенное своё, иначе — последнее своё
   ${K_GREEN}[Ctrl+A]${K_END}            Контекстное меню действий (Реакции, Удаление, Скачивание)
   ${K_GREEN}[Ctrl+O]${K_END}            Отправить файл / картинку / документ
   ${K_GREEN}  [Ctrl+F]${K_END}          — в окне отправки: обзор файлов
   ${K_GREEN}  [Ctrl+D]${K_END}          — в окне отправки: послать без сжатия, файлом
   ${K_GREEN}[Ctrl+P]${K_END}            Информация о текущем чате (ID, участники, ссылки)
   ${K_GREEN}[Esc]${K_END}               Сбросить режим ответа / редактирования / закрыть окно

 {bold}Слэш-команды в поле ввода:{/bold}
   ${K_MAGENTA}/help${K_END}               Показать данную справку
   ${K_MAGENTA}/info${K_END}               Сведения о текущем чате
   ${K_MAGENTA}/sendfile${K_END}           Открыть окно отправки файла
   ${K_MAGENTA}/sendfile <путь>${K_END}    Отправить файл (поддерживает ~ и пути с пробелами)
   ${K_MAGENTA}/sendfile a | b -- текст${K_END}
                       Альбом из нескольких файлов с подписью
   ${K_MAGENTA}/clear${K_END}              Очистить историю сообщений на экране
   ${K_MAGENTA}/logout${K_END}             Выйти из аккаунта

 {bold}Выход:{/bold}
   ${K_RED}[Ctrl+Q]${K_END} или ${K_RED}[Ctrl+C]${K_END}   Безопасный выход из клиента
`;

    modal.setContent(content);

    const closeBtn = blessed.button({
        parent: modal,
        bottom: 1,
        left: "center",
        width: 16,
        height: 1,
        mouse: true,
        content: " [ Закрыть ] ",
        align: "center",
        tags: true,
        style: {
            bg: theme.accent,
            fg: theme.onAccent,
            focus: {
                bg: theme.modal.buttonFocusBg,
                fg: theme.modal.buttonFocusFg,
                bold: true,
            },
        },
    });

    let previousFocus = null;

    function hide() {
        modal.hide();
        if (previousFocus) {
            previousFocus.focus();
            previousFocus = null;
        }
        screen.render();
    }

    function show() {
        previousFocus = screen.focused;
        armOutsideClose();
        modal.show();
        modal.setFront();
        closeBtn.focus();
        screen.render();
    }

    closeBtn.on("press", hide);
    closeBtn.on("click", hide);
    // Клавиши вешаем на кнопку: blessed отдаёт события только сфокусированному элементу.
    closeBtn.key(["escape", "q", "f1"], hide);

    // Закрытие при клике мышью мимо модального окна
    const armOutsideClose = bindOutsideClickClose(screen, modal, hide);

    return {
        modal,
        show,
        hide,
    };
}
