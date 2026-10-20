/* Electronics Lab – interactive schematic editor (canvas) */
(function (EL) {
  'use strict';
  const U = EL.util, C = EL.circuit;
  const GRID = 20; // CSS px per grid unit at zoom 1

  class Editor {
    constructor(app, canvas, tooltip) {
      this.app = app;
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.tip = tooltip;
      this.view = { ox: 0, oy: 0, z: 1 };
      this.tool = 'select';
      this.sel = new Set();
      this.placing = null;
      this.drag = null;
      this.wireStart = null;
      this.mouse = { sx: 0, sy: 0, wx: 0, wy: 0, gx: 0, gy: 0, inside: false };
      this.hover = null;
      this.painter = new EL.Painter(this.ctx);
      this.spaceDown = false;
      this.spaceUsed = false;
      this.needsRender = true;
      this.conn = { dots: [], open: [] };
      this._bind();
      new ResizeObserver(() => { this.needsRender = true; }).observe(canvas);
    }

    /* ---------- coordinates ---------- */
    toWorld(sx, sy) { const v = this.view; return [(sx - v.ox) / (GRID * v.z), (sy - v.oy) / (GRID * v.z)]; }
    toScreen(wx, wy) { const v = this.view; return [wx * GRID * v.z + v.ox, wy * GRID * v.z + v.oy]; }
    zoomAt(sx, sy, f) {
      const v = this.view, z = U.clamp(v.z * f, 0.2, 5);
      const [wx, wy] = this.toWorld(sx, sy);
      v.z = z;
      v.ox = sx - wx * GRID * z;
      v.oy = sy - wy * GRID * z;
      this.needsRender = true;
      this.app.updateStatus();
    }
    zoomBy(f) { this.zoomAt(this.cv.clientWidth / 2, this.cv.clientHeight / 2, f); }
    fit() {
      const doc = this.app.doc;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const c of doc.comps) { const b = C.worldBox(c); x1 = Math.min(x1, b.x1); y1 = Math.min(y1, b.y1); x2 = Math.max(x2, b.x2); y2 = Math.max(y2, b.y2); }
      for (const w of doc.wires) { x1 = Math.min(x1, w.x1, w.x2); x2 = Math.max(x2, w.x1, w.x2); y1 = Math.min(y1, w.y1, w.y2); y2 = Math.max(y2, w.y1, w.y2); }
      const W = this.cv.clientWidth, H = this.cv.clientHeight;
      if (!isFinite(x1)) { this.view = { z: 1, ox: W / 2, oy: H / 2 }; this.needsRender = true; return; }
      x1 -= 3; y1 -= 3; x2 += 3; y2 += 3;
      const z = U.clamp(Math.min(W / ((x2 - x1) * GRID), H / ((y2 - y1) * GRID)), 0.3, 2);
      this.view = { z, ox: W / 2 - ((x1 + x2) / 2) * GRID * z, oy: H / 2 - ((y1 + y2) / 2) * GRID * z };
      this.needsRender = true;
      this.app.updateStatus();
    }

    /* ---------- hit testing ---------- */
    hitTest(wx, wy, o = {}) {
      const doc = this.app.doc, pr = 0.42;
      if (!o.noPins) {
        for (const c of doc.comps) for (const p of C.absPins(c)) if (Math.abs(p.x - wx) < pr && Math.abs(p.y - wy) < pr) return { kind: 'pin', x: p.x, y: p.y, comp: c, pin: p };
        for (const w of doc.wires) {
          if (Math.abs(w.x1 - wx) < pr && Math.abs(w.y1 - wy) < pr) return { kind: 'end', x: w.x1, y: w.y1, wire: w };
          if (Math.abs(w.x2 - wx) < pr && Math.abs(w.y2 - wy) < pr) return { kind: 'end', x: w.x2, y: w.y2, wire: w };
        }
      }
      for (let i = doc.comps.length - 1; i >= 0; i--) if (C.hitComp(doc.comps[i], wx, wy)) return { kind: 'comp', comp: doc.comps[i] };
      for (const w of doc.wires) if (C.segDist(w, wx, wy) < 0.35) return { kind: 'wire', wire: w };
      return null;
    }
    /** Is the grid point a place where a wire may end (pin, wire end or on a wire)? */
    isConnPoint(x, y, exclude) {
      const doc = this.app.doc;
      for (const c of doc.comps) for (const p of C.absPins(c)) if (p.x === x && p.y === y) return true;
      for (const w of doc.wires) {
        if (exclude && exclude.has(w)) continue;
        if ((w.x1 === x && w.y1 === y) || (w.x2 === x && w.y2 === y) || C.onWireInterior(w, x, y)) return true;
      }
      return false;
    }

    /* ---------- editing operations ---------- */
    route(x1, y1, x2, y2) {
      if (x1 === x2 || y1 === y2) return [[x1, y1, x2, y2]];
      const hFirst = this.drag && this.drag.hFirst != null ? this.drag.hFirst : Math.abs(x2 - x1) >= Math.abs(y2 - y1);
      return hFirst ? [[x1, y1, x2, y1], [x2, y1, x2, y2]] : [[x1, y1, x1, y2], [x1, y2, x2, y2]];
    }
    addWires(segs) {
      const doc = this.app.doc, added = [];
      for (const [x1, y1, x2, y2] of segs) {
        if (x1 === x2 && y1 === y2) continue;
        if (doc.wires.some((w) => (w.x1 === x1 && w.y1 === y1 && w.x2 === x2 && w.y2 === y2) || (w.x1 === x2 && w.y1 === y2 && w.x2 === x1 && w.y2 === y1))) continue;
        const w = { x1, y1, x2, y2 };
        doc.wires.push(w);
        added.push(w);
      }
      return added;
    }
    deleteSelection() {
      if (!this.sel.size) return;
      const doc = this.app.doc;
      doc.comps = doc.comps.filter((c) => !this.sel.has(c));
      doc.wires = doc.wires.filter((w) => !this.sel.has(w));
      this.sel.clear();
      this.app.commit();
    }
    rotateSelection(dir = 1) {
      const comps = [...this.sel].filter((o) => o.type);
      const wires = [...this.sel].filter((o) => !o.type);
      if (!comps.length && !wires.length) return;
      if (comps.length === 1 && !wires.length) {
        comps[0].rot = ((comps[0].rot || 0) + dir + 4) & 3;
      } else {
        // rotate the group about its (grid-snapped) centre
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (const c of comps) { x1 = Math.min(x1, c.x); x2 = Math.max(x2, c.x); y1 = Math.min(y1, c.y); y2 = Math.max(y2, c.y); }
        for (const w of wires) { x1 = Math.min(x1, w.x1, w.x2); x2 = Math.max(x2, w.x1, w.x2); y1 = Math.min(y1, w.y1, w.y2); y2 = Math.max(y2, w.y1, w.y2); }
        const cx = Math.round((x1 + x2) / 2), cy = Math.round((y1 + y2) / 2);
        const r = (x, y) => (dir > 0 ? [cx - (y - cy), cy + (x - cx)] : [cx + (y - cy), cy - (x - cx)]);
        for (const c of comps) { [c.x, c.y] = r(c.x, c.y); c.rot = ((c.rot || 0) + dir + 4) & 3; }
        for (const w of wires) { [w.x1, w.y1] = r(w.x1, w.y1); [w.x2, w.y2] = r(w.x2, w.y2); }
      }
      this.app.commit();
    }
    flipSelection() {
      const comps = [...this.sel].filter((o) => o.type);
      if (!comps.length) return;
      for (const c of comps) c.flip = !c.flip;
      this.app.commit();
    }
    copySelection() {
      if (!this.sel.size) return false;
      const comps = [...this.sel].filter((o) => o.type).map(C.compJSON);
      const wires = [...this.sel].filter((o) => !o.type).map(C.wireJSON);
      this.app.clipboard = { comps, wires };
      return true;
    }
    paste(at) {
      const clip = this.app.clipboard;
      if (!clip || (!clip.comps.length && !clip.wires.length)) return;
      const doc = this.app.doc;
      let x1 = Infinity, y1 = Infinity;
      for (const c of clip.comps) { x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y); }
      for (const w of clip.wires) { x1 = Math.min(x1, w.x1, w.x2); y1 = Math.min(y1, w.y1, w.y2); }
      const dx = at ? at[0] - x1 : 2, dy = at ? at[1] - y1 : 2;
      this.sel.clear();
      for (const cj of clip.comps) {
        const c = Object.assign(U.clone(cj), { id: U.uid(), x: cj.x + dx, y: cj.y + dy, rot: cj.rot || 0, flip: !!cj.flip });
        c.props = Object.assign(EL.defaultProps(c.type), c.props);
        const t = EL.types[c.type];
        if (c.label && !t.noLabel) c.label = C.nextLabel(doc, c.type === 'probe' ? 'P' : t.prefix);
        doc.comps.push(c);
        this.sel.add(c);
      }
      for (const wj of clip.wires) {
        const w = { x1: wj.x1 + dx, y1: wj.y1 + dy, x2: wj.x2 + dx, y2: wj.y2 + dy };
        doc.wires.push(w);
        this.sel.add(w);
      }
      if (!at) clip.comps.forEach((c) => { c.x += 2; c.y += 2; }), clip.wires.forEach((w) => { w.x1 += 2; w.y1 += 2; w.x2 += 2; w.y2 += 2; });
      this.app.commit();
    }
    selectAll() {
      this.sel = new Set([...this.app.doc.comps, ...this.app.doc.wires]);
      this.app.selectionChanged();
      this.needsRender = true;
    }
    startPlacing(spec) {
      this.cancel();
      this.placing = Object.assign({ rot: 0, flip: false }, spec);
      this.cv.focus();
      this.needsRender = true;
      this.app.updateStatus();
    }
    cancel() {
      if (this.placing && this.app.ui) this.app.ui.clearActive();
      this.placing = null;
      this.wireStart = null;
      this.drag = null;
      this.needsRender = true;
    }
    setTool(t) {
      this.cancel();
      this.tool = t;
      this.cv.style.cursor = t === 'wire' ? 'crosshair' : 'default';
      this.app.updateToolbar();
      this.app.updateStatus();
    }

    /* ---------- events ---------- */
    _bind() {
      const cv = this.cv;
      cv.addEventListener('pointerdown', (e) => this._down(e));
      window.addEventListener('pointermove', (e) => this._move(e));
      window.addEventListener('pointerup', (e) => this._up(e));
      cv.addEventListener('dblclick', (e) => this._dbl(e));
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.01));
        else if (e.deltaMode === 1) this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.1));
        else { this.view.ox -= e.deltaX; this.view.oy -= e.deltaY; this.needsRender = true; }
        this._updateMouse(e);
      }, { passive: false });
      cv.addEventListener('pointerleave', () => { this.mouse.inside = false; this.tip.hidden = true; this.needsRender = true; });
      cv.addEventListener('pointerenter', () => { this.mouse.inside = true; });
    }
    _updateMouse(e) {
      const r = this.cv.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const [wx, wy] = this.toWorld(sx, sy);
      Object.assign(this.mouse, { sx, sy, wx, wy, gx: Math.round(wx), gy: Math.round(wy), inside: sx >= 0 && sy >= 0 && sx <= r.width && sy <= r.height });
    }
    _down(e) {
      this.cv.focus();
      this._updateMouse(e);
      this.app.ui.hideMenu();
      const m = this.mouse;
      if (e.button === 1 || e.button === 2 || this.spaceDown) {
        this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: this.view.ox, oy: this.view.oy, moved: false, button: e.button };
        if (this.spaceDown) this.spaceUsed = true;
        return;
      }
      if (e.button !== 0) return;
      if (this.placing) {
        this._place(m.gx, m.gy);
        if (!e.shiftKey) { this.placing = null; this.app.ui.clearActive(); }
        this.app.updateStatus();
        return;
      }
      if (this.tool === 'wire' || this.wireStart) {
        this._wireClick(m.gx, m.gy);
        return;
      }
      const hit = this.hitTest(m.wx, m.wy);
      if (hit && (hit.kind === 'pin' || hit.kind === 'end')) {
        this.drag = { kind: 'wire', x: hit.x, y: hit.y, moved: false, hFirst: null };
        this.needsRender = true;
        return;
      }
      if (hit && (hit.kind === 'comp' || hit.kind === 'wire')) {
        const obj = hit.comp || hit.wire;
        if (e.shiftKey) {
          if (this.sel.has(obj)) this.sel.delete(obj); else this.sel.add(obj);
        } else if (!this.sel.has(obj)) {
          this.sel = new Set([obj]);
        }
        this.app.selectionChanged();
        const t = hit.comp && EL.types[hit.comp.type];
        if (t && t.press) { t.press(hit.comp, true); this.app.interactChanged(); }
        this._startMove(m.gx, m.gy, obj);
        this.needsRender = true;
        return;
      }
      if (!e.shiftKey) { this.sel.clear(); this.app.selectionChanged(); }
      this.drag = { kind: 'box', x0: m.wx, y0: m.wy, x1: m.wx, y1: m.wy, add: e.shiftKey };
      this.needsRender = true;
    }
    _startMove(gx, gy, obj) {
      const doc = this.app.doc;
      const comps = [...this.sel].filter((o) => o.type);
      const wires = [...this.sel].filter((o) => !o.type);
      const pts = new Set();
      for (const c of comps) for (const p of C.absPins(c)) pts.add(C.key(p.x, p.y));
      for (const w of wires) { pts.add(C.key(w.x1, w.y1)); pts.add(C.key(w.x2, w.y2)); }
      const rubber = [];
      for (const w of doc.wires) {
        if (this.sel.has(w)) continue;
        const a = pts.has(C.key(w.x1, w.y1)), b = pts.has(C.key(w.x2, w.y2));
        if (a || b) rubber.push({ w, a, b, o: { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 } });
      }
      this.drag = {
        kind: 'move', gx, gy, dx: 0, dy: 0, moved: false, obj,
        comps: comps.map((c) => ({ c, x: c.x, y: c.y })),
        wires: wires.map((w) => ({ w, o: { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 } })),
        rubber,
      };
    }
    _move(e) {
      const prevG = [this.mouse.gx, this.mouse.gy];
      this._updateMouse(e);
      const m = this.mouse, d = this.drag;
      if (d && d.kind === 'pan') {
        const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        this.view.ox = d.ox + dx;
        this.view.oy = d.oy + dy;
        this.needsRender = true;
        return;
      }
      if (d && d.kind === 'move') {
        const dx = m.gx - d.gx, dy = m.gy - d.gy;
        if (dx !== d.dx || dy !== d.dy) {
          d.dx = dx; d.dy = dy; d.moved = true;
          for (const it of d.comps) { it.c.x = it.x + dx; it.c.y = it.y + dy; }
          for (const it of d.wires) { it.w.x1 = it.o.x1 + dx; it.w.y1 = it.o.y1 + dy; it.w.x2 = it.o.x2 + dx; it.w.y2 = it.o.y2 + dy; }
          for (const r of d.rubber) {
            r.w.x1 = r.o.x1 + (r.a ? dx : 0); r.w.y1 = r.o.y1 + (r.a ? dy : 0);
            r.w.x2 = r.o.x2 + (r.b ? dx : 0); r.w.y2 = r.o.y2 + (r.b ? dy : 0);
          }
          this.conn = C.connectionInfo(this.app.doc);
          this.needsRender = true;
        }
        return;
      }
      if (d && d.kind === 'box') { d.x1 = m.wx; d.y1 = m.wy; this.needsRender = true; return; }
      if (d && d.kind === 'wire') {
        if (m.gx !== d.x || m.gy !== d.y) {
          d.moved = true;
          if (d.hFirst == null) d.hFirst = Math.abs(m.gx - d.x) >= Math.abs(m.gy - d.y);
        } else d.hFirst = null;
        this.needsRender = true;
        return;
      }
      if (this.wireStart) {
        const ws = this.wireStart;
        if (m.gx === ws.x && m.gy === ws.y) ws.hFirst = null;
        else if (ws.hFirst == null) ws.hFirst = Math.abs(m.gx - ws.x) >= Math.abs(m.gy - ws.y);
      }
      if (prevG[0] !== m.gx || prevG[1] !== m.gy || this.placing || this.wireStart) this.needsRender = true;
      if (e.target === this.cv) this._hover();
    }
    _up(e) {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      if (d.kind === 'pan') {
        if (!d.moved && d.button === 2) this._contextMenu(e);
        return;
      }
      if (d.kind === 'move') {
        const t = d.obj && d.obj.type && EL.types[d.obj.type];
        if (t && t.press) { t.press(d.obj, false); this.app.interactChanged(); }
        if (d.moved) this.app.commit();
        else if (t && t.click && t.click(d.obj)) this.app.interactChanged(true);
        this.needsRender = true;
        return;
      }
      if (d.kind === 'box') {
        const x1 = Math.min(d.x0, d.x1), x2 = Math.max(d.x0, d.x1), y1 = Math.min(d.y0, d.y1), y2 = Math.max(d.y0, d.y1);
        if (x2 - x1 > 0.2 || y2 - y1 > 0.2) {
          for (const c of this.app.doc.comps) { const b = C.worldBox(c); if (b.x1 < x2 && b.x2 > x1 && b.y1 < y2 && b.y2 > y1) this.sel.add(c); }
          for (const w of this.app.doc.wires) if (Math.min(w.x1, w.x2) <= x2 && Math.max(w.x1, w.x2) >= x1 && Math.min(w.y1, w.y2) <= y2 && Math.max(w.y1, w.y2) >= y1) this.sel.add(w);
          this.app.selectionChanged();
        }
        this.needsRender = true;
        return;
      }
      if (d.kind === 'wire') {
        const m = this.mouse;
        if (d.moved && (m.gx !== d.x || m.gy !== d.y)) {
          const added = this.addWires(this.route(d.x, d.y, m.gx, m.gy));
          if (added.length) this.app.commit();
          if (!this.isConnPoint(m.gx, m.gy, new Set(added))) this.wireStart = { x: m.gx, y: m.gy, hFirst: null };
        } else {
          this.wireStart = { x: d.x, y: d.y, hFirst: null };
        }
        this.needsRender = true;
        this.app.updateStatus();
      }
    }
    _wireClick(gx, gy) {
      const ws = this.wireStart;
      if (!ws) { this.wireStart = { x: gx, y: gy, hFirst: null }; this.app.updateStatus(); this.needsRender = true; return; }
      if (gx === ws.x && gy === ws.y) { this.wireStart = null; this.app.updateStatus(); this.needsRender = true; return; }
      this.drag = { hFirst: ws.hFirst };
      const segs = this.route(ws.x, ws.y, gx, gy);
      this.drag = null;
      const added = this.addWires(segs);
      if (added.length) this.app.commit();
      this.wireStart = this.isConnPoint(gx, gy, new Set(added)) ? null : { x: gx, y: gy, hFirst: null };
      this.app.updateStatus();
      this.needsRender = true;
    }
    _place(gx, gy) {
      const p = this.placing;
      const c = C.newComp(this.app.doc, p.type, gx, gy, p.props);
      c.rot = p.rot; c.flip = p.flip;
      this.app.doc.comps.push(c);
      this.sel = new Set([c]);
      this.app.commit();
    }
    _dbl(e) {
      this._updateMouse(e);
      if (this.wireStart) { this.wireStart = null; this.needsRender = true; return; }
      const hit = this.hitTest(this.mouse.wx, this.mouse.wy, { noPins: true });
      if (hit && hit.comp) { this.sel = new Set([hit.comp]); this.app.selectionChanged(); this.app.ui.focusInspector(); }
    }
    _contextMenu(e) {
      const m = this.mouse;
      const hit = this.hitTest(m.wx, m.wy, { noPins: false });
      const items = [];
      const app = this.app;
      if (hit && (hit.comp || hit.wire) && hit.kind !== 'pin' && hit.kind !== 'end') {
        const obj = hit.comp || hit.wire;
        if (!this.sel.has(obj)) { this.sel = new Set([obj]); app.selectionChanged(); }
      }
      if (hit && hit.comp && hit.kind === 'comp') {
        const c = hit.comp, t = EL.types[c.type];
        items.push({ label: `${c.label || t.name}`, header: true });
        if (t.measure && C.absPins(c).length >= 2 && c.type !== 'ic') {
          items.push({ label: 'Plot current in oscilloscope', icon: 'scope', action: () => app.addTrace({ kind: 'comp', id: c.id, q: 'i' }) });
          items.push({ label: 'Plot voltage across in oscilloscope', icon: 'scope', action: () => app.addTrace({ kind: 'comp', id: c.id, q: 'v' }) });
          items.push({ label: 'Add voltage to data table', icon: 'table', action: () => app.table.addColumn({ kind: 'comp', id: c.id, q: 'v' }) });
          items.push({ label: 'Add current to data table', icon: 'table', action: () => app.table.addColumn({ kind: 'comp', id: c.id, q: 'i' }) });
          items.push({ sep: true });
        }
        items.push({ label: 'Rotate', key: 'R', action: () => this.rotateSelection(1) });
        items.push({ label: 'Flip', key: 'F', action: () => this.flipSelection() });
        items.push({ label: 'Duplicate', key: '⌘D', action: () => { this.copySelection(); this.paste(); } });
        items.push({ label: 'Properties…', action: () => app.ui.focusInspector() });
        items.push({ sep: true });
        items.push({ label: 'Delete', key: '⌫', danger: true, action: () => this.deleteSelection() });
      } else if (hit && (hit.wire || hit.kind === 'pin' || hit.kind === 'end')) {
        const k = C.key(hit.x ?? m.gx, hit.y ?? m.gy);
        const px = hit.kind === 'wire' ? this._nearestOnWire(hit.wire, m.wx, m.wy) : [hit.x, hit.y];
        const pk = C.key(px[0], px[1]);
        items.push({ label: 'Node', header: true });
        items.push({ label: 'Plot node voltage in oscilloscope', icon: 'scope', action: () => app.addTrace({ kind: 'node', key: pk, label: app.nodeName(pk) }) });
        items.push({ label: 'Add node voltage to data table', icon: 'table', action: () => app.table.addColumn({ kind: 'node', key: pk, label: app.nodeName(pk) }) });
        items.push({ label: 'Add scope probe here', action: () => { const c = C.newComp(app.doc, 'probe', px[0], px[1]); app.doc.comps.push(c); app.commit(); } });
        if (hit.wire) { items.push({ sep: true }); items.push({ label: 'Delete wire', danger: true, action: () => this.deleteSelection() }); }
        void k;
      } else {
        items.push({ label: 'Paste', key: '⌘V', disabled: !app.clipboard, action: () => this.paste([m.gx, m.gy]) });
        items.push({ label: 'Select all', key: '⌘A', action: () => this.selectAll() });
        items.push({ label: 'Zoom to fit', key: '0', action: () => this.fit() });
      }
      app.ui.showMenu(e.clientX, e.clientY, items);
    }
    _nearestOnWire(w, wx, wy) {
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy;
      const t = l2 ? U.clamp(((wx - w.x1) * dx + (wy - w.y1) * dy) / l2, 0, 1) : 0;
      return [Math.round(w.x1 + t * dx), Math.round(w.y1 + t * dy)];
    }
    _hover() {
      const m = this.mouse;
      if (this.drag || this.placing || !m.inside) { this.tip.hidden = true; return; }
      const hit = this.hitTest(m.wx, m.wy);
      const prev = this.hover;
      this.hover = hit;
      if ((prev && prev.comp) !== (hit && hit.comp) || (prev && prev.wire) !== (hit && hit.wire) || (prev && prev.kind) !== (hit && hit.kind)) this.needsRender = true;
      if (this.tool !== 'wire') {
        const t = hit && hit.comp && EL.types[hit.comp.type];
        this.cv.style.cursor = !hit ? 'default' : hit.kind === 'pin' || hit.kind === 'end' ? 'crosshair' : t && (t.click || t.press) ? 'pointer' : 'move';
      }
      this.updateTooltip();
    }
    updateTooltip() {
      const app = this.app, hit = this.hover, m = this.mouse;
      if (!hit || !m.inside || this.drag || this.placing || !app.sim.engine) { this.tip.hidden = true; return; }
      let html = '';
      if (hit.comp && hit.kind === 'comp') {
        const c = hit.comp, t = EL.types[c.type];
        const st = app.liveState(c);
        if (!st || !t.measure) { this.tip.hidden = true; return; }
        const r = t.measure(c, st);
        const title = c.type === 'ic' ? `${c.label} · ${(EL.ics.get(c.props.ic) || {}).name || 'IC'}` : `${c.label || t.name}`;
        html = `<div class="tt-title">${U.esc(title)}</div>`;
        if (r.V !== undefined) html += row(r.vLabel || 'V', U.fmt(r.V, 'V', 4, true));
        if (r.I !== undefined) html += row(r.iLabel || 'I', U.fmt(r.I, 'A', 4, true));
        if (r.P !== undefined) html += row(r.pLabel || 'P', U.fmt(r.P, 'W', 3, true));
        if (r.rows && c.type !== 'ic') for (const [a, b] of r.rows) html += row(a, b);
        if (r.warn) html += `<div class="tt-warn">${U.esc(r.warn)}</div>`;
      } else {
        let k;
        if (hit.kind === 'pin' || hit.kind === 'end') k = C.key(hit.x, hit.y);
        else if (hit.wire) k = C.key(hit.wire.x1, hit.wire.y1);
        const n = app.sim.net && app.sim.net.nodeAt(k);
        if (n == null) { this.tip.hidden = true; return; }
        html = `<div class="tt-title">Node${n === 0 ? ' (ground)' : ''}</div>` + row('V', U.fmt(app.sim.engine.v(n), 'V', 4, true));
        if (hit.kind === 'pin') html += `<div class="tt-sub">${U.esc(hit.comp.label || EL.types[hit.comp.type].name)} · pin ${U.esc(String(hit.pin.name).replace('~', '/'))}</div>`;
      }
      this.tip.innerHTML = html;
      this.tip.hidden = false;
      const W = this.cv.clientWidth;
      const x = m.sx + 16, y = m.sy + 14;
      this.tip.style.left = Math.min(x, W - this.tip.offsetWidth - 8) + 'px';
      this.tip.style.top = y + 'px';
      function row(a, b) { return `<div class="tt-row"><span>${U.esc(a)}</span><b>${U.esc(b)}</b></div>`; }
    }

    onKey(e) {
      const k = e.key, mod = e.metaKey || e.ctrlKey;
      if (k === 'Escape') {
        if (this.placing || this.wireStart || this.drag) this.cancel();
        else if (this.tool === 'wire') this.setTool('select');
        else { this.sel.clear(); this.app.selectionChanged(); }
        this.needsRender = true;
        this.app.updateStatus();
        return true;
      }
      if (mod) {
        const lk = k.toLowerCase();
        if (lk === 'c') return this.copySelection();
        if (lk === 'x') { if (this.copySelection()) this.deleteSelection(); return true; }
        if (lk === 'v') { this.paste(this.mouse.inside ? [this.mouse.gx, this.mouse.gy] : null); return true; }
        if (lk === 'd') { if (this.copySelection()) this.paste(); return true; }
        if (lk === 'a') { this.selectAll(); return true; }
        return false;
      }
      if (k === 'r' || k === 'R') {
        if (this.placing) { this.placing.rot = (this.placing.rot + (e.shiftKey ? 3 : 1)) & 3; this.needsRender = true; }
        else this.rotateSelection(e.shiftKey ? -1 : 1);
        return true;
      }
      if (k === 'f' || k === 'F') {
        if (this.placing) { this.placing.flip = !this.placing.flip; this.needsRender = true; } else this.flipSelection();
        return true;
      }
      if (k === 'Delete' || k === 'Backspace') { this.deleteSelection(); return true; }
      if (k === 'w' || k === 'W') { this.setTool(this.tool === 'wire' ? 'select' : 'wire'); return true; }
      if (k === 'v' || k === 'V') { this.setTool('select'); return true; }
      if (k === '0') { this.fit(); return true; }
      if (k === '+' || k === '=') { this.zoomBy(1.2); return true; }
      if (k === '-') { this.zoomBy(1 / 1.2); return true; }
      return false;
    }

    /* ---------- rendering ---------- */
    render() {
      const cv = this.cv, ctx = this.ctx, app = this.app, th = app.theme;
      const dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      this.needsRender = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = th.canvas;
      ctx.fillRect(0, 0, W, H);

      // grid
      const v = this.view, step = GRID * v.z;
      let every = 1;
      while (step * every < 9) every *= 2;
      const [wx0, wy0] = this.toWorld(0, 0), [wx1, wy1] = this.toWorld(W, H);
      const gx0 = Math.floor(wx0 / every) * every, gy0 = Math.floor(wy0 / every) * every;
      const r = Math.max(0.6, Math.min(1.3, v.z));
      for (let gx = gx0; gx <= wx1; gx += every) {
        const sx = gx * step + v.ox;
        for (let gy = gy0; gy <= wy1; gy += every) {
          const major = gx % (every * 5) === 0 && gy % (every * 5) === 0;
          ctx.fillStyle = major ? th.gridMajor : th.grid;
          const s = major ? r * 1.6 : r;
          ctx.fillRect(sx - s / 2, gy * step + v.oy - s / 2, s, s);
        }
      }

      const px = GRID * v.z * dpr;
      ctx.setTransform(px, 0, 0, px, v.ox * dpr, v.oy * dpr);
      const p = this.painter;
      const lwPx = U.clamp(1.7 * v.z, 1, 3.2) * dpr;
      p.lwu = lwPx / px;
      p.iec = app.settings.style === 'iec';
      p.th = th;
      p.bg = th.compFill;
      const eng = app.sim.engine && !app.sim.engine.error ? app.sim.engine : null;
      const vcolOn = app.settings.voltColors && eng;
      const vScale = vcolOn ? this._voltScale(eng) : 1;
      p.vcol = vcolOn ? (val) => this._vColor(val, vScale, th) : null;
      const net = app.sim.net;
      const doc = app.doc;

      // wires
      for (const w of doc.wires) {
        let col = th.wire;
        if (vcolOn && net) { const n = net.nodeAt(C.key(w.x1, w.y1)); if (n != null) col = p.vcol(eng.v(n)); }
        if (this.sel.has(w)) col = th.select;
        p.fg = col;
        p.mult = this.hover && this.hover.wire === w && !this.sel.has(w) ? 1.6 : 1;
        p.line(w.x1, w.y1, w.x2, w.y2, col);
      }
      p.mult = 1;
      // junction dots
      ctx.fillStyle = th.wire;
      for (const d of this.conn.dots) {
        ctx.fillStyle = vcolOn && net ? p.vcol(eng.v(net.nodeAt(C.key(d.x, d.y)) || 0)) : th.wire;
        ctx.beginPath(); ctx.arc(d.x, d.y, 0.2, 0, Math.PI * 2); ctx.fill();
      }

      // components
      const showLabels = app.settings.showLabels, showValues = app.settings.showValues;
      for (const c of doc.comps) {
        const selected = this.sel.has(c);
        const hovered = this.hover && this.hover.comp === c && this.hover.kind === 'comp';
        p.fg = selected ? th.select : th.comp;
        p.st = eng ? app.liveState(c) : null;
        p.showLabels = showLabels;
        if (selected || hovered) {
          const b = C.worldBox(c);
          ctx.fillStyle = selected ? th.selectFill : th.hoverFill;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(b.x1 - 0.35, b.y1 - 0.35, b.x2 - b.x1 + 0.7, b.y2 - b.y1 + 0.7, 0.4); else ctx.rect(b.x1 - 0.35, b.y1 - 0.35, b.x2 - b.x1 + 0.7, b.y2 - b.y1 + 0.7);
          ctx.fill();
        }
        EL.drawComponent(p, c);
        p.st = null;
        if (showLabels || showValues) this._labels(p, c, showLabels, showValues);
      }
      p.fg = th.comp;

      // open pins
      for (const o of this.conn.open) {
        ctx.beginPath(); ctx.arc(o.x, o.y, 0.16, 0, Math.PI * 2);
        ctx.fillStyle = th.canvas; ctx.fill();
        ctx.lineWidth = p.lwu * 0.8; ctx.strokeStyle = th.openPin; ctx.stroke();
      }
      // hovered pin
      const h = this.hover;
      if (h && (h.kind === 'pin' || h.kind === 'end') && !this.drag) {
        ctx.beginPath(); ctx.arc(h.x, h.y, 0.38, 0, Math.PI * 2);
        ctx.lineWidth = p.lwu; ctx.strokeStyle = th.select; ctx.stroke();
      }

      // wire previews
      const m = this.mouse;
      const preview = (x, y, hFirst) => {
        const saved = this.drag;
        this.drag = { hFirst };
        const segs = this.route(x, y, m.gx, m.gy);
        this.drag = saved;
        ctx.setLineDash([0.3, 0.25]);
        for (const s of segs) p.line(s[0], s[1], s[2], s[3], th.select);
        ctx.setLineDash([]);
        ctx.fillStyle = th.select;
        ctx.beginPath(); ctx.arc(m.gx, m.gy, 0.2, 0, Math.PI * 2); ctx.fill();
      };
      if (this.drag && this.drag.kind === 'wire' && this.drag.moved) preview(this.drag.x, this.drag.y, this.drag.hFirst);
      else if (this.wireStart && m.inside) preview(this.wireStart.x, this.wireStart.y, this.wireStart.hFirst);
      else if (this.tool === 'wire' && m.inside && !this.placing) {
        ctx.strokeStyle = th.select; ctx.lineWidth = p.lwu;
        ctx.beginPath(); ctx.arc(m.gx, m.gy, 0.3, 0, Math.PI * 2); ctx.stroke();
      }

      // placement ghost
      if (this.placing && m.inside) {
        const pl = this.placing;
        const ghost = { id: '_ghost', type: pl.type, x: m.gx, y: m.gy, rot: pl.rot, flip: pl.flip, props: Object.assign(EL.defaultProps(pl.type), pl.props || {}) };
        ctx.globalAlpha = 0.55;
        p.fg = th.select;
        EL.drawComponent(p, ghost);
        p.fg = th.comp;
        ctx.globalAlpha = 1;
      }

      // selection box
      if (this.drag && this.drag.kind === 'box') {
        const d = this.drag;
        ctx.fillStyle = th.selectFill;
        ctx.strokeStyle = th.select;
        ctx.lineWidth = 1 / (GRID * v.z);
        ctx.fillRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
        ctx.strokeRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      }
    }
    _labels(p, c, showLabels, showValues) {
      const t = EL.types[c.type];
      if (t.noLabel || t.ownLabel) return;
      let lab = showLabels ? (t.labelProp && c.props[t.labelProp] ? c.props[t.labelProp] : c.label) : '';
      const val = showValues && t.value && !t.noValue ? t.value(c) : '';
      if (!lab && !val) return;
      const b = C.worldBox(c);
      const ctx = p.ctx;
      ctx.save();
      const fg = p.fg;
      const labCol = this.sel.has(c) ? this.app.theme.select : this.app.theme.label;
      if (t.labelTop || b.x2 - b.x1 >= b.y2 - b.y1) {
        const cx = (b.x1 + b.x2) / 2;
        if (lab) p.text(lab, cx, b.y1 - 0.2, { size: 0.6, weight: 650, baseline: 'bottom', color: labCol });
        if (val) p.text(val, cx, b.y2 + 0.22, { size: 0.55, baseline: 'top', color: this.app.theme.value });
      } else {
        const cy = (b.y1 + b.y2) / 2, x = b.x2 + 0.35;
        if (lab && val) {
          p.text(lab, x, cy - 0.38, { size: 0.6, weight: 650, align: 'left', color: labCol });
          p.text(val, x, cy + 0.42, { size: 0.55, align: 'left', color: this.app.theme.value });
        } else p.text(lab || val, x, cy, { size: 0.6, weight: lab ? 650 : 500, align: 'left', color: lab ? labCol : this.app.theme.value });
      }
      p.fg = fg;
      ctx.restore();
    }
    _voltScale(eng) {
      let mx = 0;
      for (let i = 0; i < eng.nn - 1; i++) mx = Math.max(mx, Math.abs(eng.x[i]));
      if (!this._vs || mx > this._vs || mx < this._vs * 0.5) this._vs = Math.max(mx, 1);
      return this._vs;
    }
    _vColor(v, scale, th) {
      const t = U.clamp(v / scale, -1, 1);
      const [a, b] = t >= 0 ? [th.vZero, th.vPos] : [th.vZero, th.vNeg];
      const k = Math.pow(Math.abs(t), 0.7);
      return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
    }
    refreshConnections() { this.conn = C.connectionInfo(this.app.doc); this.needsRender = true; }
  }

  EL.Editor = Editor;
  EL.GRID = GRID;
})(globalThis.EL = globalThis.EL || {});
