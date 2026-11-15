/* =============================================================
 * items.js — the 8 power-ups, their projectiles/hazards, and the
 * position-weighted "item roll" (rubber-banding).
 * ============================================================= */

/* ---- world hazards / projectiles ---- */

class Banana {
  constructor(x, y, owner) {
    this.x = x; this.y = y; this.owner = owner;
    this.life = CONFIG.bananaLife; this.grace = 0.4; this.spin = Math.random() * TAU;
    this.r = 18; this.type = "banana";
  }
  update(dt, world) {
    this.life -= dt; if (this.grace > 0) this.grace -= dt;
    for (const k of world.karts) {
      if (k === this.owner && this.grace > 0) continue;
      if (dist(this.x, this.y, k.x, k.y) < this.r + k.radius * 0.7) {
        if (k.hit("banana")) world.particles.burst(this.x, this.y, "#ffd23c", 14);
        else world.particles.burst(this.x, this.y, "#9aa", 8);
        return false;
      }
    }
    return this.life > 0;
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.spin);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(2, 4, 16, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#ffd23c"; ctx.strokeStyle = "#a87f00"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0.3, Math.PI - 0.3, false);
    ctx.arc(0, 6, 14, Math.PI - 0.3, 0.3, true); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#6b4f00"; ctx.fillRect(-2, -13, 4, 5);
    ctx.restore();
  }
}

class Shell {
  constructor(x, y, angle, owner, kind, target) {
    this.x = x; this.y = y; this.owner = owner; this.kind = kind; this.target = target;
    const sp = kind === "red" ? CONFIG.redShellSpeed : CONFIG.shellSpeed;
    this.vx = Math.cos(angle) * sp; this.vy = Math.sin(angle) * sp;
    this.life = kind === "red" ? CONFIG.redShellLife : CONFIG.shellLife;
    this.bounces = CONFIG.shellBounces;
    this.grace = 0.25; this.spin = 0; this.r = 14; this.type = "shell"; this.speed = sp;
  }
  update(dt, world) {
    this.life -= dt; if (this.grace > 0) this.grace -= dt;
    this.spin += dt * 16;

    if (this.kind === "red" && this.target && !this.target.finished) {
      const desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      let cur = Math.atan2(this.vy, this.vx);
      cur += clamp(angDiff(desired, cur), -4 * dt, 4 * dt);
      this.vx = Math.cos(cur) * this.speed; this.vy = Math.sin(cur) * this.speed;
    }

    this.x += this.vx * dt; this.y += this.vy * dt;

    // green shells bounce off the track walls; red shells expire off-track
    const surf = world.track.surfaceAt(this.x, this.y);
    if (surf.type !== "road") {
      if (this.kind === "green" && this.bounces > 0) {
        const n = world.track.wallNormal(this.x, this.y);
        const dot = this.vx * n.x + this.vy * n.y;
        this.vx -= 2 * dot * n.x; this.vy -= 2 * dot * n.y;
        // shove back inside so it doesn't re-trigger immediately
        this.x -= n.x * (n.dist - n.halfW + 6);
        this.y -= n.y * (n.dist - n.halfW + 6);
        this.bounces--;
        world.particles.burst(this.x, this.y, "#3cd66a", 6);
        Sound.collide();
      } else if (this.kind === "red") {
        return false;
      }
    }

    for (const k of world.karts) {
      if (k === this.owner && this.grace > 0) continue;
      if (dist(this.x, this.y, k.x, k.y) < this.r + k.radius * 0.75) {
        if (k.hit("shell")) world.particles.burst(this.x, this.y, this.kind === "red" ? "#ff5a5a" : "#3cd66a", 16);
        return false;
      }
    }
    return this.life > 0;
  }
  draw(ctx, time) {
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(2, 4, 14, 7, 0, 0, TAU); ctx.fill();
    const col = this.kind === "red" ? "#ff3c3c" : "#2fbf4f";
    const lite = this.kind === "red" ? "#ff9a9a" : "#9aff9a";
    ctx.shadowBlur = 10; ctx.shadowColor = col;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 2, 9, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = lite; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 13, Math.PI, TAU); ctx.stroke();
    ctx.restore();
  }
}

/* ---- the item system ---- */

const ItemSystem = {
  hazards: [],

  reset() { this.hazards.length = 0; },

  /**
   * Weighted random item roll. The weight of each item interpolates between a
   * "front-runner" anchor (p=0, you're in 1st) and a "back-marker" anchor
   * (p=1, you're last). Trailing players get powerful comeback items
   * (lightning, star, triple, red shell); leaders get defensive/area items
   * (banana, green shell). This is the rubber-banding.
   */
  roll(kart, allKarts) {
    const total = allKarts.length;
    const p = total > 1 ? (kart.place - 1) / (total - 1) : 0;  // 0=first … 1=last
    const hasAhead = kart.place > 1;

    // [frontAnchor, backAnchor]
    const table = {
      mushroom:  [3.0, 1.6],
      triple:    [0.4, 2.8],
      banana:    [3.0, 0.5],
      green:     [2.8, 1.0],
      red:       [0.0, 2.6],   // useless in 1st (zeroed below if no one ahead)
      lightning: [0.0, 2.0],
      star:      [0.2, 2.4],
      shield:    [1.6, 1.1],
    };

    const weights = [];
    let sum = 0;
    for (const id in table) {
      let w = lerp(table[id][0], table[id][1], p);
      if (id === "red" && !hasAhead) w = 0;
      if (id === "lightning" && kart.place === 1) w = 0;
      weights.push([id, w]); sum += w;
    }
    let r = Math.random() * sum;
    for (const [id, w] of weights) { if ((r -= w) <= 0) return id; }
    return "mushroom";
  },

  /** Called when a kart uses banana/green/red/lightning (self items already applied). */
  spawn(action, game) {
    const k = action.kart;
    const ca = Math.cos(k.angle), sa = Math.sin(k.angle);
    switch (action.id) {
      case "banana":
        this.hazards.push(new Banana(k.x - ca * (k.radius + 16), k.y - sa * (k.radius + 16), k));
        Sound.shellFire();
        break;
      case "green":
        this.hazards.push(new Shell(k.x + ca * (k.radius + 18), k.y + sa * (k.radius + 18), k.angle, k, "green"));
        Sound.shellFire();
        break;
      case "red": {
        const target = this._kartAhead(k, game.karts);
        this.hazards.push(new Shell(k.x + ca * (k.radius + 18), k.y + sa * (k.radius + 18), k.angle, k, "red", target));
        Sound.shellFire();
        break;
      }
      case "lightning":
        for (const o of game.karts) {
          if (o === k) continue;
          o.hit("lightning");
        }
        game.flash("#ffe23c");
        Game.shake(8);
        Sound.lightning();
        break;
    }
  },

  /** The kart one place ahead of `k` (for red-shell homing). */
  _kartAhead(k, karts) {
    let best = null, bestPlace = -Infinity;
    for (const o of karts) {
      if (o === k) continue;
      if (o.place < k.place && o.place > bestPlace) { bestPlace = o.place; best = o; }
    }
    return best;
  },

  update(dt, world) {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      if (!this.hazards[i].update(dt, world)) this.hazards.splice(i, 1);
    }
  },

  draw(ctx, time) { for (const h of this.hazards) h.draw(ctx, time); },
};
