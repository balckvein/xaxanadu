// input.js — keyboard state shared globally.
// Tracks which actions are held this frame and which were "just pressed".

const Input = (() => {
  const keymap = {
    left:  ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    up:    ["ArrowUp", "KeyW"],
    down:  ["ArrowDown", "KeyS"],
    jump:  ["Space", "KeyZ"],
    attack:["KeyJ", "KeyX"],
    magic: ["KeyK", "KeyC"],
    use:   ["Enter"],
  };

  const held = {};       // action -> bool (currently down)
  const pressed = {};    // action -> bool (down this frame, cleared each update)
  const codeToActions = {};

  for (const action in keymap) {
    held[action] = false;
    pressed[action] = false;
    for (const code of keymap[action]) {
      (codeToActions[code] = codeToActions[code] || []).push(action);
    }
  }

  window.addEventListener("keydown", (e) => {
    const actions = codeToActions[e.code];
    if (!actions) return;
    e.preventDefault();
    for (const a of actions) {
      if (!held[a]) pressed[a] = true; // edge: only on the initial press
      held[a] = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    const actions = codeToActions[e.code];
    if (!actions) return;
    e.preventDefault();
    for (const a of actions) held[a] = false;
  });

  return {
    held,
    // True only on the frame the key went down. Reads are non-destructive;
    // call endFrame() once per update to clear the edge flags.
    justPressed(action) { return !!pressed[action]; },
    endFrame() { for (const a in pressed) pressed[a] = false; },
  };
})();
