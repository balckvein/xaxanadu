// game.js — wires the world together: spawns from level data, runs the
// fixed-timestep update, resolves combat/pickups, drives the smooth camera.

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = VIEW_W * RENDER_SCALE;   // hi-res backing for crisp fullscreen
    canvas.height = VIEW_H * RENDER_SCALE;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = true;  // illustrated sprites/bg need smoothing
    this.cam = { x: 0, y: 0 };
    this.msg = "";
    this.msgTimer = 0;
    this.menu = null;        // when set, the world is paused behind an overlay menu
    this.state = "title";    // "title" -> "play" -> "won"
    this.titleIndex = 0;
    this.activeSlot = 0;
    this.stats = { kills: 0, deaths: 0, time: 0 };
    this.reset();
  }

  // New game from scratch: fresh world flags + fresh Player, then enter Region 0.
  reset() {
    this.flags = new Set();
    this.regionIdx = 0;
    this.player = new Player(0, 0);
    this.loadRegion(0, null);
    this.flash(""); // clear
  }

  // Build/enter a region, PRESERVING the persistent Player (handoff 4.3). The
  // entire entity set is rebuilt from the region's data; the player carries over.
  loadRegion(idx, entryId) {
    this.regionIdx = idx;
    this.level = new Level(REGIONS[idx]);
    const L = this.level;

    this.enemies = L.enemies.map((e) => new Enemy(e.type, e.c * TILE, e.r * TILE + 2,
      { drops: e.drops, hp: e.hp, hpMul: e.hpMul ?? L.enemyHpMul, rewardMul: e.rewardMul ?? L.rewardMul, touchMul: L.enemyTouchMul }));
    this.npcs = L.npcs.map((n) => { const o = new NPC(n.kind, n.c * TILE, n.r * TILE - 20); o.tier = n.tier; o.stock = n.stock; o.stations = n.stations; return o; });
    this.pickups = L.pickups.map((pk) => new Pickup(pk.type, pk.c * TILE + 2, pk.r * TILE + 2, { mat: pk.mat, value: pk.value }));
    this.bosses = L.bosses.map((b) => {
      const bd = BOSS_DEFS[b.kind];
      return new Boss(b.kind, b.c * TILE, b.r * TILE - bd.h + 4, {
        drops: b.drops, dropsKey: b.dropsKey, name: b.name, final: b.final, lock: b.lock,
        hpMul: L.bossHpMul, touchMul: L.bossTouchMul, rewardMul: L.rewardMul,
        arena: { x0: b.arena.c0 * TILE, x1: (b.arena.c1 + 1) * TILE, y0: b.arena.r0 * TILE, y1: (b.arena.r1 + 1) * TILE },
      });
    });

    // mob-spawner rifts (erupt random enemies near the boss while the player is close)
    this.spawners = (L.spawners || []).map((s) => ({
      c: s.c, r: s.r, types: s.types || ["walker"], interval: s.interval || 180,
      max: s.max || 3, range: (s.range || 11) * TILE, cd: 90, mine: [],
    }));

    // flush transient state so nothing leaks across regions
    this.projectiles = []; this.enemyShots = []; this.effects = []; this.floats = [];
    this.shake = 0; this.curMusic = null; this.curBiome = null; this.menu = null;

    this.applyRegionProgress(idx);   // dead bosses stay dead; opened gates/broken walls persist

    const ent = (entryId && L.entries[entryId]) || L.playerSpawn;
    this.player.x = ent.c * TILE + 2; this.player.y = ent.r * TILE - 14;
    this.player.vx = 0; this.player.vy = 0; this.player.climbing = false;
    this.player.gravSign = 1; this.player.vehicle = null; this.player.dead = false;

    // reseed camera (lo wins for regions shorter than the viewport → no jitter)
    this.cam.x = Math.max(0, Math.min(L.pixelW - VIEW_W, this.player.x - VIEW_W / 2));
    this.cam.y = Math.max(0, Math.min(Math.max(0, L.pixelH - VIEW_H), this.player.y - VIEW_H / 2));
    this.syncRank();
  }

  // Re-apply persisted per-region mutations so a cleared region doesn't reset.
  applyRegionProgress(idx) {
    const L = this.level, id = L.id;
    for (const b of this.bosses) if (this.flags.has("boss:" + id + ":" + b.kind)) b.dead = true;
    if (this.flags.has("door:" + id)) L.openDoor();
    for (const tr of L.transitions) if (tr.type === "gate" && this.flags.has("opened:" + id + ":" + tr.id)) L.openGateCells(tr.id);
    for (const key of this.flags) {
      if (key.startsWith("broke:" + id + ":")) { const part = key.split(":"); L.setTile(+part[2], +part[3], "."); }
    }
  }

  markFlag(f) { this.flags.add(f); }

  // grant a non-legacy ability (sets its player flag). Wing Boots stays legacy (§4.9).
  grantAbility(name) {
    const a = ABILITIES[name];
    if (a && !a.legacy) this.player.abilities[a.flag] = true;
  }

  gateSatisfied(req) {
    if (!req) return true;
    const p = this.player;
    switch (req.type) {
      case "ability":  return !!p.abilities[req.value];
      case "vehicle":  return p.vehicles.has(req.value);
      case "key":      return p.keys > 0;
      case "flag":     return this.flags.has(req.value);
      case "material": return (p.materials[req.value] || 0) >= (req.qty || 1);
      default:         return true;
    }
  }

  gateHint(req) {
    if (!req) return "";
    return ({ ability: "Need ability: " + req.value, vehicle: "Need vehicle: " + req.value,
      key: "Locked — need a KEY", flag: "Sealed for now", material: "Need " + req.value }[req.type]) || "Blocked";
  }

  // Travel between regions via authored transition nodes (door/portal/boat/gate...).
  handleTransitions() {
    const p = this.player, L = this.level;
    for (const tr of L.transitions) {
      const tx = tr.c * TILE + TILE / 2, ty = tr.r * TILE + TILE;
      if (Math.abs((p.x + p.w / 2) - tx) >= 22 || Math.abs((p.y + p.h / 2) - ty) >= 34) continue;
      if (!this.gateSatisfied(tr.requires)) { this.flash(this.gateHint(tr.requires), 30); continue; }
      this.flash("Press UP to travel", 24);
      if (Input.justPressed("up")) {
        if (tr.requires && tr.requires.type === "key") p.keys--;
        this.markFlag("opened:" + L.id + ":" + tr.id);
        this.loadRegion(tr.toRegion, tr.toEntry);
        return; // level swapped this frame
      }
    }
  }

  syncRank() {
    const idx = rankIndexFor(this.player.exp);
    this.lastRankIndex = idx;
    this.player.applyRank(idx);
    this.player.hp = this.player.hpMax;
    this.player.mp = this.player.mpMax;
  }
  addShake(m) { if (m > this.shake) this.shake = m; }
  spawnFloat(x, y, text, color) { this.floats.push(new FloatText(x, y, text, color)); }

  // Combat hitbox sized to the illustrated SPRITE (much bigger than the physics
  // box), so hits land anywhere on the visible enemy — including its top.
  // (Mirrors the sprite anchor/size in entities.js Enemy.draw: dispH = h*2.6.)
  enemyHurtBox(e) {
    const dh = e.h * 2.6;
    const airborne = e.type === "flyer" || e.type === "crawler";
    const cx = e.x + e.w / 2;
    const bottom = airborne ? (e.y + e.h / 2) + dh / 2 : (e.y + e.h);
    const hw = dh * 0.34, hgt = dh * 0.82;
    return { x: cx - hw, y: bottom - hgt, w: hw * 2, h: hgt };
  }

  bossHurtBox(b) {
    const dh = b.h * 2.2;                 // boss sprite is centered on its box
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const hw = dh * 0.42, hh = dh * 0.44;
    return { x: cx - hw, y: cy - hh, w: hw * 2, h: hh * 2 };
  }
  hurtFloat(p, raw) { this.spawnFloat(p.x + p.w / 2, p.y, "-" + Math.max(1, raw - p.armorReduce), COLORS.enemy); }
  spawnBurst(x, y, color, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.2;
      this.effects.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 1,
        16 + Math.random() * 14, color));
    }
  }

  flash(text, frames = 120) { this.msg = text; this.msgTimer = frames; }

  update() {
    Input.poll(); // merge keyboard + gamepad for this frame

    if (Input.justPressed("fullscreen")) this.toggleFullscreen(); // F works anywhere

    if (this.state === "title") { this.updateTitle(); Input.endFrame(); return; }

    if (this.state === "won") {
      if (Input.justPressed("jump")) this.toTitle();
      Input.endFrame();
      return;
    }

    // pause toggle (P / Esc / Start) — opens or closes the pause menu
    if (Input.justPressed("pause")) {
      if (this.menu) this.closeMenu();
      else this.openMenu(buildPauseMenu(this.player));
    }

    // an open menu pauses the world
    if (this.menu) {
      this.menu.update(this);
      Input.endFrame();
      return;
    }

    const L = this.level, p = this.player;
    p.update(L);

    // use a stocked Elixir (Y / ELIX button) for an emergency heal in a fight
    if (Input.justPressed("use")) {
      if (p.elixirs > 0 && p.hp < p.hpMax) { p.elixirs--; p.heal(12); this.flash("Elixir! +12 HP  (x" + p.elixirs + " left)", 90); SFX.heal(); }
      else if (p.elixirs <= 0) this.flash("No Elixirs — buy them at a shop", 70);
    }

    // talk to a town NPC (press Up while standing next to them)
    for (const n of this.npcs) {
      n.update();
      const near = Math.abs((p.x + p.w / 2) - (n.x + n.w / 2)) < 18 &&
                   Math.abs((p.y + p.h / 2) - (n.y + n.h / 2)) < 24;
      if (near && !n._near) n.bought = {}; // town-enter: restock capped materials (§8 restockOn)
      n._near = near;
      if (near) {
        this.flash(n.kind === "guru" ? "Press UP: Guru shrine" : n.kind === "forge" ? "Press UP: Forge" : "Press UP: shop", 20);
        if (Input.justPressed("up")) {
          this.openMenu(n.kind === "guru" ? buildGuruMenu(p)
            : n.kind === "forge" ? buildCraftMenu(p, n)
            : buildShopMenu(p, n, this));
        }
      }
    }

    if (p.pendingProjectile) this.projectiles.push(p.pendingProjectile);

    // enemies
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.update(L, p);
      if (e.pendingShots.length) this.enemyShots.push(...e.pendingShots);
      // contact damage uses the small body box (fair); your hits use the big sprite box
      if (aabb(p.box, e) && p.takeHit(e.touch)) { SFX.hurt(); this.addShake(4); this.hurtFloat(p, e.touch); }
      // melee
      if (p.attackBox && aabb(p.attackBox, this.enemyHurtBox(e))) {
        const fresh = e.flash === 0;
        e.hurt(p.attackBox.dmg);
        p.resetSpeed(); // landing a hit drops you back to base speed
        SFX.hit();
        this.spawnBurst(e.x + e.w / 2, e.y + e.h / 2, e.flash > 0 ? "#ffffff" : COLORS.enemy, 4);
        if (fresh) this.spawnFloat(e.x + e.w / 2, e.y, "" + p.attackBox.dmg, "#ffffff");
        if (e.dead) this.killEnemy(e);
      }
    }

    // bosses
    for (const b of this.bosses) {
      if (b.dead) continue;
      b.update(L, p);
      if (b.pendingShots.length) this.enemyShots.push(...b.pendingShots);
      for (const s of b.pendingSummons) this.enemies.push(new Enemy(s.type, s.x, s.y, { hpMul: b.summonHpMul, touchMul: b.summonTouchMul }));
      if (!b.active) continue;
      if (aabb(p.box, b.box) && p.takeHit(b.touch)) { SFX.hurt(); this.addShake(5); this.hurtFloat(p, b.touch); }
      if (p.attackBox && aabb(p.attackBox, this.bossHurtBox(b))) {
        const before = b.hp;
        b.hurt(p.attackBox.dmg); p.resetSpeed(); SFX.hit();
        this.spawnBurst(b.x + b.w / 2, b.y + b.h / 2, "#ff8ad0", 4);
        if (b.hp < before) this.spawnFloat(b.x + b.w / 2, b.y, "" + p.attackBox.dmg, "#ffd54a");
        else if (b.invulnerable()) this.spawnFloat(b.x + b.w / 2, b.y, "GUARD", "#bfeaff");
        if (b.dead) this.killBoss(b);
      }
    }

    if (this.spawners.length) this.updateSpawners();

    // seal each active boss's arena; boss music while any fight is live
    L.lockSet.clear();
    let fighting = false;
    for (const b of this.bosses) {
      if (b.dead || !b.active) continue;
      fighting = true;
      for (const cell of b.lock) L.lockSet.add(cell.c + "," + cell.r);
    }
    if (this.state === "play") this.setMusic(fighting ? "boss" : "explore");

    // enemy shots vs player / walls
    for (const s of this.enemyShots) {
      s.update(L);
      if (!s.dead && aabb(p.box, s)) { s.dead = true; if (p.takeHit(s.dmg)) { SFX.hurt(); this.addShake(4); this.hurtFloat(p, s.dmg); } }
    }
    this.enemyShots = this.enemyShots.filter((s) => !s.dead);

    // melee can smash breakable walls (once per swing)
    if (p.attackBox && p.attack === 10) this.tryBreakMelee(p.attackBox);

    // projectiles vs enemies / walls
    for (const pr of this.projectiles) {
      pr.update(L);
      // magic smashes breakable walls on impact
      const bc = Math.floor((pr.x + (pr.vx > 0 ? pr.w : 0)) / TILE), br = Math.floor((pr.y + pr.h / 2) / TILE);
      if (L.tileAt(bc, br) === "B") { this.breakAt(bc, br, pr.dmg); pr.dead = true; }
      for (const e of this.enemies) {
        if (!e.dead && aabb(pr, this.enemyHurtBox(e))) {
          e.hurt(pr.dmg); pr.dead = true;
          SFX.hit();
          this.spawnBurst(e.x + e.w / 2, e.y + e.h / 2, pr.color, 4);
          this.spawnFloat(e.x + e.w / 2, e.y, "" + pr.dmg, pr.color);
          if (e.dead) this.killEnemy(e);
        }
      }
      for (const b of this.bosses) {
        if (b.dead || !b.active || pr.dead || !aabb(pr, this.bossHurtBox(b))) continue;
        const before = b.hp;
        b.hurt(pr.dmg); pr.dead = true; SFX.hit();
        this.spawnBurst(b.x + b.w / 2, b.y + b.h / 2, pr.color, 4);
        if (b.hp < before) this.spawnFloat(b.x + b.w / 2, b.y, "" + pr.dmg, "#ffd54a");
        else if (b.invulnerable()) this.spawnFloat(b.x + b.w / 2, b.y, "GUARD", "#bfeaff");
        if (b.dead) this.killBoss(b);
      }
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);

    // pickups
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      pk.update(L);
      if (aabb(p.box, pk)) {
        pk.dead = true;
        if (pk.type === "gold") { p.gold += pk.value || 15; SFX.coin(); }
        else if (pk.type === "mana") { p.mp = Math.min(p.mpMax, p.mp + (pk.value || 8)); this.flash("+MP"); SFX.coin(); }
        else if (pk.type === "bread") { p.heal(8); this.flash("+8 HP"); SFX.heal(); }
        else if (pk.type === "boots") { p.maxJumps = 3; this.flash("WING BOOTS — triple jump unlocked!", 160); SFX.levelup(); }
        else if (BUFFS[pk.type]) { p.addBuff(pk.type, BUFFS[pk.type].dur); this.flash(BUFFS[pk.type].name + "!", 120); SFX.levelup(); }
        else if (pk.type === "key") { p.keys++; this.flash("Got a KEY — find the gate below"); SFX.key(); }
        else if (pk.type === "material") {
          p.materials[pk.mat] = (p.materials[pk.mat] || 0) + (pk.qty || 1);
          const nm = (typeof MATERIALS !== "undefined" && MATERIALS[pk.mat]) ? MATERIALS[pk.mat].name : pk.mat;
          this.flash("+" + (pk.qty || 1) + " " + nm); SFX.coin();
        }
        else if (pk.type === "template") {
          p.templates.add(pk.mat);
          const nm = (typeof TEMPLATES !== "undefined" && TEMPLATES[pk.mat]) ? TEMPLATES[pk.mat].name : pk.mat;
          this.flash("Schematic learned: " + nm, 160); SFX.levelup();
        }
      }
    }
    this.pickups = this.pickups.filter((pk) => !pk.dead);

    // zone-entry banner when crossing into a new biome (silent at spawn)
    if (this.state === "play") {
      const pb = this.level.biomeAt(Math.floor((p.y + p.h / 2) / TILE));
      if (pb !== this.curBiome) {
        if (this.curBiome) this.flash("ENTERING — " + pb.name, 150);
        this.curBiome = pb;
      }
    }

    // door interaction: stand next to it with a key and press Use
    this.handleDoor();
    // region transitions (door/portal/boat/gate/...) — no-op in regions with none
    this.handleTransitions();

    // death -> respawn at this region's checkpoint. The Player object PERSISTS
    // through loadRegion, so exp/gear/abilities/keys carry over automatically;
    // only gold is docked. applyRegionProgress keeps already-killed bosses dead.
    if (p.dead) {
      SFX.death();
      this.stats.deaths++;
      p.gold = Math.floor(p.gold * 0.7);
      p.buffs = { haste: 0, shield: 0, power: 0 };
      this.loadRegion(this.regionIdx, "checkpoint"); // syncRank() inside full-heals
      this.flash("You fell. Continue!");
    }

    // particles, floating text, screen-shake decay, run timer
    for (const fx of this.effects) fx.update();
    this.effects = this.effects.filter((fx) => !fx.dead);
    for (const ft of this.floats) ft.update();
    this.floats = this.floats.filter((ft) => !ft.dead);
    if (this.shake > 0) { this.shake *= 0.85; if (this.shake < 0.3) this.shake = 0; }
    if (this.state === "play") this.stats.time++;

    // smooth camera follow, clamped to level bounds
    this.updateCamera();

    if (this.msgTimer > 0) this.msgTimer--; else this.msg = "";
    Input.endFrame();
  }

  handleDoor() {
    const p = this.player, L = this.level;
    if (L.doorOpen || !L.doorCells.length) return; // generated levels have no door
    const dc = L.doorCells[0];
    const near = Math.abs((p.x + p.w / 2) - (dc.c * TILE + TILE / 2)) < 28 &&
                 Math.abs((p.y + p.h / 2) - (dc.r * TILE + TILE)) < 40;
    if (near) {
      if (p.keys > 0) {
        this.flash("Press UP to open the door", 30);
        if (Input.justPressed("up")) { p.keys--; L.openDoor(); this.markFlag("door:" + L.id); this.flash("The door opens..."); SFX.door(); }
      } else {
        this.flash("Locked — you need a KEY", 30);
      }
    }
  }

  killEnemy(e) {
    this.player.addExp(e.exp);
    this.stats.kills++;
    SFX.kill();
    this.spawnBurst(e.x + e.w / 2, e.y + e.h / 2, e.bodyColor(), 10);
    this.dropGold(e.x + e.w / 2, e.y + e.h / 2, e.gold, this.currencyTier(e.type));
    // ~28% chance to also drop a mana orb (keeps magic sustainable)
    if (Math.random() < 0.28) {
      this.pickups.push(new Pickup("mana", e.x + e.w / 2 - 6, e.y, { value: 8, vx: (Math.random() - 0.5) * 2.4, vy: -3 - Math.random() * 2 }));
    }
    // ~8% chance to drop a random timed power-up
    if (Math.random() < 0.08) {
      const kinds = Object.keys(BUFFS), kind = kinds[Math.floor(Math.random() * kinds.length)];
      this.pickups.push(new Pickup(kind, e.x + e.w / 2 - 6, e.y, { vx: (Math.random() - 0.5) * 2, vy: -3 - Math.random() * 2 }));
    }
    this.addShake(3);
    if (e.drops === "key") {
      this.pickups.push(new Pickup("key", e.x, e.y));
      this.flash("The warden drops a KEY!", 150);
      SFX.key();
    }
    // crafting materials (renewable: mobs respawn on region re-entry)
    if (typeof DROP_TABLES !== "undefined") this.rollDrops(DROP_TABLES[e.type], e.x + e.w / 2, e.y + e.h / 2);
    this.checkLevelUp();
  }

  tryBreakMelee(box) {
    const c0 = Math.floor(box.x / TILE), c1 = Math.floor((box.x + box.w) / TILE);
    const r0 = Math.floor(box.y / TILE), r1 = Math.floor((box.y + box.h) / TILE);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (this.level.tileAt(c, r) === "B") this.breakAt(c, r, this.player.meleeDmg);
  }

  breakAt(c, r, dmg) {
    const res = this.level.breakTile(c, r, dmg);
    if (!res) return;
    const cx = c * TILE + TILE / 2, cy = r * TILE + TILE / 2;
    if (res === "broken") {
      this.markFlag("broke:" + this.level.id + ":" + c + ":" + r); // persists (applyRegionProgress, 4.10)
      this.spawnBurst(cx, cy, this.level.biomeAt(r).edge, 12);
      SFX.kill(); this.addShake(3);
      this.flash("A hidden passage opens!", 120);
    } else {
      this.spawnBurst(cx, cy, "#caa9a0", 3);
      SFX.hit();
    }
  }

  // Roll a DROP_TABLE (mob by type / boss by kind) into material+template pickups
  // that arc out like gold. Renewable: mobs respawn on region re-entry (pillar 10).
  rollDrops(table, x, y) {
    if (!table) return;
    for (const d of table) {
      if (Math.random() >= d.chance) continue;
      const lo = Array.isArray(d.qty) ? d.qty[0] : (d.qty || 1);
      const hi = Array.isArray(d.qty) ? d.qty[1] : lo;
      const qty = lo + Math.floor(Math.random() * (hi - lo + 1));
      const isT = (typeof isTemplate === "function") && isTemplate(d.mat);
      this.pickups.push(new Pickup(isT ? "template" : "material", x - 6, y - 4, {
        mat: d.mat, qty, vx: (Math.random() - 0.5) * 2.8, vy: -3 - Math.random() * 2,
      }));
    }
  }

  // Apply a recipe (handoff §7.1): produce `makes`, spending materials + gold ONLY
  // when the craft actually does something. makes = "weapon:|armor:|magic:<id>"
  // upgrades that gear tier; else a material id. Resolve the effect BEFORE spending
  // so a no-op (already-owned tier, or a recipe whose id doesn't resolve) costs
  // nothing — and the failure messages name the real blocker.
  craft(r) {
    const p = this.player;
    if (!r) return "Nothing to craft";
    // diagnose blockers in priority order, never spending on a failed craft
    if (typeof hasMats === "function" && !hasMats(p, r)) return "Not enough materials";
    if (r.template && !p.templates.has(r.template)) return "Need the schematic first";
    if (p.gold < (r.cost || 0)) return "Not enough gold";

    const makes = r.makes;
    let apply = null, note = "", sfx = "buy";
    const eq = (arr, tierProp) => {
      const id = makes.slice(makes.indexOf(":") + 1);
      const idx = arr.findIndex((w) => w.id === id);
      if (idx < 0) return "That recipe is broken";           // bad data: never spend
      if (idx <= p[tierProp]) return "Already forged or better"; // no-op: never spend
      apply = () => { p[tierProp] = idx; };
      note = "Forged " + arr[idx].name + "!"; sfx = "levelup";
      return null;
    };
    let blocked = null;
    if (makes.startsWith("weapon:")) blocked = eq(WEAPONS, "weaponTier");
    else if (makes.startsWith("armor:")) blocked = eq(ARMORS, "armorTier");
    else if (makes.startsWith("magic:")) blocked = eq(MAGICS, "magicTier");
    else {                                                    // a refined material (always produces)
      apply = () => { p.materials[makes] = (p.materials[makes] || 0) + 1; };
      note = "Crafted " + ((typeof MATERIALS !== "undefined" && MATERIALS[makes]) ? MATERIALS[makes].name : makes);
    }
    if (blocked) return blocked;

    // commit: spend, then apply the resolved effect
    for (const n of r.needs) p.materials[n.mat] = (p.materials[n.mat] || 0) - n.qty;
    if (r.cost) p.gold -= r.cost;
    apply();
    if (SFX[sfx]) SFX[sfx]();
    return note;
  }

  // currency tier by what dropped it: small mobs -> blue, medium -> green,
  // guardians (brutes) -> red (bosses pass "gold" directly).
  // Tick mob-spawner rifts: while the player is near one, it erupts a random enemy
  // (from the ground, with a burst) on its interval, capped at `max` live at once.
  updateSpawners() {
    const p = this.player, L = this.level;
    for (const s of this.spawners) {
      s.mine = s.mine.filter((e) => !e.dead);
      const sx = s.c * TILE, sy = s.r * TILE;
      const near = Math.abs((p.x + p.w / 2) - sx) < s.range && Math.abs((p.y + p.h / 2) - sy) < s.range;
      if (!near) { if (s.cd < 60) s.cd = 60; continue; } // dormant until the player approaches
      if (--s.cd > 0 || s.mine.length >= s.max) continue;
      s.cd = s.interval;
      const type = s.types[Math.floor(Math.random() * s.types.length)];
      const e = new Enemy(type, sx, sy - 4, { hpMul: L.enemyHpMul, touchMul: L.enemyTouchMul, rewardMul: L.rewardMul });
      this.enemies.push(e); s.mine.push(e);
      this.spawnBurst(sx + 8, sy + 10, "#b06cff", 12); // erupts from the rift
      if (typeof SFX !== "undefined") SFX.kill();
    }
    this.enemies = this.enemies.filter((e) => !e.dead); // bound growth (only on spawner levels)
  }

  currencyTier(type) {
    if (type === "brute") return "red";
    if (type === "jumper" || type === "shooter") return "green";
    return "blue";
  }

  // pop a gold "pill" upward + a spray of coins that spill out and fall (it reads
  // as coins stacking into the pill). `tier` colours the currency by what dropped it.
  dropGold(x, y, amount, tier) {
    tier = tier || "gold";
    const col = (typeof CURRENCY !== "undefined" && CURRENCY[tier]) ? CURRENCY[tier].color : COLORS.gold;
    const vx = (Math.random() - 0.5) * 3;
    const vy = -3.5 - Math.random() * 2;
    this.pickups.push(new Pickup("gold", x - 6, y - 4, { value: amount, vx, vy, tier }));
    this.spawnBurst(x, y, col, 12); // coins spilling out
  }

  killBoss(b) {
    this.player.gold += b.gold;
    this.player.addExp(b.exp);
    this.stats.kills++;
    this.spawnBurst(b.x + b.w / 2, b.y + b.h / 2, "#ff8ad0", 28);
    this.spawnBurst(b.x + b.w / 2, b.y + b.h / 2, CURRENCY.gold.color, 20); // a shower of boss gold
    this.addShake(8);
    this.checkLevelUp();
    // signature crafting drops (guaranteed) in addition to the gated reward below
    if (typeof DROP_TABLES !== "undefined") this.rollDrops(DROP_TABLES[b.kind], b.x + b.w / 2, b.y + b.h / 2);
    if (b.drops === "key") {
      this.pickups.push(new Pickup("key", b.x + b.w / 2 - 6, b.y));
      this.flash(b.name + " falls — it drops a KEY!", 170);
      SFX.key();
    } else if (b.drops && VEHICLES[b.drops]) {
      this.player.vehicles.add(b.drops);
      this.flash(b.name + " falls — you gain the " + VEHICLES[b.drops].name + "!", 180);
      SFX.levelup();
    } else if (b.drops && ABILITIES[b.drops]) {
      this.grantAbility(b.drops);
      this.flash(b.name + " falls — new ability: " + ABILITIES[b.drops].name + "!", 180);
      SFX.levelup();
    } else if (b.drops) {
      this.player.materials[b.drops] = (this.player.materials[b.drops] || 0) + 1;
    }
    // a boss can ALSO drop the region key alongside its ability (e.g. Cinderbrute)
    if (b.dropsKey) {
      this.pickups.push(new Pickup("key", b.x + b.w / 2 - 6, b.y));
      this.flash(b.name + " falls — and drops a KEY!", 170);
      SFX.key();
    }
    this.markFlag("boss:" + this.level.id + ":" + b.kind); // stays dead on re-entry (4.10)
    if (b.final) { this.win(); return; }
    // area boss reward: full restore + the exit PORTAL opens (its arena seal lifts)
    this.player.hp = this.player.hpMax;
    this.player.mp = this.player.mpMax;
    this.flash(b.name + " falls! A PORTAL opens — reach it and press UP.", 240);
  }

  // Is the player currently in danger? (a live boss fight, or any enemy within 6
  // tiles). Used to deny free mid-combat full-heals on rank-up (§9 heal-flatten).
  inCombat() {
    const p = this.player, R = 6 * TILE;
    // a live boss counts only while you're actually in its arena (active is a
    // sticky flag, and a no-lock arena like the Cinderbrute's doesn't trap you)
    if (this.bosses && this.bosses.some((b) => b.active && !b.dead && b.inArena(p))) return true;
    return !!(this.enemies && this.enemies.some((e) => !e.dead &&
      Math.abs((e.x + e.w / 2) - (p.x + p.w / 2)) < R && Math.abs((e.y + e.h / 2) - (p.y + p.h / 2)) < R));
  }

  checkLevelUp() {
    const ri = rankIndexFor(this.player.exp);
    if (ri > this.lastRankIndex) {
      this.lastRankIndex = ri;
      const p = this.player;
      p.applyRank(ri);                      // bigger HP/MP pools
      if (this.inCombat()) {
        // mid-combat rank-up raises the pool but heals only a little — no free restore
        p.hp = Math.min(p.hpMax, p.hp + Math.round(p.hpMax * 0.25));
        p.mp = Math.min(p.mpMax, p.mp + Math.round(p.mpMax * 0.25));
      } else {
        p.hp = p.hpMax; p.mp = p.mpMax;
      }
      this.flash("RANK UP — " + RANKS[ri].name, 150);
      this.spawnBurst(p.x + p.w / 2, p.y + p.h / 2, COLORS.playerHi, 16);
      SFX.levelup();
    }
  }

  openMenu(menu) { this.menu = menu; }
  closeMenu() { this.menu = null; }

  // Switch graphics quality (perf): resize the backing store, persist the choice.
  setQuality(q) {
    const v = setGfx(q);
    try { localStorage.setItem("xaxanadu.gfx", v); } catch (e) {}
    this.canvas.width = VIEW_W * RENDER_SCALE;
    this.canvas.height = VIEW_H * RENDER_SCALE;
    this.ctx.imageSmoothingEnabled = GFX.filter;
    return v;
  }

  toggleFullscreen() {
    try {
      const el = (typeof document !== "undefined" && (document.getElementById("frame") || document.documentElement));
      if (!el) return;
      if (!document.fullscreenElement) { if (el.requestFullscreen) el.requestFullscreen(); }
      else if (document.exitFullscreen) document.exitFullscreen();
    } catch (e) {}
  }

  // "Mantra" save/continue via localStorage, one key per slot.
  slotKey(i) { return "xaxanadu.save." + i; }

  hasSave(i) {
    try { return !!localStorage.getItem(this.slotKey(i)); } catch (e) { return false; }
  }

  saveSummary(i) {
    try {
      const raw = localStorage.getItem(this.slotKey(i));
      if (!raw) return "empty";
      const d = JSON.parse(raw);
      return rankFor(d.exp || 0) + "  " + (d.gold || 0) + "g" + (d.boots ? "  +Boots" : "");
    } catch (e) { return "empty"; }
  }

  eraseSlot(i) {
    try { localStorage.removeItem(this.slotKey(i)); } catch (e) {}
    SFX.hit();
  }

  saveProgress() {
    const p = this.player;
    const data = {
      exp: p.exp, gold: p.gold, keys: p.keys, elixirs: p.elixirs,
      weaponTier: p.weaponTier, armorTier: p.armorTier, magicTier: p.magicTier,
      boots: p.maxJumps >= 3,                       // wing boots: single legacy source of truth (4.9)
      regionIdx: this.regionIdx,
      flags: [...this.flags],                       // opened doors/gates, dead bosses, broken walls
      abilities: { ...p.abilities },
      vehicles: [...p.vehicles],
      materials: { ...p.materials },
      templates: [...p.templates],
    };
    try {
      localStorage.setItem(this.slotKey(this.activeSlot), JSON.stringify(data));
      return "Mantra recorded (Slot " + (this.activeSlot + 1) + ")";
    } catch (err) {
      return "Could not save here";
    }
  }

  readSave(slot) {
    try { const raw = localStorage.getItem(this.slotKey(slot)); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  // Restore a saved game: world flags + player kit first, then ENTER the saved
  // region (loadRegion re-applies that region's dead bosses / opens). Old saves
  // (no regionIdx/flags/kit) load as Region 0 with empty kit (backward-compatible).
  applySave(data) {
    const p = this.player;
    this.flags = new Set(data.flags || []);
    if (data.doorOpen) this.flags.add("door:descent");   // migrate legacy door bool
    p.abilities = data.abilities || {};
    p.vehicles = new Set(data.vehicles || []);
    p.materials = data.materials || {};
    p.templates = new Set(data.templates || []);
    p.exp = data.exp || 0;
    p.gold = data.gold || 0;
    p.keys = data.keys || 0;
    p.elixirs = data.elixirs || 0;
    p.weaponTier = data.weaponTier || 0;
    p.armorTier = data.armorTier || 0;
    p.magicTier = data.magicTier || 0;
    p.maxJumps = data.boots ? 3 : 2;
    this.loadRegion(data.regionIdx || 0, "checkpoint"); // applies per-region progress + syncRank
    this.flash("Mantra restored — welcome back", 150);
  }

  setMusic(track) {
    if (this.curMusic === track) return;
    this.curMusic = track;
    SFX.startMusic(track);
  }

  win() {
    this.state = "won";
    this.level.lockSet.clear();
    SFX.stopMusic(); this.curMusic = null;
    SFX.win();
    this.flash("THE HOLLOW CROWN IS UNDONE — press SPACE for the title", 99999);
  }

  updateTitle() {
    const N = 3; // save slots
    if (Input.justPressed("up"))   this.titleIndex = (this.titleIndex - 1 + N) % N;
    if (Input.justPressed("down")) this.titleIndex = (this.titleIndex + 1) % N;
    if (Input.justPressed("jump")) this.startGame(this.titleIndex);
    if (Input.justPressed("attack") && this.hasSave(this.titleIndex)) this.eraseSlot(this.titleIndex);
  }

  startGame(slot) {
    this.activeSlot = slot;
    this.stats = { kills: 0, deaths: 0, time: 0 };
    const data = this.readSave(slot);
    this.reset();
    if (data) this.applySave(data);
    this.state = "play";
  }

  toTitle() {
    this.reset();
    SFX.stopMusic(); this.curMusic = null;
    this.state = "title";
    this.titleIndex = this.activeSlot;
  }

  updateCamera() {
    const p = this.player, W = VIEW_W, H = VIEW_H;
    // look ahead in the facing direction (and up/down while climbing)
    const lookX = p.dir * 34;
    const lookY = p.climbing ? (Input.held.down ? 38 : Input.held.up ? -30 : 0) : 0;
    const targetX = p.x + p.w / 2 - W / 2 + lookX;
    const targetY = p.y + p.h / 2 - H / 2 + lookY;
    // ease toward target for a soft scroll (look-ahead eases slower than follow)
    this.cam.x += (targetX - this.cam.x) * 0.08;
    this.cam.y += (targetY - this.cam.y) * 0.10;
    this.cam.x = clamp(this.cam.x, 0, this.level.pixelW - W);
    this.cam.y = clamp(this.cam.y, 0, this.level.pixelH - H);
  }

  render() {
    // draw in logical coords; the backing store is RENDER_SCALE× larger
    this.ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    this.ctx.imageSmoothingEnabled = GFX.filter; // off on LOW (faster + crisper pixels)
    if (this.state === "title") { this.renderTitle(); return; }
    if (this.state === "won") { this.renderWin(); return; }

    const ctx = this.ctx, W = VIEW_W, H = VIEW_H;
    // biome-tinted background + illustrated parallax scene
    const biome = this.level.biomeAtPx(this.cam.y + H / 2);
    ctx.fillStyle = biome.bg;
    ctx.fillRect(0, 0, W, H);
    this.drawBackground(biome);

    // apply screen shake as a small camera offset (world only, not HUD)
    const cam = this.shake > 0
      ? { x: this.cam.x + (Math.random() - 0.5) * this.shake, y: this.cam.y + (Math.random() - 0.5) * this.shake }
      : this.cam;

    this.level.draw(ctx, cam);
    this.drawPortals(ctx, cam);
    for (const n of this.npcs) n.draw(ctx, cam);
    for (const pk of this.pickups) pk.draw(ctx, cam);
    for (const e of this.enemies) if (!e.dead) e.draw(ctx, cam);
    for (const b of this.bosses) if (!b.dead && b.active) b.draw(ctx, cam);
    for (const pr of this.projectiles) pr.draw(ctx, cam);
    for (const s of this.enemyShots) s.draw(ctx, cam);
    for (const fx of this.effects) fx.draw(ctx, cam);
    for (const ft of this.floats) ft.draw(ctx, cam);

    this.player.draw(ctx, cam);
    this.drawVignette();
    HUD.draw(ctx, this.player, this.msgTimer > 0 ? this.msg : "");
    this.drawBossBar(ctx);
    this.drawMinimap(ctx);

    if (this.menu) this.menu.draw(ctx);
    this.drawDebug(ctx);
  }

  // corner minimap: layout + player / town / boss / gate markers
  // Visible exit portals + mob-spawner portals. A level exit is INVISIBLE without
  // this, so the player can't tell where to go after beating the boss. A satisfied
  // gate glows bright with an "EXIT ↑" prompt; a sealed one is dim.
  drawPortals(ctx, cam) {
    const tnow = this.stats.time || 0;
    for (const tr of (this.level.transitions || [])) {
      if (!tr || tr.id === "_none") continue;
      const ok = this.gateSatisfied(tr.requires);
      const x = tr.c * TILE - cam.x, y = (tr.r - 1) * TILE - cam.y; // 2 tiles tall, bottom on the floor row
      const col = ok ? "#9b7cff" : "#4a3a6a";
      const pulse = 0.5 + 0.5 * Math.sin(tnow * 0.12);
      ctx.save();
      ctx.globalAlpha = ok ? 0.30 + pulse * 0.30 : 0.22;
      ctx.fillStyle = col;
      ctx.fillRect(x + 3, y + 1, TILE - 6, TILE * 2 - 2);
      ctx.restore();
      neonStroke(ctx, x + 2, y, TILE - 4, TILE * 2, col, ok ? 12 : 4, 2);
      if (ok) {
        ctx.save(); ctx.fillStyle = "#d8c8ff"; ctx.font = "6px Consolas, monospace"; ctx.textAlign = "center";
        ctx.fillText("EXIT ↑", x + TILE / 2, y - 3); ctx.textAlign = "left"; ctx.restore();
      }
    }
    // mob-spawner portals: a glowing rift on the ground that erupts enemies
    for (const s of (this.spawners || [])) {
      const x = s.c * TILE - cam.x, y = s.r * TILE - cam.y;
      const pulse = 0.5 + 0.5 * Math.sin(tnow * 0.18 + s.c);
      ctx.save();
      ctx.globalAlpha = 0.4 + pulse * 0.35;
      neonRect(ctx, x - 2, y + TILE - 5, TILE + 4, 4, "#b06cff", 12);
      ctx.globalAlpha = 0.55;
      neonRect(ctx, x + 2, y + TILE - 8, TILE - 4, 3, "#d8b0ff", 8);
      ctx.restore();
    }
  }

  // The static map layer is the costly part (one fillRect per non-empty cell), so
  // it's rendered to an offscreen canvas ONCE per level (rebuilt only when the grid
  // changes) and blitted each frame; only the moving dots are drawn live.
  buildMiniMap(L, s) {
    const mw = Math.ceil(L.cols * s), mh = Math.ceil(L.rows * s);
    if (typeof document === "undefined" || !document.createElement) return { id: L.id, rev: L.gridRev, mw, mh, canvas: null };
    const oc = document.createElement("canvas"); oc.width = mw; oc.height = mh;
    const o = oc.getContext("2d");
    const ts = Math.ceil(s);
    for (let r = 0; r < L.rows; r++) {
      const biome = L.biomeAt(r);
      for (let c = 0; c < L.cols; c++) {
        const t = L.grid[r][c];
        if (t === ".") continue;
        let col;
        if (t === "#" || t === "B") col = biome.rock;
        else if (t === "H" || t === "T") col = "#5c4cff";
        else if (t === "D") col = L.doorOpen ? null : "#ff5cf0";
        else col = biome.rock;
        if (col) { o.fillStyle = col; o.fillRect(c * s, r * s, ts, ts); }
      }
    }
    return { id: L.id, rev: L.gridRev, mw, mh, canvas: oc };
  }

  drawMinimap(ctx) {
    const L = this.level, s = 1.4;
    if (!this._mini || this._mini.id !== L.id || this._mini.rev !== L.gridRev) this._mini = this.buildMiniMap(L, s);
    const m = this._mini, mw = m.mw, mh = m.mh;
    const mx = VIEW_W - mw - 6, my = 38;

    ctx.save();
    ctx.fillStyle = "rgba(2,4,10,0.72)";
    ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
    if (m.canvas) ctx.drawImage(m.canvas, mx, my);

    const dot = (px, py, color, sz) => {
      ctx.fillStyle = color;
      ctx.fillRect(mx + (px / TILE) * s - sz / 2, my + (py / TILE) * s - sz / 2, sz, sz);
    };
    for (const n of this.npcs) dot(n.x + n.w / 2, n.y + n.h / 2, COLORS.gold, 2);
    for (const b of this.bosses) if (!b.dead) dot(b.x + b.w / 2, b.y + b.h / 2, "#ff2e88", 3);
    const p = this.player;
    dot(p.x + p.w / 2, p.y + p.h / 2, "#bafff4", 3);
    ctx.restore();
  }

  // gamepad debug overlay (toggle with the ` backtick key)
  drawDebug(ctx) {
    if (!Input.debug) return;
    const W = VIEW_W, H = VIEW_H;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, H - 13, W, 13);
    ctx.fillStyle = "#9bffb0";
    ctx.font = "7px Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText("GP " + Input.padDebug(), 4, H - 4);
  }

  drawBossBar(ctx) {
    const b = this.bosses.find((x) => x.active && !x.dead);
    if (!b) return;
    const W = VIEW_W, bw = 200, bx = (W - bw) / 2, by = 46;
    ctx.fillStyle = "rgba(4,6,12,0.8)";
    ctx.fillRect(bx - 3, by - 13, bw + 6, 24);
    ctx.fillStyle = "#ff8ad0";
    ctx.font = "8px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText(b.name + (b.invulnerable() ? "  (GUARDED)" : ""), W / 2, by - 4);
    ctx.textAlign = "left";
    HUD.bar(ctx, bx, by, bw, 8, b.hp / b.maxHp, "#ff2e88", "#3a1020");
  }

  renderTitle() {
    const ctx = this.ctx, W = VIEW_W, H = VIEW_H;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);
    this.drawParallax();

    ctx.textAlign = "center";

    // title wordmark
    ctx.save();
    ctx.shadowColor = COLORS.player; ctx.shadowBlur = 18;
    ctx.fillStyle = COLORS.player;
    ctx.font = "bold 34px Consolas, monospace";
    ctx.fillText("XAXANADU", W / 2, H / 2 - 46);
    ctx.restore();

    ctx.fillStyle = COLORS.solidEdge;
    ctx.font = "9px Consolas, monospace";
    ctx.fillText("DESCENT INTO THE EARTH", W / 2, H / 2 - 26);

    // save-slot picker
    ctx.font = "11px Consolas, monospace";
    for (let i = 0; i < 3; i++) {
      const y = H / 2 + 4 + i * 20;
      const sel = i === this.titleIndex;
      const sum = this.saveSummary(i);
      const verb = sum === "empty" ? "NEW" : "CONTINUE";
      if (sel) {
        neonRect(ctx, W / 2 - 130, y - 11, 260, 15, "rgba(44,245,214,0.12)", 0);
        ctx.fillStyle = "#ffffff";
      } else ctx.fillStyle = COLORS.text;
      ctx.fillText("SLOT " + (i + 1) + " — " + (sum === "empty" ? "empty  (NEW GAME)" : sum), W / 2, y);
    }

    ctx.fillStyle = "#6f88a8";
    ctx.font = "8px Consolas, monospace";
    ctx.fillText("Up/Down pick slot  ·  A/Space play  ·  Shift/B erase slot", W / 2, H - 28);
    ctx.fillText("Move: arrows/stick · Shift attack · Enter magic · P pause", W / 2, H - 17);
    ctx.textAlign = "left";

    this.drawDebug(ctx);
  }

  fmtTime(frames) {
    const s = Math.floor(frames / 60);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  renderWin() {
    const ctx = this.ctx, W = VIEW_W, H = VIEW_H;
    ctx.fillStyle = "#0e0414";
    ctx.fillRect(0, 0, W, H);
    this.drawParallax(this.level.biomes[this.level.biomes.length - 1]); // last biome (single-biome regions too)
    ctx.textAlign = "center";

    ctx.save();
    ctx.shadowColor = COLORS.gold; ctx.shadowBlur = 20;
    ctx.fillStyle = COLORS.gold;
    ctx.font = "bold 30px Consolas, monospace";
    ctx.fillText("VICTORY", W / 2, 64);
    ctx.restore();

    ctx.fillStyle = "#ff8ad0";
    ctx.font = "9px Consolas, monospace";
    ctx.fillText("The Hollow Crown falls. Light returns to the depths.", W / 2, 86);

    const p = this.player;
    const lines = [
      "TIME   " + this.fmtTime(this.stats.time),
      "FOES   " + this.stats.kills,
      "DEATHS " + this.stats.deaths,
      "RANK   " + rankFor(p.exp),
      "GOLD   " + p.gold,
    ];
    ctx.font = "11px Consolas, monospace";
    ctx.fillStyle = COLORS.text;
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], W / 2, 120 + i * 18);

    ctx.fillStyle = COLORS.player;
    ctx.font = "8px Consolas, monospace";
    ctx.fillText("XAXANADU — a Faxanadu-inspired descent", W / 2, H - 34);
    ctx.fillStyle = "#6f88a8";
    ctx.fillText("press SPACE for the title", W / 2, H - 18);
    ctx.textAlign = "left";
  }

  hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // Illustrated biome backdrop, parallax-scrolled and darkened for depth.
  // Falls back to the neon grid until the image loads (or headless).
  // Tiled, parallax-scrolled background — uses the seamless terrain TILES
  // (not painted scene images), biome-tinted and darkened so the foreground
  // reads. A different tile than the foreground rock gives depth.
  drawBackground(biome) {
    const ctx = this.ctx, W = VIEW_W, H = VIEW_H;

    // dramatic painted backdrop ONLY in the boss room (while the fight is live)
    const bossing = this.bosses && this.bosses.some((b) => b.active && !b.dead);
    if (bossing && this.drawSceneBg(biome)) return;

    const tileKey = { "CRYSTAL CAVES": "rock", "DEEP HOLLOWS": "ground",
                      "MAGMA DEPTHS": "rock", "THE CORE": "brick" }[biome.name] || "ground";
    const pat = GFX.tex && (typeof getTilePattern !== "undefined") && getTilePattern(ctx, tileKey, biome.rock);
    if (!pat) { this.drawParallax(biome); return; }
    // parallax: the background scrolls slower than the world (0.4x)
    const px = this.cam.x * 0.4, py = this.cam.y * 0.4;
    ctx.save();
    ctx.translate(-px, -py);
    ctx.fillStyle = pat;
    ctx.fillRect(px, py, W, H);
    ctx.restore();
    // push it back behind the action
    ctx.fillStyle = "rgba(4,6,12,0.5)";
    ctx.fillRect(0, 0, W, H);
  }

  // Painted scene image (used only for the boss room). Returns false if not loaded.
  drawSceneBg(biome) {
    const ctx = this.ctx, W = VIEW_W, H = VIEW_H;
    const key = biome.bgKey || { "CRYSTAL CAVES": "bg-cave", "DEEP HOLLOWS": "bg-pinewood",
                  "MAGMA DEPTHS": "bg-volcano", "THE CORE": "bg-tower" }[biome.name];
    const bg = key && (typeof Assets !== "undefined") && Assets.get(key);
    if (!bg) return false;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.6;
    let px = -((this.cam.x * 0.3) % W);
    if (px > 0) px -= W;
    ctx.drawImage(bg, px, 0, W, H);
    ctx.drawImage(bg, px + W, 0, W, H);
    ctx.restore();
    ctx.globalAlpha = 1;
    return true;
  }

  // Foreground vignette — darkened edges for depth.
  drawVignette() {
    const ctx = this.ctx, W = VIEW_W, H = VIEW_H;
    if (!GFX.glow) return;                 // skip the per-frame radial gradient on LOW gfx
    if (!ctx.createRadialGradient) return;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.78);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // cheap layered grid for depth (parallax with camera), tinted per biome
  drawParallax(biome) {
    const ctx = this.ctx, W = VIEW_W, H = VIEW_H;
    ctx.save();
    ctx.strokeStyle = this.hexToRgba((biome && biome.edge) || "#3a6df0", 0.06);
    ctx.lineWidth = 1;
    const ox = -(this.cam.x * 0.3) % 32, oy = -(this.cam.y * 0.3) % 32;
    for (let x = ox; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = oy; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
  }
}
