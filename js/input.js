/* =============================================================
 * input.js — keyboard state + edge detection
 * Exposes a single global `Input` with .accel/.brake/.left/.right/
 * .drift/.item booleans plus .pressed() for one-shot key events.
 * ============================================================= */

const Input = {
  keys: {},
  _justPressed: {},

  accel: false, brake: false, left: false, right: false,
  drift: false, item: false,

  init() {
    window.addEventListener("keydown", (e) => {
      // Avoid the page scrolling when driving.
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Space"].includes(e.key)) {
        e.preventDefault();
      }
      const k = this._norm(e);
      if (!this.keys[k]) this._justPressed[k] = true;
      this.keys[k] = true;
    }, { passive: false });

    window.addEventListener("keyup", (e) => {
      this.keys[this._norm(e)] = false;
    });

    // Drop all keys if the tab loses focus (prevents "stuck throttle").
    window.addEventListener("blur", () => { this.keys = {}; });
  },

  _norm(e) {
    let k = e.key;
    if (k === " ") k = "Space";
    return k.length === 1 ? k.toLowerCase() : k;
  },

  /** Refresh the derived action booleans. Call once per frame BEFORE use. */
  update() {
    const k = this.keys;
    this.accel = k["ArrowUp"] || k["w"];
    this.brake = k["ArrowDown"] || k["s"];
    this.left  = k["ArrowLeft"] || k["a"];
    this.right = k["ArrowRight"] || k["d"];
    this.drift = k["Shift"];
    this.item  = k["Space"] || k["Control"];
  },

  /** One-shot: true only on the frame a key was first pressed. */
  pressed(key) {
    if (this._justPressed[key]) { this._justPressed[key] = false; return true; }
    return false;
  },

  /** Clear the just-pressed buffer (call at end of frame). */
  endFrame() { this._justPressed = {}; },
};
