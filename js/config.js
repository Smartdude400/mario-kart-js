/* =============================================================
 * config.js — tuning constants + all game DATA
 * (characters, karts, items, the "Sunset Speedway" track)
 * ============================================================= */

const CONFIG = {
  LAPS: 3,
  COUNTDOWN: 3,                 // seconds in the 3-2-1-GO countdown

  // --- Physics (all distances in world pixels, time in seconds) ---
  // Final stat (1..5) maps to a physical value via base + per-stat scaling.
  speedBase: 300, speedPerStat: 52,        // max forward speed
  accelBase: 1.7, accelPerStat: 0.55,      // approach-rate toward target speed (1/s)
  turnBase: 2.0,  turnPerStat: 0.32,       // base turn rate (rad/s)
  gripBase: 5.0,  gripPerStat: 1.25,       // lateral grip (higher = less slide)
  massBase: 0.6,  massPerStat: 0.3,        // collision mass
  reverseSpeed: 150,

  driftGrip: 1.9,                          // lateral grip while drifting (slidey)
  driftTurnBoost: 1.55,                    // extra steering authority in a drift
  driftMinSpeed: 130,                      // below this, a drift cancels

  // Mini-turbo charge thresholds (seconds holding a valid drift) -> tier
  driftTiers: [
    { t: 0.55, name: "blue",   color: "#49b6ff", boost: 230, dur: 0.55 },
    { t: 1.30, name: "orange", color: "#ff9a3c", boost: 360, dur: 0.85 },
    { t: 2.15, name: "purple", color: "#c97bff", boost: 520, dur: 1.15 },
  ],

  boostMushroom: { boost: 430, dur: 0.9 },
  starBoost: 300, starDur: 7.0,
  lightningDur: 6.5, lightningSlow: 0.55, lightningShrink: 0.55,
  spinDur: 1.25,                           // spin-out lockout
  squishDur: 2.2,

  offTrackSpeed: 0.45,                      // max-speed multiplier on grass/sand
  offTrackWobble: 0.9,                      // random heading jitter off-track

  kartRadius: 26,                           // collision radius
  shellSpeed: 720, shellLife: 6.0, shellBounces: 6,
  redShellSpeed: 560, redShellLife: 7.0,
  bananaLife: 22.0,
  itemBoxRespawn: 4.0,                      // seconds before a "?" box returns

  camLerp: 6.0,                             // camera follow smoothing
  camZoom: 0.78,                            // base zoom (smaller = see more)
};

/* --- Characters: Speed / Accel / Weight / Handling (1..5) --- */
const CHARACTERS = [
  { id: "blaze",  name: "Blaze",  color: "#ff5a3c", accent: "#ffd23c",
    speed: 3, accel: 3, weight: 3, handling: 3,
    blurb: "Balanced all-rounder. Forgiving on every corner." },
  { id: "pebble", name: "Pebble", color: "#3cd6ff", accent: "#b8ffec",
    speed: 2, accel: 5, weight: 1, handling: 5,
    blurb: "Light & nimble. Rockets off the line, low top end." },
  { id: "tank",   name: "Tank",   color: "#9a6bff", accent: "#43344f",
    speed: 5, accel: 2, weight: 5, handling: 2,
    blurb: "Heavy bruiser. Huge top speed, shoves lighter karts." },
];

/* --- Karts: stat modifiers layered on top of the character --- */
const KARTS = [
  { id: "standard",  name: "Standard",  mods: { speed: 0, accel: 0, weight: 0, handling: 0 },
    blurb: "Neutral. No surprises." },
  { id: "speedster", name: "Speedster", mods: { speed: +1, accel: 0, weight: 0, handling: -1 },
    blurb: "+1 Speed, -1 Handling. For the brave." },
  { id: "gripper",   name: "Gripper",   mods: { speed: -1, accel: +1, weight: 0, handling: +1 },
    blurb: "+1 Handling, +1 Accel, -1 Speed. Glued to the line." },
];

/* --- Items (exactly 8) --- */
const ITEMS = {
  mushroom:  { id: "mushroom",  name: "Boost Mushroom", glyph: "🍄", color: "#ff5a5a" },
  triple:    { id: "triple",    name: "Triple Mushrooms", glyph: "🍄🍄🍄", color: "#ff7a4a" },
  banana:    { id: "banana",    name: "Banana Peel",    glyph: "🍌", color: "#ffd23c" },
  green:     { id: "green",     name: "Green Shell",    glyph: "🟢", color: "#3cd66a" },
  red:       { id: "red",       name: "Red Shell",      glyph: "🔴", color: "#ff3c3c" },
  lightning: { id: "lightning", name: "Lightning Bolt", glyph: "⚡", color: "#ffe23c" },
  star:      { id: "star",      name: "Star",           glyph: "⭐", color: "#ffd23c" },
  shield:    { id: "shield",    name: "Shield Bubble",  glyph: "🛡️", color: "#5ad6ff" },
};

/* =============================================================
 * "Sunset Speedway" track definition.
 *  - mainCtrl: control points for the closed centerline spline (clockwise).
 *  - shortcutCtrl: a risky narrow chord that cuts the hairpin loop.
 *  - checkpoints are derived from the centerline (see Track).
 * ============================================================= */
const TRACK = {
  name: "Sunset Speedway",
  width: 200,            // main road half-handled in Track (this is full width)
  shortcutWidth: 110,    // narrower => riskier
  samplesPerSeg: 14,

  // Clockwise loop. Designed for: short bottom straight (start/finish),
  // two sweeping turns, and a tight hairpin on the right side.
  mainCtrl: [
    { x: 620,  y: 1560 },  // 0  start/finish — bottom straight begins here
    { x: 1480, y: 1620 },  // 1  short straight (top-speed run)
    { x: 2060, y: 1540 },  // 2
    { x: 2470, y: 1300 },  // 3  sweeping right-hander (Turn 1)
    { x: 2620, y: 980 },   // 4
    { x: 2520, y: 660 },   // 5
    { x: 2220, y: 520 },   // 6  top sweeper
    { x: 1980, y: 600 },   // 7  hairpin entry
    { x: 2060, y: 860 },   // 8  hairpin apex (tight U)
    { x: 1820, y: 980 },   // 9  hairpin exit
    { x: 1480, y: 900 },   // 10
    { x: 1180, y: 1040 },  // 11
    { x: 860,  y: 1020 },  // 12 sweeping left-hander (Turn 2)
    { x: 560,  y: 820 },   // 13
    { x: 360,  y: 980 },   // 14
    { x: 340,  y: 1300 },  // 15 left straight back down
  ],

  // Shortcut: skips the hairpin (points 7..10) via a narrow inside line.
  shortcutCtrl: [
    { x: 1980, y: 600 },
    { x: 1700, y: 760 },
    { x: 1500, y: 880 },
  ],

  startLineSeg: 0,       // checkpoint/segment index that is the finish line
  startOffset: 40,       // start grid placed slightly behind the line

  decorations: "auto",   // generated procedurally in Track
};
