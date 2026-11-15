/* =============================================================
 * game.js — state machine, main loop, camera, collisions, race rules.
 * `Game` is a global so kart.js / items.js can trigger screen shake, etc.
 * ============================================================= */

const Game = {
  state: "title",                  // title | select | countdown | race | paused | results
  canvas: null, ctx: null,
  W: 0, H: 0, dpr: 1,
  track: null,
  karts: [], ai: [], player: null,
  particles: null,
  cam: { x: 0, y: 0, rot: 0, zoom: CONFIG.camZoom },
  time: 0, raceTime: 0, lastTS: 0,
  countdownT: 0, resultsTimer: 0, finishCount: 0, raceOver: false,
  shakeAmt: 0, flashColor: "#fff", flashAlpha: 0,
  world: null,

  init() {
    this.canvas = document.getElementById("game");
    this.ctx = this.canvas.getContext("2d");
    this.particles = new Particles();
    this.track = new Track();
    Input.init();
    Sound.init();
    UI.init();
    UI.cb = {
      onStart: () => { Sound.resume(); this.setState("select"); },
      onConfirm: (charId, kartId) => this.startRace(charId, kartId),
      onRaceAgain: () => this.setState("select"),
      onResume: () => this.resume(),
      onQuit: () => this.quitToTitle(),
    };
    this._resize();
    window.addEventListener("resize", () => this._resize());
    UI.showTitle();
    this.lastTS = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  _resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = Math.floor(this.W * this.dpr);
    this.canvas.height = Math.floor(this.H * this.dpr);
  },

  setState(s) {
    this.state = s;
    if (s === "title") { Sound.stopEngine(); UI.showTitle(); }
    else if (s === "select") { Sound.stopEngine(); UI.showSelect(); }
  },

  /* ---------------- race setup ---------------- */
  startRace(charId, kartId) {
    const char = CHARACTERS.find(c => c.id === charId);
    const kart = KARTS.find(k => k.id === kartId);

    this.karts = []; this.ai = []; this.particles.clear();
    ItemSystem.reset();
    this.finishCount = 0; this.raceOver = false; this.raceTime = 0; this.resultsTimer = 0;

    // player
    this.player = new Kart({ character: char, kart: kart, isPlayer: true, name: char.name + " (You)" });
    this.karts.push(this.player);

    // 3 AI rivals — the other two characters + one repeat, varied karts/skill
    const rivalChars = CHARACTERS.filter(c => c.id !== charId);
    const rivalPool = [
      { c: rivalChars[0], k: KARTS[1], skill: 0.78, name: rivalChars[0].name },
      { c: rivalChars[1], k: KARTS[2], skill: 0.7, name: rivalChars[1].name },
      { c: char, k: KARTS[0], skill: 0.62, name: char.name + " Jr." },
    ];
    for (const r of rivalPool) {
      const k = new Kart({ character: r.c, kart: r.k, name: r.name });
      this.karts.push(k);
      this.ai.push(new AIDriver(k, r.skill));
    }

    // place on the 2x2 start grid (player gets pole)
    this.track.checkpoints[0];
    this.karts.forEach((k, i) => {
      const g = this.track.startGrid[i];
      k.placeAt(g.x, g.y, g.angle);
      k.lap = 0; k.nextCP = 1; k.place = i + 1;
    });

    // re-init spinning item boxes
    for (const b of this.track.itemBoxes) { b.active = true; b.timer = 0; }

    // camera snap to player
    this.cam.x = this.player.x; this.cam.y = this.player.y;
    this.cam.rot = -Math.PI / 2 - this.player.angle; this.cam.zoom = CONFIG.camZoom;

    this.world = { track: this.track, karts: this.karts, particles: this.particles,
                   time: 0, player: this.player, game: this };

    UI.showHUD();
    Sound.resume(); Sound.startEngine();
    this.state = "countdown";
    this.countdownT = CONFIG.COUNTDOWN + 1.0;     // 3,2,1,GO
    this._lastCount = null;
  },

  /* ---------------- loop ---------------- */
  loop(ts) {
    let dt = (ts - this.lastTS) / 1000;
    this.lastTS = ts;
    if (dt > 0.05) dt = 0.05;                      // clamp huge frames
    this.time += dt;

    // pause toggle
    if ((this.state === "race" || this.state === "paused") && Input.pressed("Escape")) {
      if (this.state === "race") this.pause(); else this.resume();
    }

    Input.update();

    if (this.state === "countdown") this._updateCountdown(dt);
    else if (this.state === "race") this._updateRace(dt);

    this._updateEffects(dt);
    this.render();

    Input.endFrame();
    requestAnimationFrame((t) => this.loop(t));
  },

  _updateCountdown(dt) {
    this.world.time = this.time;
    this.countdownT -= dt;
    const n = Math.ceil(this.countdownT - 1.0);
    const label = this.countdownT <= 1.0 ? "GO!" : String(n);
    if (label !== this._lastCount) {
      UI.showCountdown(label);
      Sound.countdownBeep(label === "GO!");
      this._lastCount = label;
    }
    // idle revving update
    Sound.updateEngine(0.1, false);
    if (this.countdownT <= 0) { UI.hideCountdown(); this.state = "race"; }
  },

  _updateRace(dt) {
    this.raceTime += dt * 1000;
    this.world.time = this.time;

    // --- player controls ---
    if (!this.player.finished) {
      const a = Input.accel, b = Input.brake;
      this.player.controls = {
        throttle: a && !b ? 1 : (b && !a ? -1 : 0),
        steer: (Input.right ? 1 : 0) - (Input.left ? 1 : 0),
        drift: Input.drift,
      };
      if (Input.pressed("Space") || Input.pressed("Control")) this.kartUseItem(this.player);
    } else {
      // gentle autopilot after finishing so the player kart keeps rolling
      this.player.controls = { throttle: 0.5, steer: 0, drift: false };
    }

    // --- AI ---
    for (const ai of this.ai) ai.update(dt, this.world);

    // --- physics ---
    for (const k of this.karts) k.update(dt, this.world);

    // --- collisions & pickups ---
    this._kartCollisions();
    this._itemBoxes();
    ItemSystem.update(dt, this.world);
    this.track.update(dt);
    this.particles.update(dt);

    // --- progress / places / finishing ---
    for (const k of this.karts) {
      k.updateProgress(this.track);
      if (!k.finished && k.lap >= CONFIG.LAPS) this._finishKart(k);
    }
    this._updatePlaces();

    // --- camera ---
    const p = this.player;
    this.cam.x = lerp(this.cam.x, p.x, clamp(CONFIG.camLerp * dt, 0, 1));
    this.cam.y = lerp(this.cam.y, p.y, clamp(CONFIG.camLerp * dt, 0, 1));
    const targetRot = -Math.PI / 2 - p.angle;
    this.cam.rot = lerpAngle(this.cam.rot, targetRot, clamp(7 * dt, 0, 1));
    const z = CONFIG.camZoom * (1 - clamp(p.speed01(), 0, 1) * 0.09);
    this.cam.zoom = lerp(this.cam.zoom, z, clamp(4 * dt, 0, 1));

    // --- engine audio ---
    Sound.updateEngine(p.speed01(), p.boostTimer > 0 || p.starTimer > 0);

    // --- HUD ---
    UI.updateHUD(p, this.karts, this.raceTime, this.track);

    // --- end of race ---
    if (this.raceOver) {
      this.resultsTimer -= dt;
      if (this.resultsTimer <= 0) {
        Sound.stopEngine();
        UI.showResults(this.karts, this.player);
        this.state = "results";
      }
    }
  },

  kartUseItem(kart) {
    if (!kart.item) return;
    const action = kart.useItem();
    if (action) ItemSystem.spawn(action, this);
    if (kart === this.player) Sound.boost();
  },

  _finishKart(k) {
    k.finished = true;
    k.finishOrder = ++this.finishCount;
    k.finishTime = this.raceTime;
    if (k === this.player) {
      this.raceOver = true;
      this.resultsTimer = 2.2;
      UI.showCountdown("FINISH!");
      setTimeout(() => UI.hideCountdown(), 1500);
      Sound.finish();
      this.shake(6);
    }
  },

  _updatePlaces() {
    const finished = this.karts.filter(k => k.finished).sort((a, b) => a.finishOrder - b.finishOrder);
    const racing = this.karts.filter(k => !k.finished)
      .sort((a, b) => this.track.progressValue(b) - this.track.progressValue(a));
    let p = 1;
    for (const k of finished) k.place = p++;
    for (const k of racing) k.place = p++;
  },

  _kartCollisions() {
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i], b = ks[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const min = a.radius + b.radius;
        if (d >= min) continue;

        const nx = dx / d, ny = dy / d, overlap = min - d;
        const invA = 1 / a.mass, invB = 1 / b.mass, invSum = invA + invB;
        // positional separation (heavier moves less)
        a.x -= nx * overlap * (invA / invSum); a.y -= ny * overlap * (invA / invSum);
        b.x += nx * overlap * (invB / invSum); b.y += ny * overlap * (invB / invSum);

        // velocity impulse along the normal (heavier shoves lighter)
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const e = 0.35, jimp = -(1 + e) * vn / invSum;
          a.vx -= jimp * nx * invA; a.vy -= jimp * ny * invA;
          b.vx += jimp * nx * invB; b.vy += jimp * ny * invB;
        }

        // star knockouts
        if (a.starTimer > 0 && b.starTimer <= 0) { b.hit("shell"); b.vx += nx * 360; b.vy += ny * 360; }
        else if (b.starTimer > 0 && a.starTimer <= 0) { a.hit("shell"); a.vx -= nx * 360; a.vy -= ny * 360; }

        if ((a === this.player || b === this.player) && Math.abs(vn) > 120) {
          Sound.collide(); this.shake(clamp(Math.abs(vn) / 80, 2, 7));
          this.particles.burst((a.x + b.x) / 2, (a.y + b.y) / 2, "#ffe", 6);
        }
      }
    }
  },

  _itemBoxes() {
    for (const box of this.track.itemBoxes) {
      if (!box.active) continue;
      for (const k of this.karts) {
        if (k.item || k.finished) continue;
        if (dist(k.x, k.y, box.x, box.y) < 30 + k.radius * 0.6) {
          k.giveItem(ItemSystem.roll(k, this.karts));
          box.active = false; box.timer = CONFIG.itemBoxRespawn;
          if (k === this.player) { Sound.pickup(); }
          this.particles.ring(box.x, box.y, "#ffd23c", 14, 200);
          break;
        }
      }
    }
  },

  _updateEffects(dt) {
    this.shakeAmt *= Math.pow(0.001, dt);     // fast decay
    if (this.shakeAmt < 0.05) this.shakeAmt = 0;
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 1.8);
  },

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); },
  flash(color) { this.flashColor = color; this.flashAlpha = 0.5; },

  pause() { if (this.state !== "race") return; this.state = "paused"; UI.showPause(); Sound.updateEngine(0, false); },
  resume() { if (this.state !== "paused") return; this.state = "race"; UI.hidePause(); this.lastTS = performance.now(); },
  quitToTitle() { UI.hidePause(); Sound.stopEngine(); this.setState("title"); },

  /* ---------------- render ---------------- */
  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // sky / backdrop (screen space)
    const sky = ctx.createLinearGradient(0, 0, 0, this.H);
    sky.addColorStop(0, "#3a2350"); sky.addColorStop(1, "#1a1320");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.W, this.H);

    if (!this.world || this.state === "title" || this.state === "select") return;

    // camera transform (+ screen shake)
    const sx = (Math.random() - 0.5) * this.shakeAmt * 2;
    const sy = (Math.random() - 0.5) * this.shakeAmt * 2;
    ctx.save();
    ctx.translate(this.W / 2 + sx, this.H / 2 + sy);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.rotate(this.cam.rot);
    ctx.translate(-this.cam.x, -this.cam.y);

    const t = this.time;
    this.track.drawGround(ctx);
    this.track.drawRoad(ctx);
    this.track.drawDecor(ctx, t);
    this.track.drawItemBoxes(ctx, t);
    ItemSystem.draw(ctx, t);
    // draw karts sorted so the player renders on top
    const order = [...this.karts].sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const k of order) k.draw(ctx, t);
    this.particles.draw(ctx);

    ctx.restore();

    // screen-space flash (lightning, etc.)
    if (this.flashAlpha > 0) {
      ctx.globalAlpha = this.flashAlpha; ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.W, this.H); ctx.globalAlpha = 1;
    }
    // vignette
    const vg = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.35, this.W / 2, this.H / 2, this.H * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, this.W, this.H);
  },
};
