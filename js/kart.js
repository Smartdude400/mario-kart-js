/* =============================================================
 * kart.js — arcade kart physics + DRIFT mini-turbo system.
 *
 * Velocity is stored as a world vector (vx,vy). Each frame it is split
 * into a FORWARD component (along the kart's heading) and a LATERAL
 * component (sideways). Forward eases toward a stat-driven target speed;
 * lateral is bled off by "grip". Lowering grip = the kart slides = drift.
 * ============================================================= */

class Kart {
  constructor(opts) {
    this.character = opts.character;
    this.kartType = opts.kart;
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name || opts.character.name;
    this.color = opts.character.color;
    this.accent = opts.character.accent;

    this._computeStats();

    // pose / motion
    this.x = 0; this.y = 0; this.angle = 0;
    this.vx = 0; this.vy = 0;

    // drift
    this.drifting = false;
    this.driftDir = 0;
    this.driftCharge = 0;
    this.driftTier = 0;
    this.hopTimer = 0;
    this.hopZ = 0;
    this.prevDrift = false;

    // boost
    this.boostTimer = 0;
    this.boostBonus = 0;

    // statuses
    this.spinTimer = 0;
    this.spinSpeed = 0;
    this.squishTimer = 0;
    this.starTimer = 0;
    this.shield = false;
    this.shieldSpin = 0;
    this.invincibleTimer = 0;   // brief i-frames after a hit

    // items
    this.item = null;           // { id, count }

    // race state
    this.lap = 0;
    this.nextCP = 1;
    this.place = 1;
    this.finished = false;
    this.finishTime = null;
    this.wrongWay = false;

    // control input (set each frame by player or AI)
    this.controls = { throttle: 0, steer: 0, drift: false };

    // visual
    this.bodyAngle = 0;         // smoothed render angle (adds drift lean)
  }

  _computeStats() {
    const c = this.character, m = this.kartType.mods;
    this.stats = {
      speed: clamp(c.speed + m.speed, 1, 5),
      accel: clamp(c.accel + m.accel, 1, 5),
      weight: clamp(c.weight + m.weight, 1, 5),
      handling: clamp(c.handling + m.handling, 1, 5),
    };
    const s = this.stats;
    this.maxSpeed = CONFIG.speedBase + s.speed * CONFIG.speedPerStat;
    this.accelRate = CONFIG.accelBase + s.accel * CONFIG.accelPerStat;
    this.turnRate = CONFIG.turnBase + s.handling * CONFIG.turnPerStat;
    this.grip = CONFIG.gripBase + s.handling * CONFIG.gripPerStat;
    this.mass = CONFIG.massBase + s.weight * CONFIG.massPerStat;
    this.radius = CONFIG.kartRadius;
  }

  placeAt(x, y, angle) {
    this.x = x; this.y = y; this.angle = angle; this.bodyAngle = angle;
    this.vx = 0; this.vy = 0;
  }

  speed() { return Math.hypot(this.vx, this.vy); }
  speed01() { return clamp(this.speed() / this.maxSpeed, 0, 1.4); }

  /* ---------------- items ---------------- */
  giveItem(id) {
    this.item = { id, count: id === "triple" ? 3 : 1 };
  }

  /** Consume the held item; returns an action descriptor for the game. */
  useItem() {
    if (!this.item) return null;
    const id = this.item.id;
    let action = { id, kart: this };
    switch (id) {
      case "mushroom":
        this.applyBoost(CONFIG.boostMushroom.boost, CONFIG.boostMushroom.dur); break;
      case "triple":
        this.applyBoost(CONFIG.boostMushroom.boost, CONFIG.boostMushroom.dur);
        this.item.count--;
        if (this.item.count > 0) return action;     // keep remaining mushrooms
        break;
      case "star":
        this.starTimer = CONFIG.starDur; break;
      case "shield":
        this.shield = true; break;
      // banana / green / red / lightning are handled by the game (spawning).
    }
    this.item = null;
    return action;
  }

  applyBoost(amount, dur) {
    this.boostBonus = Math.max(this.boostBonus, amount);
    this.boostTimer = Math.max(this.boostTimer, dur);
  }

  /** Take a hit. Respects star (immune) and shield (blocks once). */
  hit(kind) {
    if (this.starTimer > 0 || this.invincibleTimer > 0) return false;
    if (this.shield) { this.shield = false; this.invincibleTimer = 0.4; Sound.shield(); return false; }
    if (kind === "lightning") {
      this.squishTimer = CONFIG.squishDur;
      this.boostTimer = 0; this.boostBonus = 0;
      this.cancelDrift();
      return true;
    }
    // spin-out (banana, shells, star contact)
    this.spinTimer = CONFIG.spinDur;
    this.spinSpeed = (Math.random() < 0.5 ? -1 : 1) * 14;
    this.invincibleTimer = CONFIG.spinDur + 0.3;
    this.boostTimer = 0; this.boostBonus = 0;
    this.cancelDrift();
    Sound.spinout();
    return true;
  }

  cancelDrift() {
    this.drifting = false; this.driftDir = 0; this.driftCharge = 0; this.driftTier = 0;
  }

  /* ---------------- main physics step ---------------- */
  update(dt, world) {
    const track = world.track, particles = world.particles;
    const sp = this.speed();

    // hop bounce visual
    if (this.hopTimer > 0) { this.hopTimer -= dt; this.hopZ = Math.sin((1 - this.hopTimer / 0.16) * Math.PI) * 7; }
    else this.hopZ *= 0.8;

    // tick timers
    if (this.boostTimer > 0) this.boostTimer -= dt; else this.boostBonus = 0;
    if (this.starTimer > 0) this.starTimer -= dt;
    if (this.squishTimer > 0) this.squishTimer -= dt;
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.shield) this.shieldSpin += dt * 3;

    // ---- spin-out: no driver control ----
    if (this.spinTimer > 0) {
      this.spinTimer -= dt;
      this.angle += this.spinSpeed * dt;
      this.spinSpeed *= 0.96;
      this._integrateSimple(dt, 0.6);          // coast & slow
      this._finishVisual(dt, track);
      return;
    }

    const ctl = this.controls;
    const surface = track.surfaceAt(this.x, this.y);
    const onRoad = surface.type === "road";
    let surfMult = surface.grip;

    // ---- drift state machine ----
    this._driftLogic(dt, ctl, particles);

    // ---- target forward speed ----
    let speedMult = 1;
    if (this.squishTimer > 0) speedMult *= CONFIG.lightningSlow;
    if (this.starTimer > 0) speedMult *= 1.0;
    let maxFwd = this.maxSpeed * surfMult * speedMult;

    let throttle = ctl.throttle;
    let target;
    if (throttle > 0) target = maxFwd * throttle;
    else if (throttle < 0) target = -CONFIG.reverseSpeed * surfMult;
    else target = 0;

    // boosts add on top (can exceed normal max)
    let boost = 0;
    if (this.boostTimer > 0) boost += this.boostBonus * clamp(this.boostTimer / 0.18, 0, 1);
    if (this.starTimer > 0) boost += CONFIG.starBoost;
    target += boost;

    // ---- split velocity into forward / lateral ----
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    const rx = -sa, ry = ca;                   // right (lateral) axis
    let vF = this.vx * ca + this.vy * sa;
    let vL = this.vx * rx + this.vy * ry;

    // forward easing
    let rate;
    if (throttle > 0 || boost > 0) rate = this.accelRate;
    else if (throttle < 0) rate = this.accelRate * 2.4;     // braking is snappy
    else rate = this.accelRate * 0.7;                       // coast
    vF += (target - vF) * clamp(rate * dt, 0, 1);

    // lateral grip (bleed sideways velocity); low while drifting / off-road
    let grip = this.grip;
    if (this.drifting) grip = CONFIG.driftGrip;
    if (!onRoad) grip *= 0.6;
    vL -= vL * clamp(grip * dt, 0, 1);

    // recombine
    this.vx = ca * vF + rx * vL;
    this.vy = sa * vF + ry * vL;

    // ---- steering ----
    let steer = ctl.steer;
    let turn = this.turnRate;
    if (this.drifting) {
      turn *= CONFIG.driftTurnBoost;
      // bias steering toward the locked drift direction; player can modulate
      steer = clamp(this.driftDir * 0.6 + ctl.steer * 0.55, -1.3, 1.3);
    }
    const speedSteerFactor = clamp(vF / 90, -1, 1);   // need motion to turn; reverse flips
    if (Math.abs(vF) > 6) {
      this.angle += turn * steer * speedSteerFactor * dt;
    }

    // ---- off-track wobble ----
    if (!onRoad && sp > 60) {
      this.angle += (Math.random() - 0.5) * CONFIG.offTrackWobble * dt;
      if (Math.random() < 0.4) particles.smoke(
        this.x - ca * 18, this.y - sa * 18,
        surface.near && surface.near.onShortcut ? "rgba(150,120,80,0.6)" : "rgba(200,180,120,0.55)");
    }

    // integrate position
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // boost flame particles
    if ((this.boostTimer > 0 && this.boostBonus > 0) || this.starTimer > 0) {
      const col = this.starTimer > 0 ? `hsl(${(world.time * 600) % 360},90%,60%)` : "#ffd23c";
      particles.flame(this.x - ca * 22, this.y - sa * 22, this.angle, col);
    }

    this._finishVisual(dt, track);
  }

  _integrateSimple(dt, decay) {
    this.vx *= Math.pow(decay, dt * 60);
    this.vy *= Math.pow(decay, dt * 60);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  _driftLogic(dt, ctl, particles) {
    const sp = this.speed();
    const pressEdge = ctl.drift && !this.prevDrift;
    const releaseEdge = !ctl.drift && this.prevDrift;

    // start a hop->drift
    if (pressEdge && !this.drifting && sp > CONFIG.driftMinSpeed * 0.7) {
      this.hopTimer = 0.16;
      this.drifting = true;
      this.driftCharge = 0; this.driftTier = 0;
      this.driftDir = Math.abs(ctl.steer) > 0.1 ? Math.sign(ctl.steer) : 0;
      Sound.drift();
    }

    if (this.drifting) {
      // lock in a direction once the player commits to a turn
      if (this.driftDir === 0 && Math.abs(ctl.steer) > 0.1) this.driftDir = Math.sign(ctl.steer);

      // "stopping cancels": too slow ends the drift with no reward
      if (sp < CONFIG.driftMinSpeed) {
        this.cancelDrift();
      } else if (this.driftDir !== 0) {
        // charge only builds while actually carving (a committed direction)
        this.driftCharge += dt;
        let tier = 0;
        for (let i = 0; i < CONFIG.driftTiers.length; i++)
          if (this.driftCharge >= CONFIG.driftTiers[i].t) tier = i + 1;
        if (tier > this.driftTier) Sound.drift();
        this.driftTier = tier;

        // spark fountain at the inside rear wheel, colored by tier
        if (tier >= 1) {
          const col = CONFIG.driftTiers[tier - 1].color;
          const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
          const wx = this.x - ca * 16 - (-sa) * this.driftDir * 14;
          const wy = this.y - sa * 16 - (ca) * this.driftDir * 14;
          particles.spark(wx, wy, col, this.angle + Math.PI + this.driftDir * 0.6);
        }
      }

      // release -> fire mini-turbo of the charged tier
      if (releaseEdge) {
        if (this.driftTier >= 1) {
          const t = CONFIG.driftTiers[this.driftTier - 1];
          this.applyBoost(t.boost, t.dur);
          Sound.miniTurbo(this.driftTier);
          particles.ring(this.x, this.y, t.color, 16, 260);
          if (this.isPlayer) Game.shake(this.driftTier * 2.2);
        }
        this.cancelDrift();
      }
    }

    this.prevDrift = ctl.drift;
  }

  _finishVisual(dt, track) {
    // smoothed body angle leans into a drift for readability
    let target = this.angle;
    if (this.drifting && this.driftDir !== 0) target = this.angle + this.driftDir * 0.35;
    this.bodyAngle = this.angle + angDiff(target, this.angle) * clamp(10 * dt, 0, 1);

    // wrong-way detection (only meaningful while moving on track)
    if (this.speed() > 80) {
      const fwd = track.forwardDirAt(this.x, this.y);
      const moveAng = Math.atan2(this.vy, this.vx);
      this.wrongWay = Math.abs(angDiff(fwd, moveAng)) > 2.1;
    } else this.wrongWay = false;
  }

  /* ---------------- checkpoint / lap progress ---------------- */
  updateProgress(track) {
    if (this.finished) return;
    const cp = track.checkpoints[this.nextCP % track.CP];
    if (dist(this.x, this.y, cp.x, cp.y) < track.gateRadius) {
      const reached = this.nextCP % track.CP;
      this.nextCP = (this.nextCP + 1) % track.CP;
      if (reached === 0) {                      // crossed the start/finish gate
        this.lap++;
      }
    }
  }

  /* ============================ RENDER ============================ */
  draw(ctx, time) {
    const r = this.radius;
    const ca = Math.cos(this.bodyAngle), sa = Math.sin(this.bodyAngle);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(this.x + 5, this.y + 6, r * 1.05, r * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(this.x, this.y - this.hopZ);
    let scale = 1 + this.hopZ * 0.01;
    if (this.squishTimer > 0) scale *= CONFIG.lightningShrink;
    ctx.scale(scale, scale);
    ctx.rotate(this.bodyAngle + Math.PI / 2);   // sprite drawn pointing "up"

    // star rainbow aura
    if (this.starTimer > 0) {
      ctx.shadowBlur = 26;
      ctx.shadowColor = `hsl(${(time * 600) % 360},90%,60%)`;
    }

    // wheels
    ctx.fillStyle = "#16151a";
    for (const [wx, wy] of [[-r * 0.72, -r * 0.55], [r * 0.72, -r * 0.55], [-r * 0.72, r * 0.6], [r * 0.72, r * 0.6]]) {
      ctx.save(); ctx.translate(wx, wy);
      ctx.fillRect(-5, -8, 10, 16);
      ctx.restore();
    }

    // body
    const bodyCol = this.starTimer > 0 ? `hsl(${(time * 500) % 360},85%,60%)` : this.color;
    roundRect(ctx, -r * 0.62, -r * 0.85, r * 1.24, r * 1.7, 8);
    ctx.fillStyle = bodyCol; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.stroke();

    // accent stripe + cockpit
    ctx.fillStyle = this.accent;
    roundRect(ctx, -r * 0.4, -r * 0.7, r * 0.8, r * 0.5, 4); ctx.fill();
    ctx.fillStyle = "#1d1b22";
    roundRect(ctx, -r * 0.34, -r * 0.1, r * 0.68, r * 0.6, 5); ctx.fill();
    // driver helmet
    ctx.fillStyle = this.accent;
    ctx.beginPath(); ctx.arc(0, r * 0.18, r * 0.24, 0, TAU); ctx.fill();

    // front bumper hint (nose) — shows which way is forward
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    roundRect(ctx, -r * 0.4, -r * 0.9, r * 0.8, 5, 2); ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();

    // shield bubble
    if (this.shield) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(time * 6) * 0.12;
      ctx.strokeStyle = "#5ad6ff"; ctx.lineWidth = 3;
      ctx.shadowBlur = 14; ctx.shadowColor = "#5ad6ff";
      ctx.beginPath(); ctx.arc(this.x, this.y - this.hopZ, r * 1.5, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // triple-mushroom orbit indicator
    if (this.item && this.item.id === "triple") {
      for (let i = 0; i < this.item.count; i++) {
        const a = time * 3 + (i / 3) * TAU;
        ctx.save();
        ctx.translate(this.x + Math.cos(a) * (r + 12), this.y - this.hopZ + Math.sin(a) * (r + 12));
        ctx.fillStyle = "#ff5a5a";
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }

    // player marker (floating triangle)
    if (this.isPlayer) {
      const bob = Math.sin(time * 4) * 3;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      const ty = this.y - r - 24 - bob;
      ctx.moveTo(this.x, ty + 12);
      ctx.lineTo(this.x - 9, ty);
      ctx.lineTo(this.x + 9, ty);
      ctx.closePath(); ctx.fill();
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
