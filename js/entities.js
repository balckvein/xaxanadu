// entities.js — enemies, projectiles, pickups, particles, NPCs, boss.

// A shot fired BY an enemy/boss that damages the player.
// opts: { bounce } ricochets off walls N times; { gravity } makes it arc.
class EnemyShot {
  constructor(x, y, vx, vy, dmg, color, opts = {}) {
    this.x = x; this.y = y; this.w = 7; this.h = 7;
    this.vx = vx; this.vy = vy;
    this.dmg = dmg || 5;
    this.color = color || "#ff7b3d";
    this.life = opts.life || 150; this.dead = false;
    this.bounce = opts.bounce || 0;
    this.gravity = opts.gravity || 0;
  }
  update(level) {
    if (this.gravity) this.vy += this.gravity;
    // X axis
    this.x += this.vx;
    if (level.isSolidPx(this.x + (this.vx > 0 ? this.w : 0), this.y + this.h / 2)) {
      if (this.bounce > 0) { this.bounce--; this.vx = -this.vx; this.x += this.vx; }
      else this.dead = true;
    }
    // Y axis
    this.y += this.vy;
    if (level.isSolidPx(this.x + this.w / 2, this.y + (this.vy > 0 ? this.h : 0))) {
      if (this.bounce > 0 && !this.gravity) { this.bounce--; this.vy = -this.vy; }
      else this.dead = true;
    }
    if (--this.life <= 0) this.dead = true;
  }
  draw(ctx, cam) { neonRect(ctx, this.x - cam.x, this.y - cam.y, this.w, this.h, this.color, 10); }
}

class Enemy {
  constructor(type, x, y, opts = {}) {
    this.type = type;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.dir = -1;
    this.dead = false;
    this.grounded = false;
    this.flash = 0;
    this.baseY = y;
    this.t = Math.floor(x + y);
    const pool = MOB_SPRITES[type];
    // seed sprite choice off the discrete tile cell — a pixel-sum seed collapses to
    // one sprite for tile-aligned spawns when the pool length divides TILE (16).
    const seed = Math.abs(Math.floor(x / TILE) + Math.floor(y / TILE) * 7);
    this.spriteKey = pool ? pool[seed % pool.length] : null;
    this.pendingShots = [];
    this.drops = opts.drops || null;        // e.g. "key"
    this.shootCd = 70 + (Math.floor(x) % 40);
    this.jumpCd = 36;
    this.windup = 0;     // telegraph timer for charge/slam archetypes
    this.slamCd = 90;    // cooldown between telegraphed attacks

    const S = {
      walker:  { w: 14, h: 14, hp: 3,  touch: 8,  gold: 12, exp: 20, spd: 0.5 },
      flyer:   { w: 16, h: 12, hp: 2,  touch: 6,  gold: 18, exp: 30, spd: 0.7 },
      jumper:  { w: 14, h: 14, hp: 5,  touch: 10, gold: 25, exp: 45, spd: 1.0 },
      shooter: { w: 14, h: 16, hp: 4,  touch: 8,  gold: 22, exp: 40, spd: 0.0 },
      crawler: { w: 14, h: 12, hp: 3,  touch: 8,  gold: 16, exp: 28, spd: 0.9 },
      // tougher archetype (handoff §6.2/§9): a slow tank that telegraphs a
      // ground-slam shockwave — the "new tougher mob" deeper regions lean on.
      brute:   { w: 18, h: 18, hp: 14, touch: 12, gold: 60, exp: 90, spd: 0.35 },
    }[type] || { w: 14, h: 14, hp: 3, touch: 8, gold: 12, exp: 20, spd: 0.5 };
    Object.assign(this, S);
    if (opts.hp) this.hp = opts.hp;
    if (opts.hpMul) this.hp = Math.max(1, Math.round(this.hp * opts.hpMul)); // per-region scaling
    // touchMul ceiling 2.5 (handoff §9): late contact stays ≤~30% of a region HP pool — no one-shots
    if (opts.touchMul) this.touch = Math.max(1, Math.round(this.touch * Math.min(2.5, opts.touchMul)));
    if (opts.rewardMul) { this.gold = Math.round(this.gold * opts.rewardMul); this.exp = Math.round(this.exp * opts.rewardMul); }
    this.maxHp = this.hp;
  }

  hurt(dmg) {
    this.hp -= dmg;
    this.flash = 8;
    if (this.hp <= 0) this.dead = true;
  }

  update(level, player) {
    this.t++;
    this.pendingShots.length = 0;
    if (this.flash > 0) this.flash--;

    switch (this.type) {
      case "jumper":  this.updateJumper(level, player); break;
      case "shooter": this.updateShooter(level, player); break;
      case "crawler": this.updateCrawler(level); break;
      case "flyer":   this.updateFlyer(level); break;
      case "brute":   this.updateBrute(level, player); break;
      default:        this.updateWalker(level); break;
    }
  }

  // BRUTE — lumbers toward the player, then telegraphs (windup glow) a ground
  // slam that sends shockwaves skimming the floor both ways. touch-scaled, so
  // its slam hits as hard as the region's contact damage.
  updateBrute(level, player) {
    this.vy = Math.min(this.vy + 0.4, 8);
    this.moveY(level);
    if (player) this.dir = (player.x > this.x) ? 1 : -1;
    if (!this.grounded) return;
    if (this.windup > 0) {
      this.windup--;
      this.flash = 2; // glow during the windup as the telegraph
      if (this.windup === 0) {
        const cx = this.x + this.w / 2, fy = this.y + this.h - 6;
        this.pendingShots.push(new EnemyShot(cx, fy, 3.0, 0, this.touch, "#ffb15c"));
        this.pendingShots.push(new EnemyShot(cx, fy, -3.0, 0, this.touch, "#ffb15c"));
      }
    } else {
      this.x += this.spd * this.dir;
      const ahead = this.x + (this.dir < 0 ? -2 : this.w + 2);
      if (level.isSolidPx(ahead, this.y + this.h - 2)) this.dir *= -1;
      if (--this.slamCd <= 0 && player && Math.abs(player.x - this.x) < 90) { this.windup = 26; this.slamCd = 140; }
    }
  }

  updateWalker(level) {
    this.vy = Math.min(this.vy + 0.4, 8);
    this.moveY(level);
    const ahead = this.x + (this.dir < 0 ? -2 : this.w + 2);
    const footAhead = this.x + (this.dir < 0 ? 0 : this.w);
    const wall = level.isSolidPx(ahead, this.y + this.h - 2);
    const ledge = !level.isGroundPx(footAhead, this.y + this.h + 2);
    if (wall || ledge) this.dir *= -1;
    this.x += this.spd * this.dir;
  }

  updateFlyer(level) {
    this.y = this.baseY + Math.sin(this.t * 0.06) * 18;
    const ahead = this.x + (this.dir < 0 ? -2 : this.w + 2);
    if (level.isSolidPx(ahead, this.y + this.h / 2)) this.dir *= -1;
    this.x += this.spd * this.dir;
  }

  // hops along the ground, drifting toward the player
  updateJumper(level, player) {
    this.vy = Math.min(this.vy + 0.4, 8);
    this.moveY(level);
    if (player) this.dir = (player.x > this.x) ? 1 : -1;
    if (this.grounded) {
      if (--this.jumpCd <= 0) { this.vy = -6.2; this.jumpCd = 40 + (this.t % 30); }
    } else {
      this.x += this.spd * this.dir;
      const ahead = this.x + (this.dir < 0 ? -2 : this.w + 2);
      if (level.isSolidPx(ahead, this.y + this.h / 2)) this.dir *= -1;
    }
  }

  // sits on the ground, fires aimed shots when the player is in range
  updateShooter(level, player) {
    this.vy = Math.min(this.vy + 0.4, 8);
    this.moveY(level);
    if (!player) return;
    this.dir = (player.x > this.x) ? 1 : -1;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const dx = (player.x + player.w / 2) - cx, dy = (player.y + player.h / 2) - cy;
    if (--this.shootCd <= 0 && Math.abs(dx) < 170 && Math.abs(dy) < 80) {
      this.shootCd = 95;
      const d = Math.hypot(dx, dy) || 1, sp = 2.6;
      this.pendingShots.push(new EnemyShot(cx - 3, cy - 3, dx / d * sp, dy / d * sp, 6, "#b6ff3d"));
    }
  }

  // clings to a ceiling, sliding back and forth
  updateCrawler(level) {
    const ahead = this.x + (this.dir < 0 ? -2 : this.w + 2);
    if (level.isSolidPx(ahead, this.y + this.h / 2)) this.dir *= -1;
    this.x += this.spd * this.dir;
    this.y = this.baseY + Math.sin(this.t * 0.1) * 2;
  }

  moveY(level) {
    this.y += this.vy;
    this.grounded = false;
    if (this.vy > 0) {
      if (level.isGroundPx(this.x + 2, this.y + this.h) || level.isGroundPx(this.x + this.w - 2, this.y + this.h)) {
        this.y = Math.floor((this.y + this.h) / TILE) * TILE - this.h;
        this.vy = 0; this.grounded = true;
      }
    }
  }

  bodyColor() {
    switch (this.type) {
      case "flyer":   return COLORS.enemy2;
      case "jumper":  return "#ff5cf0";
      case "shooter": return "#b6ff3d";
      case "crawler": return "#9b5cff";
      case "brute":   return "#ff8a3c";
      default:        return COLORS.enemy;
    }
  }

  draw(ctx, cam) {
    // Illustrated sprite (Numeria art) takes over when loaded; neon below is
    // the fallback. Default art is assumed to face right -> flip when facing right.
    const img = this.spriteKey && Assets.get(this.spriteKey);
    if (img) {
      const cx = this.x + this.w / 2 - cam.x;
      const airborne = this.type === "flyer" || this.type === "crawler";
      const dispH = this.h * 2.6;
      const footY = airborne ? (this.y + this.h / 2 - cam.y) + dispH / 2
                             : (this.y + this.h - cam.y);
      drawSprite(ctx, img, cx, footY, dispH, this.dir > 0, this.flash > 0);
      return;
    }

    const x = this.x - cam.x, y = this.y - cam.y;
    const col = this.flash > 0 ? "#ffffff" : this.bodyColor();
    let bx = x, byw = this.w, byh = this.h, byy = y;

    if (this.type === "flyer") {
      // flapping wings on either side of the body
      const flap = Math.sin(this.t * 0.35) * 2;
      neonRect(ctx, x - 4, y + 3 - flap, 4, 3, col, 8);
      neonRect(ctx, x + this.w, y + 3 - flap, 4, 3, col, 8);
    } else if (this.type === "walker") {
      // gentle squash-and-stretch waddle
      const sq = Math.sin(this.t * 0.25);
      byh = this.h + sq * 1.5; byw = this.w - sq; bx = x + (this.w - byw) / 2; byy = y + (this.h - byh);
    } else if (this.type === "jumper") {
      // squash on the ground, stretch in the air
      if (this.grounded) { byw = this.w + 2; byh = this.h - 2; bx = x - 1; byy = y + 2; }
      else { byw = this.w - 2; byh = this.h + 2; bx = x + 1; byy = y - 2; }
    } else if (this.type === "shooter") {
      // glow brighter as it charges a shot; little barrel in facing dir
      const charge = this.shootCd < 26 ? (26 - this.shootCd) / 26 : 0;
      neonRect(ctx, x, y, this.w, this.h, col, 10 + charge * 16);
      neonRect(ctx, this.dir > 0 ? x + this.w : x - 3, y + this.h / 2 - 1, 3, 3, charge > 0.5 ? "#ffffff" : col, 10 + charge * 14);
      this.drawEyes(ctx, x, y); return;
    } else if (this.type === "crawler") {
      // wiggling little legs along the ceiling
      const wig = Math.sin(this.t * 0.4);
      neonRect(ctx, x + 2, y - 2, 2, 2 + (wig > 0 ? 1 : 0), col, 6);
      neonRect(ctx, x + this.w - 4, y - 2, 2, 2 + (wig > 0 ? 0 : 1), col, 6);
    }

    neonRect(ctx, bx, byy, byw, byh, col, 10);
    this.drawEyes(ctx, bx, byy);
  }

  drawEyes(ctx, x, y) {
    ctx.fillStyle = "#1a0008";
    ctx.fillRect(Math.round(x + 3), Math.round(y + 4), 2, 2);
    ctx.fillRect(Math.round(x + this.w - 5), Math.round(y + 4), 2, 2);
  }

  get box() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
}

class NPC {
  constructor(kind, x, y) {
    this.kind = kind; // "shop" | "guru" | "forge"
    this.x = x; this.y = y; this.w = 14; this.h = 20;
    this.t = Math.floor(x);
  }
  update() { this.t++; }
  draw(ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y;
    const col = this.kind === "guru" ? COLORS.ladder : this.kind === "forge" ? "#ff7b3d" : COLORS.gold;
    // body
    neonRect(ctx, x, y + 6, this.w, this.h - 6, col, 12);
    // head
    neonRect(ctx, x + 3, y, this.w - 6, 7, col, 12);
    // forge gets a little anvil glow at its feet
    if (this.kind === "forge") neonRect(ctx, x - 2, y + this.h - 3, this.w + 4, 3, "#ffb15c", 10);
    // floating prompt
    const bob = Math.sin(this.t * 0.08) * 2;
    ctx.save();
    ctx.fillStyle = COLORS.text;
    ctx.font = "7px Consolas, monospace";
    ctx.textAlign = "center";
    const prompt = this.kind === "guru" ? "GURU ↑" : this.kind === "forge" ? "FORGE ↑" : "SHOP ↑";
    ctx.fillText(prompt, x + this.w / 2, y - 4 + bob);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

class Projectile {
  constructor(x, y, dir, magic) {
    const m = magic || MAGICS[0];
    this.x = x; this.y = y;
    this.w = m.size; this.h = Math.max(4, Math.round(m.size / 2));
    this.vx = m.speed * dir;
    this.life = 70;
    this.dead = false;
    this.dmg = m.dmg;
    this.color = m.color;
  }
  update(level) {
    this.x += this.vx;
    this.life--;
    if (this.life <= 0) this.dead = true;
    if (level.isSolidPx(this.x + (this.vx > 0 ? this.w : 0), this.y + this.h / 2)) this.dead = true;
  }
  draw(ctx, cam) {
    neonRect(ctx, this.x - cam.x, this.y - cam.y, this.w, this.h, this.color, 12);
  }
}

// Small rising, fading text — damage numbers and pickups.
class FloatText {
  constructor(x, y, text, color) {
    this.x = x; this.y = y; this.text = text; this.color = color || "#fff";
    this.life = 42; this.max = 42;
  }
  update() { this.y -= 0.6; this.life--; }
  get dead() { return this.life <= 0; }
  draw(ctx, cam) {
    const a = Math.max(0, this.life / this.max);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.font = "bold 8px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText(this.text, this.x - cam.x, this.y - cam.y);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, vx, vy, life, color) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.max = life; this.color = color;
  }
  update() { this.x += this.vx; this.y += this.vy; this.vy += 0.22; this.life--; }
  get dead() { return this.life <= 0; }
  draw(ctx, cam) {
    const a = Math.max(0, this.life / this.max);
    const s = 1 + Math.round(a * 2);
    ctx.save();
    ctx.globalAlpha = a;
    neonRect(ctx, this.x - cam.x, this.y - cam.y, s, s, this.color, 6);
    ctx.restore();
  }
}

class Pickup {
  constructor(type, x, y, opts = {}) {
    this.type = type; // gold | mana | bread | key | boots | buff | material | template
    this.x = x; this.y = y;
    const pill = (type === "gold" || type === "mana");
    this.w = pill ? 13 : 12;
    this.h = pill ? 8 : 12;
    this.dead = false;
    this.t = Math.floor(x + y);
    this.value = opts.value || 0;   // gold amount (0 -> default on collect)
    this.tier = opts.tier || "gold"; // currency tier (blue/green/red/gold) for "gold" drops
    this.mat = opts.mat || null;    // material/template id (for "material"/"template")
    this.qty = opts.qty || 1;       // material stack size
    this.vx = opts.vx || 0;
    this.vy = opts.vy || 0;
    this.dynamic = !!(opts.vx || opts.vy); // dropped pickups fall + settle
    this.spin = 0;
  }

  update(level) {
    this.t++;
    if (!this.dynamic) return;
    this.vy = Math.min(this.vy + 0.4, 8);

    // --- X axis: stop AT the wall (don't embed), then bounce ---
    let nx = this.x + this.vx;
    if (level) {
      const yMid = this.y + this.h / 2;
      if (this.vx > 0 && level.isSolidPx(nx + this.w, yMid)) {
        nx = Math.floor((nx + this.w) / TILE) * TILE - this.w - 0.01; this.vx = -this.vx * 0.4;
      } else if (this.vx < 0 && level.isSolidPx(nx, yMid)) {
        nx = Math.floor(nx / TILE) * TILE + TILE; this.vx = -this.vx * 0.4;
      }
    }
    this.x = nx;
    this.vx *= 0.94;

    // --- Y axis: rest ON TOP of ground / stop under ceilings ---
    let ny = this.y + this.vy;
    let landed = false;
    if (level && this.vy > 0 &&
        (level.isGroundPx(this.x + 2, ny + this.h) || level.isGroundPx(this.x + this.w - 2, ny + this.h))) {
      ny = Math.floor((ny + this.h) / TILE) * TILE - this.h - 0.01;
      this.vy = 0; this.vx *= 0.5; landed = true;
    } else if (level && this.vy < 0 &&
        (level.isSolidPx(this.x + 2, ny) || level.isSolidPx(this.x + this.w - 2, ny))) {
      ny = Math.floor(ny / TILE) * TILE + TILE; this.vy = 0;
    }
    this.y = ny;
    this.spin += 0.3;

    // settle only once actually resting on the ground
    if (landed && Math.abs(this.vx) < 0.25) this.dynamic = false;
  }

  draw(ctx, cam) {
    const bob = this.dynamic ? 0 : Math.sin(this.t * 0.08) * 2;
    const x = this.x - cam.x, y = this.y - cam.y + bob;
    if (this.type === "gold") {
      // a little stack of coins fused into a pill, coloured by currency tier
      const cur = (typeof CURRENCY !== "undefined" && CURRENCY[this.tier]) || { color: COLORS.gold, shine: "#fff7d6" };
      neonPill(ctx, x, y, this.w, this.h, cur.color, 11);
      ctx.save();
      ctx.strokeStyle = cur.shine; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      ctx.beginPath(); // coin-stack seams
      ctx.moveTo(x + 2, Math.round(y + this.h / 2) + 0.5); ctx.lineTo(x + this.w - 2, Math.round(y + this.h / 2) + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 0.95; ctx.fillStyle = cur.shine;
      ctx.fillRect(Math.round(x + 3), Math.round(y + 2), 3, 2); // top-coin shine
      ctx.restore();
    } else if (this.type === "mana") {
      neonPill(ctx, x, y, this.w, this.h, COLORS.mpFill, 12);
      ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = "#d6f4ff";
      ctx.fillRect(Math.round(x + 3), Math.round(y + 2), 3, 2);
      ctx.restore();
    } else if (this.type === "bread") {
      neonPill(ctx, x, y, this.w, this.h, COLORS.bread, 10);
    } else if (this.type === "key") {
      neonRect(ctx, x + 3, y, 6, this.h, COLORS.key, 12);
      neonRect(ctx, x, y + 2, 12, 4, COLORS.key, 12);
    } else if (this.type === "boots") {
      neonRect(ctx, x + 3, y + 3, 8, 7, "#bafff4", 12); // boot
      neonRect(ctx, x + 3, y + 9, 11, 3, "#bafff4", 12); // sole
      neonRect(ctx, x - 2, y + 2, 4, 2, COLORS.mpFill, 10); // wing
      neonRect(ctx, x - 1, y + 5, 3, 2, COLORS.mpFill, 8);
    } else if (this.type === "material") {
      // crafting material: a small spinning ore/gem, colored by its kind
      const m = (typeof MATERIALS !== "undefined") && MATERIALS[this.mat];
      const col = (m && m.color) || "#cfd6e0";
      const pulse = 9 + Math.sin(this.t * 0.16) * 4;
      neonRect(ctx, x + 2, y + 2, 8, 8, col, pulse);
      ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = "#ffffff";
      ctx.fillRect(Math.round(x + 4), Math.round(y + 3), 2, 2);
      ctx.restore();
    } else if (this.type === "template") {
      // schematic scroll
      neonRect(ctx, x + 2, y + 1, 8, 10, "#ffe08a", 12);
      ctx.save(); ctx.fillStyle = "#5a4a1a";
      ctx.fillRect(Math.round(x + 3), Math.round(y + 3), 6, 1);
      ctx.fillRect(Math.round(x + 3), Math.round(y + 6), 6, 1);
      ctx.fillRect(Math.round(x + 3), Math.round(y + 9), 4, 1);
      ctx.restore();
    } else if (BUFFS[this.type]) {
      // power-up: spinning glowing gem
      const col = BUFFS[this.type].color;
      const pulse = 10 + Math.sin(this.t * 0.18) * 5;
      neonRect(ctx, x + 2, y + 2, 8, 8, col, pulse);
      ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = "#ffffff";
      ctx.fillRect(Math.round(x + 5), Math.round(y + 4), 2, 4);
      ctx.fillRect(Math.round(x + 4), Math.round(y + 5), 4, 2);
      ctx.restore();
    }
  }
}

// Per-kind boss stats. The first four have bespoke AI; the Region 2-6 lieutenants
// reuse those AIs (mapped in Enemy/Boss update switch) under their own name/stats,
// so the world grows without new AI code. Region scaling comes from per-region muls.
const BOSS_DEFS = {
  prism:      { name: "PRISM SENTINEL", hp: 40,  w: 32, h: 32, color: "#6cc3ff", touch: 10, gold: 200,  exp: 600 },
  burrower:   { name: "HOLLOW MAW",     hp: 46,  w: 38, h: 26, color: "#ffae5c", touch: 12, gold: 260,  exp: 850 },
  cinder:     { name: "CINDERBRUTE",    hp: 56,  w: 38, h: 38, color: "#ff5a3c", touch: 12, gold: 320,  exp: 1100 },
  lich:       { name: "STORM LICH",     hp: 70,  w: 40, h: 38, color: "#ff2e88", touch: 12, gold: 500,  exp: 2200 },
  // Region 2-6 lieutenants of the Hollow Crown (reuse AI by kind below)
  tide:       { name: "TIDE WARDEN",    hp: 60,  w: 40, h: 34, color: "#3fd0ff", touch: 12, gold: 380,  exp: 1300 },
  pendulum:   { name: "PENDULUM KING",  hp: 66,  w: 36, h: 40, color: "#b38cff", touch: 12, gold: 440,  exp: 1600 },
  roc:        { name: "ROC OF STORMS",  hp: 74,  w: 44, h: 36, color: "#ffd24a", touch: 13, gold: 520,  exp: 2000 },
  nullengine: { name: "NULL ENGINE",    hp: 82,  w: 42, h: 42, color: "#7cffe0", touch: 13, gold: 600,  exp: 2500 },
  crown:      { name: "HOLLOW CROWN",   hp: 120, w: 46, h: 44, color: "#ff2e88", touch: 14, gold: 1200, exp: 5000 },
};

class Boss {
  constructor(kind, x, y, opts = {}) {
    const d = BOSS_DEFS[kind] || BOSS_DEFS.lich;
    this.kind = kind; this.def = d; this.name = opts.name || d.name;
    this.x = x; this.y = y; this.w = d.w; this.h = d.h;
    this.baseX = x; this.baseY = y; this.groundY = y;
    this.hp = d.hp; this.maxHp = d.hp;
    this.dead = false; this.active = false;
    this.flash = 0; this.t = 0; this.dir = -1; this.vy = 0;
    this.shootCd = 90; this.attackCd = 100; this.windup = 0;
    this.touch = d.touch; this.gold = d.gold; this.exp = d.exp;
    // per-region scaling (mirrors Enemy; muls default to 1 in Region 0 so no change)
    if (opts.hpMul) { this.hp = Math.max(1, Math.round(this.hp * opts.hpMul)); this.maxHp = this.hp; }
    if (opts.touchMul) this.touch = Math.max(1, Math.round(this.touch * Math.min(2.5, opts.touchMul))); // §9 no-one-shot ceiling
    if (opts.rewardMul) { this.gold = Math.round(this.gold * opts.rewardMul); this.exp = Math.round(this.exp * opts.rewardMul); }
    this.summonHpMul = opts.hpMul || 1; this.summonTouchMul = opts.touchMul || 1; // scaled Lich summons (6.3)
    this.drops = opts.drops || null;
    this.dropsKey = !!opts.dropsKey; // a secondary key drop alongside an ability reward
    this.final = !!opts.final;
    this.arena = opts.arena || null; // {x0,x1,y0,y1} in pixels
    this.lock = opts.lock || [];     // [{c,r}] cells to seal while alive
    this.pendingShots = [];
    this.pendingSummons = [];
    // per-kind state
    this.mode = "up"; this.modeT = 0; this.shielded = false;
  }

  invulnerable() {
    if ((this.kind === "prism" || this.kind === "pendulum") && this.shielded) return true;     // shield phase
    if ((this.kind === "burrower" || this.kind === "tide") && this.mode === "down") return true; // submerged
    return false;
  }

  hurt(dmg) {
    if (this.flash > 3) return;            // 1 hit per melee swing
    if (this.invulnerable()) { this.flash = 6; return; } // clink, no damage
    this.hp -= dmg;
    this.flash = 8;
    if (this.hp <= 0) this.dead = true;
  }

  inArena(player) {
    const a = this.arena;
    if (!a) return Math.abs(player.x - this.x) < 220 && Math.abs(player.y - this.y) < 170;
    const px = player.x + player.w / 2, py = player.y + player.h / 2;
    return px >= a.x0 && px <= a.x1 && py >= a.y0 && py <= a.y1;
  }

  fanShot(player, n, spread, sp, dmg, color, opts) {
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const base = Math.atan2((player.y + 6) - cy, (player.x + 6) - cx);
    for (let k = -(n - 1) / 2; k <= (n - 1) / 2; k++) {
      const a = base + k * spread;
      this.pendingShots.push(new EnemyShot(cx - 4, cy - 4, Math.cos(a) * sp, Math.sin(a) * sp, dmg, color, opts));
    }
  }

  update(level, player) {
    this.t++;
    this.pendingShots.length = 0;
    this.pendingSummons.length = 0;
    if (this.flash > 0) this.flash--;
    if (!this.active) {
      if (this.inArena(player)) this.active = true;
      else return;
    }
    switch (this.kind) {
      case "prism":      this.updatePrism(player); break;
      case "burrower":   this.updateBurrower(level, player); break;
      case "cinder":     this.updateCinder(level, player); break;
      // Region 2-6 lieutenants reuse the bespoke AIs above
      case "tide":       this.updateBurrower(level, player); break;
      case "pendulum":   this.updatePrism(player); break;
      case "roc":        this.updateLich(player); break;
      case "nullengine": this.updateCinder(level, player); break;
      default:           this.updateLich(player); break; // lich, crown
    }
  }

  // PRISM SENTINEL — a multi-phase fight: a crystal SHIELD (invuln, telegraphed by
  // the bubble — you must hold fire and wait it out), aimed ricochet bolts, a
  // telegraphed radial NOVA you have to dodge, and an ENRAGE phase (faster, 5-way
  // bolts, summons crystal-shard adds) below half HP.
  updatePrism(player) {
    const enraged = this.hp <= this.maxHp / 2;
    this.x = this.baseX + Math.sin(this.t * (enraged ? 0.034 : 0.02)) * 64;
    this.y = this.baseY + Math.sin(this.t * 0.05) * 12;
    this.dir = (player.x > this.x) ? 1 : -1;
    this.shielded = (this.t % (enraged ? 300 : 360)) < (enraged ? 80 : 120);

    // telegraphed crystal NOVA — wind up with a flash, then a radial burst
    if (this.windup > 0) {
      this.flash = 4;
      if (--this.windup === 0) {
        const n = enraged ? 12 : 8, cx = this.x + this.w / 2, cy = this.y + this.h / 2;
        for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; this.pendingShots.push(new EnemyShot(cx - 4, cy - 4, Math.cos(a) * 3.4, Math.sin(a) * 3.4, 9, "#bfeaff", { life: 160 })); }
      }
      return; // committed to the nova
    }
    if (this.shielded) return; // shield up: invulnerable, no attacks

    if (--this.shootCd <= 0) {
      this.shootCd = 90; // one volley every 1.5 seconds
      const rr = Math.random();
      const n = rr < 0.5 ? 1 : (rr < 0.85 ? 2 : 3); // 50% one-shot, 35% two-shot, 15% three-shot
      this.fanShot(player, n, 0.5, 3.2, 7, "#6cc3ff", { bounce: 2, life: 200 });
    }
    if (--this.attackCd <= 0) { this.attackCd = enraged ? 260 : 360; this.windup = 34; this.flash = 34; } // start a nova telegraph
    if (enraged && this.t % 300 === 0) this.pendingSummons.push({ type: "flyer", x: this.x, y: this.y - 10 }); // crystal-shard adds
  }

  // HOLLOW MAW — surfaces (vulnerable) then burrows (invuln) to the player and erupts
  updateBurrower(level, player) {
    this.modeT++;
    if (this.mode === "up") {
      this.y = this.groundY + Math.sin(this.t * 0.08) * 3;
      if (this.modeT > 150) { this.mode = "down"; this.modeT = 0; }
    } else { // down: chase under the floor, invulnerable
      const tx = player.x - this.w / 2;
      this.x += Math.sign(tx - this.x) * 1.6;
      this.y = this.groundY + 30;               // hidden below
      if (this.modeT > 90) {                    // erupt!
        this.mode = "up"; this.modeT = 0; this.y = this.groundY;
        this.fanShot(player, 3, 0.4, 3.2, 9, "#ffae5c");
      }
    }
    this.dir = (player.x > this.x) ? 1 : -1;
  }

  // CINDERBRUTE — stomps the floor (ground-hugging shockwave) + lobs arcing fire
  updateCinder(level, player) {
    this.vy = Math.min(this.vy + 0.4, 8);       // gravity
    this.y += this.vy;
    if (level.isGroundPx(this.x + 4, this.y + this.h) || level.isGroundPx(this.x + this.w - 4, this.y + this.h)) {
      this.y = Math.floor((this.y + this.h) / TILE) * TILE - this.h; this.vy = 0;
    }
    this.dir = (player.x > this.x) ? 1 : -1;
    this.x += this.dir * 0.5;                    // lumbers toward the player
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    if (--this.attackCd <= 0) {
      this.attackCd = 150;
      // ground-pound shockwave: two shots skimming the floor both ways
      const fy = this.y + this.h - 8;
      this.pendingShots.push(new EnemyShot(cx, fy, 3.2, 0, 9, "#ff5a3c"));
      this.pendingShots.push(new EnemyShot(cx, fy, -3.2, 0, 9, "#ff5a3c"));
    }
    if (--this.shootCd <= 0) {
      this.shootCd = 95;
      const dx = (player.x - cx) / 70;
      this.pendingShots.push(new EnemyShot(cx, cy, dx * 2.2, -4.5, 8, "#ff9f4a", { gravity: 0.18, life: 240 }));
    }
  }

  // STORM LICH (final) — spread shots; below half HP it enrages + summons bats
  updateLich(player) {
    this.x = this.baseX + Math.sin(this.t * 0.02) * 70;
    this.y = this.baseY + Math.sin(this.t * 0.05) * 16;
    this.dir = (player.x > this.x) ? 1 : -1;
    const enraged = this.hp <= this.maxHp / 2;
    if (--this.shootCd <= 0) {
      this.shootCd = enraged ? 56 : 78;
      this.fanShot(player, enraged ? 5 : 3, 0.26, 2.9, 8, "#ff5cf0");
    }
    if (enraged && this.t % 240 === 0) {        // summon adds
      this.pendingSummons.push({ type: "flyer", x: this.x, y: this.y - 8 });
    }
  }

  draw(ctx, cam) {
    const burrowed = this.kind === "burrower" && this.mode === "down";
    const key = (typeof BOSS_SPRITES !== "undefined") && BOSS_SPRITES[this.kind];
    const img = key && Assets.get(key);
    // Illustrated boss art for every kind (neon fallback below). Skip while the
    // burrower is submerged so only its churning mound shows.
    if (img && !burrowed) {
      const cx = this.x + this.w / 2 - cam.x;
      const dispH = this.h * 2.4;
      const footY = (this.y + this.h / 2 - cam.y) + dispH / 2;
      drawSprite(ctx, img, cx, footY, dispH, this.dir > 0, this.flash > 0);
      // keep the prism's shield bubble as an overlay on the sprite
      if (this.kind === "prism" && this.shielded) {
        const sx = this.x - cam.x, sy = this.y - cam.y;
        const r = this.w / 2 + 5 + Math.sin(this.t * 0.3) * 2;
        neonStroke(ctx, sx + this.w / 2 - r, sy + this.h / 2 - r, r * 2, r * 2, "#bfeaff", 14, 2);
      }
      return;
    }

    const x = this.x - cam.x, y = this.y - cam.y;
    const col = this.flash > 0 ? "#ffffff" : this.def.color;
    if (burrowed) {
      // just a churning mound at the surface
      neonRect(ctx, x, this.groundY - cam.y - 3, this.w, 4, col, 8);
      return;
    }
    const pulse = 12 + Math.sin(this.t * 0.12) * 6;
    neonRect(ctx, x, y, this.w, this.h, col, pulse);
    neonStroke(ctx, x, y, this.w, this.h, COLORS.gold, 8);
    // eye
    ctx.fillStyle = "#10040c";
    ctx.fillRect(Math.round(x + this.w / 2 - 6), Math.round(y + 10), 12, 8);
    neonRect(ctx, x + this.w / 2 - 3, y + 12, 6, 4, "#fff", 10);
    // shield bubble for the prism
    if (this.kind === "prism" && this.shielded) {
      const r = this.w / 2 + 5 + Math.sin(this.t * 0.3) * 2;
      neonStroke(ctx, x + this.w / 2 - r, y + this.h / 2 - r, r * 2, r * 2, "#bfeaff", 14, 2);
    }
  }

  get box() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
}
