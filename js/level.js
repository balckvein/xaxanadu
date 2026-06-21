// level.js — THE DESCENT. Instead of climbing a World Tree, you go DOWN into
// the earth: a contiguous, branching cave system carved out of solid rock.
// Deeper galleries are larger and more dangerous; a key-gated door blocks the
// deepest chamber (the Core / goal) so you must explore a side branch first.
//
// Built from data (galleries + ladder shafts) so every chamber is guaranteed
// reachable. The whole map is one tilemap — the camera scrolls smoothly over
// it (open-world, no screen flips).

class Level {
  constructor() {
    this.cols = 64;
    this.rows = 52;

    // Start as SOLID ROCK, then carve caverns out of it.
    this.grid = [];
    for (let r = 0; r < this.rows; r++) this.grid.push(new Array(this.cols).fill("#"));

    // Galleries: open chambers with a solid floor at row `r`, `h` tiles tall,
    // spanning columns c0..c1. Surrounding rock becomes walls/ceilings for free.
    const galleries = [
      { r: 8,  c0: 2,  c1: 61, h: 6 }, // S  — surface entrance (full width)
      { r: 16, c0: 2,  c1: 27, h: 5 }, // 1a — upper-left branch
      { r: 16, c0: 35, c1: 61, h: 5 }, // 1b — upper-right branch
      { r: 24, c0: 2,  c1: 24, h: 5 }, // 2a
      { r: 24, c0: 30, c1: 61, h: 5 }, // 2b
      { r: 33, c0: 5,  c1: 58, h: 6 }, // 3  — wide lower cavern (key on far left)
      { r: 43, c0: 17, c1: 47, h: 7 }, // 4  — the Core (goal), gated
    ];
    this.galleries = galleries;
    for (const g of galleries) {
      for (let rr = g.r - g.h; rr < g.r; rr++)
        for (let c = g.c0; c <= g.c1; c++) this.set(c, rr, ".");
      for (let c = g.c0; c <= g.c1; c++) this.set(c, g.r, "#"); // solid floor
    }

    // Ladder shafts: carve a column through the rock from an upper gallery's
    // floor (`to`) down into the lower gallery (`from` = lower floor row).
    const ladders = [
      { col: 8,  from: 16, to: 8  }, // S  -> 1a
      { col: 52, from: 16, to: 8  }, // S  -> 1b
      { col: 12, from: 24, to: 16 }, // 1a -> 2a
      { col: 50, from: 24, to: 16 }, // 1b -> 2b
      { col: 14, from: 33, to: 24 }, // 2a -> 3
      { col: 45, from: 33, to: 24 }, // 2b -> 3
      { col: 42, from: 43, to: 33 }, // 3  -> 4  (GATED below)
    ];
    for (const L of ladders) for (let r = L.to; r < L.from; r++) this.set(L.col, r, "H");

    // A few internal ledges for platforming interest (set after carving).
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

    // Entity metadata (col/row -> spawned by game.js).
    this.playerSpawn = { c: 5,  r: 7  }; // surface
    this.goal        = { c: 32, r: 42 }; // bottom of the Core
    this.keyAt       = { c: 8,  r: 32 }; // far-left of the wide lower cavern

    // Enemies get tougher as you descend.
    this.enemies = [
      { type: "walker", c: 20, r: 7  },
      { type: "walker", c: 10, r: 15 }, { type: "flyer", c: 20, r: 13 },
      { type: "flyer",  c: 45, r: 13 }, { type: "walker", c: 55, r: 15 },
      { type: "walker", c: 8,  r: 23 }, { type: "flyer", c: 18, r: 21 },
      { type: "walker", c: 40, r: 23 }, { type: "flyer", c: 52, r: 21 },
      { type: "walker", c: 12, r: 32 }, { type: "flyer", c: 28, r: 29 },
      { type: "walker", c: 50, r: 32 }, { type: "flyer", c: 38, r: 29 },
      { type: "flyer",  c: 24, r: 40 }, { type: "flyer", c: 40, r: 40 },
      { type: "walker", c: 32, r: 42 },
    ];

    this.pickups = [
      { type: "gold",  c: 12, r: 7  },
      { type: "gold",  c: 25, r: 15 }, { type: "bread", c: 45, r: 15 },
      { type: "gold",  c: 10, r: 23 }, { type: "gold",  c: 52, r: 23 },
      { type: "bread", c: 18, r: 23 },
      { type: "gold",  c: 20, r: 32 }, { type: "gold",  c: 50, r: 32 },
      { type: "bread", c: 30, r: 32 },
    ];

    this.pixelW = this.cols * TILE;
    this.pixelH = this.rows * TILE;
  }

  inBounds(c, r) { return c >= 0 && c < this.cols && r >= 0 && r < this.rows; }
  set(c, r, ch) { if (this.inBounds(c, r)) this.grid[r][c] = ch; }
  tileAt(c, r) { return this.inBounds(c, r) ? this.grid[r][c] : "#"; }

  isSolidPx(px, py) {
    const c = Math.floor(px / TILE), r = Math.floor(py / TILE);
    const t = this.tileAt(c, r);
    if (t === "#") return true;
    if (t === "D") return !this.doorOpen;
    return false;
  }

  isLadderPx(px, py) {
    const c = Math.floor(px / TILE), r = Math.floor(py / TILE);
    return this.tileAt(c, r) === "H";
  }

  openDoor() {
    this.doorOpen = true;
    for (const d of this.doorCells) this.set(d.c, d.r, ".");
  }

  draw(ctx, cam) {
    const c0 = Math.max(0, Math.floor(cam.x / TILE));
    const c1 = Math.min(this.cols, Math.ceil((cam.x + ctx.canvas.width) / TILE));
    const r0 = Math.max(0, Math.floor(cam.y / TILE));
    const r1 = Math.min(this.rows, Math.ceil((cam.y + ctx.canvas.height) / TILE));

    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const t = this.grid[r][c];
        const x = c * TILE - cam.x, y = r * TILE - cam.y;
        if (t === "#") {
          // depth-tinted rock so descending reads visually
          const depth = r / this.rows;
          ctx.fillStyle = this.rockShade(depth);
          ctx.fillRect(x, y, TILE, TILE);
          // glow only on exposed surfaces (rock with open space above = a floor edge)
          if (this.tileAt(c, r - 1) !== "#" && this.tileAt(c, r - 1) !== "D")
            neonRect(ctx, x, y, TILE, 2, COLORS.solidEdge, 6);
        } else if (t === "H") {
          ctx.save();
          ctx.shadowColor = COLORS.ladder; ctx.shadowBlur = 6;
          ctx.strokeStyle = COLORS.ladder; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 3.5, y); ctx.lineTo(x + 3.5, y + TILE);
          ctx.moveTo(x + TILE - 3.5, y); ctx.lineTo(x + TILE - 3.5, y + TILE);
          for (let yy = 3; yy < TILE; yy += 6) { ctx.moveTo(x + 3, y + yy); ctx.lineTo(x + TILE - 3, y + yy); }
          ctx.stroke();
          ctx.restore();
        } else if (t === "D" && !this.doorOpen) {
          neonRect(ctx, x + 1, y, TILE - 2, TILE, COLORS.door, 10);
          ctx.fillStyle = "#1a0a18";
          ctx.fillRect(x + 4, y + 3, TILE - 8, TILE - 6);
        }
      }
    }
  }

  // darker + warmer the deeper you go
  rockShade(depth) {
    const top = [26, 24, 38], bot = [40, 24, 20];
    const r = Math.round(top[0] + (bot[0] - top[0]) * depth);
    const g = Math.round(top[1] + (bot[1] - top[1]) * depth);
    const b = Math.round(top[2] + (bot[2] - top[2]) * depth);
    return `rgb(${r},${g},${b})`;
  }
}
