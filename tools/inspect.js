// throwaway: render the generated level as ASCII to sanity-check connectivity.
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "js");
let src = fs.readFileSync(path.join(dir, "assets.js"), "utf8") + "\n" +
          fs.readFileSync(path.join(dir, "level.js"), "utf8") + "\n" +
          "module.exports = Level;";
const Level = eval("(function(){ " + src + " })()") || global.Level;

// eval above won't return Level; rebuild via Function instead:
const factory = new Function(src.replace("module.exports = Level;", "return Level;"));
const LevelClass = factory();
const L = new LevelClass();

const put = (c, r, ch) => { if (L.inBounds(c, r) && L.grid[r][c] === ".") L.grid[r][c] = ch; };
put(L.playerSpawn.c, L.playerSpawn.r, "P");
put(L.goal.c, L.goal.r, "G");
put(L.keyAt.c, L.keyAt.r, "K");
for (const e of L.enemies) put(e.c, e.r, e.type === "flyer" ? "f" : "e");
for (const p of L.pickups) put(p.c, p.r, p.type === "gold" ? "$" : "b");

let out = "";
for (let r = 0; r < L.rows; r++) out += String(r).padStart(2, " ") + " " + L.grid[r].join("") + "\n";
console.log(out);
