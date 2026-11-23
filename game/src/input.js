// Keyboard and mouse input: a held-key set, edge-triggered actions and the mouse
// position in canvas coordinates. The game polls it once per fixed step, so a press
// between two frames is never lost and never counted twice — but a one-shot press
// only stays valid for a short window and is dropped at context transitions, so it
// can never fire later in a screen or mode it was not pressed in.

export const ACTION_INTERACT = 'interact';
export const ACTION_PAUSE = 'pause';
export const ACTION_CONFIRM = 'confirm';
export const ACTION_RELOAD = 'reload';
export const ACTION_SHOOT_KEY = 'shoot-key';

const KEY_ACTIONS = {
  KeyE: ACTION_INTERACT,
  KeyF: ACTION_INTERACT,
  Escape: ACTION_PAUSE,
  KeyP: ACTION_PAUSE,
  Enter: ACTION_CONFIRM,
  KeyR: ACTION_RELOAD,
  KeyJ: ACTION_SHOOT_KEY,
};

/** How long a one-shot press stays valid, in seconds. A press nobody consumed
 * within this window belongs to a context that has passed: it is dropped
 * instead of firing later somewhere it was never meant for. */
const ACTION_WINDOW_SECONDS = 0.25;

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const pressedAt = new Map();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  let clickedAt = -Infinity;
  let blurred = false;

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (!event.repeat) {
      held.add(event.code);
      const action = KEY_ACTIONS[event.code];
      if (action) {
        pressed.add(action);
        pressedAt.set(action, performance.now() / 1000);
      }
    }
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    blurred = true;
    held.clear();
    pressed.clear();
    pressedAt.clear();
    mouse.down = false;
    mouse.clicked = false;
  });

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
      clickedAt = performance.now() / 1000;
    }
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });

  return {
    mouse,
    /** Movement axes from WASD / arrows: x -1..1, y -1..1 (not normalised). */
    moveAxis() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    /** Driving controls for the car the player sits in. */
    drive() {
      return {
        throttle: held.has('KeyW') || held.has('ArrowUp') ? 1 : held.has('KeyS') || held.has('ArrowDown') ? -1 : 0,
        steer: (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0),
        handbrake: held.has('Space'),
      };
    },
    sprint() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    /** True once per physical press; consumes the press. A press older than
     * the action window is stale — it is consumed but does not fire. */
    consume(action) {
      if (!pressed.has(action)) return false;
      pressed.delete(action);
      const at = pressedAt.get(action) ?? -Infinity;
      pressedAt.delete(action);
      return performance.now() / 1000 - at <= ACTION_WINDOW_SECONDS;
    },
    consumeClick() {
      if (!mouse.clicked) return false;
      mouse.clicked = false;
      return performance.now() / 1000 - clickedAt <= ACTION_WINDOW_SECONDS;
    },
    /** Drop every pending one-shot action and click. Held movement keys are
     * not actions and keep working. The game calls this when the screen or
     * the foot/car context changes, so a press made in the old context can
     * never fire in the new one. */
    clearActions() {
      pressed.clear();
      pressedAt.clear();
      mouse.clicked = false;
    },
    /** True once after the window loses focus, so the game can pause itself. */
    consumeBlur() {
      if (!blurred) return false;
      blurred = false;
      return true;
    },
    endFrame() {
      // The main loop calls this only after at least one simulation step has
      // had a chance to consume the click. On high-refresh displays several
      // rendered frames can pass between steps; clearing there lost clicks.
      mouse.clicked = false;
    },
  };
}
