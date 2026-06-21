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
| Jump | **Space** or **Z** |
| Attack (melee) | **J** or **X** |
| Cast magic (costs MP) | **K** or **C** |
| Use / open door | **Enter** |

## What's in this build

- Walk · jump · gravity · **ladder climbing**
- **Melee** swing + **magic projectiles** (MP cost, slow regen)
- Enemies (ground **walkers** + **flyers**), contact damage, i-frames, knockback
- RPG stats HUD: **HP / MP / EXP / Gold / Keys / Rank-title** (16 Faxanadu-style ranks)
- Pickups: gold, bread (heal), **key**
- A **key-gated door** blocking the goal — find the key, unlock, reach the summit
- Smooth-scrolling camera over a contiguous tilemap (open-world ready — no screen flips)
- All art is procedural neon placeholder — easy to re-skin later

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
