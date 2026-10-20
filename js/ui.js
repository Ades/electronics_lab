/* Electronics Lab – UI: icons, palette, inspector, menus, dialogs */
(function (EL) {
  'use strict';
  const U = EL.util, C = EL.circuit;
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  };

  /* ---------------- icons ---------------- */
  const ICONS = {
    new: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/>',
    open: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>',
    cursor: '<path d="M5 3l14 7.5-6.2 1.8L10 19z"/>',
    wire: '<path d="M4 18h7V6h9"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/>',
    rotate: '<path d="M21 3v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7L21 9"/>',
    flip: '<path d="M12 3v18"/><path d="M8 7l-5 5 5 5zM16 7l5 5-5 5z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
    pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>',
    step: '<path d="M5 4.5v15l10-7.5z" fill="currentColor"/><path d="M19 5v14"/>',
    reset: '<path d="M3 3v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 9"/>',
    code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
    chip: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    scope: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    bolt: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',
    tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
    record: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
    sweep: '<path d="M3 20h18M3 20V4"/><path d="M5 18c4 0 5-11 9-11s4 6 7 6"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  };
  EL.icon = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  class UI {
    constructor(app) {
      this.app = app;
      this.menu = $('#ctxMenu');
      this.inspector = $('#inspector');
      this.collapsed = new Set(JSON.parse(localStorage.getItem('elab.collapsed') || '[]'));
      document.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', EL.icon(el.dataset.icon)));
      window.addEventListener('pointerdown', (e) => { if (!this.menu.contains(e.target)) this.hideMenu(); });
      window.addEventListener('blur', () => this.hideMenu());
      $('#paletteSearch').addEventListener('input', () => this.buildPalette());
      this._paletteDrag();
    }

    /* ---------------- palette ---------------- */
    buildPalette() {
      const app = this.app, root = $('#paletteList');
      const q = $('#paletteSearch').value.trim().toLowerCase();
      root.innerHTML = '';
      const groups = EL.paletteCats.map(([cat, types]) => [cat, types.map((t) => ({ spec: { type: t }, name: EL.types[t].name, desc: EL.types[t].desc || '' }))]);
      const stdCats = new Map();
      for (const d of EL.ics.STD) {
        if (!stdCats.has(d.cat)) stdCats.set(d.cat, []);
        stdCats.get(d.cat).push({ spec: { type: 'ic', props: { ic: d.id } }, name: `${d.name}`, sub: d.title, desc: d.desc || d.title });
      }
      for (const [cat, items] of stdCats) groups.splice(groups.length - 1, 0, ['ICs · ' + cat, items]);
      const customs = [...EL.ics.custom.values()].map((d) => ({ spec: { type: 'ic', props: { ic: d.id } }, name: d.name, sub: d.title || (d.model.kind === 'subckt' ? 'Sub-circuit' : 'Logic'), desc: d.desc || '', custom: d }));
      groups.splice(groups.length - 1, 0, ['Custom ICs', customs, true]);

      for (const [cat, items, isCustom] of groups) {
        const filtered = q ? items.filter((it) => (it.name + ' ' + (it.sub || '') + ' ' + cat + ' ' + it.desc).toLowerCase().includes(q)) : items;
        if (q && !filtered.length) continue;
        const open = q || !this.collapsed.has(cat);
        const sec = h('section', { class: 'pal-cat' + (open ? '' : ' closed') });
        const head = h('button', { class: 'pal-head', onclick: () => { if (this.collapsed.has(cat)) this.collapsed.delete(cat); else this.collapsed.add(cat); localStorage.setItem('elab.collapsed', JSON.stringify([...this.collapsed])); this.buildPalette(); } },
          h('span', { html: EL.icon('chevron', 'chev') }), h('span', { class: 'pal-title' }, cat), h('span', { class: 'pal-count' }, String(filtered.length)));
        sec.append(head);
        if (open) {
          const grid = h('div', { class: 'pal-grid' + (cat.startsWith('ICs') || isCustom ? ' list' : '') });
          for (const it of filtered) grid.append(this._palItem(it));
          if (isCustom) {
            grid.append(h('button', { class: 'pal-new', onclick: () => this.icDialog() }, h('span', { html: EL.icon('plus') }), 'New custom IC…'));
            if (customs.length) grid.append(h('div', { class: 'pal-hint' }, 'Right-click a custom IC to export or delete it.'));
          }
          sec.append(grid);
        }
        root.append(sec);
      }
    }
    _palItem(it) {
      const isList = it.spec.type === 'ic';
      const el = h('div', { class: 'pal-item' + (isList ? ' ic' : ''), title: it.desc ? `${it.name} – ${it.desc}` : it.name, tabindex: 0 });
      const cv = h('canvas', { class: 'pal-icon' });
      el.append(cv);
      el.append(h('div', { class: 'pal-text' }, h('div', { class: 'pal-name' }, it.name), it.sub ? h('div', { class: 'pal-sub' }, it.sub) : null));
      el._spec = it.spec;
      requestAnimationFrame(() => {
        const comp = { id: 'icon', type: it.spec.type, x: 0, y: 0, rot: 0, props: Object.assign(EL.defaultProps(it.spec.type), it.spec.props || {}) };
        EL.drawIcon(cv, comp, this.app.theme, this.app.settings.style === 'iec', { pad: 0.5, lineWidth: 1.2, maxScale: isList ? 4 : 9 });
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.app.editor.startPlacing(it.spec); });
      if (it.custom) el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showMenu(e.clientX, e.clientY, [
          { label: it.custom.name, header: true },
          { label: 'Export IC definition…', icon: 'download', action: () => U.download(`${it.custom.name}.elab-ic.json`, JSON.stringify(EL.ics.strip(it.custom), null, 2)) },
          ...(it.custom.model.kind === 'logic' ? [{ label: 'Edit…', action: () => this.icDialog(it.custom) }] : []),
          { sep: true },
          { label: 'Delete from library', danger: true, action: () => this.confirm(`Delete "${it.custom.name}"?`, 'Circuits that use it will show a missing IC until the definition is imported again.', 'Delete', () => { EL.ics.remove(it.custom.id); this.buildPalette(); this.app.rebuild(); }) },
        ]);
      });
      return el;
    }
    _paletteDrag() {
      const root = $('#paletteList');
      let drag = null;
      root.addEventListener('pointerdown', (e) => {
        const item = e.target.closest('.pal-item');
        if (!item || e.button !== 0) return;
        e.preventDefault();
        this.app.editor.startPlacing(item._spec);
        drag = { x: e.clientX, y: e.clientY, moved: false };
        root.querySelectorAll('.pal-item.active').forEach((x) => x.classList.remove('active'));
        item.classList.add('active');
      });
      window.addEventListener('pointermove', (e) => { if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true; });
      window.addEventListener('pointerup', (e) => {
        if (!drag) return;
        const ed = this.app.editor, moved = drag.moved;
        drag = null;
        const r = ed.cv.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (moved && inside && ed.placing) { ed._updateMouse(e); ed._place(ed.mouse.gx, ed.mouse.gy); ed.placing = null; this.clearActive(); }
        else if (moved && !inside) { ed.cancel(); this.clearActive(); }
        this.app.updateStatus();
      });
    }
    clearActive() { document.querySelectorAll('.pal-item.active').forEach((x) => x.classList.remove('active')); }

    /* ---------------- inspector ---------------- */
    renderInspector() {
      const app = this.app, ed = app.editor, root = this.inspector;
      root.innerHTML = '';
      this.live = null;
      const sel = [...ed.sel];
      if (!sel.length) return this._inspectCircuit(root);
      if (sel.length > 1) {
        root.append(h('div', { class: 'insp-head' }, h('div', { class: 'insp-title' }, `${sel.length} items selected`), h('div', { class: 'insp-sub' }, `${sel.filter((o) => o.type).length} components, ${sel.filter((o) => !o.type).length} wires`)));
        root.append(this._actions([['rotate', 'Rotate', () => ed.rotateSelection(1)], ['flip', 'Flip', () => ed.flipSelection()], ['copy', 'Duplicate', () => { ed.copySelection(); ed.paste(); }], ['trash', 'Delete', () => ed.deleteSelection(), true]]));
        const ports = sel.filter((o) => o.type === 'port');
        if (ports.length) root.append(h('div', { class: 'insp-sec' }, h('button', { class: 'btn wide', onclick: () => this.icDialog(null, 'subckt') }, h('span', { html: EL.icon('chip') }), 'Create IC from selection…')));
        return;
      }
      const obj = sel[0];
      if (!obj.type) {
        root.append(h('div', { class: 'insp-head' }, h('div', { class: 'insp-title' }, 'Wire'), h('div', { class: 'insp-sub' }, `(${obj.x1}, ${obj.y1}) → (${obj.x2}, ${obj.y2})`)));
        const box = h('div', { class: 'readings' });
        root.append(h('div', { class: 'insp-sec' }, h('div', { class: 'sec-title' }, 'Measurement'), box));
        this.live = () => {
          const n = app.sim.net && app.sim.net.nodeAt(C.key(obj.x1, obj.y1));
          box.innerHTML = n == null || !app.sim.engine ? '<div class="muted">Simulation not running</div>' : reading('Node voltage', U.fmt(app.sim.engine.v(n), 'V', 4, true));
        };
        this.live();
        root.append(this._actions([['scope', 'Plot voltage', () => { const k = C.key(obj.x1, obj.y1); app.addTrace({ kind: 'node', key: k, label: app.nodeName(k) }); }], ['trash', 'Delete', () => ed.deleteSelection(), true]]));
        return;
      }
      const c = obj, t = EL.types[c.type];
      const def = c.type === 'ic' ? EL.ics.get(c.props.ic) : null;
      const iconCv = h('canvas', { class: 'insp-icon' });
      const head = h('div', { class: 'insp-head row' }, iconCv, h('div', {}, h('div', { class: 'insp-title' }, def ? `${def.name}` : t.name), h('div', { class: 'insp-sub' }, def ? def.title || '' : t.cat)));
      root.append(head);
      requestAnimationFrame(() => EL.drawIcon(iconCv, Object.assign({}, c, { rot: 0, flip: false }), app.theme, app.settings.style === 'iec', { pad: 0.4, lineWidth: 1.3 }));
      const descText = def ? def.desc : t.desc;
      if (descText) root.append(h('div', { class: 'insp-desc' }, descText));

      // properties
      const form = h('div', { class: 'insp-sec' }, h('div', { class: 'sec-title' }, 'Properties'));
      if (!t.noLabel) form.append(this._field('Label', h('input', { class: 'inp', value: c.label || '', onchange: (e) => { c.label = e.target.value.trim(); app.commit(); } })));
      for (const p of t.props) form.append(this._propField(c, p));
      if (form.children.length > 1) root.append(form);

      // live readings
      if (t.measure) {
        const box = h('div', { class: 'readings' });
        root.append(h('div', { class: 'insp-sec' }, h('div', { class: 'sec-title' }, def ? 'Pin voltages' : 'Measurements'), box));
        this.live = () => {
          const st = app.liveState(c);
          if (!st) { box.innerHTML = '<div class="muted">Simulation not running</div>'; return; }
          const r = t.measure(c, st);
          let html = '';
          if (r.V !== undefined) html += reading(r.vLabel || 'Voltage', U.fmt(r.V, 'V', 4, true), 'v');
          if (r.I !== undefined) html += reading(r.iLabel || 'Current', U.fmt(r.I, 'A', 4, true), 'i');
          if (r.P !== undefined) html += reading(r.pLabel || 'Power', U.fmt(r.P, 'W', 3, true), 'p');
          if (r.rows) for (const [a, b] of r.rows) html += reading(a, b);
          if (r.warn) html += `<div class="warn">${U.esc(r.warn)}</div>`;
          if (!html) html = '<div class="muted">—</div>';
          box.innerHTML = html;
        };
        this.live();
      }
      const acts = [['rotate', 'Rotate', () => ed.rotateSelection(1)], ['flip', 'Flip', () => ed.flipSelection()]];
      if (t.measure && C.absPins(c).length >= 2 && c.type !== 'ic' && !['vmeter', 'ameter'].includes(c.type)) {
        acts.push(['scope', 'Plot current', () => app.addTrace({ kind: 'comp', id: c.id, q: 'i' })]);
        acts.push(['scope', 'Plot voltage', () => app.addTrace({ kind: 'comp', id: c.id, q: 'v' })]);
      }
      if (t.measure && c.type !== 'ic') acts.push(['table', 'Add to table', () => {
        const st = app.liveState(c), m = st ? t.measure(c, st) : { V: 0, I: 0 };
        let n = 0;
        if (m.V !== undefined && app.table.addColumn({ kind: 'comp', id: c.id, q: 'v' }, true)) n++;
        if (m.I !== undefined && app.table.addColumn({ kind: 'comp', id: c.id, q: 'i' }, true)) n++;
        app.showPanel('table');
        app.ui.toast(n ? `Added ${n} column${n > 1 ? 's' : ''} to the data table` : 'Already in the data table');
      }]);
      acts.push(['trash', 'Delete', () => ed.deleteSelection(), true]);
      root.append(this._actions(acts));
      function reading(a, b, cls = '') { return `<div class="reading ${cls}"><span>${U.esc(a)}</span><b>${U.esc(b)}</b></div>`; }
    }
    _inspectCircuit(root) {
      const app = this.app, doc = app.doc, s = doc.settings;
      root.append(h('div', { class: 'insp-head' }, h('div', { class: 'insp-title' }, 'Circuit'), h('div', { class: 'insp-sub' }, `${doc.comps.length} components · ${doc.wires.length} wires · ${app.sim.net ? app.sim.net.nodeCount - 1 : 0} nodes`)));
      const form = h('div', { class: 'insp-sec' }, h('div', { class: 'sec-title' }, 'Simulation'));
      const dtOpts = [['auto', 'Automatic'], ...[1e-8, 1e-7, 1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3].map((v) => [String(v), U.fmt(v, 's')])];
      const dtSel = h('select', { class: 'inp', onchange: (e) => { s.dt = e.target.value === 'auto' ? 'auto' : +e.target.value; app.saveLocal(); app.updateStatus(); } }, dtOpts.map(([v, l]) => h('option', { value: v }, l)));
      dtSel.value = String(s.dt);
      form.append(this._field('Time step', dtSel));
      const mSel = h('select', { class: 'inp', onchange: (e) => { s.method = e.target.value; if (app.sim.engine) app.sim.engine.method = s.method; app.saveLocal(); } },
        h('option', { value: 'trap' }, 'Trapezoidal (accurate)'), h('option', { value: 'be' }, 'Backward Euler (damped)'));
      mSel.value = s.method;
      form.append(this._field('Integration', mSel));
      root.append(form);
      const warn = app.sim.net && app.sim.net.warnings;
      if (warn && warn.length) root.append(h('div', { class: 'insp-sec' }, ...warn.map((w) => h('div', { class: 'warn' }, w))));
      root.append(h('div', { class: 'insp-sec tips' }, h('div', { class: 'sec-title' }, 'Getting started'), h('div', { html: `
        <ol>
          <li><b>Add parts</b> – click or drag from the palette. <kbd>R</kbd> rotates while placing.</li>
          <li><b>Wire</b> – drag from any pin or wire end, or press <kbd>W</kbd>. Click to add corners, <kbd>Esc</kbd> to stop.</li>
          <li><b>Measure</b> – hover a wire or part for live values, or select a part to see V, I and P here.</li>
          <li><b>Oscilloscope</b> – drop a <i>Scope probe</i> on a node, or right-click a part → <i>Plot current</i>.</li>
        </ol>
        <p class="muted">Press <kbd>?</kbd> for all shortcuts.</p>` })));
    }
    updateLive() { if (this.live) this.live(); }
    focusInspector() {
      const inp = this.inspector.querySelector('input, select');
      if (inp) inp.focus();
    }
    _field(label, input, unit) {
      return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), h('span', { class: 'field-ctl' }, input, unit ? h('span', { class: 'unit' }, unit) : null));
    }
    _propField(c, p) {
      const app = this.app;
      const set = (v) => { c.props[p.key] = v; app.commit(); };
      if (p.kind === 'select') {
        const s = h('select', { class: 'inp', onchange: (e) => set(typeof p.def === 'number' ? +e.target.value : e.target.value) }, p.options.map(([v, l]) => h('option', { value: v }, l)));
        s.value = String(c.props[p.key]);
        return this._field(p.label, s);
      }
      if (p.kind === 'bool') {
        const i = h('input', { type: 'checkbox', class: 'switch', onchange: (e) => set(e.target.checked) });
        i.checked = !!c.props[p.key];
        return h('label', { class: 'field check' }, h('span', { class: 'field-label' }, p.label), i);
      }
      if (p.kind === 'text') return this._field(p.label, h('input', { class: 'inp', value: c.props[p.key] ?? '', onchange: (e) => set(e.target.value) }));
      // numeric (SI prefixes allowed)
      const inp = h('input', { class: 'inp num', value: fmtInput(c.props[p.key]), spellcheck: 'false' });
      const commit = () => {
        const v = U.parseValue(inp.value);
        if (!isFinite(v) || (p.min != null && v < p.min)) { inp.classList.add('bad'); return; }
        inp.classList.remove('bad');
        if (v !== c.props[p.key]) set(v);
        inp.value = fmtInput(v);
      };
      inp.addEventListener('change', commit);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); inp.blur(); } });
      const f = this._field(p.label, inp, p.unit);
      if (p.slider) {
        const [a, b, st] = p.slider;
        const r = h('input', { type: 'range', min: a, max: b, step: st, value: c.props[p.key], class: 'range' });
        r.addEventListener('input', () => { c.props[p.key] = +r.value; inp.value = fmtInput(+r.value); app.interactChanged(); });
        r.addEventListener('change', () => app.commit());
        f.append(r);
      }
      return f;
      function fmtInput(v) { return typeof v === 'number' ? U.fmt(v, '', 4).replace(/ $/, '').replace(' ', '') : String(v ?? ''); }
    }
    _actions(list) {
      return h('div', { class: 'insp-actions' }, list.map(([icon, label, fn, danger]) => h('button', { class: 'btn sm' + (danger ? ' danger' : ''), onclick: fn }, h('span', { html: EL.icon(icon) }), label)));
    }

    /* ---------------- context menu ---------------- */
    showMenu(x, y, items) {
      const m = this.menu;
      m.innerHTML = '';
      for (const it of items) {
        if (it.sep) { m.append(h('div', { class: 'menu-sep' })); continue; }
        if (it.header) { m.append(h('div', { class: 'menu-head' }, it.label)); continue; }
        const b = h('button', { class: 'menu-item' + (it.danger ? ' danger' : ''), disabled: !!it.disabled },
          h('span', { class: 'menu-ico', html: it.icon ? EL.icon(it.icon) : '' }), h('span', { class: 'menu-label' }, it.label), it.key ? h('kbd', {}, it.key) : null);
        b.addEventListener('click', () => { this.hideMenu(); it.action && it.action(); });
        m.append(b);
      }
      m.hidden = false;
      const r = m.getBoundingClientRect();
      m.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
      m.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
    }
    hideMenu() { this.menu.hidden = true; }
    dropdown(anchor, items) {
      const r = anchor.getBoundingClientRect();
      this.showMenu(r.left, r.bottom + 4, items);
    }

    /* ---------------- toast ---------------- */
    toast(msg, kind = '') {
      const t = h('div', { class: 'toast ' + kind }, msg);
      $('#toasts').append(t);
      setTimeout(() => t.classList.add('out'), 2600);
      setTimeout(() => t.remove(), 3000);
    }

    /* ---------------- modal ---------------- */
    modal({ title, body, actions = [], wide = false, onClose }) {
      const overlay = h('div', { class: 'modal-overlay' });
      const close = () => { overlay.remove(); document.removeEventListener('keydown', key, true); onClose && onClose(); };
      const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
      document.addEventListener('keydown', key, true);
      const foot = h('div', { class: 'modal-foot' }, actions.map((a) => {
        const b = h('button', { class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : '') + (a.left ? ' left' : '') }, a.icon ? h('span', { html: EL.icon(a.icon) }) : null, a.label);
        b.addEventListener('click', () => { if (a.action && a.action(b) === false) return; if (!a.keepOpen) close(); });
        return b;
      }));
      const box = h('div', { class: 'modal' + (wide ? ' wide' : '') },
        h('div', { class: 'modal-head' }, h('div', { class: 'modal-title' }, title), h('button', { class: 'icon-btn', title: 'Close', onclick: close, html: EL.icon('x') })),
        h('div', { class: 'modal-body' }, body), actions.length ? foot : null);
      overlay.append(box);
      overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
      $('#modalRoot').append(overlay);
      return close;
    }
    confirm(title, text, okLabel, fn) {
      this.modal({ title, body: h('p', { class: 'muted' }, text), actions: [{ label: 'Cancel' }, { label: okLabel, primary: true, danger: /delete|discard/i.test(okLabel), action: fn }] });
    }

    /* ---------------- CircuiTikZ export ---------------- */
    tikzDialog() {
      const app = this.app;
      const o = Object.assign({ style: app.settings.style === 'iec' ? 'european' : 'american', standalone: true, labels: true, values: true }, app.settings.tikz || {});
      const ta = h('textarea', { class: 'code', spellcheck: 'false', readonly: true });
      const update = () => { ta.value = EL.tikz.exportTikz(app.doc, o); app.settings.tikz = o; app.saveSettings(); };
      const opt = (key, label) => { const i = h('input', { type: 'checkbox', class: 'switch', onchange: (e) => { o[key] = e.target.checked; update(); } }); i.checked = o[key]; return h('label', { class: 'field check inline' }, i, h('span', {}, label)); };
      const style = h('div', { class: 'seg' }, ['european', 'american'].map((s) => {
        const b = h('button', { class: o.style === s ? 'on' : '', onclick: () => { o.style = s; style.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); update(); } }, s === 'european' ? 'European (IEC)' : 'American (ANSI)');
        return b;
      }));
      const body = h('div', { class: 'tikz' },
        h('div', { class: 'tikz-opts' }, style, opt('standalone', 'Complete document'), opt('labels', 'Labels'), opt('values', 'Values')),
        ta,
        h('p', { class: 'muted small' }, 'Compile with pdflatex/lualatex (needs the circuitikz package). One grid unit = 0.4 cm.'));
      update();
      this.modal({
        title: 'Export to CircuiTikZ', body, wide: true,
        actions: [
          { label: 'Copy to clipboard', icon: 'copy', keepOpen: true, action: () => { navigator.clipboard.writeText(ta.value).then(() => this.toast('CircuiTikZ code copied'), () => { ta.select(); document.execCommand('copy'); this.toast('CircuiTikZ code copied'); }); } },
          { label: 'Download .tex', icon: 'download', primary: true, action: () => U.download((app.fileName || 'circuit').replace(/\.json$/, '') + '.tex', ta.value, 'text/x-tex') },
        ],
      });
    }

    /* ---------------- examples ---------------- */
    examplesDialog() {
      const app = this.app;
      let close;
      const grid = h('div', { class: 'ex-grid' }, EL.examples.map((ex) => {
        const cv = h('canvas', { class: 'ex-thumb' });
        const card = h('button', { class: 'ex-card', onclick: () => { close(); app.loadDoc(U.clone(ex.doc), ex.title); } }, cv, h('div', { class: 'ex-title' }, ex.title), h('div', { class: 'ex-desc' }, ex.desc));
        requestAnimationFrame(() => drawThumb(cv, ex.doc, app));
        return card;
      }));
      close = this.modal({ title: 'Example circuits', body: grid, wide: true });
    }

    /* ---------------- help ---------------- */
    helpDialog() {
      const k = (a, b) => `<tr><td>${a.split(' ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</td><td>${b}</td></tr>`;
      const body = h('div', { class: 'help', html: `
        <div class="help-cols">
        <div>
          <h4>Editing</h4>
          <table>
            ${k('W', 'Wire tool (toggle)')}${k('V', 'Select tool')}${k('R', 'Rotate (Shift+R: other way)')}${k('F', 'Flip / mirror')}
            ${k('⌫', 'Delete selection')}${k('M', 'Record a data-table row')}${k('⌘C ⌘V', 'Copy / paste')}${k('⌘D', 'Duplicate')}${k('⌘Z', 'Undo')}${k('⇧⌘Z', 'Redo')}${k('⌘A', 'Select all')}${k('Esc', 'Cancel / deselect')}
          </table>
          <h4>View</h4>
          <table>${k('Scroll', 'Pan')}${k('⌘ Scroll', 'Zoom (or pinch)')}${k('Space', 'Hold + drag to pan, tap to run/pause')}${k('0', 'Zoom to fit')}${k('+ −', 'Zoom in / out')}</table>
        </div>
        <div>
          <h4>Wiring</h4>
          <p>Drag from a pin (or a wire end) to draw an L-shaped wire. A short click on a pin starts a multi-segment wire: click to add corners, finish on a pin / wire, double-click or press <kbd>Esc</kbd>. A wire end that touches another wire forms a junction (•). Crossing wires are <i>not</i> connected.</p>
          <h4>Measuring</h4>
          <p>Hover anything for live voltage / current. Select a part to see V, I and P in the inspector. Voltmeters and ammeters show readings directly on the schematic. Wire colours show the node voltage (green +, red −).</p>
          <h4>Oscilloscope</h4>
          <p>Place <i>Scope probes</i>, or right-click a part or wire → <i>Plot …</i>. Hover the screen for a cursor read-out. <i>Trigger</i> mode stabilises periodic signals.</p>
          <h4>Data table</h4>
          <p>Right-click a part or wire → <i>Add … to data table</i> (or <b>+ Column</b>). Press <b>Record</b> or <kbd>M</kbd> to store the current values, turn on <i>Auto</i> to log at a fixed simulation-time interval, or use <b>Sweep…</b> to step a component value (e.g. a source voltage) and record a row per step. Choose X and Y columns to plot; export with <b>CSV</b>.</p>
          <h4>Digital scope</h4>
          <p>Switch the oscilloscope to <b>Digital</b> for logic-analyser lanes: each channel is shown as 0/1 using the threshold, and <b>Bus</b> decodes the channels as a binary number (CH1 = bit 0).</p>
          <h4>ICs</h4>
          <p>Standard ICs (555, op-amps, 74xx) need their supply pins connected. Create your own ICs from logic expressions or from a circuit with <i>IC port</i> markers.</p>
        </div></div>` });
      this.modal({ title: 'Help & shortcuts', body, wide: true });
    }

    /* ---------------- custom IC designer ---------------- */
    icDialog(editDef = null, startTab = 'logic') {
      const app = this.app;
      let tab = editDef ? 'logic' : startTab;
      const TEMPL = {
        'Full adder': ['A, B, CIN', 'S, COUT', 'S = A ^ B ^ CIN\nCOUT = (A & B) | (CIN & (A ^ B))'],
        'D flip-flop': ['D, CLK', 'Q, QN', '# rising-edge register\nQ = D @ CLK\nQN = !Q'],
        '2-bit counter': ['CLK, RST', 'Q0, Q1', 'Q0 = !Q0 & !RST @ CLK\nQ1 = (Q1 ^ Q0) & !RST @ CLK'],
        '2:1 multiplexer': ['A, B, SEL', 'Y', 'Y = (A & !SEL) | (B & SEL)'],
        'SR latch (NOR)': ['S, R', 'Q, QN', 'Q = !(R | QN)\nQN = !(S | Q)'],
      };
      const ed = editDef ? editDef : null;
      const name = h('input', { class: 'inp', value: ed ? ed.name : '', placeholder: 'e.g. ADDER' });
      const desc = h('input', { class: 'inp', value: ed ? ed.title || '' : '', placeholder: 'Short description' });
      const pinsOf = (side) => (ed ? EL.ics.pins(ed).filter((p) => p.side === side && !/^(VCC|GND)$/.test(p.name)).map((p) => p.name).join(', ') : '');
      const inputs = h('input', { class: 'inp mono', value: ed ? pinsOf('L') : 'A, B, CIN', placeholder: 'A, B, CLK' });
      const outputs = h('input', { class: 'inp mono', value: ed ? pinsOf('R') : 'S, COUT', placeholder: 'Y, Q' });
      const power = h('input', { type: 'checkbox', class: 'switch' });
      power.checked = ed ? EL.ics.pins(ed).some((p) => p.name === 'VCC') : false;
      const code = h('textarea', { class: 'code small', spellcheck: 'false', rows: 7 }, ed ? ed.model.code : TEMPL['Full adder'][2]);
      const err = h('div', { class: 'ic-err' });
      const prev = h('canvas', { class: 'ic-preview' });
      const tmpl = h('select', { class: 'inp', onchange: (e) => { const t = TEMPL[e.target.value]; if (t) { [inputs.value, outputs.value, code.value] = t; if (!name.value) name.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, ''); refresh(); } e.target.value = ''; } },
        h('option', { value: '' }, 'Load a template…'), Object.keys(TEMPL).map((k) => h('option', { value: k }, k)));
      const list = (s) => s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

      // sub-circuit tab
      const selPorts = [...app.editor.sel].filter((o) => o.type === 'port');
      const useSel = selPorts.length > 0;
      const srcComps = useSel ? [...app.editor.sel].filter((o) => o.type) : app.doc.comps;
      const srcWires = useSel ? [...app.editor.sel].filter((o) => !o.type) : app.doc.wires;
      const ports = srcComps.filter((c) => c.type === 'port');
      const portNames = [...new Set(ports.map((p) => p.props.name))];
      const sides = new Map(portNames.map((n) => {
        const p = ports.find((x) => x.props.name === n);
        const [dx] = U.rot(1, 0, p.rot || 0, p.flip);
        return [n, /^(VCC|VDD|V\+)$/i.test(n) ? 'T' : /^(GND|VSS|V-)$/i.test(n) ? 'B' : dx > 0 ? 'R' : 'L'];
      }));
      const sName = h('input', { class: 'inp', placeholder: 'e.g. AMP1' });
      const sDesc = h('input', { class: 'inp', placeholder: 'Short description' });
      const portTable = h('div', { class: 'port-table' });
      const renderPorts = () => {
        portTable.innerHTML = '';
        if (!portNames.length) {
          portTable.append(h('div', { class: 'empty-note', html: `No <b>IC port</b> markers found. Build the circuit, then place <i>IC port</i> parts (palette → Annotation) on every node that should become an external pin and give each a name.` }));
          return;
        }
        for (const n of portNames) {
          const s = h('select', { class: 'inp sm', onchange: (e) => { sides.set(n, e.target.value); refresh(); } }, [['L', 'Left'], ['R', 'Right'], ['T', 'Top'], ['B', 'Bottom']].map(([v, l]) => h('option', { value: v }, l)));
          s.value = sides.get(n);
          portTable.append(h('div', { class: 'port-row' }, h('span', { class: 'mono' }, n), s));
        }
      };
      renderPorts();

      const logicPane = h('div', { class: 'ic-pane' },
        h('div', { class: 'ic-row2' }, this._field('Name', name), this._field('Description', desc)),
        h('div', { class: 'ic-row2' }, this._field('Inputs (left side)', inputs), this._field('Outputs (right side)', outputs)),
        h('label', { class: 'field check inline' }, power, h('span', {}, 'Add VCC / GND supply pins (outputs follow VCC; otherwise 5 V logic)')),
        h('div', { class: 'ic-code-head' }, h('span', { class: 'sec-title' }, 'Logic'), tmpl),
        code,
        h('div', { class: 'syntax', html: '<code>!</code> not &nbsp; <code>&amp;</code> and &nbsp; <code>|</code> or &nbsp; <code>^</code> xor &nbsp; <code>( )</code> &nbsp; <code>0 1</code> &nbsp;·&nbsp; <code>Q = D @ CLK</code> register (rising edge, <code>@ !CLK</code> falling) &nbsp;·&nbsp; internal signals allowed' }),
        err);
      const subPane = h('div', { class: 'ic-pane' },
        h('p', { class: 'muted small' }, useSel ? `Using the ${srcComps.length} selected components and ${srcWires.length} wires.` : 'Using the whole current circuit. Tip: select part of the circuit (including its ports) to package only that part.'),
        h('div', { class: 'ic-row2' }, this._field('Name', sName), this._field('Description', sDesc)),
        h('div', { class: 'sec-title' }, 'External pins'), portTable,
        h('p', { class: 'muted small' }, 'Ground symbols inside the sub-circuit connect to the global ground.'));
      const tabs = h('div', { class: 'seg tabs' });
      const body = h('div', { class: 'ic-dialog' }, tabs, h('div', { class: 'ic-main' }, h('div', { class: 'ic-left' }, logicPane, subPane), h('div', { class: 'ic-right' }, h('div', { class: 'sec-title' }, 'Preview'), prev)));
      const setTab = (t) => {
        tab = t;
        tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
        logicPane.hidden = t !== 'logic';
        subPane.hidden = t !== 'subckt';
        refresh();
      };
      if (!editDef) for (const [t, l] of [['logic', 'Logic expressions'], ['subckt', 'From circuit (sub-circuit)']]) tabs.append(h('button', { 'data-t': t, onclick: () => setTab(t) }, l));

      const buildDef = () => {
        if (tab === 'logic') {
          const ins = list(inputs.value), outs = list(outputs.value);
          const pins = [...ins.map((n) => ({ name: n, side: 'L' })), ...outs.map((n) => ({ name: n, side: 'R' }))];
          if (power.checked) pins.push({ name: 'VCC', side: 'T' }, { name: 'GND', side: 'B' });
          pins.forEach((p, i) => { p.num = i + 1; });
          return { id: ed ? ed.id : 'cx_' + U.uid(''), name: name.value.trim() || 'IC', title: desc.value.trim(), desc: desc.value.trim(), layout: 'func', pins, model: { kind: 'logic', code: code.value }, custom: true };
        }
        const order = { L: 0, T: 1, R: 2, B: 3 };
        const pins = portNames.map((n) => ({ name: n, side: sides.get(n) })).sort((a, b) => order[a.side] - order[b.side]);
        pins.forEach((p, i) => { p.num = i + 1; });
        return { id: 'cx_' + U.uid(''), name: sName.value.trim() || 'SUB', title: sDesc.value.trim() || 'Sub-circuit', desc: sDesc.value.trim(), layout: 'func', pins,
          model: { kind: 'subckt', circuit: { comps: srcComps.map(C.compJSON), wires: srcWires.map(C.wireJSON) } }, custom: true };
      };
      const validate = () => {
        if (tab === 'logic') {
          const ins = list(inputs.value), outs = list(outputs.value);
          if (!outs.length) return 'Add at least one output';
          const all = [...ins, ...outs];
          if (new Set(all).size !== all.length) return 'Pin names must be unique';
          const bad = all.find((n) => !/^[A-Za-z0-9_]+$/.test(n) || n === '0' || n === '1');
          if (bad) return `Invalid pin name "${bad}" (letters, digits and _ only)`;
          return EL.ics.validateLogic(ins, outs, code.value);
        }
        if (!portNames.length) return 'The circuit has no IC ports';
        return null;
      };
      const refresh = () => {
        const e = validate();
        err.textContent = e || '';
        err.className = 'ic-err' + (e ? ' on' : ' ok');
        if (!e && tab === 'logic') err.textContent = '✓ Logic compiles';
        try {
          const d = buildDef();
          const tmpId = '__preview';
          EL.ics.custom.set(tmpId, Object.assign({}, d, { id: tmpId }));
          EL.drawIcon(prev, { id: 'p', type: 'ic', x: 0, y: 0, rot: 0, props: { ic: tmpId } }, app.theme, app.settings.style === 'iec', { pad: 0.8, lineWidth: 1.5, maxScale: 24 });
          EL.ics.custom.delete(tmpId);
        } catch (x) { /* ignore preview errors */ }
      };
      [name, desc, inputs, outputs, code, sName, sDesc].forEach((i) => i.addEventListener('input', refresh));
      power.addEventListener('change', refresh);
      this.modal({
        title: editDef ? `Edit ${editDef.name}` : 'New custom IC', body, wide: true,
        actions: [
          ...(editDef ? [] : [{ label: 'Import definition…', icon: 'upload', left: true, keepOpen: true, action: () => app.importIC() }]),
          { label: 'Cancel' },
          { label: editDef ? 'Save changes' : 'Create IC', primary: true, action: () => {
            const e = validate();
            if (e) { err.textContent = e; err.className = 'ic-err on'; return false; }
            const d = EL.ics.register(buildDef());
            if (d.model.kind === 'logic') { /* drop cached compile */ }
            this.buildPalette();
            app.rebuild();
            this.toast(`${d.name} added to Custom ICs`);
            if (!editDef) app.editor.startPlacing({ type: 'ic', props: { ic: d.id } });
          } },
        ],
      });
      setTab(tab);
      requestAnimationFrame(refresh);
    }
  }

  function drawThumb(cv, doc, app) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    const comps = doc.comps.map((c) => Object.assign({ rot: 0 }, c));
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const c of comps) { const b = C.worldBox(c); x1 = Math.min(x1, b.x1); y1 = Math.min(y1, b.y1); x2 = Math.max(x2, b.x2); y2 = Math.max(y2, b.y2); }
    for (const w of doc.wires) { x1 = Math.min(x1, w.x1, w.x2); x2 = Math.max(x2, w.x1, w.x2); y1 = Math.min(y1, w.y1, w.y2); y2 = Math.max(y2, w.y1, w.y2); }
    const pad = 1.5, s = Math.min((W * dpr) / (x2 - x1 + 2 * pad), (H * dpr) / (y2 - y1 + 2 * pad));
    ctx.setTransform(s, 0, 0, s, (W * dpr) / 2 - ((x1 + x2) / 2) * s, (H * dpr) / 2 - ((y1 + y2) / 2) * s);
    const p = new EL.Painter(ctx);
    p.fg = app.theme.comp; p.bg = app.theme.compFill; p.th = app.theme; p.iec = app.settings.style === 'iec';
    p.lwu = (1.1 * dpr) / s;
    for (const w of doc.wires) p.line(w.x1, w.y1, w.x2, w.y2, app.theme.wire);
    for (const c of comps) EL.drawComponent(p, c);
  }

  EL.UI = UI;
  EL.h = h;
})(globalThis.EL = globalThis.EL || {});
