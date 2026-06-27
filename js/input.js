// input.js — unified input from keyboard AND Xbox/standard gamepad.
//
// Each frame the game calls Input.poll() (which merges keyboard + gamepad into
// `held`), reads held/justPressed, then calls Input.endFrame() to snapshot the
// frame for edge detection.
//
// Press the ` (backtick) key to toggle an on-screen gamepad debug overlay.

const Input = (() => {
  const actions = ["left", "right", "up", "down", "jump", "attack", "magic", "pause", "fullscreen", "dash", "invert", "use"];

  // ---- keyboard ----
  const keymap = {
    left:  ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    up:    ["ArrowUp", "KeyW"],   // climb / enter doors
    down:  ["ArrowDown", "KeyS"], // climb down
    jump:  ["Space"],
    attack:["ShiftLeft", "ShiftRight"],
    magic: ["Enter"],
    pause: ["KeyP", "Escape"],
    fullscreen: ["KeyF"],
    dash:  ["KeyL"], // air/ground dash (ability-gated)
    invert:["KeyG"], // grav-flip toggle (ability-gated)
    use:   ["KeyQ"], // use a stocked Elixir (heal item)
  };

  const kbHeld = {};
  const held = {};
  const prev = {};
  const codeToActions = {};
  let debug = false;

  for (const a of actions) { kbHeld[a] = false; held[a] = false; prev[a] = false; }
  for (const a in keymap) for (const code of keymap[a]) (codeToActions[code] = codeToActions[code] || []).push(a);

  window.addEventListener("keydown", (e) => {
    if (e.code === "Backquote") { debug = !debug; e.preventDefault(); return; }
    const acts = codeToActions[e.code];
    if (!acts) return;
    e.preventDefault();
    for (const a of acts) kbHeld[a] = true;
  });
  window.addEventListener("keyup", (e) => {
    const acts = codeToActions[e.code];
    if (!acts) return;
    e.preventDefault();
    for (const a of acts) kbHeld[a] = false;
  });

  // ---- gamepad ----
  const DZ = 0.35; // analog stick deadzone
  let connected = false;
  let snapshot = null; // {id, mapping, pressed:[i], axes:[n]} for the debug overlay

  // Some browsers only surface the pad after a button press post-load.
  window.addEventListener("gamepadconnected", () => { connected = true; });
  window.addEventListener("gamepaddisconnected", () => { connected = false; });

  function activePad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!pads) return null;
    // prefer a connected, standard-ish pad; fall back to any non-null entry
    let best = null;
    for (const p of pads) {
      if (!p) continue;
      if (p.connected === false) continue;
      if (!best) best = p;
      if (p.mapping === "standard") return p;
    }
    return best;
  }

  function readPad() {
    const gp = {};
    for (const a of actions) gp[a] = false;

    const pad = activePad();
    if (!pad) { connected = false; snapshot = null; return gp; }
    connected = true;

    const ax = pad.axes || [], b = pad.buttons || [];
    const x = ax[0] || 0, y = ax[1] || 0;
    const down = (i) => b[i] && (b[i].pressed || b[i].value > 0.5);

    // movement: left stick OR d-pad (buttons 12=up,13=down,14=left,15=right)
    if (x < -DZ || down(14)) gp.left = true;
    if (x >  DZ || down(15)) gp.right = true;
    if (y < -DZ || down(12)) gp.up = true;
    if (y >  DZ || down(13)) gp.down = true;
    // some d-pads report on axes 9 (hat) — also honor axes 2/3 as a secondary stick
    const x2 = ax[2] || 0, y2 = ax[3] || 0;
    if (x2 < -DZ) gp.left = true; if (x2 > DZ) gp.right = true;
    if (y2 < -DZ) gp.up = true;   if (y2 > DZ) gp.down = true;

    // face/shoulder buttons (Xbox standard): 0=A 1=B 2=X 3=Y, 4/5=LB/RB, 6/7=LT/RT
    if (down(0)) gp.jump = true;                          // A
    if (down(2) || down(5) || down(7)) gp.attack = true;  // X / RB / RT
    if (down(3)) gp.use = true;                            // Y = use Elixir
    if (down(1) || down(4) || down(6)) gp.magic = true;   // B / LB / LT
    if (down(9) || down(8)) gp.pause = true;              // Start / Back
    if (down(10)) gp.dash = true;                         // left-stick click = dash
    if (down(11)) gp.invert = true;                       // right-stick click = grav-flip

    // capture a debug snapshot
    const pressed = [];
    for (let i = 0; i < b.length; i++) if (b[i] && (b[i].pressed || b[i].value > 0.5)) pressed.push(i);
    snapshot = {
      id: (pad.id || "?").slice(0, 26),
      mapping: pad.mapping || "(none)",
      pressed,
      axes: [x, y, x2, y2].map((v) => v.toFixed(2)),
    };
    return gp;
  }

  return {
    held,
    get gamepadConnected() { return connected; },
    get debug() { return debug; },
    poll() {
      const gp = readPad();
      for (const a of actions) held[a] = kbHeld[a] || gp[a];
    },
    justPressed(a) { return held[a] && !prev[a]; },
    endFrame() { for (const a of actions) prev[a] = held[a]; },
    padDebug() {
      if (!snapshot) return "no pad seen — focus this tab & press a button (close Steam?)";
      return `${snapshot.id} | map:${snapshot.mapping} | btn:[${snapshot.pressed.join(",")}] ax:[${snapshot.axes.join(",")}]`;
    },
  };
})();
