/* =============================================================
 * track.js — "Sunset Speedway"
 *  - Builds a smooth closed centerline + a risky shortcut.
 *  - surfaceAt(): full-grip road vs. off-track grass/sand.
 *  - Checkpoint ring for lap counting + wrong-way detection.
 *  - Procedural decorations + all track rendering.
 * ============================================================= */

class Track {
  constructor() {
    this.name = TRACK.name;
    this.width = TRACK.width;
    this.shortcutWidth = TRACK.shortcutWidth;

    // --- main centerline (closed smooth loop) ---
    this.center = catmullRomClosed(TRACK.mainCtrl, TRACK.samplesPerSeg);
    this.N = this.center.length;

    // --- shortcut centerline (open quadratic chord) ---
    this.shortcut = this._quad(TRACK.shortcutCtrl, 40);

    this._buildCheckpoints();
    this._buildBounds();
    this._buildDecorations();
    this._buildStartGrid();
    this._buildItemBoxes();
  }

  /* Quadratic bezier sampled through 3 control points (open path). */
  _quad(c, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push({
        x: u * u * c[0].x + 2 * u * t * c[1].x + t * t * c[2].x,
        y: u * u * c[0].y + 2 * u * t * c[1].y + t * t * c[2].y,
      });
    }
    return out;
  }

  /* Centerline forward angle at a sampled index. */
  _forwardAt(i) {
    const a = this.center[(i - 1 + this.N) % this.N];
    const b = this.center[(i + 1) % this.N];
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  /*
   * Checkpoints are evenly spaced gates along the centerline — BUT none are
   * placed inside the hairpin band (indices the shortcut bypasses), so taking
   * the shortcut still satisfies "hit every checkpoint in order".
   */
  _buildCheckpoints() {
    const sps = TRACK.samplesPerSeg;
    // Hairpin-only band in centerline index space (between shortcut endpoints,
    // which attach near control points 7 and 10).
    const hpStart = 7 * sps + 2;
    const hpEnd = 10 * sps - 2;

    const desired = 13;
    const step = Math.floor(this.N / desired);
    this.checkpoints = [];
    for (let i = 0; i < this.N; i += step) {
      if (i > hpStart && i < hpEnd) continue;     // skip hairpin gates
      const p = this.center[i];
      this.checkpoints.push({ x: p.x, y: p.y, angle: this._forwardAt(i), idx: i });
    }
    this.CP = this.checkpoints.length;
    this.gateRadius = this.width * 1.15;
  }

  _buildBounds() {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const p of this.center) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    const m = this.width;
    this.bounds = { minX: minX - m, minY: minY - m, maxX: maxX + m, maxY: maxY + m };
    this.bounds.w = this.bounds.maxX - this.bounds.minX;
    this.bounds.h = this.bounds.maxY - this.bounds.minY;
  }

  _buildStartGrid() {
    const cp = this.checkpoints[0];
    const fwd = cp.angle;
    const nx = Math.cos(fwd + Math.PI / 2), ny = Math.sin(fwd + Math.PI / 2);
    const bx = Math.cos(fwd), by = Math.sin(fwd);
    this.startAngle = fwd;
    this.startGrid = [];
    // 2x2 grid placed behind the start/finish line.
    const lanes = [-1, 1], rows = [0, 1];
    for (const row of rows) {
      for (const lane of lanes) {
        this.startGrid.push({
          x: cp.x - bx * (TRACK.startOffset + row * 70) + nx * lane * 55,
          y: cp.y - by * (TRACK.startOffset + row * 70) + ny * lane * 55,
          angle: fwd,
        });
      }
    }
  }

  _buildItemBoxes() {
    // 5 box clusters spread around the lap (on the racing line).
    const spots = [0.12, 0.30, 0.46, 0.66, 0.85];
    this.itemBoxes = [];
    for (const f of spots) {
      const i = Math.floor(f * this.N) % this.N;
      const p = this.center[i];
      const fwd = this._forwardAt(i);
      const nx = Math.cos(fwd + Math.PI / 2), ny = Math.sin(fwd + Math.PI / 2);
      // a little row of 3 boxes across the road
      for (let k = -1; k <= 1; k++) {
        this.itemBoxes.push({
          x: p.x + nx * k * 52, y: p.y + ny * k * 52,
          active: true, timer: 0, spin: Math.random() * TAU,
        });
      }
    }
  }

  _buildDecorations() {
    const rng = makeRNG(1337);
    this.decor = [];
    const types = ["palm", "palm", "rock", "sign", "cactus"];
    for (let i = 0; i < this.N; i += 5) {
      const p = this.center[i];
      const fwd = this._forwardAt(i);
      const nx = Math.cos(fwd + Math.PI / 2), ny = Math.sin(fwd + Math.PI / 2);
      for (const side of [-1, 1]) {
        if (rng() < 0.45) continue;
        const off = this.width / 2 + 50 + rng() * 220;
        this.decor.push({
          x: p.x + nx * side * off + (rng() - 0.5) * 60,
          y: p.y + ny * side * off + (rng() - 0.5) * 60,
          type: types[Math.floor(rng() * types.length)],
          scale: 0.8 + rng() * 0.7,
          sway: rng() * TAU,
        });
      }
    }
    // A couple of grandstands near the start straight.
    const s = this.checkpoints[0];
    const sn = { x: Math.cos(s.angle + Math.PI / 2), y: Math.sin(s.angle + Math.PI / 2) };
    this.decor.push({ x: s.x + sn.x * 230, y: s.y + sn.y * 230, type: "stand", scale: 1.4, sway: 0 });
    this.decor.push({ x: s.x - sn.x * 230, y: s.y - sn.y * 230, type: "stand", scale: 1.4, sway: 0 });
  }

  /* ---- surface queries ---- */

  /** Nearest road point across main + shortcut (whichever is closer). */
  nearest(x, y) {
    const m = distToPolyline(x, y, this.center, true);
    const s = distToPolyline(x, y, this.shortcut, false);
    if (s.dist - this.shortcutWidth / 2 < m.dist - this.width / 2) {
      return { dist: s.dist, nx: s.nx, ny: s.ny, onShortcut: true,
               halfW: this.shortcutWidth / 2, seg: s.seg, pts: this.shortcut };
    }
    return { dist: m.dist, nx: m.nx, ny: m.ny, onShortcut: false,
             halfW: this.width / 2, seg: m.seg, pts: this.center };
  }

  /** "road" | "grass" + a max-speed multiplier. */
  surfaceAt(x, y) {
    const n = this.nearest(x, y);
    if (n.dist <= n.halfW) return { type: "road", grip: 1, near: n };
    // slight margin of "rumble" before full grass penalty
    return { type: "grass", grip: CONFIG.offTrackSpeed, near: n };
  }

  /** Outward wall normal at a point (from road centerline toward the point). */
  wallNormal(x, y) {
    const n = this.nearest(x, y);
    let dx = x - n.nx, dy = y - n.ny;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len, dist: n.dist, halfW: n.halfW };
  }

  /* ---- progress / laps ---- */

  /** Forward heading of the centerline near a point (for wrong-way checks). */
  forwardDirAt(x, y) {
    const m = distToPolyline(x, y, this.center, true);
    return this._forwardAt(m.seg);
  }

  /** Continuous progress value [0..CP) for ranking, given lap+nextCP+pos. */
  progressValue(kart) {
    const last = (kart.nextCP - 1 + this.CP) % this.CP;
    const a = this.checkpoints[last], b = this.checkpoints[kart.nextCP % this.CP];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((kart.x - a.x) * dx + (kart.y - a.y) * dy) / len2;
    t = clamp(t, 0, 0.999);
    return kart.lap * this.CP + last + t;
  }

  /* ---- update spinning boxes ---- */
  update(dt) {
    for (const box of this.itemBoxes) {
      box.spin += dt * 2.2;
      if (!box.active) {
        box.timer -= dt;
        if (box.timer <= 0) box.active = true;
      }
    }
  }

  /* ============================ RENDER ============================ */

  drawGround(ctx) {
    const b = this.bounds;
    // grass gradient base
    const g = ctx.createLinearGradient(b.minX, b.minY, b.minX, b.maxY);
    g.addColorStop(0, "#caa15a");
    g.addColorStop(0.5, "#9bb24e");
    g.addColorStop(1, "#7a9c44");
    ctx.fillStyle = g;
    ctx.fillRect(b.minX - 600, b.minY - 600, b.w + 1200, b.h + 1200);

    // subtle ground speckle
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#000";
    for (let i = 0; i < 0; i++) {} // (speckle drawn cheaply via pattern below)
    ctx.globalAlpha = 1;
  }

  _strokePath(ctx, pts, closed, width, color) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (closed) ctx.closePath();
    ctx.stroke();
  }

  drawRoad(ctx) {
    // Shortcut (risky dirt) drawn first so the main road overlaps cleanly.
    this._strokePath(ctx, this.shortcut, false, this.shortcutWidth + 16, "#5a4226");
    this._strokePath(ctx, this.shortcut, false, this.shortcutWidth, "#8a6f44");

    // Main road: sandy border, asphalt, then center dashes.
    this._strokePath(ctx, this.center, true, this.width + 30, "#6b5238");
    this._strokePath(ctx, this.center, true, this.width, "#39333f");

    // edge rumble strip (thin lighter line just inside the border)
    ctx.save();
    ctx.setLineDash([26, 22]);
    this._strokePath(ctx, this.center, true, this.width + 8, "rgba(255,255,255,0.10)");
    ctx.restore();

    // center dashes
    ctx.save();
    ctx.setLineDash([34, 40]);
    this._strokePath(ctx, this.center, true, 5, "rgba(255,220,120,0.55)");
    ctx.restore();

    this._drawStartLine(ctx);
  }

  _drawStartLine(ctx) {
    const cp = this.checkpoints[0];
    const fwd = cp.angle;
    const nx = Math.cos(fwd + Math.PI / 2), ny = Math.sin(fwd + Math.PI / 2);
    const bx = Math.cos(fwd), by = Math.sin(fwd);
    const half = this.width / 2;
    const cols = 10, rows = 3, cw = (half * 2) / cols, ch = 16;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = -half + c * cw + cw / 2;       // across road
        const v = -r * ch + ch;                  // along road (behind line)
        const px = cp.x + nx * u + bx * v;
        const py = cp.y + ny * u + by * v;
        ctx.save();
        ctx.translate(px, py); ctx.rotate(fwd);
        ctx.fillStyle = ((r + c) % 2 === 0) ? "#f4f4f4" : "#1a1a1a";
        ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
        ctx.restore();
      }
    }
  }

  drawItemBoxes(ctx, time) {
    for (const box of this.itemBoxes) {
      if (!box.active) continue;
      const s = 24 + Math.sin(time * 3 + box.spin) * 3;
      ctx.save();
      ctx.translate(box.x, box.y);
      ctx.rotate(box.spin);
      ctx.shadowBlur = 16; ctx.shadowColor = "#ffd23c";
      // cube body
      const grd = ctx.createLinearGradient(-s, -s, s, s);
      grd.addColorStop(0, "#ffe680"); grd.addColorStop(1, "#ff9f1c");
      ctx.fillStyle = grd;
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.lineWidth = 3; ctx.strokeStyle = "#7a4a00";
      ctx.strokeRect(-s, -s, s * 2, s * 2);
      ctx.shadowBlur = 0;
      ctx.rotate(-box.spin);
      ctx.fillStyle = "#7a4a00";
      ctx.font = `bold ${s * 1.3}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("?", 0, 2);
      ctx.restore();
    }
  }

  drawDecor(ctx, time) {
    for (const d of this.decor) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.scale(d.scale, d.scale);
      switch (d.type) {
        case "palm": {
          const sway = Math.sin(time * 1.2 + d.sway) * 0.12;
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.beginPath(); ctx.ellipse(6, 8, 26, 10, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = "#7a5230"; ctx.lineWidth = 8; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(0, 6); ctx.quadraticCurveTo(8, -20, 4 + sway * 30, -42); ctx.stroke();
          ctx.fillStyle = "#2f9e44";
          for (let a = 0; a < 6; a++) {
            const ang = (a / 6) * TAU + sway;
            ctx.beginPath();
            ctx.ellipse(4 + sway * 30 + Math.cos(ang) * 18, -42 + Math.sin(ang) * 12,
              20, 8, ang, 0, TAU);
            ctx.fill();
          }
          break;
        }
        case "cactus":
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.beginPath(); ctx.ellipse(0, 6, 14, 6, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = "#3c8c3c";
          ctx.fillRect(-7, -34, 14, 40);
          ctx.fillRect(-22, -20, 12, 10); ctx.fillRect(-22, -20, 8, -16);
          ctx.fillRect(10, -26, 12, 10); ctx.fillRect(14, -42, 8, 18);
          break;
        case "rock":
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.beginPath(); ctx.ellipse(2, 4, 20, 9, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = "#8a8580";
          ctx.beginPath(); ctx.moveTo(-18, 6); ctx.lineTo(-8, -14);
          ctx.lineTo(8, -16); ctx.lineTo(20, 2); ctx.lineTo(10, 8); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#aaa49c";
          ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(8, -16); ctx.lineTo(2, -4); ctx.closePath(); ctx.fill();
          break;
        case "sign":
          ctx.fillStyle = "#5a4226"; ctx.fillRect(-3, -10, 6, 36);
          ctx.fillStyle = "#ff5a3c"; ctx.fillRect(-22, -34, 44, 26);
          ctx.fillStyle = "#fff"; ctx.font = "bold 16px sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("▶", 0, -20);
          break;
        case "stand":
          ctx.fillStyle = "rgba(0,0,0,0.2)";
          ctx.fillRect(-70, -6, 140, 16);
          ctx.fillStyle = "#444";
          ctx.fillRect(-70, -40, 140, 40);
          for (let r = 0; r < 4; r++)
            for (let c = 0; c < 14; c++) {
              ctx.fillStyle = `hsl(${(r * 14 + c) * 23 % 360},70%,60%)`;
              ctx.fillRect(-66 + c * 10, -36 + r * 9, 7, 6);
            }
          ctx.fillStyle = "#c0392b"; ctx.fillRect(-74, -52, 148, 12);
          break;
      }
      ctx.restore();
    }
  }
}
