// dev tool: render a generated level as ASCII. Usage: node tools/inspect.js [levelIndex]
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "js");
global.window = { addEventListener() {} };
global.Image = class { constructor() { this.complete = false; this.naturalWidth = 0; } };
global.document = { createElement() { return null; } };

const src = fs.readFileSync(path.join(dir, "assets.js"), "utf8") + "\n" +
            fs.readFileSync(path.join(dir, "level.js"), "utf8") + "\nreturn { Level };";
const { Level } = new Function(src)();

const L = new Level();
const put = (c, r, ch) => { if (L.inBounds(c, r) && L.grid[r][c] === ".") L.grid[r][c] = ch; };
put(L.playerSpawn.c, L.playerSpawn.r - 1, "P");
for (const n of L.npcs) put(n.c, n.r - 1, n.kind === "guru" ? "G" : "S");
for (const e of L.enemies) put(e.c, e.r, e.type[0]);
for (const b of L.bosses) put(b.c, b.r, "!");
for (const p of L.pickups) put(p.c, p.r, p.type === "gold" ? "$" : p.type[0]);

let out = "MAP: " + (L.id || "THE DESCENT") + "  (" + L.cols + "x" + L.rows + ")\n";
for (let r = 0; r < L.rows; r++) out += String(r).padStart(2) + " " + L.grid[r].join("") + "\n";
console.log(out);
