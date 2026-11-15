/* =============================================================
 * ai.js — opponent driver brain.
 * Follows the centerline racing line with a speed-scaled lookahead,
 * brakes for tight corners, drifts the sweepers/hairpin for mini-turbos,
 * sometimes gambles on the shortcut, and uses items offensively/defensively.
 * ============================================================= */

class AIDriver {
  constructor(kart, skill) {
    this.kart = kart;
    this.skill = skill;                       // 0..1 personality/competence
    this.lineOffset = randRange(-28, 28);     // preferred apex offset
    this.itemCooldown = randRange(0.5, 2.0);
    this.onShortcut = false;
    this.usedShortcutThisLap = false;
    this.lastLap = 0;
    this.takesShortcut = Math.random() < 0.5 + skill * 0.2;
    this.driftCooldown = 0;
  }

  update(dt, world) {
    const k = this.kart, track = world.track;
    if (k.spinTimer > 0) return;              // no control while spinning
    const finished = k.finished;              // keep lapping (don't block the road)

    // reset shortcut gamble each new lap
    if (k.lap !== this.lastLap) {
      this.lastLap = k.lap;
      this.usedShortcutThisLap = false;
      this.takesShortcut = Math.random() < 0.45 + this.skill * 0.2;
    }

    const m = distToPolyline(k.x, k.y, track.center, true);
    const idx = m.seg;
    const N = track.N;

    // ---- decide whether to enter the shortcut ----
    if (!this.onShortcut && this.takesShortcut && !this.usedShortcutThisLap &&
        idx >= 90 && idx <= 104) {
      this.onShortcut = true;
    }

    let targetX, targetY, farX, farY;
    if (this.onShortcut) {
      const s = distToPolyline(k.x, k.y, track.shortcut, false);
      const last = track.shortcut.length - 1;
      const ti = Math.min(s.seg + 5, last);
      const fi = Math.min(s.seg + 11, last);
      targetX = track.shortcut[ti].x; targetY = track.shortcut[ti].y;
      farX = track.shortcut[fi].x; farY = track.shortcut[fi].y;
      if (s.seg >= last - 2) { this.onShortcut = false; this.usedShortcutThisLap = true; }
    } else {
      const look = Math.round(6 + k.speed() / 42);
      const t = track.center[(idx + look) % N];
      const f = track.center[(idx + look * 2) % N];
      // apply a small apex offset along the local normal
      const fwd = Math.atan2(track.center[(idx + look + 1) % N].y - t.y,
                             track.center[(idx + look + 1) % N].x - t.x);
      const nx = Math.cos(fwd + Math.PI / 2), ny = Math.sin(fwd + Math.PI / 2);
      targetX = t.x + nx * this.lineOffset; targetY = t.y + ny * this.lineOffset;
      farX = f.x; farY = f.y;
    }

    // ---- steering ----
    const desired = Math.atan2(targetY - k.y, targetX - k.x);
    const err = angDiff(desired, k.angle);
    let steer = clamp(err * 2.6, -1, 1);

    // ---- corner sharpness (for braking + drifting) ----
    const farDir = Math.atan2(farY - k.y, farX - k.x);
    const sharp = Math.abs(angDiff(farDir, k.angle));

    // ---- throttle: ease off / brake for sharp corners ----
    let throttle = 1;
    const corner = clamp((sharp - 0.25) / 1.1, 0, 1);
    throttle = 1 - corner * (0.85 - this.skill * 0.25);
    throttle = Math.max(throttle, 0.4);
    if (sharp > 1.5 && k.speed() > k.maxSpeed * 0.7) throttle = -0.3;   // hard brake

    // ---- rubber-banding vs. the player ----
    const player = world.player;
    if (player && !player.finished) {
      const lead = track.progressValue(player) - track.progressValue(k);
      if (lead > 2.0 && Math.random() < 0.012) k.applyBoost(70, 0.25);  // catch up
      if (lead < -3.5) throttle = Math.min(throttle, 0.92);            // ease off in front
    }

    // ---- drifting through corners for mini-turbos ----
    if (this.driftCooldown > 0) this.driftCooldown -= dt;
    let wantDrift = false;
    if (this.skill > 0.25 && k.speed() > CONFIG.driftMinSpeed * 1.15) {
      if (!k.drifting && sharp > 0.5 && sharp < 1.7 && this.driftCooldown <= 0) wantDrift = true;
      else if (k.drifting && sharp > 0.22) wantDrift = true;           // keep holding
      if (k.drifting && sharp <= 0.22) { wantDrift = false; this.driftCooldown = 0.5; }
    }

    k.controls = { throttle, steer, drift: wantDrift };

    // ---- items ----
    this.itemCooldown -= dt;
    if (k.item && !finished && this.itemCooldown <= 0) this._useItems(world, sharp);
  }

  _useItems(world, sharp) {
    const k = this.kart, id = k.item.id;
    const use = () => { world.game.kartUseItem(k); this.itemCooldown = randRange(0.8, 2.2); };

    // nearest karts ahead / behind
    let behind = null, bd = 1e9, ahead = null, ad = 1e9;
    for (const o of world.karts) {
      if (o === k) continue;
      const d = dist(k.x, k.y, o.x, o.y);
      const rel = angDiff(Math.atan2(o.y - k.y, o.x - k.x), k.angle);
      if (Math.abs(rel) > Math.PI / 2) { if (d < bd) { bd = d; behind = o; } }
      else { if (d < ad) { ad = d; ahead = o; } }
    }

    switch (id) {
      case "mushroom":
      case "triple":
        if (sharp < 0.22) use();                     // burn on straights
        break;
      case "banana":
        if (behind && bd < 320) use();
        else if (Math.random() < 0.01) use();
        break;
      case "green":
        if (ahead && ad < 520 && Math.abs(angDiff(Math.atan2(ahead.y - k.y, ahead.x - k.x), k.angle)) < 0.4) use();
        else if (sharp < 0.2 && Math.random() < 0.02) use();
        break;
      case "red":
        if (k.place > 1 && Math.random() < 0.04) use();
        break;
      case "lightning":
        if (k.place > 1 && Math.random() < 0.03) use();
        break;
      case "star":
        if (ahead && ad < 400) use();
        else if (Math.random() < 0.02) use();
        break;
      case "shield":
        if (behind && bd < 260) use();               // brace for a rear hit
        break;
    }
  }
}
