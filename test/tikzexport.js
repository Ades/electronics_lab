// Export examples and an "all components" sheet to .tex files: node test/tikzexport.js <outdir>
const fs = require('fs'), vm = require('vm'), path = require('path');
globalThis.EL = {};
for (const f of ['util', 'sim', 'ics', 'components', 'circuit', 'tikz', 'datatable', 'examples'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f });
const out = process.argv[2];
EL.examples.forEach((ex, i) => fs.writeFileSync(path.join(out, `ex${i}.tex`), EL.tikz.exportTikz(ex.doc, { style: i % 2 ? 'american' : 'european' })));
// every component on a grid, several rotations
const comps = [];
let x = 0, y = 0;
const types = [...EL.typeOrder.filter((t) => t !== 'ic'), ...EL.ics.STD.map((d) => 'ic:' + d.id)];
types.forEach((tp, i) => {
  const [type, ic] = tp.split(':');
  const props = Object.assign(EL.defaultProps(type), ic ? { ic } : {});
  const c = { id: 'c' + i, type, x, y, rot: ic ? 0 : i % 4 === 3 ? 1 : 0, flip: false, props, label: ic ? 'U' + i : (EL.types[type].noLabel ? '' : (EL.types[type].prefix || 'X') + i) };
  comps.push(c);
  x += ic ? 24 : 10;
  if (x > 60) { x = 0; y += ic ? 28 : 12; }
});
for (const style of ['european', 'american'])
  fs.writeFileSync(path.join(out, `all_${style}.tex`), EL.tikz.exportTikz({ comps, wires: [] }, { style }));
console.log('written');
