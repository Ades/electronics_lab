/* Electronics Lab – Painter: drawing primitives in a component's local grid coordinates */
(function (EL) {
  'use strict';
  const SANS = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

  class Painter {
    constructor(ctx) {
      this.ctx = ctx;
      this.fg = '#111';
      this.bg = '#fff';
      this.iec = true;
      this.st = null;
      this.vcol = null; // v -> colour for voltage-coloured leads
      this.th = {};
      this.lwu = 0.09; // line width in grid units
      this.mult = 1;
    }
    width(m) { this.mult = m; }
    _stroke(color) {
      const c = this.ctx;
      c.strokeStyle = color || this.fg;
      c.lineWidth = this.lwu * this.mult;
      c.lineCap = 'round';
      c.lineJoin = 'round';
    }
    _fill(f) { return f === true ? this.fg : f === 'bg' ? this.bg : f; }
    leadColor(pin) {
      if (this.vcol && this.st && pin != null && this.st.v[pin] !== undefined) return this.vcol(this.st.v[pin]);
      return null;
    }
    line(x1, y1, x2, y2, color) {
      const c = this.ctx;
      this._stroke(color);
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    }
    lead(x1, y1, x2, y2, pin) { this.line(x1, y1, x2, y2, this.leadColor(pin)); }
    poly(pts, close, fill, strokeColor, stroke = true) {
      const c = this.ctx;
      c.beginPath();
      c.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
      if (close) c.closePath();
      if (fill) { c.fillStyle = this._fill(fill); c.fill(); }
      if (stroke) { this._stroke(strokeColor); c.stroke(); }
    }
    circle(x, y, r, fill, stroke = true) {
      const c = this.ctx;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
      if (fill) { c.fillStyle = this._fill(fill); c.fill(); }
      if (stroke) { this._stroke(); c.stroke(); }
    }
    arc(x, y, r, a0, a1) {
      const c = this.ctx;
      this._stroke();
      c.beginPath(); c.arc(x, y, r, a0, a1); c.stroke();
    }
    rect(x1, y1, x2, y2, fill, radius = 0, stroke = true) {
      const c = this.ctx;
      c.beginPath();
      if (radius && c.roundRect) c.roundRect(x1, y1, x2 - x1, y2 - y1, radius);
      else c.rect(x1, y1, x2 - x1, y2 - y1);
      if (fill) { c.fillStyle = this._fill(fill); c.fill(); }
      if (stroke) { this._stroke(); c.stroke(); }
    }
    path(fn, fill, stroke = true) {
      const c = this.ctx;
      c.beginPath(); fn(c);
      if (fill) { c.fillStyle = this._fill(fill); c.fill(); }
      if (stroke) { this._stroke(); c.stroke(); }
    }
    arrowHead(x, y, ang, s = 0.35, color) {
      const c = this.ctx;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - s * Math.cos(ang - 0.42), y - s * Math.sin(ang - 0.42));
      c.lineTo(x - s * Math.cos(ang + 0.42), y - s * Math.sin(ang + 0.42));
      c.closePath();
      c.fillStyle = color || this.fg;
      c.fill();
    }
    arrow(x1, y1, x2, y2, s = 0.32, color) {
      const ang = Math.atan2(y2 - y1, x2 - x1);
      this.line(x1, y1, x2 - Math.cos(ang) * s * 0.6, y2 - Math.sin(ang) * s * 0.6, color);
      this.arrowHead(x2, y2, ang, s, color);
    }
    glow(x, y, r, rgb, a) {
      const c = this.ctx;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${0.75 * a})`);
      g.addColorStop(0.45, `rgba(${rgb},${0.35 * a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    /** Upright text on a rounded background, centred at a local point (meter read-outs). */
    badge(s, x, y, o = {}) {
      const c = this.ctx, m = c.getTransform();
      const sx = m.a * x + m.c * y + m.e, sy = m.b * x + m.d * y + m.f, scale = Math.hypot(m.a, m.b);
      const size = (o.size || 0.58) * scale;
      if (size < 3) return;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.font = `${o.weight || 600} ${size}px ${o.mono ? MONO : SANS}`;
      const w = Math.max(c.measureText(s).width + size * 1.1, (o.minWidth || 0) * scale), h = size * 1.75;
      c.beginPath();
      if (c.roundRect) c.roundRect(sx - w / 2, sy - h / 2, w, h, size * 0.35); else c.rect(sx - w / 2, sy - h / 2, w, h);
      c.fillStyle = o.bg || this.bg;
      c.fill();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = o.color || this.fg;
      c.fillText(s, sx, sy + size * 0.04);
      c.restore();
    }
    /** Upright text at a local point. Names starting with "~" get an overline (active-low pins). */
    text(s, x, y, o = {}) {
      if (s === '' || s == null) return;
      const c = this.ctx;
      const m = c.getTransform();
      const sx = m.a * x + m.c * y + m.e, sy = m.b * x + m.d * y + m.f;
      let align = o.align || 'center';
      if (align !== 'center') {
        if (Math.abs(m.a) >= Math.abs(m.b)) { if (m.a < 0) align = align === 'left' ? 'right' : 'left'; }
        else align = 'center';
      }
      const scale = Math.hypot(m.a, m.b);
      const size = (o.size || 0.6) * scale;
      if (size < 3) return;
      let str = String(s), over = false;
      if (str.startsWith('~')) { over = true; str = str.slice(1); }
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.font = `${o.weight || 500} ${size}px ${o.mono ? MONO : SANS}`;
      c.textAlign = align;
      c.textBaseline = o.baseline || 'middle';
      c.fillStyle = o.color || this.fg;
      const maxW = o.maxWidth ? o.maxWidth * scale : undefined;
      c.fillText(str, sx, sy, maxW);
      if (over) {
        const w = c.measureText(str).width;
        const x0 = align === 'center' ? sx - w / 2 : align === 'right' ? sx - w : sx;
        const yy = sy - size * (o.baseline === 'bottom' ? 0.95 : o.baseline === 'top' ? -0.05 : 0.48);
        c.strokeStyle = c.fillStyle;
        c.lineWidth = Math.max(1, size * 0.07);
        c.beginPath(); c.moveTo(x0, yy); c.lineTo(x0 + w, yy); c.stroke();
      }
      c.restore();
    }
  }

  /** Draw a component at its position using the painter. ctx must already be in world units. */
  function drawComponent(p, comp) {
    const t = EL.types[comp.type];
    const c = p.ctx;
    c.save();
    c.translate(comp.x, comp.y);
    if (comp.rot) c.rotate((comp.rot * Math.PI) / 2);
    if (comp.flip) c.scale(-1, 1);
    t.draw(p, comp);
    c.restore();
  }

  /** Render a component into a small canvas (palette icons, previews). */
  function drawIcon(canvas, comp, theme, iec, opts = {}) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const b = EL.circuit.worldBox(Object.assign({}, comp, { x: 0, y: 0 }));
    const pad = opts.pad ?? 0.4;
    const bw = b.x2 - b.x1 + 2 * pad, bh = b.y2 - b.y1 + 2 * pad;
    const s = Math.min((w * dpr) / bw, (h * dpr) / bh, opts.maxScale ? opts.maxScale * dpr : Infinity);
    ctx.setTransform(s, 0, 0, s, (w * dpr) / 2 - ((b.x1 + b.x2) / 2) * s, (h * dpr) / 2 - ((b.y1 + b.y2) / 2) * s);
    const p = new Painter(ctx);
    p.fg = theme.comp; p.bg = theme.compFill; p.iec = iec; p.th = theme;
    p.lwu = (opts.lineWidth || 1.25) * dpr / s;
    drawComponent(p, Object.assign({}, comp, { x: 0, y: 0 }));
  }

  EL.Painter = Painter;
  EL.drawComponent = drawComponent;
  EL.drawIcon = drawIcon;
  EL.FONTS = { SANS, MONO };
})(globalThis.EL = globalThis.EL || {});
