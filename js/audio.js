/* =============================================================
 * audio.js — fully synthesized SFX + engine via Web Audio API.
 * No asset files. A continuous engine oscillator is pitch-mapped
 * to the player's speed; one-shot effects are short envelopes.
 * ============================================================= */

const Sound = {
  ctx: null,
  master: null,
  engine: null,      // { osc, sub, gain, filter }
  enabled: true,
  started: false,

  init() {
    // Created lazily on first user gesture (browser autoplay policy).
  },

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
  },

  resume() {
    this._ensure();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },

  setMuted(m) {
    this.enabled = !m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  },

  // ---- continuous engine ----
  startEngine() {
    this._ensure();
    if (!this.ctx || this.engine) return;
    const c = this.ctx;
    const osc = c.createOscillator(); osc.type = "sawtooth";
    const sub = c.createOscillator(); sub.type = "square";
    const filter = c.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 700;
    const gain = c.createGain(); gain.gain.value = 0.0;
    osc.frequency.value = 70; sub.frequency.value = 35;
    osc.connect(filter); sub.connect(filter); filter.connect(gain); gain.connect(this.master);
    osc.start(); sub.start();
    this.engine = { osc, sub, gain, filter };
    this.started = true;
  },

  stopEngine() {
    if (!this.engine) return;
    try { this.engine.osc.stop(); this.engine.sub.stop(); } catch (e) {}
    this.engine = null;
  },

  /** speed01 in [0..1+], boosting raises pitch & brightness. */
  updateEngine(speed01, boosting) {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 70 + speed01 * 230 + (boosting ? 70 : 0);
    this.engine.osc.frequency.setTargetAtTime(base, t, 0.05);
    this.engine.sub.frequency.setTargetAtTime(base * 0.5, t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(500 + speed01 * 2200, t, 0.05);
    this.engine.gain.gain.setTargetAtTime(0.05 + speed01 * 0.10, t, 0.08);
  },

  // ---- one-shot helpers ----
  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type || "square";
    const g = c.createGain();
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  _noise(dur, vol, freq) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq || 1200; f.Q.value = 0.7;
    const g = c.createGain(); g.gain.value = vol || 0.4;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },

  countdownBeep(go) { this._blip(go ? 880 : 440, go ? 0.5 : 0.18, "square", 0.35); },
  boost()     { this._noise(0.4, 0.5, 900); this._blip(220, 0.4, "sawtooth", 0.25, 700); },
  drift()     { this._blip(140, 0.08, "square", 0.08); },
  miniTurbo(tier) { const f = [0, 520, 720, 1000][tier] || 600; this._blip(f, 0.3, "square", 0.32, f * 1.6); },
  pickup()    { this._blip(660, 0.08, "square", 0.3); setTimeout(() => this._blip(990, 0.12, "square", 0.3), 80); },
  collide()   { this._noise(0.18, 0.5, 220); this._blip(90, 0.18, "square", 0.25); },
  shellFire() { this._blip(300, 0.18, "sawtooth", 0.3, 120); },
  hit()       { this._noise(0.25, 0.5, 500); this._blip(160, 0.25, "square", 0.3, 60); },
  spinout()   { this._blip(500, 0.5, "sine", 0.3, 120); },
  star()      { let i = 0; const seq = [523, 659, 784, 1047]; const id = setInterval(() => { if (i >= seq.length) { clearInterval(id); return; } this._blip(seq[i++], 0.12, "square", 0.25); }, 90); },
  lightning() { this._noise(0.5, 0.6, 2400); this._blip(1200, 0.5, "sawtooth", 0.3, 100); },
  shield()    { this._blip(400, 0.3, "sine", 0.25, 800); },
  finish()    { let i = 0; const seq = [523, 659, 784, 1047, 784, 1047]; const id = setInterval(() => { if (i >= seq.length) { clearInterval(id); return; } this._blip(seq[i++], 0.16, "square", 0.3); }, 130); },
};
