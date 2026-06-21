// main.js — boot + fixed-timestep loop (60 Hz update, render every frame).

(function () {
  const canvas = document.getElementById("game");
  const game = new Game(canvas);

  const STEP = 1000 / 60;
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    acc += now - last;
    last = now;
    // clamp to avoid spiral-of-death after tab switches
    if (acc > 200) acc = 200;
    while (acc >= STEP) { game.update(); acc -= STEP; }
    game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
