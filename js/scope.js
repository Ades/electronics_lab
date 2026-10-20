/* Electronics Lab – multi-channel oscilloscope (voltages and currents) */
(function (EL) {
  'use strict';
  const U = EL.util, C = EL.circuit;
  const COLORS = ['#facc15', '#22d3ee', '#f472b6', '#4ade80', '#fb923c', '#a78bfa', '#f87171', '#e5e7eb'];
  const CAP = 6000, PTS = 600; // ring capacity, samples per screen
  const DIVX = 10, DIVY = 8;
  const SCALES = [];
  for (let e = -6; e <= 2; e++) for (const m of [1, 2, 5]) SCALES.push(m * Math.pow(10, e));

  class Scope {
    constructor(app) {
      this.app = app;
      this.cv = document.getElementById('scopeCanvas');
      this.ctx = this.cv.getContext('2d');
      this.list = document.getElementById('scopeChannels');
      this.traces = [];
      this.colorOf = new Map();
      this.time = new Float64Array(CAP);
      this.bufs = new Map();
      this.head = 0;
      this.count = 0;
      this.nextT = 0;
      this.hoverX = null;
      this.dirty = true;
      this.cv.addEventListener('pointermove', (e) => { this.hoverX = e.offsetX; this.dirty = true; });
      this.cv.addEventListener('pointerleave', () => { this.hoverX = null; this.dirty = true; });
      new ResizeObserver(() => { this.dirty = true; }).observe(this.cv);
    }
    get tdiv() { return this.app.doc.settings.tdiv; }
    colorFor(id) { return this.colorOf.get(id) || null; }

    /** Resolve trace sources against the current netlist/engine. */
    bind() {
      const app = this.app, doc = app.doc, net = app.sim.net;
      const out = [];
      const compById = new Map(doc.comps.map((c) => [c.id, c]));
      const push = (src, extra) => { const r = app.resolveSource(src); if (r) out.push(Object.assign({ id: app.sourceId(src), label: r.label, unit: r.unit, get: r.get }, extra)); };
      for (const c of doc.comps) {
        if (c.type === 'probe') push({ kind: 'comp', id: c.id, q: 'v' }, { id: 'probe:' + c.id, comp: c, removable: 'comp' });
        if (c.type === 'vmeter' && c.props.scope) push({ kind: 'comp', id: c.id, q: 'v' }, { comp: c, removable: 'meter' });
        if (c.type === 'ameter' && c.props.scope) push({ kind: 'comp', id: c.id, q: 'i' }, { comp: c, removable: 'meter' });
      }
      doc.traces = (doc.traces || []).filter((t) => {
        if (t.src.kind === 'comp' && !compById.has(t.src.id)) return false;
        if (t.src.kind === 'node' && !net) return true;
        const n = out.length;
        push(t.src, { src: t, removable: 'trace' });
        return out.length > n;
      });
      // de-duplicate ids
      const seen = new Set();
      this.traces = out.filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
      // colours & buffers
      const used = new Set(this.traces.map((t) => this.colorOf.get(t.id)).filter(Boolean));
      for (const t of this.traces) {
        if (!this.colorOf.has(t.id)) {
          const col = COLORS.find((c) => !used.has(c)) || COLORS[this.colorOf.size % COLORS.length];
          this.colorOf.set(t.id, col);
          used.add(col);
        }
        t.color = this.colorOf.get(t.id);
        const prev = this.state && this.state.get(t.id);
        t.scale = prev ? prev.scale : 'auto';
        t.visible = prev ? prev.visible : true;
        if (!this.bufs.has(t.id)) this.bufs.set(t.id, new Float32Array(CAP).fill(NaN));
      }
      this.state = new Map(this.traces.map((t) => [t.id, t]));
      this.renderList();
      this.dirty = true;
    }

    clear() {
      this.head = 0; this.count = 0; this.nextT = 0;
      for (const b of this.bufs.values()) b.fill(NaN);
      this.dirty = true;
    }

    sample(t) {
      if (!this.traces.length) return;
      if (t + 1e-15 < this.nextT) return;
      const ds = (this.tdiv * DIVX) / PTS;
      this.nextT += ds;
      if (this.nextT < t) this.nextT = t + ds;
      const i = this.head;
      this.time[i] = t;
      for (const tr of this.traces) { const v = tr.get(); this.bufs.get(tr.id)[i] = v; }
      this.head = (i + 1) % CAP;
      if (this.count < CAP) this.count++;
      this.dirty = true;
    }

    /* ---------- channel list (DOM) ---------- */
    renderList() {
      const el = this.list;
      el.innerHTML = '';
      if (!this.traces.length) {
        el.innerHTML = `<div class="scope-empty">No channels yet.<br>Add a <b>Scope probe</b> from the palette, or right-click a component / wire and choose <b>Plot … in oscilloscope</b>.</div>`;
        return;
      }
      this.traces.forEach((t, i) => {
        const row = document.createElement('div');
        row.className = 'ch' + (t.visible ? '' : ' off');
        row.style.setProperty('--c', t.color);
        const unit = t.unit;
        const opts = ['<option value="auto">Auto</option>', ...SCALES.map((s) => `<option value="${s}">${U.fmt(s, unit)}/div</option>`)].join('');
        row.innerHTML = `
          <div class="ch-top">
            <button class="ch-dot" title="Show / hide"><span>${i + 1}</span></button>
            <div class="ch-name" title="${U.esc(t.label)}">${U.esc(t.label)}</div>
            <select class="ch-scale" title="Vertical scale">${opts}</select>
            <button class="ch-x icon-btn sm" title="Remove channel">${EL.icon('x')}</button>
          </div>
          <div class="ch-val">—</div>
          <div class="ch-stats"></div>`;
        const selEl = row.querySelector('.ch-scale');
        selEl.value = String(t.scale);
        selEl.addEventListener('change', () => { t.scale = selEl.value === 'auto' ? 'auto' : +selEl.value; t.vdiv = null; this.dirty = true; });
        row.querySelector('.ch-dot').addEventListener('click', () => { t.visible = !t.visible; row.classList.toggle('off', !t.visible); this.dirty = true; });
        row.querySelector('.ch-x').addEventListener('click', () => this.removeTrace(t));
        t.valEl = row.querySelector('.ch-val');
        t.statsEl = row.querySelector('.ch-stats');
        el.appendChild(row);
      });
    }
    removeTrace(t) {
      const app = this.app;
      if (t.removable === 'trace') { app.doc.traces = app.doc.traces.filter((x) => x !== t.src); app.commit(); }
      else if (t.removable === 'meter') { t.comp.props.scope = false; app.commit(); }
      else if (t.removable === 'comp') { app.doc.comps = app.doc.comps.filter((c) => c !== t.comp); app.editor.sel.delete(t.comp); app.commit(); }
    }
    updateReadouts() {
      if (!this.traces.length) return;
      const win = this._window();
      for (const t of this.traces) {
        if (!t.valEl) continue;
        const last = this.count ? this.bufs.get(t.id)[(this.head - 1 + CAP) % CAP] : NaN;
        t.valEl.textContent = U.fmt(last, t.unit, 4, true);
        const s = this._stats(t, win);
        const nb = (x) => x.replace(/ /g, '\u00a0');
        t.statsEl.textContent = s ? `p-p\u00a0${nb(U.fmt(s.pp, t.unit, 3))} · avg\u00a0${nb(U.fmt(s.avg, t.unit, 3))}${s.f ? ' · f\u00a0' + nb(U.fmt(s.f, 'Hz', 3)) : ''}` : '';
      }
    }

    /* ---------- data window ---------- */
    _idx(k) { return (this.head - this.count + k + CAP) % CAP; } // k-th oldest sample
    _window() {
      if (!this.count) return null;
      const span = this.tdiv * DIVX;
      const tEnd = this.time[this._idx(this.count - 1)];
      let tStart = Math.max(this.time[this._idx(0)], tEnd - span);
      let trig = null;
      if (this.app.doc.settings.scopeMode === 'trigger') {
        const src = this.traces.find((t) => t.visible);
        if (src) {
          const b = this.bufs.get(src.id);
          let mn = Infinity, mx = -Infinity;
          for (let k = 0; k < this.count; k++) { const v = b[this._idx(k)]; if (v < mn) mn = v; if (v > mx) mx = v; }
          const lvl = (mn + mx) / 2;
          if (mx - mn > 1e-9) {
            for (let k = this.count - 1; k > 0; k--) {
              const tk = this.time[this._idx(k)];
              if (tk > tEnd - span * 0.9) continue;
              const a = b[this._idx(k - 1)], c = b[this._idx(k)];
              if (a < lvl && c >= lvl) { tStart = tk - span * 0.1; trig = { t: tk, lvl, src }; break; }
            }
          }
        }
      }
      return { tStart, tEnd: tStart + span, span, trig, tLast: tEnd };
    }
    _range(t, win) {
      const b = this.bufs.get(t.id);
      let mn = Infinity, mx = -Infinity;
      for (let k = 0; k < this.count; k++) {
        const i = this._idx(k), tt = this.time[i];
        if (tt < win.tStart || tt > win.tEnd) continue;
        const v = b[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      return isFinite(mn) ? [mn, mx] : null;
    }
    _stats(t, win) {
      if (!win) return null;
      const b = this.bufs.get(t.id);
      let mn = Infinity, mx = -Infinity, sum = 0, n = 0;
      const vals = [], times = [];
      for (let k = 0; k < this.count; k++) {
        const i = this._idx(k), tt = this.time[i];
        if (tt < win.tStart || tt > win.tEnd) continue;
        const v = b[i];
        if (!isFinite(v)) continue;
        vals.push(v); times.push(tt);
        if (v < mn) mn = v;
        if (v > mx) mx = v;
        sum += v; n++;
      }
      if (!n) return null;
      const avg = sum / n, mid = (mn + mx) / 2;
      let f = 0;
      if (mx - mn > 1e-9) {
        const hy = (mx - mn) * 0.1, cr = [];
        let armed = false;
        for (let i = 0; i < vals.length; i++) {
          if (vals[i] < mid - hy) armed = true;
          else if (armed && vals[i] >= mid) { cr.push(times[i]); armed = false; }
        }
        if (cr.length >= 3) f = (cr.length - 1) / (cr[cr.length - 1] - cr[0]);
      }
      return { pp: mx - mn, avg, f };
    }
    _scaleFor(t, win) {
      if (t.scale !== 'auto') { t.vdiv = t.scale; t.center = 0; return; }
      const r = this._range(t, win);
      if (!r) { t.vdiv = t.vdiv || 1; t.center = t.center || 0; return; }
      const [mn, mx] = r;
      const span = Math.max(mx - mn, Math.max(Math.abs(mx), Math.abs(mn)) * 0.02, 1e-9);
      const need = U.nice125(span / 6);
      if (!t.vdiv || need > t.vdiv || need < t.vdiv / 2.5) t.vdiv = need;
      const mid = (mn + mx) / 2, half = t.vdiv / 2;
      if (t.center == null || mx > t.center + 3.9 * t.vdiv || mn < t.center - 3.9 * t.vdiv || Math.abs(mid - t.center) > 1.5 * t.vdiv) t.center = Math.round(mid / half) * half;
    }

    /* ---------- digital (logic analyser) display ---------- */
    _threshold(t, win) {
      if (t.unit === 'V') return this.app.doc.settings.digTh ?? 2.5;
      const r = this._range(t, win);
      return r ? (r[0] + r[1]) / 2 : 0;
    }
    _drawDigital(ctx, padL, padT, gw, gh, win, vis, xOf) {
      const bus = !!this.app.doc.settings.digBus && vis.length > 1;
      const lanes = Math.max(1, vis.length + (bus ? 1 : 0)), lh = gh / lanes;
      const idx = [];
      for (let k = 0; k < this.count; k++) {
        const i = this._idx(k), tt = this.time[i];
        if (tt >= win.tStart - win.span * 0.01 && tt <= win.tEnd) idx.push(i);
      }
      const ths = vis.map((t) => this._threshold(t, win));
      const bits = vis.map((t, j) => { const b = this.bufs.get(t.id); return idx.map((i) => (isFinite(b[i]) ? (b[i] > ths[j] ? 1 : 0) : -1)); });
      const xs = idx.map((i) => xOf(this.time[i]));
      ctx.save();
      ctx.beginPath(); ctx.rect(padL, padT, gw, gh); ctx.clip();
      const label = (text, y, color) => {
        ctx.font = `600 11px ${EL.FONTS.SANS}`;
        const w = ctx.measureText(text).width + 10;
        ctx.fillStyle = 'rgba(11,16,22,0.85)';
        ctx.fillRect(padL + 2, y - 8, w, 16);
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.fillText(text, padL + 7, y);
      };
      vis.forEach((t, j) => {
        const top = padT + j * lh, hi = top + lh * 0.25, lo = top + lh * 0.8, bj = bits[j];
        if (j) { ctx.strokeStyle = 'rgba(148,163,184,0.18)'; ctx.beginPath(); ctx.moveTo(padL, Math.round(top) + 0.5); ctx.lineTo(padL + gw, Math.round(top) + 0.5); ctx.stroke(); }
        ctx.fillStyle = t.color + '26';
        let start = null;
        for (let k = 0; k < bj.length; k++) {
          if (bj[k] === 1 && start === null) start = xs[k];
          if (bj[k] !== 1 && start !== null) { ctx.fillRect(start, hi, xs[k] - start, lo - hi); start = null; }
        }
        if (start !== null && xs.length) ctx.fillRect(start, hi, xs[xs.length - 1] - start, lo - hi);
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        let prev = -1;
        for (let k = 0; k < bj.length; k++) {
          const b = bj[k];
          if (b < 0) { prev = -1; continue; }
          const y = b ? hi : lo;
          if (prev < 0) ctx.moveTo(xs[k], y);
          else if (b !== prev) { ctx.lineTo(xs[k], prev ? hi : lo); ctx.lineTo(xs[k], y); }
          else ctx.lineTo(xs[k], y);
          prev = b;
        }
        ctx.stroke();
        label(t.label, top + Math.min(12, lh / 2), t.color);
      });
      if (bus) {
        const top = padT + vis.length * lh, mid = top + lh / 2, hh = Math.min(lh * 0.3, 11);
        ctx.strokeStyle = 'rgba(148,163,184,0.18)';
        ctx.beginPath(); ctx.moveTo(padL, Math.round(top) + 0.5); ctx.lineTo(padL + gw, Math.round(top) + 0.5); ctx.stroke();
        const val = idx.map((_, k) => { let v = 0; for (let j = 0; j < vis.length; j++) { if (bits[j][k] < 0) return -1; v |= bits[j][k] << j; } return v; });
        ctx.font = `600 11px ${EL.FONTS.MONO}`;
        ctx.textAlign = 'center';
        let k0 = 0;
        for (let k = 1; k <= val.length; k++) {
          if (k < val.length && val[k] === val[k0]) continue;
          const v = val[k0], x0 = xs[k0], x1 = k < val.length ? xs[k] : xs[val.length - 1];
          if (v >= 0 && x1 - x0 > 1) {
            const e = Math.min(4, (x1 - x0) / 2);
            ctx.strokeStyle = 'rgba(226,232,240,0.75)';
            ctx.fillStyle = 'rgba(226,232,240,0.08)';
            ctx.beginPath();
            ctx.moveTo(x0, mid); ctx.lineTo(x0 + e, mid - hh); ctx.lineTo(x1 - e, mid - hh); ctx.lineTo(x1, mid); ctx.lineTo(x1 - e, mid + hh); ctx.lineTo(x0 + e, mid + hh); ctx.closePath();
            ctx.fill(); ctx.stroke();
            const text = v > 9 ? `${v} (${v.toString(16).toUpperCase()}h)` : String(v);
            const tw = ctx.measureText(text).width;
            if (x1 - x0 > tw + 10) { ctx.fillStyle = 'rgba(241,245,249,0.95)'; ctx.fillText(text, (x0 + x1) / 2, mid + 0.5); }
            else if (x1 - x0 > ctx.measureText(String(v)).width + 6) { ctx.fillStyle = 'rgba(241,245,249,0.95)'; ctx.fillText(String(v), (x0 + x1) / 2, mid + 0.5); }
          }
          k0 = k;
        }
        label(`BUS (CH1 = bit 0)`, top + Math.min(12, lh / 2), 'rgba(226,232,240,0.9)');
      }
      ctx.restore();
      return { ths, bus };
    }

    /* ---------- drawing ---------- */
    draw() {
      this.dirty = false;
      const cv = this.cv, ctx = this.ctx, dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0b1016';
      ctx.fillRect(0, 0, W, H);
      const padL = 10, padR = 10, padT = 10, padB = 22;
      const gw = W - padL - padR, gh = H - padT - padB;
      const dx = gw / DIVX, dy = gh / DIVY;
      const S = this.app.doc.settings, digital = S.scopeDisplay === 'digital';
      // grid
      ctx.strokeStyle = 'rgba(148,163,184,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= DIVX; i++) { const x = Math.round(padL + i * dx) + 0.5; ctx.moveTo(x, padT); ctx.lineTo(x, padT + gh); }
      if (!digital) for (let j = 0; j <= DIVY; j++) { const y = Math.round(padT + j * dy) + 0.5; ctx.moveTo(padL, y); ctx.lineTo(padL + gw, y); }
      ctx.stroke();
      if (!digital) {
        ctx.strokeStyle = 'rgba(148,163,184,0.35)';
        ctx.beginPath();
        const cxl = Math.round(padL + gw / 2) + 0.5, cyl = Math.round(padT + gh / 2) + 0.5;
        ctx.moveTo(cxl, padT); ctx.lineTo(cxl, padT + gh); ctx.moveTo(padL, cyl); ctx.lineTo(padL + gw, cyl);
        for (let i = 0; i <= DIVX * 5; i++) { const x = Math.round(padL + (i * dx) / 5) + 0.5; ctx.moveTo(x, cyl - 3); ctx.lineTo(x, cyl + 3); }
        for (let j = 0; j <= DIVY * 5; j++) { const y = Math.round(padT + (j * dy) / 5) + 0.5; ctx.moveTo(cxl - 3, y); ctx.lineTo(cxl + 3, y); }
        ctx.stroke();
      }

      ctx.font = `11px ${EL.FONTS.MONO}`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(203,213,225,0.75)';
      ctx.textAlign = 'right';
      ctx.fillText(`${U.fmt(this.tdiv, 's')}/div`, W - padR, H - 11);
      ctx.textAlign = 'left';
      const win = this._window();
      if (win) ctx.fillText(`t = ${U.fmt(win.tLast, 's', 4)}`, padL, H - 11);
      if (!this.traces.length) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(203,213,225,0.5)';
        ctx.font = `12px ${EL.FONTS.SANS}`;
        ctx.fillText('No signals – add a scope probe or right-click a component', W / 2, padT + gh / 2 - 14);
        return;
      }
      if (!win) return;
      const xOf = (t) => padL + ((t - win.tStart) / win.span) * gw;
      const vis = this.traces.filter((t) => t.visible);
      let dig = null;
      if (digital) dig = this._drawDigital(ctx, padL, padT, gw, gh, win, vis, xOf);
      else {
      // labels
      let lx = padL + 6;
      ctx.font = `600 11px ${EL.FONTS.SANS}`;
      ctx.textAlign = 'left';
      for (const t of vis) this._scaleFor(t, win);
      vis.forEach((t) => {
        const s = `${t.label}  ${U.fmt(t.vdiv, t.unit)}/div`;
        const w = ctx.measureText(s).width + 14;
        ctx.fillStyle = 'rgba(11,16,22,0.8)';
        ctx.fillRect(lx - 4, padT + 3, w, 18);
        ctx.fillStyle = t.color;
        ctx.fillText(s, lx + 3, padT + 12);
        lx += w + 4;
      });
      // traces
      ctx.save();
      ctx.beginPath();
      ctx.rect(padL, padT, gw, gh);
      ctx.clip();
      for (const t of vis) {
        const b = this.bufs.get(t.id);
        const yOf = (v) => padT + gh / 2 - ((v - t.center) / t.vdiv) * dy;
        // ground / zero marker
        const y0 = yOf(0);
        ctx.fillStyle = t.color;
        if (y0 > padT && y0 < padT + gh) { ctx.beginPath(); ctx.moveTo(padL, y0 - 5); ctx.lineTo(padL + 7, y0); ctx.lineTo(padL, y0 + 5); ctx.fill(); }
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        ctx.shadowColor = t.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        let pen = false;
        for (let k = 0; k < this.count; k++) {
          const i = this._idx(k), tt = this.time[i];
          if (tt < win.tStart - win.span * 0.01 || tt > win.tEnd) continue;
          const v = b[i];
          if (!isFinite(v)) { pen = false; continue; }
          const x = xOf(tt), y = U.clamp(yOf(v), -1e4, 1e4);
          if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      if (win.trig) {
        const t = win.trig.src, x = xOf(win.trig.t), y = padT + gh / 2 - ((win.trig.lvl - t.center) / t.vdiv) * dy;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.moveTo(x - 5, padT); ctx.lineTo(x + 5, padT); ctx.lineTo(x, padT + 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(padL + gw, y - 5); ctx.lineTo(padL + gw - 7, y); ctx.lineTo(padL + gw, y + 5); ctx.fill();
      }
      ctx.restore();
      }

      // cursor readout
      if (this.hoverX != null && this.hoverX > padL && this.hoverX < padL + gw) {
        const x = this.hoverX, tc = win.tStart + ((x - padL) / gw) * win.span;
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x + 0.5, padT); ctx.lineTo(x + 0.5, padT + gh); ctx.stroke();
        ctx.setLineDash([]);
        let best = -1, bd = Infinity;
        for (let k = 0; k < this.count; k++) { const d = Math.abs(this.time[this._idx(k)] - tc); if (d < bd) { bd = d; best = this._idx(k); } }
        if (best >= 0) {
          const val = (t, j) => {
            const v = this.bufs.get(t.id)[best];
            return dig ? (isFinite(v) ? (v > dig.ths[j] ? '1' : '0') : '–') : U.fmt(v, t.unit, 4);
          };
          const lines = [`t = ${U.fmt(this.time[best], 's', 4)}`, ...vis.map((t, j) => [t, `${t.label}: ${val(t, j)}`])];
          if (dig && dig.bus) {
            const bits = vis.map((t, j) => { const v = this.bufs.get(t.id)[best]; return isFinite(v) ? (v > dig.ths[j] ? 1 : 0) : 0; });
            const b = bits.reduce((a, x, j) => a | (x << j), 0);
            lines.push(`bus = ${b} (0x${b.toString(16).toUpperCase()}, ${bits.slice().reverse().join('')}b)`);
          }
          ctx.font = `11px ${EL.FONTS.MONO}`;
          const w = Math.max(...lines.map((l) => ctx.measureText(typeof l === 'string' ? l : l[1]).width)) + 16;
          const h = lines.length * 16 + 8;
          let bx = x + 10;
          if (bx + w > padL + gw) bx = x - 10 - w;
          const by = padT + 28;
          ctx.fillStyle = 'rgba(15,23,32,0.92)';
          ctx.strokeStyle = 'rgba(148,163,184,0.3)';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 6); else ctx.rect(bx, by, w, h);
          ctx.fill(); ctx.stroke();
          lines.forEach((l, i) => {
            ctx.fillStyle = typeof l === 'string' ? 'rgba(226,232,240,0.9)' : l[0].color;
            ctx.fillText(typeof l === 'string' ? l : l[1], bx + 8, by + 12 + i * 16);
          });
          for (const t of dig ? [] : vis) {
            const v = this.bufs.get(t.id)[best];
            if (!isFinite(v)) continue;
            const y = padT + gh / 2 - ((v - t.center) / t.vdiv) * dy;
            ctx.fillStyle = t.color;
            ctx.beginPath(); ctx.arc(xOf(this.time[best]), y, 3.2, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }
  }

  Scope.TDIVS = SCALES.filter((s) => s >= 1e-6 && s <= 5);
  EL.Scope = Scope;
})(globalThis.EL = globalThis.EL || {});
