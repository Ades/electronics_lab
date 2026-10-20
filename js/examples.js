/* Electronics Lab – example circuits */
(function (EL) {
  'use strict';

  /** Tiny DSL: c(type, x, y, {rot, flip, label, props, id}), w(x1,y1, x2,y2, ...) polyline. */
  function make(title, desc, settings, fn, table) {
    const comps = [], wires = [], traces = [];
    let n = 0;
    const c = (type, x, y, o = {}) => {
      const comp = { id: o.id || `${type}${++n}`, type, x, y, rot: o.rot || 0, flip: !!o.flip, label: o.label || '', props: Object.assign(EL.defaultProps(type), o.props || {}) };
      comps.push(comp);
      return comp;
    };
    const w = (...p) => { for (let i = 0; i + 3 < p.length; i += 2) wires.push({ x1: p[i], y1: p[i + 1], x2: p[i + 2], y2: p[i + 3] }); };
    const tr = (src) => traces.push({ src });
    fn(c, w, tr);
    const doc = { comps, wires, traces, settings: Object.assign(EL.circuit.defaultSettings(), settings) };
    if (table) doc.table = Object.assign(EL.defaultTable(), table);
    return { title, desc, doc };
  }

  EL.examples = [
    make('RC low-pass / charging', 'A square wave charges and discharges a capacitor through a resistor (τ = RC = 1 ms).',
      { speed: 0.02, tdiv: 2e-3 }, (c, w) => {
        c('vac', 0, 0, { label: 'V1', props: { wave: 'square', amp: 2.5, offset: 2.5, f: 100 } });
        c('res', 4, -4, { label: 'R1', props: { R: 1000 } });
        c('cap', 8, 0, { rot: 1, label: 'C1', props: { C: 1e-6 } });
        c('gnd', 4, 4);
        c('probe', 0, -4, { label: 'Vin' });
        c('probe', 8, -4, { label: 'Vc' });
        w(0, -2, 0, -4, 2, -4); w(6, -4, 8, -4, 8, -2); w(0, 2, 0, 4, 8, 4, 8, 2);
      }),

    make('Half-wave rectifier', 'A diode rectifies a 50 Hz sine; the reservoir capacitor smooths the output (ripple visible on the scope).',
      { speed: 0.05, tdiv: 1e-2 }, (c, w, tr) => {
        c('vac', 0, 0, { label: 'V1', props: { amp: 10, f: 50 } });
        c('diode', 4, -4, { label: 'D1', id: 'd1' });
        c('ecap', 8, 0, { rot: 1, label: 'C1', props: { C: 100e-6 } });
        c('res', 12, 0, { rot: 1, label: 'R1', props: { R: 1000 }, id: 'rload' });
        c('gnd', 4, 4);
        c('probe', 0, -4, { label: 'Vin' });
        c('probe', 12, -4, { label: 'Vout' });
        w(0, -2, 0, -4, 2, -4); w(6, -4, 12, -4, 12, -2); w(8, -4, 8, -2);
        w(0, 2, 0, 4, 12, 4, 12, 2); w(8, 2, 8, 4);
        tr({ kind: 'comp', id: 'd1', q: 'i' });
      }),

    make('Transistor switch', 'A clock drives an NPN transistor that switches an LED. Watch the LED current and the base voltage.',
      { speed: 1, tdiv: 0.2 }, (c, w, tr) => {
        c('clock', 0, 0, { label: 'CLK', props: { f: 2 } });
        c('res', 5, 0, { label: 'R1', props: { R: 10000 } });
        c('npn', 10, 0, { label: 'Q1', id: 'q1' });
        c('gnd', 11, 2);
        c('led', 11, -4, { rot: 1, label: 'D1', props: { color: 'green' }, id: 'led1' });
        c('res', 11, -8, { rot: 1, label: 'R2', props: { R: 220 } });
        c('rail', 11, -10, { props: { V: 5 } });
        w(0, 0, 3, 0); w(7, 0, 8, 0);
        tr({ kind: 'comp', id: 'led1', q: 'i' });
        tr({ kind: 'node', key: '8,0', label: 'V(Q1.B)' });
      }),

    make('Inverting amplifier', 'Op-amp with gain −Rf/Rin = −10. Input 1 V peak, 1 kHz.',
      { speed: 0.002, tdiv: 5e-4 }, (c, w) => {
        c('vac', 0, 1, { label: 'V1', props: { amp: 1, f: 1000 } });
        c('gnd', 0, 3);
        c('res', 4, -1, { label: 'Rin', props: { R: 1000 } });
        c('res', 10, -5, { label: 'Rf', props: { R: 10000 } });
        c('opamp', 10, 0, { label: 'U1' });
        c('gnd', 7, 3);
        c('probe', 0, -1, { label: 'Vin' });
        c('probe', 16, 0, { label: 'Vout' });
        w(0, -1, 2, -1); w(6, -1, 7, -1); w(7, -1, 7, -5, 8, -5); w(12, -5, 14, -5, 14, 0); w(13, 0, 16, 0); w(7, 1, 7, 3);
      }),

    make('555 astable – blinking LED', 'NE555 in astable mode, f ≈ 1.44 / ((R1 + 2·R2)·C1) ≈ 1.5 Hz.',
      { speed: 1, tdiv: 0.2 }, (c, w, tr) => {
        c('ic', 0, 0, { label: 'U1', props: { ic: '555' } });
        c('rail', -10, -12, { props: { V: 9 } });
        c('res', -10, -10, { rot: 1, label: 'R1', props: { R: 1000 } });
        c('res', -10, -4, { rot: 1, label: 'R2', props: { R: 10000 } });
        c('ecap', -10, 3, { rot: 1, label: 'C1', props: { C: 47e-6 } });
        c('gnd', -10, 5);
        c('rail', -2, -9, { props: { V: 9 } });
        c('gnd', 0, 6);
        c('res', 10, -2, { label: 'R3', props: { R: 470 } });
        c('led', 14, 0, { rot: 1, label: 'D1', props: { color: 'red' } });
        c('gnd', 14, 2);
        c('probe', -10, 0, { label: 'Vc' });
        c('probe', 7, -2, { label: 'OUT' });
        w(-10, -8, -10, -6); w(-6, -2, -8, -2, -8, -7, -10, -7); w(-10, -2, -10, 0, -6, 0); w(-6, 0, -6, 2); w(-10, 0, -10, 1);
        w(-2, -6, -2, -9); w(2, -6, 2, -8, -2, -8); w(6, -2, 8, -2); w(12, -2, 14, -2);
      }),

    make('Half adder (logic gates)', 'Click the logic inputs A and B to toggle them. S = A ⊕ B, C = A · B.',
      { speed: 0.01, tdiv: 1e-3 }, (c, w) => {
        c('logicin', 0, 0, { props: { name: 'A' } });
        c('logicin', 0, 4, { props: { name: 'B' } });
        c('xor', 8, -1, { label: 'U1' });
        c('and', 8, 5, { label: 'U2' });
        c('logicout', 13, -1, { props: { name: 'S' } });
        c('logicout', 13, 5, { props: { name: 'C' } });
        w(0, 0, 5, 0); w(3, 0, 3, 6, 5, 6); w(0, 4, 5, 4); w(4, 4, 4, -2, 5, -2); w(11, -1, 13, -1); w(11, 5, 13, 5);
      }),

    make('Decade counter with 7-segment display', '74HC160 counts clock pulses; the CD4511 decodes BCD to a 7-segment display. The oscilloscope runs in digital mode and shows QA–QD as a bus.',
      { speed: 1, tdiv: 0.5, scopeDisplay: 'digital', digBus: true }, (c, w, tr) => {
        c('ic', 0, 0, { label: 'U1', props: { ic: '74160' }, id: 'cnt' });
        c('rail', 0, -12, { props: { V: 5 } });
        c('gnd', 0, 12);
        c('clock', -12, -8, { label: 'CLK', props: { f: 2 } });
        c('rail', -9, -4, { props: { V: 5 } });
        c('ic', 16, -2, { label: 'U2', props: { ic: '4511' } });
        c('rail', 16, -12, { props: { V: 5 } });
        c('gnd', 16, 8);
        c('gnd', 8, 0);
        c('rail', 10, 8, { rot: 2, props: { V: 5 } });
        c('seg7', 30, -2, { label: 'DS1' });
        c('gnd', 31, 7);
        w(-12, -8, -6, -8); w(-6, -6, -6, 0); w(-6, -4, -9, -4);
        for (const y of [-8, -6, -4, -2]) w(6, y, 10, y);
        w(10, 0, 8, 0); w(10, 2, 10, 8);
        for (let y = -8; y <= 4; y += 2) w(22, y, 26, y);
        tr({ kind: 'node', key: '6,-8', label: 'QA' });
        tr({ kind: 'node', key: '6,-6', label: 'QB' });
        tr({ kind: 'node', key: '6,-4', label: 'QC' });
        tr({ kind: 'node', key: '6,-2', label: 'QD' });
      }),
    make('Diode I–U characteristic (sweep)', 'Open the Data table and press Sweep… → Run sweep: V1 is stepped from 0 to 5 V and the diode voltage and current are recorded and plotted as an I–U curve.',
      { speed: 0.01, tdiv: 1e-3, panel: 'table' }, (c, w) => {
        c('vdc', 0, 0, { label: 'V1', props: { V: 5 }, id: 'v1' });
        c('res', 4, -4, { label: 'R1', props: { R: 100 } });
        c('diode', 8, 0, { rot: 1, label: 'D1', id: 'd1' });
        c('gnd', 4, 4);
        w(0, -2, 0, -4, 2, -4); w(6, -4, 8, -4, 8, -2); w(0, 2, 0, 4, 8, 4, 8, 2);
      }, {
        cols: [{ src: { kind: 'param', id: 'v1', key: 'V' } }, { src: { kind: 'comp', id: 'd1', q: 'v' } }, { src: { kind: 'comp', id: 'd1', q: 'i' } }],
        plot: { x: 1, y: [2], connect: 'sorted' },
        sweep: { id: 'v1', key: 'V', from: 0, to: 5, points: 26, settle: 1e-4, clear: true, asX: false },
      }),
  ];
})(globalThis.EL = globalThis.EL || {});
