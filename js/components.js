/* Electronics Lab – component definitions: geometry, symbol drawing, simulation model, measurements */
(function (EL) {
  'use strict';
  const U = EL.util;
  const T = (EL.types = {});
  const ORDER = (EL.typeOrder = []);

  const TWO = [{ x: -2, y: 0, name: 'A' }, { x: 2, y: 0, name: 'B' }];
  const VERT = [{ x: 0, y: -2, name: '+' }, { x: 0, y: 2, name: '−' }];
  const BOX2 = { x1: -2, y1: -0.6, x2: 2, y2: 0.6 };
  const BOXV = { x1: -1.1, y1: -2, x2: 1.1, y2: 2 };

  function reg(type, o) {
    o.type = type;
    o.props = o.props || [];
    T[type] = o;
    ORDER.push(type);
  }
  const num = (key, label, def, unit = '', extra = {}) => Object.assign({ key, label, def, unit, kind: 'num' }, extra);
  const sel = (key, label, def, options) => ({ key, label, def, kind: 'select', options });
  const bool = (key, label, def) => ({ key, label, def, kind: 'bool' });
  const txt = (key, label, def) => ({ key, label, def, kind: 'text' });

  /* ---------- measurement helpers ---------- */
  const twoMeasure = (c, st) => {
    const V = st.v[0] - st.v[1], e = st.els[0], I = e ? e.i : 0;
    return { V, I, P: V * I };
  };
  const srcMeasure = (c, st) => {
    const V = st.v[0] - st.v[1], e = st.els[0], I = e ? -e.i : 0;
    return { V, I, P: V * I, iLabel: 'I (out of +)', pLabel: 'P (delivered)' };
  };
  const signed = (v, unit) => (v > 0 ? '+' : '') + U.fmt(v, unit);

  /* ================= Sources ================= */
  reg('gnd', {
    name: 'Ground', cat: 'Sources', prefix: 'GND', noLabel: true,
    pins: [{ x: 0, y: 0, name: 'GND' }], box: { x1: -1, y1: 0, x2: 1, y2: 1.8 },
    draw(g) { g.lead(0, 0, 0, 1, 0); g.line(-0.9, 1, 0.9, 1); g.line(-0.55, 1.38, 0.55, 1.38); g.line(-0.2, 1.76, 0.2, 1.76); },
  });

  reg('rail', {
    name: 'Supply rail', cat: 'Sources', prefix: 'VS', noLabel: true,
    desc: 'Voltage relative to ground at a single point (like a lab power supply rail).',
    pins: [{ x: 0, y: 0, name: '+' }], box: { x1: -1.2, y1: -2.3, x2: 1.2, y2: 0 },
    props: [num('V', 'Voltage', 5, 'V')],
    draw(g, c) {
      g.lead(0, 0, 0, -1.1, 0);
      g.width(1.6); g.line(-0.8, -1.1, 0.8, -1.1); g.width(1);
      g.text(signed(c.props.V, 'V'), 0, -1.75, { size: 0.62, weight: 650 });
    },
    build(c, n, B) { B.V(n[0], 0, c.props.V); },
    measure(c, st) { const e = st.els[0], I = e ? -e.i : 0; return { V: st.v[0], I, P: st.v[0] * I, iLabel: 'I (supplied)' }; },
  });

  reg('vdc', {
    name: 'DC voltage source', cat: 'Sources', prefix: 'V', pins: VERT, box: BOXV,
    props: [num('V', 'Voltage', 5, 'V')],
    value: (c) => U.fmt(c.props.V, 'V'),
    draw(g) {
      g.lead(0, -2, 0, -1, 0); g.lead(0, 1, 0, 2, 1);
      g.circle(0, 0, 1, 'bg');
      if (g.iec) { g.line(0, -1, 0, 1); g.text('+', 0.62, -1.25, { size: 0.6 }); }
      else { g.text('+', 0, -0.45, { size: 0.75 }); g.text('−', 0, 0.48, { size: 0.75 }); }
    },
    build(c, n, B) { B.V(n[0], n[1], c.props.V); },
    measure: srcMeasure,
  });

  reg('battery', {
    name: 'Battery', cat: 'Sources', prefix: 'B', pins: VERT, box: BOXV,
    props: [num('V', 'Voltage', 9, 'V')],
    value: (c) => U.fmt(c.props.V, 'V'),
    draw(g) {
      g.lead(0, -2, 0, -0.3, 0); g.lead(0, 0.3, 0, 2, 1);
      g.line(-0.95, -0.3, 0.95, -0.3);
      g.width(2.6); g.line(-0.45, 0.3, 0.45, 0.3); g.width(1);
      g.text('+', 0.85, -0.9, { size: 0.55 });
    },
    build(c, n, B) { B.V(n[0], n[1], c.props.V); },
    measure: srcMeasure,
  });

  function wave(kind, ph, duty) {
    const x = ph - Math.floor(ph);
    switch (kind) {
      case 'square': return x < duty ? 1 : -1;
      case 'triangle': return x < 0.5 ? 4 * x - 1 : 3 - 4 * x;
      case 'sawtooth': return 2 * x - 1;
      default: return Math.sin(2 * Math.PI * x);
    }
  }
  function waveGlyph(g, kind, s = 1) {
    let pts;
    if (kind === 'square') pts = [-0.6, 0.3, -0.3, 0.3, -0.3, -0.3, 0.3, -0.3, 0.3, 0.3, 0.6, 0.3];
    else if (kind === 'triangle') pts = [-0.6, 0, -0.3, -0.32, 0.3, 0.32, 0.6, 0];
    else if (kind === 'sawtooth') pts = [-0.6, 0.3, 0, -0.3, 0, 0.3, 0.6, -0.3];
    else { pts = []; for (let i = 0; i <= 24; i++) { const x = -0.6 + (1.2 * i) / 24; pts.push(x, -0.34 * Math.sin((Math.PI * (x + 0.6)) / 0.6)); } }
    g.poly(pts.map((v) => v * s));
  }
  reg('vac', {
    name: 'Signal generator', cat: 'Sources', prefix: 'V', pins: VERT, box: BOXV,
    desc: 'Sine, square, triangle or sawtooth voltage. Amplitude is the peak value.',
    props: [
      sel('wave', 'Waveform', 'sine', [['sine', 'Sine'], ['square', 'Square'], ['triangle', 'Triangle'], ['sawtooth', 'Sawtooth']]),
      num('amp', 'Amplitude (peak)', 5, 'V'), num('f', 'Frequency', 1000, 'Hz'), num('offset', 'DC offset', 0, 'V'),
      num('phase', 'Phase', 0, '°'), num('duty', 'Duty cycle (square)', 50, '%'),
    ],
    value: (c) => `${U.fmt(c.props.amp, 'V')} ${U.fmt(c.props.f, 'Hz')}` + (c.props.offset ? ` ${signed(c.props.offset, 'V')}` : ''),
    draw(g, c) {
      g.lead(0, -2, 0, -1, 0); g.lead(0, 1, 0, 2, 1);
      g.circle(0, 0, 1, 'bg');
      waveGlyph(g, c.props.wave);
      g.text('+', 0.62, -1.25, { size: 0.55 });
    },
    build(c, n, B) {
      const p = c.props, duty = U.clamp(p.duty / 100, 0.001, 0.999);
      B.V(n[0], n[1], (t) => p.offset + p.amp * wave(p.wave, p.f * t + p.phase / 360, duty));
    },
    measure: srcMeasure,
  });

  reg('idc', {
    name: 'DC current source', cat: 'Sources', prefix: 'I',
    pins: [{ x: 0, y: -2, name: 'out' }, { x: 0, y: 2, name: 'in' }], box: { x1: -1.1, y1: -2, x2: 1.9, y2: 2 },
    desc: 'Drives the set current out of the top terminal (arrow direction).',
    props: [num('I', 'Current', 0.01, 'A')],
    value: (c) => U.fmt(c.props.I, 'A'),
    draw(g) {
      g.lead(0, -2, 0, -1, 0); g.lead(0, 1, 0, 2, 1);
      g.circle(0, 0, 1, 'bg');
      if (g.iec) { g.line(-1, 0, 1, 0); g.arrow(1.55, 0.7, 1.55, -0.7, 0.3); }
      else g.arrow(0, 0.6, 0, -0.6, 0.32);
    },
    build(c, n, B) { B.I(n[1], n[0], c.props.I); },
    measure(c, st) { const V = st.v[0] - st.v[1], I = c.props.I; return { V, I, P: V * I, iLabel: 'I (out of top)', pLabel: 'P (delivered)' }; },
  });

  /* ================= Passive ================= */
  reg('res', {
    name: 'Resistor', cat: 'Passive', prefix: 'R', pins: TWO, box: BOX2,
    props: [num('R', 'Resistance', 1000, 'Ω', { min: 1e-6 })],
    value: (c) => U.fmt(c.props.R, 'Ω'),
    draw(g) {
      g.lead(-2, 0, -1.2, 0, 0); g.lead(1.2, 0, 2, 0, 1);
      if (g.iec) g.rect(-1.2, -0.42, 1.2, 0.42, 'bg');
      else g.poly([-1.2, 0, -1, -0.45, -0.6, 0.45, -0.2, -0.45, 0.2, 0.45, 0.6, -0.45, 1, 0.45, 1.2, 0]);
    },
    build(c, n, B) { B.R(n[0], n[1], c.props.R); },
    measure: twoMeasure,
  });

  reg('cap', {
    name: 'Capacitor', cat: 'Passive', prefix: 'C', pins: TWO, box: { x1: -2, y1: -0.9, x2: 2, y2: 0.9 },
    props: [num('C', 'Capacitance', 1e-6, 'F', { min: 1e-18 })],
    value: (c) => U.fmt(c.props.C, 'F'),
    draw(g) {
      g.lead(-2, 0, -0.22, 0, 0); g.lead(0.22, 0, 2, 0, 1);
      g.width(1.4); g.line(-0.22, -0.8, -0.22, 0.8); g.line(0.22, -0.8, 0.22, 0.8); g.width(1);
    },
    build(c, n, B) { B.C(n[0], n[1], c.props.C); },
    measure: twoMeasure,
  });

  reg('ecap', {
    name: 'Electrolytic capacitor', cat: 'Passive', prefix: 'C', pins: [{ x: -2, y: 0, name: '+' }, { x: 2, y: 0, name: '−' }],
    box: { x1: -2, y1: -0.9, x2: 2, y2: 0.9 },
    props: [num('C', 'Capacitance', 100e-6, 'F', { min: 1e-18 })],
    value: (c) => U.fmt(c.props.C, 'F'),
    draw(g) {
      g.lead(-2, 0, -0.22, 0, 0); g.lead(0.3, 0, 2, 0, 1);
      g.width(1.4); g.line(-0.22, -0.8, -0.22, 0.8); g.width(1);
      g.rect(-0.22, -0.8, -0.05, 0.8, 'bg', 0, false);
      g.width(1.4);
      g.path((x) => { x.moveTo(0.45, -0.8); x.quadraticCurveTo(0.12, 0, 0.45, 0.8); });
      g.width(1);
      g.text('+', -0.7, -0.75, { size: 0.55 });
    },
    build(c, n, B) { B.C(n[0], n[1], c.props.C); },
    measure(c, st) {
      const m = twoMeasure(c, st);
      if (m.V < -0.5) m.warn = 'Reverse polarity!';
      return m;
    },
  });

  reg('ind', {
    name: 'Inductor', cat: 'Passive', prefix: 'L', pins: TWO, box: BOX2,
    props: [num('L', 'Inductance', 10e-3, 'H', { min: 1e-15 })],
    value: (c) => U.fmt(c.props.L, 'H'),
    draw(g) {
      g.lead(-2, 0, -1.2, 0, 0); g.lead(1.2, 0, 2, 0, 1);
      if (g.iec) g.rect(-1.2, -0.32, 1.2, 0.32, true);
      else for (let k = 0; k < 4; k++) g.arc(-0.9 + 0.6 * k, 0, 0.3, Math.PI, 2 * Math.PI);
    },
    build(c, n, B) { B.L(n[0], n[1], c.props.L); },
    measure: twoMeasure,
  });

  reg('pot', {
    name: 'Potentiometer', cat: 'Passive', prefix: 'RV',
    pins: [{ x: -2, y: 0, name: 'A' }, { x: 2, y: 0, name: 'B' }, { x: 0, y: -2, name: 'W' }],
    box: { x1: -2, y1: -2, x2: 2, y2: 0.6 },
    desc: 'Variable resistor with wiper. Position 0 % puts the wiper at terminal A.',
    props: [num('R', 'Total resistance', 10000, 'Ω', { min: 1e-3 }), num('pos', 'Wiper position', 50, '%', { slider: [0, 100, 1] })],
    value: (c) => `${U.fmt(c.props.R, 'Ω')} @ ${Math.round(c.props.pos)}%`,
    draw(g, c) {
      g.lead(-2, 0, -1.2, 0, 0); g.lead(1.2, 0, 2, 0, 1);
      if (g.iec) g.rect(-1.2, -0.42, 1.2, 0.42, 'bg');
      else g.poly([-1.2, 0, -1, -0.45, -0.6, 0.45, -0.2, -0.45, 0.2, 0.45, 0.6, -0.45, 1, 0.45, 1.2, 0]);
      const wx = -1 + 2 * U.clamp(c.props.pos / 100, 0, 1);
      g.lead(0, -2, 0, -1.2, 2);
      g.line(0, -1.2, wx, -1.2, g.leadColor(2));
      g.arrow(wx, -1.2, wx, -0.5, 0.28, g.leadColor(2));
    },
    build(c, n, B) {
      const R = c.props.R, a = U.clamp(c.props.pos / 100, 0, 1);
      B.R(n[0], n[2], Math.max(R * a, 1e-3));
      B.R(n[2], n[1], Math.max(R * (1 - a), 1e-3));
    },
    measure(c, st) {
      const e = st.els;
      return { V: st.v[0] - st.v[1], I: e[0] ? e[0].i : 0, rows: [['V(wiper)', U.fmt(st.v[2], 'V', 4, true)], ['I wiper', U.fmt(e[0] && e[1] ? e[1].i - e[0].i : 0, 'A', 3, true)]] };
    },
  });

  reg('lamp', {
    name: 'Lamp', cat: 'Passive', prefix: 'LA', pins: TWO, box: { x1: -2, y1: -1, x2: 2, y2: 1 },
    props: [num('R', 'Hot resistance', 100, 'Ω', { min: 1e-3 }), num('Prated', 'Rated power', 0.25, 'W', { min: 1e-6 })],
    value: (c) => U.fmt(c.props.Prated, 'W'),
    draw(g, c) {
      const st = g.st;
      if (st && st.els[0]) {
        const P = st.els[0].i * st.els[0].i * c.props.R, b = U.clamp(P / c.props.Prated, 0, 1.2);
        if (b > 0.02) g.glow(0, 0, 1.9, '255,200,60', Math.min(b, 1));
      }
      g.lead(-2, 0, -0.9, 0, 0); g.lead(0.9, 0, 2, 0, 1);
      g.circle(0, 0, 0.9, 'bg');
      g.line(-0.64, -0.64, 0.64, 0.64); g.line(-0.64, 0.64, 0.64, -0.64);
    },
    build(c, n, B) { B.R(n[0], n[1], c.props.R); },
    measure(c, st) { const m = twoMeasure(c, st); m.rows = [['Brightness', Math.round(U.clamp(m.P / c.props.Prated, 0, 1) * 100) + ' %']]; return m; },
  });

  /* ================= Semiconductors ================= */
  function diodeBody(g, fill) {
    g.poly([-0.5, -0.55, -0.5, 0.55, 0.5, 0], true, fill || true);
  }
  reg('diode', {
    name: 'Diode', cat: 'Semiconductors', prefix: 'D', pins: [{ x: -2, y: 0, name: 'A' }, { x: 2, y: 0, name: 'K' }], box: { x1: -2, y1: -0.7, x2: 2, y2: 0.7 },
    props: [num('vf', 'Forward voltage @ 10 mA', 0.7, 'V', { min: 0.05 })],
    value: () => '',
    draw(g) { g.lead(-2, 0, -0.5, 0, 0); g.lead(0.5, 0, 2, 0, 1); diodeBody(g); g.line(0.5, -0.6, 0.5, 0.6); },
    build(c, n, B) { B.D(n[0], n[1], { vf: c.props.vf, n: 1 }); },
    measure: twoMeasure,
  });

  reg('zener', {
    name: 'Zener diode', cat: 'Semiconductors', prefix: 'D', pins: [{ x: -2, y: 0, name: 'A' }, { x: 2, y: 0, name: 'K' }], box: { x1: -2, y1: -0.8, x2: 2, y2: 0.8 },
    props: [num('vz', 'Zener voltage', 5.1, 'V', { min: 0.5 }), num('vf', 'Forward voltage @ 10 mA', 0.7, 'V')],
    value: (c) => U.fmt(c.props.vz, 'V'),
    draw(g) { g.lead(-2, 0, -0.5, 0, 0); g.lead(0.5, 0, 2, 0, 1); diodeBody(g); g.poly([0.25, -0.75, 0.5, -0.55, 0.5, 0.55, 0.75, 0.75]); },
    build(c, n, B) { B.D(n[0], n[1], { vf: c.props.vf, n: 1, vz: c.props.vz }); },
    measure: twoMeasure,
  });

  const LED_COLORS = { red: ['#ef4444', 1.8], yellow: ['#eab308', 2.0], green: ['#22c55e', 2.1], blue: ['#3b82f6', 3.0], white: ['#f1f5f9', 3.0] };
  reg('led', {
    name: 'LED', cat: 'Semiconductors', prefix: 'D', pins: [{ x: -2, y: 0, name: 'A' }, { x: 2, y: 0, name: 'K' }], box: { x1: -2, y1: -1.4, x2: 2, y2: 0.7 },
    desc: 'Light-emitting diode. Full brightness at 20 mA.',
    props: [sel('color', 'Colour', 'red', Object.keys(LED_COLORS).map((k) => [k, k[0].toUpperCase() + k.slice(1)]))],
    value: () => '',
    draw(g, c) {
      const [col] = LED_COLORS[c.props.color] || LED_COLORS.red;
      let b = 0;
      if (g.st && g.st.els[0]) b = U.clamp(g.st.els[0].i / 0.02, 0, 1);
      if (b > 0.01) g.glow(0, 0, 1.8, hexRgb(col), b);
      g.lead(-2, 0, -0.5, 0, 0); g.lead(0.5, 0, 2, 0, 1);
      diodeBody(g, b > 0.01 ? col : 'bg');
      g.line(0.5, -0.6, 0.5, 0.6);
      g.arrow(0.0, -0.75, 0.45, -1.25, 0.22); g.arrow(0.45, -0.75, 0.9, -1.25, 0.22);
    },
    build(c, n, B) { B.D(n[0], n[1], { vf: (LED_COLORS[c.props.color] || LED_COLORS.red)[1], n: 2 }); },
    measure(c, st) { const m = twoMeasure(c, st); m.rows = [['Brightness', Math.round(U.clamp(m.I / 0.02, 0, 1) * 100) + ' %']]; if (m.I > 0.05) m.warn = 'Over-current – add a series resistor'; return m; },
  });
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; }

  function bjtDraw(pnp) {
    return (g) => {
      g.circle(0.3, 0, 1.55, null);
      g.lead(-2, 0, -0.5, 0, 0);
      g.width(2.2); g.line(-0.5, -0.85, -0.5, 0.85); g.width(1);
      g.line(-0.5, -0.35, 1, -1.1); g.lead(1, -1.1, 1, -2, 1);
      g.line(-0.5, 0.35, 1, 1.1); g.lead(1, 1.1, 1, 2, 2);
      if (pnp) g.arrowHead(-0.2, 0.5, Math.atan2(-0.75, -1.5), 0.36);
      else g.arrowHead(0.85, 1.025, Math.atan2(0.75, 1.5), 0.36);
    };
  }
  const BJT_PINS = [{ x: -2, y: 0, name: 'B' }, { x: 1, y: -2, name: 'C' }, { x: 1, y: 2, name: 'E' }];
  const bjtMeasure = (c, st) => {
    const e = st.els[0];
    if (!e) return {};
    const [vb, vc, ve] = st.v;
    return { rows: [['I_C', U.fmt(e.ic, 'A', 3, true)], ['I_B', U.fmt(e.ib, 'A', 3, true)], ['I_E', U.fmt(-e.ie, 'A', 3, true)], ['V_BE', U.fmt(vb - ve, 'V', 3, true)], ['V_CE', U.fmt(vc - ve, 'V', 3, true)]], I: e.ic, iLabel: 'I_C' };
  };
  for (const [type, name, pol] of [['npn', 'NPN transistor', 1], ['pnp', 'PNP transistor', -1]]) {
    reg(type, {
      name, cat: 'Semiconductors', prefix: 'Q', pins: BJT_PINS, box: { x1: -2, y1: -2, x2: 1.9, y2: 2 },
      props: [num('beta', 'Current gain β', 100, '', { min: 1 })],
      value: (c) => `β=${c.props.beta}`,
      draw: bjtDraw(pol < 0),
      build(c, n, B) { B.Q(n[1], n[0], n[2], pol, { beta: c.props.beta }); },
      measure: bjtMeasure,
    });
  }

  function mosDraw(pmos) {
    return (g) => {
      g.lead(-2, 0, -0.75, 0, 0);
      g.width(1.4); g.line(-0.75, -0.8, -0.75, 0.8);
      g.width(2); g.line(-0.35, -0.95, -0.35, -0.45); g.line(-0.35, -0.25, -0.35, 0.25); g.line(-0.35, 0.45, -0.35, 0.95); g.width(1);
      g.line(-0.35, -0.7, 1, -0.7); g.lead(1, -0.7, 1, -2, 1);
      g.line(-0.35, 0.7, 1, 0.7); g.lead(1, 0.7, 1, 2, 2);
      g.line(-0.35, 0, 1, 0); g.line(1, 0, 1, 0.7);
      if (pmos) g.arrowHead(0.55, 0, 0, 0.34); else g.arrowHead(-0.25, 0, Math.PI, 0.34);
      if (pmos) g.circle(-0.95, 0, 0.18, 'bg');
    };
  }
  const MOS_PINS = [{ x: -2, y: 0, name: 'G' }, { x: 1, y: -2, name: 'D' }, { x: 1, y: 2, name: 'S' }];
  for (const [type, name, pol] of [['nmos', 'N-channel MOSFET', 1], ['pmos', 'P-channel MOSFET', -1]]) {
    reg(type, {
      name, cat: 'Semiconductors', prefix: 'M', pins: MOS_PINS, box: { x1: -2, y1: -2, x2: 1.4, y2: 2 },
      props: [num('vth', 'Threshold |Vth|', 1.5, 'V'), num('k', 'Transconductance K', 0.05, 'A/V²')],
      value: (c) => `Vth=${U.fmt(c.props.vth, 'V')}`,
      draw: mosDraw(pol < 0),
      build(c, n, B) { B.M(n[1], n[0], n[2], pol, { vth: c.props.vth, k: c.props.k }); },
      measure(c, st) {
        const e = st.els[0];
        if (!e) return {};
        const [vg, vd, vs] = st.v;
        return { I: e.id, iLabel: 'I_D', rows: [['V_GS', U.fmt(vg - vs, 'V', 3, true)], ['V_DS', U.fmt(vd - vs, 'V', 3, true)]] };
      },
    });
  }

  reg('opamp', {
    name: 'Op-amp', cat: 'Semiconductors', prefix: 'U',
    pins: [{ x: -3, y: -1, name: '−' }, { x: -3, y: 1, name: '+' }, { x: 3, y: 0, name: 'out' }], box: { x1: -3, y1: -2, x2: 3, y2: 2 },
    desc: 'Ideal-ish op-amp with open-loop gain A that saturates at the given rails (no supply pins needed).',
    props: [num('vhi', 'Positive rail', 15, 'V'), num('vlo', 'Negative rail', -15, 'V'), num('gain', 'Open-loop gain', 1e5, '', { min: 1 })],
    value: (c) => `±${U.fmt(Math.max(Math.abs(c.props.vhi), Math.abs(c.props.vlo)), 'V')}`,
    draw(g) {
      g.lead(-3, -1, -2, -1, 0); g.lead(-3, 1, -2, 1, 1); g.lead(2, 0, 3, 0, 2);
      g.poly([-2, -2, -2, 2, 2, 0], true, 'bg');
      g.text('−', -1.45, -1, { size: 0.85 }); g.text('+', -1.45, 1, { size: 0.85 });
    },
    build(c, n, B) { B.OA(n[1], n[0], n[2], { vhi: c.props.vhi, vlo: c.props.vlo, gain: c.props.gain }); },
    measure(c, st) { const e = st.els[0]; return { V: st.v[2], vLabel: 'V_out', I: e ? -e.i : 0, iLabel: 'I_out', rows: [['V+ − V−', U.fmt(st.v[1] - st.v[0], 'V', 3, true)]] }; },
  });

  /* ================= Switches ================= */
  reg('switch', {
    name: 'Switch', cat: 'Switches', prefix: 'S', pins: TWO, box: { x1: -2, y1: -1, x2: 2, y2: 0.4 },
    desc: 'Click the switch on the schematic to toggle it.',
    props: [bool('closed', 'Closed', false)],
    value: () => '',
    click(c) { c.props.closed = !c.props.closed; return true; },
    draw(g, c) {
      g.lead(-2, 0, -1, 0, 0); g.lead(1, 0, 2, 0, 1);
      g.circle(-1, 0, 0.14, true); g.circle(1, 0, 0.14, true);
      g.width(1.3);
      if (c.props.closed) g.line(-1, 0, 1.05, -0.2); else g.line(-1, 0, 0.85, -0.9);
      g.width(1);
    },
    build(c, n, B) { if (c.props.closed) B.R(n[0], n[1], 1e-3); },
    measure(c, st) { const e = st.els[0]; return { V: st.v[0] - st.v[1], I: e ? e.i : 0 }; },
  });

  reg('button', {
    name: 'Push button', cat: 'Switches', prefix: 'S', pins: TWO, box: { x1: -2, y1: -1.5, x2: 2, y2: 0.4 },
    desc: 'Momentary switch – closed while you hold the mouse button on it.',
    props: [],
    press(c, down) { c.state = down; return true; },
    draw(g, c) {
      const down = !!c.state;
      g.lead(-2, 0, -1, 0, 0); g.lead(1, 0, 2, 0, 1);
      g.circle(-1, 0, 0.14, true); g.circle(1, 0, 0.14, true);
      const y = down ? -0.18 : -0.7;
      g.width(1.3); g.line(-1.15, y, 1.15, y); g.width(1);
      g.line(0, y, 0, y - 0.6); g.line(-0.35, y - 0.6, 0.35, y - 0.6);
    },
    build(c, n, B) { if (c.state) B.R(n[0], n[1], 1e-3); },
    measure(c, st) { const e = st.els[0]; return { V: st.v[0] - st.v[1], I: e ? e.i : 0 }; },
  });

  reg('spdt', {
    name: 'Changeover switch', cat: 'Switches', prefix: 'S',
    pins: [{ x: -2, y: 0, name: 'COM' }, { x: 2, y: -1, name: 'A' }, { x: 2, y: 1, name: 'B' }], box: { x1: -2, y1: -1.3, x2: 2, y2: 1.3 },
    desc: 'Single-pole double-throw switch. Click to change over.',
    props: [sel('pos', 'Position', 'A', [['A', 'A (upper)'], ['B', 'B (lower)']])],
    value: () => '',
    click(c) { c.props.pos = c.props.pos === 'A' ? 'B' : 'A'; return true; },
    draw(g, c) {
      g.lead(-2, 0, -1, 0, 0); g.lead(1, -1, 2, -1, 1); g.lead(1, 1, 2, 1, 2);
      g.circle(-1, 0, 0.14, true); g.circle(1, -1, 0.14, true); g.circle(1, 1, 0.14, true);
      g.width(1.3); g.line(-1, 0, 0.92, c.props.pos === 'A' ? -0.9 : 0.9); g.width(1);
    },
    build(c, n, B) { B.R(n[0], c.props.pos === 'A' ? n[1] : n[2], 1e-3); },
  });

  /* ================= Meters & probes ================= */
  // Read-out badge stays upright: above a horizontal meter, to the right of a vertical one.
  function meterBox(g, c, text) {
    const [lx, ly] = (c.rot || 0) % 2 ? U.unrot(3.1, 0, c.rot, c.flip) : U.unrot(0, -2.05, c.rot, c.flip);
    g.badge(text, lx, ly, { mono: true, bg: g.th.readBg, color: g.th.readFg, minWidth: 3.2 });
  }
  const meterBoxBounds = (c) => {
    switch ((c.rot || 0) & 3) {
      case 1: return { x1: -2, y1: -4.8, x2: 2, y2: 1 };
      case 2: return { x1: -2, y1: -1, x2: 2, y2: 2.7 };
      case 3: return { x1: -2, y1: -1, x2: 2, y2: 4.8 };
      default: return { x1: -2, y1: -2.7, x2: 2, y2: 1 };
    }
  };
  reg('vmeter', {
    name: 'Voltmeter', cat: 'Meters & probes', prefix: 'VM', pins: [{ x: -2, y: 0, name: '+' }, { x: 2, y: 0, name: '−' }],
    box: meterBoxBounds, noLabel: true,
    desc: 'Ideal voltmeter (infinite input resistance). Shows V(+) − V(−).',
    props: [bool('scope', 'Show in oscilloscope', false)],
    draw(g, c) {
      g.lead(-2, 0, -1, 0, 0); g.lead(1, 0, 2, 0, 1);
      g.circle(0, 0, 1, 'bg'); g.text('V', 0, 0.03, { size: 0.9, weight: 650 });
      g.text('+', -1.45, -0.5, { size: 0.5 });
      meterBox(g, c, g.st ? U.fmt(g.st.v[0] - g.st.v[1], 'V', 4, true) : '— V');
    },
    measure(c, st) { return { V: st.v[0] - st.v[1] }; },
  });

  reg('ameter', {
    name: 'Ammeter', cat: 'Meters & probes', prefix: 'AM', pins: [{ x: -2, y: 0, name: 'in' }, { x: 2, y: 0, name: 'out' }],
    box: meterBoxBounds, noLabel: true,
    desc: 'Ideal ammeter (zero resistance). Positive when current flows in → out (left to right).',
    props: [bool('scope', 'Show in oscilloscope', false)],
    draw(g, c) {
      g.lead(-2, 0, -1, 0, 0); g.lead(1, 0, 2, 0, 1);
      g.circle(0, 0, 1, 'bg'); g.text('A', 0, 0.03, { size: 0.9, weight: 650 });
      meterBox(g, c, g.st && g.st.els[0] ? U.fmt(g.st.els[0].i, 'A', 4, true) : '— A');
    },
    build(c, n, B) { B.V(n[0], n[1], 0); },
    measure(c, st) { const e = st.els[0]; return { I: e ? e.i : 0, V: st.v[0] - st.v[1] }; },
  });

  reg('probe', {
    name: 'Scope probe', cat: 'Meters & probes', prefix: 'P', pins: [{ x: 0, y: 0, name: 'tip' }], box: { x1: -0.2, y1: -2.6, x2: 1.9, y2: 0.2 }, noLabel: true,
    desc: 'Connect to any node – its voltage is plotted in the oscilloscope.',
    props: [],
    draw(g, c) {
      const col = g.th.traceColor ? g.th.traceColor('probe:' + c.id) : g.th.accent;
      g.lead(0, 0, 0.75, -0.75, 0);
      g.circle(1.15, -1.15, 0.55, col || g.th.accent);
      if (c.label && g.showLabels !== false) g.text(c.label, 1.15, -1.95, { size: 0.6, weight: 650, baseline: 'bottom', color: g.th.label });
    },
    measure(c, st) { return { V: st.v[0], vLabel: 'V (to ground)' }; },
  });

  /* ================= Logic ================= */
  function logicBox(g, x1, x2, color) { g.rect(x1, -0.8, x2, 0.8, color || 'bg', 0.25); }
  reg('logicin', {
    name: 'Logic input', cat: 'Logic', prefix: 'IN', pins: [{ x: 0, y: 0, name: 'out' }], box: { x1: -3, y1: -0.8, x2: 0, y2: 0.8 },
    desc: 'Click to toggle between 0 V and the high level.',
    props: [txt('name', 'Name', ''), bool('state', 'High', false), num('vh', 'High level', 5, 'V')],
    labelProp: 'name',
    click(c) { c.props.state = !c.props.state; return true; },
    draw(g, c) {
      const on = c.props.state;
      g.lead(-1, 0, 0, 0, 0);
      logicBox(g, -3, -1, on ? g.th.logicHi : g.th.logicLoBg);
      g.text(on ? '1' : '0', -2, 0.03, { size: 0.85, weight: 700, mono: true, color: on ? '#fff' : g.fg });
    },
    build(c, n, B) { const on = c.props.state ? 1 : 0; B.behav(n, { vhigh: c.props.vh, outputs: [0], rOut: 10, logic: (x) => x.out(0, on) }); },
    measure(c, st) { return { V: st.v[0] }; },
  });

  reg('logicout', {
    name: 'Logic output', cat: 'Logic', prefix: 'OUT', pins: [{ x: 0, y: 0, name: 'in' }], box: { x1: 0, y1: -0.85, x2: 2.6, y2: 0.85 },
    desc: 'Lights up when the input is above the threshold.',
    props: [txt('name', 'Name', ''), num('vth', 'Threshold', 2.5, 'V')],
    labelProp: 'name',
    draw(g, c) {
      const on = g.st && g.st.v[0] > c.props.vth;
      g.lead(0, 0, 0.95, 0, 0);
      g.circle(1.75, 0, 0.8, on ? g.th.logicHi : g.th.logicLoBg);
      g.text(g.st ? (on ? '1' : '0') : '?', 1.75, 0.03, { size: 0.8, weight: 700, mono: true, color: on ? '#fff' : g.fg });
    },
    measure(c, st) { return { V: st.v[0] }; },
  });

  reg('clock', {
    name: 'Clock', cat: 'Logic', prefix: 'CLK', pins: [{ x: 0, y: 0, name: 'out' }], box: { x1: -3.4, y1: -0.8, x2: 0, y2: 0.8 },
    desc: 'Square-wave logic source (0 V / high level).',
    props: [num('f', 'Frequency', 1, 'Hz', { min: 1e-6 }), num('vh', 'High level', 5, 'V')],
    value: (c) => U.fmt(c.props.f, 'Hz'),
    draw(g, c) {
      const on = g.st && g.st.v[0] > c.props.vh / 2;
      g.lead(-1, 0, 0, 0, 0);
      logicBox(g, -3.4, -1, on ? g.th.logicHi : 'bg');
      g.poly([-3, 0.35, -2.6, 0.35, -2.6, -0.35, -2.0, -0.35, -2.0, 0.35, -1.4, 0.35, -1.4, -0.35], false, null, on ? '#fff' : null);
    },
    build(c, n, B) {
      const f = c.props.f;
      B.behav(n, { vhigh: c.props.vh, outputs: [0], rOut: 10, logic: (x) => x.out(0, (x.t * f) % 1 >= 0.5 ? 0 : 1) });
    },
    measure(c, st) { return { V: st.v[0] }; },
  });

  /* gates */
  const GATES = {
    and: ['AND', '&', (b) => b.every(Boolean), false],
    nand: ['NAND', '&', (b) => b.every(Boolean), true],
    or: ['OR', '≥1', (b) => b.some(Boolean), false],
    nor: ['NOR', '≥1', (b) => b.some(Boolean), true],
    xor: ['XOR', '=1', (b) => b.reduce((a, x) => a ^ x, 0) === 1, false],
    xnor: ['XNOR', '=1', (b) => b.reduce((a, x) => a ^ x, 0) === 1, true],
    not: ['NOT', '1', (b) => !!b[0], true],
    buf: ['Buffer', '1', (b) => !!b[0], false],
  };
  const nIn = (c) => (c.type === 'not' || c.type === 'buf' ? 1 : U.clamp(c.props.inputs | 0 || 2, 2, 4));
  function gatePins(c) {
    const n = nIn(c), ps = [];
    for (let i = 0; i < n; i++) ps.push({ x: -3, y: n === 1 ? 0 : -(n - 1) + 2 * i, name: 'in' + (i + 1) });
    ps.push({ x: 3, y: 0, name: 'out' });
    return ps;
  }
  function gateDraw(type) {
    const [, iecSym, , inv] = GATES[type];
    return (g, c) => {
      const n = nIn(c), h = n === 1 ? 1.5 : Math.max(2, n);
      const ps = gatePins(c);
      const single = n === 1;
      const xEnd = single ? 1.4 : 2;
      ps.slice(0, n).forEach((p, i) => g.lead(-3, p.y, -1.9, p.y, i));
      g.lead(inv ? xEnd + 0.6 : xEnd, 0, 3, 0, n);
      if (g.iec) {
        const hh = single ? 1.5 : h;
        g.rect(-2, -hh, single ? 1.4 : 2, hh, 'bg');
        g.text(iecSym, single ? -0.3 : 0, -hh + 0.75, { size: 0.75, weight: 600 });
      } else if (single) {
        g.poly([-2, -1.4, -2, 1.4, 1.4, 0], true, 'bg');
      } else if (type === 'and' || type === 'nand') {
        g.path((x) => { x.moveTo(-2, -h); x.lineTo(0, -h); x.ellipse(0, 0, 2, h, 0, -Math.PI / 2, Math.PI / 2); x.lineTo(-2, h); x.closePath(); }, 'bg');
      } else {
        if (type === 'xor' || type === 'xnor') g.path((x) => { x.moveTo(-2.5, -h); x.quadraticCurveTo(-1.5, 0, -2.5, h); });
        g.path((x) => {
          x.moveTo(-2, -h); x.quadraticCurveTo(0.9, -h, 2, 0); x.quadraticCurveTo(0.9, h, -2, h); x.quadraticCurveTo(-1, 0, -2, -h); x.closePath();
        }, 'bg');
      }
      if (inv) g.circle(xEnd + 0.3, 0, 0.3, 'bg');
    };
  }
  for (const type of Object.keys(GATES)) {
    const [label, , fn, inv] = GATES[type];
    const single = type === 'not' || type === 'buf';
    reg(type, {
      name: single ? (type === 'not' ? 'NOT gate (inverter)' : 'Buffer') : `${label} gate`, cat: 'Logic', prefix: 'U',
      pins: gatePins,
      box: (c) => { const n = nIn(c), h = n === 1 ? 1.5 : Math.max(2, n); return { x1: -3, y1: -h, x2: 3, y2: h }; },
      props: [...(single ? [] : [sel('inputs', 'Inputs', 2, [[2, '2'], [3, '3'], [4, '4']])]), num('vh', 'Supply (high level)', 5, 'V')],
      noValue: true,
      draw: gateDraw(type),
      build(c, n, B) {
        const k = nIn(c), outIdx = k;
        B.behav(n, {
          vhigh: c.props.vh, outputs: [outIdx], rOut: 25,
          logic(x) { const b = []; for (let i = 0; i < k; i++) b.push(x.bit(i)); x.out(outIdx, fn(b) !== inv ? 1 : 0); },
        });
      },
      measure(c, st) { return { V: st.v[st.v.length - 1], vLabel: 'V_out' }; },
    });
  }

  /* 7-segment display */
  const SEGS = 'abcdefg'.split('');
  reg('seg7', {
    name: '7-segment display', cat: 'Logic', prefix: 'DS', labelTop: true,
    pins: [...SEGS.map((s, i) => ({ x: -4, y: -6 + 2 * i, name: s })), { x: 1, y: 9, name: 'COM' }],
    box: { x1: -4, y1: -7, x2: 4, y2: 9 },
    desc: 'Logic-level display. Common cathode: a segment lights when V(segment) − V(COM) > 1.5 V. Common anode (e.g. with a 74LS47): when V(COM) − V(segment) > 1.5 V.',
    props: [sel('common', 'Type', 'cathode', [['cathode', 'Common cathode'], ['anode', 'Common anode']]), sel('color', 'Colour', 'red', Object.keys(LED_COLORS).map((k) => [k, k[0].toUpperCase() + k.slice(1)]))],
    noValue: true,
    draw(g, c) {
      SEGS.forEach((s, i) => { g.lead(-4, -6 + 2 * i, -2, -6 + 2 * i, i); g.text(s, -1.6, -6 + 2 * i, { size: 0.5, color: g.th.muted, align: 'left' }); });
      g.lead(1, 7, 1, 9, 7);
      g.rect(-2, -7, 4, 7, g.th.segBg, 0.3);
      const col = (LED_COLORS[c.props.color] || LED_COLORS.red)[0];
      const on = (i) => g.st && (c.props.common === 'anode' ? g.st.v[7] - g.st.v[i] : g.st.v[i] - g.st.v[7]) > 1.5;
      // digit centred at (1.2, 0): width 2.6, height 8
      const L = 0.1, x0 = -0.1, x1 = 2.5, y0 = -4.6, ym = 0, y1 = 4.6, w = 0.32;
      const H = (x, y, i) => g.poly([x + L, y, x + L + w, y - w, x1 - (x - x0) - L - w, y - w, x1 - (x - x0) - L, y, x1 - (x - x0) - L - w, y + w, x + L + w, y + w], true, on(i) ? col : g.th.segOff, null, false);
      const V = (x, ya, yb, i) => g.poly([x, ya + L, x + w, ya + L + w, x + w, yb - L - w, x, yb - L, x - w, yb - L - w, x - w, ya + L + w], true, on(i) ? col : g.th.segOff, null, false);
      H(x0, y0, 0); V(x1, y0, ym, 1); V(x1, ym, y1, 2); H(x0, y1, 3); V(x0, ym, y1, 4); V(x0, y0, ym, 5); H(x0, ym, 6);
      g.text('COM', 1, 6.1, { size: 0.45, color: g.th.muted });
    },
  });

  /* ================= Integrated circuits ================= */
  reg('ic', {
    name: 'Integrated circuit', cat: 'ICs', prefix: 'U', hidden: true, ownLabel: true,
    pins: (c) => { const d = EL.ics.get(c.props.ic); return d ? EL.ics.geom(d).pins : []; },
    box: (c) => { const d = EL.ics.get(c.props.ic); return d ? EL.ics.geom(d).box : { x1: -3, y1: -2, x2: 3, y2: 2 }; },
    props: [],
    noValue: true,
    draw(g, c) {
      const def = EL.ics.get(c.props.ic);
      if (!def) {
        g.rect(-3, -2, 3, 2, 'bg', 0.2);
        g.text('missing IC', 0, 0, { size: 0.6, color: g.th.danger });
        return;
      }
      const G = EL.ics.geom(def), b = G.body;
      G.pins.forEach((p, i) => {
        let ex = p.x, ey = p.y;
        if (p.side === 'L') ex = b.x1; else if (p.side === 'R') ex = b.x2; else if (p.side === 'T') ey = b.y1; else ey = b.y2;
        g.lead(p.x, p.y, ex, ey, i);
      });
      g.rect(b.x1, b.y1, b.x2, b.y2, g.th.icFill, 0.25);
      if (def.layout === 'dip') g.arc(0, b.y1, 0.55, 0, Math.PI);
      G.pins.forEach((p) => {
        const s = 0.52, nm = p.name;
        if (p.side === 'L') { g.text(nm, b.x1 + 0.35, p.y, { size: s, align: 'left' }); g.text(p.num, (p.x + b.x1) / 2, p.y - 0.42, { size: 0.42, color: g.th.muted }); }
        else if (p.side === 'R') { g.text(nm, b.x2 - 0.35, p.y, { size: s, align: 'right' }); g.text(p.num, (p.x + b.x2) / 2, p.y - 0.42, { size: 0.42, color: g.th.muted }); }
        else if (p.side === 'T') { g.text(nm, p.x, b.y1 + 0.6, { size: s }); g.text(p.num, p.x + 0.45, (p.y + b.y1) / 2, { size: 0.42, color: g.th.muted, align: 'left' }); }
        else { g.text(nm, p.x, b.y2 - 0.6, { size: s }); g.text(p.num, p.x + 0.45, (p.y + b.y2) / 2, { size: 0.42, color: g.th.muted, align: 'left' }); }
      });
      const cy = def.layout === 'dip' ? 0 : (b.y1 + b.y2) / 2;
      g.text(def.name, 0, cy - 0.35, { size: 0.62, weight: 700 });
      if (c.label && g.showLabels !== false) g.text(c.label, b.x1, b.y1 - 0.5, { size: 0.6, weight: 650, align: 'left', color: g.th.label });
      if (def.layout === 'dip' || (b.y2 - b.y1) > 4) g.text(def.title || '', 0, cy + 0.4, { size: 0.4, color: g.th.muted, maxWidth: b.x2 - b.x1 - 1 });
      if (g.st && g.st.els.some((e) => e.powered === false)) g.text('no power', 0, b.y2 - (def.layout === 'dip' ? 1 : 1.4), { size: 0.45, color: g.th.danger, weight: 600 });
    },
    build(c, n, B, ctx) { const d = EL.ics.get(c.props.ic); if (d) EL.ics.build(d, n, B, ctx); },
    measure(c, st) {
      const d = EL.ics.get(c.props.ic);
      if (!d) return {};
      return { rows: EL.ics.geom(d).pins.map((p, i) => [`${p.num} ${p.name.replace('~', '/')}`, U.fmt(st.v[i], 'V', 3, true)]) };
    },
  });

  /* ================= Annotation / connectivity ================= */
  reg('label', {
    name: 'Net label', cat: 'Annotation', prefix: 'NET', pins: [{ x: 0, y: 0, name: 'net' }], box: { x1: 0, y1: -0.7, x2: 4, y2: 0.7 }, noLabel: true,
    desc: 'All net labels with the same name are connected together.',
    props: [txt('name', 'Net name', 'NET1')],
    draw(g, c) {
      const w = Math.max(1.6, String(c.props.name).length * 0.42 + 0.8);
      g.lead(0, 0, 0.6, 0, 0);
      g.poly([0.6, 0, 1.2, -0.6, 1.2 + w, -0.6, 1.2 + w, 0.6, 1.2, 0.6], true, 'bg');
      g.text(c.props.name, 1.25 + w / 2, 0.02, { size: 0.55, weight: 600 });
    },
  });

  reg('port', {
    name: 'IC port', cat: 'Annotation', prefix: 'PORT', pins: [{ x: 0, y: 0, name: 'port' }], box: { x1: 0, y1: -0.7, x2: 4, y2: 0.7 }, noLabel: true,
    desc: 'Marks an external pin when the circuit is turned into a custom IC (sub-circuit).',
    props: [txt('name', 'Pin name', 'IN')],
    draw(g, c) {
      const w = Math.max(1.6, String(c.props.name).length * 0.42 + 0.8);
      g.lead(0, 0, 0.6, 0, 0);
      g.rect(0.6, -0.6, 1.2 + w, 0.6, g.th.portBg, 0.6);
      g.text(c.props.name, 0.9 + w / 2, 0.02, { size: 0.55, weight: 650, color: g.th.portFg });
    },
  });

  reg('text', {
    name: 'Text', cat: 'Annotation', prefix: 'TXT', pins: [], noLabel: true,
    box: (c) => ({ x1: 0, y1: -0.6 * (c.props.size || 1), x2: Math.max(1, String(c.props.text).length * 0.36 * (c.props.size || 1)), y2: 0.6 * (c.props.size || 1) }),
    props: [txt('text', 'Text', 'Comment'), num('size', 'Size', 1, '', { min: 0.3 })],
    draw(g, c) { g.text(c.props.text, 0, 0, { size: 0.6 * (c.props.size || 1), align: 'left', color: g.th.textNote }); },
  });

  /* ---------- palette categories ---------- */
  EL.paletteCats = [
    ['Sources', ['gnd', 'rail', 'vdc', 'battery', 'vac', 'idc']],
    ['Passive', ['res', 'cap', 'ecap', 'ind', 'pot', 'lamp']],
    ['Semiconductors', ['diode', 'zener', 'led', 'npn', 'pnp', 'nmos', 'pmos', 'opamp']],
    ['Switches', ['switch', 'button', 'spdt']],
    ['Meters & probes', ['vmeter', 'ameter', 'probe']],
    ['Logic', ['logicin', 'logicout', 'clock', 'and', 'nand', 'or', 'nor', 'xor', 'xnor', 'not', 'buf', 'seg7']],
    ['Annotation', ['label', 'port', 'text']],
  ];

  /** Default props for a new component. */
  EL.defaultProps = (type) => {
    const p = {};
    for (const d of T[type].props) p[d.key] = d.def;
    return p;
  };
  EL.wave = wave;
})(globalThis.EL = globalThis.EL || {});
