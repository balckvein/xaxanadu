// player.js — the hero. Walk, jump, climb ladders, melee + magic.

class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 12; this.h = 14;
    this.vx = 0; this.vy = 0;
    this.dir = 1;
    this.onGround = false;
    this.climbing = false;

    // RPG stats (Faxanadu-style)
    this.hp = 16; this.hpMax = 16;
    this.mp = 12; this.mpMax = 12;
    this.exp = 0; this.gold = 0;
    this.keys = 0;
    this.magicCost = 3;

    // timers
    this.attack = 0;      // frames remaining of swing
    this.attackCd = 0;    // cooldown between swings
    this.invuln = 0;      // i-frames after taking a hit
    this.regen = 0;       // slow MP regen ticker

    // intents consumed by the game loop each frame
    this.pendingProjectile = null;
    this.attackBox = null;
    this.dead = false;
  }

  // movement constants
  get MAXSPD() { return 2.2; }

  takeHit(dmg) {
    if (this.invuln > 0) return;
    this.hp -= dmg;
    this.invuln = 60;
    this.vy = -3; // small knock-up
    this.vx = -this.dir * 3;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }

  addExp(n) { this.exp += n; }
  heal(n) { this.hp = Math.min(this.hpMax, this.hp + n); }

  isSolid(level, px, py) { return level.isSolidPx(px, py); }

  update(level) {
    this.pendingProjectile = null;
    this.attackBox = null;
    if (this.invuln > 0) this.invuln--;
    if (this.attack > 0) this.attack--;
    if (this.attackCd > 0) this.attackCd--;

    // slow magic regen
    if (++this.regen >= 40 && this.mp < this.mpMax) { this.mp++; this.regen = 0; }

    const onLadder = level.isLadderPx(this.x + this.w / 2, this.y + this.h / 2) ||
                     level.isLadderPx(this.x + this.w / 2, this.y + this.h - 1);

    // ---- climbing ----
    if (this.climbing) {
      this.vx = 0; this.vy = 0;
      if (Input.held.up)   this.y -= 1.8;
      if (Input.held.down) this.y += 1.8;
      // small horizontal nudging while on a ladder
      if (Input.held.left)  { this.x -= 1.2; this.dir = -1; }
      if (Input.held.right) { this.x += 1.2; this.dir = 1; }
      if (!onLadder) this.climbing = false;
      if (Input.justPressed("jump")) { this.climbing = false; this.vy = -6; }
    } else {
      // enter a ladder by pressing up/down while overlapping one
      if (onLadder && (Input.held.up || Input.held.down)) {
        this.climbing = true; this.vx = 0; this.vy = 0;
      } else {
        // ---- horizontal ----
        let move = 0;
        if (Input.held.left)  { move -= 1; this.dir = -1; }
        if (Input.held.right) { move += 1; this.dir = 1; }
        this.vx = move * this.MAXSPD;

        // ---- jump / gravity ----
        if (Input.justPressed("jump") && this.onGround) { this.vy = -8.2; this.onGround = false; }
        this.vy = Math.min(this.vy + 0.5, 9);

        this.moveX(level, this.vx);
        this.moveY(level, this.vy);
      }
    }

    // ---- attack ----
    if (Input.justPressed("attack") && this.attackCd === 0) {
      this.attack = 12; this.attackCd = 18;
    }
    if (this.attack > 6) { // active hitbox only during the first part of the swing
      const reach = 16;
      this.attackBox = {
        x: this.dir > 0 ? this.x + this.w : this.x - reach,
        y: this.y - 1, w: reach, h: this.h + 2, dmg: 2,
      };
    }

    // ---- magic ----
    if (Input.justPressed("magic") && this.mp >= this.magicCost && this.attack === 0) {
      this.mp -= this.magicCost;
      const px = this.dir > 0 ? this.x + this.w : this.x - 8;
      this.pendingProjectile = new Projectile(px, this.y + 5, this.dir);
    }
  }

  moveX(level, dx) {
    if (dx === 0) return;
    let nx = this.x + dx;
    const top = this.y + 2, bot = this.y + this.h - 2, mid = this.y + this.h / 2;
    if (dx > 0) {
      const edge = nx + this.w;
      if (this.isSolid(level, edge, top) || this.isSolid(level, edge, mid) || this.isSolid(level, edge, bot)) {
        nx = Math.floor((edge) / TILE) * TILE - this.w - 0.01; this.vx = 0;
      }
    } else {
      const edge = nx;
      if (this.isSolid(level, edge, top) || this.isSolid(level, edge, mid) || this.isSolid(level, edge, bot)) {
        nx = Math.floor(edge / TILE) * TILE + TILE; this.vx = 0;
      }
    }
    this.x = nx;
  }

  moveY(level, dy) {
    if (dy === 0) return;
    let ny = this.y + dy;
    const left = this.x + 2, right = this.x + this.w - 2;
    if (dy > 0) {
      const edge = ny + this.h;
      if (this.isSolid(level, left, edge) || this.isSolid(level, right, edge)) {
        ny = Math.floor(edge / TILE) * TILE - this.h - 0.01; this.vy = 0; this.onGround = true;
      } else this.onGround = false;
    } else {
      const edge = ny;
      if (this.isSolid(level, left, edge) || this.isSolid(level, right, edge)) {
        ny = Math.floor(edge / TILE) * TILE + TILE; this.vy = 0;
      }
    }
    this.y = ny;
  }

  get box() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  draw(ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y;
    // flicker while invulnerable
    if (this.invuln > 0 && Math.floor(this.invuln / 4) % 2 === 0) return;

    neonRect(ctx, x, y, this.w, this.h, COLORS.player, 12);
    neonRect(ctx, x + 2, y + 2, this.w - 4, 3, COLORS.playerHi, 6);
    // facing eye
    ctx.fillStyle = "#04222b";
    const ex = this.dir > 0 ? x + this.w - 4 : x + 2;
    ctx.fillRect(Math.round(ex), Math.round(y + 5), 2, 3);

    // sword swing
    if (this.attack > 6) {
      const reach = 16;
      const sx = this.dir > 0 ? x + this.w : x - reach;
      neonRect(ctx, sx, y + 3, reach, 3, COLORS.playerHi, 14);
    }
  }
}
