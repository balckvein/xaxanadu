// assets.js — neon placeholder rendering helpers + shared constants.
// No image files: everything is drawn with glowing primitives so the game
// is fully playable now and can be re-skinned later.

const TILE = 16; // logical pixels per tile

// Logical render size (game coords). The canvas backing store is rendered at
// VIEW_* x RENDER_SCALE so it stays crisp when scaled up to fullscreen, while
// all drawing code keeps using logical 512x288 coordinates.
const VIEW_W = 512, VIEW_H = 288;

// ---- Graphics quality (performance) ----
// The three dominant Canvas2D costs on a weak GPU (e.g. a Fire tablet) are: a big
// backing store (RENDER_SCALE), shadow-blur glow on every neon draw, and per-sprite
// ctx.filter grading. GFX scales all three. LOW (mobile default) makes the game run
// smoothly; HIGH is the crisp desktop look. Toggle in Settings; persisted.
const GFX = { quality: "high", scale: 3, glow: 1, filter: true, tex: true };
let RENDER_SCALE = GFX.scale; // mutable — setGfx() updates it (canvas resized by the game)

function setGfx(q) {
  GFX.quality = (q === "low") ? "low" : "high";
  if (GFX.quality === "low") { GFX.scale = 1.5; GFX.glow = 0; GFX.filter = false; GFX.tex = false; }
  else { GFX.scale = 3; GFX.glow = 1; GFX.filter = true; GFX.tex = true; }
  RENDER_SCALE = GFX.scale;
  return GFX.quality;
}

// Auto-pick at load: the Android/Capacitor app defaults to LOW (the 3x backing store
// + glow is too slow on a Fire); desktop browsers keep HIGH. A saved choice wins.
(function autoGfx() {
  try {
    const saved = (typeof localStorage !== "undefined") && localStorage.getItem("xaxanadu.gfx");
    if (saved === "low" || saved === "high") { setGfx(saved); return; }
    const w = (typeof window !== "undefined") ? window : null;
    const nav = (typeof navigator !== "undefined") ? navigator : null;
    const mobile = !!(w && w.Capacitor) || !!(nav && nav.maxTouchPoints > 1 && /Android|iPhone|iPad|Mobile/i.test(nav.userAgent || ""));
    setGfx(mobile ? "low" : "high");
  } catch (e) { setGfx("high"); }
})();

const COLORS = {
  bg:       "#05060c",
  player:   "#2cf5d6",
  playerHi: "#bafff4",
  enemy:    "#ff4d6d",
  enemy2:   "#ff9f1c",
  solid:    "#241d2b",
  solidEdge:"#ff9f4a",
  ladder:   "#7c5cff",
  gold:     "#ffd54a",
  bread:    "#9bffb0",
  key:      "#ff5cf0",
  door:     "#ff5cf0",
  magic:    "#5cd6ff",
  text:     "#cfe9ff",
  hpFill:   "#ff4d6d",
  hpBack:   "#3a1020",
  mpFill:   "#5cd6ff",
  mpBack:   "#10283a",
};

// Equipment tiers (shared by player + shop). Higher tier = better, and is
// gated by town/area so gear progression matches the rising difficulty.
// The SWORD is the primary damage — its dmg is above the magic of the same tier at
// every step (melee is riskier, so it hits harder). Magic stays the weaker ranged tool.
const WEAPONS = [
  { name: "Hand Dagger", dmg: 4 },
  { name: "Long Blade",  dmg: 7 },
  { name: "Ion Saber",   dmg: 11 },
  { name: "Plasma Edge", dmg: 16 },
  { name: "Starcleaver", dmg: 22 },
  // crafted/found weapons extend the ladder beyond the shop band (handoff §9).
  // `craftOnly` keeps them out of shop stock — they're forged at a forge, not bought.
  { id: "ember_blade", name: "Ember Blade", dmg: 32, craftOnly: true },
];
const ARMORS = [
  { name: "Cloth",        reduce: 0 },
  { name: "Plated Mesh",  reduce: 2 },
  { name: "Aegis Shell",  reduce: 4 },
  { name: "Warden Plate", reduce: 6 },
  { name: "Nullsuit",     reduce: 9 },
];
const MAGICS = [
  { name: "Spark",       dmg: 2,  cost: 3,  color: "#5cd6ff", speed: 4.5, size: 8 },
  { name: "Flux Bolt",   dmg: 4,  cost: 4,  color: "#9bff5c", speed: 5.2, size: 10 },
  { name: "Void Lance",  dmg: 7,  cost: 6,  color: "#ff5cf0", speed: 6.2, size: 13 },
  { name: "Nova Ray",    dmg: 11, cost: 8,  color: "#ffd54a", speed: 6.8, size: 15 },
  { name: "Singularity", dmg: 16, cost: 11, color: "#ff7bff", speed: 7.4, size: 18 },
];
// Price per tier (index 0 = starting gear, free).
const WEAPON_PRICE = [0, 120, 400, 900, 1800, 0]; // last = ember_blade (craftOnly, never priced)
const ARMOR_PRICE  = [0, 150, 450, 1000, 2000];
const MAGIC_PRICE  = [0, 180, 500, 1100, 2200];

// Currency tiers by what dropped it — small mobs → blue, medium → green,
// guardians (brutes) → red, bosses → gold. Higher tiers are worth more, and the
// colour signals the value at a glance. It's still one wallet (spent as gold).
const CURRENCY = {
  blue:  { color: "#4ab8ff", shine: "#cdefff" },
  green: { color: "#7bff5c", shine: "#daffc6" },
  red:   { color: "#ff5566", shine: "#ffc2c8" },
  gold:  { color: "#ffd54a", shine: "#fff7d6" },
};

// Shop consumables (handoff §8 — shops sell flow, not power). Referenced by id
// from a curated stock list AND by the legacy tier-band shop fallback.
const CONSUMABLES = {
  // Elixir is now a STOCKED item (carried in p.elixirs) you trigger mid-fight (Y / ELIX
  // button) for an emergency heal — not an instant heal-on-buy. Ether stays instant.
  elixir: { name: "Elixir", hint: "heal item", price: 60, apply: (p) => { p.elixirs = (p.elixirs || 0) + 1; }, note: "Elixir stocked — use it in a fight" },
  ether:  { name: "Ether",  hint: "+8 MP",     price: 50, apply: (p) => { p.mp = Math.min(p.mpMax, p.mp + 8); }, note: "Restored 8 MP" },
};

// Timed power-ups (frames @ 60fps). Picked up in the world / dropped by foes.
const BUFFS = {
  haste:  { name: "HASTE",  color: "#9bff5c", dur: 480 },
  shield: { name: "SHIELD", color: "#5cd6ff", dur: 360 },
  power:  { name: "POWER",  color: "#ff5cf0", dur: 480 },
};

// Metroidvania ability/vehicle registry (handoff §5.1). Each ability sets a
// player flag (p.abilities[flag]=true) that a movement/collision verb reads.
// Wing Boots is intentionally legacy (persisted via the boots/maxJumps bool, §4.9)
// and excluded from serialization to avoid a double source of truth.
const ABILITIES = {
  wingBoots: { name: "Wing Boots", flag: "wingBoots", legacy: true,  serialize: false, gates: "high-ledge" },
  dash:      { name: "Dash",       flag: "canDash",   legacy: false, serialize: true,  gates: "wide-gap" },
  climb:     { name: "Climb",      flag: "canClimb",  legacy: false, serialize: true,  gates: "ladderless-shaft" },
  gravFlip:  { name: "Grav-Flip",  flag: "canInvert", legacy: false, serialize: true,  gates: "ceiling-exit" },
};
const VEHICLES = { boat: { name: "Boat", gates: "water" }, bird: { name: "Bird", gates: "fly-over" } };

// Filled rect with an outer neon glow. Pixel-art friendly (integer coords).
// shadowBlur is the #1 mobile cost — GFX.glow scales it (0 on LOW = none).
function neonRect(ctx, x, y, w, h, color, glow = 8) {
  ctx.save();
  const g = glow * GFX.glow;
  if (g > 0) { ctx.shadowColor = color; ctx.shadowBlur = g; }
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.restore();
}

function neonStroke(ctx, x, y, w, h, color, glow = 6, lw = 1) {
  ctx.save();
  const g = glow * GFX.glow;
  if (g > 0) { ctx.shadowColor = color; ctx.shadowBlur = g; }
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  ctx.restore();
}

// Horizontal capsule/pill with a neon glow (used for gold drops).
function neonPill(ctx, x, y, w, h, color, glow = 10) {
  const r = h / 2;
  ctx.save();
  const g = glow * GFX.glow;
  if (g > 0) { ctx.shadowColor = color; ctx.shadowBlur = g; }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---- Illustrated sprite assets (Numeria art) ----
// Images load async; draw helpers fall back to neon primitives until ready,
// so the game keeps running even before art finishes loading (or from file://).
const Assets = {
  images: {},
  get(key) { const im = this.images[key]; return im && im.complete && im.naturalWidth ? im : null; },
  loadAll(map) { for (const k in map) { const im = new Image(); im.src = map[k]; this.images[k] = im; } },
};

// Curated dark-fantasy mob art, pooled by enemy type. Each enemy picks one
// deterministically (by spawn position) so the world looks varied without
// needing per-spawn art data.
const MOB_SPRITES = {
  walker:  ["mob-ghoul", "mob-direwolf", "mob-wraith", "scary-skullkin-1", "scary-zombette-1", "scary-boneling-1", "scary-ghoulet-1", "scary-mummikin-1", "scary-gobbo-1"],
  flyer:   ["mob-bat", "scary-noxbat-1", "scary-spookbat-1", "scary-screecher-1", "scary-mosquitto-1"],
  jumper:  ["scary-boarling-1", "scary-fangrat-1", "scary-moltrat-1", "scary-shrewling-1"],
  shooter: ["scary-grimwick-1", "scary-wraithling-1", "scary-shadowblob-1", "scary-acidblob-1"],
  crawler: ["scary-webspinner-1", "scary-scuttler-1", "scary-pincher-1", "scary-stingbug-1"],
  brute:   ["mob-direwolf", "scary-mummikin-1", "scary-skullkin-1", "mob-ghoul"],
};
// Per boss-kind illustrated art, matched to each fight's theme.
const BOSS_SPRITES = {
  prism:    "boss-mirror-mare",      // reflective -> ricochet bolts
  burrower: "boss-quartzback-mole",  // a mole that submerges
  cinder:   "boss-cinder-lord",      // fire brute
  lich:     "tower-4-storm-lich",    // final boss
};
const BOSS_SPRITE = BOSS_SPRITES.cinder; // back-compat alias

// Tiled terrain textures (CC0, ambientCG) + parallax backgrounds (Numeria art).
const TILE_TEX  = { rock: "assets/tiles/tile-rock.jpg", brick: "assets/tiles/tile-brick.jpg", ground: "assets/tiles/tile-ground.jpg" };
const BG_IMAGES = { cave: "assets/bg/bg-cave.png", pinewood: "assets/bg/bg-pinewood.png", volcano: "assets/bg/bg-volcano.png", tower: "assets/bg/bg-tower.png" };

(function preloadSprites() {
  const m = {};
  for (const t in MOB_SPRITES) for (const k of MOB_SPRITES[t]) m[k] = "assets/mobs/" + k + ".png";
  for (const k in BOSS_SPRITES) m[BOSS_SPRITES[k]] = "assets/bosses/" + BOSS_SPRITES[k] + ".png";
  for (const k in TILE_TEX)  m["tex-" + k] = TILE_TEX[k];
  for (const k in BG_IMAGES) m["bg-" + k]  = BG_IMAGES[k];
  Assets.loadAll(m);
})();

// A cached, pre-graded tiling pattern from a terrain texture. Returns null until
// the source image loads (caller falls back to a flat fill). `tint` is a biome
// color multiplied over the stone so each depth band still reads distinctly.
// Needs document.createElement (browser only) — safely returns null headless.
const _patternCache = {};
function getTilePattern(ctx, key, tint) {
  const ck = key + "|" + (tint || "");
  if (ck in _patternCache) return _patternCache[ck];
  const img = Assets.get("tex-" + key);
  if (!img || typeof document === "undefined" || !document.createElement) return null;
  const SZ = 48; // world-space repeat (3 tiles) — keeps stone detail readable
  const oc = document.createElement("canvas"); oc.width = SZ; oc.height = SZ;
  const o = oc.getContext("2d");
  o.imageSmoothingEnabled = true;
  o.filter = "brightness(0.5) saturate(0.7) contrast(1.05)"; // bake the dark grade
  o.drawImage(img, 0, 0, SZ, SZ);
  if (tint) {
    o.filter = "none"; o.globalCompositeOperation = "multiply";
    o.globalAlpha = 0.5; o.fillStyle = tint; o.fillRect(0, 0, SZ, SZ);
  }
  const pat = ctx.createPattern(oc, "repeat");
  _patternCache[ck] = pat;
  return pat;
}

// Draw an illustrated sprite over an entity's hitbox. (cx, footY) is the
// screen-space bottom-center anchor; dispH the display height in px. The sprite
// is intentionally larger than the collision box. Flips to face direction,
// flashes white on hit, and gets a subtle dark-fantasy grade for cohesion.
function drawSprite(ctx, img, cx, footY, dispH, faceLeft, flash) {
  const dispW = dispH * img.naturalWidth / img.naturalHeight;
  ctx.save();
  // ctx.filter (the dark grade) is costly on mobile — skip it on LOW. flash still
  // shows via a lightweight white overlay below.
  ctx.imageSmoothingEnabled = GFX.filter;
  if (GFX.filter) ctx.filter = flash ? "brightness(3)" : "brightness(0.84) saturate(0.82) contrast(1.05)";
  if (faceLeft) {
    ctx.translate(cx, 0); ctx.scale(-1, 1);
    ctx.drawImage(img, -dispW / 2, footY - dispH, dispW, dispH);
  } else {
    ctx.drawImage(img, cx - dispW / 2, footY - dispH, dispW, dispH);
  }
  ctx.restore();
}
