// Headless simulator tests: node test/simtest.js
const fs = require('fs'), vm = require('vm'), path = require('path');
globalThis.EL = {};
for (const f of ['util', 'sim', 'ics', 'components', 'circuit', 'datatable', 'examples'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f });
const C = EL.circuit;
function run(doc, tEnd, dt, probe) {
  const net = C.buildNetlist(doc);
  const eng = C.makeEngine(net);
  eng.dt = dt;
  const out = [];
  let next = 0;
  while (eng.t < tEnd) {
    if (!eng.step()) throw new Error('engine error: ' + eng.error);
    if (eng.t >= next) { out.push([eng.t, probe(eng, net)]); next += tEnd / 400; }
  }
  return { out, eng, net };
}
const ex = (i) => JSON.parse(JSON.stringify(EL.examples[i].doc));
const V = (eng, net, k) => eng.v(net.nodeAt(k));
let fails = 0;
const check = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!cond) fails++; };

// 1. RC: after 1 ms of a 0->5V step, Vc ≈ 5(1-e^-1)=3.16
{
  const d = ex(0); const r = run(d, 1e-3, 1e-6, (e, n) => V(e, n, '8,-4'));
  const v = r.out[r.out.length - 1][1]; check('RC charge at τ', Math.abs(v - 3.16) < 0.05, v.toFixed(3) + ' V');
}
// 2. Rectifier: output peak ≈ 10 - 0.7
{
  const d = ex(1); const r = run(d, 0.1, 2e-5, (e, n) => V(e, n, '12,-4'));
  const mx = Math.max(...r.out.map((x) => x[1])); const mn = Math.min(...r.out.slice(200).map((x) => x[1]));
  check('Rectifier peak', mx > 9.0 && mx < 9.6, mx.toFixed(3)); check('Rectifier ripple', mx - mn > 0.5 && mx - mn < 2.5, (mx - mn).toFixed(3));
}
// 3. Transistor switch: LED current when on
{
  const d = ex(2); const r = run(d, 0.2, 1e-4, (e, n) => n.compEls.get('led1').els[0].i);
  const i = r.out[r.out.length - 1][1]; check('BJT switch LED current', i > 0.010 && i < 0.016, (i * 1e3).toFixed(2) + ' mA');
}
// 4. Op-amp: gain -10
{
  const d = ex(3); const r = run(d, 2e-3, 1e-6, (e, n) => [V(e, n, '0,-1'), V(e, n, '16,0')]);
  const ratio = r.out.filter((x) => Math.abs(x[1][0]) > 0.5).map((x) => x[1][1] / x[1][0]);
  const avg = ratio.reduce((a, b) => a + b, 0) / ratio.length; check('Inverting gain', Math.abs(avg + 10) < 0.05, avg.toFixed(4));
}
// 5. 555: count output edges over 3 s
{
  const d = ex(4); const r = run(d, 3, 1e-4, (e, n) => V(e, n, '8,-2'));
  let edges = 0; for (let i = 1; i < r.out.length; i++) if (r.out[i - 1][1] < 4.5 && r.out[i][1] >= 4.5) edges++;
  const vc = r.out.slice(100).map((x) => x[1]);
  check('555 oscillates (~1.5 Hz)', edges >= 3 && edges <= 6, edges + ' rising edges in 3 s');
}
// 6. Half adder: toggle inputs
{
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const d = ex(5); d.comps[0].props.state = !!a; d.comps[1].props.state = !!b;
    const r = run(d, 1e-4, 1e-6, (e, n) => [V(e, n, '13,-1'), V(e, n, '13,5')]);
    const [s, cy] = r.out[r.out.length - 1][1];
    check(`Half adder ${a}+${b}`, (s > 2.5) === !!(a ^ b) && (cy > 2.5) === !!(a & b), `S=${s.toFixed(2)} C=${cy.toFixed(2)}`);
  }
}
// 7. Counter: after 2.6 s at 2 Hz, count should be 5 → segments of "5"
{
  const d = ex(6); const r = run(d, 2.6, 1e-3, (e, n) => ['6,-8', '6,-6', '6,-4', '6,-2'].map((k) => V(e, n, k) > 2.5 ? 1 : 0));
  const q = r.out[r.out.length - 1][1]; const val = q[0] + 2 * q[1] + 4 * q[2] + 8 * q[3];
  const seg = [-8, -6, -4, -2, 0, 2, 4].map((y) => (V(r.eng, r.net, '26,' + y) > 2.5 ? 1 : 0)).join('');
  check('Decade counter (5 clock edges)', val === 5, 'count=' + val + ' segs=' + seg);
}
// 8. Zener regulator & custom logic IC & subcircuit
{
  const doc = { comps: [], wires: [], settings: {} };
  const add = (type, x, y, props, rot = 0, id) => { const c = { id: id || type + doc.comps.length, type, x, y, rot, props: Object.assign(EL.defaultProps(type), props || {}) }; doc.comps.push(c); return c; };
  add('vdc', 0, 0, { V: 12 }); add('gnd', 0, 2); add('res', 2, -2, { R: 1000 }); add('zener', 4, 0, { vz: 5.1 }, 3); add('gnd', 4, 2);
  const r = run(doc, 1e-4, 1e-6, (e, n) => V(e, n, '4,-2'));
  const v = r.out[r.out.length - 1][1]; check('Zener regulator', Math.abs(v - 5.1) < 0.25, v.toFixed(3) + ' V');
}
{
  // custom logic IC: full adder
  EL.ics.register({ id: 'fa', name: 'FA', layout: 'func', pins: [{ name: 'A', side: 'L' }, { name: 'B', side: 'L' }, { name: 'CIN', side: 'L' }, { name: 'S', side: 'R' }, { name: 'COUT', side: 'R' }],
    model: { kind: 'logic', code: 'S = A ^ B ^ CIN\nCOUT = (A & B) | (CIN & (A ^ B))' } }, false);
  const g = EL.ics.geom(EL.ics.get('fa'));
  const doc = { comps: [], wires: [] };
  doc.comps.push({ id: 'u', type: 'ic', x: 0, y: 0, rot: 0, props: { ic: 'fa' } });
  const pins = g.pins;
  [1, 1, 0].forEach((v, i) => doc.comps.push({ id: 'in' + i, type: 'logicin', x: pins[i].x, y: pins[i].y, rot: 0, props: Object.assign(EL.defaultProps('logicin'), { state: !!v }) }));
  const r = run(doc, 1e-5, 1e-6, (e, n) => [V(e, n, pins[3].x + ',' + pins[3].y), V(e, n, pins[4].x + ',' + pins[4].y)]);
  const [s, co] = r.out[r.out.length - 1][1];
  check('Custom logic IC (1+1+0)', s < 1 && co > 4, `S=${s.toFixed(2)} COUT=${co.toFixed(2)}`);
}
{
  // subcircuit: voltage divider IC with ports IN, OUT; internal ground
  const sub = { comps: [
    { id: 'p1', type: 'port', x: -4, y: 0, rot: 2, props: { name: 'IN' } },
    { id: 'r1', type: 'res', x: -2, y: 0, rot: 0, props: { R: 1000 } },
    { id: 'p2', type: 'port', x: 0, y: 0, rot: 0, props: { name: 'OUT' } },
    { id: 'r2', type: 'res', x: 0, y: 2, rot: 1, props: { R: 1000 } },
    { id: 'g', type: 'gnd', x: 0, y: 4, rot: 0, props: {} }], wires: [] };
  EL.ics.register({ id: 'div', name: 'DIV', layout: 'func', pins: [{ name: 'IN', side: 'L' }, { name: 'OUT', side: 'R' }], model: { kind: 'subckt', circuit: sub } }, false);
  const g = EL.ics.geom(EL.ics.get('div'));
  const doc = { comps: [
    { id: 'u', type: 'ic', x: 0, y: 0, rot: 0, props: { ic: 'div' } },
    { id: 'v', type: 'rail', x: g.pins[0].x, y: g.pins[0].y, rot: 0, props: { V: 10 } },
    { id: 'gg', type: 'gnd', x: 20, y: 20, rot: 0, props: {} }], wires: [] };
  const r = run(doc, 1e-5, 1e-6, (e, n) => V(e, n, g.pins[1].x + ',' + g.pins[1].y));
  const v = r.out[r.out.length - 1][1]; check('Sub-circuit divider', Math.abs(v - 5) < 1e-3, v.toFixed(4) + ' V');
}
{
  // RLC ringing frequency: L=10mH C=1uF → f0 = 1591 Hz
  const doc = { comps: [], wires: [] };
  const add = (type, x, y, props, rot = 0, id) => doc.comps.push({ id: id || type + doc.comps.length, type, x, y, rot, props: Object.assign(EL.defaultProps(type), props || {}) });
  add('vac', 0, 0, { wave: 'square', amp: 2.5, offset: 2.5, f: 100 }); add('gnd', 0, 2);
  add('res', 2, -2, { R: 10 }); add('ind', 6, -2, { L: 0.01 }); add('cap', 8, 0, { C: 1e-6 }, 1); add('gnd', 8, 2);
  const net = C.buildNetlist(doc); const eng = C.makeEngine(net); eng.dt = 1e-6;
  let last = 0, cross = []; const mid = 5;
  while (eng.t < 4e-3) { eng.step(); const v = eng.v(net.nodeAt('8,-2')); if (last < mid && v >= mid) cross.push(eng.t); last = v; }
  const f = cross.length > 2 ? (cross.length - 1) / (cross[cross.length - 1] - cross[0]) : 0;
  check('RLC ringing frequency', Math.abs(f - 1591) < 40, f.toFixed(0) + ' Hz');
}
{
  // MOSFET switch: NMOS with Vgs=5 pulling down 1k from 5V
  const doc = { comps: [], wires: [] };
  const add = (type, x, y, props, rot = 0) => doc.comps.push({ id: type + doc.comps.length, type, x, y, rot, props: Object.assign(EL.defaultProps(type), props || {}) });
  add('nmos', 0, 0); add('rail', -2, 0, { V: 5 }); add('gnd', 1, 2); add('res', 1, -4, {}, 1); add('rail', 1, -6, { V: 5 });
  const r = run(doc, 1e-5, 1e-6, (e, n) => V(e, n, '1,-2'));
  const v = r.out[r.out.length - 1][1]; check('NMOS switch Vds', v > 0 && v < 0.2, v.toFixed(4) + ' V');
}
console.log(fails ? `\n${fails} FAILED` : '\nAll passed');
process.exit(fails ? 1 : 0);
