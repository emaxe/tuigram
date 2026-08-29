#!/usr/bin/env bash

# ==============================================================================
# TuiGram Interactive Launcher & Manager
# ==============================================================================

# Определение директории скрипта
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Цветовые ANSI коды для printf
C_RESET="\033[0m"
C_BOLD="\033[1m"
C_RED="\033[31m"
C_GREEN="\033[32m"
C_YELLOW="\033[33m"
C_BLUE="\033[34m"
C_MAGENTA="\033[35m"
C_CYAN="\033[36m"
C_GRAY="\033[90m"

INTERACTIVE="false"

# Функция вывода разделителя
print_divider() {
    printf "%b----------------------------------------------------------------------%b\n" "$C_GRAY" "$C_RESET"
}

# Функция вывода шапки
print_banner() {
    printf "\033[2J\033[H"
    printf "%b======================================================================%b\n" "$C_CYAN" "$C_RESET"
    printf "%b  🚀 TuiGram — Полнофункциональный TUI & CLI клиент Telegram%b\n" "$C_BOLD$C_GREEN" "$C_RESET"
    printf "%b  Версия: 1.0.0 | Директория: %s%b\n" "$C_GRAY" "$SCRIPT_DIR" "$C_RESET"
    printf "%b======================================================================%b\n\n" "$C_CYAN" "$C_RESET"
}

# Пауза перед возвратом в интерактивном меню
pause_return() {
    if [ "$INTERACTIVE" = "true" ]; then
        printf "%bНажмите Enter для возврата в меню...%b" "$C_GRAY" "$C_RESET"
        read -r _
    fi
}

# Проверка установленных зависимостей
check_dependencies() {
    if [ ! -d "node_modules" ]; then
        printf "%b[!] Каталог node_modules не найден. Устанавливаем зависимости...%b\n\n" "$C_YELLOW" "$C_RESET"
        npm install
        printf "\n%b[✓] Зависимости успешно установлены.%b\n" "$C_GREEN" "$C_RESET"
        pause_return
    fi
}

# 1. Запуск TUI клиента
run_tui() {
    print_banner
    printf "%b[▶] Запуск полноэкранного TUI клиента...%b\n\n" "$C_GREEN" "$C_RESET"
    node bin/tuigram.js tui
}

# 2. Логин / Авторизация
run_login() {
    print_banner
    printf "%b[🔑] Интерактивная авторизация в Telegram%b\n" "$C_BOLD$C_YELLOW" "$C_RESET"
    print_divider
    node bin/tuigram.js login
    printf "\n"
    print_divider
    pause_return
}

# 3. Список диалогов
run_dialogs() {
    print_banner
    printf "%b[📂] Просмотр списка диалогов%b\n" "$C_BOLD$C_CYAN" "$C_RESET"
    print_divider
    printf "%bВведите лимит диалогов (по умолчанию 30): %b" "$C_YELLOW" "$C_RESET"
    read -r limit_input
    limit="${limit_input:-30}"

    printf "\n%bЗагрузка диалогов...%b\n\n" "$C_GRAY" "$C_RESET"
    node bin/tuigram.js dialogs --limit "$limit"
    printf "\n"
    print_divider
    pause_return
}

# 4. История сообщений
run_history() {
    print_banner
    printf "%b[💬] Чтение истории сообщений%b\n" "$C_BOLD$C_CYAN" "$C_RESET"
    print_divider
    printf "%bВведите peer (@username, -100..., me): %b" "$C_YELLOW" "$C_RESET"
    read -r peer_input
    if [ -z "$peer_input" ]; then
        printf "%b[!] Peer не указан.%b\n" "$C_RED" "$C_RESET"
        sleep 1
        return
    fi

    printf "%bКоличество сообщений (по умолчанию 20): %b" "$C_YELLOW" "$C_RESET"
    read -r limit_input
    limit="${limit_input:-20}"

    printf "\n%bЗагрузка сообщений из %s...%b\n\n" "$C_GRAY" "$peer_input" "$C_RESET"
    node bin/tuigram.js history "$peer_input" --limit "$limit"
    printf "\n"
    print_divider
    pause_return
}

# 5. Отправка текстового сообщения
run_send() {
    print_banner
    printf "%b[✉️] Отправка текстового сообщения%b\n" "$C_BOLD$C_GREEN" "$C_RESET"
    print_divider
    printf "%bКому отправить (@username, ID, me): %b" "$C_YELLOW" "$C_RESET"
    read -r peer_input
    if [ -z "$peer_input" ]; then
        printf "%b[!] Получатель не указан.%b\n" "$C_RED" "$C_RESET"
        sleep 1
        return
    fi

    printf "%bВведите текст сообщения: %b" "$C_YELLOW" "$C_RESET"
    read -r text_input
    if [ -z "$text_input" ]; then
        printf "%b[!] Текст сообщения пуст.%b\n" "$C_RED" "$C_RESET"
        sleep 1
        return
    fi

    printf "\n%bОтправка...%b\n" "$C_GRAY" "$C_RESET"
    node bin/tuigram.js send "$peer_input" "$text_input"
    printf "\n"
    print_divider
    pause_return
}

# 6. Отправка файла
run_sendfile() {
    print_banner
    printf "%b[📎] Отправка файла или документа%b\n" "$C_BOLD$C_MAGENTA" "$C_RESET"
    print_divider
    printf "%bКому отправить (@username, ID, me): %b" "$C_YELLOW" "$C_RESET"
    read -r peer_input
    if [ -z "$peer_input" ]; then
        printf "%b[!] Получатель не указан.%b\n" "$C_RED" "$C_RESET"
        sleep 1
        return
    fi

    printf "%bПуть к файлу на диске: %b" "$C_YELLOW" "$C_RESET"
    read -r file_input
    if [ -z "$file_input" ] || [ ! -f "$file_input" ]; then
        printf "%b[!] Файл не существует: %s%b\n" "$C_RED" "$file_input" "$C_RESET"
        pause_return
        return
    fi

    printf "%bПодпись к файлу (опционально): %b" "$C_YELLOW" "$C_RESET"
    read -r caption_input

    printf "\n%bОтправка файла...%b\n" "$C_GRAY" "$C_RESET"
    if [ -n "$caption_input" ]; then
        node bin/tuigram.js sendfile "$peer_input" "$file_input" --caption "$caption_input"
    else
        node bin/tuigram.js sendfile "$peer_input" "$file_input"
    fi

    printf "\n"
    print_divider
    pause_return
}

# 7. Live стрим обновлений
run_listen() {
    print_banner
    printf "%b[📡] Потоковый мониторинг обновлений в реальном времени%b\n" "$C_BOLD$C_GREEN" "$C_RESET"
    printf "%bДля завершения мониторинга нажмите Ctrl+C%b\n" "$C_YELLOW" "$C_RESET"
    print_divider
    node bin/tuigram.js listen
    printf "\n"
    print_divider
    pause_return
}

# 8. Запуск тестов и проверка синтаксиса
run_tests() {
    print_banner
    printf "%b[🧪] Запуск юнит-тестов и проверки синтаксиса%b\n" "$C_BOLD$C_CYAN" "$C_RESET"
    print_divider
    npm test
    printf "\n%b[+] Проверка синтаксиса модулей...%b\n" "$C_CYAN" "$C_RESET"
    node --check src/index.js && \
    node --check src/config.js && \
    node --check src/state.js && \
    node --check src/telegram/*.js && \
    node --check src/ui/*.js && \
    node --check src/ui/components/*.js && \
    node --check src/ui/components/modals/*.js && \
    node --check src/cli/*.js && \
    node --check src/utils/*.js && \
    printf "%b[✓] Все синтаксические проверки успешно пройдены!%b\n" "$C_GREEN" "$C_RESET"
    printf "\n"
    print_divider
    pause_return
}

# 9. Установка зависимостей
run_install() {
    print_banner
    printf "%b[📦] Установка / обновление npm зависимостей%b\n" "$C_BOLD$C_YELLOW" "$C_RESET"
    print_divider
    npm install
    printf "\n%b[✓] Готово!%b\n" "$C_GREEN" "$C_RESET"
    print_divider
    pause_return
}

# 10. Очистка кэша и временных файлов
run_clean() {
    print_banner
    printf "%b[🧹] Очистка временных файлов и логов%b\n" "$C_BOLD$C_RED" "$C_RESET"
    print_divider
    printf "%bВы действительно хотите очистить загрузки и логи? [y/N]: %b" "$C_YELLOW" "$C_RESET"
    read -r confirm
    if [[ "$confirm" =~ ^[YyДд]$ ]]; then
        rm -rf data/downloads/*.tmp *.log
        printf "%b[✓] Временные файлы очищены.%b\n" "$C_GREEN" "$C_RESET"
    else
        printf "%b[-] Очистка отменена.%b\n" "$C_GRAY" "$C_RESET"
    fi
    print_divider
    pause_return
}

# Главный цикл меню
main_menu() {
    INTERACTIVE="true"
    check_dependencies

    while true; do
        print_banner
        printf "%bВыберите режим работы:%b\n\n" "$C_BOLD" "$C_RESET"

        printf "  %b1)%b  %b🚀 Запуск TUI клиента%b             %b(Интерактивный терминальный интерфейс)%b\n" "$C_GREEN" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_GRAY" "$C_RESET"
        printf "  %b2)%b  %b🔑 Авторизация / Логин%b           %b(Вход по номеру телефона, коду и 2FA)%b\n" "$C_YELLOW" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_GRAY" "$C_RESET"
        printf "  %b3)%b  %b📂 Список диалогов%b               %b(CLI просмотр чатов и каналов)%b\n" "$C_CYAN" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_GRAY" "$C_RESET"
        printf "  %b4)%b  %b💬 Чтение истории чата%b           %b(CLI вывод сообщений чата)%b\n" "$C_CYAN" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_GRAY" "$C_RESET"
        printf "  %b5)%b  %b✉️  Быстрая отправка текста%b       %b(CLI отправка сообщения)%b\n" "$C_GREEN" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_GRAY" "$C_RESET"
        printf "  %b6)%b  %b📎 Отправка файла / фото%b         %b(CLI передача документа)%b\n" "$C_MAGENTA" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_GRAY" "$C_RESET"
        printf "  %b7)%b  %b📡 Live мониторинг событий%b       %b(Поток обновлений в реальном времени)%b\n" "$C_GREEN" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_GRAY" "$C_RESET"
        printf "  %b8)%b  %b🧪 Тесты и проверка кода%b         %b(Unit-тесты и syntax check)%b\n" "$C_BLUE" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_GRAY" "$C_RESET"
        printf "  %b9)%b  %b📦 Установка зависимостей%b        %b(npm install)%b\n" "$C_YELLOW" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_GRAY" "$C_RESET"
        printf "  %b10)%b %b🧹 Очистка кэша и логов%b          %b(Удаление временных файлов)%b\n" "$C_RED" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_GRAY" "$C_RESET"
        printf "  %b0)%b  %b🚪 Выход%b\n\n" "$C_RED" "$C_RESET" "$C_BOLD" "$C_RESET"

        print_divider
        printf "%bВведите номер действия [0-10]: %b" "$C_BOLD$C_CYAN" "$C_RESET"
        read -r choice

        case "$choice" in
            1) run_tui ;;
            2) run_login ;;
            3) run_dialogs ;;
            4) run_history ;;
            5) run_send ;;
            6) run_sendfile ;;
            7) run_listen ;;
            8) run_tests ;;
            9) run_install ;;
            10) run_clean ;;
            0|q|Q)
                printf "\n%b👋 До свидания!%b\n\n" "$C_GREEN" "$C_RESET"
                exit 0
                ;;
            *)
                printf "\n%b[!] Неверный выбор. Пожалуйста, введите число от 0 до 10.%b\n" "$C_RED" "$C_RESET"
                sleep 1.2
                ;;
        esac
    done
}

# Если переданы аргументы командной строки — запускаем соответствующее действие напрямую
if [ $# -gt 0 ]; then
    case "$1" in
        tui|start) run_tui ;;
        login) run_login ;;
        dialogs) run_dialogs ;;
        history) run_history ;;
        send) run_send ;;
        sendfile) run_sendfile ;;
        listen) run_listen ;;
        test|tests) run_tests ;;
        install) run_install ;;
        clean) run_clean ;;
        help|--help|-h)
            printf "%bИспользование: ./run.sh [команда]%b\n" "$C_BOLD" "$C_RESET"
            printf "Команды: tui, login, dialogs, history, send, sendfile, listen, test, install, clean\n"
            printf "Без аргументов запускается интерактивное меню.\n"
            ;;
        *)
            printf "%b[!] Неизвестный аргумент: %s%b\n" "$C_RED" "$1" "$C_RESET"
            printf "Запустите %b./run.sh --help%b для справки.\n" "$C_CYAN" "$C_RESET"
            exit 1
            ;;
    esac
else
    main_menu
fi
