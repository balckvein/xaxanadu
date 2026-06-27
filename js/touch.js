// touch.js — on-screen controls for tablets/phones (e.g. Amazon Fire).
//
// LEFT: a virtual analog STICK (8-way) — drag it and it synthesizes the same
// Arrow keydown/keyup events the game already listens for. RIGHT: action buttons.
// Decoupled from the game (input.js) via synthetic KeyboardEvents, so nothing else
// needs to change. Shows only on touch devices (or ?touch=1 to force on desktop).

(function () {
  const frame = document.getElementById("frame");
  if (!frame) return;

  const root = document.createElement("div");
  root.id = "touch";

  // ---- left: virtual analog stick ----
  const stick = document.createElement("div");
  stick.className = "stick-base";
  const knob = document.createElement("div");
  knob.className = "stick-knob";
  stick.appendChild(knob);
  root.appendChild(stick);

  // ---- right: action buttons (codes must match the keymap in input.js) ----
  const BUTTONS = [
    { code: "Space",     cls: "btn-jump",   label: "JUMP" },
    { code: "ShiftLeft", cls: "btn-attack", label: "ATK" },
    { code: "Enter",     cls: "btn-magic",  label: "MAG" },
    { code: "KeyQ",      cls: "btn-use",    label: "ELIX" },
    { code: "KeyP",      cls: "btn-pause",  label: "❚❚" },
    { code: "KeyF",      cls: "btn-full",   label: "⛶" },
  ];
  for (const b of BUTTONS) {
    const el = document.createElement("button");
    el.className = "tbtn " + b.cls;
    el.textContent = b.label;
    el.dataset.code = b.code;
    root.appendChild(el);
  }
  frame.appendChild(root);

  const down = (code) => window.dispatchEvent(new KeyboardEvent("keydown", { code }));
  const up   = (code) => window.dispatchEvent(new KeyboardEvent("keyup",   { code }));

  // ---- joystick: knob offset -> held Arrow directions (8-way, with deadzone) ----
  const DIRS = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };
  let stickId = null;
  function setDir(code, on) {
    if (DIRS[code] === on) return;
    DIRS[code] = on;
    if (on) down(code); else up(code);
  }
  function releaseStick() {
    stickId = null;
    knob.style.transform = "translate(-50%, -50%)";
    stick.classList.remove("on");
    for (const code in DIRS) setDir(code, false);
  }
  function moveStick(clientX, clientY) {
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const rad = r.width / 2;
    const dx = clientX - cx, dy = clientY - cy;
    const mag = Math.hypot(dx, dy) || 1;
    const cl = Math.min(mag, rad);                       // clamp knob inside the base
    const kx = (dx / mag) * cl, ky = (dy / mag) * cl;
    knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    const t = rad * 0.35;                                // per-axis threshold (deadzone + diagonals)
    setDir("ArrowLeft",  dx < -t);
    setDir("ArrowRight", dx >  t);
    setDir("ArrowUp",    dy < -t);
    setDir("ArrowDown",  dy >  t);
  }

  stick.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    stickId = e.pointerId;
    stick.classList.add("on");
    if (stick.setPointerCapture) try { stick.setPointerCapture(e.pointerId); } catch (_) {}
    moveStick(e.clientX, e.clientY);
  });
  stick.addEventListener("pointermove", (e) => {
    if (e.pointerId !== stickId) return;
    e.preventDefault();
    moveStick(e.clientX, e.clientY);
  });
  const endStick = (e) => { if (e.pointerId === stickId) { e.preventDefault(); releaseStick(); } };
  stick.addEventListener("pointerup", endStick);
  stick.addEventListener("pointercancel", endStick);

  // ---- right action buttons (multi-touch) ----
  const active = new Map(); // pointerId -> code
  for (const btn of root.querySelectorAll(".tbtn")) {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const code = btn.dataset.code;
      active.set(e.pointerId, code);
      btn.classList.add("on");
      down(code);
      if (btn.setPointerCapture) try { btn.setPointerCapture(e.pointerId); } catch (_) {}
    });
    const rel = (e) => {
      const code = active.get(e.pointerId);
      if (code == null) return;
      active.delete(e.pointerId);
      if (!Array.from(active.values()).includes(code)) { up(code); btn.classList.remove("on"); }
    };
    btn.addEventListener("pointerup", rel);
    btn.addEventListener("pointercancel", rel);
  }

  // show on touch-capable devices; ?touch=1 forces it on for desktop testing
  const isTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  if (isTouch || /[?&]touch=1/.test(location.search)) document.body.classList.add("touch");
})();
