/* Electronics Lab – data table: record U / I measurements, plot them, sweep a parameter, export CSV */
(function (EL) {
  'use strict';
  const U = EL.util;
  const $ = (s) => document.querySelector(s);
  const MAX_ROWS = 20000;
  const SERIES = { light: ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2'], dark: ['#60a5fa', '#f87171', '#4ade80', '#fbbf24', '#c084fc', '#22d3ee'] };
  const AUTO_DTS = [1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 0.1, 1];

  function defaultTable() {
    return { cols: [{ src: { kind: 'time' } }], rows: [], plot: { x: 0, y: [], connect: 'sorted' }, auto: { on: false, dt: 1e-3 }, sweep: null };
  }

  class DataTable {
    constructor(app) {
      this.app = app;
      this.grid = $('#dtGrid');
      this.cv = $('#dtPlot');
      this.ctx = this.cv.getContext('2d');
      this.ctrls = $('#dtPlotCtrls');
      this.cols = [];
      this.nextT = 0;
      this.dirty = true;
      this.hover = null;
      this.cv.addEventListener('pointermove', (e) => { this.hover = [e.offsetX, e.offsetY]; this.dirty = true; });
      this.cv.addEventListener('pointerleave', () => { this.hover = null; this.dirty = true; });
      new ResizeObserver(() => { this.dirty = true; }).observe(this.cv);
      const sel = $('#dtAutoDt');
      sel.innerHTML = AUTO_DTS.map((v) => `<option value="${v}">${U.fmt(v, 's')}</option>`).join('');
      sel.addEventListener('change', () => { this.T.auto.dt = +sel.value; this.nextT = 0; this.app.saveLocal(); });
      $('#dtAuto').addEventListener('change', (e) => { this.T.auto.on = e.target.checked; this.nextT = 0; this.app.saveLocal(); });
      $('#dtRecord').addEventListener('click', () => this.record(true));
      $('#dtClear').addEventListener('click', () => { if (this.T.rows.length) this.app.ui.confirm('Clear the data table?', `${this.T.rows.length} rows will be removed.`, 'Clear', () => this.clear()); });
      $('#dtCsv').addEventListener('click', () => this.exportCSV());
      $('#dtAddCol').addEventListener('click', (e) => this.columnMenu(e.currentTarget));
      $('#dtSweep').addEventListener('click', () => this.sweepDialog());
    }
    get T() {
      const d = this.app.doc;
      if (!d.table) d.table = defaultTable();
      return d.table;
    }

    /* ---------- columns ---------- */
    bind() {
      const T = this.T;
      this.cols = T.cols.map((c) => {
        const r = this.app.resolveSource(c.src);
        return { src: c.src, id: this.app.sourceId(c.src), label: r ? r.label : c.label || '(removed)', unit: r ? r.unit : c.unit || '', get: r ? r.get : () => NaN, alive: !!r };
      });
      // remember labels so a column whose part was deleted still has a heading
      T.cols.forEach((c, i) => { c.label = this.cols[i].label; c.unit = this.cols[i].unit; });
      $('#dtAuto').checked = !!T.auto.on;
      $('#dtAutoDt').value = String(T.auto.dt);
      this.render();
    }
    has(src) { const id = this.app.sourceId(src); return this.T.cols.some((c) => this.app.sourceId(c.src) === id); }
    addColumn(src, quiet) {
      if (this.has(src)) { if (!quiet) this.app.ui.toast('Already a column in the data table'); return false; }
      const T = this.T;
      T.cols.push({ src });
      for (const r of T.rows) r.push(NaN);
      if (T.plot.y.length === 0 && T.cols.length > 1) T.plot.y = [T.cols.length - 1];
      this.bind();
      this.app.saveLocal();
      if (!quiet) { this.app.showPanel('table'); this.app.ui.toast('Column added to the data table'); }
      return true;
    }
    removeColumn(i) {
      const T = this.T;
      T.cols.splice(i, 1);
      for (const r of T.rows) r.splice(i, 1);
      const fix = (k) => (k > i ? k - 1 : k);
      T.plot.x = T.plot.x === i ? 0 : fix(T.plot.x);
      T.plot.y = T.plot.y.filter((k) => k !== i).map(fix);
      this.bind();
      this.app.saveLocal();
    }
    columnMenu(anchor) {
      const app = this.app, items = [];
      const add = (src, label) => { if (app.resolveSource(src) && !this.has(src)) items.push({ label, action: () => this.addColumn(src) }); };
      add({ kind: 'time' }, 'Time');
      for (const c of app.doc.comps) {
        const t = EL.types[c.type];
        if (!t.measure || c.type === 'ic') continue;
        const name = c.label || t.name;
        const st = app.liveState(c), m = st ? t.measure(c, st) : { V: 0, I: 0 };
        const before = items.length;
        if (m.V !== undefined) add({ kind: 'comp', id: c.id, q: 'v' }, `${c.type === 'probe' ? 'Voltage at' : 'Voltage across'} ${name}`);
        if (m.I !== undefined) add({ kind: 'comp', id: c.id, q: 'i' }, `Current through ${name}`);
        if (m.P !== undefined) add({ kind: 'comp', id: c.id, q: 'p' }, `Power in ${name}`);
        if (items.length > before) items.splice(before, 0, { label: name + ' · ' + t.name, header: true });
      }
      if (items.length <= 1 && !items.some((i) => !i.header)) items.push({ label: 'Nothing to add – place components first', disabled: true });
      items.push({ sep: true }, { label: 'Tip: right-click a wire to add a node voltage', disabled: true });
      app.ui.dropdown(anchor, items);
    }

    /* ---------- recording ---------- */
    record(manual) {
      const app = this.app, T = this.T;
      if (!app.sim.engine || app.sim.engine.error) { if (manual) app.ui.toast('Simulation is not running', 'err'); return; }
      if (T.cols.length === 0) { if (manual) app.ui.toast('Add a column first'); return; }
      if (T.rows.length >= MAX_ROWS) { T.auto.on = false; $('#dtAuto').checked = false; app.ui.toast(`Table is full (${MAX_ROWS} rows) – auto-record stopped`, 'err'); return; }
      T.rows.push(this.cols.map((c) => +c.get()));
      this._appendRow(T.rows.length - 1);
      this.dirty = true;
      this._count();
      if (manual) { app.saveLocal(); app.showPanel('table'); }
    }
    sample(t) {
      const a = this.T.auto;
      if (!a.on) return;
      if (t + 1e-15 < this.nextT && this.nextT - t <= a.dt) return;
      this.nextT = t + a.dt;
      this.record(false);
    }
    clear() {
      this.T.rows = [];
      this.render();
      this.app.saveLocal();
    }
    exportCSV() {
      const T = this.T;
      if (!T.rows.length) { this.app.ui.toast('The table is empty'); return; }
      const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
      const head = this.cols.map((c) => q(`${c.label}${c.unit ? ` [${c.unit}]` : ''}`)).join(',');
      const body = T.rows.map((r) => r.map((v) => (isFinite(v) ? String(v) : '')).join(',')).join('\n');
      U.download((this.app.fileName || 'measurements').replace(/\.json$/, '') + '.csv', head + '\n' + body + '\n', 'text/csv');
    }

    /* ---------- table DOM ---------- */
    _count() { $('#dtCount').textContent = String(this.T.rows.length); }
    render() {
      const T = this.T, g = this.grid;
      this._count();
      if (!T.cols.length) { g.innerHTML = '<div class="dt-empty">No columns. Use <b>+ Column</b> or right-click a part → <i>Add … to data table</i>.</div>'; this._plotCtrls(); this.dirty = true; return; }
      const th = this.cols.map((c, i) => `<th class="${c.alive ? '' : 'dead'}"><div class="dt-th"><span title="${U.esc(c.label)}">${U.esc(c.label)}</span><small>${U.esc(c.unit)}</small><button class="dt-del" data-col="${i}" title="Remove column">×</button></div></th>`).join('');
      g.innerHTML = `<table class="dt"><thead><tr><th class="dt-n">#</th>${th}</tr></thead><tbody></tbody></table>` +
        (T.rows.length ? '' : '<div class="dt-empty">No data yet. Press <b>Record</b> (or <kbd>M</kbd>) to store the current values, turn on <b>auto-record</b>, or run a <b>Sweep</b>.</div>');
      this.tbody = g.querySelector('tbody');
      const frag = document.createDocumentFragment();
      const start = Math.max(0, T.rows.length - 2000);
      for (let i = start; i < T.rows.length; i++) frag.appendChild(this._rowEl(i));
      this.tbody.appendChild(frag);
      g.querySelectorAll('.dt-del').forEach((b) => b.addEventListener('click', () => this.removeColumn(+b.dataset.col)));
      this.tbody.addEventListener('click', (e) => {
        const b = e.target.closest('.dt-rdel');
        if (!b) return;
        T.rows.splice(+b.dataset.row, 1);
        this.render();
        this.app.saveLocal();
      });
      g.scrollTop = g.scrollHeight;
      this._plotCtrls();
      this.dirty = true;
    }
    _rowEl(i) {
      const tr = document.createElement('tr');
      const r = this.T.rows[i];
      tr.innerHTML = `<td class="dt-n"><span>${i + 1}</span><button class="dt-rdel" data-row="${i}" title="Delete row">×</button></td>` + r.map((v, j) => `<td>${U.fmt(v, this.cols[j] ? this.cols[j].unit : '', 4, true)}</td>`).join('');
      return tr;
    }
    _appendRow(i) {
      if (!this.tbody || this.T.rows.length === 1) { this.render(); return; }
      this.tbody.appendChild(this._rowEl(i));
      if (this.tbody.children.length > 2000) this.tbody.firstChild.remove();
      if (this.grid.scrollHeight - this.grid.scrollTop - this.grid.clientHeight < 80) this.grid.scrollTop = this.grid.scrollHeight;
    }

    /* ---------- plot ---------- */
    _plotCtrls() {
      const T = this.T, P = T.plot, h = EL.h;
      this.ctrls.innerHTML = '';
      if (!this.cols.length) return;
      if (P.x >= this.cols.length) P.x = 0;
      const xs = h('select', { class: 'inp sm', onchange: (e) => { P.x = +e.target.value; this.dirty = true; this.app.saveLocal(); } },
        this.cols.map((c, i) => h('option', { value: i }, c.label)));
      xs.value = String(P.x);
      const ys = h('div', { class: 'dt-ys' });
      const pal = this._palette();
      this.cols.forEach((c, i) => {
        if (i === P.x) return;
        const on = P.y.includes(i);
        const b = h('button', { class: 'dt-ychip' + (on ? ' on' : ''), style: `--c:${pal[P.y.indexOf(i) % pal.length] || 'var(--faint)'}`, onclick: () => {
          P.y = on ? P.y.filter((k) => k !== i) : [...P.y, i];
          this._plotCtrls(); this.dirty = true; this.app.saveLocal();
        } }, h('i'), c.label);
        ys.append(b);
      });
      const conn = h('select', { class: 'inp sm', title: 'How points are joined', onchange: (e) => { P.connect = e.target.value; this.dirty = true; this.app.saveLocal(); } },
        h('option', { value: 'sorted' }, 'Line (sorted by X)'), h('option', { value: 'order' }, 'Line (record order)'), h('option', { value: 'none' }, 'Points only'));
      conn.value = P.connect || 'sorted';
      this.ctrls.append(h('label', { class: 'mini-field' }, 'X', xs), h('span', { class: 'mini-field' }, 'Y'), ys, conn);
    }
    _palette() { return SERIES[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light']; }
    draw() {
      this.dirty = false;
      const cv = this.cv, ctx = this.ctx, dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const css = getComputedStyle(document.documentElement);
      const col = (n) => css.getPropertyValue(n).trim();
      const fg = col('--text'), muted = col('--muted'), grid = col('--border');
      ctx.fillStyle = col('--panel');
      ctx.fillRect(0, 0, W, H);
      const T = this.T, P = T.plot, pal = this._palette();
      const ys = P.y.filter((k) => k < this.cols.length && k !== P.x);
      ctx.font = `12px ${EL.FONTS.SANS}`;
      ctx.textBaseline = 'middle';
      if (!T.rows.length || !ys.length) {
        ctx.fillStyle = muted;
        ctx.textAlign = 'center';
        ctx.fillText(!T.rows.length ? 'Recorded data will be plotted here' : 'Choose one or more Y columns above', W / 2, H / 2);
        return;
      }
      // axes: left for the first Y unit, right for a second unit
      const units = [...new Set(ys.map((k) => this.cols[k].unit))].slice(0, 2);
      const axisOf = (k) => (this.cols[k].unit === units[0] ? 0 : this.cols[k].unit === units[1] ? 1 : -1);
      const ext = (vals) => { let a = Infinity, b = -Infinity; for (const v of vals) if (isFinite(v)) { if (v < a) a = v; if (v > b) b = v; } return [a, b]; };
      const xr = ext(T.rows.map((r) => r[P.x]));
      const yr = units.map((u, ai) => ext(ys.filter((k) => axisOf(k) === ai).flatMap((k) => T.rows.map((r) => r[k]))));
      if (!isFinite(xr[0]) || !yr.some((r) => isFinite(r[0]))) return;
      const nice = (a, b) => {
        if (a === b) { const d = Math.abs(a) * 0.1 || 1; a -= d; b += d; }
        const step = U.nice125((b - a) / 5);
        return { lo: Math.floor(a / step + 1e-9) * step, hi: Math.ceil(b / step - 1e-9) * step, step };
      };
      const X = nice(xr[0], xr[1]), Y = yr.map((r) => (isFinite(r[0]) ? nice(r[0], r[1]) : null));
      const padL = 64, padR = units.length > 1 ? 64 : 34, padT = 14, padB = 34;
      const gw = W - padL - padR, gh = H - padT - padB;
      const sx = (v) => padL + ((v - X.lo) / (X.hi - X.lo)) * gw;
      const sy = (v, ai) => padT + gh - ((v - Y[ai].lo) / (Y[ai].hi - Y[ai].lo)) * gh;
      ctx.lineWidth = 1;
      ctx.strokeStyle = grid;
      ctx.fillStyle = muted;
      ctx.font = `11px ${EL.FONTS.MONO}`;
      ctx.beginPath();
      ctx.textAlign = 'center';
      for (let v = X.lo, i = 0; v <= X.hi + X.step * 1e-6 && i < 50; v += X.step, i++) {
        const x = Math.round(sx(v)) + 0.5;
        ctx.moveTo(x, padT); ctx.lineTo(x, padT + gh);
        ctx.fillText(U.fmt(v, this.cols[P.x].unit, 3), x, padT + gh + 12);
      }
      Y.forEach((ax, ai) => {
        if (!ax) return;
        ctx.textAlign = ai ? 'left' : 'right';
        for (let v = ax.lo, i = 0; v <= ax.hi + ax.step * 1e-6 && i < 50; v += ax.step, i++) {
          const y = Math.round(sy(v, ai)) + 0.5;
          if (!ai) { ctx.moveTo(padL, y); ctx.lineTo(padL + gw, y); }
          ctx.fillText(U.fmt(v, units[ai], 3), ai ? padL + gw + 6 : padL - 6, y);
        }
      });
      ctx.stroke();
      ctx.strokeStyle = muted;
      ctx.strokeRect(padL + 0.5, padT + 0.5, gw, gh);
      ctx.textAlign = 'center';
      ctx.font = `600 11px ${EL.FONTS.SANS}`;
      ctx.fillStyle = fg;
      ctx.fillText(`${this.cols[P.x].label}${this.cols[P.x].unit ? ` [${this.cols[P.x].unit}]` : ''}`, padL + gw / 2, H - 9);
      // series
      let best = null;
      ys.forEach((k, si) => {
        const ai = axisOf(k);
        if (ai < 0 || !Y[ai]) return;
        const color = pal[si % pal.length];
        let pts = T.rows.map((r, ri) => [r[P.x], r[k], ri]).filter((p) => isFinite(p[0]) && isFinite(p[1]));
        if ((P.connect || 'sorted') === 'sorted') pts = pts.slice().sort((a, b) => a[0] - b[0]);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        if (P.connect !== 'none' && pts.length > 1) {
          ctx.beginPath();
          pts.forEach((p, i) => (i ? ctx.lineTo(sx(p[0]), sy(p[1], ai)) : ctx.moveTo(sx(p[0]), sy(p[1], ai))));
          ctx.stroke();
        }
        const r = pts.length > 200 ? 1.5 : 3;
        for (const p of pts) {
          const x = sx(p[0]), y = sy(p[1], ai);
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
          if (this.hover) { const d = Math.hypot(x - this.hover[0], y - this.hover[1]); if (d < 14 && (!best || d < best.d)) best = { d, x, y, p, k, color }; }
        }
      });
      // legend
      ctx.font = `600 11px ${EL.FONTS.SANS}`;
      ctx.textAlign = 'left';
      let lx = padL + 8;
      ys.forEach((k, si) => {
        const s = `${this.cols[k].label}${units.length > 1 ? (axisOf(k) ? ' →' : ' ←') : ''}`;
        const w = ctx.measureText(s).width;
        ctx.fillStyle = pal[si % pal.length];
        ctx.fillRect(lx, padT + 8, 10, 3);
        ctx.fillText(s, lx + 14, padT + 10);
        lx += w + 30;
      });
      if (best) {
        const lines = [`#${best.p[2] + 1}`, `${this.cols[P.x].label} = ${U.fmt(best.p[0], this.cols[P.x].unit, 4)}`, `${this.cols[best.k].label} = ${U.fmt(best.p[1], this.cols[best.k].unit, 4)}`];
        ctx.font = `11px ${EL.FONTS.MONO}`;
        const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16, h = lines.length * 16 + 8;
        let bx = best.x + 10, by = best.y - h - 6;
        if (bx + w > W) bx = best.x - w - 10;
        if (by < 0) by = best.y + 10;
        ctx.fillStyle = col('--panel');
        ctx.strokeStyle = best.color;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 6); else ctx.rect(bx, by, w, h);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = fg;
        lines.forEach((l, i) => ctx.fillText(l, bx + 8, by + 12 + i * 16));
        ctx.beginPath(); ctx.arc(best.x, best.y, 5, 0, Math.PI * 2); ctx.strokeStyle = best.color; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    /* ---------- parameter sweep ---------- */
    sweepDialog() {
      const app = this.app, h = EL.h, T = this.T;
      const opts = [];
      for (const c of app.doc.comps) {
        const t = EL.types[c.type];
        for (const p of t.props) if (p.kind === 'num' && c.type !== 'ic') opts.push({ c, p, label: `${c.label || t.name} – ${p.label}${p.unit ? ` (${p.unit})` : ''}` });
      }
      if (!opts.length) { app.ui.toast('No component with an adjustable value'); return; }
      const prev = T.sweep || {};
      let pi = Math.max(0, opts.findIndex((o) => o.c.id === prev.id && o.p.key === prev.key));
      if (!prev.id) { const v = opts.findIndex((o) => ['vdc', 'battery', 'rail', 'idc'].includes(o.c.type)); if (v >= 0) pi = v; }
      const pSel = h('select', { class: 'inp' }, opts.map((o, i) => h('option', { value: i }, o.label)));
      pSel.value = String(pi);
      const cur = () => opts[+pSel.value];
      const fmtIn = (v) => U.fmt(v, '', 4).replace(' ', '');
      const from = h('input', { class: 'inp num', value: fmtIn(prev.id ? prev.from : 0) });
      const to = h('input', { class: 'inp num', value: fmtIn(prev.id ? prev.to : cur().c.props[cur().p.key] || 1) });
      const pts = h('input', { class: 'inp num', value: String(prev.points || 21) });
      const settle = h('input', { class: 'inp num', value: fmtIn(prev.settle || 1e-3) });
      const clear = h('input', { type: 'checkbox', class: 'switch' }); clear.checked = prev.clear !== false;
      const asX = h('input', { type: 'checkbox', class: 'switch' }); asX.checked = prev.asX !== false;
      const unitSpan = h('span', { class: 'unit' }, cur().p.unit);
      const unitSpan2 = h('span', { class: 'unit' }, cur().p.unit);
      pSel.addEventListener('change', () => { unitSpan.textContent = unitSpan2.textContent = cur().p.unit; });
      const prog = h('div', { class: 'sweep-prog', hidden: true }, h('div', { class: 'bar' }, h('i')), h('span', {}, ''));
      const err = h('div', { class: 'ic-err on' });
      const fld = (label, ...ctl) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), h('span', { class: 'field-ctl' }, ...ctl));
      const cols = this.cols.filter((c) => c.src.kind !== 'time' && c.src.kind !== 'param').map((c) => c.label);
      const body = h('div', { class: 'sweep' },
        h('p', { class: 'muted small' }, 'Steps a component value, lets the circuit settle at each step and records one table row per step. Use it for I–U characteristics, transfer curves, etc.'),
        fld('Parameter', pSel),
        h('div', { class: 'ic-row2' }, fld('From', from, unitSpan), fld('To', to, unitSpan2)),
        h('div', { class: 'ic-row2' }, fld('Points', pts), fld('Settle time per point', settle, h('span', { class: 'unit' }, 's'))),
        h('label', { class: 'field check inline' }, clear, h('span', {}, 'Clear the table first')),
        h('label', { class: 'field check inline' }, asX, h('span', {}, 'Plot against the swept value')),
        h('p', { class: 'muted small' }, cols.length ? `Recorded columns: ${cols.join(', ')} (the swept value is added automatically).` : 'Tip: add the voltages / currents you want to record as table columns first.'),
        prog, err);
      let running = false, cancel = false;
      const close = app.ui.modal({
        title: 'Parameter sweep', body,
        onClose: () => { cancel = true; },
        actions: [
          { label: 'Cancel', action: () => { cancel = true; } },
          { label: 'Run sweep', primary: true, keepOpen: true, action: (btn) => {
            if (running) return false;
            const cfg = { id: cur().c.id, key: cur().p.key, from: U.parseValue(from.value), to: U.parseValue(to.value), points: Math.round(+pts.value), settle: U.parseValue(settle.value), clear: clear.checked, asX: asX.checked };
            if (![cfg.from, cfg.to, cfg.settle].every(isFinite) || !(cfg.points >= 2 && cfg.points <= 1000) || cfg.settle <= 0) { err.textContent = 'Check the values (2–1000 points, settle time > 0).'; return false; }
            err.textContent = '';
            running = true; btn.disabled = true; prog.hidden = false;
            this.runSweep(cfg, (i, n) => { prog.querySelector('i').style.width = `${(100 * i) / n}%`; prog.querySelector('span').textContent = `${i} / ${n}`; }, () => cancel)
              .then((ok) => { running = false; if (ok) { close(); app.ui.toast(`Sweep finished – ${cfg.points} rows recorded`); } else btn.disabled = false; });
            return false;
          } },
        ],
      });
    }

    async runSweep(cfg, progress, cancelled) {
      const app = this.app, T = this.T;
      const c = app.doc.comps.find((x) => x.id === cfg.id);
      if (!c) return false;
      T.sweep = cfg;
      const param = { kind: 'param', id: cfg.id, key: cfg.key };
      if (!this.has(param)) {
        T.cols.splice(T.cols[0] && T.cols[0].src.kind === 'time' ? 1 : 0, 0, { src: param });
        const at = T.cols.findIndex((x) => x.src === param);
        for (const r of T.rows) r.splice(at, 0, NaN);
        T.plot.y = T.plot.y.map((k) => (k >= at ? k + 1 : k));
        if (T.plot.x >= at) T.plot.x++;
      }
      const xi = T.cols.findIndex((x) => app.sourceId(x.src) === app.sourceId(param));
      if (cfg.asX) {
        T.plot.x = xi;
        T.plot.y = T.plot.y.filter((k) => k !== xi);
        if (!T.plot.y.length) T.plot.y = T.cols.map((_, i) => i).filter((i) => i !== xi && T.cols[i].src.kind !== 'time');
      }
      if (cfg.clear) T.rows = [];
      this.bind();
      app.showPanel('table');
      const orig = c.props[cfg.key], wasRunning = app.sim.running;
      app.setRunning(false);
      let ok = true;
      for (let i = 0; i < cfg.points; i++) {
        if (cancelled()) { ok = false; break; }
        c.props[cfg.key] = cfg.from + ((cfg.to - cfg.from) * i) / (cfg.points - 1);
        app.rebuild();
        const eng = app.sim.engine;
        if (!eng || eng.error) { ok = false; break; }
        const target = eng.t + cfg.settle;
        let t0 = performance.now();
        while (eng.t < target - eng.dt * 0.5) {
          if (!eng.step()) break;
          app.scope.sample(eng.t);
          if (performance.now() - t0 > 30) { await new Promise((r) => requestAnimationFrame(r)); t0 = performance.now(); if (cancelled()) break; }
        }
        if (eng.error) { app.rebuild(); ok = false; break; }
        this.record(false);
        progress(i + 1, cfg.points);
        await new Promise((r) => setTimeout(r, 0));
      }
      c.props[cfg.key] = orig;
      app.rebuild();
      app.setRunning(wasRunning);
      app.saveLocal();
      this.render();
      return ok;
    }
  }

  EL.DataTable = DataTable;
  EL.defaultTable = defaultTable;
})(globalThis.EL = globalThis.EL || {});
