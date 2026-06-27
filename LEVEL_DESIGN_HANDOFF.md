# XAXANADU — Massive-World Design & Implementation Handoff
### "THE WORLD TREE" — One coherent action-RPG world of unique, ability-gated regions
**Audience:** a coding agent with NO other context. Everything below is grounded in the real repo. File/function citations are exact. Do not invent APIs; every new system names its exact engine hook.

**Repo facts (verified against source):**
- One contiguous 64×52 `Level` built in `js/level.js` constructor (`Level` is parameterless; created once in `Game.reset()` at `js/game.js:23`; also `new Level()` in `tools/inspect.js:13`).
- Tile glyphs: `#` solid, `.` empty, `H` rung, `T` ladder-top (one-way), `D` key-door, `B` breakable. Collision predicates: `isSolidPx`, `isGroundPx`, `isClimbablePx`, `isOneWayPx` (`js/level.js:141-176`). **None take a player arg — this single fact drives the entire vehicle/ability collision design below.**
- Player physics: `js/player.js` — `maxJumps=2` (`:20`), gravity `vy=min(vy+0.5,9)` (`:151`), jump impulse `-6.4` (`:147`), climb mode boolean `this.climbing` (`:11,90-116`), `moveX`/`moveY` point-sampled collision (`:188-232`), `Player.isSolid()` wrapper (`:73`) is the ONLY collision call that can read player state.
- Persistence is THREE whitelists: `saveProgress()` (`js/game.js:409-423`), `applySave()` (`:431-443`), and the death-keep object (`:248-252`).
- Difficulty hooks already wired: `Enemy` opts `hp`/`hpMul`/`rewardMul` (`js/entities.js:60-63`), forwarded from level data at `js/game.js:27`. **No `touchMul` yet.** Boss has **no** scaling opts (`js/entities.js:401-420`).
- Shop tiers via `npc.tier` → `buildShopMenu(player, maxTier)` (`js/menu.js:157-185`).
- `tools/headless.js` prints `SMOKE TEST PASSED` **unconditionally** (`:177`) — it never checks the result flags. The Lich kill → `state==='won'` assertion lives at `:160-162`; `new Game()`/`new Level()` at `:50`; files concatenated from a `files[]` array (`:46-47`).
- `tools/inspect.js:13-19` iterates `L.npcs/L.enemies/L.bosses/L.pickups` directly off the `Level` instance.
- **COORDINATION (hard):** `COORDINATION.md` — Session B owns `game.js` and `player.js`; Session A will not edit them. Treat all `game.js`/`player.js` edits below as a coordinated handoff, not unilateral edits.

---

## 1. Genre & Reference Games

| Game | What this design borrows |
|---|---|
| **Super Metroid** | Lock-and-key: world physically impassable until you hold the matching ability; elevator = region seam + load mask. |
| **Castlevania: SOTN / Aria of Sorrow** | Relics vs. equipment split (ability items ≠ stat gear); enemy-drop traversal souls; "inverted castle" late-game map reuse. |
| **Hollow Knight** | Tight ~6-verb kit (dash, wall-cling, double-jump, super-dash, swim); spanning-tree-with-shortcuts world; stag/tram/Dreamgate fast-travel tiers. |
| **Ori (Blind Forest / WotW)** | Dual-purpose verbs (Bash = combat + traversal); per-terrain verbs (burrow, water-dash); spirit-well save+heal+warp nodes. |
| **Guacamelee** | Color-coded lock↔key grammar (one glyph, one key); dimension-swap as same-room re-read. |
| **Final Fantasy 1/4/6** | Four-light/crystal spine as a legible checklist; shared simple systems + per-region flavor; midgame world-shift (World of Ruin). |
| **Dragon Quest** | Visible distant goal; monster difficulty by region; vehicle/key gating rings. |
| **Secret of Mana / Chrono Trigger / Golden Sun** | Fixed portals → free vehicle (Flammie/Epoch); hub coherence (End of Time); element-per-region progression. |
| **Terranigma** | World-state gates (continents rise before reachable); the world itself evolves with progress. |
| **Dead Cells** | Biome graph joined by branching, rune-gated exits; "Passage" transition rooms. |
| **Monster Hunter** | Difficulty lives in the next monster; craft-from-parts loop; element-matched biome rosters. |
| **Terraria** | Boss-gated tier ladder; wings as a metered flight accessory; furnace(refine)→table(assemble). |
| **Dark Souls / Resident Evil 4** | Shops sell flow not power; best gear is found/upgraded/material-gated; chapter-gated curated merchant stock. |
| **Faxanadu** | The direct ancestor: World-Tree segments, town hubs, Gurus/mantras, ability shop-items (Mattock/Wing Boots), %-armor + %-shield, 2× weapon tiers. |

---

## 2. Design Pillars

1. **One coherent world of UNIQUE regions.** *Rule:* every region has a no-repeat theme, palette, music, mob roster, gear, and ability. *Why:* coherence comes from a shared frame (the World Tree + restoring its light) and tightly stitched seams, not from one giant map; variety is what players remember.
2. **Every region grants an ability that re-reads the whole world.** *Rule:* each region boss/quest yields exactly ONE verb (traversal and/or combat) that retroactively unlocks geometry elsewhere. *Why:* the genre's core dopamine loop is "I can reach that now."
3. **Varied transitions, each unlocking a different terrain class.** *Rule:* door/gate = local; portal = instant link; boat = water; bird mount = over mountains/chasms; elevator = vertical layer. Each is a *distinct collision mechanism* (Section 4.1), not flavor over one door. *Why:* the user wants "the more the better," and vehicles-as-terrain-keys is the Final-Fantasy-2D world grammar.
4. **Keys are ONE tool, never the default answer.** *Rule:* gate vocabulary = ability ∣ vehicle ∣ crafted item ∣ trade ∣ quest-flag ∣ key; a key may gate at most one node per region and is never the only way to advance a region. *Why:* progression must be ability-driven (Metroidvania), not a key-fetch chain.
5. **Mobs are walls until you get that region's gear, then speed bumps.** *Rule:* tune each region's mob HP/touch to the gear the region's gate *guarantees*, not to grindable gear. *Why:* the Monster Hunter "the wall becomes a warmup" curve, achieved with data only (`hpMul`/`touchMul`/`rewardMul`).
6. **Shops are scarce — the best gear is FOUND or CRAFTED.** *Rule:* shops stock only consumables, materials, templates, and the *entry rung* of the region's tier; ability-gear and top-tier stats are found/dropped/crafted. *Why:* buying past discovery kills exploration (Souls/RE4/Zelda).
7. **Every region's mobs theme its gear.** *Rule:* a region's signature mobs preview the verb you're about to earn and drop the materials that craft that region's gear. *Why:* combat and exploration become the same loop; drops gain semantic meaning.
8. **Simple systems, richly unique content.** *Rule:* new uniqueness costs a data row, not a new subsystem; reuse `Enemy`/`Boss`/`Pickup`/`Menu`/`Level`. *Why:* a small prototype scales by content, not engine surgery.
9. **Show the lock before the key (carry-forward).** *Rule:* every gated obstacle is a visible landmark whose on-screen hint names the required ability/vehicle, seen *before* the key is obtainable. *Why:* gating reads as design, not a bug.
10. **Never soft-lock (carry-forward).** *Rule:* every required ability/vehicle/key/material is re-acquirable from a source reachable without passing the gate it opens; every backtrack transition is returnable; the critical path uses only owned abilities. *Why:* a gated, interconnected world strands players unless reachability is guaranteed by construction.
11. **Persist in all three places + re-apply gate mutations on load & death.** *Rule:* any new permanent flag goes in `saveProgress`, `applySave`, and the death-keep; grid-mutating opens are re-applied (via `applyRegionProgress`, Section 4.10) on both load and respawn, **for the region being entered**. *Why:* the existing 3-site duplication (`js/game.js:248-252,409-423,431-443`) silently drops anything you forget, and dead bosses resurrect if region progress isn't re-applied.

---

## 3. World Model & Story Spine

### 3.1 Decision: HYBRID — multiple `Level` instances + an overworld/hub, linked by a data-driven transition graph.

**Why this, grounded in the engine:**
- The whole world already lives on a single swappable `this.level` object that `render()` and `update()` read indirectly (`js/game.js:114,497-533`), and entity arrays are rebuilt wholesale in `reset()` (`js/game.js:27-36`) rather than incrementally. So *swapping the entire `Level` is clean* — `render()` needs zero changes.
- A single giant map would blow up the hardcoded `Level` constructor, the 64×52 minimap (`drawMinimap`, `js/game.js:536-570`), and the per-frame `lockSet` rebuild (`js/game.js:170-176`). Separate per-region `Level` defs match the "regions/stages" framing and keep each map authorable.
- Player progression lives entirely on the `Player` object and survives a `Level` swap **as long as you do not rebuild `Player`** (`js/player.js:4-46`; the death-keep at `js/game.js:248-256` already proves stats carry across a `reset()`). So "backtrack carrying new abilities" is essentially free.

**The structure:** A small **HUB region** (the surface, "Roothaven Town") is the spoke center. Each **region** is its own `Level` def with named **entry anchors** and a **transitions** list. Vehicles (boat/bird) and portals form a sparse fast-travel layer on top of the contiguous spokes. The current 64×52 `Level` becomes **Region 1 ("The Descent")** unchanged in layout (its 4 biomes/4 bosses are kept; the bosses now grant *abilities*, not just a key).

This **reverses the prior single-map recommendation** because the user's new vision explicitly demands distinct regions, boats, and flying mounts reaching new terrain classes — which a single clamped map cannot express. Section 4 details how to de-risk the reversal.

### 3.2 Reconciling "coherent world" with "distinct regions" (explicit)
- **Coherence** is provided by: (a) one persistent `Player` that never resets across transitions; (b) one HUB everything spokes from; (c) a single shared story (restoring the World Tree's light) tracked by one global flags set; (d) consistent transition art grammar (a boat dock looks like a boat dock everywhere); (e) one save file spanning all regions; (f) landmarks visible across seams (parallax `bg-*` art already preloaded, `js/game.js:718-734`).
- **Distinctness** is provided by: per-region `Level` data — its own `biomes[]` palette (already per-instance, `js/level.js:121-126`), mob roster, signature ability, boss, town stock, and a unique inbound transition type (door / boat / bird / portal / elevator).

### 3.3 Story spine (one escalating adventure)
The World Tree is rotting from its corrupted Core. The player descends and then spreads outward to restore **6 Heartwood Shards** (the "four-light" checklist, surfaced in the HUD next to KEYS). One recurring mentor — **Guru Aldric** (promote one `guru` NPC) — reappears in every town, his tone darkening per Shard restored. One antagonist — **the Hollow Crown** — whose lieutenants are the region bosses. Midpoint pivot (after Shard 3): corruption "breaks" upward, re-skinning an earlier region with tougher mobs (cheap reuse, FF6-style), and the Guru shifts to despair. Final Shard = the **Hollow Crown** in Region 6 (the new `final:true` boss; see 4.8 + 11.2 for the Lich→boat / Crown→`win()` split).

---

## 4. Transition System — doors, portals, gates, BOATS, FLYING MOUNT BIRDS

This is the spine. It is **data-driven** and reuses the proximity-interaction pattern already used for NPC talk (`js/game.js:118-128`) and `handleDoor()` (`js/game.js:274-288`).

### 4.0 The collision-predicate threading problem (READ FIRST — it shapes everything in Sections 4–5)
The four `Level` predicates `isSolidPx`/`isGroundPx`/`isClimbablePx`/`isOneWayPx` (`js/level.js:141-176`) take **no player argument**, and they are consumed by THREE different actors with different state:
- the **player** (via `Player.isSolid`/`moveX`/`moveY`/climb checks — these can be made player-state-aware),
- **enemies** (`entities.js:92,145` use `level.isGroundPx`/`isSolidPx` — these must NOT see vehicle/gravity/phase state; an enemy never has a boat),
- **enemy shots** (`entities.js` use `isSolidPx`).

Therefore the design rule is: **player-state-dependent collision (vehicle, gravSign, phasing) is resolved ONLY inside player code** — `Player.isSolid()` (`:73`), `Player.moveY` (`:206-232`), and the climb/one-way branches (`:107-122,219`). The raw `Level` predicates keep their fixed, player-agnostic meaning so enemies/shots are unaffected. Where the player needs vehicle/gravity-aware *ground* or *one-way* tests (boat float, inverted gravity), the player code does the state check and then either special-cases the glyph or calls a **new player-side helper** — it does NOT push state into the shared `Level` predicates. Every ability below names exactly which player-side function it touches. This is the root cause the rest of Section 4–5 is built around.

### 4.1 Transition TYPES — each a distinct, real mechanism (not flavor over one door)

| type | trigger | distinct collision/terrain mechanism | unlock (`requires`) |
|---|---|---|---|
| `door` | overlap + press Up | **carves tiles in place** — reuses `openDoor()` flipping `D`→`.` (`js/game.js:274-288`); same region, no map swap | none or `key:<id>` |
| `gate` | overlap; inert until `requires` met | **stays solid until a flag flips**, then `loadRegion`; the gate tile is OUTSIDE any boss `lock` cells but its `requires` references the boss-dead flag so it is inert mid-fight | `ability`/`flag`/`key`/`material` |
| `portal` | overlap (auto or press) | **no tile change** — instant `loadRegion(toRegion,toEntry)`; does NOT carve geometry (distinct from `door`) | `flag` (region cleared) |
| `boat` | board at a `dock` tile | **changes which tiles are passable**: `~` water becomes a floatable surface only while `vehicle==='boat'` (4.5.1) — a real moveY surface rule, not a door | `vehicle:boat` |
| `mount` (bird) | summon item / board | **suppresses gravity + vertical input flight**, but `#`/`B`/`D`/`lockSet` stay solid (4.5.2) — fly OVER chasms/mountains, cannot pass walls or boss seals | `vehicle:bird` |
| `elevator` | overlap + press; multi-stop | **vertical same-region warp** between authored stops (a multi-target `door` that moves the player y within the same `Level`, no map swap) | `flag:power` optional |

Each row is a genuinely different code path: `door` mutates the grid; `portal`/`gate` swap the `Level`; `boat` changes the moveY ground rule for water; `bird` changes gravity/vertical control while preserving solidity; `elevator` is an intra-region teleport. No two share an implementation.

### 4.2 Data-driven REGIONS model
`Level` is parameterized: `new Level(def)` where `def` is `REGIONS[idx]`. **Back-compat is an acceptance criterion:** zero-arg `new Level()` must default to `REGIONS[0]` AND populate the exact instance fields `this.npcs/this.enemies/this.bosses/this.pickups` that `tools/inspect.js:13-19` iterates, or inspect crashes.

```js
// js/level.js — constructor signature change (Session A territory; coordinate)
class Level {
  constructor(def) {
    def = def || REGIONS[0];          // default = Region 1 (back-compat for inspect/headless)
    this.id = def.id;
    this.cols = def.cols; this.rows = def.rows;
    // ... build grid from def.galleries/ladders/ledges/secrets exactly as today ...
    this.entries  = def.entries;      // { fromAbove:{c,r}, fromReachDock:{c,r}, ... } (unique per inbound edge — 4.4)
    this.transitions = def.transitions || [];   // [{id,type,c,r,toRegion,toEntry,requires}]
    this.docks    = def.docks    || [];   // boat boarding tiles
    this.waterSet = new Set((def.waterCells||[]).map(w => w.c+","+w.r)); // tiles floatable only in a boat
    this.biomes   = def.biomes;       // per-region palette (already per-instance)
    this.playerSpawn = def.playerSpawn;
    // these MUST be set as instance fields for inspect.js back-compat:
    this.enemies = def.enemies; this.npcs = def.npcs; this.bosses = def.bosses; this.pickups = def.pickups;
  }
  isWaterCell(c, r) { return this.waterSet.has(c+","+r); }   // Set lookup, mirrors isLockCell (js/level.js:139)
}
```
Per-region `enemyHpMul`/`enemyTouchMul`/`bossHpMul`/`bossTouchMul`/`rewardMul`/`shopMaxTier` live on `def` (Section 9).

### 4.3 The transition ENGINE — `Game.loadRegion(idx, entryId)` (NEW, in `game.js`)
Factor the body of `reset()` (`js/game.js:22-47`) into a region-builder that **preserves the player**:

```js
// js/game.js — NEW (hand to Session B)
loadRegion(idx, entryId) {
  this.regionIdx = idx;
  const def = REGIONS[idx];
  this.level = new Level(def);
  const L = this.level;

  // entity arrays REPLACED wholesale (engine never filters enemies/bosses — js/game.js:184-263)
  this.enemies = L.enemies.map(e => new Enemy(e.type, e.c*TILE, e.r*TILE+2,
    { drops:e.drops, hp:e.hp, hpMul: e.hpMul ?? def.enemyHpMul, rewardMul: e.rewardMul ?? def.rewardMul, touchMul: def.enemyTouchMul }));
  this.npcs    = L.npcs.map(n => { const o=new NPC(n.kind, n.c*TILE, n.r*TILE-20); o.tier=n.tier; o.stock=n.stock; return o; });
  this.pickups = L.pickups.map(p => new Pickup(p.type, p.c*TILE+2, p.r*TILE+2));
  this.bosses  = L.bosses.map(b => { const d=BOSS_DEFS[b.kind];
    return new Boss(b.kind, b.c*TILE, b.r*TILE - d.h + 4,
      { drops:b.drops, final:b.final, lock:b.lock, hpMul:def.bossHpMul, touchMul:def.bossTouchMul, rewardMul:def.rewardMul,
        arena:{x0:b.arena.c0*TILE,x1:(b.arena.c1+1)*TILE,y0:b.arena.r0*TILE,y1:(b.arena.r1+1)*TILE} }); });

  // FLUSH transient arrays (else stale shots/summons cross maps — js/game.js:130,136,155-156)
  this.projectiles = []; this.enemyShots = []; this.effects = []; this.floats = [];
  this.shake = 0; this.curMusic = null; this.curBiome = null; this.menu = null;

  // RE-APPLY persisted per-region progress BEFORE placing the player (4.10):
  //   - sets b.dead for bosses already killed (so they don't resurrect)
  //   - flips opened gates/doors and broken B/R walls back to '.'
  this.applyRegionProgress(idx);

  // place the PERSISTENT player at the named entry (do NOT new Player)
  const ent = (entryId && L.entries[entryId]) || L.playerSpawn;
  this.player.x = ent.c*TILE + 2; this.player.y = ent.r*TILE - 14;   // matches reset() (js/game.js:25)
  this.player.vx = 0; this.player.vy = 0; this.player.climbing = false; this.player.gravSign = 1;

  // RESEED camera so updateCamera() (js/game.js:483-495) doesn't swoop; clamp auto-adapts to new pixelW/H.
  // For regions shorter than VIEW_H, clamp lo (0) wins over hi -> use Math.max(0, Math.min(hi, want)) so no negative jitter.
  this.cam.x = Math.max(0, Math.min(L.pixelW - VIEW_W, this.player.x - VIEW_W/2));
  this.cam.y = Math.max(0, Math.min(Math.max(0, L.pixelH - VIEW_H), this.player.y - VIEW_H/2));

  this.syncRank();
}
```
`reset()` is rewritten as "new game from scratch": build a fresh `Player`, then `loadRegion(0, null)`. Keep `reset()` callable with no args so headless `new Game(canvas)` and `tools/inspect.js` still work.

### 4.4 Transition nodes as data + detection in `update()`
Add a detection block in `Game.update()` right next to the NPC/door checks (`js/game.js:118-128, 242`):

```js
// js/game.js — inside update(), after handleDoor()
for (const tr of L.transitions) {
  const tx = tr.c*TILE + TILE/2, ty = tr.r*TILE + TILE;
  const near = Math.abs((p.x+p.w/2)-tx) < 22 && Math.abs((p.y+p.h/2)-ty) < 34;
  if (!near) continue;
  const ok = this.gateSatisfied(tr.requires);   // ability/vehicle/key/flag/material check (4.6)
  if (!ok) { this.flash(gateHint(tr.requires), 30); continue; }   // pillar 9: name what's needed
  this.flash("Press UP to travel", 24);
  if (Input.justPressed("up")) {
    if (tr.requires && tr.requires.type === "key") p.keys--;       // key is consumed
    this.markFlag("opened:"+L.id+":"+tr.id);                       // persist one-shot opens
    this.loadRegion(tr.toRegion, tr.toEntry);                      // BACKTRACK transitions: toRegion can be earlier
  }
}
```
**Unique entry anchors per inbound edge (carry-forward fix):** `toEntry` MUST be a unique anchor name per inbound transition (e.g. `"fromReachDock"`, `"fromVaultPortal"`), never a generic `"fromDock"` shared by multiple sources — otherwise two regions linking into one drop the player at the wrong seam. The authoring checklist (Section 14) enforces 1:1 transition→entry pairing.

**Backtrack transitions** are ordinary nodes whose `toRegion` is an earlier index, placed in later regions; e.g. a portal in Region 3 returns to a Region 1 anchor that a new ability now makes useful. Every backtrack node is paired with a return edge (or is itself two-way), so re-entering is never a dead end (pillar 10).

### 4.5 Boats & flying mounts (vehicles as terrain keys) — concrete physics
Vehicles are **player movement-mode flags** on `Player`. Per 4.0, vehicle solidity is resolved inside player code only.

**`Player.isSolid()` becomes vehicle-aware** (`js/player.js:73`) — used by `moveX` (`:194`) and `moveY` (`:212,227`):
```js
isSolid(level, px, py) {
  const c = Math.floor(px/TILE), r = Math.floor(py/TILE);
  // lockSet ALWAYS solid in every mode (boss arena seals can never be bypassed by any vehicle/ability)
  if (level.isLockCell(c, r)) return true;
  if (this.vehicle === "bird") {
    // bird: # , B , D all stay solid (only gravity/vertical control change). Water/empty are not walls.
    return level.isSolidPx(px, py);       // isSolidPx already returns true for #,B,D and lockSet
  }
  if (this.vehicle === "boat") {
    if (level.isWaterCell(c, r)) return false;   // water is not a wall while boating (surface handled in moveY, 4.5.1)
    return level.isSolidPx(px, py);
  }
  // ON FOOT: water is an OPEN GAP (you fall in — handled as a hazard in 4.5.3), NOT a wall and NOT ground.
  return level.isSolidPx(px, py);
}
```
Note: on foot, water is **not** made solid (that would create a walkable lake — the review's incoherence). Water on foot is a fall hazard (4.5.3).

#### 4.5.1 BOAT — water is a real floating surface (blocker fix: actual moveY rest code)
`moveY` (`js/player.js:206-232`) must give the boat a surface to rest on, mirroring the one-way ladder-top landing (`:219-220`). In the `dy>0` (descending) branch, BEFORE the normal solid-landing test, add a boat water-surface check using a **player-side** helper (NOT a shared `Level` predicate, per 4.0):

```js
// js/player.js moveY(), inside the dy>0 branch (descending), before existing isSolid landing:
if (this.vehicle === "boat") {
  const feetC = Math.floor((this.x + this.w/2)/TILE);
  const feetR = Math.floor((this.y + this.h)/TILE);
  // top of a water cell is a landing surface if the cell above the feet is NOT water (i.e. the waterline)
  if (level.isWaterCell(feetC, feetR) && !level.isWaterCell(feetC, feetR-1)) {
    const tileTop = feetR*TILE;
    if (this.y + this.h > tileTop) {            // crossing the surface this frame
      this.y = tileTop - this.h;                // snap to waterline
      this.vy = 0; this.onGround = true;
      return;                                   // rested on water — gravity no longer pulls through
    }
  }
}
```
This is the explicit surface-rest the boat needs: without it, gravity (`vy→9`, `:151`) would drive the boat through the water. The waterline test (`cell is water, cell above is not`) prevents snapping inside a deep water column. Boarding at a `dock` tile sets `vehicle="boat"`; disembarking at a flat coast `#`-topped tile clears it. **Opens the water terrain class.**

#### 4.5.2 BIRD MOUNT — fly over terrain, but walls/seals stay solid (major fix)
While `vehicle==="bird"`: suppress gravity and drive `vy` directly from input; **keep full `isSolidPx` solidity** (`#`, `B`, `D`, and `lockSet`) so you cannot fly through breakable walls, closed doors, or — critically — **active boss arena seals** (a flown-out-of-seal would let you skip the fight). Only the gravity/vertical-control lines change:
```js
// js/player.js update(), new sibling mode branch (like this.climbing, :90-116):
if (this.vehicle === "bird") {
  this.vy = (Input.held.up ? -2.4 : Input.held.down ? 2.4 : 0);
  // horizontal as normal; moveX/moveY call this.isSolid which keeps #,B,D,lockSet solid (4.5)
  // dismount: press down while a #-topped flat tile is directly below
}
```
Landing only on flat `#`-topped tiles is enforced by the dismount check, not by reducing solidity. **Opens the fly-over-mountains/chasms terrain class.** Earned at the Region 4 boss.

#### 4.5.3 On-foot water failure handling (soft-lock fix, pillar 10)
On foot, water is an open gap — the player falls in. To prevent an unbottomed-column soft-lock: when the player's feet enter a water cell and `vehicle!=="boat"`, treat it like a pit hazard — apply small damage via `takeHit` and teleport to `L.entries.lastDock` (the nearest authored dock anchor, tracked when the player last stood on a `dock` tile, falling back to `checkpoint`). This is detected in `Game.update()` alongside the transition checks:
```js
// js/game.js update(): on-foot water = hazard, not a wall
if (p.vehicle !== "boat" && L.isWaterCell(Math.floor((p.x+p.w/2)/TILE), Math.floor((p.y+p.h)/TILE))) {
  p.takeHit(4);
  const back = L.entries.lastDock || L.entries.checkpoint || L.playerSpawn;
  p.x = back.c*TILE+2; p.y = back.r*TILE-14; p.vx=0; p.vy=0;
}
```

`isWaterCell` is a `Level` method (4.2). **Add a non-solid water glyph `~`** handled in `draw`, `isSolidPx`(false), `isGroundPx`(false), `isClimbablePx`(false), `isOneWayPx`(false), and the minimap (`js/game.js:546-559`). Vehicle behavior is layered on top in player code only (4.5). See Section 12 for the full glyph contract.

### 4.6 Gate satisfaction + hub fast-travel
`gateSatisfied(requires)` resolves the six gate types against player/global state:
```js
gateSatisfied(req) {
  if (!req) return true;
  switch (req.type) {
    case "ability":  return !!this.player.abilities[req.value];
    case "vehicle":  return this.player.vehicles.has(req.value);
    case "key":      return this.player.keys > 0;
    case "flag":     return this.flags.has(req.value);
    case "material": return (this.player.materials[req.value]||0) >= (req.qty||1);
    case "trade":    return this.flags.has("quest:"+req.value);
  }
}
```
- The HUB town's Guru is a **waystone**: once a region's town is visited (`flag:"town:"+idx`), it becomes a warp destination. A Guru menu entry "Recall" (modeled on `buildGuruMenu`, `js/menu.js:219-234`) lists visited towns and calls `loadRegion(idx, "fromWaystone")` for a small gold fee.
- **Unlock cadence (earn it):** Regions 1–2 on foot only. The **boat** unlocks at the Region 1 Storm Lich (opens Region 2, a water region). The **bird mount** unlocks at the Region 4 boss (opens Region 5; trivializes all earlier chasms). The **Recall waystone** unlocks midgame from the Guru after Shard 3 — the "Lordvessel" beat.

### 4.7 Save migration for the spine
Extend the three persistence sites (pillar 11). Add `regionIdx`, a `flags` set (opened transitions, bosses dead, broken walls, towns visited, quests), `entryId` for respawn, and the player-owned `abilities`/`vehicles`/`materials`/`templates`/`shards`. Missing fields default to Region 0 / empty (backward-compatible with old saves):

```js
// js/game.js saveProgress() — ADD (alongside existing exp/gold/keys/tiers/boots/doorOpen)
regionIdx: this.regionIdx, flags: [...this.flags], shards: this.shards,
abilities: serializeAbilities(p), vehicles: [...p.vehicles],
materials: {...p.materials}, templates: [...p.templates],
// applySave(data):
//   1. this.flags = new Set(data.flags||[]); restore abilities/vehicles/materials/templates/shards
//   2. loadRegion(data.regionIdx||0, "checkpoint")   // applyRegionProgress re-applies THIS region's opens/dead-bosses
//   3. then existing tier/boots restore + syncRank()
// serializeAbilities returns only flags NOT already covered by the legacy boots bool (4.9).
```

### 4.8 Death-respawn (de-risk) + key policy resolution
Change death-respawn (`js/game.js:245-257`) from "full `reset()` to Region 0" to: `loadRegion(this.regionIdx, "checkpoint")`, then `Object.assign(this.player, keep)`.
- **`keep` now lists every permanent flag**: `{exp, gold:floor(gold*0.7), weaponTier, armorTier, magicTier, maxJumps, keys, abilities, vehicles, materials, templates}`.
- **Keys policy (resolved):** **keep keys on death** (add `keys` to `keep`). Combined with the rule that **every gate-critical key is re-acquirable** (the warden/boss that drops a region's key sets a persisted flag; re-entering the room re-grants if the gate is still unopened — never a one-shot consumable that, once lost, soft-locks a region), this satisfies pillar 4 + pillar 10. No region is gated solely by a one-shot key.
- `applyRegionProgress(this.regionIdx)` (run inside `loadRegion`) keeps dead bosses dead and opened gates open after respawn.

### 4.9 Wing Boots single source of truth (desync fix)
Wing Boots stays the **legacy `boots`/`maxJumps>=3` representation** (`js/game.js:414,439`). It is **excluded from `serializeAbilities`** and is **not** an entry in the `ABILITIES` registry's persisted set — `maxJumps` is derived ONLY from the `boots` bool on load. This removes the two-sources-of-truth desync. (The `ABILITIES` table in 5.1 documents Wing Boots for designers but marks it `legacy:true, serialize:false`.)

### 4.10 `applyRegionProgress(idx)` — the per-region bookkeeping function (was missing; now fully specified)
This is the single most important new bookkeeping function. It runs inside `loadRegion` AFTER entity arrays are built but BEFORE the player is placed, and re-applies all persisted per-region mutations so re-entering a cleared region does NOT resurrect bosses or re-seal opened gates:
```js
// js/game.js — NEW
applyRegionProgress(idx) {
  const L = this.level, id = L.id;
  // 1. DEAD BOSSES: bosses are rebuilt fresh with dead=false (entities.js:408). Re-mark killed ones.
  for (const b of this.bosses) {
    if (this.flags.has("boss:"+id+":"+b.kind)) b.dead = true;   // skipped in update/draw (js/game.js:152,518)
  }
  // 2. OPENED DOORS/GATES: flip persisted opens back to '.' in the grid.
  if (this.flags.has("door:"+id)) L.openDoor();                 // existing single-door open (js/game.js:281-283)
  for (const tr of L.transitions) {
    if (tr.type === "gate" && this.flags.has("opened:"+id+":"+tr.id)) L.openGateCells(tr.id);
  }
  // 3. BROKEN WALLS: B/R cells the player already destroyed stay '.'.
  for (const key of this.flags) {
    if (key.startsWith("broke:"+id+":")) {                       // "broke:<id>:<c>:<r>"
      const [, , c, r] = key.split(":"); L.setTile(+c, +r, ".");
    }
  }
}
```
- `openGateCells(id)` / `setTile(c,r,g)` are tiny `Level` helpers (Session A). Breaking a `B`/`R` wall must, in addition to the existing in-place mutation (`js/game.js:193-194`), record `markFlag("broke:"+L.id+":"+c+":"+r)` so it persists.
- **Dead-boss flag mapping (explicit):** `killBoss` sets `flag:"boss:"+L.id+":"+b.kind` (4.8 / Section 6.3); `applyRegionProgress` reads the same key to set `b.dead=true`. This is the round-trip that prevents boss resurrection.

### 4.11 Boss seal vs. exit-gate interaction (explicit)
`lockSet` is rebuilt every frame from active non-dead bosses (`js/game.js:170-176`); a swapped-in `Level` brings its own empty `lockSet` (`js/level.js:63`), so swapping is clean. The exit `gate`'s `requires` references the boss-dead flag (`{type:"flag", value:"boss:"+id+":"+kind}`), so it is **inert until the boss dies** even though the player can physically stand on the gate tile (the gate tile is authored OUTSIDE the boss's `lock` cells). You therefore cannot trigger the exit mid-fight. After the boss dies, `lockSet` empties next frame and the gate flag flips — both consistent.

### 4.12 Risks & mitigations of the reversal
| Risk | Mitigation |
|---|---|
| `reset()` hardwires `new Level()`+`new Player()` (used by inspect/headless) | Keep zero-arg `reset()` path; `Level()` defaults to `REGIONS[0]` and sets `this.npcs/enemies/bosses/pickups` (4.2); `loadRegion` preserves `Player`. |
| Stale projectiles/summons cross maps (`js/game.js:130,136,155-156`) | `loadRegion` flushes all transient arrays. |
| Camera swoop/clamp jump on swap; short regions jitter (`js/game.js:483-495`) | Reseed `cam` with `max(0, min(hi, want))` so lo wins for regions shorter than `VIEW_H` (4.3). |
| `curBiome`/`curMusic` stale banners/music | Nulled in `loadRegion`. |
| `win()` fires for non-final bosses | `killBoss` only `win()`s if `b.final` AND `regionIdx===last`; else set boss-dead flag → unlock exit gate (4.8, 6.3, 11.2). |
| Existing headless Lich→`won` assertion (`tools/headless.js:160-162`) breaks when Lich no longer wins | Migration updates that test: Lich kill now asserts `vehicles.has("boat")`; the new Region 6 Hollow Crown kill asserts `state==='won'` (Section 13). |
| Save format change breaks old saves | All new fields `?? default 0/empty`. |
| Predicate state-threading (vehicle/gravSign/phase) | Resolved ONLY in player code (4.0); shared `Level` predicates stay player-agnostic so enemies/shots are unaffected. |
| Re-entering cleared region resurrects boss / re-seals gate | `applyRegionProgress` (4.10) re-applies dead bosses + opened gates + broken walls. |
| Two-session ownership of `game.js`/`player.js` | Coordinated handoff; deliver `game.js`/`player.js` diffs to Session B. |

---

## 5. The Ability & Equipment Kit (the heart)

### 5.1 Central registry (kills the boots-style ad-hoc sprawl)
Add `this.abilities = {}`, `this.vehicles = new Set()`, `this.materials = {}`, `this.templates = new Set()`, `this.gravSign = 1`, `this.flyMeter = 0`, `this.vehicle = null` to `Player` constructor (`js/player.js:5-46`). Serialize the whole `abilities` object once (collapses the 3-site duplication). **Wing Boots stays the existing `maxJumps>=3` bool and is NOT in the serialized abilities set (4.9).**

```js
// js/assets.js — NEW registry (parallels WEAPONS/ARMORS/MAGICS)
const ABILITIES = {
  // wingBoots is documentation-only: legacy persistence via boots bool; NOT serialized here (4.9)
  wingBoots:  { slot:"feet",  legacy:true, serialize:false, gates:"high-ledge", region:0, source:"found/secret" },
  flyShoes:   { slot:"feet",  flag:"canFly",     persist:true, gates:"chasm-glide",       region:2, source:"craft" },
  climb:      { slot:"hands", flag:"canClimb",   persist:true, gates:"ladderless-shaft",  region:1, source:"boss:burrower" },
  gravFlip:   { slot:"core",  flag:"canInvert",  persist:true, gates:"ceiling-exit",      region:3, source:"boss:cinder" },
  dash:       { slot:"core",  flag:"canDash",    persist:true, gates:"wide-gap",          region:1, source:"boss:prism" },
  grapple:    { slot:"hands", flag:"canGrapple", persist:true, gates:"anchor-gap(A)",     region:4, source:"craft" },
  phase:      { slot:"core",  flag:"canPhase",   persist:true, gates:"phase-wall(P)",     region:5, source:"boss" },
  superDash:  { slot:"core",  flag:"canSuperDash",persist:true, gates:"long-corridor",    region:4, source:"craft" },
  emberWard:  { slot:"body",  flag:"hasEmberWard",persist:true, gates:"heat-seal(~heat)", region:1, source:"boss:cinder" },
  emberSpell: { slot:"magic", flag:"hasEmberSpell",persist:true, gates:"frozen-seal",     region:2, source:"craft" },
};
const VEHICLES = { boat:{gates:"water"}, bird:{gates:"fly-over"} };
// serializeAbilities(p) -> only keys with serialize !== false and a truthy p.abilities[flag]
```
(`emberSpell` is an elemental attack that doubles as a key: its projectile both damages fire-weak mobs and melts a frozen-seal tile — the Guacamelee "attack-as-key" idea, implemented as: a `Projectile` impact on a seal glyph clears it, like the existing `B`-break in `js/game.js:193-194`.)

### 5.2 Per-ability detail (verb = concrete physics/collision change, with exact hook)

**FLYING SHOES — metered glide/flight** (`canFly`, feet)
- *Verb:* in the airborne branch of `Player.update` (`js/player.js:141-155`), **before** `this.vy = Math.min(this.vy+0.5, 9)` (`:151`): if `canFly && flyMeter>0 && Input.held.jump` → `this.vy = -2.2; flyMeter--`; else if `canFly && Input.held.jump` → `this.vy = Math.min(this.vy+0.5, 2.0)` (glide). Refill `flyMeter` to `flyMax` on `onGround`.
- *Meter sizing (soft-lock guard):* `flyMax = 180` frames at `-2.2/frame` net-of-gravity climb covers ~the widest authored chasm + margin. **Authoring rule:** no required gap may exceed `flyMax`-crossable width; the headless reachability guard (Section 13) measures each Fly-gated gap against `flyMax` and fails if a required gap is uncrossable. Fly is never the *sole* exit of a region (pillar 10) — a second route or glide safety floor always exists.
- *Hook:* edits `js/player.js:151` only; no `level.js` change.

**BIRD MOUNT — fly over terrain** (`vehicle:bird`) — *Verb/Gate/Hook:* see 4.5.2. `#`/`B`/`D`/`lockSet` stay solid. Opens fly-over terrain. Earned Region 4 boss.

**BOAT** (`vehicle:boat`) — *Verb/Gate/Hook:* see 4.5.1. Real water surface in `moveY`. Opens water. Earned Region 1 Lich.

**CLIMB — wall-cling + wall-jump** (`canClimb`, hands)
- *Verb:* mirror the `this.climbing` block. In the airborne branch, detect wall: `this.isSolid(level, this.dir>0 ? this.x+this.w+1 : this.x-1, mid) && Input.held[dir]`. While clinging: `this.vy = Input.held.up ? -1.6 : (Input.held.down ? 1.6 : 0.3)`. Wall-jump in the `justPressed("jump")` block (`:142-150`): `this.vy=-6.4; this.vx=-onWall*3.5`. *Gate:* a vertical shaft with the ladder removed. *Earned:* Region 1 boss (Hollow Maw). *Hook:* new mode branch in `Player.update`; feeds existing `moveX/moveY`.

**GRAVITY-FLIP / WALK UPSIDE DOWN** (`canInvert`, core) — **the one structural refactor; full implementation, not a sign-flip:**
- Add `this.gravSign = 1` to `Player`. Gravity (`js/player.js:151`): `this.vy = this.gravSign>0 ? Math.min(this.vy+0.5, 9) : Math.max(this.vy-0.5, -9)`. Jump impulse (`:147`): `this.vy = -6.4*this.gravSign`.
- **Rewritten `moveY`** (replaces `js/player.js:206-232`), generalizing landing/ceiling by gravity sign and handling the one-way ladder-top correctly:
```js
moveY(level) {
  this.y += this.vy;
  const left = this.x + 2, right = this.x + this.w - 2;
  if (this.vy * this.gravSign > 0) {                 // moving in gravity direction = "falling" toward a floor
    const edge = this.gravSign > 0 ? this.y + this.h : this.y;          // leading edge
    if (this.isSolid(level, left, edge) || this.isSolid(level, right, edge)) {
      const tileEdge = this.gravSign > 0 ? Math.floor(edge/TILE)*TILE : (Math.floor(edge/TILE)+1)*TILE;
      this.y = this.gravSign > 0 ? tileEdge - this.h : tileEdge;
      this.vy = 0; this.onGround = true;
    } else this.onGround = false;
    // ONE-WAY ladder-top: only meaningful in NORMAL gravity and only for downward feet. Disabled while inverted.
    if (this.gravSign > 0 && Input.held.down === false) { /* existing prevFeet<=tileTop+1 drop-through retained */ }
  } else {                                            // moving against gravity = toward a ceiling
    const edge = this.gravSign > 0 ? this.y : this.y + this.h;          // trailing edge
    if (this.isSolid(level, left, edge) || this.isSolid(level, right, edge)) {
      const tileEdge = this.gravSign > 0 ? (Math.floor(edge/TILE)+1)*TILE : Math.floor(edge/TILE)*TILE;
      this.y = this.gravSign > 0 ? tileEdge : tileEdge - this.h;
      this.vy = 0;
    }
  }
}
```
- **One-way / ladder handling while inverted (explicit):** the `T` one-way ladder-top drop-through is **disabled while `gravSign<0`** (it hardcodes "down = falling"); and **ladder climbing is forbidden while inverted** — `startClimb`/the climb branch (`:90-116,107-122`) early-returns if `gravSign<0`. Authoring rule: gravity-flip regions contain no required ladders.
- **Toggle only while `onGround`** (VVVVVV safety) AND only if the destination surface exists: before flipping, probe the would-be landing tile in the new gravity direction; if it's open air, **cancel the flip** (no stranding). Flip the sprite vertically in `draw` when `gravSign<0`. `attackBox.y` (`:166`) uses `this.y-1` which remains correct (hitbox is centered on the body); no change needed.
- *Gate:* a chamber whose only exit is a ceiling door. *Earned:* Region 3 boss. *Hook:* `js/player.js:147,151,206-232,90-122` + `draw`.

**DASH / air-dash** (`canDash`, core)
- *Verb:* add a `dash` input mapping in `js/input.js`. On `justPressed("dash") && canDash && !dashUsed`: `dashTimer=10; dashUsed=true` (cleared on `onGround`). While `dashTimer>0`: `this.vy=0`, and move with an **explicit dash delta, sub-stepped to avoid tunneling** (point-sampled collision risk, `:191`):
```js
const dashDx = this.dir * 7;                 // explicit, NOT this.vx (moveX zeroes vx on hit)
for (let i = 0; i < 2; i++) this.moveX(level, dashDx/2);   // 2 sub-steps of 3.5px each < TILE/2
```
- *Gate:* a gap just past max-jump distance. *Earned:* Region 1 boss (Prism). *Hook:* `Player.update` + `moveX` (which must accept an explicit dx param).

**SUPER-DASH (horizontal crystal flight)** (`canSuperDash`, core)
- *Verb:* charge while grounded/clinging; on release move with explicit `dashDx = this.dir*9` each frame, **sub-stepped in 3 slices** (`9 > TILE/2=8`, so 2 slices isn't enough): `for(let i=0;i<3;i++) this.moveX(level, dashDx/3);` until `moveX` reports a wall (vx→0) or `takeHit`. *Gate:* a corridor longer than the short dash. *Earned:* Region 4 craft.

**GRAPPLE / swing** (`canGrapple`, hands)
- *Verb:* add `A` anchor glyph + `isAnchorPx` probe (player-side, reads the glyph). On fire, find first `A` along `this.dir`, then each frame move toward it (set `vx/vy` toward anchor, clear gravity) until close, then swing/release. *Gate:* a chasm with an anchor as the only midpoint. *Earned:* Region 4 craft. *Hook:* new mode branch + new probe. **`A` is non-solid in `isSolidPx`** (so the player, enemies, and shots pass through it); only the grapple mode reads `A` via `isAnchorPx`.

**PHASE-THROUGH-WALLS** (`canPhase`, core)
- *Verb:* add `P` glyph; during a phase window (timed, on input) set `this.phasing=true`. **Intended asymmetry (explicit, do NOT "fix"):** `P` is **solid in `isSolidPx`** (so enemies, enemy shots, and a non-phasing player are all blocked), and ONLY `Player.isSolid` returns false for `P` while `this.phasing`. So enemies can never follow you through a phase-wall. *Gate:* a phase-wall corridor. *Earned:* Region 5 boss. *Hook:* `Player.isSolid` + glyph contract (Section 12).

**EXISTING — Wing Boots (triple jump):** `maxJumps=3` (`js/game.js:225`, `js/menu.js:174-178`), persisted via `boots` bool only (`js/game.js:414,439`; 4.9). Keep as-is.
**EXISTING — Magic ladder:** `weaponTier`/`armorTier`/`magicTier` index `WEAPONS`/`ARMORS`/`MAGICS` (`js/player.js:31-33,49-52`; `js/assets.js:36-60`). Re-themed elementally (Section 6).

### 5.3 Equipment-slot model (extends the existing tier indices)
Keep `weaponTier`/`armorTier`/`magicTier` as the stat spine. Add an **ability-accessory** layer separate from stat gear (SOTN rule):
- Core abilities (Wing Boots, Climb, Grav-Flip, vehicles) are **always-on map-keys** — stored in `this.abilities`/`this.vehicles`.
- Add `this.accessory = null` + an `ACCESSORIES` table in `assets.js` paralleling `WEAPONS` (e.g. `+crit`, `slow-fall`, `mp-regen`) for swappable build identity. Surface in `loadoutLines` (`js/menu.js:188-195`) and `buildShopMenu`.

---

## 6. Region-Themed Mobs & Bosses

### 6.1 Adding new enemy types (grounded in `entities.js`)
Enemy stats are a data table keyed by `type` (`js/entities.js:52-58`); behaviors dispatch in `Enemy.update` switch (`:77-83`). To add a region mob: add a stats row + a `case` in the switch + a `MOB_SPRITES[type]` pool (`js/assets.js:124-130`). Each signature mob gets ONE **telegraphed** attack: a windup timer that triggers the existing `this.flash` filter (`:42,75`), then pushes a `pendingShots` `EnemyShot` (`:47,129`). Enemy AI uses only the raw player-agnostic `Level` predicates (`isGroundPx`/`isSolidPx`, `:92,145`) — vehicle/gravity/phase never affect enemies (4.0).

### 6.2 Signature rosters (mob theme ↔ region gear/ability)

| Region | Signature mobs (new `case` + behavior) | Telegraph | Themed to / drops |
|---|---|---|---|
| 1 Descent (Crystal/Hollows/Magma/Core) | **Crystal Crawler** (walker, back-glow → short horizontal beam); existing flyer/shooter/jumper/cinder mobs | back-crystals charge (flash) before beam | drops crystal/cinder shards → Region-1 gear; previews Dash/Climb |
| 2 Sunken Reach (water) | **Tideling** (flyer over water), **Reef Lurker** (shooter from waterline) | bob-pause before lunge | drops pearl/brine metal → fly gear; previews Boat/Fly |
| 3 Inverted Vault (gravity-flip) | **Ceiling Stalker** (crawler pinned to ceiling, drops on proximity) | ceiling shadow grows | oppressive until you can flip; previews Grav-Flip |
| 4 Stormcrags (sky/cliffs) | **Galecaller** (flyer, gust shot), **Cliff Hugger** (wall-clinger) | wing-flare windup | drops sky-iron → bird/grapple gear; previews Bird/Grapple |
| 5 Phaseworks (phase walls) | **Glitch Wisp** (shooter that fires through `P` walls — `P` is solid to the player but the wisp is authored on your side) | static-flicker | previews Phase |
| 6 Withered Crown (finale, reskin pivot) | corrupted Region-1 mobs at higher `hpMul`/`touchMul` | as Region 1 | endgame gauntlet |

### 6.3 Bosses drop the region's ability/gear
Extend `killBoss` (`js/game.js:344-361`) and boss `drops` (`js/level.js:74`) beyond `"key"`. Add ability/material/vehicle drop dispatch mirroring the key drop (`js/game.js:351-355`):
```js
// js/game.js killBoss() — generalize drops + win/flag split
if (b.drops) {
  if (b.drops === "key") { /* existing key Pickup spawn */ }
  else if (VEHICLES[b.drops]) this.player.vehicles.add(b.drops);    // boat/bird
  else if (ABILITIES[b.drops]) this.grantAbility(b.drops);          // sets p.abilities[flag]=true
  else { this.player.materials[b.drops] = (this.player.materials[b.drops]||0)+1; } // material/template
}
this.markFlag("boss:"+L.id+":"+b.kind);   // ALWAYS set dead-flag (read by applyRegionProgress, 4.10)
if (b.final && this.regionIdx === REGIONS.length-1) { this.win(); return; }
// else: dead-flag (above) makes the region's exit gate's requires satisfied (4.11)
```
`Boss` ctor gains `hpMul`/`touchMul`/`rewardMul` opts (mirror `Enemy`, `js/entities.js:60-63`) applied to `this.hp/maxHp/touch/gold/exp` (`:407-411`):
```js
// js/entities.js Boss ctor (Session A coordination)
if (opts.hpMul)     { this.hp = Math.round(this.hp*opts.hpMul); this.maxHp = this.hp; }
if (opts.touchMul)  this.touch = Math.max(1, Math.round(this.touch*opts.touchMul));
if (opts.rewardMul) { this.gold = Math.round(this.gold*opts.rewardMul); this.exp = Math.round(this.exp*opts.rewardMul); }
```
**Lich summons scale too:** the Storm Lich spawns adds via `new Enemy(s.type,...)` with no opts (`js/entities.js:534`), so summoned flyers stay at base stats and trivialize the enrage. Pass the current region's muls into the summon: `new Enemy(s.type, x, y, { hpMul: this.summonHpMul, touchMul: this.summonTouchMul })`, where the Boss ctor stores `this.summonHpMul=opts.hpMul`, `this.summonTouchMul=opts.touchMul` from `loadRegion`.

Each region's mobs are **brutal with prior-region gear, manageable with this region's gear** — see Section 9 for numbers.

---

## 7. Crafting & Materials (simple — two crafts max)

### 7.1 Data model (new file `js/recipes.js`, sibling to `assets.js`)
```js
const DROP_TABLES = {
  walker:  [{ mat:"iron_ore", chance:0.30, qty:[1,2] }],
  flyer:   [{ mat:"copper_ore", chance:0.30, qty:[1,1] }],
  jumper:  [{ mat:"iron_ore", chance:0.40, qty:[1,2] }, { mat:"ruby", chance:0.08, qty:[1,1] }],
  // bosses (keyed by kind): guaranteed signature material/template
  cinder:  [{ mat:"cinder_core", chance:1.0, qty:[1,1] }],
  lich:    [{ mat:"tmpl_storm_blade", chance:1.0, qty:[1,1] }, { mat:"voidshard", chance:1.0, qty:[2,3] }],
};
const RECIPES = {
  iron_bar:    { needs:[{mat:"iron_ore",qty:3}], station:"furnace", cost:0,  makes:"iron_bar" },      // refine = always known (no template)
  ember_blade: { needs:[{mat:"iron_bar",qty:2},{mat:"cinder_core",qty:1}], template:"tmpl_ember_blade", station:"forge", cost:50, makes:"weapon:ember_blade" },
};
const hasMats = (p, r) => r.needs.every(n => (p.materials[n.mat]||0) >= n.qty);
const canCraft = (p, r) => hasMats(p,r) && (!r.template || p.templates.has(r.template)) && p.gold >= r.cost;
```
Two tiers only: raw ore → bar (refine, always known) → item (assemble, **template-gated**). Templates are items: some drop from bosses (`tmpl_*` in `DROP_TABLES`), some sit in shop stock (Section 8). Owning the template flips it into `p.templates`.

**No material soft-lock (pillar 10):** every recipe's materials are obtainable from **renewable** sources — drop-table mobs respawn on region re-entry (entity arrays rebuilt fresh in `loadRegion`), and any boss-only guaranteed material is re-droppable because re-entering a cleared region rebuilds the boss UNLESS its dead-flag is set; for craft-critical boss materials, the boss instead drops the material into a **persisted town stock** (the Guru sells the now-cleared boss's signature material once `flag:"boss:..."` is set) so a consumed/lost material is always re-buyable. No recipe depends on a one-shot unrecoverable material.

### 7.2 Engine hooks (reuse existing systems)
- **New pickup types** `ore`/`gem`/`template` + collect branch (`js/game.js:222-227`) + draw branch (`js/entities.js:357-391`, generic gem render like `BUFFS`). On enemy death, roll `DROP_TABLES[e.type]` where the key drop is spawned today (`js/game.js:306-310`); independent per-entry rolls.
- **Inventory counters:** `this.materials = {}` + `this.templates = new Set()` on `Player`; persisted (4.7).
- **Craft menu = a `Menu`** built like `buildShopMenu` (`js/menu.js:157-185`): one entry per `RECIPES` row whose `station` matches the forge NPC; greyed when `!canCraft`; row hint names the missing material/template source (pillar 9). Forge = a new `NPC` kind `"forge"` (`js/entities.js:219-243`) opened from the town proximity check (`js/game.js:118-128`).

---

## 8. Shops, Scarcity & Gear-as-Discovery

Shops sell **flow, not power**. `buildShopMenu(player, maxTier)` already gates tiers by `npc.tier` (`js/menu.js:157-185`). Extend to a **curated, region-locked stock list** rather than "all tiers up to maxTier":

```js
// js/level.js per-region def: shop stock is an explicit curated list (carried onto the NPC in loadRegion, 4.3)
shops: [{ npc:{kind:"shop", c:30, r:8, tier:2},
  stock:[
    { kind:"consumable", id:"elixir" }, { kind:"consumable", id:"ether" },
    { kind:"weapon", tier:1 },                 // ENTRY rung only — not the whole band
    { kind:"material", id:"iron_ore", cap:5, restockOn:"town-enter" },
    { kind:"template", id:"tmpl_ember_blade", price:120 },   // knowledge cheap; mats found
  ]}],
```
`buildShopMenu` reads `npc.stock` (fall back to current tier logic if absent for back-compat). Stock lines gate on `requires` (region/flag/boss). Ability-gear and top stat tiers are **never** in `stock` — they are boss drops, secret-room loot (`js/level.js:105-115`), or craft. Limited materials carry `{cap, restockOn}` so commons go (near-)infinite in cleared regions while templates/rare mats stay rationed.

**No "required item buyable only from an unreachable shop" (pillar 10):** every critical-path item is FOUND/CRAFTED on the critical path; shops never hold a *required* unique. The headless reachability guard (Section 13) asserts no gate's only key is a shop item behind that same gate. A purchased template is a *quest pointer* ("now find 1 cinder_core"), not a required end-state.

---

## 9. Power Curve & Itemization

Tune each region's mobs to the gear its gate **guarantees** (on the critical path — see below), never to grindable or optional gear. Use the existing `hpMul`/`rewardMul` (`js/entities.js:60-63`) + the new `touchMul` (add symmetric to `hpMul`: `if (opts.touchMul) this.touch = Math.max(1, Math.round(this.touch*opts.touchMul))`).

**Critical-path guarantee (balance fix):** every region's tuned-against gear must be obtainable on the **critical path** (boss drop or critical-path craft), never only in an optional secret room. (Region 1's Wing Boots are in a secret room — therefore Region 2 is NOT tuned assuming Wing Boots; it is tuned to the Region-1 **boss-dropped** Dash + entry weapon.)

**Player weapon ladder:** `WEAPONS.dmg = [2,4,7,11,16]` (`js/assets.js:36-42`). Deeper-region *found/crafted* weapons extend this (e.g. `ember_blade` dmg 32). **Armor** = flat reduce `[0,2,4,6,9]` (`:43-49`); **net hit** = `max(1, touch - armorReduce)` (`js/player.js:62`).

**Re-tuned per-region table (touch curve flattened so late contact is NOT one-shot — balance fix):**

| Region | `enemyHpMul` | base walker HP (3×mul) | `enemyTouchMul` | walker touch (8×mul) − armor 9 = net | guaranteed weapon dmg (critical path) | rank hpMax (≈) | net hit as % of HP |
|---|---|---|---|---|---|---|---|
| 1 | 1.0 | 3 | 1.0 | 8 − 0..9 ≈ 1–8 | 2→7 | 16–25 | low |
| 2 | 2.5 | 8 | 1.3 | 10 − 9 = 1+ (≈ **6** net at armor 6) | 7 | 28 | ~21% |
| 3 | 4.0 | 12 | 1.6 | 13 − 9 = 4 (≈ **8** at armor 6) | 11 | 34 | ~24% |
| 4 | 6.5 | 20 | 1.9 | 15 − 9 = 6 (≈ **10** at armor 6) | 16 | 40 | ~25% |
| 5 | 9.0 | 27 | 2.2 | 18 − 9 = 9 (≈ **13** at armor 6) | 32 (ember_blade craft) | 46 | ~28% |
| 6 | 13.0 | 39 | 2.5 | 20 − 9 = 11 (≈ **15** at armor 6) | 32–48 | 52 | ~29% |

The `touchMul` ceiling (×2.5) keeps a late-region contact at ≤~30% of a region-appropriate HP pool (3–4 hits to die), preserving danger without one-shots — fixing the prior ×3.5 / 89-damage one-shot. `bossTouchMul` mirrors this ceiling.

**Reward scaling so backtracking pays (balance fix):** `rewardMul` rises per region (`[1, 1.4, 2, 3, 4.5, 6]`). Backtracked early regions keep their original low muls AND low rewards (trivial, fast) — but the *purpose* of backtracking is the gated landmark loot (a new gear piece / shortcut), not farming, so trivial early gold is acceptable; the loop's payoff is the landmark reward, explicitly placed behind each newly-openable lock (Section 10).

**Heal-flatten mitigation (balance fix):** `checkLevelUp` full-restores on rank-up (`js/game.js:368-369`) and `killBoss` full-restores (`:358-359`). To stop dense late-region exp turning rank-ups into free mid-combat heals, gate the rank-up restore to **out-of-combat only** (no active non-dead boss AND no enemy within 6 tiles); otherwise rank-up raises the pool but heals only +25% HP. Boss-clear full-restore stays (it is post-fight). This is a small `checkLevelUp` change handed to Session B.

**Each region introduces a NEW tougher mob archetype** (Section 6.2) so the game never trivializes. **Do not scale mobs to the player** (ARPG trap) — fixed per-region tiers preserve the payoff.

---

## 10. The Region / Boss / Ability / Backtrack Loop

**Canonical loop (in words):**
1. **Enter** a region via its inbound transition (door/portal/boat/bird) — a designed threshold beat (palette + music swap, already per-biome).
2. **Explore** a *combination* of connected sub-areas: a spanning-tree critical path + 1–2 branch-and-rejoin side rooms, plus 1–2 visible **locked landmarks** whose hints name a future ability (pillar 9).
3. **Fight** the region's signature mobs — brutal until you have local gear (Section 9).
4. **Reach the boss** (arena seals via `lockSet`, rebuilt per frame, `js/game.js:170-176`).
5. **Boss drops an ABILITY/vehicle** (Section 6.3) — the region's verb.
6. **A transition opens:** the region's exit `gate` (its `requires` now satisfied — boss-dead flag), leading to the next region OR a backtrack node to an earlier one.
7. **Backtrack** with the new verb to clear previously-blocked landmarks (each holds a reward + a one-way shortcut so the return trip is faster).
8. **Next region.** Region 6's final boss (the Hollow Crown, `final:true`) → `win()`.

**Landmark/signposting rules (carry-forward):** lock glyph ↔ key is 1:1 and never reused (rubble `R`→dig, chasm→Wing/Fly, heat-seal→Ember Ward, `P`-wall→Phase, water `~`→Boat, anchor `A`→Grapple, ceiling-door→Grav-Flip). Each future-key lock is a set-piece walked *past* before it's solvable, with a one-way shortcut on the far side.

**Soft-lock prevention at world scale (carry-forward + new):**
- Every required ability/vehicle/key/material is re-acquirable from a source reachable without passing the gate it opens (boat re-summonable from any dock; abilities re-grantable at the Guru waystone if a flag says owned; craft materials renewable or town-buyable per 7.1; keys kept on death + re-droppable per 4.8).
- Every backtrack transition is two-way (or paired with a return edge); no region's only exit is a timed/metered ability (Fly meter cannot be the sole crossing — glide safety floor / second route, 5.2).
- The critical path uses only owned abilities; keys never the sole gate of a region (pillar 4).
- A headless reachability guard (Section 13) asserts each region + the win is reachable with the intended ability order, that no gate is passable without its key, that no Fly-gated required gap exceeds `flyMax`, and that every region's tuned-against gear is on the critical path.

---

## 11. Region Build Sheets

### 11.1 Reusable per-region TEMPLATE
```
Region <n> — <NAME>
  Theme / palette / music:
  Inbound transition (type + from where + requires):
  Entry anchors (UNIQUE per inbound edge): { fromAbove, fromReachDock, fromVaultPortal, fromWaystone, checkpoint, lastDock }
  Signature mobs (new cases): <3-5, each with telegraph>
  Gear sold (curated/entry rung): / Crafting mats dropped:
  Town stock (consumables/materials/templates):
  Boss (kind, arena, lock cells): drops -> <ABILITY/vehicle/material>
  Ability granted (verb + hook):
  Earlier gate it RE-OPENS (backtrack node + reward + shortcut):
  enemyHpMul / enemyTouchMul / bossHpMul / bossTouchMul / rewardMul / shopMaxTier:
  Locked landmarks (lock glyph + hint naming the key):
  Critical-path gear guarantee (boss drop / on-path craft, NOT optional secret):
  Soft-lock check (key re-acquirable? backtrack returnable? mats renewable? Fly gap <= flyMax?):
```

### 11.2 REGION 1 — "THE DESCENT" (reuse the existing 4 biomes / 4 bosses)
Keep `js/level.js` layout verbatim as `REGIONS[0]`. Change: bosses now grant **abilities**, and the Lich grants the **boat** instead of winning.
- **Theme:** Crystal Caves → Deep Hollows → Magma Depths → The Core (existing `biomes`, `js/level.js:121-126`).
- **Inbound:** game start (HUB town spawn, `playerSpawn {c:5,r:7}`).
- **Entry anchors:** `fromAbove` = surface; `checkpoint` = surface (death respawn); `lastDock` set when standing on a dock (4.5.3).
- **Signature mobs:** existing walker/flyer/shooter/jumper + new **Crystal Crawler** (Section 6.2).
- **Bosses (existing arenas/locks, `js/level.js:71-76`) — now grant abilities/vehicle:**
  - **Prism Sentinel** (`prism`) → drops `dash`. Seed wide gaps before its arena (teach dash). **Dash is the critical-path gear Region 2 is tuned against.**
  - **Hollow Maw** (`burrower`) → drops `climb`. Seed ladderless shafts.
  - **Cinderbrute** (`cinder`) → drops `gravFlip`, `emberWard`, AND the existing `key` (keep `js/level.js:74`). Magma tiles deal heat until Ember Ward.
  - **Storm Lich** (`lich`) → **grants the BOAT** (`vehicles.add("boat")`) and opens the boat dock to Region 2. **`final` flag is REMOVED from the Lich** (was `js/level.js:75`); the existing headless assertion that killing the Lich → `state==='won'` is updated to assert `vehicles.has("boat")` (Section 13). `win()` now belongs solely to Region 6's Hollow Crown.
- **Re-opens:** Wing Boots secret room already exists (`js/level.js:105-115`); add a chasm landmark in Deep Hollows crossed only by Fly/Bird (backtrack from Region 2/4) holding a stat-gear reward + a one-way shortcut back to the surface.
- **Muls:** `enemyHpMul:1, enemyTouchMul:1, bossHpMul:1, bossTouchMul:1, rewardMul:1, shopMaxTier:4` (matches today's shops).

### 11.3 OUTLINE — Regions 2–6 (content pipeline, one escalating story)

| R | Name | Reached by | Theme | Signature mobs | Boss → grants | Re-opens earlier (reward+shortcut) |
|---|---|---|---|---|---|---|
| 2 | **Sunken Reach** | **BOAT** (Region 1 Lich reward; water terrain) | flooded ruins | Tideling, Reef Lurker | Tide Warden → **flyShoes template + craft mats** | R1 chasm landmark (glide) → stat gear + shortcut |
| 3 | **Inverted Vault** | **portal** (after Shard 2 flag) | upside-down halls | Ceiling Stalker | Pendulum King → **gravFlip** confirm + ceiling routes | R1 ceiling-exit chamber → accessory + shortcut |
| 4 | **Stormcrags** | **gate** opened by Ember Ward over a heat ridge | sky cliffs | Galecaller, Cliff Hugger | Roc of Storms → **BIRD MOUNT** + **grapple template** | every chasm everywhere (fly) → multiple caches |
| 5 | **Phaseworks** | **BIRD** over a chasm only flight clears | glitch foundry | Glitch Wisp | Null Engine → **phase** + **superDash template** | phase-walls seeded in R1–4 → caches |
| 6 | **Withered Crown** | **portal**, after all but the last Shard | corrupted reskin of R1 (FX pivot) | corrupted R1 mobs (high mul) | **Hollow Crown** (`final:true`) → `win()` | — |

Each region's town sells its tier's entry rung + region template; each boss is a lieutenant of the Hollow Crown; the Guru's tone darkens per Shard. Every region's tuned-against gear is a boss drop or on-path craft (never an optional secret), satisfying the critical-path guarantee (Section 9).

---

## 12. Data Format (backward-compatible, data-driven)

### 12.1 New glyph contract (each new glyph specifies draw + ALL FOUR collision predicates + `Player.isSolid` override + minimap)
Per 4.0, the shared `Level` predicates are player-agnostic; only `Player.isSolid` applies vehicle/phase state.

| glyph | meaning | `isSolidPx` | `isGroundPx` | `isClimbablePx` | `isOneWayPx` | `Player.isSolid` override | `draw` | minimap (`js/game.js:546-559`) |
|---|---|---|---|---|---|---|---|---|
| `~` | water | **false** | **false** | false | false | foot→fall hazard (not solid, 4.5.3); boat→surface via moveY (4.5.1) | wavy fill (biome bg-tinted) | blue dot |
| `R` | rubble (dig) | true | true | false | false | inherits (solid until dug→`.`) | cracked block | rock color |
| `P` | phase-wall | **true** (solid to enemies/shots/non-phasing player — intended) | true | false | false | phasing→false (player only) | dashed neon | rock color |
| `A` | grapple anchor | **false** (passes player/enemies/shots) | false | false | false | inherits; only grapple mode reads via `isAnchorPx` | glowing ring | gold dot |

(`R`/seal-clearing reuse the `B` break path: a `Projectile` or melee on the glyph mutates it to `.`, persisted via `markFlag("broke:"+id+":"+c+":"+r)` and re-applied by `applyRegionProgress`, 4.10.)

### 12.2 Object literals
```js
// regions[]
const REGIONS = [
  { id:"descent", cols:64, rows:52, playerSpawn:{c:5,r:7},
    biomes:[...], galleries:[...], ladders:[...], ledges:[...], secrets:[...],
    entries:{ fromAbove:{c:5,r:7}, checkpoint:{c:5,r:7}, lastDock:{c:5,r:7} },   // unique names per inbound edge
    enemies:[...], npcs:[...], bosses:[...], pickups:[...], shops:[...],
    docks:[], waterCells:[],
    transitions:[ { id:"toReach", type:"boat", c:60, r:9, toRegion:1, toEntry:"fromReachDock",
                    requires:{type:"vehicle", value:"boat"} } ],   // UNIQUE toEntry per inbound edge (4.4)
    enemyHpMul:1, enemyTouchMul:1, bossHpMul:1, bossTouchMul:1, rewardMul:1, shopMaxTier:4 },
  // ... Regions 2-6 (each with its own UNIQUE inbound entry anchor name) ...
];

// transitions[] (typed) — embedded per region; types: door|gate|portal|boat|mount|elevator (each a distinct mechanism, 4.1)
// gates taxonomy: requires.type in { ability | vehicle | flag | material | trade | key } — key is ONE of six (pillar 4)

// ability/vehicle REGISTRY — js/assets.js ABILITIES + VEHICLES (Section 5.1); wingBoots is legacy/non-serialized (4.9)

// recipes + dropTables — js/recipes.js (Section 7.1); MUST be added to tools/headless.js files[] (Section 13)

// shops — per-region curated stock (Section 8): npc.stock = [{kind,id|tier,price?,cap?,restockOn?,requires?}]

// quests[]
const QUESTS = [
  { giver:"guru:descent", want:{item:"cinder_core",count:1}, reward:"tmpl_ember_blade", opensGate:null },
  { giver:"npc:reach-hermit", want:"prism_shard", reward:"flyShoes", opensGate:"chasm-glide" },
];
// per-region enemy/gear scaling lives on each REGIONS[i] (enemyHpMul etc.) — Section 9.
```
Reuse existing glyphs `# . H T D B`. New glyphs only as specified in 12.1. `Level(def)` defaults to `REGIONS[0]` AND sets `this.npcs/enemies/bosses/pickups` so `tools/inspect.js:13-19` / `tools/headless.js:50` keep working.

---

## 13. Implementation Plan for the Coding Agent

> **COORDINATION (hard):** `COORDINATION.md` — Session B owns `game.js` and `player.js`; Session A will not edit them. All `game.js`/`player.js` changes below are a **coordinated handoff** — deliver diffs to Session B before applying. `level.js`/`entities.js`/`assets.js`/`menu.js`/`recipes.js`/`headless.js` are editable but coordinate the `Level(def)` + scaling-opts + `Boss` ctor changes with Session A.

**Phase 0 — Harden the headless harness FIRST.** *(`tools/headless.js`)*
1. **Add new files to the `files[]` array** (`:46-47`) — `recipes.js` (and any other new file) or it is silently absent from the concatenated scope.
2. Change `:177` to fail loudly with BOTH a value-guard and a key-presence guard (so a *dropped* assertion also fails — every-true alone can't detect a missing key):
```js
const EXPECTED = ["movement","melee","magic","castTierDmg","enemyTouchMul","bossHpMul",
                  "regionRoundTrip","boatFloat","birdSolid","gravFlipLand","craft","reachability","bossWin"];
const haveKeys = EXPECTED.every(k => k in result);
const allOk = Object.values(result).every(v => v === true || (typeof v === "number" && v > 0));
console.log(haveKeys && allOk ? "SMOKE TEST PASSED" : "SMOKE TEST FAILED");
if (!(haveKeys && allOk)) process.exit(1);
```
*Acceptance:* flipping any one assertion OR omitting any `EXPECTED` key makes `node tools/headless.js` exit non-zero.

**Phase 1 — Region/transition system + save migration (the spine).** *(`level.js` param + `isWaterCell`/`openGateCells`/`setTile`, `game.js` `loadRegion`/`reset`/`update` detection/`applyRegionProgress`/save/death/`win`, new `REGIONS`)*
Implement 4.2–4.4, 4.7–4.11, 12. *Acceptance:* `result.regionRoundTrip` — headless boots into `REGIONS[0]`, a scripted `loadRegion(1,"fromReachDock")` then back via a transition round-trips with player stats intact, dead bosses stay dead (`applyRegionProgress`), old-format save loads as Region 0.

**Phase 2 — Ability/equipment kit + vehicles + persistence.** *(`player.js` modes/`isSolid`/`gravSign`/`moveY` rewrite/`moveX` explicit-dx, `assets.js` `ABILITIES`/`VEHICLES`/`ACCESSORIES`, `input.js` dash, 3-site persistence excluding wingBoots from serialize)*
Implement Section 5 + 4.9. *Acceptance:* `result.boatFloat` (boat rests on a `~` cell via moveY), `result.birdSolid` (bird mode still blocked by `#`/`B`/`D`/lockSet), `result.gravFlipLand` (player lands on a ceiling when `gravSign<0`); save→load→death all retain abilities/vehicles/materials/templates; wingBoots not double-encoded.

**Phase 3 — Crafting + materials + drop tables.** *(`js/recipes.js`, `game.js` drop/collect, `entities.js` pickup draw, forge `NPC`, craft `Menu`)*
Implement Section 7. *Acceptance:* `result.craft` — headless kills a mob, collects ore, refines a bar, owns a template, crafts an item; `canCraft` false without template; materials renewable.

**Phase 4 — Curated shops.** *(`menu.js` `buildShopMenu` reads `npc.stock`; `level.js` `shops`; `loadRegion` carries `n.stock`)*
Implement Section 8. *Acceptance:* shop lists only curated lines; no ability-gear buyable; material `cap` respected.

**Phase 5 — Region-themed mobs + power curve.** *(`entities.js` new `case`s + `touchMul`; `Boss` scaling opts + scaled summons; per-region muls; `checkLevelUp` combat-heal gate)*
Implement Sections 6, 9. *Acceptance:* `result.enemyTouchMul` (enemy touch scales) AND `result.bossHpMul` (boss HP scales — explicitly tested via `new Boss('prism',0,0,{hpMul:3})` asserting `hp===120`); a Region-1-geared player needs many hits on a Region-2 mob, few after Region-2 gear.

**Phase 6 — Author Region 1.** Convert current `Level` into `REGIONS[0]`; wire boss→ability drops; Lich→boat (remove `final` from Lich). *Acceptance:* `result.bossWin` updated — killing the Lich asserts `vehicles.has("boat")` (NOT `state==='won'`); full critical-path walk reaches the Lich.

**Phase 7 — Region 2–6 pipeline.** Author per the build sheet (Section 11.3), including the new Region 6 Hollow Crown with `final:true`. *Acceptance:* each region's critical path completes with the intended ability order; killing the Hollow Crown asserts `state==='won'`.

**Phase 8 — Headless tests.** Add to `tools/headless.js`: per-region critical-path walk; transition round-trips including **boat** and **bird**; a crafting test; `castTierDmg`; and a **`result.reachability` guard** (each region + win reachable with intended ability order; no gate passable without its key; no Fly-gated required gap > `flyMax`; every region's tuned-against gear on the critical path). *Acceptance:* all `EXPECTED` keys present and true/positive → exit 0; intentionally removing an ability OR dropping an assertion → exit non-zero.

---

## 14. Authoring Checklist (one page per region)

- [ ] **Unique roster + gear + ability + inbound transition** — no theme/palette/music/mob/gear/transition-type reused from another region; each transition type is its distinct mechanism (4.1).
- [ ] **Inbound transition** has a designed threshold (palette + music swap) and a **uniquely-named** entry anchor (`fromReachDock`, not `fromDock`) — 1:1 transition→entry (4.4).
- [ ] **Every gate's landmark names what's needed** on-screen (`flash(gateHint(...))`) — lock seen before key obtainable (pillar 9).
- [ ] **A key is NEVER the sole way to advance the region** — at least one ability/vehicle/trade/craft gate among the six gate types (pillar 4).
- [ ] **Every craftable has a sourced, RENEWABLE recipe + materials** — template's source hinted; mats appear in this/earlier region drop tables or town stock; no one-shot unrecoverable material (7.1).
- [ ] **Shop stock is curated/region-locked** — consumables/materials/templates/entry rung only; ability-gear & top stats are found/dropped/crafted; no required unique is shop-only (Section 8).
- [ ] **No cross-region soft-locks** — required ability/vehicle/key/material re-acquirable without passing its gate; backtrack transitions returnable; keys kept on death + re-droppable; timed/metered ability never the only exit; Fly gaps ≤ `flyMax`.
- [ ] **Critical-path gear guarantee** — the gear the region is tuned against is a boss drop or on-path craft, NOT an optional secret room (Section 9).
- [ ] **Power curve introduces a NEW tougher mob archetype** with a readable telegraph; muls tuned to guaranteed gear; `touchMul ≤ 2.5` so no one-shots; `rewardMul` rises per region.
- [ ] **Persistence in all three places** (`saveProgress`, `applySave`, death-keep) for every new permanent flag; grid-mutating opens + dead bosses re-applied via `applyRegionProgress` on **load AND death** (4.10).
- [ ] **Mob theme ↔ region gear/ability** — signature mobs preview the verb and drop its craft materials.
- [ ] **Headless guard added** — critical-path walk + boat/bird round-trip + crafting + `reachability` assertion; `tools/headless.js` exits non-zero on any false flag or missing `EXPECTED` key; new files added to `files[]`.
- [ ] **Vehicle/gravity/phase collision stays in player code** — shared `Level` predicates remain player-agnostic so enemies/shots are unaffected (4.0).

---

## Appendix — Review notes addressed

- **BOAT cannot float (blocker):** added explicit moveY water-surface rest code (4.5.1) — snaps to the waterline (`cell is water, cell above is not`), sets `onGround`, stops `vy`; no longer relies on `isSolid` alone.
- **On-foot water incoherent / walkable lake (major):** resolved to ONE rule — on foot, water is an OPEN GAP (fall hazard with damage + teleport to last dock, 4.5.3), never solid; boat makes it a surface. `isGroundPx('~')` is false for both player and enemies (4.0).
- **Bird bypasses boss seals/breakables/doors (major):** bird mode keeps full `isSolidPx` solidity for `#`/`B`/`D` and `lockSet` (4.5.2); `Player.isSolid` returns `lockSet` solid in EVERY mode — only gravity/vertical control change.
- **Gravity-flip is more than a sign-flip (major):** provided the full rewritten `moveY` generalized by `gravSign`, disabled the `T` one-way drop-through and ladder climbing while inverted, added flip-only-while-grounded + destination-surface probe to prevent stranding (5.2).
- **Predicate state-threading (overall root cause):** added Section 4.0 — vehicle/gravSign/phase resolved ONLY in player code; shared `Level` predicates stay player-agnostic so enemies/shots are correct.
- **`applyRegionProgress` named but never defined (missing piece / overall):** fully specified (4.10) — re-applies dead bosses (flag→`b.dead`), opened doors/gates, broken `B`/`R` walls; called in `loadRegion`; dead-boss flag mapping written explicitly.
- **Dead-boss persistence (missing piece):** `killBoss` always sets `boss:<id>:<kind>`; `applyRegionProgress` reads it to set `b.dead=true` (4.10, 6.3).
- **Lich-final split breaks existing headless assertion (missing piece):** documented the migration — `final` removed from Lich; Lich grants boat; new Region 6 Hollow Crown is `final:true`; headless `bossWin` updated (4.12, 11.2, 13).
- **Death key policy contradiction + one-shot key soft-lock (major):** resolved — keep keys on death; every gate-critical key re-acquirable; no region key-gated by a one-shot consumable (4.8).
- **wingBoots double-encoded (minor):** wingBoots stays legacy `boots`/`maxJumps>=3` only, excluded from `serializeAbilities`; `ABILITIES` marks it `legacy/serialize:false` (4.9, 5.1).
- **Dash conflates `this.vx` with dash dx + tunneling (minor):** dash uses an explicit `dashDx`, 2 sub-steps of 3.5px; superDash (`vx=9>TILE/2`) uses 3 sub-steps (5.2).
- **Grapple/phase asymmetry must be stated (minor):** `A` non-solid in `isSolidPx`; `P` solid in `isSolidPx` (blocks enemies/shots) and only `Player.isSolid` phases it — intended, documented (5.2, 12.1).
- **Generic shared entry anchor (minor):** entry anchors are unique per inbound edge (`fromReachDock`, `fromVaultPortal`); 1:1 transition→entry enforced (4.4, 12.2, 14).
- **Boss seal vs. exit transition (minor):** exit gate's `requires` references the boss-dead flag → inert mid-fight; gate tile authored outside `lock` cells (4.11).
- **Headless acceptance weak / new files absent (minor):** added `EXPECTED` key-presence guard + value guard + `process.exit(1)`; `recipes.js` added to `files[]`; boss-scaling explicitly tested (13).
- **inspect.js back-compat (missing piece):** `Level(def)` defaults to `REGIONS[0]` AND sets `this.npcs/enemies/bosses/pickups` instance fields (4.2, 12.2).
- **Boss scaling untested (missing piece):** Phase 5 adds an explicit `bossHpMul` assertion (`new Boss('prism',0,0,{hpMul:3})` → `hp===120`).
- **Lich summons unscaled (balance):** summons inherit region muls via stored `summonHpMul/summonTouchMul` (6.3).
- **Touch curve one-shots in late regions (balance):** `touchMul` ceiling lowered to ×2.5; re-tuned table keeps late net hit ≤~30% of HP (3–4 hits) — Section 9.
- **Backtrack has no economic payoff (balance):** `rewardMul` rises per region; backtrack payoff is the gated landmark loot + shortcut, explicitly placed (9, 10, 11.3).
- **Guaranteed gear in optional secret (balance):** critical-path guarantee added — tuned-against gear is always a boss drop / on-path craft; Region 2 tuned to boss Dash, not the secret Wing Boots (9, 11.2).
- **Rank-up free heals flatten difficulty (balance):** rank-up full-restore gated to out-of-combat; in combat only +25% HP (9).
- **Material soft-lock (crafting):** all recipe mats renewable (respawning mobs) or town-buyable after the boss flag; no one-shot unrecoverable material (7.1).
- **Camera clamp jitter in short regions (missing piece):** camera reseed uses `max(0, min(hi, want))` so lo wins when `pixelH < VIEW_H` (4.3).