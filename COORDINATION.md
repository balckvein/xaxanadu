# XAXANADU — Art Integration Coordination

**Two Claude sessions are working this repo at once.** This doc keeps us from
clobbering each other. Read it before editing rendering code.

- **Session A (assets/pipeline)** — sources & imports art (Numeria + CC0), copies
  files into the repo, and wired the *enemy/boss/tile* rendering. **Will NOT edit
  `game.js` or `player.js` from now on.**
- **Session B (look & feel / "design")** — owns look-and-feel. **Please implement
  the two REMAINING items below** (background/foreground layer + player character).

> Rule of thumb: **Session B owns `game.js` and `player.js`.** If Session A needs
> a new asset, it adds files under `assets/` and notes them here — no code edits
> to those two files.

---

## ✅ Already DONE (don't redo)

### Assets imported into the repo
| Folder | Contents |
|---|---|
| `assets/mobs/` | 53 dark-fantasy mobs (44 "scary" set + 9 named: ghoul, wraith, direwolf, bat, spider, scorpion, viper, gnat, locust). 384×384, transparent. |
| `assets/bosses/` | 16 (11 bosses + 5 tower bosses). |
| `assets/player/` | `hero-knight.png` (chosen player), `player-lyra.png`, `lyra-pose-1..5`. |
| `assets/bg/` | `bg-cave.png`, `bg-pinewood.png`, `bg-volcano.png`, `bg-tower.png` (Numeria scenes). |
| `assets/tiles/` | `tile-rock.jpg`, `tile-brick.jpg`, `tile-ground.jpg` (CC0, ambientCG, seamless). |

### Code wired (in `assets.js`, `entities.js`, `level.js`)
- **`Assets`** loader + async preload of all mob/boss/tile/bg images. `Assets.get(key)`
  returns the `HTMLImageElement` once loaded, else `null` (so everything has a neon
  fallback and the game runs from `file://` and headless).
- **`drawSprite(ctx, img, cx, footY, dispH, faceLeft, flash)`** — draws an
  illustrated sprite bottom-center-anchored at screen `(cx, footY)`, height `dispH`,
  flips for facing, white-flash on hit, and bakes a dark-fantasy grade
  (`brightness/saturate/contrast`). Use this for the player too.
- **`getTilePattern(ctx, key, tint)`** — cached, pre-graded, world-tiling
  `CanvasPattern` from a terrain texture (`key` = `"rock"|"brick"|"ground"`).
  Returns `null` until loaded.
- **Enemies** (`Enemy.draw`) render from `MOB_SPRITES[type]` pools.
- **Bosses** (`Boss.draw`) render from `BOSS_SPRITES[kind]`:
  `prism→boss-mirror-mare`, `burrower→boss-quartzback-mole`, `cinder→boss-cinder-lord`,
  `lich→tower-4-storm-lich`.
- **Tiles** (`level.js`, `"#"` solids) fill with the world-anchored `rock` texture,
  biome-tinted, with the neon edge-glow kept.

Verified: `node --check` on all + `tools/headless.js` smoke test passes.

---

## 🛠️ REMAINING — for Session B

### 1) Background / foreground layered look (`game.js`)
Goal: restore the original's background+foreground depth. Background images are
**already preloaded** — keys: `bg-cave`, `bg-pinewood`, `bg-volcano`, `bg-tower`.

- **Background layer:** in `render()`, *before* `this.level.draw(...)`, blit a biome
  background scaled to cover the canvas, scrolling with light **parallax** (e.g.
  camera × 0.25) and darkened so foreground reads. There's an existing
  `drawParallax(biome)` to replace/augment.
- **Biome → bg mapping** (biomes live in `level.js`, `this.biomes`, via `biomeAt(r)`):
  - `CRYSTAL CAVES` → `bg-cave`
  - `DEEP HOLLOWS` → `bg-pinewood`
  - `MAGMA DEPTHS` → `bg-volcano`
  - `THE CORE` → `bg-tower`
- **Foreground:** add a subtle dark **vignette** overlay (radial gradient, dark
  edges) after the world draws, for depth. Optionally darkened silhouette pillars.

Sketch:
```js
const bgKey = { "CRYSTAL CAVES":"bg-cave", "DEEP HOLLOWS":"bg-pinewood",
                "MAGMA DEPTHS":"bg-volcano", "THE CORE":"bg-tower" }[biome.name];
const bg = Assets.get(bgKey);
if (bg) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.55;                         // darken for depth
  const px = -(this.cam.x * 0.25) % W;            // parallax wrap
  ctx.drawImage(bg, px, 0, W, H);
  ctx.drawImage(bg, px + W, 0, W, H);
  ctx.restore();
} // else fall back to the existing drawParallax(biome)
```

### 2) Player character = **KNIGHT** (`player.js`)
Decision: the player is the **Knight** (`assets/player/hero-knight.png`).

- Add the preload (in `assets.js` preload manifest, or alongside it):
  ```js
  Assets.loadAll({ "player-knight": "assets/player/hero-knight.png" });
  ```
- In `Player.draw(ctx, cam)`, use the sprite when loaded (neon fallback otherwise):
  ```js
  const img = Assets.get("player-knight");
  if (img) {
    // keep the i-frame flicker: skip draw on alternate frames while invulnerable
    if (this.invuln > 0 && Math.floor(this.invuln / 4) % 2 === 0) return;
    const cx = this.x + this.w / 2 - cam.x;
    const footY = this.y + this.h - cam.y;
    const dispH = this.h * 2.6;                  // ~ tune to taste
    drawSprite(ctx, img, cx, footY, dispH, this.dir < 0, false);
    // (optional) draw the existing sword-swing FX on top during attack frames
    return;
  }
  ```
- Hooks available on the player: `this.dir` (±1 facing), `this.invuln` (i-frames),
  `this.attack`/attack window, `this.climbing`, `this.onGround` — use for poses/FX.
- **Facing:** default art faces right; the snippet flips when `dir < 0`. Flip the
  comparison if it looks reversed. (Same convention enemies use, but they flip on
  `dir > 0` — tune per how the art reads.)

---

## Notes / where to find more art
- Full Numeria library (1245 PNGs incl. ~900 horde variants, pets, heroes, maps,
  equip/loot/icons) is extracted **outside the repo** at
  `C:\Users\ticke\numeria_extract\assets\`. Ask Session A to copy anything else in.
- Extra CC0 terrain textures: `C:\Users\ticke\numeria_extract\_tiles\`.
- Art direction: **illustrated-as-is**, curated **dark fantasy** (see
  `DESIGN_HANDOFF.md`, now partly historical since we went illustrated, not pixel).
- Nothing here is committed yet — there are many in-progress edits in the working
  tree from both sessions.
