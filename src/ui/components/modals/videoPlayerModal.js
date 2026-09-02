import blessed from "neo-blessed";
import { fg } from "../../theme.js";
import { config } from "../../../config.js";
import { findFfmpegPath, findFfplayPath, spawnVideoPlayer, spawnAudioPlayer } from "../../../utils/video.js";
import { formatDuration } from "../../../utils/time.js";

/**
 * Создаёт полноэкранное модальное окно воспроизведения видео в терминале.
 *
 * Декодирует видеопоток через ffmpeg и выводит кадры в Unicode Half-Block псевдографике,
 * синхронизируя аудиодорожку через системный аудиоплеер (afplay / ffplay).
 *
 * @param {blessed.Widgets.Screen} screen
 * @param {object} theme
 * @param {object} callbacks
 * @param {(msg: object, onProgress?: (p: number) => void) => Promise<string>} [callbacks.onLoadVideoFile]
 * @param {(msg: object, size: { maxWidth: number, maxHeight: number }) => string} [callbacks.onRenderPlaceholder]
 * @returns {{ modal: object, play: (msg: object) => void, hide: () => void, isVisible: () => boolean }}
 */
export function createVideoPlayerModal(screen, theme, { onLoadVideoFile, onRenderPlaceholder } = {}) {
    const modal = blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        hidden: true,
        mouse: true,
        style: {
            bg: theme.bg,
            fg: theme.fg,
        },
    });

    const canvas = blessed.box({
        parent: modal,
        top: 0,
        left: 0,
        right: 0,
        bottom: 1,
        tags: true,
        align: "center",
        valign: "middle",
        style: {
            bg: theme.bg,
            fg: theme.fg,
        },
    });

    const footer = blessed.box({
        parent: modal,
        bottom: 0,
        left: 0,
        right: 0,
        height: 1,
        tags: true,
        style: {
            bg: theme.status.bg,
            fg: theme.status.fg,
        },
    });

    let currentMsg = null;
    let currentVideoPath = null;
    let videoProcess = null;
    let audioProcess = null;
    let isPaused = false;
    let statusText = "";
    let previousFocus = null;
    let token = 0;
    let frameCount = 0;

    /** Размер холста видео в ячейках/пикселях. */
    function viewportDimensions() {
        const screenW = screen.width || 80;
        const screenH = screen.height || 24;
        const width = Math.max(10, Math.min(screenW - 2, 80));
        // Высота в пикселях: 2 пикселя на 1 терминальную строку
        let height = Math.max(8, Math.min((screenH - 2) * 2, 60));
        if (height % 2 !== 0) height -= 1;
        return { width, height };
    }

    function renderFooter() {
        const id = currentMsg ? `#${currentMsg.id}` : "";
        const status = statusText ? `${fg(theme.warning, statusText)} ${fg(theme.dim, "│")} ` : "";
        const pauseTag = isPaused ? `${fg(theme.danger, "[ПАУЗА]")} ${fg(theme.dim, "│")} ` : "";
        const fpsTag = videoProcess ? `${fg(theme.dim, `FPS: ${config.videoFps}`)} ${fg(theme.dim, "│")} ` : "";

        footer.setContent(
            ` ${fg(theme.accent, id)} ${fg(theme.dim, "│")} ${pauseTag}${status}${fpsTag}${fg(theme.muted, "[Space] Пауза · [r] С начала · [Esc/q] Закрыть")}`
        );
    }

    function stopProcesses() {
        if (videoProcess) {
            videoProcess.kill();
            videoProcess = null;
        }
        if (audioProcess) {
            audioProcess.kill();
            audioProcess = null;
        }
        isPaused = false;
    }

    function hide() {
        token++;
        stopProcesses();
        modal.hide();
        currentMsg = null;
        currentVideoPath = null;
        statusText = "";
        frameCount = 0;
        canvas.setContent("");
        if (previousFocus) {
            previousFocus.focus();
            previousFocus = null;
        }
        screen.render();
    }

    function togglePause() {
        if (!videoProcess) return;
        if (isPaused) {
            videoProcess.resume();
            audioProcess?.resume();
            isPaused = false;
        } else {
            videoProcess.pause();
            audioProcess?.pause();
            isPaused = true;
        }
        renderFooter();
        screen.render();
    }

    function startPlayback(filePath, myToken) {
        if (myToken !== token) return;
        stopProcesses();

        const ffmpegPath = findFfmpegPath();
        if (!ffmpegPath) {
            statusText = "ffmpeg не найден. Запустите: tuigram install-video";
            renderFooter();
            screen.render();
            return;
        }

        const { width, height } = viewportDimensions();
        statusText = "";
        frameCount = 0;
        renderFooter();

        // Запуск аудиодорожки
        if (config.videoAudio) {
            const ffplayPath = findFfplayPath();
            audioProcess = spawnAudioPlayer(filePath, { ffplayPath });
        }

        // Запуск декодирования видео
        videoProcess = spawnVideoPlayer(ffmpegPath, filePath, {
            width,
            height,
            fps: config.videoFps,
            onFrame: (frameText) => {
                if (myToken !== token) return;
                frameCount++;
                canvas.setContent(frameText);
                renderFooter();
                screen.render();
            },
            onEnd: () => {
                if (myToken !== token) return;
                statusText = "Воспроизведение завершено";
                if (audioProcess) {
                    audioProcess.kill();
                    audioProcess = null;
                }
                renderFooter();
                screen.render();
            },
            onError: (err) => {
                if (myToken !== token) return;
                statusText = `Ошибка декодирования: ${err.message}`;
                if (audioProcess) {
                    audioProcess.kill();
                    audioProcess = null;
                }
                renderFooter();
                screen.render();
            },
        });
    }

    /**
     * Открывает полноэкранный плеер для воспроизведения видеосообщения.
     * @param {object} msg нормализованное сообщение
     */
    async function play(msg) {
        if (!msg) return;

        const myToken = ++token;
        stopProcesses();

        currentMsg = msg;
        currentVideoPath = null;
        previousFocus = screen.focused;
        isPaused = false;

        // Показываем статичную миниатюру на время подготовки
        const { width, height } = viewportDimensions();
        const placeholder = onRenderPlaceholder?.(msg, { maxWidth: width, maxHeight: Math.floor(height / 2) }) || "";
        canvas.setContent(placeholder);

        modal.show();
        modal.setFront();
        modal.focus();

        if (!config.enableVideo) {
            statusText = "Проигрывание видео выключено. Включите ENABLE_VIDEO=true в .env";
            renderFooter();
            screen.render();
            return;
        }

        const ffmpegPath = findFfmpegPath();
        if (!ffmpegPath) {
            statusText = "ffmpeg не найден. Запустите: tuigram install-video";
            renderFooter();
            screen.render();
            return;
        }

        statusText = "Загрузка видеофайла...";
        renderFooter();
        screen.render();

        try {
            const filePath = await onLoadVideoFile?.(msg, (p) => {
                if (myToken !== token) return;
                const percent = Math.round((p || 0) * 100);
                statusText = `Загрузка: ${percent}%...`;
                renderFooter();
                screen.render();
            });

            if (myToken !== token || !filePath) return;
            currentVideoPath = filePath;
            startPlayback(filePath, myToken);
        } catch (err) {
            if (myToken !== token) return;
            statusText = `Ошибка загрузки: ${err.message}`;
            renderFooter();
            screen.render();
        }
    }

    modal.key(["space"], togglePause);
    modal.key(["r", "R"], () => {
        if (currentVideoPath) {
            startPlayback(currentVideoPath, token);
        }
    });
    modal.key(["escape", "q"], hide);
    modal.on("click", togglePause);

    return {
        modal,
        play,
        hide,
        isVisible: () => modal.visible,
    };
}
