// game.js — wires the world together: spawns from level data, runs the
// fixed-timestep update, resolves combat/pickups, drives the smooth camera.

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.cam = { x: 0, y: 0 };
    this.msg = "";
    this.msgTimer = 0;
    this.won = false;
    this.reset();
  }

  reset() {
    this.level = new Level();
    const L = this.level;
    this.player = new Player(L.playerSpawn.c * TILE + 2, L.playerSpawn.r * TILE - 14);

    this.enemies = L.enemies.map((e) => new Enemy(e.type, e.c * TILE, e.r * TILE + 2));
    this.pickups = L.pickups.map((p) => new Pickup(p.type, p.c * TILE + 2, p.r * TILE + 2));
    this.pickups.push(new Pickup("key", L.keyAt.c * TILE + 2, L.keyAt.r * TILE + 2));
    this.projectiles = [];
    this.goalBox = { x: L.goal.c * TILE, y: L.goal.r * TILE - 12, w: 12, h: 24 };
    this.won = false;
    this.flash(""); // clear
  }

  flash(text, frames = 120) { this.msg = text; this.msgTimer = frames; }

  update() {
    if (this.won) {
      if (Input.justPressed("use")) this.reset();
      Input.endFrame();
      return;
    }

    const L = this.level, p = this.player;
    p.update(L);

    if (p.pendingProjectile) this.projectiles.push(p.pendingProjectile);

    // enemies
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.update(L);
      // contact damage
      if (aabb(p.box, e)) p.takeHit(e.touch);
      // melee
      if (p.attackBox && aabb(p.attackBox, e)) {
        e.hurt(p.attackBox.dmg);
        if (e.dead) this.onEnemyDeath(e);
      }
    }

    // projectiles vs enemies / walls
    for (const pr of this.projectiles) {
      pr.update(L);
      for (const e of this.enemies) {
        if (!e.dead && aabb(pr, e)) {
          e.hurt(pr.dmg); pr.dead = true;
          if (e.dead) this.onEnemyDeath(e);
        }
      }
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);

    // pickups
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      pk.update();
      if (aabb(p.box, pk)) {
        pk.dead = true;
        if (pk.type === "gold") { p.gold += 15; }
        else if (pk.type === "bread") { p.heal(8); this.flash("+8 HP"); }
        else if (pk.type === "key") { p.keys++; this.flash("Got a KEY — open the door up top"); }
      }
    }
    this.pickups = this.pickups.filter((pk) => !pk.dead);

    // door interaction: stand next to it with a key and press Use
    this.handleDoor();

    // goal
    if (this.level.doorOpen && aabb(p.box, this.goalBox)) this.win();

    // death -> respawn (lose some gold, Faxanadu-style continue feel)
    if (p.dead) {
      this.flash("You fell. Continue!");
      const keptExp = p.exp, keptGold = Math.floor(p.gold * 0.7);
      this.reset();
      this.player.exp = keptExp;
      this.player.gold = keptGold;
    }

    // smooth camera follow, clamped to level bounds
    this.updateCamera();

    if (this.msgTimer > 0) this.msgTimer--; else this.msg = "";
    Input.endFrame();
  }

  handleDoor() {
    const p = this.player, L = this.level;
    if (L.doorOpen) return;
    const dc = L.doorCells[0];
    const near = Math.abs((p.x + p.w / 2) - (dc.c * TILE + TILE / 2)) < 28 &&
                 Math.abs((p.y + p.h / 2) - (dc.r * TILE + TILE)) < 40;
    if (near) {
      if (p.keys > 0) {
        this.flash("Press ENTER to unlock", 30);
        if (Input.justPressed("use")) { p.keys--; L.openDoor(); this.flash("The door opens..."); }
      } else {
        this.flash("Locked — you need a KEY", 30);
      }
    }
  }

  onEnemyDeath(e) {
    this.player.gold += e.gold;
    this.player.addExp(e.exp);
  }

  win() {
    this.won = true;
    this.flash("YOU REACHED THE SUMMIT — press ENTER to play again", 99999);
  }

  updateCamera() {
    const p = this.player, W = this.canvas.width, H = this.canvas.height;
    const targetX = p.x + p.w / 2 - W / 2;
    const targetY = p.y + p.h / 2 - H / 2;
    // ease toward target for a soft scroll
    this.cam.x += (targetX - this.cam.x) * 0.12;
    this.cam.y += (targetY - this.cam.y) * 0.12;
    this.cam.x = clamp(this.cam.x, 0, this.level.pixelW - W);
    this.cam.y = clamp(this.cam.y, 0, this.level.pixelH - H);
  }

  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    // background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);
    this.drawParallax();

    this.level.draw(ctx, this.cam);
    for (const pk of this.pickups) pk.draw(ctx, this.cam);
    for (const e of this.enemies) if (!e.dead) e.draw(ctx, this.cam);
    for (const pr of this.projectiles) pr.draw(ctx, this.cam);

    // goal flag (only meaningful once door is open, but draw faintly always)
    const g = this.goalBox;
    neonRect(ctx, g.x - this.cam.x, g.y - this.cam.y, 3, g.h, COLORS.bread, 12);
    neonRect(ctx, g.x - this.cam.x + 3, g.y - this.cam.y, 10, 7, COLORS.bread, 12);

    this.player.draw(ctx, this.cam);
    HUD.draw(ctx, this.player, this.msgTimer > 0 ? this.msg : "");
  }

  // cheap layered starfield/grid for depth (parallax with camera)
  drawParallax() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.save();
    ctx.strokeStyle = "rgba(58,109,240,0.06)";
    ctx.lineWidth = 1;
    const ox = -(this.cam.x * 0.3) % 32, oy = -(this.cam.y * 0.3) % 32;
    for (let x = ox; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = oy; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
  }
}
