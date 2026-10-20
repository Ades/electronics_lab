// Functional tests of the standard IC library: node test/ictest.js
const fs = require('fs'), vm = require('vm'), path = require('path');
globalThis.EL = {};
for (const f of ['util', 'sim', 'ics', 'components', 'circuit'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f });
const C = EL.circuit;
let fails = 0;
const check = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!cond) fails++; };

/** Drive every input pin of an IC with a logic source; power pins to 5 V / ground. */
function harness(id, analog = {}, drive = [], builtinOuts = []) {
  const def = EL.ics.get(id), g = EL.ics.geom(def);
  const outs = new Set(def.model.kind === 'js' ? def.model.outs : def.model.kind === 'logic' ? EL.ics.compileLogic(def.model.code).assigned : builtinOuts);
  const doc = { comps: [{ id: 'u', type: 'ic', x: 0, y: 0, rot: 0, props: { ic: id } }], wires: [] };
  const ins = {};
  for (const p of g.pins) {
    const add = (type, props) => doc.comps.push({ id: 'p_' + p.name, type, x: p.x, y: p.y, rot: 0, props: Object.assign(EL.defaultProps(type), props) });
    if (/^(VCC|VDD)$/.test(p.name)) add('rail', { V: 5 });
    else if (/^(GND|VSS)$/.test(p.name)) add('gnd', {});
    else if (p.name in analog) add('rail', { V: analog[p.name] });
    else if (!outs.has(p.name) && p.name !== 'NC' && (!(def.pullup || []).includes(p.name) || drive.includes(p.name))) { add('logicin', { state: false }); ins[p.name] = doc.comps[doc.comps.length - 1]; }
  }
  let net = C.buildNetlist(doc), eng = C.makeEngine(net);
  eng.dt = 1e-6;
  const run = (n = 20) => { for (let i = 0; i < n; i++) if (!eng.step()) throw new Error(eng.error); };
  const h = {
    set(vals) {
      for (const [k, v] of Object.entries(vals)) { if (!ins[k]) throw new Error(id + ': no input ' + k); ins[k].props.state = !!v; }
      const n2 = C.buildNetlist(doc), e2 = C.makeEngine(n2, eng, net);
      e2.dt = 1e-6; net = n2; eng = e2; run();
      return h;
    },
    pulse(pin) { h.set({ [pin]: 1 }); h.set({ [pin]: 0 }); return h; },
    npulse(pin) { h.set({ [pin]: 0 }); h.set({ [pin]: 1 }); return h; },
    v(name) { const p = g.pins.find((q) => q.name === name); return eng.v(net.nodeAt(p.x + ',' + p.y)); },
    hiZ(name) {
      const i = g.pins.findIndex((q) => q.name === name);
      return net.compEls.get('u').els.some((e) => e.levels && e.outs.includes(i) && e.levels[i] === null);
    },
    get(name) { const v = h.v(name); return v > 2.5 ? 1 : v < 0.5 ? 0 : 'Z(' + v.toFixed(2) + ')'; },
    bus(names) { return names.reduce((a, n, i) => a | (h.get(n) << i), 0); },
  };
  run(5);
  return h;
}
const Q = ['QA', 'QB', 'QC', 'QD'];

{ const h = harness('7410'); h.set({ '1A': 1, '1B': 1, '1C': 1, '2A': 1, '2B': 0, '2C': 1 }); check('7410 3-input NAND', h.get('1Y') === 0 && h.get('2Y') === 1); }
{ const h = harness('7420'); h.set({ '1A': 1, '1B': 1, '1C': 1, '1D': 1 }); check('7420 4-input NAND', h.get('1Y') === 0 && h.get('2Y') === 1); }
{ const h = harness('7427'); h.set({ '1A': 0, '1B': 0, '1C': 0, '2A': 1 }); check('7427 3-input NOR', h.get('1Y') === 1 && h.get('2Y') === 0); }
{ const h = harness('74125'); h.set({ '1A': 1, '~1OE': 0, '2A': 1, '~2OE': 1 }); check('74125 tri-state', h.get('1Y') === 1 && h.hiZ('2Y') && !h.hiZ('1Y')); }
{ const h = harness('74138'); h.set({ A: 1, B: 0, C: 1 }); const lows = [0, 1, 2, 3, 4, 5, 6, 7].filter((k) => h.get('~Y' + k) === 0); check('74138 decodes 5 (G1 pulled up)', lows.join() === '5', 'low: ' + lows); }
{ const h = harness('74151'); h.set({ D6: 1, A: 0, B: 1, C: 1 }); const y6 = h.get('Y'); h.set({ A: 1 }); check('74151 8:1 mux', y6 === 1 && h.get('Y') === 0 && h.get('~W') === 1); }
{ const h = harness('74157'); h.set({ '1A': 1, '1B': 0 }); const a = h.get('1Y'); h.set({ S: 1 }); check('74157 2:1 mux', a === 1 && h.get('1Y') === 0); }
{ const h = harness('74283'); h.set({ A1: 1, A2: 1, A3: 0, A4: 1, B1: 1, B2: 0, B3: 1, B4: 1, C0: 1 }); const s = h.bus(['S1', 'S2', 'S3', 'S4', 'C4']); check('74283 adder 11+13+1', s === 25, 's=' + s); }
{ const h = harness('7485'); h.set({ A0: 1, A2: 1, B1: 1, B2: 1 }); const gt = [h.get('OA<B'), h.get('OA=B'), h.get('OA>B')].join(''); h.set({ A1: 1, A0: 0 }); const eq = [h.get('OA<B'), h.get('OA=B'), h.get('OA>B')].join('');
  check('7485 comparator (5<6, 6=6)', gt === '100' && eq === '010', `${gt} ${eq}`); }
{ const h = harness('7442'); h.set({ A: 1, B: 1, C: 1 }); check('7442 BCD→decimal 7', h.get('~Y7') === 0 && h.get('~Y6') === 1); }
{ const h = harness('7447'); h.set({ A: 1 }); const segs = ['~a', '~b', '~c', '~d', '~e', '~f', '~g'].map((s) => h.get(s)).join(''); check('7447 shows 1 (active low)', segs === '1001111', segs); }
{ const h = harness('74112'); h.set({ '1J': 1, '1K': 1 }); const q = []; for (let i = 0; i < 3; i++) { h.pulse('1CLK'); q.push(h.get('1Q')); } check('74112 JK toggle on falling edge', q.join('') === '101', q.join('')); }
{ const h = harness('74175'); h.set({ '1D': 1, '3D': 1 }); h.pulse('CLK'); const v = h.bus(['1Q', '2Q', '3Q', '4Q']); check('74175 quad D', v === 5 && h.get('~1Q') === 0); }
{ const h = harness('74174'); h.set({ '2D': 1, '6D': 1 }); h.pulse('CLK'); check('74174 hex D', h.bus(['1Q', '2Q', '3Q', '4Q', '5Q', '6Q']) === 34); }
{ const h = harness('74193'); h.set({ DOWN: 1 }); for (let i = 0; i < 5; i++) h.pulse('UP'); const up = h.bus(Q); h.set({ UP: 1 }); h.npulse('DOWN'); h.npulse('DOWN'); // raising UP back to 1 while DOWN = 1 is itself an up-count (as on the real chip): 5 → 6 → 4
  check('74193 up/down', up === 5 && h.bus(Q) === 4, `${up} → ${h.bus(Q)}`); }
{ const h = harness('74192'); h.set({ DOWN: 1 }); for (let i = 0; i < 11; i++) h.pulse('UP'); check('74192 decade wraps', h.bus(Q) === 1, h.bus(Q)); }
{ const h = harness('7490'); for (let i = 0; i < 7; i++) { h.pulse('CKA'); if (h.get('QA') === 0) h.pulse('CKB'); } check('7490 counts 7 (QA→CKB by hand)', h.bus(Q) === 7, h.bus(Q)); h.set({ 'R9(1)': 1, 'R9(2)': 1 }); check('7490 set-to-9', h.bus(Q) === 9); }
{ const h = harness('7493'); for (let i = 0; i < 4; i++) h.pulse('CKB'); check('7493 ÷8 section', h.bus(['QB', 'QC', 'QD']) === 4); }
{ const h = harness('74164'); h.set({ A: 1, B: 1 }); h.pulse('CLK'); h.set({ B: 0 }); h.pulse('CLK'); h.set({ B: 1 }); h.pulse('CLK'); check('74164 shift 1,0,1', h.bus(['QA', 'QB', 'QC']) === 5); }
{ const h = harness('74165', {}, ['SH/LD']); h.set({ A: 1, H: 0, G: 1, 'SH/LD': 0 }); const first = h.get('QH'); h.set({ 'SH/LD': 1 }); h.pulse('CLK'); check('74165 load & shift', first === 0 && h.get('QH') === 1); }
{ const h = harness('74595'); for (const b of [1, 1, 0, 1]) { h.set({ SER: b }); h.pulse('SRCLK'); } const before = h.bus(['QA', 'QB', 'QC', 'QD']); h.pulse('RCLK');
  check('74595 shift then latch', before === 0 && h.bus(['QA', 'QB', 'QC', 'QD']) === 0b1101, `QA..QD=${h.bus(['QA', 'QB', 'QC', 'QD']).toString(2)}`); h.set({ '~OE': 1 }); check('74595 ~OE high-Z', h.hiZ('QA') && !h.hiZ("QH'")); }
{ const h = harness('4017'); for (let i = 0; i < 6; i++) h.pulse('CLK'); check('4017 one-hot Q6', h.get('Q6') === 1 && h.get('Q5') === 0 && h.get('CO') === 0); }
{ const h = harness('4013'); h.set({ D1: 1 }); h.pulse('CLK1'); const q = h.get('Q1'); h.set({ RST1: 1 }); check('4013 D-FF & reset', q === 1 && h.get('Q1') === 0); }
{ const h = harness('4011'); h.set({ '1A': 1, '1B': 1 }); check('4011 NAND (VDD/VSS)', h.get('1Y') === 0 && h.get('2Y') === 1); }
{ const h = harness('7414'); check('7414 Schmitt inverter', h.get('1Y') === 1); }
{ const h = harness('7474', {}, [], ['1Q', '~1Q', '2Q', '~2Q']); h.set({ '1D': 1 }); h.pulse('1CLK'); check('7474 with pulled-up PRE/CLR', h.get('1Q') === 1); }
{ const h = harness('LM393', { 'IN1+': 2, 'IN1-': 3, 'IN2+': 3, 'IN2-': 2 }); check('LM393 sinks when IN− > IN+', h.v('OUT1') < 0.1, 'OUT1=' + h.v('OUT1').toFixed(3)); }
{ // 7805: 12 V in, 100 Ω load
  const def = EL.ics.get('7805'), g = EL.ics.geom(def), at = (n) => g.pins.find((p) => p.name === n);
  const doc = { comps: [{ id: 'u', type: 'ic', x: 0, y: 0, rot: 0, props: { ic: '7805' } },
    { id: 'r', type: 'rail', x: at('IN').x, y: at('IN').y, rot: 0, props: { V: 12 } }, { id: 'g', type: 'gnd', x: at('GND').x, y: at('GND').y, rot: 0, props: {} },
    { id: 'rl', type: 'res', x: at('OUT').x + 2, y: at('OUT').y, rot: 0, props: { R: 100 } }, { id: 'g2', type: 'gnd', x: at('OUT').x + 4, y: at('OUT').y, rot: 0, props: {} }], wires: [] };
  const net = C.buildNetlist(doc), eng = C.makeEngine(net); eng.dt = 1e-6; for (let i = 0; i < 50; i++) eng.step();
  const v = eng.v(net.nodeAt(at('OUT').x + ',' + at('OUT').y)), iin = -net.compEls.get('r').els[0].i;
  check('7805 regulates 12 V → 5 V', Math.abs(v - 5) < 0.05, `${v.toFixed(3)} V, Iin=${(iin * 1e3).toFixed(1)} mA`);
}
console.log(fails ? `\n${fails} FAILED` : '\nAll passed');
process.exit(fails ? 1 : 0);
