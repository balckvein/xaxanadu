// assets.js — neon placeholder rendering helpers + shared constants.
// No image files: everything is drawn with glowing primitives so the game
// is fully playable now and can be re-skinned later.

const TILE = 16; // logical pixels per tile

const COLORS = {
  bg:       "#05060c",
  player:   "#2cf5d6",
  playerHi: "#bafff4",
  enemy:    "#ff4d6d",
  enemy2:   "#ff9f1c",
  solid:    "#241d2b",
  solidEdge:"#ff9f4a",
  ladder:   "#7c5cff",
  gold:     "#ffd54a",
  bread:    "#9bffb0",
  key:      "#ff5cf0",
  door:     "#ff5cf0",
  magic:    "#5cd6ff",
  text:     "#cfe9ff",
  hpFill:   "#ff4d6d",
  hpBack:   "#3a1020",
  mpFill:   "#5cd6ff",
  mpBack:   "#10283a",
};

// Filled rect with an outer neon glow. Pixel-art friendly (integer coords).
function neonRect(ctx, x, y, w, h, color, glow = 8) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.restore();
}

function neonStroke(ctx, x, y, w, h, color, glow = 6, lw = 1) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  ctx.restore();
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
