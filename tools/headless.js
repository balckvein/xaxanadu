// Headless smoke test: stub canvas/DOM, build the Game, drive it with a fake
// gamepad for several hundred frames + a menu pass. Catches runtime wiring
// bugs (missing globals, typos) that node --check can't see. Not shipped.
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "js");

// ---- stubs ----
const ctx = {
  canvas: null,
  imageSmoothingEnabled: false, filter: "",
  fillStyle: "", strokeStyle: "", shadowColor: "", shadowBlur: 0,
  lineWidth: 1, font: "", textAlign: "", textBaseline: "",
  fillRect() {}, strokeRect() {}, fillText() {},
  beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  arc() {}, fill() {}, closePath() {},
  translate() {}, scale() {}, drawImage() {}, setTransform() {}, createPattern() { return null; },
  measureText(s) { return { width: (s ? s.length : 0) * 5 }; },
  save() {}, restore() {}, globalAlpha: 1,
};
const canvas = { width: 512, height: 288, getContext: () => ctx };
ctx.canvas = canvas;

// Image stub (assets.js preloads sprites via `new Image()`); never "loads"
// in headless, so Assets.get() returns null and the neon fallbacks are used.
global.Image = class { constructor() { this.src = ""; this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; } };

const pad = { connected: true, index: 0, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };

const env = {
  window: { addEventListener() {}, __noop: true },
  document: { getElementById: () => canvas },
  navigator: { getGamepads: () => [pad] },
  localStorage: (() => { let s = {}; return {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => { s[k] = String(v); },
    removeItem: (k) => { delete s[k]; },
  }; })(),
  console,
};

const press = (i, on = true) => { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
const axis = (i, v) => { pad.axes[i] = v; };

const files = ["assets.js", "recipes.js", "audio.js", "input.js", "level.js", "entities.js", "player.js", "hud.js", "menu.js", "game.js"];
let src = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");

src += `
  const game = new Game(canvas);
  const tick = () => { game.update(); game.render(); };

  // title screen -> New Game
  tick(); // render title once
  const startedAtTitle = game.state === "title";
  press(0, true); tick(); press(0, false);   // confirm first option (New Game)
  const enteredPlay = game.state === "play";

  // pause menu toggle (Start / button 9)
  press(9, true); tick(); press(9, false); tick();
  const pauseOpened = game.menu !== null;
  press(9, true); tick(); press(9, false); tick();
  const pauseClosed = game.menu === null;

  // idle fall/stand
  for (let i = 0; i < 60; i++) tick();

  // DASH ability (Phase 2): grant it, dash right, expect a clear horizontal burst
  game.player.abilities.canDash = true;
  game.player.dir = 1; game.player.dashUsed = false; game.player.dashTimer = 0;
  for (let i = 0; i < 4; i++) tick();          // settle
  const dashX0 = game.player.x;
  press(10, true); tick(); press(10, false);   // dash (left-stick click)
  for (let i = 0; i < 12; i++) tick();
  const dashed = game.player.x - dashX0 > 40;  // dash >> a walk would move
  game.player.abilities.canDash = false;       // don't disturb later movement tests

  // walk right with momentum
  axis(0, 1);
  for (let i = 0; i < 120; i++) tick();
  const movedRight = game.player.x > 90;

  // double jump: press, release, press midair, release
  press(0, true); tick(); press(0, false);
  for (let i = 0; i < 6; i++) tick();
  press(0, true); tick(); press(0, false);
  const didDouble = game.player.jumps >= 1;
  for (let i = 0; i < 30; i++) tick();

  // attack + magic
  press(2, true); for (let i = 0; i < 14; i++) tick(); press(2, false);
  press(1, true); for (let i = 0; i < 4; i++) tick(); press(1, false);
  axis(0, 0);

  // open a deep shop (maxTier 4), buy every upgrade + Wing Boots
  game.player.gold = 14000;
  game.openMenu(buildShopMenu(game.player, 4));
  const shop = game.menu;
  for (let row = 0; row < shop.entries.length - 1; row++) {
    game.menu.index = row;
    press(0, true); tick();                     // buy this row (fresh press edge)
    press(0, false); tick();                    // release so the next press re-arms
  }
  const maxedGear = game.player.weaponTier === 4 && game.player.armorTier === 4 && game.player.magicTier === 4;
  const gotBoots = game.player.maxJumps === 3;  // Wing Boots bought from the shop
  press(2, true); tick(); press(2, false);      // close menu
  const menuClosed = game.menu === null;

  // cast the upgraded magic from open space (away from the boss so the bolt flies free)
  game.projectiles = [];
  game.player.mp = game.player.mpMax;
  game.player.x = 3 * TILE; game.player.y = 16 * TILE; game.player.dir = 1;
  game.enemies = []; game.bosses.forEach((b) => (b.active = false));
  press(1, true); tick(); press(1, false);
  const castTierDmg = game.projectiles.length ? game.projectiles[0].dmg : 0;
  for (let i = 0; i < 30; i++) tick();

  // guru menu: rest + save
  game.openMenu(buildGuruMenu(game.player));
  press(0, true); tick(); press(0, false);     // rest
  press(13, true); tick(); press(13, false);   // down to save
  press(0, true); tick(); press(0, false);     // save
  game.closeMenu();
  const saved = env.localStorage.getItem("xaxanadu.save.0") !== null;

  // back to title, then Continue (slot 0) restores the saved magic tier
  game.toTitle();
  game.player.magicTier = 0; // prove load actually sets it
  const hasContinue = game.hasSave(0);
  game.titleIndex = 0;
  press(0, false); tick();                      // release frame so jump edge re-arms
  press(0, true); tick(); press(0, false);      // confirm Continue (slot 0)
  const continued = game.state === "play" && game.player.magicTier === 4;

  // save slots are independent + erasable
  game.activeSlot = 1; game.saveProgress();
  const slot1Saved = game.hasSave(1);
  game.eraseSlot(1);
  const slotsWork = slot1Saved && !game.hasSave(1) && game.hasSave(0);

  // level-up moment fires + grows HP/MP pools
  game.player.exp = 5000;
  const beforeRank = game.lastRankIndex;
  game.checkLevelUp();
  const leveled = game.lastRankIndex > beforeRank && game.effects.length > 0;
  const grewMax = game.player.hpMax > 16 && game.player.mpMax > 12;

  // timed power-ups
  const baseAtk = WEAPONS[game.player.weaponTier].dmg;
  game.player.buffs = { haste: 0, shield: 0, power: 0 };
  game.player.addBuff("power", 300);
  const powerWorks = game.player.meleeDmg === baseAtk * 2;
  game.player.addBuff("haste", 300);
  const hasteWorks = game.player.speedCap > game.player.maxSpeed;
  game.player.addBuff("shield", 300);
  const shieldWorks = game.player.takeHit(99) === false && game.player.hp > 0;

  // every one of the 9 levels carries its single boss (4 descent-zone + 5 deeper)
  const ALL_KINDS = ["prism", "burrower", "cinder", "lich", "tide", "pendulum", "roc", "nullengine", "crown"];
  const foundKinds = new Set();
  for (let r = 0; r < 9; r++) { game.loadRegion(r, undefined); for (const b of game.bosses) foundKinds.add(b.kind); }
  game.loadRegion(0, "start");
  const hasBosses = ALL_KINDS.every((k) => foundKinds.has(k));
  const pb = new Boss("prism", 0, 0); pb.shielded = true; const prismGuard = pb.invulnerable() === true;
  const bb = new Boss("burrower", 0, 0); bb.mode = "down"; const burrowGuard = bb.invulnerable() === true;

  // exercise the level-1 boss AI (shielded so the player survives the barrage)
  game.player.addBuff("shield", 4000);
  for (const b of game.bosses) b.active = true;
  for (let i = 0; i < 150; i++) tick();

  // beating the level-1 boss (Prism) grants its ability (Dash) + records a kill
  const prismB = game.bosses.find((b) => b.kind === "prism");
  prismB.dead = true; game.killBoss(prismB);
  const prismDropsDash = game.player.abilities.canDash === true && game.state !== "won";
  const statsTracked = game.stats.kills > 0 && game.stats.time > 0;

  for (let i = 0; i < 60; i++) tick();

  // --- Phase 1: region/transition engine round-trip ---
  // Player is preserved across loadRegion; transient arrays flush; a boss marked
  // dead stays dead on re-entry (applyRegionProgress).
  game.player.exp = 1234; game.player.weaponTier = 2;
  game.markFlag("boss:crystal:prism");
  game.loadRegion(1, "fromCrystal");
  const inLvl2 = game.regionIdx === 1 && game.level.id === "hollows" &&
                 game.projectiles.length === 0 && game.enemyShots.length === 0;
  game.loadRegion(0, "start");
  const backHome = game.regionIdx === 0 && game.level.id === "crystal";
  const statsKept = game.player.exp === 1234 && game.player.weaponTier === 2;
  const bossStaysDead = !!game.bosses.find((b) => b.kind === "prism" && b.dead);
  const regionRoundTrip = inLvl2 && backHome && statsKept && bossStaysDead;

  // per-region scaling opts actually apply (boss/enemy)
  const bossHpScales = new Boss("prism", 0, 0, { hpMul: 3 }).hp === 120;        // 40 * 3
  const enemyTouchScales = new Enemy("walker", 0, 0, { touchMul: 2 }).touch === 16; // 8 * 2

  // a broken wall stays broken after re-entering the level (inject a B tile, smash, reload)
  game.loadRegion(0, "start"); game.level.set(20, 14, "B"); game.level.breakHp["20,14"] = 4;
  game.breakAt(20, 14, 99);
  const wallBroke = game.level.tileAt(20, 14) === ".";
  game.loadRegion(0, "start");
  const brokenWallPersists = wallBroke && game.level.tileAt(20, 14) === ".";

  // abilities serialize into the save (Phase 2 persistence)
  game.player.abilities.canDash = true; game.activeSlot = 2; game.saveProgress();
  let abilitySaved = false;
  try { const d = JSON.parse(env.localStorage.getItem("xaxanadu.save.2")); abilitySaved = !!(d && d.abilities && d.abilities.canDash); } catch (e) {}

  // --- Phase 2b: ability movement (climb / bird / boat / grav-flip) ---
  // All four are gated behind a flag/vehicle, so none affect normal play
  // (Region 0 grants none). Tested in isolation against the descent's known
  // surface gallery (open rows 2..7, floor row 8, solid border cols 0..1).
  const P = game.player;
  const cleanStage = () => {                         // isolate player physics each test
    game.state = "play"; game.menu = null;
    game.enemies = []; game.enemyShots = []; game.projectiles = [];
    game.bosses.forEach((b) => (b.active = false));
    P.vehicle = null; P.gravSign = 1; P.climbing = false; P.abilities = {};
    P.vx = 0; P.vy = 0; P.dashUsed = false; P.lastWallSide = 0; P.maxJumps = 2;
    P.jumpBuf = 0; P.coyote = 0; P.jumps = 0;        // clear buffered jumps from a prior test
    P.addBuff("shield", 9999);                       // ignore any stray contact damage
    axis(0, 0); axis(1, 0);
  };
  // carve a tall test shaft into Region 0: solid walls at the given cols, open between.
  const carveShaft = (wallCols, openCols, r0, r1) => {
    for (let r = r0; r <= r1; r++) {
      for (const c of wallCols) game.level.set(c, r, "#");
      for (const c of openCols) game.level.set(c, r, ".");
    }
  };

  // Geometry of a genRegion level: open rows 11-17, floor row 18, solid ceiling row
  // 10, full-height border walls at col 0 / col 43. Physics tests carve what they need.

  // CLIMB: cling to a wall mid-air -> slow controlled slide (not free-fall)
  game.loadRegion(1, "fromCrystal"); cleanStage();   // physics tests run in a stable genRegion corridor
  P.abilities.canClimb = true;
  P.x = 1 * TILE; P.y = 12 * TILE; P.onGround = false; // hug the col-0 border wall, in air
  axis(0, -1);                                         // hold left into the wall
  const climbY0 = P.y;
  for (let i = 0; i < 18; i++) tick();
  const climbed = (P.y - climbY0) < 24;               // clung-slide << free-fall to floor 18

  // BIRD: flight rises against gravity on input, and hovers (never free-falls)
  game.loadRegion(1, "fromCrystal"); cleanStage();   // physics tests run in a stable genRegion corridor
  P.vehicle = "bird";
  P.x = 6 * TILE; P.y = 13 * TILE; P.onGround = false;
  const birdY0 = P.y; axis(1, -1);                    // hold up
  for (let i = 0; i < 10; i++) tick();
  const birdRose = P.y < birdY0 - 8;
  axis(1, 0); const birdHoverY = P.y;
  for (let i = 0; i < 10; i++) tick();                // no input -> hovers, gravity suspended
  const birdHovers = Math.abs(P.y - birdHoverY) < 1;

  // BOAT: floats on the water surface instead of falling through it
  game.loadRegion(1, "fromCrystal"); cleanStage();   // physics tests run in a stable genRegion corridor
  for (let c = 4; c <= 8; c++) { game.level.set(c, 15, "~"); game.level.waterSet.add(c + ",15"); }
  P.vehicle = "boat";
  P.x = 6 * TILE; P.y = 12 * TILE; P.onGround = false;
  for (let i = 0; i < 30; i++) tick();                // settle onto the waterline (row 15)
  const boatFloats = P.onGround && P.y > 200 && P.y < 15 * TILE;

  // GRAV-FLIP: invert gravity, "fall" upward, and stand on the ceiling (row 10)
  game.loadRegion(1, "fromCrystal"); cleanStage();   // physics tests run in a stable genRegion corridor
  P.abilities.canInvert = true;
  P.x = 6 * TILE; P.y = 16 * TILE; P.onGround = true; // stable footing required to flip
  press(11, true); tick(); press(11, false);          // right-stick click = grav-flip
  const flipped = P.gravSign === -1;
  for (let i = 0; i < 40; i++) tick();                // rise to the ceiling
  const gravFlips = flipped && P.y < 16 * TILE && P.onGround;
  game.loadRegion(0, "start");

  // --- Phase 2b hardening: fixes for the adversarial review's confirmed bugs ---
  // carve a ladder at col 8 (one-way top + rungs) for the ladder-grab tests
  const carveLadder = () => { game.level.set(8, 11, "T"); for (let r = 12; r <= 17; r++) game.level.set(8, r, "H"); };

  // FIX: ladders are normal-gravity only -> no grab while inverted
  game.loadRegion(1, "fromCrystal"); cleanStage(); carveLadder(); // genRegion corridor + a ladder for the grab tests
  P.abilities.canInvert = true; P.gravSign = -1;
  P.x = 8 * TILE + (TILE - P.w) / 2; P.y = 14 * TILE; P.onGround = false; // on a col-8 rung
  axis(1, 1);                                          // hold down (the old grab trigger)
  let invGrabbed = false;
  for (let i = 0; i < 20; i++) { tick(); if (P.climbing) invGrabbed = true; }
  const invLadderSafe = !invGrabbed;
  axis(1, 0); P.climbing = false;

  // GUARD: normal-gravity ladder grab still works (didn't over-restrict)
  game.loadRegion(1, "fromCrystal"); cleanStage(); carveLadder(); // genRegion corridor + a ladder for the grab tests
  P.x = 8 * TILE + (TILE - P.w) / 2; P.y = 14 * TILE; P.onGround = false;
  axis(1, -1);                                         // hold up on the ladder
  let normGrabbed = false;
  for (let i = 0; i < 5; i++) { tick(); if (P.climbing) normGrabbed = true; }
  const normLadderGrab = normGrabbed;
  axis(1, 0); P.climbing = false;

  // FIX: one flat wall can't be scaled forever (anti single-wall wall-jump climb)
  game.loadRegion(1, "fromCrystal"); cleanStage();   // physics tests run in a stable genRegion corridor
  P.abilities.canClimb = true;
  carveShaft([2], [3], 2, 20);                         // left wall col2, open shaft col3
  P.x = 3 * TILE; P.y = 16 * TILE; P.onGround = false; P.vy = 1;
  axis(0, -1);                                         // hold INTO the single wall
  let minY = P.y;
  for (let i = 0; i < 200; i++) {
    if (i % 18 === 0) { press(0, true); tick(); press(0, false); } else tick(); // tap jump
    if (P.y < minY) minY = P.y;
  }
  const singleWallBounded = (16 * TILE - minY) < 160;  // ~2 jumps max, not the big exploit climb
  axis(0, 0);

  // FIX: holding UP against a wall only hangs (no free vertical climb)
  game.loadRegion(1, "fromCrystal"); cleanStage();   // physics tests run in a stable genRegion corridor
  P.abilities.canClimb = true;
  carveShaft([2], [3], 2, 20);
  P.x = 3 * TILE; P.y = 16 * TILE; P.onGround = false; P.vy = 1;
  axis(0, -1); axis(1, -1);                            // hold into wall + up, NO jumping
  const upClingY0 = P.y;
  for (let i = 0; i < 120; i++) tick();
  const upClingNoAscent = P.y >= upClingY0 - 4;        // must not gain altitude
  axis(0, 0); axis(1, 0);

  // GUARD: a TWO-wall shaft still ascends by alternating wall-jumps; same-wall blocked
  game.loadRegion(1, "fromCrystal"); cleanStage();   // physics tests run in a stable genRegion corridor
  P.abilities.canClimb = true;
  carveShaft([2, 5], [3, 4], 2, 20);                   // walls col2 & col5, open col3,4
  P.x = 3 * TILE; P.y = 16 * TILE; P.onGround = false; P.vy = 1; P.lastWallSide = 0; P.jumps = 1;
  axis(0, -1);                                         // cling LEFT wall
  press(0, true); tick();
  const wj1 = P.vy < -3 && P.lastWallSide === -1;      // jumped off the left wall
  press(0, false); tick();                             // release-frame re-arms the jump edge
  axis(0, 1);                                          // teleport to the RIGHT wall (lastWallSide still -1)
  P.x = 4 * TILE + (TILE - P.w); P.y = 16 * TILE; P.onGround = false; P.vy = 1; P.jumps = 1;
  press(0, true); tick();
  const wj2 = P.vy < -3 && P.lastWallSide === 1;       // jumped off the OTHER wall -> alternating ascent
  press(0, false); tick();
  const altWallJump = wj1 && wj2;
  // same RIGHT wall again, jump budget exhausted -> neither wall-jump nor double-jump fires
  axis(0, 1);
  P.x = 4 * TILE + (TILE - P.w); P.y = 16 * TILE; P.onGround = false; P.vy = 1;
  P.jumps = P.maxJumps; P.lastWallSide = 1;
  press(0, true); tick();
  const sameWallBlocked = !(P.vy < -3);
  press(0, false); axis(0, 0);
  game.loadRegion(0, "start");                         // leave a clean level behind

  // --- Phase 3: crafting / materials / drop tables ---
  game.loadRegion(0, "fromAbove"); cleanStage();
  const P3 = game.player;
  P3.materials = {}; P3.templates = new Set(); P3.gold = 1000; P3.weaponTier = 0;
  const hasDropData = typeof DROP_TABLES !== "undefined" && !!DROP_TABLES.walker &&
                      typeof RECIPES !== "undefined" && !!RECIPES.ember_blade;
  // a mob death drops renewable materials as pickups (force a guaranteed roll)
  game.pickups = [];
  game.rollDrops([{ mat: "iron_ore", chance: 1.0, qty: [2, 2] }], 100, 100);
  const dropWorks = game.pickups.some((pk) => pk.type === "material" && pk.mat === "iron_ore" && pk.qty === 2);
  // walking over a material pickup banks it (the collect branch in the pickup loop)
  game.pickups = [new Pickup("material", P3.x, P3.y, { mat: "iron_ore", qty: 6 })];
  tick();
  const collected = (P3.materials.iron_ore || 0) >= 6;
  // refine: iron_ore ×3 -> iron_bar (always known, no template)
  game.craft(RECIPES.iron_bar);
  game.craft(RECIPES.iron_bar);
  const refined = (P3.materials.iron_bar || 0) >= 2 && (P3.materials.iron_ore || 0) === 0;
  // assemble ember_blade needs 2 bars + 1 cinder_core + the schematic
  P3.materials.cinder_core = 1;
  const craftBlocked = !canCraft(P3, RECIPES.ember_blade);   // no template yet
  P3.templates.add("tmpl_ember_blade");
  const craftReady = canCraft(P3, RECIPES.ember_blade);
  game.craft(RECIPES.ember_blade);
  const emberIdx = WEAPONS.findIndex((w) => w.id === "ember_blade");
  const crafted = emberIdx >= 0 && P3.weaponTier === emberIdx && (P3.materials.iron_bar || 0) === 0;
  // crafting/found gear is never shop-stocked (curated scarcity, §8)
  P3.weaponTier = 0;
  const shopNoCraftGear = !buildShopMenu(P3, 5).entries.some((e) => /Ember Blade/.test(e.label()));
  const craft = hasDropData && dropWorks && collected && refined && craftBlocked && craftReady && crafted && shopNoCraftGear;

  // re-crafting an already-owned tier is a no-op that spends NOTHING (review fix)
  P3.weaponTier = emberIdx; P3.materials = { iron_bar: 2, cinder_core: 1 }; P3.gold = 500;
  P3.templates = new Set(["tmpl_ember_blade"]);
  const reNote = game.craft(RECIPES.ember_blade);
  const reCraftNoSpend = P3.weaponTier === emberIdx && (P3.materials.iron_bar || 0) === 2 &&
                         (P3.materials.cinder_core || 0) === 1 && P3.gold === 500 && /already|owned|better/i.test(reNote);
  // a gold-only shortfall reports gold (not "materials") and still spends nothing
  P3.weaponTier = 0; P3.materials = { iron_bar: 2, cinder_core: 1 }; P3.gold = 0;
  const goldMsg = game.craft(RECIPES.ember_blade);
  const goldBlocked = /gold/i.test(goldMsg) && (P3.materials.iron_bar || 0) === 2 && P3.weaponTier === 0;

  // materials + templates persist through a save (pillar 11)
  P3.materials = { iron_ore: 4 }; P3.templates = new Set(["tmpl_ember_blade"]);
  game.activeSlot = 3; game.saveProgress();
  let craftPersist = false;
  try {
    const d = JSON.parse(env.localStorage.getItem("xaxanadu.save.3"));
    craftPersist = !!(d && d.materials && d.materials.iron_ore === 4 &&
                      Array.isArray(d.templates) && d.templates.includes("tmpl_ember_blade"));
  } catch (e) {}
  // ...and applySave restores them back ONTO the player (not just the JSON)
  game.activeSlot = 4; game.player.materials = { iron_ore: 7 }; game.player.templates = new Set(["tmpl_ember_blade"]);
  game.saveProgress();
  game.player.materials = {}; game.player.templates = new Set();
  game.applySave(game.readSave(4));
  const loadRestores = game.player.materials.iron_ore === 7 && game.player.templates.has("tmpl_ember_blade");

  game.loadRegion(0, "fromAbove");                   // leave a clean region behind

  // --- Phase 4: curated, region-locked shop stock ---
  game.loadRegion(2, "fromHollows"); cleanStage();   // Magma level — its shop sells the schematic
  const P4 = game.player;
  const shopNpc = game.npcs.find((n) => n.kind === "shop" && n.stock && n.stock.some((s) => s.kind === "template"));
  const stockMenu = buildShopMenu(P4, shopNpc, game);
  const labels = stockMenu.entries.map((e) => e.label());
  // curated: entry-rung gear only, never top-tier or crafted weapons stocked
  // (schematic knowledge like "Ember Blade Schematic" IS allowed — it's not the weapon)
  const curatedOnly = !!shopNpc && !labels.some((l) => /Weapon: (Plasma Edge|Starcleaver|Ember Blade)/.test(l));
  // schematic is buyable knowledge -> goes into p.templates
  P4.gold = 100000; P4.templates = new Set();
  const tEntry = stockMenu.entries.find((e) => /Schematic/.test(e.label()));
  if (tEntry) tEntry.action(P4, game);
  const templateBuyable = !!tEntry && P4.templates.has("tmpl_ember_blade");
  // material cap respected (copper_ore cap:5 -> exactly 5 buys, then sold out)
  P4.materials = {}; shopNpc.bought = {};
  const mEntry = stockMenu.entries.find((e) => /Buy .*Ore/.test(e.label()));
  let oreBuys = 0; for (let i = 0; i < 12; i++) { if (/Bought/.test(mEntry.action(P4, game))) oreBuys++; }
  const capRespected = !!mEntry && oreBuys === 5 && (P4.materials.copper_ore || 0) === 5;
  // a requires-gated line is hidden until its flag flips
  const gNpc = { kind: "shop", stock: [{ kind: "consumable", id: "elixir", requires: { type: "flag", value: "test:shopflag" } }] };
  const beforeFlag = buildShopMenu(P4, gNpc, game).entries.length; // Leave only (elixir hidden)
  game.markFlag("test:shopflag");
  const afterFlag = buildShopMenu(P4, gNpc, game).entries.length;  // elixir now shown
  const requiresGate = afterFlag === beforeFlag + 1;
  const shopStock = curatedOnly && templateBuyable && capRespected && requiresGate;
  game.loadRegion(0, "fromAbove");                   // leave a clean region behind

  // --- Perf: graphics-quality toggle (mobile low-res mode) ---
  game.state = "play"; game.menu = null;
  game.setQuality("low");
  const lowOk = GFX.quality === "low" && RENDER_SCALE === 1.5 && GFX.glow === 0 && GFX.filter === false &&
                game.canvas.width === VIEW_W * 1.5;
  tick();                                            // a LOW-gfx frame must render without throwing
  game.setQuality("high");
  const highOk = GFX.quality === "high" && RENDER_SCALE === 3 && game.canvas.width === VIEW_W * 3;
  tick();
  const gfxToggle = lowOk && highOk;

  // --- Phase 5: power curve (touch ceiling, combat-heal gate, new archetype) ---
  game.loadRegion(0, "fromAbove"); cleanStage();
  const P5 = game.player;
  // touchMul is capped at 2.5 so a careless x5 region mul can't one-shot
  const touchCeiling = new Enemy("walker", 0, 0, { touchMul: 5 }).touch === 20 &&
                       new Boss("prism", 0, 0, { touchMul: 5 }).touch === Math.round(10 * 2.5);
  // rank-up full-heals out of combat, but only a little next to a foe (no free heal)
  game.enemies = []; game.bosses.forEach((b) => { b.active = false; b.dead = true; });
  game.lastRankIndex = 0; P5.applyRank(0); P5.hp = 1; P5.mp = 1; P5.exp = 999999;
  game.checkLevelUp();
  const healOOC = P5.hp === P5.hpMax;
  game.lastRankIndex = 0; P5.applyRank(0); P5.hp = 1; P5.mp = 1;
  game.enemies = [new Enemy("walker", P5.x + 8, P5.y)];
  P5.exp = 999999; game.checkLevelUp();
  const healIC = P5.hp > 1 && P5.hp < P5.hpMax;
  const combatHealGate = healOOC && healIC;
  // the brute archetype telegraphs (windup) then emits a ground-slam shockwave
  game.enemies = [];
  const brute = new Enemy("brute", 5 * TILE, 15 * TILE); brute.slamCd = 1; // open air -> falls to floor 18
  const bplayer = { x: brute.x + 20, y: brute.y, w: 12, h: 14 };
  let bruteShot = false;
  for (let i = 0; i < 90; i++) { brute.update(game.level, bplayer); if (brute.pendingShots.length) bruteShot = true; }
  const bruteTelegraph = bruteShot;
  // a live boss only counts as combat while you're IN its arena (inCombat is arena-aware,
  // not just the sticky active flag) -> rank-up full-heals once you've fled, not inside
  game.loadRegion(1, "fromCrystal"); cleanStage();   // physics tests run in a stable genRegion corridor
  const Pf = game.player; game.enemies = [];
  const lvlBoss = game.bosses.find((b) => b.kind === "burrower"); lvlBoss.active = true; lvlBoss.dead = false;
  Pf.x = 3 * TILE; Pf.y = 16 * TILE;                 // far left, OUTSIDE the boss arena (c30+)
  const fledNotCombat = game.inCombat() === false;
  game.lastRankIndex = 0; Pf.applyRank(0); Pf.hp = 1; Pf.exp = 999999; game.checkLevelUp();
  const fledFullHeal = Pf.hp === Pf.hpMax;
  Pf.x = 38 * TILE; Pf.y = 16 * TILE;                // inside the prism arena
  const inArenaCombat = game.inCombat() === true;
  const fledBossHeal = fledNotCombat && fledFullHeal && inArenaCombat;
  game.loadRegion(0, "start");

  // --- Phase 8: full critical-path reachability across all 9 levels ---
  // Walk the intended boss/ability order: beating each level's single boss grants
  // its ability/vehicle (or sets the flag) that opens the next level; the Hollow
  // Crown wins. Also asserts the first gate is BLOCKED before its boss is beaten.
  game.reset();
  const PR = game.player;
  const trn = (id) => game.level.transitions.find((t) => t.id === id);
  const clear = (kind) => { const b = game.bosses.find((x) => x.kind === kind); if (!b) return false; b.dead = true; game.killBoss(b); return true; };
  const travel = (id) => { const t = trn(id); if (!t || !game.gateSatisfied(t.requires)) return false; game.loadRegion(t.toRegion, t.toEntry); return true; };
  let rc = true;
  rc = rc && !game.gateSatisfied(trn("toHollows").requires);     // exit blocked before the Prism dies
  rc = rc && clear("prism") && PR.abilities.canDash;
  rc = rc && travel("toHollows") && game.regionIdx === 1;
  rc = rc && clear("burrower") && PR.abilities.canClimb;
  rc = rc && travel("toMagma") && game.regionIdx === 2;
  rc = rc && clear("cinder") && PR.abilities.canInvert;
  rc = rc && travel("toCore") && game.regionIdx === 3;
  rc = rc && clear("lich");
  const lichBoat = PR.vehicles.has("boat") && game.state !== "won"; // Lich grants the BOAT, not a win
  rc = rc && lichBoat;
  rc = rc && game.gateSatisfied(trn("toReach").requires) && travel("toReach") && game.regionIdx === 4;
  rc = rc && clear("tide") && PR.vehicles.has("bird");           // Sunken Reach grants the bird
  rc = rc && travel("toVault") && game.regionIdx === 5;
  rc = rc && clear("pendulum") && travel("toCrags") && game.regionIdx === 6;
  rc = rc && clear("roc") && travel("toPhase") && game.regionIdx === 7;
  rc = rc && clear("nullengine") && travel("toCrown") && game.regionIdx === 8;
  rc = rc && clear("crown") && game.state === "won";            // Hollow Crown = final -> win
  const reachability = rc;
  const bossWin = game.state === "won";

  // real-play traversal: actually WALK a level spawn->exit (physics, not just
  // transition logic) to prove the level template isn't physically blocked.
  game.reset();
  game.state = "play"; game.menu = null;             // reset() leaves state as-is (was "won")
  game.loadRegion(1, "fromCrystal");                 // Deep Hollows
  const Pw = game.player;
  game.enemies = []; for (const b of game.bosses) b.dead = true;
  game.markFlag("boss:hollows:burrower"); game.applyRegionProgress(1); // arena seal lifted
  Pw.addBuff("shield", 9999);
  axis(0, 1);                                         // hold right
  let maxX = Pw.x;
  for (let i = 0; i < 600; i++) { tick(); if (Pw.x > maxX) maxX = Pw.x; }
  axis(0, 0);
  const exitTr = game.level.transitions.find((t) => t.id === "toMagma");
  const walkToExit = maxX + Pw.w >= exitTr.c * TILE;  // reached at least the exit column on foot

  // every level boss is KILLABLE: stays in its arena (in melee/magic reach) and is
  // not permanently invulnerable — so a sealed-in player can always win (no soft-lock)
  let bossesKillable = true;
  const fakeBP = { x: 34 * TILE, y: 16 * TILE, w: 12, h: 14 };
  for (let r = 0; r <= 8; r++) {
    game.loadRegion(r, undefined);
    const b = game.bosses[0]; b.active = true;
    let vuln = 0, inArena = 0;
    for (let i = 0; i < 400; i++) {
      b.pendingShots.length = 0; b.update(game.level, fakeBP);
      if (!b.invulnerable()) vuln++;
      const bcx = b.x + b.w / 2;
      if (bcx >= b.arena.x0 - TILE && bcx <= b.arena.x1 + TILE) inArena++;
    }
    if (vuln < 60 || inArena < 240) bossesKillable = false;
  }
  game.loadRegion(0, "start");

  // the hand-built Crystal Caves (level 1) stays physically reachable: a flood-fill
  // from spawn (walk/climb/jump/fall) must reach BOTH the boss and the exit on foot.
  const CL = game.level;
  const csolid = (c, r) => { const t = (r >= 0 && r < CL.rows && c >= 0 && c < CL.cols) ? CL.grid[r][c] : "#"; return t === "#" || t === "B" || t === "D"; };
  const cladr = (c, r) => { const t = (r >= 0 && r < CL.rows && c >= 0 && c < CL.cols) ? CL.grid[r][c] : "#"; return t === "H" || t === "T"; };
  const copen = (c, r) => c >= 0 && c < CL.cols && r >= 0 && r < CL.rows && !csolid(c, r);
  const cgnd = (c, r) => csolid(c, r + 1) || cladr(c, r) || cladr(c, r + 1);
  const csp = CL.playerSpawn, cseen = new Set(), cstk = [[csp.c, csp.r]]; cseen.add(csp.c + "," + csp.r);
  while (cstk.length) {
    const [c, r] = cstk.pop(); const nb = [];
    if (copen(c - 1, r)) nb.push([c - 1, r]);
    if (copen(c + 1, r)) nb.push([c + 1, r]);
    if (copen(c, r + 1)) nb.push([c, r + 1]);                                   // fall
    if ((cladr(c, r) || cladr(c, r - 1)) && copen(c, r - 1)) nb.push([c, r - 1]); // climb
    if (cgnd(c, r)) for (let h = 1; h <= 4; h++) { if (copen(c, r - h)) nb.push([c, r - h]); else break; } // jump
    for (const [nc, nr] of nb) { const k = nc + "," + nr; if (!cseen.has(k)) { cseen.add(k); cstk.push([nc, nr]); } }
  }
  const creach = (c, r) => { for (let d = 0; d < 6; d++) if (copen(c, r + d) && cseen.has(c + "," + (r + d))) return true; return false; };
  const crystalReachable = !!CL.bosses[0] && !!CL.transitions[0] && creach(CL.bosses[0].c, CL.bosses[0].r) && creach(CL.transitions[0].c, CL.transitions[0].r);
  game.loadRegion(0, "start");

  result = { startedAtTitle, enteredPlay, pauseOpened, pauseClosed, movedRight, didDouble,
             maxedGear, gotBoots, menuClosed, castTierDmg, saved, hasContinue, continued, leveled,
             powerWorks, hasteWorks, shieldWorks, slotsWork, grewMax, statsTracked,
             hasBosses, prismGuard, burrowGuard, prismDropsDash, lichBoat, bossWin, reachability, walkToExit, bossesKillable, crystalReachable, regionRoundTrip,
             bossHpScales, enemyTouchScales, brokenWallPersists, dashed, abilitySaved,
             climbed, birdRose, birdHovers, boatFloats, gravFlips,
             invLadderSafe, normLadderGrab, singleWallBounded, upClingNoAscent, altWallJump, sameWallBlocked,
             craft, craftPersist, reCraftNoSpend, goldBlocked, loadRestores, shopStock, gfxToggle,
             touchCeiling, combatHealGate, bruteTelegraph, fledBossHeal };
`;

const run = new Function("window", "document", "navigator", "localStorage", "console",
  "press", "axis", "env", "canvas", "pad",
  "let result; " + src + "; return result;");
const result = run(env.window, env.document, env.navigator, env.localStorage, console, press, axis, env, canvas, pad);

// self-test: `node tools/headless.js --selftest-fail` must exit non-zero (proves the guard works)
if (process.argv.includes("--selftest-fail")) result.__selftest = false;

// Every flag this harness records must be present AND true (booleans) or
// positive (numbers). A dropped assertion (missing key) OR a false flag fails
// the run with a non-zero exit, so CI / the agent actually catches regressions.
const EXPECTED = [
  "startedAtTitle", "enteredPlay", "pauseOpened", "pauseClosed", "movedRight", "didDouble",
  "maxedGear", "gotBoots", "menuClosed", "castTierDmg", "saved", "hasContinue", "continued",
  "leveled", "powerWorks", "hasteWorks", "shieldWorks", "slotsWork", "grewMax", "statsTracked",
  "hasBosses", "prismGuard", "burrowGuard", "prismDropsDash", "lichBoat", "bossWin", "reachability", "walkToExit", "bossesKillable", "crystalReachable", "regionRoundTrip",
  "bossHpScales", "enemyTouchScales", "brokenWallPersists", "dashed", "abilitySaved",
  "climbed", "birdRose", "birdHovers", "boatFloats", "gravFlips",
  "invLadderSafe", "normLadderGrab", "singleWallBounded", "upClingNoAscent", "altWallJump", "sameWallBlocked",
  "craft", "craftPersist", "reCraftNoSpend", "goldBlocked", "loadRestores", "shopStock", "gfxToggle",
  "touchCeiling", "combatHealGate", "bruteTelegraph", "fledBossHeal",
];
const missing = EXPECTED.filter((k) => !(k in result));
const failing = Object.entries(result)
  .filter(([, v]) => !(v === true || (typeof v === "number" && v > 0)))
  .map(([k]) => k);

if (missing.length === 0 && failing.length === 0) {
  console.log("SMOKE TEST PASSED:", JSON.stringify(result));
} else {
  console.log("SMOKE TEST FAILED");
  if (missing.length) console.log("  missing keys:", missing.join(", "));
  if (failing.length) console.log("  failing flags:", failing.join(", "));
  console.log("  result:", JSON.stringify(result));
  process.exit(1);
}
