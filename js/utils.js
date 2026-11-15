/* =============================================================
 * utils.js — math + geometry helpers (no dependencies)
 * Loaded first; everything else builds on these globals.
 * ============================================================= */

const TAU = Math.PI * 2;

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) { return a + angDiff(b, a) * t; }
function deg2rad(d) { return d * Math.PI / 180; }

/** Shortest signed angular difference (b - a), wrapped to [-PI, PI]. */
function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d < -Math.PI) d += TAU;
  if (d > Math.PI) d -= TAU;
  return d;
}
function wrapAngle(a) {
  a %= TAU;
  if (a < 0) a += TAU;
  return a;
}

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

/** Seeded RNG (mulberry32) so layouts are reproducible if desired. */
function makeRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = Math.random;
function randRange(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(randRange(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * Closed Catmull-Rom spline: turns a small list of control points into a
 * smooth, evenly-ish sampled closed loop. Used for the track centerline.
 */
function catmullRomClosed(points, samplesPerSeg) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      const t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      out.push({ x, y });
    }
  }
  return out;
}

/**
 * Distance from point (px,py) to a polyline (optionally closed).
 * Returns { dist, seg, t, nx, ny } where (nx,ny) is the closest point and
 * `seg` is the index of the segment start. Used for off-track tests, shell
 * wall-bounces (via the normal), and progress estimation.
 */
function distToPolyline(px, py, pts, closed) {
  let best = Infinity, bx = 0, by = 0, bseg = 0, bt = 0;
  const n = pts.length;
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1e-6;
    let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
    t = clamp(t, 0, 1);
    const cx = a.x + dx * t, cy = a.y + dy * t;
    const d = dist2(px, py, cx, cy);
    if (d < best) { best = d; bx = cx; by = cy; bseg = i; bt = t; }
  }
  return { dist: Math.sqrt(best), seg: bseg, t: bt, nx: bx, ny: by };
}

/** Linear-time smoothstep ease for screen transitions / camera. */
function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function formatTime(ms) {
  if (ms == null) return "--:--";
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
