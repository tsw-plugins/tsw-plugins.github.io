"use strict";
// The session page's map: the master's `map` (far-space centimetres, every
// 5 s) drawn top-down, moving smoothly between updates. Screen right is +Y,
// screen up is +X, as the mod's own web view draws the engine's top view.

class LiveMap {
  constructor(canvas, scaleBox) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.scaleBox = scaleBox;
    this.from = null;     // previous map
    this.to = null;       // latest map
    this.at = 0;          // when `to` arrived (ms)
    this.view = null;     // { x, y, m }: centre (metres) and pixels per metre
    this.fitted = false;
    this.drag = null;
    this.bind();
    requestAnimationFrame(() => this.frame());
  }

  /// A new map from the master.
  update(map) {
    const same = this.to && JSON.stringify(this.to) === JSON.stringify(map);
    if (same) return;
    this.from = this.to ? this.current() : map;
    this.to = map;
    this.at = performance.now();
    if (!this.fitted) this.fit();
  }

  /// The map as drawn now: players and train moved part of the way.
  current() {
    if (!this.to) return null;
    const k = Math.min(1, (performance.now() - this.at) / 5000);
    const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * k);
    const before = new Map((this.from?.players || []).map((p) => [p.name, p]));
    const players = this.to.players.map((p) => {
      const old = before.get(p.name);
      return old ? { ...p, far: lerp(old.far, p.far) } : p;
    });
    const t0 = this.from?.train || [];
    const train = this.to.train.map((v, i) => (t0.length === this.to.train.length ? lerp(t0[i], v) : v));
    return { players, train };
  }

  /// Centre and zoom on everything.
  fit() {
    const pts = [...this.to.players.map((p) => p.far), ...this.to.train];
    if (!pts.length) return;
    const xs = pts.map((p) => p[0] / 100);
    const ys = pts.map((p) => p[1] / 100);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const { width, height } = this.size();
    const m = Math.min(4, Math.max(0.002, Math.min(width / (spanY + 200), height / (spanX + 200))));
    this.view = {
      x: (Math.max(...xs) + Math.min(...xs)) / 2,
      y: (Math.max(...ys) + Math.min(...ys)) / 2,
      m,
    };
    this.fitted = true;
  }

  size() {
    const r = this.canvas.getBoundingClientRect();
    return { width: Math.max(1, r.width), height: Math.max(1, r.height) };
  }

  /// Far-space centimetres → canvas pixels.
  toScreen(far) {
    const { width, height } = this.size();
    return [
      width / 2 + (far[1] / 100 - this.view.y) * this.view.m,
      height / 2 - (far[0] / 100 - this.view.x) * this.view.m,
    ];
  }

  frame() {
    this.draw();
    requestAnimationFrame(() => this.frame());
  }

  draw() {
    const { width, height } = this.size();
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    const ctx = this.ctx;
    const css = getComputedStyle(document.documentElement);
    const color = (name) => css.getPropertyValue(name).trim();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = color("--panel");
    ctx.fillRect(0, 0, width, height);
    const now = this.current();
    if (!now || !this.view) return;
    this.grid(ctx, width, height, color("--grid"));
    if (now.train.length) {
      ctx.strokeStyle = color("--train");
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      now.train.forEach((v, i) => {
        const [x, y] = this.toScreen(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      if (now.train.length === 1) ctx.lineTo(...this.toScreen(now.train[0]).map((c) => c + 0.1));
      ctx.stroke();
    }
    ctx.font = "12px system-ui, sans-serif";
    for (const p of now.players) {
      const [x, y] = this.toScreen(p.far);
      ctx.fillStyle = p.host ? color("--host") : color("--player");
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      const yaw = (p.yaw * Math.PI) / 180;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin(yaw) * 12, y - Math.cos(yaw) * 12);
      ctx.stroke();
      ctx.fillStyle = color("--text");
      ctx.fillText(p.name, x + 9, y - 8);
    }
    this.scale();
  }

  grid(ctx, width, height, colour) {
    const step = this.niceStep(80 / this.view.m);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const left = this.view.y - width / 2 / this.view.m;
    const top = this.view.x + height / 2 / this.view.m;
    for (let y = Math.floor(left / step) * step; y < left + width / this.view.m; y += step) {
      const sx = width / 2 + (y - this.view.y) * this.view.m;
      ctx.moveTo(sx, 0); ctx.lineTo(sx, height);
    }
    for (let x = Math.ceil(top / step) * step; x > top - height / this.view.m; x -= step) {
      const sy = height / 2 - (x - this.view.x) * this.view.m;
      ctx.moveTo(0, sy); ctx.lineTo(width, sy);
    }
    ctx.stroke();
  }

  niceStep(metres) {
    const p = 10 ** Math.floor(Math.log10(metres));
    return [1, 2, 5, 10].map((f) => f * p).find((s) => s >= metres) || p * 10;
  }

  scale() {
    const step = this.niceStep(100 / this.view.m);
    const label = step >= 1000 ? `${step / 1000} km` : `${step} m`;
    this.scaleBox.innerHTML = `${label}<i style="width:${Math.round(step * this.view.m)}px"></i>`;
  }

  bind() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      if (!this.view) return;
      this.drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      this.view.y = this.drag.vy - (e.clientX - this.drag.x) / this.view.m;
      this.view.x = this.drag.vx + (e.clientY - this.drag.y) / this.view.m;
    });
    c.addEventListener("pointerup", () => { this.drag = null; });
    c.addEventListener("wheel", (e) => {
      if (!this.view) return;
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      this.view.m = Math.min(20, Math.max(0.0005, this.view.m * f));
    }, { passive: false });
    c.addEventListener("dblclick", () => this.to && this.fit());
  }
}
