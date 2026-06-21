// hud.js — top status bar: HP, MP, EXP, Gold, keys, and the current title/rank.

// Faxanadu-style ranks: EXP thresholds bestow a title.
const RANKS = [
  { exp: 0,    name: "NOVICE"   },
  { exp: 60,   name: "ASPIRANT" },
  { exp: 150,  name: "BATTLER"  },
  { exp: 300,  name: "FIGHTER"  },
  { exp: 500,  name: "ADEPT"    },
  { exp: 800,  name: "CHEVALIER"},
  { exp: 1200, name: "VETERAN"  },
  { exp: 1800, name: "WARRIOR"  },
  { exp: 2600, name: "SWORDMAN" },
  { exp: 4000, name: "HERO"     },
  { exp: 6000, name: "SOLDIER"  },
  { exp: 9000, name: "MYRMIDON" },
  { exp: 13000,name: "CHAMPION" },
  { exp: 18000,name: "SUPERHERO"},
  { exp: 25000,name: "PALADIN"  },
  { exp: 45000,name: "LORD"     },
];

function rankFor(exp) {
  let r = RANKS[0];
  for (const rk of RANKS) if (exp >= rk.exp) r = rk;
  return r.name;
}

const HUD = {
  draw(ctx, player, msg) {
    const W = ctx.canvas.width;
    // backing bar
    ctx.fillStyle = "rgba(4,8,16,0.85)";
    ctx.fillRect(0, 0, W, 34);
    neonRect(ctx, 0, 33, W, 1, COLORS.solidEdge, 6);

    // HP
    this.bar(ctx, 8, 6, 120, 8, player.hp / player.hpMax, COLORS.hpFill, COLORS.hpBack);
    this.label(ctx, 8, 24, "HP " + player.hp + "/" + player.hpMax);
    // MP
    this.bar(ctx, 148, 6, 100, 8, player.mp / player.mpMax, COLORS.mpFill, COLORS.mpBack);
    this.label(ctx, 148, 24, "MP " + player.mp + "/" + player.mpMax);

    // stats on the right
    ctx.fillStyle = COLORS.gold;
    ctx.font = "9px Consolas, monospace";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("GOLD " + player.gold, 300, 14);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("EXP " + player.exp, 300, 26);
    ctx.fillStyle = COLORS.key;
    ctx.fillText("KEYS " + player.keys, 392, 26);
    ctx.fillStyle = COLORS.player;
    ctx.fillText(rankFor(player.exp), 392, 14);

    // transient center message (door hints, win, etc.)
    if (msg) {
      ctx.fillStyle = "rgba(4,8,16,0.8)";
      ctx.fillRect(W / 2 - 120, 40, 240, 18);
      ctx.fillStyle = COLORS.playerHi;
      ctx.font = "10px Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(msg, W / 2, 53);
      ctx.textAlign = "left";
    }
  },

  bar(ctx, x, y, w, h, frac, fill, back) {
    frac = clamp(frac, 0, 1);
    ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
    neonRect(ctx, x, y, w * frac, h, fill, 8);
    neonStroke(ctx, x, y, w, h, fill, 4);
  },

  label(ctx, x, y, text) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "8px Consolas, monospace";
    ctx.fillText(text, x, y);
  },
};
