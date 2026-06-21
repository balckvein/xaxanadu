# XAXANADU — Design Handoff

A guide for the **look & feel** pass. The game is fully playable with procedural
**neon placeholders**, but those are just scaffolding — the **target art
direction is a dark fantasy RPG** that captures the feel of the original
**Faxanadu** (NES, 1987). Everything visual is deliberately isolated so the art
can change completely without touching mechanics. This doc states the target
direction, then maps **every visual element to the exact file and function that
draws it** so you know where to apply it.

> Golden rule: **change how things are drawn, not how they move.** Physics,
> combat, input, camera, and stats live separately from rendering. If you find
> yourself editing velocity/collision/timers to change the look, stop — there's
> almost always a `draw()` seam instead.

---

## 0. Art direction — the target look (READ FIRST)

**Mood: dark fantasy RPG, in the spirit of the original Faxanadu.** Replace the
neon entirely. We are not keeping the synthwave/glow aesthetic — it's placeholder
only.

- **Tone:** somber, melancholic, mysterious. A decaying fantasy world inside the
  great World Tree — overgrown ruins, gloom, quiet dread, faded grandeur.
- **Palette:** muted and earthy. Deep browns, mossy greens, slate greys, dim
  ochres, dried-blood reds, weathered bronze/gold. Low saturation overall; color
  used sparingly for emphasis (a torch, a magic spark, a key) against dark
  backdrops. Backgrounds are darker than foreground so the player reads clearly.
- **Lighting:** moody and directional. Pools of warm torchlight against cold
  shadow. Soft vignetting. Subtle ambient glow is fine where it sells torches,
  magic, and pickups — but it should feel like *light in darkness*, not neon.
- **Forms:** medieval-fantasy. The hero reads as a cloaked/armored adventurer;
  enemies as grotesque/decayed creatures; tiles as carved stone, bark, brick,
  and root; the door as an ornate locked gate; pickups as coins, bread, an
  ornate key. Pixel-art friendly (logical 512×288, integer coords).
- **HUD:** parchment / aged-metal RPG framing rather than glowing bars — engraved
  panels, runic accents, serif-ish or blackletter-leaning type if legible at small
  sizes.
- **Reference feel:** Faxanadu's gloomy World Tree interiors and town gloom;
  classic dark-fantasy NES/16-bit RPGs. Atmospheric, not flashy.

Keep all the **game-feel timing** (hit flashes, i-frame flicker, bob, attack
window) — just express it in the dark-fantasy vocabulary instead of neon.

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
these values. **First move: replace these neon hex values with the muted
dark-fantasy palette** (deep browns/greens/greys, sparse warm accents). The keys
stay the same; only the colors change. Current keys:

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
These are the global rendering character. For dark fantasy, **dial the glow way
down** — most surfaces (stone, bark, the hero, enemies) should be flat or softly
shaded with little to no `shadowBlur`. Reserve glow for genuine light sources
(torches, magic, the key/door, pickups). Easiest path: either lower the default
`glow` and desaturate, or keep these for light-emitters and add a plain
`fillRect`/shaded draw path for everything else. Changing the model here shifts
the whole game's feel at once.

---

## 3. Element-by-element map

| Visual element | File · function | Notes for re-skin |
|---|---|---|
| **Page frame / bezel** | [css/style.css](css/style.css) | Border, outer glow, background gradient, scale factor. Pure CSS — restyle as a dark stone/wood RPG frame (carved border, dim vignette) instead of the neon bezel. |
| **Canvas size & scaling** | [index.html](index.html) (`width/height`) + [css/style.css](css/style.css) (`#game`) | Keep logical 512×288 unless you also adjust camera math. |
| **Background fill** | [game.js](js/game.js) `render()` | Solid `COLORS.bg` fill each frame — make it a deep, near-black backdrop. |
| **Parallax background / depth** | [game.js](js/game.js) `drawParallax()` | Currently a faint grid. Replace with dark-fantasy depth: distant cave/tree-interior silhouettes, drifting fog, dust motes, faint pillars. Self-contained. |
| **Platforms / solid tiles** | [level.js](js/level.js) `draw()` (`t === "#"`) | Fill + edge highlight. Prime spot for a carved-stone / bark / brick tileset. |
| **Ladders** | [level.js](js/level.js) `draw()` (`t === "H"`) | Two rails + rungs via canvas lines. Reskin as wooden/rope ladder or vine. |
| **Locked door** | [level.js](js/level.js) `draw()` (`t === "D"`) | 2 tiles tall; disappears when opened. Make it an ornate locked gate. |
| **Player (body, highlight, eye)** | [player.js](js/player.js) `draw()` | Body rect + highlight bar + facing eye. `this.dir` = facing (±1). Target: cloaked/armored adventurer. Flickers during i-frames — keep that behavior for game feel. |
| **Sword swing** | [player.js](js/player.js) `draw()` (`if this.attack > 6`) | Visual must stay synced to the hitbox window (active while `attack > 6`). Reskin as a blade arc/slash; don't change the timing. |
| **Enemies (walker / flyer)** | [entities.js](js/entities.js) `Enemy.draw()` | Body rect + eyes; color from type. Target: grotesque/decayed creatures. White flash on hit (`this.flash`) — preserve as damage feedback. |
| **Magic projectile** | [entities.js](js/entities.js) `Projectile.draw()` | Small glowing rect — good place to keep a genuine glow (an arcane bolt/ember). |
| **Pickups (gold / bread / key)** | [entities.js](js/entities.js) `Pickup.draw()` | Each type its own shape; gentle bob via `Math.sin`. Target: coins, a bread loaf, an ornate key — softly lit so they catch the eye in the gloom. |
| **Goal flag** | [game.js](js/game.js) `render()` (after entities) | Pole + flag in `COLORS.bread`. Reskin as a shrine/banner/summit marker. |
| **HUD bar (HP/MP/EXP/Gold/Keys/Rank)** | [hud.js](js/hud.js) `HUD.draw()` + `bar()` + `label()` | Top status bar. Target: parchment/aged-metal RPG panel with engraved bars. Fonts are canvas `ctx.font` ("Consolas") — swap for a fitting legible face. Rank titles table is `RANKS` in the same file. |
| **Transient center messages** | [hud.js](js/hud.js) `HUD.draw()` (msg block) | Door hints / win text. Driven by `game.flash(...)`. Style as an in-world scroll/plaque. |

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
Suggested order for the dark-fantasy pass: (1) swap `COLORS` to the muted palette
and dial down glow, (2) reskin tiles/background for atmosphere, (3) hero +
enemies, (4) HUD framing, (5) polish lighting (torches, magic, pickups).

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
