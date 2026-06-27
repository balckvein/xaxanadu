// recipes.js — crafting data (handoff §7): materials, templates, mob/boss drop
// tables, and a two-tier recipe book (raw → bar → item). No engine logic here;
// game.js rolls drops + applies crafts, menu.js renders the forge. Kept a sibling
// of assets.js and loaded before menu.js/game.js (see index.html + headless files[]).

// Materials are stackable counters on the player (p.materials[id]). `kind` only
// drives the pickup's neon color so ore/gem/bar read differently in the world.
const MATERIALS = {
  iron_ore:    { name: "Iron Ore",    color: "#b8b0a0", kind: "ore" },
  copper_ore:  { name: "Copper Ore",  color: "#d98a4a", kind: "ore" },
  iron_bar:    { name: "Iron Bar",    color: "#cfd6e0", kind: "bar" },
  ruby:        { name: "Ruby",        color: "#ff4d6d", kind: "gem" },
  cinder_core: { name: "Cinder Core", color: "#ff7b3d", kind: "gem" },
};

// Templates are one-shot knowledge: owning one (p.templates Set) unlocks a recipe.
// (Region 2-6 templates like the Storm Blade are added when those regions — and a
// reachable, non-final source for them — are authored, so no drop is ever dead.)
const TEMPLATES = {
  tmpl_ember_blade: { name: "Ember Blade Schematic" },
};

const isTemplate = (id) => typeof id === "string" && id.startsWith("tmpl_");

// On death, an entity rolls its table: each entry is an independent chance to
// drop qty (a [min,max] range) of a material OR a template (tmpl_*). Mob tables
// are keyed by enemy `type`; boss tables by boss `kind` (guaranteed signatures).
const DROP_TABLES = {
  walker:  [{ mat: "iron_ore", chance: 0.30, qty: [1, 2] }],
  flyer:   [{ mat: "copper_ore", chance: 0.30, qty: [1, 1] }],
  jumper:  [{ mat: "iron_ore", chance: 0.40, qty: [1, 2] }, { mat: "ruby", chance: 0.08, qty: [1, 1] }],
  shooter: [{ mat: "copper_ore", chance: 0.30, qty: [1, 1] }],
  crawler: [{ mat: "iron_ore", chance: 0.30, qty: [1, 1] }],
  // bosses (keyed by kind): guaranteed signature material. The fire boss drops its
  // Cinder Core (the rare crafting mat); the Ember Blade SCHEMATIC is sold cheap at
  // the Emberhold forge-town shop (§8: knowledge bought, materials found). (The
  // final boss has no table — killBoss() wins the run before a drop could land.)
  cinder:  [{ mat: "cinder_core", chance: 1.0, qty: [1, 1] }],
};

// Two tiers only (handoff §7.1): refine (raw→bar, always known, no template) and
// assemble (template-gated). `makes` is a material id, or "weapon:|armor:|magic:<id>".
const RECIPES = {
  iron_bar:    { needs: [{ mat: "iron_ore", qty: 3 }], station: "furnace", cost: 0,  makes: "iron_bar" },
  ember_blade: { needs: [{ mat: "iron_bar", qty: 2 }, { mat: "cinder_core", qty: 1 }], template: "tmpl_ember_blade", station: "forge", cost: 50, makes: "weapon:ember_blade" },
};

const hasMats  = (p, r) => r.needs.every((n) => (p.materials[n.mat] || 0) >= n.qty);
const canCraft = (p, r) => hasMats(p, r) && (!r.template || p.templates.has(r.template)) && p.gold >= r.cost;
