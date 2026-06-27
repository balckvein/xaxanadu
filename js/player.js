// player.js — the hero. Walk, jump, climb ladders, melee + magic.
// The player is rendered as the neon BLOCK hero (see draw()).

class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 12; this.h = 14;
    this.vx = 0; this.vy = 0;
    this.dir = 1;
    this.onGround = false;
    this.climbing = false;

    // momentum (Faxanadu-style: build to max speed, reset on stop / melee hit)
    this.baseSpeed = 0.9;
    this.maxSpeed = 2.4;
    this.accel = 0.09;
    this.speed = this.baseSpeed;

    // jumping (double jump + forgiving coyote time & input buffer)
    this.maxJumps = 2;
    this.jumps = 0;
    this.coyote = 0;   // frames of grace after leaving ground
    this.jumpBuf = 0;  // frames a jump press stays queued
    this.animT = 0;    // animation clock
    this.dashTimer = 0; // frames of an active dash (ability)
    this.dashUsed = false; // one air-dash per airtime
    this.lastWallSide = 0; // side of the last wall-jump (-1/1); blocks same-wall re-climb

    // RPG stats (Faxanadu-style)
    this.hp = 16; this.hpMax = 16;
    this.mp = 12; this.mpMax = 12;
    this.exp = 0; this.gold = 0;
    this.keys = 0;
    this.weaponTier = 0; // index into WEAPONS
    this.armorTier = 0;  // index into ARMORS
    this.magicTier = 0;  // index into MAGICS
    this.buffs = { haste: 0, shield: 0, power: 0 }; // timed power-up frames

    // Metroidvania kit (Section 5 of the handoff): abilities/vehicles/materials,
    // and the movement-mode state they drive. All persisted via the save (4.7).
    this.abilities = {};            // flag -> true (canClimb, canDash, canInvert, ...)
    this.vehicles = new Set();      // "boat" | "bird"
    this.materials = {};            // mat id -> count
    this.templates = new Set();     // craft templates owned
    this.vehicle = null;            // active vehicle movement mode (null on foot)
    this.gravSign = 1;              // 1 = normal gravity, -1 = inverted (grav-flip)
    this.flyMeter = 0;              // metered flight (flying shoes)

    // timers
    this.attack = 0;      // frames remaining of swing
    this.attackCd = 0;    // cooldown between swings
    this.invuln = 0;      // i-frames after taking a hit
    this.regen = 0;       // MP regen ticker
    this.regenLock = 0;   // frames of paused regen right after a cast (spam penalty)
    this.elixirs = 0;     // stocked Elixirs (used mid-fight for an emergency heal)

    // intents consumed by the game loop each frame
    this.pendingProjectile = null;
    this.attackBox = null;
    this.dead = false;
  }

  // equipment-derived combat values (power buff doubles damage output)
  get meleeDmg()    { return WEAPONS[this.weaponTier].dmg * (this.buffs.power > 0 ? 2 : 1); }
  get armorReduce() { return ARMORS[this.armorTier].reduce; }
  get magicCost()   { return MAGICS[this.magicTier].cost; }
  get magic()       { return MAGICS[this.magicTier]; }
  get speedCap()    { return this.buffs.haste > 0 ? this.maxSpeed * 1.6 : this.maxSpeed; }
  resetSpeed()      { this.speed = this.baseSpeed; }
  // higher rank = bigger HP/MP pools (derived from rank index)
  applyRank(idx)    { this.hpMax = 16 + idx * 3; this.mpMax = 12 + idx * 2; }
  addBuff(kind, frames) { this.buffs[kind] = Math.max(this.buffs[kind] || 0, frames); }

  takeHit(dmg) {
    if (this.buffs.shield > 0) return false; // temporary invincibility
    if (this.invuln > 0) return false;
    this.hp -= Math.max(1, dmg - this.armorReduce); // armor softens hits
    this.invuln = 60;
    this.vy = -3; // small knock-up
    this.vx = -this.dir * 3;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return true;
  }

  addExp(n) { this.exp += n; }
  heal(n) { this.hp = Math.min(this.hpMax, this.hp + n); }

  isSolid(level, px, py) { return level.isSolidPx(px, py); }

  update(level) {
    this.pendingProjectile = null;
    this.attackBox = null;
    this.animT++;
    for (const k in this.buffs) if (this.buffs[k] > 0) this.buffs[k]--;
    if (this.invuln > 0) this.invuln--;
    if (this.attack > 0) this.attack--;
    if (this.attackCd > 0) this.attackCd--;

    // magic regen: fast while RESTING, but PAUSED right after a cast — so spamming
    // shots starves your MP, and holding fire lets it refill quickly.
    if (this.regenLock > 0) this.regenLock--;
    else if (++this.regen >= 12 && this.mp < this.mpMax) { this.mp++; this.regen = 0; }

    const cx = this.x + this.w / 2;
    const CLIMB = 1.6;

    // grav-flip (ability): flip gravity from a stable footing; inert until granted
    if (Input.justPressed("invert") && this.abilities.canInvert && this.onGround && !this.vehicle) {
      this.gravSign *= -1; this.vy = 0; this.onGround = false; SFX.djump();
    }

    if (this.vehicle === "bird") {
      // ---- airborne mount: free flight, gravity suspended ----
      this.climbing = false;
      this.updateFlight(level);
    } else if (this.climbing) {
      // ---- on a ladder ----
      this.vx = 0; this.vy = 0;
      // left/right re-aims (without leaving the ladder) so you can attack/cast both ways
      if (Input.held.left)  this.dir = -1;
      if (Input.held.right) this.dir = 1;
      let cy = 0;
      if (Input.held.up)   cy -= CLIMB;
      if (Input.held.down) cy += CLIMB;

      // descending onto the floor below -> step off and stand
      if (cy > 0 && (level.isSolidPx(this.x + 2, this.y + this.h + 1) ||
                     level.isSolidPx(this.x + this.w - 2, this.y + this.h + 1))) {
        this.y = Math.floor((this.y + this.h + 1) / TILE) * TILE - this.h;
        this.climbing = false; this.onGround = true;
      } else {
        this.y += cy;
        const stillOn = level.isClimbablePx(cx, this.y + 3) ||
                        level.isClimbablePx(cx, this.y + this.h / 2) ||
                        level.isClimbablePx(cx, this.y + this.h - 3);
        if (!stillOn) {
          // climbed past the top rung -> snap onto the ladder-top surface
          if (cy < 0) { this.y = Math.round((this.y + this.h) / TILE) * TILE - this.h; this.onGround = true; }
          this.climbing = false;
        }
      }
      if (Input.justPressed("jump")) { this.climbing = false; this.vy = -5 * this.gravSign; }
    } else {
      // ladder overlapping the body (for climbing up) or directly below (down)
      const onLadderBody = level.isClimbablePx(cx, this.y + 4) ||
                           level.isClimbablePx(cx, this.y + this.h / 2) ||
                           level.isClimbablePx(cx, this.y + this.h - 4);
      const ladderBelow  = level.isClimbablePx(cx, this.y + this.h + 3);

      if (this.gravSign === 1 && onLadderBody && Input.held.up) {
        this.startClimb(cx);
      } else if (this.gravSign === 1 && ladderBelow && Input.held.down) {
        this.startClimb(cx);
        this.y += 3; // detach downward through the walkable ladder-top
      } else {
        if (this.onGround) { this.jumps = 0; this.coyote = 6; this.dashUsed = false; this.lastWallSide = 0; }
        else if (this.coyote > 0) this.coyote--;

        // ---- dash (ability-gated): explicit dx, 2 sub-steps (<TILE/2) so it can't tunnel ----
        if (Input.justPressed("dash") && this.abilities.canDash && !this.dashUsed && this.dashTimer <= 0) {
          this.dashTimer = 10; this.dashUsed = true; SFX.djump();
        }
        if (this.dashTimer > 0) {
          this.dashTimer--;
          this.vx = 0; this.vy = 0;
          const dashDx = this.dir * 7;
          this.moveX(level, dashDx / 2);
          this.moveX(level, dashDx / 2);
        } else {
          // ---- wall-cling (ability): hug a wall in mid-air to slow the fall + wall-jump ----
          const midY = this.y + this.h / 2;
          let wallDir = 0;
          if (this.abilities.canClimb && !this.onGround) {
            if (Input.held.left && this.isSolid(level, this.x - 1, midY)) wallDir = -1;
            else if (Input.held.right && this.isSolid(level, this.x + this.w + 1, midY)) wallDir = 1;
          }

          // ---- horizontal (momentum: accelerate while moving, reset on stop) ----
          let move = 0;
          if (Input.held.left)  { move -= 1; this.dir = -1; }
          if (Input.held.right) { move += 1; this.dir = 1; }
          if (move !== 0) this.speed = Math.min(this.speedCap, this.speed + this.accel);
          else            this.speed = this.baseSpeed;
          this.vx = move * this.speed;

          // ---- jump (wall-jump off a clung wall; else fixed-height double jump) ----
          if (Input.justPressed("jump")) this.jumpBuf = 6;
          else if (this.jumpBuf > 0) this.jumpBuf--;

          const g = this.gravSign;
          const groundJump = (this.onGround || this.coyote > 0) && this.jumps === 0;
          // Wall-jump only off a DIFFERENT wall than the last leap: a two-wall
          // shaft alternates upward (the intended traversal), but one flat wall
          // can't be scaled forever (the gating exploit).
          if (this.jumpBuf > 0 && wallDir !== 0 && wallDir !== this.lastWallSide) {
            this.vy = -6.4 * g; this.vx = -wallDir * 3.5; this.dir = -wallDir;
            this.jumpBuf = 0; this.jumps = 1; this.lastWallSide = wallDir; SFX.jump();
          } else if (this.jumpBuf > 0 && (groundJump || this.jumps < this.maxJumps)) {
            this.vy = -6.4 * g; this.onGround = false; this.coyote = 0; this.jumpBuf = 0;
            this.jumps = groundJump ? 1 : this.jumps + 1;
            SFX[this.jumps >= 2 ? "djump" : "jump"]();
          }

          // ---- gravity: clinging slows the slide; hold UP only HANGS (no free
          //      ascent — climbing is via alternating wall-jumps); grav-flip
          //      reverses the pull ----
          if (wallDir !== 0 && this.vy > 0 && g > 0) {
            this.vy = Input.held.up ? 0 : (Input.held.down ? 1.6 : 0.3);
          } else {
            this.vy += 0.5 * g;
            this.vy = g > 0 ? Math.min(this.vy, 9) : Math.max(this.vy, -9);
          }

          this.moveX(level, this.vx);
          this.moveY(level, this.vy);
        }
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
        y: this.y - 1, w: reach, h: this.h + 2, dmg: this.meleeDmg,
      };
    }

    // ---- magic ----
    if (Input.justPressed("magic") && this.mp >= this.magicCost && this.attack === 0) {
      const m = this.magic;
      this.mp -= m.cost;
      this.regenLock = 75; // casting pauses MP regen for ~1.25s (spam penalty)
      const px = this.dir > 0 ? this.x + this.w : this.x - m.size;
      this.pendingProjectile = new Projectile(px, this.y + 5, this.dir, m);
      if (this.buffs.power > 0) this.pendingProjectile.dmg *= 2;
      SFX.magic();
    }
  }

  startClimb(cx) {
    const col = Math.floor(cx / TILE);
    this.climbing = true;
    this.vx = 0; this.vy = 0;
    this.lastWallSide = 0; // a ladder is a fresh anchor: re-arm wall-jumps off either side
    this.x = col * TILE + (TILE - this.w) / 2; // align to the ladder
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

  // Vertical move with collision. gravSign generalizes "down": with normal
  // gravity (g=1) the feet edge lands; inverted (g=-1) the head edge lands on a
  // ceiling, which becomes the standing surface. A boat additionally floats on
  // the water surface (only meaningful with normal gravity).
  moveY(level, dy) {
    if (dy === 0) return;
    const g = this.gravSign;
    let ny = this.y + dy;
    const left = this.x + 2, right = this.x + this.w - 2;
    if (dy > 0) {
      const edge = ny + this.h;
      const boatFloor = this.vehicle === "boat" && g > 0 &&
                        (this.isBoatSurface(level, left, edge) || this.isBoatSurface(level, right, edge));
      if (this.isSolid(level, left, edge) || this.isSolid(level, right, edge) || boatFloor) {
        ny = Math.floor(edge / TILE) * TILE - this.h - 0.01; this.vy = 0;
        if (g > 0) this.onGround = true; // a floor below only grounds normal gravity
      } else if (g > 0) {
        // one-way ladder-top: land on it when dropping from above (not climbing down)
        const cx = this.x + this.w / 2;
        const tileTop = Math.floor(edge / TILE) * TILE;
        const prevFeet = this.y + this.h;
        if (level.isOneWayPx(cx, edge) && !Input.held.down && prevFeet <= tileTop + 1) {
          ny = tileTop - this.h - 0.01; this.vy = 0; this.onGround = true;
        } else {
          this.onGround = false;
        }
      } else {
        this.onGround = false;
      }
    } else {
      const edge = ny;
      if (this.isSolid(level, left, edge) || this.isSolid(level, right, edge)) {
        ny = Math.floor(edge / TILE) * TILE + TILE; this.vy = 0;
        if (g < 0) this.onGround = true; // inverted gravity stands on the ceiling
      } else if (g < 0) {
        this.onGround = false;
      }
    }
    this.y = ny;
  }

  // The waterline: a water cell whose neighbor opposite gravity is open. A boat
  // rests here; on foot water is non-solid, so you fall through (a hazard).
  isBoatSurface(level, px, edgeY) {
    const c = Math.floor(px / TILE), r = Math.floor(edgeY / TILE);
    return level.isWaterCell(c, r) && !level.isWaterCell(c, r - 1);
  }

  // Bird mount: omni-directional flight. Solid tiles + sealed gates still block
  // (isSolid is unchanged), so flight grants reach over gaps/water, not no-clip.
  updateFlight(level) {
    let move = 0;
    if (Input.held.left)  { move -= 1; this.dir = -1; }
    if (Input.held.right) { move += 1; this.dir = 1; }
    this.vx = move * this.maxSpeed;
    let mvy = 0;
    if (Input.held.up)   mvy -= 2.4;
    if (Input.held.down) mvy += 2.4;
    this.vy = mvy;
    this.moveX(level, this.vx);
    this.moveY(level, this.vy);
    this.onGround = false; // a mount is never "grounded" for jump/dash purposes
  }

  get box() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  draw(ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y;

    // shield aura (drawn even during i-frame flicker)
    if (this.buffs.shield > 0) {
      const r = 12 + Math.sin(this.animT * 0.3) * 1.5;
      neonStroke(ctx, x + this.w / 2 - r, y + this.h / 2 - r, r * 2, r * 2, BUFFS.shield.color, 12, 2);
    }
    // power glow tint behind the body
    if (this.buffs.power > 0) neonRect(ctx, x - 2, y - 2, this.w + 4, this.h + 4, "rgba(255,92,240,0.10)", 14);

    // flicker while invulnerable
    if (this.invuln > 0 && Math.floor(this.invuln / 4) % 2 === 0) return;

    // the player is the neon BLOCK hero (illustrated sprite intentionally off)

    const walking = this.onGround && Math.abs(this.vx) > 0.2;
    const phase = Math.sin(this.animT * 0.35);
    // torso bobs while walking, breathes while idle
    const bob = walking ? Math.abs(phase) * 1.5 : (this.onGround ? Math.sin(this.animT * 0.08) * 0.5 : 0);
    const bodyH = this.h - 3;          // leave room for legs
    const by = y + bob;

    // legs (planted feet; alternate length while walking)
    const lc = COLORS.player;
    if (!this.onGround) {
      neonRect(ctx, x + 1, y + this.h - 4, 3, 4, lc, 8);
      neonRect(ctx, x + this.w - 4, y + this.h - 4, 3, 4, lc, 8);
    } else if (walking) {
      neonRect(ctx, x + 1, y + this.h - 3, 3, 3 + (phase > 0 ? 1 : -1), lc, 8);
      neonRect(ctx, x + this.w - 4, y + this.h - 3, 3, 3 + (phase > 0 ? -1 : 1), lc, 8);
    } else {
      neonRect(ctx, x + 1, y + this.h - 3, 3, 3, lc, 8);
      neonRect(ctx, x + this.w - 4, y + this.h - 3, 3, 3, lc, 8);
    }

    // body
    neonRect(ctx, x, by, this.w, bodyH, COLORS.player, 12);
    neonRect(ctx, x + 2, by + 2, this.w - 4, 3, COLORS.playerHi, 6);
    // facing eye
    ctx.fillStyle = "#04222b";
    const ex = this.dir > 0 ? x + this.w - 4 : x + 2;
    ctx.fillRect(Math.round(ex), Math.round(by + 5), 2, 3);

    // climbing: alternating side "arms"
    if (this.climbing) {
      neonRect(ctx, x - 1, by + 3 + (phase > 0 ? 0 : 3), 3, 3, COLORS.playerHi, 8);
      neonRect(ctx, x + this.w - 2, by + 3 + (phase > 0 ? 3 : 0), 3, 3, COLORS.playerHi, 8);
    }

    // sword swing (slashes through an arc over the active frames)
    if (this.attack > 6) {
      const reach = 16;
      const sx = this.dir > 0 ? x + this.w : x - reach;
      const sy = by + 1 + (this.attack - 9) * 1.5; // sweeps downward
      neonRect(ctx, sx, sy, reach, 3, COLORS.playerHi, 14);
    }
  }
}
