/**
 * Общее мышиное поведение модальных окон.
 */

import { isInsideBox } from "../utils/mouse.js";

/**
 * Подключает закрытие модального окна по клику мимо него.
 *
 * neo-blessed рассылает клик сначала элементу под курсором, а сразу за ним, в том же
 * такте, — экрану (см. Screen.prototype._listenMouse). Поэтому клик, которым окно
 * открыли (кнопка строки состояния, шапка, сообщение в ленте), доходил бы до этого
 * обработчика и закрывал только что открытое окно. Возвращаемая функция «взводит»
 * закрытие лишь на следующем такте — её вызывает show() окна.
 *
 * @param {import("neo-blessed").Widgets.Screen} screen
 * @param {import("neo-blessed").Widgets.BoxElement} modal
 * @param {() => void} hide
 * @returns {() => void} arm — взводит закрытие по внешнему клику
 */
export function bindOutsideClickClose(screen, modal, hide) {
    let armed = false;

    screen.on("click", (data) => {
        if (!armed || !modal.visible) return;
        const inside = isInsideBox(data.x, data.y, {
            left: modal.aleft,
            top: modal.atop,
            width: modal.width,
            height: modal.height,
        });
        if (!inside) {
            hide();
        }
    });

    return () => {
        armed = false;
        setImmediate(() => {
            armed = true;
        });
    };
}
