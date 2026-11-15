/* =============================================================
 * particles.js — lightweight particle system (world-space).
 * Used for drift sparks, boost flames, smoke, item hits, etc.
 * ============================================================= */

class Particle {
  constructor(x, y, vx, vy, life, size, color, opts) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.size = size; this.color = color;
    opts = opts || {};
    this.drag = opts.drag != null ? opts.drag : 0.9;
    this.grav = opts.grav || 0;          // pulls toward shrink, not gravity (top-down)
    this.shrink = opts.shrink != null ? opts.shrink : true;
    this.glow = opts.glow || false;
    this.spark = opts.spark || false;    // draw as a small streak
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(this.drag, dt * 60);
    this.vy *= Math.pow(this.drag, dt * 60);
    this.life -= dt;
    return this.life > 0;
  }
  draw(ctx) {
    const a = clamp(this.life / this.maxLife, 0, 1);
    const s = this.shrink ? this.size * a : this.size;
    ctx.globalAlpha = a;
    if (this.glow) ctx.shadowBlur = 12, ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    if (this.spark) {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = s;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - this.vx * 0.02, this.y - this.vy * 0.02);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, s, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

class Particles {
  constructor() { this.list = []; }
  clear() { this.list.length = 0; }

  add(p) { if (this.list.length < 900) this.list.push(p); }

  /** Drift spark fountain at a wheel position, colored by charge tier. */
  spark(x, y, color, dir) {
    for (let i = 0; i < 3; i++) {
      const a = dir + randRange(-1.2, 1.2);
      const sp = randRange(80, 260);
      this.add(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        randRange(0.18, 0.4), randRange(2, 4.5), color, { glow: true, spark: true, drag: 0.86 }));
    }
  }

  /** Boost flame trailing behind the kart. */
  flame(x, y, angle, color) {
    for (let i = 0; i < 2; i++) {
      const a = angle + Math.PI + randRange(-0.4, 0.4);
      const sp = randRange(60, 180);
      this.add(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        randRange(0.2, 0.45), randRange(5, 10), color, { glow: true, drag: 0.9 }));
    }
  }

  /** Dust/smoke kicked up off-track or when sliding. */
  smoke(x, y, color) {
    this.add(new Particle(x, y, randRange(-30, 30), randRange(-30, 30),
      randRange(0.3, 0.7), randRange(4, 9), color || "rgba(180,160,120,0.7)", { drag: 0.92 }));
  }

  /** Burst on item hit / collision. */
  burst(x, y, color, n) {
    n = n || 16;
    for (let i = 0; i < n; i++) {
      const a = randRange(0, TAU), sp = randRange(80, 360);
      this.add(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        randRange(0.25, 0.6), randRange(3, 7), color, { glow: true, drag: 0.88 }));
    }
  }

  /** Sparkle ring (star pickup / mini-turbo fire). */
  ring(x, y, color, n, speed) {
    n = n || 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this.add(new Particle(x, y, Math.cos(a) * (speed || 240), Math.sin(a) * (speed || 240),
        0.5, 4, color, { glow: true, drag: 0.85 }));
    }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (!this.list[i].update(dt)) this.list.splice(i, 1);
    }
  }
  draw(ctx) { for (const p of this.list) p.draw(ctx); }
}
