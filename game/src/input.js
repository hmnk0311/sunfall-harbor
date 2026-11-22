// Keyboard and mouse input: a held-key set, edge-triggered actions and the mouse
// position in canvas coordinates. The game polls it once per fixed step, so a press
// between two frames is never lost and never counted twice.

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

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (!event.repeat) {
      held.add(event.code);
      const action = KEY_ACTIONS[event.code];
      if (action) pressed.add(action);
    }
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
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
    /** True once per physical press; consumes the press. */
    consume(action) {
      if (!pressed.has(action)) return false;
      pressed.delete(action);
      return true;
    },
    consumeClick() {
      if (!mouse.clicked) return false;
      mouse.clicked = false;
      return true;
    },
    endFrame() {
      mouse.clicked = false;
    },
  };
}
