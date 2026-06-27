# XAXANADU

A 2D action-platformer prototype inspired by **Faxanadu** (NES, 1987) — the same
mechanics (climb, fight, level up, buy gear, gate progress with keys) wearing a
different, neon look.

## Run it

No build step, no dependencies. Just open **`index.html`** in any modern browser.

> Tip: double-click `index.html`, or right-click → Open With → your browser.

## Controls

| Action | Keys |
|---|---|
| Move | Arrow keys or **A/D** |
| Climb ladder | **Up/Down** (W/S) while on a ladder |
| Enter / open door | **Up** while standing at the door |
| Jump | **Space** |
| Attack (melee) | **Shift** |
| Cast magic (costs MP) | **Enter** |

> Ladder-tops are walkable — you stand on them and only descend when you press **Down**.

### Xbox controller

Plug in (USB) or pair (Bluetooth) an Xbox controller, then **press any button** in the
browser tab to activate it (browsers require one input before exposing a gamepad).
A green **PAD** indicator appears top-right of the HUD when it's detected.

| Action | Button |
|---|---|
| Move / climb | Left stick or D-pad |
| Enter / open door | Push **Up** at the door |
| Jump | **A** |
| Attack | **X** (or RB / RT) |
| Magic | **B** (or LB / LT) |

### Touch (Amazon Fire tablet / phones)

On a touch device the page shows **on-screen controls automatically** — a left D-pad
(move / climb) and right buttons (**JUMP / ATK / MAG**), plus **pause** and **fullscreen**
in the top corners. In touch mode the canvas fills the screen so it's tablet-ready.
To preview on a desktop browser, add **`?touch=1`** to the URL (e.g. `index.html?touch=1`).
The buttons emit the same inputs as the keys, so menus, the title, and shops all work by touch.

## What's in this build

- Walk (with **momentum** — accelerate to top speed, reset on stop/melee) · **double jump** · **ladder climbing**
- **Melee** swing (damage from equipped weapon) + **magic projectiles** (MP cost, slow regen)
- Enemies (ground **walkers** + **flyers**), contact damage softened by armor, i-frames, knockback
- RPG stats HUD: **HP / MP / ATK / DEF / EXP / Gold / Keys / Rank-title** (16 ranks)
- **Surface town** (safe zone) with a **Shop** (buy weapons, armor, elixirs, keys) and a **Guru** (rest + save)
- **Mantra save/continue** — the Guru records progress to the browser; it's restored on reload
- Pickups: gold, bread (heal), **key**
- A **key-gated door** deep in the caves blocking the **Core** (the goal)
- Smooth-scrolling camera over one contiguous **descent** tilemap (open-world — no screen flips)
- Xbox **gamepad** support; all art is procedural neon placeholder — easy to re-skin later

## Architecture (so it's easy to extend)

```
index.html        loads everything (plain <script> tags, runs from file://)
css/style.css     frame + CRT-ish neon styling
js/input.js       keyboard state (held + just-pressed edges)
js/assets.js      palette, TILE size, neon draw helpers, AABB/clamp
js/level.js       data-built tower: floors, ladders, door, spawns
js/entities.js    Enemy, Projectile, Pickup
js/player.js      movement, climbing, melee, magic, stats
js/hud.js         status bar + rank/title table
js/game.js        world wiring, combat resolution, camera, win/lose
js/main.js        fixed-timestep loop
```

## Next up (planned)

- Towns with shops (buy weapons/armor/shields/spells/keys) + a Guru for mantras (passwords)
- Equipment that actually changes damage/defense
- Larger interconnected (open-world / Metroidvania) map instead of one tower
- Re-skin from placeholders to the final art direction
