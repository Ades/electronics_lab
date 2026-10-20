/* Electronics Lab – circuit model: geometry, connectivity, netlist building, (de)serialisation */
(function (EL) {
  'use strict';
  const U = EL.util, SIM = EL.sim;
  const key = (x, y) => x + ',' + y;

  /* ---------- geometry ---------- */
  function typePins(c) { const t = EL.types[c.type]; return typeof t.pins === 'function' ? t.pins(c) : t.pins; }
  function absPins(c) {
    return typePins(c).map((p, i) => {
      const [x, y] = U.rot(p.x, p.y, c.rot || 0, c.flip);
      return { x: c.x + x, y: c.y + y, name: p.name, i };
    });
  }
  function localBox(c) { const t = EL.types[c.type]; return typeof t.box === 'function' ? t.box(c) : t.box; }
  function worldBox(c) {
    const b = localBox(c);
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const [px, py] of [[b.x1, b.y1], [b.x2, b.y1], [b.x1, b.y2], [b.x2, b.y2]]) {
      const [x, y] = U.rot(px, py, c.rot || 0, c.flip);
      x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
    }
    return { x1: c.x + x1, y1: c.y + y1, x2: c.x + x2, y2: c.y + y2 };
  }
  function hitComp(c, wx, wy, pad = 0.15) {
    const [lx, ly] = U.unrot(wx - c.x, wy - c.y, c.rot || 0, c.flip);
    const b = localBox(c);
    return lx >= b.x1 - pad && lx <= b.x2 + pad && ly >= b.y1 - pad && ly <= b.y2 + pad;
  }
  /** Is integer point (px,py) strictly inside wire segment w (not at its endpoints)? */
  function onWireInterior(w, px, py) {
    if ((px === w.x1 && py === w.y1) || (px === w.x2 && py === w.y2)) return false;
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
    if ((px - w.x1) * dy - (py - w.y1) * dx !== 0) return false;
    const t = dx !== 0 ? (px - w.x1) / dx : (py - w.y1) / dy;
    return t > 0 && t < 1;
  }
  function segDist(w, px, py) {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - w.x1) * dx + (py - w.y1) * dy) / l2 : 0;
    t = U.clamp(t, 0, 1);
    return Math.hypot(px - (w.x1 + t * dx), py - (w.y1 + t * dy));
  }

  /* ---------- connectivity ---------- */
  function computeNets(comps, wires) {
    const parent = new Map();
    const add = (k) => { if (!parent.has(k)) parent.set(k, k); };
    const find = (k) => {
      let r = k;
      while (parent.get(r) !== r) r = parent.get(r);
      let c = k;
      while (parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n; }
      return r;
    };
    const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    const compPins = new Map();
    const pts = new Map();
    for (const c of comps) {
      const ps = absPins(c);
      compPins.set(c, ps);
      for (const p of ps) { const k = key(p.x, p.y); add(k); pts.set(k, p); }
    }
    for (const w of wires) {
      union(key(w.x1, w.y1), key(w.x2, w.y2));
      pts.set(key(w.x1, w.y1), { x: w.x1, y: w.y1 });
      pts.set(key(w.x2, w.y2), { x: w.x2, y: w.y2 });
    }
    // T-junctions: a pin or wire end lying on another wire connects to it
    for (const w of wires) {
      const minx = Math.min(w.x1, w.x2), maxx = Math.max(w.x1, w.x2), miny = Math.min(w.y1, w.y2), maxy = Math.max(w.y1, w.y2);
      for (const [k, p] of pts) {
        if (p.x < minx || p.x > maxx || p.y < miny || p.y > maxy) continue;
        if (onWireInterior(w, p.x, p.y)) union(k, key(w.x1, w.y1));
      }
    }
    for (const c of comps) {
      const ps = compPins.get(c);
      if (c.type === 'gnd') union(key(ps[0].x, ps[0].y), '#GND');
      else if (c.type === 'label') union(key(ps[0].x, ps[0].y), '#L:' + c.props.name);
      else if (c.type === 'port') union(key(ps[0].x, ps[0].y), '#P:' + c.props.name);
    }
    return { parent, find, compPins, has: (k) => parent.has(k) };
  }

  /** Junction dots and unconnected pins for drawing. */
  function connectionInfo(doc) {
    const count = new Map();
    const inc = (k, n = 1) => count.set(k, (count.get(k) || 0) + n);
    const pinPts = [];
    for (const c of doc.comps) for (const p of absPins(c)) { inc(key(p.x, p.y)); pinPts.push(p); }
    for (const w of doc.wires) { inc(key(w.x1, w.y1)); inc(key(w.x2, w.y2)); }
    const pts = new Map();
    for (const k of count.keys()) { const [x, y] = k.split(',').map(Number); pts.set(k, { x, y }); }
    for (const w of doc.wires) for (const [k, p] of pts) if (onWireInterior(w, p.x, p.y)) inc(k, 2);
    const dots = [], open = [];
    for (const [k, n] of count) if (n >= 3) dots.push(pts.get(k));
    for (const p of pinPts) if (count.get(key(p.x, p.y)) === 1) open.push(p);
    return { dots, open, count };
  }

  /* ---------- netlist ---------- */
  function buildNetlist(doc) {
    const ctx = { nodeCount: 1, els: [], compEls: new Map(), keyNode: new Map(), warnings: [] };
    let cur = null;
    const push = (e) => { e.key = cur.prefix + ':' + cur.els.length; cur.els.push(e); ctx.els.push(e); return e; };
    const fn = (v) => (typeof v === 'function' ? v : () => v);
    const B = {
      R: (a, b, r) => push(new SIM.Resistor(a, b, r)),
      C: (a, b, c) => push(new SIM.Capacitor(a, b, c)),
      L: (a, b, l) => push(new SIM.Inductor(a, b, l)),
      V: (p, n, v) => push(new SIM.VSource(p, n, fn(v))),
      I: (from, to, v) => push(new SIM.ISource(from, to, fn(v))),
      D: (a, k, p) => push(new SIM.Diode(a, k, p)),
      Q: (c, b, e, pol, p) => push(new SIM.BJT(c, b, e, pol, p)),
      M: (d, g, s, pol, p) => push(new SIM.MOSFET(d, g, s, pol, p)),
      OA: (np, nn, out, o) => push(new SIM.OpAmp(np, nn, out, o)),
      behav: (nodes, o) => push(new SIM.Behavioral(nodes, o)),
      node: () => ctx.nodeCount++,
    };
    let hasGround = false;

    function buildCircuit(comps, wires, mapRoot, path, depth) {
      const nets = computeNets(comps, wires);
      const rootNode = new Map();
      const nodeOf = (k) => {
        const r = nets.find(k);
        let n = rootNode.get(r);
        if (n === undefined) {
          n = mapRoot(r, nets);
          if (n === undefined) n = ctx.nodeCount++;
          rootNode.set(r, n);
        }
        return n;
      };
      for (const k of nets.parent.keys()) {
        const n = nodeOf(k);
        if (k[0] !== '#') ctx.keyNode.set(path + k, n);
      }
      const subCtx = {
        depth,
        sub(def, nodes) {
          if (depth >= 8) { ctx.warnings.push(`Sub-circuit nesting too deep in ${def.name}`); return; }
          const sc = def.model.circuit;
          const pinNames = EL.ics.pins(def).map((p) => p.name);
          const comps2 = sc.comps.map((c) => Object.assign({}, c, { props: Object.assign(EL.defaultProps(c.type), c.props) })).filter((c) => EL.types[c.type]);
          buildCircuit(comps2, sc.wires, (r, nt) => {
            if (nt.has('#GND') && r === nt.find('#GND')) return 0;
            for (let i = 0; i < pinNames.length; i++) {
              const pk = '#P:' + pinNames[i];
              if (nt.has(pk) && r === nt.find(pk)) return nodes[i];
            }
            return undefined;
          }, cur.prefix + '/', depth + 1);
        },
      };
      for (const c of comps) {
        const t = EL.types[c.type];
        if (!t) continue;
        const nodes = nets.compPins.get(c).map((p) => nodeOf(key(p.x, p.y)));
        const saved = cur;
        cur = { prefix: path + c.id, els: [] };
        if (t.build) t.build(c, nodes, B, subCtx);
        if (!path) ctx.compEls.set(c.id, { els: cur.els, nodes });
        cur = saved;
      }
      return nets;
    }

    const top = buildCircuit(doc.comps, doc.wires, (r, nt) => {
      if (nt.has('#GND') && r === nt.find('#GND')) { hasGround = true; return 0; }
      return undefined;
    }, '', 0);
    const usesGround = ctx.els.some((e) => (e.n && e.n.includes(0)) || e instanceof SIM.OpAmp || (e instanceof SIM.Behavioral && e.o.gnd == null));
    if (!hasGround && !usesGround && doc.comps.length) ctx.warnings.push('No ground symbol – voltages are measured relative to an arbitrary reference.');
    ctx.nodeAt = (k) => { const n = ctx.keyNode.get(k); return n === undefined ? null : n; };
    ctx.topNets = top;
    return ctx;
  }

  /** Create a new engine for a netlist, carrying over state from a previous engine when possible. */
  function makeEngine(net, old, oldNet) {
    const eng = new SIM.Engine(net.nodeCount, net.els);
    if (old && oldNet && !old.error) {
      eng.t = old.t;
      const map = new Map(old.els.map((e) => [e.key, e]));
      for (const e of net.els) {
        const o = map.get(e.key);
        if (!o || o.constructor !== e.constructor) continue;
        if (e.stateKeys) for (const k of e.stateKeys) e[k] = U.clone(o[k]);
        if (e.constructor === SIM.Behavioral) e.ctx.state = e.state;
        if (e.nBranch && o.nBranch) eng.x[eng.nn - 1 + e.br] = old.x[old.nn - 1 + o.br];
      }
      for (const [k, n] of net.keyNode) {
        const on = oldNet.keyNode.get(k);
        if (n > 0 && on > 0) { eng.x[n - 1] = old.x[on - 1]; eng.xPrev[n - 1] = old.xPrev[on - 1]; }
      }
    }
    return eng;
  }

  /* ---------- serialisation ---------- */
  function usedCustomICs(comps, acc = new Map()) {
    for (const c of comps) {
      if (c.type !== 'ic') continue;
      const d = EL.ics.custom.get(c.props.ic);
      if (d && !acc.has(d.id)) {
        acc.set(d.id, EL.ics.strip(d));
        if (d.model.kind === 'subckt') usedCustomICs(d.model.circuit.comps, acc);
      }
    }
    return acc;
  }
  const compJSON = (c) => {
    const o = { id: c.id, type: c.type, x: c.x, y: c.y, props: U.clone(c.props) };
    if (c.rot) o.rot = c.rot;
    if (c.flip) o.flip = true;
    if (c.label) o.label = c.label;
    return o;
  };
  const wireJSON = (w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 });

  function serialize(doc) {
    return {
      format: 'electronics-lab', version: 1,
      comps: doc.comps.map(compJSON),
      wires: doc.wires.map(wireJSON),
      settings: U.clone(doc.settings),
      traces: U.clone(doc.traces || []),
      table: U.clone(doc.table || null),
      customICs: [...usedCustomICs(doc.comps).values()],
    };
  }
  function defaultSettings() { return { speed: 0.01, dt: 'auto', method: 'trap', tdiv: 1e-3, scopeMode: 'roll', scopeDisplay: 'analog', digTh: 2.5, digBus: true }; }
  function deserialize(o) {
    if (!o || !Array.isArray(o.comps)) throw new Error('Not an Electronics Lab circuit file');
    for (const d of o.customICs || []) if (!EL.ics.custom.has(d.id)) EL.ics.register(d);
    const comps = o.comps.filter((c) => EL.types[c.type]).map((c) => ({
      id: c.id || U.uid(), type: c.type, x: c.x | 0, y: c.y | 0, rot: c.rot | 0, flip: !!c.flip, label: c.label || '',
      props: Object.assign(EL.defaultProps(c.type), c.props || {}),
    }));
    const wires = (o.wires || []).map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })).filter((w) => w.x1 !== w.x2 || w.y1 !== w.y2);
    const table = Object.assign(EL.defaultTable ? EL.defaultTable() : {}, o.table || {});
    return { comps, wires, settings: Object.assign(defaultSettings(), o.settings || {}), traces: o.traces || [], table };
  }

  function nextLabel(doc, prefix) {
    let max = 0;
    const re = new RegExp('^' + prefix.replace(/[^A-Za-z]/g, '') + '(\\d+)$');
    for (const c of doc.comps) { const m = (c.label || '').match(re); if (m) max = Math.max(max, +m[1]); }
    return prefix + (max + 1);
  }

  function newComp(doc, type, x, y, extraProps) {
    const t = EL.types[type];
    const c = { id: U.uid(), type, x, y, rot: 0, flip: false, props: Object.assign(EL.defaultProps(type), extraProps || {}), label: '' };
    if (!t.noLabel) c.label = nextLabel(doc, t.prefix || 'X');
    if (type === 'probe') c.label = nextLabel(doc, 'P');
    return c;
  }

  EL.circuit = {
    key, absPins, localBox, worldBox, hitComp, segDist, onWireInterior, computeNets, connectionInfo,
    buildNetlist, makeEngine, serialize, deserialize, defaultSettings, nextLabel, newComp, compJSON, wireJSON,
  };
})(globalThis.EL = globalThis.EL || {});
