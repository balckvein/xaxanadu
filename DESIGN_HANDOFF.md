# XAXANADU — Design Handoff

A guide for the **look & feel** pass. The game is fully playable with procedural
neon placeholders; everything visual is deliberately isolated so art can change
without touching mechanics. This doc maps **every visual element to the exact
file and function that draws it**, then lists the safe re-skin levers.

> Golden rule: **change how things are drawn, not how they move.** Physics,
> combat, input, camera, and stats live separately from rendering. If you find
> yourself editing velocity/collision/timers to change the look, stop — there's
> almost always a `draw()` seam instead.

---

## 1. The big picture

- **Stack:** vanilla JS + HTML5 `<canvas>`. No build step, no dependencies.
  Open [index.html](index.html) to run.
- **Logical resolution:** 512×288 (set on the `<canvas>` in [index.html](index.html)),
  scaled up 2× to 1024×576 via CSS in [css/style.css](css/style.css).
  `imageSmoothingEnabled = false` keeps pixels crisp ([js/game.js](js/game.js)).
- **Everything is drawn with glowing primitives** via two helpers in
  [js/assets.js](js/assets.js): `neonRect(...)` (filled rect + glow) and
  `neonStroke(...)` (outlined rect + glow). Almost every sprite is one or more
  of these.

---

## 2. The two master levers

### Lever A — the palette: [js/assets.js](js/assets.js) `COLORS`
One object that every draw call reads from. Recoloring the entire game = editing
these values. Current keys:

| Key | Used for |
|---|---|
| `bg` | canvas background fill |
| `player`, `playerHi` | hero body / highlight + sword |
| `enemy`, `enemy2` | walker / flyer |
| `solid`, `solidEdge` | platform fill / glowing top edge |
| `ladder` | ladder rungs |
| `gold`, `bread`, `key` | pickups (key color also = door & goal accents) |
| `door` | locked door |
| `magic` | magic projectile |
| `text` | HUD labels |
| `hpFill`, `hpBack`, `mpFill`, `mpBack` | HUD bars |

### Lever B — the glow helpers: [js/assets.js](js/assets.js)
`neonRect(ctx, x, y, w, h, color, glow=8)` and
`neonStroke(ctx, x, y, w, h, color, glow=6, lw=1)`.
Change the glow model globally here (blur amount, add gradients, scanlines, etc.)
and the whole game's "neon" character shifts at once.

---

## 3. Element-by-element map

| Visual element | File · function | Notes for re-skin |
|---|---|---|
| **Page frame / CRT bezel** | [css/style.css](css/style.css) | Border, outer glow, background gradient, scale factor. Pure CSS — safe to restyle freely. |
| **Canvas size & scaling** | [index.html](index.html) (`width/height`) + [css/style.css](css/style.css) (`#game`) | Keep logical 512×288 unless you also adjust camera math. |
| **Background fill** | [game.js](js/game.js) `render()` | Solid `COLORS.bg` fill each frame. |
| **Parallax grid / depth** | [game.js](js/game.js) `drawParallax()` | Faint moving grid. Replace with starfield, fog layers, sky gradient, etc. Self-contained. |
| **Platforms / solid tiles** | [level.js](js/level.js) `draw()` (`t === "#"`) | Fill + neon top edge. Prime spot for a tileset. |
| **Ladders** | [level.js](js/level.js) `draw()` (`t === "H"`) | Drawn as two rails + rungs via canvas lines. |
| **Locked door** | [level.js](js/level.js) `draw()` (`t === "D"`) | 2 tiles tall; disappears when opened. |
| **Player (body, highlight, eye)** | [player.js](js/player.js) `draw()` | Body rect + highlight bar + facing eye. `this.dir` = facing (±1). Flickers during i-frames — keep that behavior for game feel. |
| **Sword swing** | [player.js](js/player.js) `draw()` (`if this.attack > 6`) | Visual must stay synced to the hitbox window (active while `attack > 6`). Reskin the visual; don't change the timing. |
| **Enemies (walker / flyer)** | [entities.js](js/entities.js) `Enemy.draw()` | Body rect + eyes; color from type. White flash on hit (`this.flash`) — preserve as damage feedback. |
| **Magic projectile** | [entities.js](js/entities.js) `Projectile.draw()` | Small glowing rect. |
| **Pickups (gold / bread / key)** | [entities.js](js/entities.js) `Pickup.draw()` | Each type its own shape; gentle bob via `Math.sin`. |
| **Goal flag** | [game.js](js/game.js) `render()` (after entities) | Pole + flag in `COLORS.bread`. |
| **HUD bar (HP/MP/EXP/Gold/Keys/Rank)** | [hud.js](js/hud.js) `HUD.draw()` + `bar()` + `label()` | Top status bar. Fonts are canvas `ctx.font` ("Consolas"). Rank titles table is `RANKS` in the same file. |
| **Transient center messages** | [hud.js](js/hud.js) `HUD.draw()` (msg block) | Door hints / win text. Driven by `game.flash(...)`. |

---

## 4. Animation & timing hooks (so reskins keep game feel)

These are the signals art should respond to — read them, don't rewrite them:

- **Facing:** `player.dir` and `enemy.dir` (±1).
- **Invulnerability flicker:** `player.invuln > 0` ([player.js](js/player.js) `draw()` early-return).
- **Attack window:** `player.attack > 6` is the live-hitbox frames; `attack` counts 12→0.
- **Enemy hit flash:** `enemy.flash > 0` ([entities.js](js/entities.js)).
- **Idle bob phase:** `pickup.t` / `enemy.t` (frame counters; no RNG — deterministic).
- **On-ground / climbing:** `player.onGround`, `player.climbing` — available if you want distinct stand/climb/jump poses.

If you add multi-frame sprite animation, drive frame index off these counters
rather than `Date.now()` so it stays in lockstep with the fixed 60 Hz update.

---

## 5. Swapping placeholders for sprites (recommended path)

1. Add an image loader (e.g. an `IMAGES` map in [assets.js](js/assets.js) that
   preloads `Image()` objects; gate the game start until `onload`).
2. In each entity's `draw()`, replace the `neonRect(...)` call with
   `ctx.drawImage(...)` at the same `x,y` (already camera-adjusted as
   `this.x - cam.x`, `this.y - cam.y`). The collision boxes (`w`/`h`) are
   separate from the sprite — you can render larger art over a smaller hitbox.
3. Keep the flicker / flash / bob conditionals; just swap what's drawn inside them.
4. For tiles, swap the per-tile branches in [level.js](js/level.js) `draw()` for
   tileset blits keyed by the tile char (`#`, `H`, `D`).

Because all art goes through `draw()` methods and one palette, you can reskin
incrementally — one entity at a time — and the game stays playable throughout.

---

## 6. Out of scope for the art pass (don't edit for visuals)

- [js/input.js](js/input.js) — keyboard mapping.
- [js/main.js](js/main.js) — fixed-timestep loop.
- Movement/collision in [player.js](js/player.js) (`update`, `moveX`, `moveY`)
  and [entities.js](js/entities.js) (`Enemy.update`, `moveY`).
- Combat/pickup/camera/win-lose wiring in [game.js](js/game.js) (`update`,
  `handleDoor`, `updateCamera`).
- Level layout data in [level.js](js/level.js) constructor (floors, ladders,
  spawns) — that's level design, not look & feel.

---

## 7. Planned features that will need art later

(From [README.md](README.md) — flag any visual needs now so the direction scales.)

- Towns + **shops** (weapons/armor/shields/spells/keys) and a **Guru** NPC.
- **Equipment** that changes stats (will want gear icons / equipped looks).
- A larger interconnected **open-world / Metroidvania** map (more tile variety,
  biomes, backgrounds).
