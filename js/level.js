// level.js — THE DESCENT. One big, contiguous, branching cave carved out of
// solid rock: a surface town, two descending branches, secret rooms, a wide
// lower cavern, and a key-gated Core at the bottom. Four bosses live in it.
// The camera scrolls smoothly over the whole tilemap (open-world, no screen flips).
//
// (Art wiring — tile textures, biome tint, neon edges — is preserved in draw().)

// Region table (handoff Section 12.2). REGIONS[0] = the hand-built Descent (its
// layout is built by buildDescent()); further regions are data-driven via
// buildFromDef(). `new Level()` defaults to REGIONS[0] for inspect/headless back-compat.
// A full-height seal column at `c` over rows r0..r1 — the boss-arena lock for a
// generic level (a 2-cell lock can't seal a wide hall).
function sealCol(c, r0, r1) { const a = []; for (let r = r0; r <= r1; r++) a.push({ c, r }); return a; }

// One self-contained LEVEL (handoff §11.3, restructured to ONE BOSS PER LEVEL):
// spawn + town on the left, a floor corridor with overhead LEDGES (verticality +
// optional loot), then a sealed boss arena on the right. The FLOOR critical path
// (spawn→boss→exit) is always walkable — ledges are above it and only hold optional
// loot — so a level can never soft-lock. Beating the one boss opens the exit.
function genRegion(o) {
  const FLOOR = 18, CEIL = 10; // open rows 11..17, solid ceiling row 10, floor row 18
  return {
    id: o.id, build: "generic", cols: 44, rows: 22,
    playerSpawn: { c: 3, r: FLOOR - 1 },
    galleries: [{ r: FLOOR, c0: 1, c1: 42, h: FLOOR - CEIL - 1 }],
    ledges: o.ledges || [{ r: 14, c0: 14, c1: 18 }, { r: 13, c0: 23, c1: 27 }],
    biomes: [{ maxRow: 99, name: o.name, rock: o.rock, edge: o.edge, bg: o.bg, bgKey: o.bgKey }],
    entries: { [o.entry]: { c: 3, r: FLOOR - 1 }, checkpoint: { c: 3, r: FLOOR - 1 } },
    npcs: [
      { kind: "shop", c: 7, r: FLOOR, tier: o.shopTier, stock: o.stock },
      { kind: "forge", c: 9, r: FLOOR },
      { kind: "guru", c: 11, r: FLOOR },
    ],
    enemies: o.enemies,
    pickups: o.pickups || [
      { type: "gold", c: 16, r: 13 }, { type: "bread", c: 25, r: 12 },   // ledge loot (rewards the climb)
      { type: "mana", c: 21, r: FLOOR - 2 }, { type: "gold", c: 33, r: FLOOR - 2 },
    ],
    bosses: [Object.assign({ c: 38, r: FLOOR - 1, arena: { c0: 30, c1: 42, r0: CEIL + 1, r1: FLOOR }, lock: sealCol(29, CEIL + 1, FLOOR - 1) }, o.boss)],
    transitions: o.exit ? [o.exit] : [],
    enemyHpMul: o.muls[0], enemyTouchMul: o.muls[1], bossHpMul: o.muls[2], bossTouchMul: o.muls[3], rewardMul: o.muls[4], shopMaxTier: o.shopTier,
  };
}

const _stock = (wt, at, mat) => [
  { kind: "consumable", id: "elixir" }, { kind: "consumable", id: "ether" },
  { kind: "weapon", tier: wt }, { kind: "armor", tier: at },
  { kind: "material", id: mat, price: 30, cap: 5 },
];

// THE WORLD: a 9-LEVEL campaign, ONE BOSS PER LEVEL. The old 4-boss Descent is
// split into its four biome levels (Crystal→Hollows→Magma→Core), then the five
// deeper levels follow. Order = level index; transitions point by index. Only the
// Hollow Crown (last) is `final` → win(). Beating a level's boss opens its exit.
const REGIONS = [
  // ---- LEVEL 1: CRYSTAL CAVES — a big hand-built explorable cave (flagship). ----
  // Six tiers descend from the surface town, each crossed via two ladders so you
  // wind left-and-right exploring, a secret alcove behind a breakable wall, then a
  // mob-spawner rift guards the entrance to the Prism's chamber at the very bottom.
  {
    id: "crystal", build: "generic", cols: 64, rows: 56,
    playerSpawn: { c: 4, r: 8 },
    biomes: [{ maxRow: 99, name: "CRYSTAL CAVES", rock: "#221d2e", edge: "#6cc3ff", bg: "#06080f", bgKey: "bg-cave" }],
    galleries: [
      { r: 9,  c0: 2,  c1: 61, h: 6 }, // T0 surface hall + town (open 3-8)
      { r: 18, c0: 2,  c1: 61, h: 5 }, // T1                     (open 13-17)
      { r: 27, c0: 13, c1: 59, h: 5 }, // T2 (secret walled off to its left, cols 2-11)
      { r: 36, c0: 6,  c1: 57, h: 5 }, // T3                     (open 31-35)
      { r: 45, c0: 10, c1: 55, h: 5 }, // T4                     (open 40-44)
      { r: 53, c0: 28, c1: 61, h: 7 }, // T5 Prism chamber       (open 46-52)
    ],
    ladders: [
      { col: 12, from: 18, to: 9 },  { col: 50, from: 18, to: 9 },  // T0 -> T1
      { col: 20, from: 27, to: 18 }, { col: 44, from: 27, to: 18 }, // T1 -> T2
      { col: 16, from: 36, to: 27 }, { col: 48, from: 36, to: 27 }, // T2 -> T3
      { col: 24, from: 45, to: 36 }, { col: 40, from: 45, to: 36 }, // T3 -> T4
      { col: 54, from: 53, to: 45 },                                // T4 -> T5 (drop in on the RIGHT)
    ],
    ledges: [
      { r: 6,  c0: 30, c1: 40 }, { r: 14, c0: 26, c1: 34 },
      { r: 23, c0: 36, c1: 46 }, { r: 32, c0: 20, c1: 30 }, { r: 41, c0: 32, c1: 44 },
    ],
    secrets: [ // breakable wall (col 12) -> a hidden alcove with loot
      { open: { r0: 22, r1: 26, c0: 2, c1: 11 }, walls: [{ c: 12, r: 22 }, { c: 12, r: 23 }, { c: 12, r: 24 }, { c: 12, r: 25 }, { c: 12, r: 26 }] },
    ],
    npcs: [
      { kind: "shop", c: 22, r: 9, tier: 1, stock: _stock(1, 1, "iron_ore") },
      { kind: "forge", c: 26, r: 9 },
      { kind: "guru", c: 30, r: 9 },
    ],
    enemies: [
      { type: "walker", c: 10, r: 17 }, { type: "flyer", c: 44, r: 14 },
      { type: "shooter", c: 28, r: 26 }, { type: "walker", c: 52, r: 26 },
      { type: "jumper", c: 20, r: 35 }, { type: "flyer", c: 46, r: 32 },
      { type: "brute", c: 30, r: 44 }, { type: "shooter", c: 46, r: 44 },
    ],
    pickups: [
      { type: "gold", c: 40, r: 5 }, { type: "bread", c: 30, r: 16 },
      { type: "mana", c: 25, r: 25 }, { type: "gold", c: 50, r: 25 },
      // SECRET-ALCOVE loot: the Ember Blade schematic + a Cinder Core + an Iron Bar
      // (still need 1 more bar from refining ore — a little early-game craft quest)
      { type: "template", c: 4, r: 25, mat: "tmpl_ember_blade" },
      { type: "material", c: 6, r: 25, mat: "cinder_core" },
      { type: "material", c: 8, r: 25, mat: "iron_bar" },
      { type: "gold", c: 40, r: 34 }, { type: "bread", c: 30, r: 43 }, { type: "mana", c: 48, r: 43 },
      { type: "gold", c: 50, r: 52 },
    ],
    spawners: [
      { c: 44, r: 52, types: ["walker", "flyer", "jumper", "shooter"], interval: 150, max: 3, range: 11 },
    ],
    bosses: [ // the Prism waits on the LEFT side of its chamber
      { kind: "prism", name: "PRISM SENTINEL", c: 34, r: 52,
        arena: { c0: 28, c1: 61, r0: 46, r1: 53 }, lock: [], drops: "dash" },
    ],
    transitions: [
      { id: "toHollows", type: "portal", c: 30, r: 52, toRegion: 1, toEntry: "fromCrystal", requires: { type: "flag", value: "boss:crystal:prism" } },
    ],
    entries: { start: { c: 4, r: 8 }, checkpoint: { c: 4, r: 8 }, fromCrystal: { c: 4, r: 8 } },
    enemyHpMul: 1, enemyTouchMul: 1, bossHpMul: 1, bossTouchMul: 1, rewardMul: 1, shopMaxTier: 1,
  },
  genRegion({
    id: "hollows", name: "DEEP HOLLOWS", rock: "#2a2320", edge: "#ff9f4a", bg: "#0a0806", bgKey: "bg-pinewood",
    entry: "fromCrystal", shopTier: 1, stock: _stock(1, 1, "copper_ore"),
    enemies: [{ type: "walker", c: 16, r: 17 }, { type: "jumper", c: 23, r: 17 }, { type: "crawler", c: 28, r: 12 }],
    // Wing Boots (triple jump) found on a ledge — the level's optional discovery
    pickups: [{ type: "boots", c: 18, r: 13 }, { type: "gold", c: 25, r: 12 }, { type: "bread", c: 21, r: 16 }, { type: "mana", c: 33, r: 16 }],
    boss: { kind: "burrower", name: "HOLLOW MAW", drops: "climb" },
    exit: { id: "toMagma", type: "portal", c: 41, r: 17, toRegion: 2, toEntry: "fromHollows", requires: { type: "flag", value: "boss:hollows:burrower" } },
    muls: [1.3, 1, 1.2, 1, 1.2],
  }),
  genRegion({
    id: "magma", name: "MAGMA DEPTHS", rock: "#3a1d1a", edge: "#ff5a3c", bg: "#120604", bgKey: "bg-volcano",
    entry: "fromHollows", shopTier: 2,
    // the forge-town of the fire level: sells the Ember Blade schematic (knowledge);
    // its Cinder Core material drops from the Cinderbrute (§8 knowledge bought, mats found)
    stock: [
      { kind: "consumable", id: "elixir" }, { kind: "consumable", id: "ether" },
      { kind: "weapon", tier: 2 }, { kind: "armor", tier: 2 },
      { kind: "material", id: "copper_ore", price: 30, cap: 5 },
      { kind: "template", id: "tmpl_ember_blade", price: 120 },
    ],
    enemies: [{ type: "walker", c: 16, r: 17 }, { type: "shooter", c: 23, r: 17 }, { type: "brute", c: 28, r: 17 }],
    boss: { kind: "cinder", name: "CINDERBRUTE", drops: "gravFlip" },
    exit: { id: "toCore", type: "portal", c: 41, r: 17, toRegion: 3, toEntry: "fromMagma", requires: { type: "flag", value: "boss:magma:cinder" } },
    muls: [1.6, 1.1, 1.4, 1.1, 1.4],
  }),
  genRegion({
    id: "core", name: "THE CORE", rock: "#2e1830", edge: "#ff2e88", bg: "#0e0414", bgKey: "bg-tower",
    entry: "fromMagma", shopTier: 2, stock: _stock(2, 2, "copper_ore"),
    enemies: [{ type: "shooter", c: 16, r: 17 }, { type: "flyer", c: 22, r: 13 }, { type: "brute", c: 28, r: 17 }],
    boss: { kind: "lich", name: "STORM LICH", drops: "boat" },
    // the Storm Lich grants the BOAT, which opens the dock onward to Sunken Reach
    exit: { id: "toReach", type: "boat", c: 41, r: 17, toRegion: 4, toEntry: "fromCore", requires: { type: "vehicle", value: "boat" } },
    muls: [2.0, 1.2, 1.8, 1.2, 1.6],
  }),
  genRegion({
    id: "reach", name: "SUNKEN REACH", rock: "#16323a", edge: "#5cd6ff", bg: "#04141a", bgKey: "bg-pinewood",
    entry: "fromCore", shopTier: 2, stock: _stock(2, 2, "copper_ore"),
    enemies: [{ type: "flyer", c: 15, r: 12 }, { type: "shooter", c: 22, r: 17 }, { type: "brute", c: 28, r: 17 }],
    boss: { kind: "tide", name: "TIDE WARDEN", drops: "bird" },
    exit: { id: "toVault", type: "portal", c: 41, r: 17, toRegion: 5, toEntry: "fromReach", requires: { type: "flag", value: "boss:reach:tide" } },
    muls: [2.5, 1.3, 2.0, 1.3, 1.4],
  }),
  genRegion({
    id: "vault", name: "INVERTED VAULT", rock: "#241d33", edge: "#b38cff", bg: "#0a0614", bgKey: "bg-cave",
    entry: "fromReach", shopTier: 3, stock: _stock(3, 2, "iron_ore"),
    enemies: [{ type: "crawler", c: 15, r: 12 }, { type: "jumper", c: 22, r: 17 }, { type: "brute", c: 28, r: 17 }],
    boss: { kind: "pendulum", name: "PENDULUM KING" },
    exit: { id: "toCrags", type: "portal", c: 41, r: 17, toRegion: 6, toEntry: "fromVault", requires: { type: "flag", value: "boss:vault:pendulum" } },
    muls: [3.0, 1.4, 2.3, 1.4, 2.0],
  }),
  genRegion({
    id: "crags", name: "STORMCRAGS", rock: "#2a2620", edge: "#ffd24a", bg: "#0c0a06", bgKey: "bg-volcano",
    entry: "fromVault", shopTier: 3, stock: _stock(3, 3, "copper_ore"),
    enemies: [{ type: "flyer", c: 15, r: 12 }, { type: "shooter", c: 22, r: 17 }, { type: "brute", c: 28, r: 17 }],
    boss: { kind: "roc", name: "ROC OF STORMS", drops: "bird" },
    exit: { id: "toPhase", type: "mount", c: 41, r: 17, toRegion: 7, toEntry: "fromCrags", requires: { type: "flag", value: "boss:crags:roc" } },
    muls: [3.5, 1.6, 2.6, 1.6, 3.0],
  }),
  genRegion({
    id: "phase", name: "PHASEWORKS", rock: "#1d2a2a", edge: "#7cffe0", bg: "#06100f", bgKey: "bg-tower",
    entry: "fromCrags", shopTier: 4, stock: _stock(4, 3, "iron_ore"),
    enemies: [{ type: "shooter", c: 16, r: 17 }, { type: "jumper", c: 22, r: 17 }, { type: "brute", c: 28, r: 17 }],
    boss: { kind: "nullengine", name: "NULL ENGINE" },
    exit: { id: "toCrown", type: "portal", c: 41, r: 17, toRegion: 8, toEntry: "fromPhase", requires: { type: "flag", value: "boss:phase:nullengine" } },
    muls: [4.0, 1.9, 3.0, 1.9, 4.5],
  }),
  genRegion({
    id: "crown", name: "WITHERED CROWN", rock: "#2e1830", edge: "#ff2e88", bg: "#0e0414", bgKey: "bg-tower",
    entry: "fromPhase", shopTier: 4, stock: _stock(4, 4, "copper_ore"),
    enemies: [{ type: "brute", c: 16, r: 17 }, { type: "shooter", c: 22, r: 17 }, { type: "brute", c: 27, r: 17 }],
    boss: { kind: "crown", name: "HOLLOW CROWN", final: true },
    exit: null, // the final level — beating the Hollow Crown wins the run
    muls: [5.0, 2.2, 3.2, 2.2, 6.0],
  }),
];

class Level {
  constructor(def) {
    def = def || REGIONS[0];
    this.id = def.id;
    this.def = def;
    if (def.build === "generic") this.buildFromDef(def);
    else this.buildDescent();
    // Common region-data fields (handoff 4.2). Defaults keep Region 0 unchanged.
    this.entries = def.entries || { checkpoint: this.playerSpawn };
    this.transitions = def.transitions || [];
    this.docks = def.docks || [];
    this.waterSet = new Set((def.waterCells || []).map((w) => w.c + "," + w.r));
    this.enemyHpMul = def.enemyHpMul ?? 1;
    this.enemyTouchMul = def.enemyTouchMul ?? 1;
    this.bossHpMul = def.bossHpMul ?? 1;
    this.bossTouchMul = def.bossTouchMul ?? 1;
    this.rewardMul = def.rewardMul ?? 1;
    this.shopMaxTier = def.shopMaxTier ?? 4;
  }

  // Generic data-driven builder for regions beyond the Descent.
  buildFromDef(def) {
    this.cols = def.cols; this.rows = def.rows;
    this.grid = [];
    for (let r = 0; r < this.rows; r++) this.grid.push(new Array(this.cols).fill("#"));
    this.galleries = def.galleries || [];
    for (const g of this.galleries) {
      for (let rr = g.r - g.h; rr < g.r; rr++) for (let c = g.c0; c <= g.c1; c++) this.set(c, rr, ".");
      for (let c = g.c0; c <= g.c1; c++) this.set(c, g.r, "#");
    }
    for (const L of (def.ladders || [])) { this.set(L.col, L.to, "T"); for (let r = L.to + 1; r < L.from; r++) this.set(L.col, r, "H"); }
    for (const Lg of (def.ledges || [])) for (let c = Lg.c0; c <= Lg.c1; c++) this.set(c, Lg.r, "#");
    for (const w of (def.waterCells || [])) this.set(w.c, w.r, "~");
    this.doorCells = []; this.doorOpen = false;
    this.lockSet = new Set();
    this.breakMax = 6; this.breakHp = {};
    // secret rooms behind breakable walls ('B'): carve the room, wall it off (loot goes in def.pickups)
    for (const s of (def.secrets || [])) {
      if (s.open) for (let r = s.open.r0; r <= s.open.r1; r++) for (let c = s.open.c0; c <= s.open.c1; c++) this.set(c, r, ".");
      for (const w of (s.walls || [])) { this.set(w.c, w.r, "B"); this.breakHp[w.c + "," + w.r] = this.breakMax; }
    }
    this.playerSpawn = def.playerSpawn;
    this.enemies = def.enemies || []; this.npcs = def.npcs || [];
    this.bosses = def.bosses || []; this.pickups = def.pickups || [];
    this.biomes = def.biomes || [{ maxRow: 9999, name: def.id, rock: "#241d2b", edge: "#6cc3ff", bg: "#05060c" }];
    this.pixelW = this.cols * TILE; this.pixelH = this.rows * TILE;
  }

  buildDescent() {
    this.cols = 64;
    this.rows = 52;

    // Start as SOLID ROCK, then carve caverns out of it.
    this.grid = [];
    for (let r = 0; r < this.rows; r++) this.grid.push(new Array(this.cols).fill("#"));

    // Galleries: open chambers with a solid floor at row `r`, `h` tiles tall.
    const galleries = [
      { r: 8,  c0: 2,  c1: 61, h: 6 }, // S  — surface town (full width)
      { r: 16, c0: 2,  c1: 27, h: 5 }, // 1a — upper-left branch (Prism)
      { r: 16, c0: 35, c1: 61, h: 5 }, // 1b — upper-right branch (Hollow Maw)
      { r: 24, c0: 2,  c1: 24, h: 5 }, // 2a
      { r: 24, c0: 30, c1: 61, h: 5 }, // 2b — Emberhold (deep town)
      { r: 33, c0: 5,  c1: 58, h: 6 }, // 3  — wide lower cavern (Cinderbrute)
      { r: 43, c0: 17, c1: 47, h: 7 }, // 4  — the Core (Storm Lich), gated
    ];
    this.galleries = galleries;
    for (const g of galleries) {
      for (let rr = g.r - g.h; rr < g.r; rr++) for (let c = g.c0; c <= g.c1; c++) this.set(c, rr, ".");
      for (let c = g.c0; c <= g.c1; c++) this.set(c, g.r, "#");
    }

    // Ladder shafts (walkable top 'T' + rungs 'H') connecting the galleries.
    const ladders = [
      { col: 8,  from: 16, to: 8  }, // S  -> 1a
      { col: 52, from: 16, to: 8  }, // S  -> 1b
      { col: 12, from: 24, to: 16 }, // 1a -> 2a
      { col: 50, from: 24, to: 16 }, // 1b -> 2b
      { col: 14, from: 33, to: 24 }, // 2a -> 3
      { col: 45, from: 33, to: 24 }, // 2b -> 3
      { col: 42, from: 43, to: 33 }, // 3  -> 4 (gated)
    ];
    for (const L of ladders) {
      this.set(L.col, L.to, "T");
      for (let r = L.to + 1; r < L.from; r++) this.set(L.col, r, "H");
    }

    // Internal ledges for platforming interest.
    const ledges = [
      { r: 6,  c0: 22, c1: 30 },
      { r: 21, c0: 16, c1: 21 },
      { r: 30, c0: 24, c1: 33 },
      { r: 40, c0: 27, c1: 37 },
    ];
    for (const L of ledges) for (let c = L.c0; c <= L.c1; c++) this.set(c, L.r, "#");

    // Key-gated door (2 tall) blocking the shaft down into the Core.
    this.doorCells = [{ c: 42, r: 32 }, { c: 42, r: 31 }];
    for (const d of this.doorCells) this.set(d.c, d.r, "D");
    this.doorOpen = false;

    // Boss arena locks are dynamic: game.js fills lockSet with any active boss's cells.
    this.lockSet = new Set();

    this.playerSpawn = { c: 5, r: 7 }; // surface

    // Four bosses placed across the map. Cinderbrute drops the key; the Lich
    // (final) is in the Core. Each `arena` (tiles) triggers the fight; `lock`
    // cells seal the way until it's beaten. The Lich arena triggers low, so its
    // seal appears ABOVE you only after you've fully dropped into the Core.
    // Bosses now grant the region's ABILITIES (handoff §11.2): the Lich grants the
    // BOAT (no longer `final`) and opens the dock to Region 2. The Cinderbrute also
    // still drops the Core KEY alongside Grav-Flip.
    this.bosses = [
      { kind: "prism",    c: 10, r: 14, arena: { c0: 2,  c1: 27, r0: 11, r1: 16 }, lock: [{ c: 12, r: 17 }, { c: 12, r: 18 }], drops: "dash" },
      { kind: "burrower", c: 48, r: 14, arena: { c0: 35, c1: 61, r0: 11, r1: 16 }, lock: [{ c: 50, r: 17 }, { c: 50, r: 18 }], drops: "climb" },
      { kind: "cinder",   c: 44, r: 31, arena: { c0: 5,  c1: 58, r0: 27, r1: 33 }, lock: [], drops: "gravFlip", dropsKey: true },
      { kind: "lich",     c: 32, r: 40, arena: { c0: 17, c1: 47, r0: 40, r1: 43 }, lock: [{ c: 42, r: 34 }, { c: 42, r: 35 }], drops: "boat" },
    ];

    // Towns (safe): Eolia (surface) + Emberhold (deep, in 2b). Shop tiers scale.
    // Shops sell FLOW not power (§8): curated stock lists — consumables, entry-rung
    // gear, capped commons, and (deep town) the Ember Blade schematic. Top-tier
    // stats and the crafted Ember Blade are found/dropped/forged, never bought.
    this.npcs = [
      { kind: "shop", c: 30, r: 8, tier: 2, stock: [
        { kind: "consumable", id: "elixir" },
        { kind: "consumable", id: "ether" },
        { kind: "weapon", tier: 1 },
        { kind: "armor", tier: 1 },
        { kind: "material", id: "iron_ore", price: 20, cap: 5 },
      ] },
      { kind: "guru", c: 40, r: 8 },
      { kind: "shop", c: 40, r: 24, tier: 4, stock: [
        { kind: "consumable", id: "elixir" },
        { kind: "consumable", id: "ether" },
        { kind: "weapon", tier: 2 },
        { kind: "armor", tier: 2 },
        { kind: "magic", tier: 2 },
        { kind: "material", id: "copper_ore", price: 30, cap: 5 },
        { kind: "template", id: "tmpl_ember_blade", price: 120 }, // knowledge cheap; mats found
      ] },
      { kind: "forge", c: 47, r: 24 }, // Emberhold forge: refine ore + craft the Ember Blade
      { kind: "guru", c: 54, r: 24 },
    ];

    // Trash mobs in the non-arena galleries.
    this.enemies = [
      { type: "walker",  c: 8,  r: 23 }, { type: "shooter", c: 20, r: 23 },
      { type: "flyer",   c: 28, r: 29 }, { type: "shooter", c: 24, r: 32 },
    ];

    this.pickups = [
      { type: "gold",  c: 12, r: 7  },
      { type: "gold",  c: 25, r: 15 }, { type: "bread", c: 45, r: 15 },
      { type: "gold",  c: 10, r: 23 }, { type: "gold",  c: 52, r: 23 },
      { type: "bread", c: 18, r: 23 },
      { type: "gold",  c: 20, r: 32 }, { type: "gold",  c: 50, r: 32 },
      { type: "bread", c: 30, r: 32 },
      { type: "haste", c: 6,  r: 23 }, { type: "power", c: 34, r: 32 },
    ];

    // Secret rooms behind breakable walls ('B'): smash to reveal the loot.
    this.breakMax = 6;
    this.breakHp = {};
    const secrets = [
      { open: { c0: 29, c1: 33, r0: 12, r1: 15 }, walls: [{ c: 28, r: 14 }, { c: 28, r: 15 }],
        loot: [{ type: "gold", c: 30, r: 15 }, { type: "mana", c: 31, r: 15 }, { type: "bread", c: 32, r: 15 }] },
      { open: { c0: 26, c1: 28, r0: 20, r1: 23 }, walls: [{ c: 25, r: 22 }, { c: 25, r: 23 }],
        loot: [{ type: "boots", c: 27, r: 23 }, { type: "gold", c: 26, r: 23 }] },
    ];
    for (const s of secrets) {
      for (let r = s.open.r0; r <= s.open.r1; r++) for (let c = s.open.c0; c <= s.open.c1; c++) this.set(c, r, ".");
      for (const w of s.walls) { this.set(w.c, w.r, "B"); this.breakHp[w.c + "," + w.r] = this.breakMax; }
      for (const l of s.loot) this.pickups.push({ type: l.type, c: l.c, r: l.r });
    }

    this.pixelW = this.cols * TILE;
    this.pixelH = this.rows * TILE;

    // Depth biomes — distinct palettes (and boss-room backdrops) by row.
    this.biomes = [
      { maxRow: 15, name: "CRYSTAL CAVES", rock: "#221d2e", edge: "#6cc3ff", bg: "#06080f", bgKey: "bg-cave" },
      { maxRow: 27, name: "DEEP HOLLOWS",  rock: "#2a2320", edge: "#ff9f4a", bg: "#0a0806", bgKey: "bg-pinewood" },
      { maxRow: 37, name: "MAGMA DEPTHS",  rock: "#3a1d1a", edge: "#ff5a3c", bg: "#120604", bgKey: "bg-volcano" },
      { maxRow: 99, name: "THE CORE",      rock: "#2e1830", edge: "#ff2e88", bg: "#0e0414", bgKey: "bg-tower" },
    ];
  }

  biomeAt(r) {
    for (const b of this.biomes) if (r <= b.maxRow) return b;
    return this.biomes[this.biomes.length - 1];
  }
  biomeAtPx(py) { return this.biomeAt(Math.floor(py / TILE)); }

  inBounds(c, r) { return c >= 0 && c < this.cols && r >= 0 && r < this.rows; }
  set(c, r, ch) { if (this.inBounds(c, r)) { this.grid[r][c] = ch; this.gridRev = (this.gridRev | 0) + 1; } }
  tileAt(c, r) { return this.inBounds(c, r) ? this.grid[r][c] : "#"; }

  isLockCell(c, r) { return this.lockSet.has(c + "," + r); }

  // water: floatable only in a boat (handled in player code, handoff 4.5)
  isWaterCell(c, r) { return this.waterSet.has(c + "," + r); }
  // generic tile mutation for persisted opens (applyRegionProgress, 4.10)
  setTile(c, r, g) { this.set(c, r, g); }
  // flip a named gate transition's authored cells to open (no-op until gates define cells)
  openGateCells(id) {
    const tr = this.transitions.find((t) => t.id === id);
    if (tr && tr.cells) for (const cell of tr.cells) this.set(cell.c, cell.r, ".");
  }

  isSolidPx(px, py) {
    const c = Math.floor(px / TILE), r = Math.floor(py / TILE);
    const t = this.tileAt(c, r);
    if (t === "#" || t === "B") return true;
    if (t === "D") return !this.doorOpen;
    if (this.isLockCell(c, r)) return true;
    return false;
  }

  breakTile(c, r, dmg) {
    if (this.tileAt(c, r) !== "B") return null;
    const key = c + "," + r;
    this.breakHp[key] = (this.breakHp[key] == null ? this.breakMax : this.breakHp[key]) - dmg;
    if (this.breakHp[key] <= 0) { this.set(c, r, "."); return "broken"; }
    return "hit";
  }

  isClimbablePx(px, py) {
    const c = Math.floor(px / TILE), r = Math.floor(py / TILE);
    if (this.isLockCell(c, r)) return false;
    const t = this.tileAt(c, r);
    return t === "H" || t === "T";
  }

  isOneWayPx(px, py) {
    const c = Math.floor(px / TILE), r = Math.floor(py / TILE);
    return this.tileAt(c, r) === "T";
  }

  isGroundPx(px, py) {
    const c = Math.floor(px / TILE), r = Math.floor(py / TILE);
    const t = this.tileAt(c, r);
    if (t === "#" || t === "T" || t === "B") return true;
    if (t === "D") return !this.doorOpen;
    return false;
  }

  openDoor() {
    this.doorOpen = true;
    for (const d of this.doorCells) this.set(d.c, d.r, ".");
  }

  draw(ctx, cam) {
    const c0 = Math.max(0, Math.floor(cam.x / TILE));
    const c1 = Math.min(this.cols, Math.ceil((cam.x + VIEW_W) / TILE));
    const r0 = Math.max(0, Math.floor(cam.y / TILE));
    const r1 = Math.min(this.rows, Math.ceil((cam.y + VIEW_H) / TILE));

    for (let r = r0; r < r1; r++) {
      const biome = this.biomeAt(r);
      const ry = r * TILE - cam.y;

      // FAST PATH (LOW gfx): batch-fill horizontal runs of solid stone as single
      // rects instead of one fillRect per tile — the big mobile-FPS win.
      if (!GFX.tex) {
        ctx.fillStyle = biome.rock;
        let run = -1;
        for (let c = c0; c <= c1; c++) {
          const solid = c < c1 && this.grid[r][c] === "#";
          if (solid) { if (run < 0) run = c; }
          else if (run >= 0) { ctx.fillRect(run * TILE - cam.x, ry, (c - run) * TILE, TILE); run = -1; }
        }
      }

      for (let c = c0; c < c1; c++) {
        const t = this.grid[r][c];
        const x = c * TILE - cam.x, y = ry;
        if (t === "#") {
          if (GFX.tex) {                                  // HIGH: per-tile textured stone
            const pat = getTilePattern(ctx, "rock", biome.rock);
            if (pat) { ctx.save(); ctx.translate(-cam.x, -cam.y); ctx.fillStyle = pat; ctx.fillRect(c * TILE, r * TILE, TILE, TILE); ctx.restore(); }
            else { ctx.fillStyle = biome.rock; ctx.fillRect(x, y, TILE, TILE); }
          } // (LOW path already filled this tile in the batched run above)
          if (this.tileAt(c, r - 1) !== "#" && this.tileAt(c, r - 1) !== "D")
            neonRect(ctx, x, y, TILE, 2, biome.edge, 6);
        } else if (t === "H" || t === "T") {
          ctx.save();
          ctx.shadowColor = COLORS.ladder; ctx.shadowBlur = 6;
          ctx.strokeStyle = COLORS.ladder; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 3.5, y); ctx.lineTo(x + 3.5, y + TILE);
          ctx.moveTo(x + TILE - 3.5, y); ctx.lineTo(x + TILE - 3.5, y + TILE);
          for (let yy = 3; yy < TILE; yy += 6) { ctx.moveTo(x + 3, y + yy); ctx.lineTo(x + TILE - 3, y + yy); }
          ctx.stroke();
          ctx.restore();
          if (t === "T") neonRect(ctx, x, y, TILE, 2, biome.edge, 6);
        } else if (t === "B") {
          ctx.fillStyle = biome.rock;
          ctx.fillRect(x, y, TILE, TILE);
          const hp = this.breakHp[c + "," + r];
          const dmg = hp == null ? 0 : 1 - hp / this.breakMax;
          ctx.save();
          ctx.strokeStyle = biome.edge;
          ctx.globalAlpha = 0.22 + dmg * 0.6;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 3, y + 2); ctx.lineTo(x + 8, y + 7); ctx.lineTo(x + 5, y + 13);
          ctx.moveTo(x + 12, y + 3); ctx.lineTo(x + 9, y + 9);
          if (dmg > 0.4) { ctx.moveTo(x + 2, y + 10); ctx.lineTo(x + 7, y + 12); }
          ctx.stroke();
          ctx.restore();
        }
        if (this.isLockCell(c, r)) {
          neonRect(ctx, x + 1, y + 2, TILE - 2, TILE - 4, "#ff2e88", 12);
          ctx.fillStyle = "#2a0014";
          for (let yy = 3; yy < TILE; yy += 5) ctx.fillRect(x + 2, y + yy, TILE - 4, 2);
        }
        if (t === "D" && !this.doorOpen) {
          neonRect(ctx, x + 1, y, TILE - 2, TILE, COLORS.door, 10);
          ctx.fillStyle = "#1a0a18";
          ctx.fillRect(x + 4, y + 3, TILE - 8, TILE - 6);
        }
      }
    }
  }
}
