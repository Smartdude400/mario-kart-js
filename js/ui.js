/* =============================================================
 * ui.js — screens, HUD, minimap, speedometer.
 * Pure presentation; the game wires callbacks (onStart, onConfirm…).
 * ============================================================= */

const UI = {
  selChar: 0, selKart: 0,
  cb: {},                          // callbacks set by game

  init() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $("hud"),
      lap: $("lap"), posNum: $("pos-num"), posOrd: $("pos-ord"), posOf: $("pos-of"),
      timer: $("timer"),
      itemBox: $("item-box"), itemGlyph: $("item-glyph"), itemLabel: $("item-label"),
      minimap: $("minimap"), poslist: $("poslist"),
      speedo: $("speedo"),
      driftWrap: $("drift-wrap"), driftBar: $("drift-bar"),
      wrongway: $("wrongway"),
      screenTitle: $("screen-title"), screenSelect: $("screen-select"),
      screenResults: $("screen-results"), resultsList: $("results-list"), resultsTitle: $("results-title"),
      overlayCountdown: $("overlay-countdown"), countdownNum: $("countdown-num"),
      overlayPause: $("overlay-pause"),
      charList: $("char-list"), kartList: $("kart-list"),
      previewName: $("preview-name"), statBars: $("stat-bars"),
      chkMute: $("chk-mute"),
    };
    this.mmCtx = this.el.minimap.getContext("2d");
    this.spCtx = this.el.speedo.getContext("2d");

    $("btn-start").onclick = () => this.cb.onStart && this.cb.onStart();
    $("btn-race").onclick = () => this.cb.onConfirm && this.cb.onConfirm(CHARACTERS[this.selChar].id, KARTS[this.selKart].id);
    $("btn-back").onclick = () => this.showTitle();
    $("btn-again").onclick = () => this.cb.onRaceAgain && this.cb.onRaceAgain();
    $("btn-resume").onclick = () => this.cb.onResume && this.cb.onResume();
    $("btn-quit").onclick = () => this.cb.onQuit && this.cb.onQuit();
    this.el.chkMute.onchange = (e) => Sound.setMuted(e.target.checked);

    this._buildSelect();
  },

  _hideAll() {
    for (const k of ["screenTitle", "screenSelect", "screenResults", "overlayPause"]) this.el[k].classList.add("hidden");
    this.el.overlayCountdown.classList.add("hidden");
    this.el.hud.classList.add("hidden");
  },
  showTitle() { this._hideAll(); this.el.screenTitle.classList.remove("hidden"); },
  showSelect() { this._hideAll(); this.el.screenSelect.classList.remove("hidden"); this._updatePreview(); },
  showHUD() { this._hideAll(); this.el.hud.classList.remove("hidden"); },
  showPause() { this.el.overlayPause.classList.remove("hidden"); },
  hidePause() { this.el.overlayPause.classList.add("hidden"); },

  showCountdown(text) {
    this.el.overlayCountdown.classList.remove("hidden");
    this.el.countdownNum.textContent = text;
    // retrigger pop animation
    this.el.countdownNum.style.animation = "none";
    void this.el.countdownNum.offsetWidth;
    this.el.countdownNum.style.animation = "";
  },
  hideCountdown() { this.el.overlayCountdown.classList.add("hidden"); },

  /* ---------- select screen ---------- */
  _buildSelect() {
    const mkCard = (data, list, kind, idx) => {
      const c = document.createElement("div");
      c.className = "card" + ((kind === "char" ? this.selChar : this.selKart) === idx ? " sel" : "");
      const sw = kind === "char"
        ? `<div class="swatch" style="background:${data.color}"></div>`
        : `<div class="swatch" style="background:linear-gradient(135deg,#888,#444)"></div>`;
      c.innerHTML = `${sw}<div class="cname">${data.name}</div><div class="cblurb">${data.blurb}</div>`;
      c.onclick = () => {
        if (kind === "char") this.selChar = idx; else this.selKart = idx;
        this._refreshCards(); this._updatePreview();
        Sound.resume(); Sound.pickup();
      };
      list.appendChild(c);
    };
    CHARACTERS.forEach((d, i) => mkCard(d, this.el.charList, "char", i));
    KARTS.forEach((d, i) => mkCard(d, this.el.kartList, "kart", i));
  },
  _refreshCards() {
    [...this.el.charList.children].forEach((c, i) => c.classList.toggle("sel", i === this.selChar));
    [...this.el.kartList.children].forEach((c, i) => c.classList.toggle("sel", i === this.selKart));
  },
  _updatePreview() {
    const ch = CHARACTERS[this.selChar], kt = KARTS[this.selKart];
    this.el.previewName.textContent = `${ch.name} + ${kt.name}`;
    const stats = [
      ["Speed", "speed"], ["Accel", "accel"], ["Weight", "weight"], ["Handling", "handling"],
    ];
    this.el.statBars.innerHTML = stats.map(([lbl, key]) => {
      const val = clamp(ch[key] + kt.mods[key], 1, 5);
      return `<div class="stat-line"><span class="lbl">${lbl}</span>
        <span class="stat-track"><span class="stat-fill" style="width:${val / 5 * 100}%"></span></span>
        <b>${val}</b></div>`;
    }).join("");
  },

  /* ---------- HUD ---------- */
  _ord(n) { return n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"; },

  updateHUD(player, karts, raceTime, track) {
    const e = this.el;
    e.lap.textContent = `LAP ${clamp(player.lap + 1, 1, CONFIG.LAPS)}/${CONFIG.LAPS}`;
    e.posNum.textContent = player.place;
    e.posOrd.textContent = this._ord(player.place);
    e.posOf.textContent = ` / ${karts.length}`;
    e.timer.textContent = formatTime(raceTime);

    // item box
    if (player.item) {
      const it = ITEMS[player.item.id];
      e.itemGlyph.textContent = it.glyph;
      e.itemBox.classList.remove("spin");
    } else {
      e.itemGlyph.textContent = "";
      e.itemBox.classList.remove("spin");
    }

    // drift charge bar
    if (player.drifting && player.driftDir !== 0) {
      e.driftWrap.classList.add("on");
      const tiers = CONFIG.driftTiers;
      const maxT = tiers[tiers.length - 1].t;
      e.driftBar.style.width = `${clamp(player.driftCharge / maxT, 0, 1) * 100}%`;
      e.driftBar.style.background = player.driftTier >= 1 ? tiers[player.driftTier - 1].color : "#888";
    } else {
      e.driftWrap.classList.remove("on");
    }

    e.wrongway.classList.toggle("hidden", !player.wrongWay);

    this._drawMinimap(track, karts, player);
    this._drawSpeedo(player);
    this._drawPosList(karts, player);
  },

  _drawPosList(karts, player) {
    const sorted = [...karts].sort((a, b) => a.place - b.place);
    this.el.poslist.innerHTML = sorted.map(k =>
      `<div class="${k === player ? "me" : ""}">${k.place}. ${k.name}</div>`).join("");
  },

  _mapXform(track) {
    const b = track.bounds, c = this.el.minimap;
    const pad = 12;
    const s = Math.min((c.width - pad * 2) / b.w, (c.height - pad * 2) / b.h);
    const ox = (c.width - b.w * s) / 2, oy = (c.height - b.h * s) / 2;
    return { s, ox, oy, b };
  },
  _drawMinimap(track, karts, player) {
    const ctx = this.mmCtx, c = this.el.minimap;
    const { s, ox, oy, b } = this._mapXform(track);
    ctx.clearRect(0, 0, c.width, c.height);
    const mp = (p) => [ox + (p.x - b.minX) * s, oy + (p.y - b.minY) * s];

    // track
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = Math.max(3, track.width * s);
    ctx.beginPath();
    track.center.forEach((p, i) => { const [x, y] = mp(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = "rgba(255,200,120,0.7)"; ctx.lineWidth = Math.max(2, track.shortcutWidth * s);
    ctx.setLineDash([4, 4]); ctx.beginPath();
    track.shortcut.forEach((p, i) => { const [x, y] = mp(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke(); ctx.setLineDash([]);

    // start line dot
    const [sx, sy] = mp(track.checkpoints[0]);
    ctx.fillStyle = "#fff"; ctx.fillRect(sx - 3, sy - 3, 6, 6);

    // karts
    for (const k of karts) {
      const [x, y] = mp(k);
      ctx.beginPath(); ctx.arc(x, y, k === player ? 5 : 4, 0, TAU);
      ctx.fillStyle = k === player ? "#fff" : k.color; ctx.fill();
      if (k === player) { ctx.lineWidth = 2; ctx.strokeStyle = "#ffd23c"; ctx.stroke(); }
    }
  },

  _drawSpeedo(player) {
    const ctx = this.spCtx, c = this.el.speedo, cx = c.width / 2, cy = c.height / 2 + 8, R = 56;
    ctx.clearRect(0, 0, c.width, c.height);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    // arc track
    ctx.lineWidth = 10; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
    // filled portion
    const v = clamp(player.speed() / (player.maxSpeed * 1.2), 0, 1);
    const boosting = player.boostTimer > 0 || player.starTimer > 0;
    const grd = ctx.createLinearGradient(0, 0, c.width, 0);
    grd.addColorStop(0, "#3cd6ff"); grd.addColorStop(0.6, "#ffd23c"); grd.addColorStop(1, "#ff5a3c");
    ctx.strokeStyle = boosting ? "#fff" : grd;
    if (boosting) { ctx.shadowBlur = 14; ctx.shadowColor = "#ffd23c"; }
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a0 + (a1 - a0) * v); ctx.stroke();
    ctx.shadowBlur = 0;
    // number
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "900 30px 'Trebuchet MS', sans-serif";
    ctx.fillText(Math.round(player.speed() / 4), cx, cy - 4);
    ctx.font = "700 12px 'Trebuchet MS', sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("KM/H", cx, cy + 18);
  },

  /* ---------- results ---------- */
  showResults(karts, playerKart) {
    this._hideAll();
    const sorted = [...karts].sort((a, b) => a.place - b.place);
    const won = playerKart.place === 1;
    this.el.resultsTitle.textContent = won ? "🏆 You Win!" : `You finished ${playerKart.place}${this._ord(playerKart.place)}`;
    this.el.resultsList.innerHTML = sorted.map(k => `
      <div class="result-row ${k === playerKart ? "me" : ""}">
        <span class="rank">${k.place}${this._ord(k.place)}</span>
        <span class="rname" style="color:${k === playerKart ? "#ffd23c" : k.color}">${k.name}</span>
        <span class="rtime">${formatTime(k.finishTime)}</span>
      </div>`).join("");
    this.el.screenResults.classList.remove("hidden");
  },
};
