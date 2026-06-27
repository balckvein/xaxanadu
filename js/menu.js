// menu.js — pause-the-world overlay menus (shop, Guru shrine).
//
// A Menu is a list of entries; each entry has a label() and an action() that
// mutates the player/game and returns a short note string. Navigate with
// Up/Down, confirm with Jump (A), close with Attack (B/Shift).

class Menu {
  constructor(title, entries) {
    this.title = title;
    this.entries = entries;
    this.index = 0;
    this.note = "";
    this.noteTimer = 0;
    this.subtitle = null; // optional () => string
    this.info = null;     // optional () => [string] (e.g. equipped loadout)
  }

  update(game) {
    if (Input.justPressed("up"))   this.index = (this.index - 1 + this.entries.length) % this.entries.length;
    if (Input.justPressed("down")) this.index = (this.index + 1) % this.entries.length;
    if (Input.justPressed("jump")) {
      const e = this.entries[this.index];
      this.note = e.action(game.player, game) || "";
      this.noteTimer = 120;
      if (typeof SFX !== "undefined") SFX.buy();
    }
    if (this.noteTimer > 0) this.noteTimer--;
    if (Input.justPressed("attack")) game.closeMenu();
  }

  // Panel sizes to its contents but is CLAMPED to the viewport; a long entry list
  // scrolls (windowed around the cursor) so the note banner + footer never fall
  // off-screen. Critical on the small mobile viewport and for big region shops.
  draw(ctx) {
    const W = VIEW_W, H = VIEW_H;
    ctx.fillStyle = "rgba(4,6,12,0.82)";
    ctx.fillRect(0, 0, W, H);

    const info = this.info ? this.info() : [];
    const rowH = 14, padX = 14;
    const titleH = 16;
    const subH = this.subtitle ? 12 : 0;
    const infoH = info.length ? info.length * 11 + 8 : 0;
    const noteH = 16;   // reserved banner row (keeps layout stable)
    const footH = 14;
    const pw = 304;

    // how many entry rows actually fit once title/info/note/footer are reserved
    const chromeH = 10 + titleH + subH + infoH + 12 + noteH + footH + 8;
    const maxRows = Math.max(3, Math.floor((H - 16 - chromeH) / rowH));
    const total = this.entries.length;
    const showRows = Math.min(total, maxRows);
    // window the list so the cursor stays visible
    let start = 0;
    if (total > showRows) start = Math.min(Math.max(0, this.index - Math.floor(showRows / 2)), total - showRows);

    const listH = showRows * rowH;
    const ph = 10 + titleH + subH + infoH + listH + noteH + footH + 8;
    const px = (W - pw) / 2, py = Math.max(8, (H - ph) / 2);

    ctx.fillStyle = "rgba(8,12,24,0.96)";
    ctx.fillRect(px, py, pw, ph);
    neonStroke(ctx, px, py, pw, ph, COLORS.solidEdge, 8);

    ctx.textAlign = "left";
    let y = py + 10 + 8;
    ctx.fillStyle = COLORS.solidEdge;
    ctx.font = "11px Consolas, monospace";
    ctx.fillText(this.title, px + padX, y);

    if (this.subtitle) {
      y += subH;
      ctx.fillStyle = COLORS.player;
      ctx.font = "8px Consolas, monospace";
      ctx.fillText(this.subtitle(), px + padX, y);
    }

    if (info.length) {
      ctx.font = "8px Consolas, monospace";
      ctx.fillStyle = "#9fb6d6";
      for (const line of info) { y += 11; ctx.fillText(line, px + padX, y); }
      y += 8;
    }

    // entries (windowed around this.index)
    ctx.font = "9px Consolas, monospace";
    const top = y + 12;
    for (let r = 0; r < showRows; r++) {
      const i = start + r;
      const e = this.entries[i];
      const ey = top + r * rowH;
      if (i === this.index) {
        neonRect(ctx, px + 8, ey - 9, pw - 16, 12, "rgba(255,159,74,0.18)", 0);
        ctx.fillStyle = COLORS.solidEdge;
        ctx.fillText("▶", px + 10, ey);
      }
      ctx.fillStyle = i === this.index ? "#ffffff" : COLORS.text;
      ctx.fillText(e.label(), px + 22, ey);
      if (e.price > 0) {
        ctx.fillStyle = COLORS.gold;
        ctx.textAlign = "right";
        ctx.fillText(e.price + "g", px + pw - 12, ey);
        ctx.textAlign = "left";
      }
    }
    // scroll chevrons when the list is windowed
    ctx.fillStyle = "#6f88a8";
    ctx.textAlign = "center";
    if (start > 0) ctx.fillText("▲", W / 2, top - 4);
    if (start + showRows < total) ctx.fillText("▼", W / 2, top + listH + 1);
    ctx.textAlign = "left";

    // popped note banner — its own highlighted bar, clearly separated
    const noteY = top + listH + 2;
    if (this.note && this.noteTimer > 0) {
      neonRect(ctx, px + 8, noteY, pw - 16, 13, "rgba(155,255,176,0.18)", 0);
      ctx.fillStyle = "#d7ffe2";
      ctx.font = "9px Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(this.note, W / 2, noteY + 10);
      ctx.textAlign = "left";
    }

    // footer controls
    ctx.fillStyle = "#6f88a8";
    ctx.font = "8px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText("Up/Down move  ·  A/Space select  ·  B/Shift back", W / 2, py + ph - 6);
    ctx.textAlign = "left";
  }
}

// ---- builders ----

function weaponEntry(tier, price) {
  return {
    price,
    label: () => `Weapon: ${WEAPONS[tier].name} (DMG ${WEAPONS[tier].dmg})`,
    action: (p) => {
      if (p.weaponTier >= tier) return "Already equipped or better";
      if (p.gold < price) return "Not enough gold";
      p.gold -= price; p.weaponTier = tier;
      return "Equipped " + WEAPONS[tier].name;
    },
  };
}

function armorEntry(tier, price) {
  return {
    price,
    label: () => `Armor: ${ARMORS[tier].name} (DEF ${ARMORS[tier].reduce})`,
    action: (p) => {
      if (p.armorTier >= tier) return "Already equipped or better";
      if (p.gold < price) return "Not enough gold";
      p.gold -= price; p.armorTier = tier;
      return "Equipped " + ARMORS[tier].name;
    },
  };
}

function magicEntry(tier, price) {
  return {
    price,
    label: () => `Magic: ${MAGICS[tier].name} (DMG ${MAGICS[tier].dmg})`,
    action: (p) => {
      if (p.magicTier >= tier) return "Already learned or better";
      if (p.gold < price) return "Not enough gold";
      p.gold -= price; p.magicTier = tier;
      return "Learned " + MAGICS[tier].name;
    },
  };
}

// ---- curated stock lines (handoff §8) ----

function consumableEntry(id) {
  const c = CONSUMABLES[id];
  return {
    price: c.price,
    label: () => c.name + " (" + c.hint + ")",
    action: (p) => { if (p.gold < c.price) return "Not enough gold"; p.gold -= c.price; c.apply(p); return c.note; },
  };
}

// A limited material line: capped per restock window (npc.bought, reset on town-enter
// in game.js), so commons go near-infinite in a cleared region but stay rationed per visit.
function materialBuyEntry(line, npc) {
  const id = line.id, price = line.price || 25, cap = line.cap || 0;
  const name = (typeof MATERIALS !== "undefined" && MATERIALS[id]) ? MATERIALS[id].name : id;
  return {
    price,
    label: () => {
      const left = cap ? Math.max(0, cap - ((npc.bought && npc.bought[id]) || 0)) : -1;
      return "Buy " + name + (cap ? "  [" + left + " left]" : "");
    },
    action: (p) => {
      const bought = (npc.bought && npc.bought[id]) || 0;
      if (cap && bought >= cap) return "Sold out — restocks on return";
      if (p.gold < price) return "Not enough gold";
      p.gold -= price; p.materials[id] = (p.materials[id] || 0) + 1;
      if (!npc.bought) npc.bought = {};
      npc.bought[id] = bought + 1;
      return "Bought " + name;
    },
  };
}

// A schematic (knowledge): bought once, then [owned]. Never a required item (§8/pillar 10).
function templateBuyEntry(line, player) {
  const id = line.id, price = line.price || 100;
  const name = (typeof TEMPLATES !== "undefined" && TEMPLATES[id]) ? TEMPLATES[id].name : id;
  return {
    price,
    label: () => name + (player && player.templates.has(id) ? "  [owned]" : ""),
    action: (p) => {
      if (p.templates.has(id)) return "Already learned";
      if (p.gold < price) return "Not enough gold";
      p.gold -= price; p.templates.add(id);
      return "Learned " + name;
    },
  };
}

// Turn one curated stock line into a menu entry (or null to hide it). A line gates
// on `requires` (region/flag/boss/material) and never surfaces ability/craftOnly gear.
function stockEntry(line, player, game, npc) {
  if (line.requires && game && !game.gateSatisfied(line.requires)) return null;
  switch (line.kind) {
    case "consumable": return CONSUMABLES[line.id] ? consumableEntry(line.id) : null;
    // gear lines: skip an out-of-range tier (authoring typo) and never sell craftOnly gear
    case "weapon":     return (!WEAPONS[line.tier] || WEAPONS[line.tier].craftOnly) ? null : weaponEntry(line.tier, line.price != null ? line.price : WEAPON_PRICE[line.tier]);
    case "armor":      return ARMORS[line.tier] ? armorEntry(line.tier, line.price != null ? line.price : ARMOR_PRICE[line.tier]) : null;
    case "magic":      return MAGICS[line.tier] ? magicEntry(line.tier, line.price != null ? line.price : MAGIC_PRICE[line.tier]) : null;
    case "material":   return materialBuyEntry(line, npc);
    case "template":   return templateBuyEntry(line, player);
    default:           return null;
  }
}

// Shops sell flow not power (§8). With a curated `npc.stock` list, the menu is built
// line-by-line (gated by `requires`). Without one — the legacy path used by old
// stockless NPCs and the headless tier tests — it offers the next gear tiers up to a
// numeric maxTier. `arg` is an npc object (stock mode) OR a number (legacy maxTier).
function buildShopMenu(player, arg, game) {
  const npc = (arg && typeof arg === "object") ? arg : null;
  const stock = npc && npc.stock;
  const entries = [];

  if (stock) {
    for (const line of stock) { const e = stockEntry(line, player, game, npc); if (e) entries.push(e); }
  } else {
    const maxTier = npc ? (npc.tier || 2) : (arg == null ? 2 : arg);
    if (player) {
      for (let t = player.weaponTier + 1; t <= Math.min(maxTier, WEAPONS.length - 1); t++) { if (WEAPONS[t].craftOnly) continue; entries.push(weaponEntry(t, WEAPON_PRICE[t])); }
      for (let t = player.armorTier + 1;  t <= Math.min(maxTier, ARMORS.length - 1);  t++) entries.push(armorEntry(t, ARMOR_PRICE[t]));
      for (let t = player.magicTier + 1;  t <= Math.min(maxTier, MAGICS.length - 1);  t++) entries.push(magicEntry(t, MAGIC_PRICE[t]));
    }
    entries.push(consumableEntry("elixir"));
    entries.push(consumableEntry("ether"));
    if (maxTier >= 3 && player && player.maxJumps < 3) {
      entries.push({ price: 600, label: () => "Wing Boots (triple jump)",
        action: (p) => { if (p.gold < 600) return "Not enough gold"; p.gold -= 600; p.maxJumps = 3; return "Wing Boots equipped!"; } });
    }
  }
  entries.push({ price: 0, label: () => "Leave", action: (p, g) => { g.closeMenu(); return ""; } });

  const m = new Menu("NEON BAZAAR", entries);
  if (player) m.info = () => loadoutLines(player);
  return m;
}

// Pause doubles as the status / equipment screen — your loadout lives here.
function loadoutLines(player) {
  return [
    "Weapon : " + WEAPONS[player.weaponTier].name + "  (ATK " + player.meleeDmg + ")",
    "Armor  : " + ARMORS[player.armorTier].name + "  (DEF " + player.armorReduce + ")",
    "Magic  : " + MAGICS[player.magicTier].name + "  (DMG " + player.magic.dmg + ")",
    "Gold " + player.gold + "    Keys " + player.keys + "    Rank " + rankFor(player.exp),
  ];
}

function buildPauseMenu(player) {
  const entries = [
    { price: 0, label: () => "Resume", action: (p, g) => { g.closeMenu(); return ""; } },
    { price: 0, label: () => "Settings", action: (p, g) => { g.openMenu(buildSettingsMenu(g)); return ""; } },
    { price: 0, label: () => "Save (Mantra)", action: (p, g) => g.saveProgress() },
    { price: 0, label: () => "Quit to title", action: (p, g) => { g.toTitle(); return ""; } },
  ];
  const m = new Menu("STATUS  /  PAUSED", entries);
  m.info = () => loadoutLines(player);
  return m;
}

function buildSettingsMenu(game) {
  const fsOn = () => (typeof document !== "undefined" && document.fullscreenElement) ? "ON" : "OFF";
  const entries = [
    { price: 0, label: () => "Fullscreen: " + fsOn() + "   (F)", action: (p, g) => { g.toggleFullscreen(); return ""; } },
    { price: 0, label: () => "Sound: " + (typeof SFX !== "undefined" && SFX.muted ? "OFF" : "ON") + "   (M)", action: () => { if (typeof SFX !== "undefined") SFX.toggleMute(); return ""; } },
    { price: 0, label: () => "Graphics: " + (GFX.quality === "low" ? "LOW (fast)" : "HIGH (crisp)"),
      action: (p, g) => "Graphics: " + g.setQuality(GFX.quality === "low" ? "high" : "low").toUpperCase() },
    { price: 0, label: () => "Back", action: (p, g) => { g.openMenu(buildPauseMenu(g.player)); return ""; } },
  ];
  return new Menu("SETTINGS", entries);
}

// ---- forge / crafting (handoff §7.2) ----

function craftMakesName(makes) {
  if (makes.startsWith("weapon:")) { const id = makes.slice(7); const w = WEAPONS.find((x) => x.id === id); return w ? w.name : id; }
  if (makes.startsWith("armor:"))  { const id = makes.slice(6); const a = ARMORS.find((x) => x.id === id);  return a ? a.name : id; }
  if (makes.startsWith("magic:"))  { const id = makes.slice(6); const m = MAGICS.find((x) => x.id === id);  return m ? m.name : id; }
  return (typeof MATERIALS !== "undefined" && MATERIALS[makes]) ? MATERIALS[makes].name : makes;
}

// For an equip recipe, the target {arr,prop,idx}; null for a material recipe.
function craftEquipTarget(makes) {
  let arr, prop;
  if (makes.startsWith("weapon:")) { arr = WEAPONS; prop = "weaponTier"; }
  else if (makes.startsWith("armor:")) { arr = ARMORS; prop = "armorTier"; }
  else if (makes.startsWith("magic:")) { arr = MAGICS; prop = "magicTier"; }
  else return null;
  const id = makes.slice(makes.indexOf(":") + 1);
  return { arr, prop, idx: arr.findIndex((w) => w.id === id) };
}

function craftEntry(player, key, r) {
  const matName = (id) => (typeof MATERIALS !== "undefined" && MATERIALS[id]) ? MATERIALS[id].name : id;
  return {
    price: r.cost || 0,
    label: () => {
      const made = craftMakesName(r.makes);
      const needs = r.needs.map((n) => n.qty + "× " + matName(n.mat)).join(" + ");
      let status = "";
      if (player) {                              // pillar 9: name what's missing (or [owned])
        const eq = craftEquipTarget(r.makes);
        if (eq && eq.idx >= 0 && eq.idx <= player[eq.prop]) status = "  [owned]";
        else if (r.template && !player.templates.has(r.template)) status = "  [need schematic]";
        else if (!hasMats(player, r)) status = "  [need mats]";
        else if (player.gold < (r.cost || 0)) status = "  [need gold]";
      }
      return `${made}  ⟵ ${needs}${status}`;
    },
    action: (p, g) => g.craft(r),
  };
}

function craftInfoLines(player) {
  const mats = Object.keys(player.materials).filter((k) => player.materials[k] > 0);
  const matStr = mats.length ? mats.map((k) => ((MATERIALS[k] && MATERIALS[k].name) || k) + " ×" + player.materials[k]).join("  ·  ") : "(none)";
  const tmpls = [...player.templates];
  const tmplStr = tmpls.length ? tmpls.map((k) => (TEMPLATES[k] && TEMPLATES[k].name) || k).join("  ·  ") : "(none)";
  return [
    "Weapon : " + WEAPONS[player.weaponTier].name + "  (ATK " + player.meleeDmg + ")",
    "Materials : " + matStr,
    "Schematics : " + tmplStr,
    "Gold " + player.gold,
  ];
}

// A forge = a Menu of RECIPES whose station the NPC offers (default: both).
function buildCraftMenu(player, npc) {
  const stations = (npc && npc.stations) || ["furnace", "forge"];
  const entries = [];
  for (const key in RECIPES) {
    const r = RECIPES[key];
    if (!stations.includes(r.station)) continue;
    entries.push(craftEntry(player, key, r));
  }
  entries.push({ price: 0, label: () => "Leave", action: (p, g) => { g.closeMenu(); return ""; } });
  const m = new Menu("FORGE", entries);
  if (player) m.info = () => craftInfoLines(player);
  m.subtitle = () => "Refine ore → bars, then assemble gear (needs a schematic)";
  return m;
}

function buildGuruMenu(player) {
  const entries = [
    {
      price: 0, label: () => "Rest (restore HP & MP)",
      action: (p) => { p.hp = p.hpMax; p.mp = p.mpMax; return "Fully restored"; },
    },
    {
      price: 0, label: () => "Save progress (Mantra)",
      action: (p, g) => g.saveProgress(),
    },
    { price: 0, label: () => "Leave", action: (p, g) => { g.closeMenu(); return ""; } },
  ];
  const m = new Menu("GURU SHRINE", entries);
  m.subtitle = () => "Rank: " + rankFor(player.exp);
  return m;
}
