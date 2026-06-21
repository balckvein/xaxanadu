// entities.js — enemies, projectiles, and pickups.

class Enemy {
  constructor(type, x, y) {
    this.type = type;
    this.x = x; this.y = y;
    this.w = 14; this.h = 14;
    this.vx = type === "flyer" ? 0.7 : 0.5;
    this.vy = 0;
    this.dir = -1;
    this.dead = false;
    this.flash = 0;
    this.baseY = y;
    this.t = Math.floor(x + y); // phase offset for flyer bob (no RNG needed)
    if (type === "walker") { this.hp = 3; this.touch = 8; this.gold = 12; this.exp = 20; }
    else { this.hp = 2; this.touch = 6; this.gold = 18; this.exp = 30; this.w = 16; this.h = 12; }
  }

  hurt(dmg) {
    this.hp -= dmg;
    this.flash = 8;
    if (this.hp <= 0) this.dead = true;
  }

  update(level) {
    this.t++;
    if (this.flash > 0) this.flash--;

    if (this.type === "walker") {
      // gravity
      this.vy = Math.min(this.vy + 0.4, 8);
      this.moveY(level);
      // patrol: reverse at walls or ledges
      const ahead = this.x + (this.dir < 0 ? -2 : this.w + 2);
      const footAhead = this.x + (this.dir < 0 ? 0 : this.w);
      const wall = level.isSolidPx(ahead, this.y + this.h - 2);
      const ledge = !level.isSolidPx(footAhead, this.y + this.h + 2);
      if (wall || ledge) this.dir *= -1;
      this.x += this.vx * this.dir;
    } else {
      // flyer: bob + horizontal drift, reverse at walls
      this.y = this.baseY + Math.sin(this.t * 0.06) * 18;
      const ahead = this.x + (this.dir < 0 ? -2 : this.w + 2);
      if (level.isSolidPx(ahead, this.y + this.h / 2)) this.dir *= -1;
      this.x += this.vx * this.dir;
    }
  }

  moveY(level) {
    this.y += this.vy;
    if (this.vy > 0) {
      if (level.isSolidPx(this.x + 2, this.y + this.h) || level.isSolidPx(this.x + this.w - 2, this.y + this.h)) {
        this.y = Math.floor((this.y + this.h) / TILE) * TILE - this.h;
        this.vy = 0;
      }
    }
  }

  draw(ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y;
    const col = this.flash > 0 ? "#ffffff" : (this.type === "flyer" ? COLORS.enemy2 : COLORS.enemy);
    neonRect(ctx, x, y, this.w, this.h, col, 10);
    // simple eyes for character
    ctx.fillStyle = "#1a0008";
    ctx.fillRect(Math.round(x + 3), Math.round(y + 4), 2, 2);
    ctx.fillRect(Math.round(x + this.w - 5), Math.round(y + 4), 2, 2);
  }
}

class Projectile {
  constructor(x, y, dir) {
    this.x = x; this.y = y; this.w = 8; this.h = 4;
    this.vx = 4.5 * dir;
    this.life = 70;
    this.dead = false;
    this.dmg = 2;
  }
  update(level) {
    this.x += this.vx;
    this.life--;
    if (this.life <= 0) this.dead = true;
    if (level.isSolidPx(this.x + (this.vx > 0 ? this.w : 0), this.y + this.h / 2)) this.dead = true;
  }
  draw(ctx, cam) {
    neonRect(ctx, this.x - cam.x, this.y - cam.y, this.w, this.h, COLORS.magic, 12);
  }
}

class Pickup {
  constructor(type, x, y) {
    this.type = type; // gold | bread | key
    this.x = x; this.y = y; this.w = 12; this.h = 12;
    this.dead = false;
    this.t = Math.floor(x + y);
  }
  update() { this.t++; }
  draw(ctx, cam) {
    const bob = Math.sin(this.t * 0.08) * 2;
    const x = this.x - cam.x, y = this.y - cam.y + bob;
    if (this.type === "gold") {
      neonRect(ctx, x, y, this.w, this.h, COLORS.gold, 10);
    } else if (this.type === "bread") {
      neonRect(ctx, x, y, this.w, this.h, COLORS.bread, 10);
    } else if (this.type === "key") {
      neonRect(ctx, x + 3, y, 6, this.h, COLORS.key, 12);
      neonRect(ctx, x, y + 2, 12, 4, COLORS.key, 12);
    }
  }
}
