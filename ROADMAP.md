# XAXANADU — Roadmap

Effort: 🟢 quick · 🟡 medium · 🔴 big. Check items off as we ship them.

## ✅ Done
- [x] Core engine: loop, AABB tilemap collision, smooth camera
- [x] Player: walk, gravity, **double jump**, ladder climbing (walkable tops)
- [x] **Momentum** movement (accelerate, reset on stop/melee)
- [x] Combat: melee (weapon dmg) + magic projectiles (MP cost)
- [x] Enemies: walkers + flyers, contact damage, i-frames, knockback
- [x] Open-world **descent** cave map with key-gated Core
- [x] RPG HUD: HP/MP/ATK/DEF/MAG/EXP/Gold/Keys/Rank-title
- [x] Surface **town**: Shop (weapons/armor/magic/elixir/keys) + Guru (rest/save)
- [x] **Magic upgrades** (Spark → Flux Bolt → Void Lance)
- [x] **Mantra save/Continue** (localStorage)
- [x] **Title screen** (New Game / Continue)
- [x] Xbox **gamepad** support (use Chrome; Edge gates the Gamepad API)
- [x] New enemy types: jumper, shooter, ceiling-crawler + enemy projectiles
- [x] Warden enemy **drops the key**
- [x] **Core Guardian boss** with HP bar + **locked arena** (sealed until defeated)
- [x] Juice: SFX, level-up moment, hit particles, screen shake, coyote time + jump buffer
- [x] **Background + boss music** (original synth loops); M to mute
- [x] Gold **drops as a pill** with a pop/scatter effect
- [x] Attack/cast in **both directions**, including on ladders
- [x] MP sustainability: faster regen, **mana drops**, **Ether** in shop
- [x] **Pause / status screen** (loadout view) + Save + Quit
- [x] Content-sized menus with a popped purchase banner (no overlap)
- [x] **Depth biomes** (Crystal Caves → Deep Hollows → Magma Depths → Core) + zone banners
- [x] **Camera look-ahead** in the facing/climb direction
- [x] **Procedural animation** (player walk/climb/jump; enemy flap/waddle/squash/charge; boss pulse)
- [x] **Secret rooms** behind **breakable walls** (smash with melee/magic)
- [x] **Wing Boots** ability — **triple jump** (hidden reward, persisted)
- [x] **Second town** (Emberhold) — mid-descent shop + Guru resupply
- [x] **Minimap** (layout + player / town / boss / gate markers)
- [x] Illustrated **sprite art** pipeline (Numeria mobs/boss) with neon fallback
- [x] **Timed power-ups**: Haste / Shield / Power, with HUD countdown chips
- [x] **3 save slots** with a title-screen slot picker (continue / new / erase)
- [x] **Rank raises max HP/MP** (pools grow as you climb titles)
- [x] **Floating damage numbers** on every hit (you take and deal)
- [x] **Run stats** (time / foes / deaths) tracked per run
- [x] **Win / credits screen** showing the run summary
- [x] **Fullscreen** setting (Settings menu + F hotkey) + Sound toggle
- [x] **Four bosses**, each with a signature ability:
      Prism Sentinel (timed shield + ricochet bolts), Hollow Maw (burrow/erupt),
      Cinderbrute (shockwave + arcing fire, drops the key), Storm Lich
      (spread shots, enrages & summons below half HP). Each seals its arena.
- [x] **Hi-res rendering** (3× backing + smoothing) for crisp fullscreen
- [x] **Illustrated parallax backgrounds** per biome + foreground vignette
- [x] **Knight** player sprite (neon fallback)
- [x] **5 tiers** of weapons/armor/magic + **town-tiered shops** (deeper = stronger gear)

- [x] 🔴 **Separate levels per boss** — data-driven linear level chain
      (`LEVELS` + generator in `level.js`): town → combat floors (own mob set,
      scaled HP/reward) → boss. Beat it to descend to the next level; the final
      boss wins. Level index persists in the save.

## Combat & abilities
- [ ] 🟢 Faster/▲ MP regen or MP pickups
- [ ] 🟢 Crouch + crouch/up attacks
- [ ] 🟡 Charge attack / screen-clear spell (Faxanadu *Tilte*)
- [ ] 🟡 Magic behaviors: piercing / arcing / homing
- [ ] 🟡 Shield block / parry

## Enemies & bosses
- [ ] 🟢 More enemy types (jumpers, shooters, crawlers, turrets)
- [ ] 🟢 Enemy that **drops the key**
- [ ] 🟡 Spawners / respawn on revisit
- [ ] 🔴 **Boss fights** per area + HP bar
- [ ] 🔴 Final boss in the Core

## World & exploration
- [ ] 🟡 Distinct areas/tilesets as you descend (caves → magma → ruins → Core)
- [ ] 🟡 More towns/hubs deeper down
- [ ] 🟡 Secret rooms, breakable walls, hidden caches
- [ ] 🟡 Ability-gated traversal (Wing Boots, Mattock)
- [ ] 🔴 Map / minimap
- [ ] 🔴 Hand-authored chunks + far-entity culling

## RPG systems
- [ ] 🟢 **Level-up moment** (flash + heal + sound)
- [ ] 🟡 Rank raises max HP/MP
- [ ] 🟡 Real typeable mantra codes
- [ ] 🟡 Sell old gear / stock consumables
- [ ] 🟡 Inventory screen for usable items

## Items & economy
- [ ] 🟢 Timed power-ups (speed boots, invincibility) using HUD timer
- [ ] 🟢 Carried potions you use on demand
- [ ] 🟡 Colored keys / doors
- [ ] 🟡 Equipment changes appearance

## Game feel & juice
- [ ] 🟢 Coyote time + jump buffering
- [ ] 🟢 Screen shake + death particles
- [ ] 🟢 Camera look-ahead
- [ ] 🟡 Parallax background layers per area
- [ ] 🟡 Animated sprites

## Audio
- [ ] 🟢 SFX: jump, hit, magic, coin, door, level-up (WebAudio)
- [ ] 🟢 Mute toggle
- [ ] 🟡 Looping chiptune per area

## UX & meta
- [ ] 🟢 Pause menu + settings (volume, rebinding)
- [ ] 🟢 Gamepad deadzone/sensitivity setting
- [ ] 🟡 Multiple save slots
- [ ] 🟡 Stats: playtime, deaths, score
- [ ] 🟡 Damage / floating text

## Technical & polish
- [ ] 🟢 Favicon + page polish; itch.io-ready build
- [ ] 🟡 ES modules / bundler as files grow
- [ ] 🟡 Real assertion test runner (extend headless harness)
- [ ] 🔴 three.js / different-look pass once 2D feel is locked

---

### What's left (deliberate, needs your input)
The quick/medium backlog is cleared. Remaining are big, optional directions:
- **three.js / "different look" pass** — the 3D reskin you flagged at the start.
  Its own effort; needs an art-direction decision first.
- **More content** — additional zones/towns, a second boss, more enemy variety.
- **Niceties** — typeable mantra codes, sell-back shop, colored keys, gamepad
  sensitivity setting, favicon/itch packaging.

Everything in **✅ Done** is implemented and covered by `tools/headless.js`.
