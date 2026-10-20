/* Electronics Lab – CircuiTikZ (LaTeX) export */
(function (EL) {
  'use strict';
  const U = EL.util, C = EL.circuit;
  const S = 0.4; // cm per grid unit

  const num = (v) => { const r = Math.round(v * 1000) / 1000; return String(Object.is(r, -0) ? 0 : r); };
  const P = (x, y) => `(${num(x * S)},${num(-y * S)})`;
  const texEsc = (s) => String(s).replace(/[\\{}$&#%_^~]/g, (c) => ({ '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' }[c] || '\\' + c));
  const texPin = (n) => (String(n).startsWith('~') ? `$\\overline{\\mathrm{${texEsc(n.slice(1))}}}$` : texEsc(n));
  function texLabel(l) {
    if (!l) return '';
    const m = String(l).match(/^([A-Za-z]+)(\d+)$/);
    return m ? `$${m[1]}_{${m[2]}}$` : texEsc(l);
  }
  const UNIT = { 'Ω': '\\Omega', '°': '^\\circ', '%': '\\%' };
  function texVal(v, unit) {
    const s = U.fmt(v, '', 3);
    const [n, pre = ''] = s.split(' ');
    const p = pre === 'µ' ? '\\mu ' : pre;
    const u = UNIT[unit] ?? unit;
    return `$${n}\\,\\mathrm{${p}${u}}$`;
  }

  function exportTikz(doc, o = {}) {
    const opt = Object.assign({ style: 'european', standalone: true, labels: true, values: true }, o);
    const out = [];
    const names = new Set();
    const uniq = (base) => { let b = String(base || 'n').replace(/[^A-Za-z0-9]/g, '') || 'n', s = b, k = 2; while (names.has(s)) s = b + k++; names.add(s); return s; };
    const iec = opt.style === 'european';

    for (const c of doc.comps) {
      const t = EL.types[c.type];
      const pins = C.absPins(c);
      const pt = (i) => P(pins[i].x, pins[i].y);
      const L = (x, y) => { const [a, b] = U.rot(x, y, c.rot || 0, c.flip); return P(c.x + a, c.y + b); };
      const ang = -90 * (c.rot || 0);
      const rotOpt = (ang ? `, rotate=${ang}` : '') + (c.flip ? ', xscale=-1' : '');
      const lab = opt.labels ? texLabel(c.label) : '';
      const val = opt.values && t.value && !t.noValue ? valueTex(c) : '';
      const ann = (lab ? `, l={${lab}}` : '') + (val ? `, a={${val}}` : '');
      const bip = (kind, a, b, extra = '') => out.push(`\\draw ${pt(a)} to[${kind}${ann}${extra}] ${pt(b)};`);
      // direction (world) of a local vector, used to pick anchors and orthogonal routes
      const dir = (x, y) => U.rot(x, y, c.rot || 0, c.flip);
      const route = (horizontalLead) => ((horizontalLead ? (c.rot || 0) % 2 === 0 : (c.rot || 0) % 2 === 1) ? '-|' : '|-');
      const anchorFor = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'west' : 'east') : dy > 0 ? 'north' : 'south');
      const node = (kind, at, anchor, conns) => {
        const nm = uniq(c.label || c.type);
        out.push(`\\node[${kind}${anchor ? `, anchor=${anchor}` : ''}${rotOpt}] (${nm}) at ${at} {};`);
        for (const [an, i, horiz] of conns) out.push(`\\draw (${nm}.${an}) ${route(horiz)} ${pt(i)};`);
        if (lab) { const [dx, dy] = dir(0, -1); out.push(`\\node[anchor=${anchorFor(dx, dy)}, font=\\small] at (${nm}.${dy < 0 ? 'north' : dy > 0 ? 'south' : dx < 0 ? 'west' : 'east'}) {${lab}};`); }
        return nm;
      };
      switch (c.type) {
        case 'res': bip('R', 0, 1); break;
        case 'cap': bip('C', 0, 1); break;
        case 'ecap': bip('eC', 0, 1); break;
        case 'ind': bip('L', 0, 1); break;
        case 'lamp': bip('lamp', 0, 1); break;
        case 'diode': bip('D*', 0, 1); break;
        case 'zener': bip('zD*', 0, 1); break;
        case 'led': bip('leD*', 0, 1); break;
        case 'vdc': bip('V', 1, 0); break;
        case 'battery': bip('battery1', 1, 0); break;
        case 'vac': bip({ square: 'sqV', triangle: 'tV', sawtooth: 'tV' }[c.props.wave] || 'sV', 1, 0); break;
        case 'idc': bip('I', 1, 0); break;
        case 'switch': bip(c.props.closed ? 'ncs' : 'nos', 0, 1); break;
        case 'button': bip('nopb', 0, 1); break;
        case 'vmeter': bip('voltmeter', 0, 1); break;
        case 'ameter': bip('ammeter', 0, 1); break;
        case 'pot': {
          const nm = uniq(c.label || 'pot');
          out.push(`\\draw ${pt(0)} to[pR, n=${nm}${ann}] ${pt(1)};`);
          out.push(`\\draw (${nm}.wiper) ${route(false)} ${pt(2)};`);
          break;
        }
        case 'spdt': node('spdt', L(-1, 0), 'in', [['in', 0, true], ['out 1', 1, true], ['out 2', 2, true]]); break;
        case 'gnd': out.push(`\\draw ${pt(0)} node[ground${ang ? `, rotate=${ang}` : ''}] {};`); break;
        case 'rail': {
          const v = (c.props.V >= 0 ? '+' : '') + texVal(c.props.V, 'V').slice(1, -1);
          const up = (c.rot || 0) === 0, down = (c.rot || 0) === 2;
          if (up || down) out.push(`\\draw ${pt(0)} node[${up ? 'vcc' : 'vee'}] {$${v}$};`);
          else { const [dx, dy] = dir(0, -1.2); out.push(`\\draw ${pt(0)} -- ${L(0, -1.2)} node[anchor=${anchorFor(dx, dy)}] {$${v}$};`); }
          break;
        }
        case 'npn': case 'pnp':
          node(c.type, L(-0.6, 0), 'B', [['B', 0, true], ['C', 1, false], ['E', 2, false]]); break;
        case 'nmos': case 'pmos':
          node(c.type, L(-0.75, 0), 'G', [['G', 0, true], ['D', 1, false], ['S', 2, false]]); break;
        case 'opamp': node('op amp', L(0, 0), null, [['-', 0, true], ['+', 1, true], ['out', 2, true]]); break;
        case 'and': case 'nand': case 'or': case 'nor': case 'xor': case 'xnor': {
          const n = pins.length - 1;
          node(`${iec ? 'european' : 'american'} ${c.type} port, number inputs=${n}`, L(0, 0), null,
            [...pins.slice(0, n).map((p, i) => [`in ${i + 1}`, i, true]), ['out', n, true]]);
          break;
        }
        case 'not': case 'buf':
          node(`${iec ? 'european' : 'american'} ${c.type === 'not' ? 'not' : 'buffer'} port`, L(0, 0), null, [['in', 0, true], ['out', 1, true]]); break;
        case 'probe': case 'logicin': case 'logicout': case 'clock': case 'label': case 'port': {
          const text = c.type === 'label' || c.type === 'port' ? texEsc(c.props.name)
            : c.type === 'logicin' ? `${texEsc(c.props.name || c.label)}${c.props.state ? ' = 1' : ' = 0'}`
            : c.type === 'logicout' ? texEsc(c.props.name || c.label)
            : c.type === 'clock' ? `${lab || 'CLK'} (${texVal(c.props.f, 'Hz')})` : lab;
          const ld = c.type === 'logicin' || c.type === 'clock' ? -1 : 1;
          const [dx, dy] = c.type === 'probe' ? dir(0.6, -1) : dir(ld, 0);
          const mark = c.type === 'probe' ? 'circ' : 'ocirc';
          out.push(`\\draw ${pt(0)} node[${mark}] {} node[anchor=${anchorFor(dx, dy)}, inner sep=4pt] {${text}};`);
          break;
        }
        case 'text': out.push(`\\node[anchor=west] at ${P(c.x, c.y)} {${texEsc(c.props.text)}};`); break;
        case 'ic': case 'seg7': default: genericBox(c, out, opt, L, pins, dir, anchorFor); break;
      }
    }

    // wires
    for (const w of doc.wires) out.push(`\\draw ${P(w.x1, w.y1)} -- ${P(w.x2, w.y2)};`);
    // junction dots
    for (const d of C.connectionInfo(doc).dots) out.push(`\\node[circ] at ${P(d.x, d.y)} {};`);

    const body = out.map((l) => '  ' + l).join('\n');
    const env = `\\begin{circuitikz}[${opt.style}, line width=0.6pt, every node/.style={font=\\small}]\n${body}\n\\end{circuitikz}`;
    if (!opt.standalone) return `% Generated by Electronics Lab – requires \\usepackage{circuitikz}\n${env}\n`;
    return [
      '% Generated by Electronics Lab',
      '\\documentclass[border=6pt]{standalone}',
      '\\usepackage[T1]{fontenc}',
      '\\usepackage{circuitikz}',
      '\\begin{document}',
      env,
      '\\end{document}',
      '',
    ].join('\n');
  }

  function valueTex(c) {
    const p = c.props;
    switch (c.type) {
      case 'res': return texVal(p.R, 'Ω');
      case 'pot': return texVal(p.R, 'Ω');
      case 'cap': case 'ecap': return texVal(p.C, 'F');
      case 'ind': return texVal(p.L, 'H');
      case 'vdc': case 'battery': return texVal(p.V, 'V');
      case 'idc': return texVal(p.I, 'A');
      case 'zener': return texVal(p.vz, 'V');
      case 'vac': return `${texVal(p.amp, 'V')}, ${texVal(p.f, 'Hz')}`;
      case 'lamp': return texVal(p.Prated, 'W');
      default: return '';
    }
  }

  /** ICs and other complex parts: body rectangle, pin stubs and pin labels in plain TikZ. */
  function genericBox(c, out, opt, L, pins, dir, anchorFor) {
    let body, name, gp;
    if (c.type === 'ic') {
      const def = EL.ics.get(c.props.ic);
      if (!def) return;
      const g = EL.ics.geom(def);
      body = g.body; gp = g.pins; name = def.name;
    } else if (c.type === 'seg7') {
      body = { x1: -2, y1: -7, x2: 4, y2: 7 };
      gp = C.absPins({ ...c, x: 0, y: 0, rot: 0, flip: false }).map((p, i) => ({ x: p.x, y: p.y, name: p.name, num: '', side: i < 7 ? 'L' : 'B' }));
      name = '7-seg';
    } else {
      const b = C.localBox(c);
      out.push(`\\draw ${L(b.x1, b.y1)} rectangle ${L(b.x2, b.y2)};`);
      pins.forEach((p, i) => out.push(`\\draw ${P(p.x, p.y)} node[circ] {};`));
      return;
    }
    out.push(`\\draw[thick] ${L(body.x1, body.y1)} rectangle ${L(body.x2, body.y2)};`);
    const cx = (body.x1 + body.x2) / 2, cy = (body.y1 + body.y2) / 2;
    out.push(`\\node[font=\\bfseries\\small] at ${L(cx, cy)} {${texEsc(name)}};`);
    if (opt.labels && c.label) { const [dx, dy] = dir(0, -1); out.push(`\\node[anchor=${(c.rot || 0) === 0 && !c.flip ? 'south west' : anchorFor(dx, dy)}, inner sep=2pt] at ${L(body.x1, body.y1)} {${texLabel(c.label)}};`); }
    gp.forEach((p, i) => {
      const pin = pins[i];
      let ex = p.x, ey = p.y, ix = 0, iy = 0;
      if (p.side === 'L') { ex = body.x1; ix = 1; } else if (p.side === 'R') { ex = body.x2; ix = -1; } else if (p.side === 'T') { ey = body.y1; iy = 1; } else { ey = body.y2; iy = -1; }
      out.push(`\\draw ${L(ex, ey)} -- ${P(pin.x, pin.y)};`);
      const [dx, dy] = dir(ix, iy);
      out.push(`\\node[anchor=${anchorFor(dx, dy)}, font=\\scriptsize, inner sep=2pt] at ${L(ex, ey)} {${texPin(p.name)}};`);
      if (p.num !== '' && p.num != null) {
        const [ox, oy] = dir(p.side === 'L' || p.side === 'R' ? 0 : 1, p.side === 'L' || p.side === 'R' ? -1 : 0);
        out.push(`\\node[anchor=${anchorFor(ox, oy)}, font=\\tiny, inner sep=1pt] at ${L((ex + p.x) / 2, (ey + p.y) / 2)} {${p.num}};`);
      }
    });
  }

  EL.tikz = { exportTikz };
})(globalThis.EL = globalThis.EL || {});
