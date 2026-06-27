// audio.js — tiny synthesized SFX (no audio files). Uses WebAudio oscillators
// + noise bursts with quick envelopes. Browsers suspend audio until a user
// gesture, so the context is created lazily and resumed on first input.
//
// In non-browser environments (e.g. the headless test) window.AudioContext is
// absent, so ensure() returns null and every SFX call is a safe no-op.

const SFX = (() => {
  let ctx = null, master = null, music = null, muted = false;

  function ensure() {
    if (!ctx) {
      const AC = (typeof window !== "undefined") && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      music = ctx.createGain();
      music.gain.value = 0.5;
      music.connect(ctx.destination);
    }
    if (ctx.state === "suspended" && ctx.resume) ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = "square", vol = 1, slideTo = null) {
    const c = ensure();
    if (!c || muted) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.4) {
    const c = ensure();
    if (!c || muted) return;
    const t0 = c.currentTime;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur);
  }

  function seq(notes, type = "square", vol = 0.45) {
    notes.forEach((f, i) => setTimeout(() => tone(f, 0.14, type, vol), i * 70));
  }

  // ---- background music (original synthesized loops, no samples) ----
  function musicTone(freq, dur, type, vol) {
    if (!ctx || muted || !freq) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(music);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  // 16-step loops. lead = arpeggio, bass on the downbeats. (Original patterns.)
  const TRACKS = {
    explore: {
      bpm: 104, type: "triangle", vol: 0.16,
      lead: [220, 0, 329.6, 261.6, 220, 0, 329.6, 440, 196, 0, 293.7, 246.9, 196, 0, 293.7, 392],
      bass: [110, 110, 98, 98],
    },
    boss: {
      bpm: 152, type: "sawtooth", vol: 0.16,
      lead: [146.8, 174.6, 146.8, 220, 155.6, 185, 155.6, 233.1, 146.8, 196, 174.6, 246.9, 138.6, 174.6, 207.7, 277.2],
      bass: [73.4, 73.4, 77.8, 69.3],
    },
  };

  let musicTimer = null, musicTrack = null, musicStep = 0;

  function step() {
    if (muted) { musicStep++; return; }
    const tr = TRACKS[musicTrack];
    if (!tr) return;
    const beat = 60 / tr.bpm;
    musicTone(tr.lead[musicStep % tr.lead.length], beat * 0.95, tr.type, tr.vol);
    if (musicStep % 4 === 0) musicTone(tr.bass[(musicStep / 4) % tr.bass.length], beat * 1.8, "square", tr.vol * 0.9);
    musicStep++;
  }

  // resume context + mute toggle on key 'M'
  if (typeof window !== "undefined" && window.addEventListener) {
    const wake = () => ensure();
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyM") muted = !muted;
      wake();
    });
    window.addEventListener("pointerdown", wake);
  }

  return {
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },
    startMusic(track) {
      if (!ensure()) return;            // no audio context (e.g. headless) -> skip
      if (musicTrack === track && musicTimer) return;
      this.stopMusic();
      const tr = TRACKS[track];
      if (!tr) return;
      musicTrack = track; musicStep = 0;
      const stepMs = (60 / tr.bpm / 2) * 1000; // 8th notes
      musicTimer = setInterval(step, stepMs);
    },
    stopMusic() {
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
      musicTrack = null;
    },
    jump()   { tone(440, 0.12, "square", 0.5, 720); },
    djump()  { tone(560, 0.12, "square", 0.45, 900); },
    hit()    { tone(220, 0.07, "square", 0.5, 150); noise(0.04, 0.18); },
    kill()   { tone(180, 0.18, "square", 0.5, 70); noise(0.12, 0.25); },
    magic()  { tone(720, 0.18, "sawtooth", 0.4, 280); },
    coin()   { tone(880, 0.05, "square", 0.4); tone(1320, 0.07, "square", 0.32); },
    heal()   { seq([523, 784], "triangle", 0.4); },
    key()    { seq([660, 990, 1320], "square", 0.4); },
    door()   { tone(150, 0.32, "sawtooth", 0.45, 70); },
    hurt()   { tone(200, 0.22, "square", 0.5, 90); noise(0.1, 0.28); },
    levelup(){ seq([660, 880, 1100, 1320], "square", 0.45); },
    buy()    { tone(520, 0.05, "square", 0.4); tone(780, 0.07, "square", 0.4); },
    death()  { tone(300, 0.6, "sawtooth", 0.5, 60); noise(0.3, 0.3); },
    win()    { seq([523, 659, 784, 1046, 1318], "square", 0.5); },
  };
})();
