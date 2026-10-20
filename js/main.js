/* Electronics Lab – application controller */
(function (EL) {
  'use strict';
  const U = EL.util, C = EL.circuit;
  const $ = (s) => document.querySelector(s);

  const THEMES = {
    light: {
      canvas: '#fbfbfc', grid: 'rgba(100,116,139,0.30)', gridMajor: 'rgba(100,116,139,0.55)', wire: '#334155', comp: '#1e293b', compFill: '#ffffff',
      select: '#2563eb', selectFill: 'rgba(37,99,235,0.08)', hoverFill: 'rgba(100,116,139,0.08)', openPin: '#94a3b8', label: '#0f172a', value: '#64748b',
      vZero: [71, 85, 105], vPos: [22, 163, 74], vNeg: [220, 38, 38], readBg: '#0f172a', readFg: '#4ade80', danger: '#dc2626', accent: '#2563eb',
      logicHi: '#16a34a', logicLoBg: '#f1f5f9', muted: '#64748b', segBg: '#111827', segOff: 'rgba(148,163,184,0.16)', icFill: '#f8fafc',
      portBg: '#e0e7ff', portFg: '#3730a3', textNote: '#475569',
    },
    dark: {
      canvas: '#0f141b', grid: 'rgba(148,163,184,0.18)', gridMajor: 'rgba(148,163,184,0.36)', wire: '#a3b1c6', comp: '#e2e8f0', compFill: '#151c25',
      select: '#60a5fa', selectFill: 'rgba(96,165,250,0.12)', hoverFill: 'rgba(148,163,184,0.08)', openPin: '#64748b', label: '#f1f5f9', value: '#94a3b8',
      vZero: [148, 163, 184], vPos: [74, 222, 128], vNeg: [248, 113, 113], readBg: '#020617', readFg: '#4ade80', danger: '#f87171', accent: '#60a5fa',
      logicHi: '#22c55e', logicLoBg: '#1e293b', muted: '#94a3b8', segBg: '#020617', segOff: 'rgba(148,163,184,0.12)', icFill: '#1a2330',
      portBg: '#312e81', portFg: '#c7d2fe', textNote: '#cbd5e1',
    },
  };
  const SIM_ERRORS = {
    singular: 'The circuit cannot be solved. Look for a short-circuited or parallel voltage source, a loop of ideal sources/wires, or an inductor/current source with no path.',
    diverged: 'The simulation diverged (values exploded). Check for shorts across sources or extreme component values.',
  };

  const app = (EL.app = {
    settings: { style: 'iec', showLabels: true, showValues: true, voltColors: true, theme: null, tikz: null },
    doc: null,
    history: { past: [], future: [], present: null },
    sim: { running: true, engine: null, net: null, debt: 0, lagging: false },
    clipboard: null,
    fileName: null,
    theme: THEMES.light,

    init() {
      try { Object.assign(this.settings, JSON.parse(localStorage.getItem('elab.settings') || '{}')); } catch (e) { /* defaults */ }
      EL.ics.loadLocal();
      this.applyTheme();
      this.ui = new EL.UI(this);
      this.editor = new EL.Editor(this, $('#schematic'), $('#tooltip'));
      this.scope = new EL.Scope(this);
      this.table = new EL.DataTable(this);
      this.theme.traceColor = (id) => this.scope.colorFor(id);
      this._bindToolbar();
      this._bindKeys();
      this._bindSplitter();
      let doc = null;
      try { const s = localStorage.getItem('elab.autosave'); if (s) doc = JSON.parse(s); } catch (e) { doc = null; }
      if (doc && doc.comps && doc.comps.length) this.loadDoc(doc, localStorage.getItem('elab.filename') || null, true);
      else this.loadDoc(U.clone(EL.examples[0].doc), EL.examples[0].title, true);
      this.ui.buildPalette();
      requestAnimationFrame((t) => this.loop(t));
    },

    /* ---------- theme & settings ---------- */
    applyTheme() {
      const pref = this.settings.theme || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.dataset.theme = pref;
      const tc = this.theme && this.theme.traceColor;
      this.theme = Object.assign({}, THEMES[pref], { traceColor: tc });
      if (this.editor) { this.editor.needsRender = true; this.ui.buildPalette(); this.ui.renderInspector(); }
      const b = $('#btnTheme');
      if (b) { b.innerHTML = EL.icon(pref === 'dark' ? 'sun' : 'moon'); b.title = pref === 'dark' ? 'Light theme' : 'Dark theme'; }
    },
    saveSettings() { try { localStorage.setItem('elab.settings', JSON.stringify(this.settings)); } catch (e) { /* ignore */ } },

    /* ---------- document & history ---------- */
    snapshot() { return JSON.stringify({ comps: this.doc.comps.map(C.compJSON), wires: this.doc.wires.map(C.wireJSON), traces: this.doc.traces }); },
    commit() {
      const snap = this.snapshot(), H = this.history;
      if (snap !== H.present) {
        if (H.present) H.past.push(H.present);
        if (H.past.length > 200) H.past.shift();
        H.present = snap;
        H.future = [];
      }
      this.rebuild();
      this.saveLocal();
      this.selectionChanged();
      this.updateToolbar();
    },
    restore(snap) {
      const o = JSON.parse(snap);
      const d = C.deserialize({ comps: o.comps, wires: o.wires, traces: o.traces, settings: this.doc.settings });
      this.doc.comps = d.comps;
      this.doc.wires = d.wires;
      this.doc.traces = d.traces;
      this.editor.sel.clear();
      this.history.present = snap;
      this.rebuild();
      this.saveLocal();
      this.selectionChanged();
      this.updateToolbar();
    },
    undo() { const H = this.history; if (!H.past.length) return; H.future.push(H.present); this.restore(H.past.pop()); },
    redo() { const H = this.history; if (!H.future.length) return; H.past.push(H.present); this.restore(H.future.pop()); },

    loadDoc(obj, name, quiet) {
      let doc;
      try { doc = C.deserialize(obj); } catch (e) { this.ui && this.ui.toast(e.message, 'err'); return; }
      this.doc = doc;
      this.fileName = name || null;
      this.editor.sel.clear();
      this.editor.cancel();
      this.history = { past: [], future: [], present: this.snapshot() };
      this.sim.engine = null;
      this.sim.net = null;
      this.sim.debt = 0;
      this.scope.clear();
      this.scope.colorOf.clear();
      this.scope.state = null;
      this.rebuild();
      this.sim.running = true;
      this.table.nextT = 0;
      this.showPanel(this.doc.settings.panel || 'scope');
      this._syncControls();
      this.saveLocal();
      this.selectionChanged();
      this.updateToolbar();
      requestAnimationFrame(() => this.editor.fit());
      if (!quiet && name) this.ui.toast(`Loaded “${name}”`);
      document.title = (name ? name.replace(/\.json$/, '') + ' – ' : '') + 'Electronics Lab';
    },
    newDoc() {
      const go = () => this.loadDoc({ comps: [], wires: [], settings: C.defaultSettings() }, null, true);
      if (this.doc.comps.length) this.ui.confirm('Start a new circuit?', 'The current circuit will be cleared. Save it first if you want to keep it.', 'Discard & start new', go);
      else go();
    },
    saveLocal() {
      clearTimeout(this._saveT);
      this._saveT = setTimeout(() => {
        try {
          localStorage.setItem('elab.autosave', JSON.stringify(C.serialize(this.doc)));
          localStorage.setItem('elab.filename', this.fileName || '');
        } catch (e) { /* quota */ }
      }, 300);
    },
    saveFile() {
      const name = (this.fileName || 'circuit').replace(/\.json$/i, '').replace(/\.elab$/i, '') + '.elab.json';
      U.download(name, JSON.stringify(C.serialize(this.doc), null, 1));
      this.ui.toast('Circuit saved as ' + name);
    },
    openFile() { this._pickFile((obj, name) => { if (obj && obj.model && obj.pins) this._importICObj(obj); else this.loadDoc(obj, name.replace(/\.elab\.json$|\.json$/i, '')); }); },
    importIC() { this._pickFile((obj) => this._importICObj(obj)); },
    _importICObj(obj) {
      const list = Array.isArray(obj) ? obj : obj.customICs || [obj];
      let n = 0;
      for (const d of list) if (d && d.model && d.pins && d.id) { EL.ics.register(d); n++; }
      this.ui.buildPalette();
      this.rebuild();
      this.ui.toast(n ? `Imported ${n} IC definition${n > 1 ? 's' : ''}` : 'No IC definitions found in file', n ? '' : 'err');
    },
    _pickFile(cb) {
      const inp = $('#fileInput');
      inp.value = '';
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return;
        f.text().then((txt) => {
          try { cb(JSON.parse(txt), f.name); } catch (e) { this.ui.toast('Could not read file: ' + e.message, 'err'); }
        });
      };
      inp.click();
    },

    /* ---------- simulation ---------- */
    currentDt() {
      const s = this.doc.settings;
      if (s.dt !== 'auto') return +s.dt;
      return U.clamp(U.floor125(s.speed / 4000), 1e-9, 1e-3);
    },
    rebuild() {
      const old = this.sim.engine, oldNet = this.sim.net;
      let net;
      try { net = C.buildNetlist(this.doc); } catch (e) {
        console.error(e);
        this.sim.net = null; this.sim.engine = null;
        this._showError('Could not build the circuit: ' + e.message);
        return;
      }
      const eng = C.makeEngine(net, old, oldNet);
      eng.dt = this.currentDt();
      eng.method = this.doc.settings.method;
      this.sim.net = net;
      this.sim.engine = eng;
      if (old && old.t > 0 && eng.t === 0) this.scope.clear();
      if (!this.sim.running || eng.t === 0) eng.preview();
      if (eng.error) this._onSimError(); else this._showError(null);
      this.editor.refreshConnections();
      this.scope.bind();
      this.table.bind();
      this.updateStatus();
    },
    resetSim() {
      for (const c of this.doc.comps) if (c.type === 'button') c.state = false;
      this.sim.engine = null;
      this.sim.net = null;
      this.sim.debt = 0;
      this.scope.clear();
      this.rebuild();
      this.ui.toast('Simulation reset to t = 0');
    },
    setRunning(r) {
      if (r && this.sim.engine && this.sim.engine.error) { this.resetSim(); }
      this.sim.running = r;
      this.sim.debt = 0;
      this.updateToolbar();
      this.updateStatus();
    },
    stepOnce() {
      const eng = this.sim.engine;
      if (!eng || eng.error) return;
      this.setRunning(false);
      const target = eng.t + this.doc.settings.tdiv;
      let k = 0;
      while (eng.t < target - eng.dt * 0.5 && k < 200000) { if (!eng.step()) break; this.scope.sample(eng.t); this.table.sample(eng.t); k++; }
      if (eng.error) this._onSimError();
      this.editor.needsRender = true;
      this.updateStatus();
    },
    interactChanged(rerenderInspector) {
      this.rebuild();
      this.editor.needsRender = true;
      if (rerenderInspector) { this.ui.renderInspector(); this.saveLocal(); }
    },
    liveState(c) {
      const net = this.sim.net, eng = this.sim.engine;
      if (!net || !eng || eng.error) return null;
      const info = net.compEls.get(c.id);
      if (!info) return null;
      return { v: info.nodes.map((n) => eng.v(n)), els: info.els };
    },
    /** Stable id for a measurement source (matches oscilloscope trace ids). */
    sourceId(src) {
      if (src.kind === 'node') return 'node:' + src.key;
      if (src.kind === 'param') return `param:${src.id}:${src.key}`;
      if (src.kind === 'time') return 'time';
      return `comp:${src.id}:${src.q}`;
    },
    /** Resolve a measurement source to {label, unit, get()} against the current simulation, or null. */
    resolveSource(src) {
      const net = this.sim.net;
      if (src.kind === 'time') return { label: 'Time', unit: 's', get: () => (this.sim.engine ? this.sim.engine.t : NaN) };
      if (src.kind === 'node') {
        const n = net ? net.nodeAt(src.key) : null;
        if (n == null) return null;
        return { label: src.label || `V(${src.key.replace(',', ', ')})`, unit: 'V', get: () => (this.sim.engine ? this.sim.engine.v(n) : NaN) };
      }
      const c = this.doc.comps.find((x) => x.id === src.id);
      if (!c) return null;
      const t = EL.types[c.type], name = c.label || t.name;
      if (src.kind === 'param') {
        const pd = t.props.find((p) => p.key === src.key);
        return { label: `${name} ${pd ? pd.label.toLowerCase() : src.key}`, unit: pd ? pd.unit : '', get: () => c.props[src.key] };
      }
      if (!t.measure) return null;
      const q = src.q;
      const unit = q === 'i' ? 'A' : q === 'p' ? 'W' : 'V';
      const label = c.type === 'probe' || ((c.type === 'vmeter' || c.type === 'ameter') && q !== 'p') ? name : `${q.toUpperCase()}(${name})`;
      return {
        label, unit,
        get: () => {
          const st = this.liveState(c);
          if (!st) return NaN;
          const r = t.measure(c, st);
          return q === 'i' ? r.I : q === 'p' ? r.P : r.V;
        },
      };
    },
    /** Human-readable name for the node at grid key k, e.g. "V(Q1.B)". */
    nodeName(k) {
      const net = this.sim.net, n = net ? net.nodeAt(k) : null;
      let best = null;
      for (const c of this.doc.comps) {
        const t = EL.types[c.type];
        if (t.noLabel && c.type !== 'label') continue;
        for (const p of C.absPins(c)) {
          const pk = C.key(p.x, p.y);
          const same = pk === k ? 2 : n != null && net.nodeAt(pk) === n ? 1 : 0;
          if (!same || (best && best.score >= same)) continue;
          const nm = c.type === 'label' ? c.props.name : `${c.label || t.name}.${String(p.name).replace('~', '/')}`;
          best = { score: same, nm };
        }
      }
      if (n === 0) return 'V(GND)';
      return best ? `V(${best.nm})` : `V(${k.replace(',', ', ')})`;
    },
    addTrace(src) {
      const id = src.kind === 'node' ? 'node:' + src.key : `comp:${src.id}:${src.q}`;
      if (this.scope.traces.some((t) => t.id === id)) { this.ui.toast('Already shown in the oscilloscope'); return; }
      this.doc.traces.push({ src });
      $('#scope').classList.remove('collapsed');
      this.commit();
      this.ui.toast('Added to oscilloscope');
    },
    _onSimError() {
      this.sim.running = false;
      this._showError(SIM_ERRORS[this.sim.engine.error] || String(this.sim.engine.error));
      this.updateToolbar();
    },
    _showError(msg) {
      const el = $('#simError');
      if (!msg) { el.hidden = true; return; }
      el.querySelector('.msg').textContent = msg;
      el.hidden = false;
    },

    loop(ts) {
      const dtReal = this._lastTs ? Math.min((ts - this._lastTs) / 1000, 0.1) : 0;
      this._lastTs = ts;
      const sim = this.sim, eng = sim.engine;
      if (sim.running && eng && !eng.error) {
        eng.dt = this.currentDt();
        sim.debt += this.doc.settings.speed * dtReal;
        const t0 = performance.now();
        let k = 0;
        sim.lagging = false;
        while (sim.debt >= eng.dt * 0.999) {
          if (!eng.step()) break;
          sim.debt -= eng.dt;
          this.scope.sample(eng.t); this.table.sample(eng.t);
          if ((++k & 7) === 0 && performance.now() - t0 > 12) { sim.lagging = true; sim.debt = 0; break; }
        }
        if (eng.error) this._onSimError();
        if (k) this.editor.needsRender = true;
      }
      if (this.editor.needsRender) this.editor.render();
      if (this.scope.dirty && this.panel !== 'table') this.scope.draw();
      if (this.table.dirty && this.panel === 'table') this.table.draw();
      if (ts - (this._liveT || 0) > 120) {
        this._liveT = ts;
        this.ui.updateLive();
        this.scope.updateReadouts();
        if (sim.running) this.editor.updateTooltip();
        this.updateStatus();
      }
      requestAnimationFrame((t) => this.loop(t));
    },

    /* ---------- UI sync ---------- */
    selectionChanged() { this.ui.renderInspector(); this.editor.needsRender = true; this.updateToolbar(); },
    updateToolbar() {
      const ed = this.editor;
      $('#btnUndo').disabled = !this.history.past.length;
      $('#btnRedo').disabled = !this.history.future.length;
      $('#toolSelect').classList.toggle('on', ed.tool === 'select');
      $('#toolWire').classList.toggle('on', ed.tool === 'wire');
      const hasSel = ed.sel.size > 0;
      ['#btnRotate', '#btnFlip', '#btnDelete'].forEach((s) => { $(s).disabled = !hasSel; });
      const run = $('#btnRun');
      run.innerHTML = EL.icon(this.sim.running ? 'pause' : 'play') + `<span>${this.sim.running ? 'Pause' : 'Run'}</span>`;
      run.classList.toggle('running', this.sim.running);
    },
    updateStatus() {
      const eng = this.sim.engine, s = this.doc.settings, ed = this.editor;
      const st = $('#statusSim');
      let state = 'Paused', cls = 'paused';
      if (eng && eng.error) { state = 'Error'; cls = 'error'; }
      else if (this.sim.running) { state = this.sim.lagging ? 'Running (max speed)' : 'Running'; cls = 'running'; }
      st.className = 'st-sim ' + cls;
      st.textContent = state;
      $('#statusTime').textContent = eng ? `t = ${U.fmt(eng.t, 's', 4, true)}` : '';
      $('#statusDt').textContent = `Δt ${U.fmt(this.currentDt(), 's')}${s.dt === 'auto' ? ' (auto)' : ''}`;
      let hint = '';
      if (ed.placing) hint = `Placing ${ed.placing.type === 'ic' ? (EL.ics.get(ed.placing.props.ic) || {}).name : EL.types[ed.placing.type].name} — click to place · R rotate · F flip · Shift+click to place several · Esc cancel`;
      else if (ed.wireStart) hint = 'Drawing wire — click to add a corner, end on a pin or wire · double-click or Esc to finish';
      else if (ed.tool === 'wire') hint = 'Wire tool — click a start point';
      else if (this.sim.net && this.sim.net.warnings.length) hint = '⚠ ' + this.sim.net.warnings[0];
      $('#statusHint').textContent = hint;
      $('#statusHint').classList.toggle('warn', !!hint && hint.startsWith('⚠'));
      $('#statusZoom').textContent = Math.round(ed.view.z * 100) + '%';
      if (eng && eng.nonConv > 0) $('#statusConv').textContent = `${eng.nonConv} non-converged steps`;
      else $('#statusConv').textContent = '';
    },
    _syncControls() {
      const s = this.doc.settings;
      $('#speedRange').value = String(Math.round(((Math.log10(s.speed) + 6) / 7) * 100));
      $('#speedLabel').textContent = U.fmt(s.speed, 's') + '/s';
      $('#scopeTdiv').value = String(s.tdiv);
      if ($('#scopeTdiv').value !== String(s.tdiv)) { s.tdiv = 1e-3; $('#scopeTdiv').value = String(s.tdiv); }
      document.querySelectorAll('#scopeMode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.scopeMode));
      document.querySelectorAll('#scopeDisplay button').forEach((b) => b.classList.toggle('on', b.dataset.disp === s.scopeDisplay));
      $('#scope').classList.toggle('digital', s.scopeDisplay === 'digital');
      $('#digTh').value = U.fmt(s.digTh, 'V', 3).replace(' ', '');
      $('#digBus').checked = !!s.digBus;
    },
    /** Switch the bottom panel between the oscilloscope and the data table. */
    showPanel(tab) {
      this.panel = tab;
      if (this.doc) this.doc.settings.panel = tab;
      document.querySelectorAll('#panelTabs .ptab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      document.querySelectorAll('#scope [data-pane]').forEach((el) => { el.hidden = el.dataset.pane !== tab; });
      $('#scope').classList.remove('collapsed');
      this.scope.dirty = true;
      this.table.dirty = true;
    },

    /* ---------- wiring up DOM ---------- */
    _bindToolbar() {
      const on = (id, fn) => $(id).addEventListener('click', fn);
      on('#btnNew', () => this.newDoc());
      on('#btnOpen', () => this.openFile());
      on('#btnSave', () => this.saveFile());
      on('#btnExamples', () => this.ui.examplesDialog());
      on('#btnUndo', () => this.undo());
      on('#btnRedo', () => this.redo());
      on('#toolSelect', () => this.editor.setTool('select'));
      on('#toolWire', () => this.editor.setTool('wire'));
      on('#btnRotate', () => this.editor.rotateSelection(1));
      on('#btnFlip', () => this.editor.flipSelection());
      on('#btnDelete', () => this.editor.deleteSelection());
      on('#btnRun', () => this.setRunning(!this.sim.running));
      on('#btnStep', () => this.stepOnce());
      on('#btnReset', () => this.resetSim());
      on('#btnTikz', () => this.ui.tikzDialog());
      on('#btnIC', () => this.ui.icDialog());
      on('#btnHelp', () => this.ui.helpDialog());
      on('#btnTheme', () => { this.settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; this.saveSettings(); this.applyTheme(); });
      on('#zoomIn', () => this.editor.zoomBy(1.25));
      on('#zoomOut', () => this.editor.zoomBy(0.8));
      on('#zoomFit', () => this.editor.fit());
      on('#errReset', () => this.resetSim());
      on('#btnView', (e) => {
        const S = this.settings;
        const tog = (k) => () => { S[k] = !S[k]; this.saveSettings(); this.editor.needsRender = true; };
        const style = (v) => () => { S.style = v; this.saveSettings(); this.editor.needsRender = true; this.ui.buildPalette(); this.ui.renderInspector(); };
        this.ui.dropdown(e.currentTarget, [
          { label: 'Display', header: true },
          { label: 'Component labels', icon: S.showLabels ? 'check' : null, action: tog('showLabels') },
          { label: 'Component values', icon: S.showValues ? 'check' : null, action: tog('showValues') },
          { label: 'Voltage-coloured wires', icon: S.voltColors ? 'check' : null, action: tog('voltColors') },
          { sep: true },
          { label: 'Symbol style', header: true },
          { label: 'IEC (European)', icon: S.style === 'iec' ? 'check' : null, action: style('iec') },
          { label: 'ANSI (American)', icon: S.style === 'ansi' ? 'check' : null, action: style('ansi') },
        ]);
      });
      const sp = $('#speedRange');
      sp.addEventListener('input', () => {
        const v = Math.pow(10, -6 + (+sp.value / 100) * 7);
        this.doc.settings.speed = U.floor125(v * 1.0001);
        $('#speedLabel').textContent = U.fmt(this.doc.settings.speed, 's') + '/s';
        this.sim.debt = 0;
        this.updateStatus();
      });
      sp.addEventListener('change', () => this.saveLocal());
      const td = $('#scopeTdiv');
      td.innerHTML = EL.Scope.TDIVS.map((v) => `<option value="${v}">${U.fmt(v, 's')}/div</option>`).join('');
      td.addEventListener('change', () => { this.doc.settings.tdiv = +td.value; this.scope.clear(); this.saveLocal(); });
      document.querySelectorAll('#scopeMode button').forEach((b) => b.addEventListener('click', () => {
        this.doc.settings.scopeMode = b.dataset.mode;
        this._syncControls();
        this.scope.dirty = true;
        this.saveLocal();
      }));
      on('#scopeClear', () => this.scope.clear());
      document.querySelectorAll('#panelTabs .ptab').forEach((b) => b.addEventListener('click', () => { this.showPanel(b.dataset.tab); this.saveLocal(); }));
      document.querySelectorAll('#scopeDisplay button').forEach((b) => b.addEventListener('click', () => {
        this.doc.settings.scopeDisplay = b.dataset.disp;
        this._syncControls();
        this.scope.dirty = true;
        this.saveLocal();
      }));
      $('#digTh').addEventListener('change', (e) => {
        const v = U.parseValue(e.target.value);
        if (isFinite(v)) this.doc.settings.digTh = v;
        this._syncControls();
        this.scope.dirty = true;
        this.saveLocal();
      });
      $('#digBus').addEventListener('change', (e) => { this.doc.settings.digBus = e.target.checked; this.scope.dirty = true; this.saveLocal(); });
      on('#scopeToggle', () => { $('#scope').classList.toggle('collapsed'); this.editor.needsRender = true; this.scope.dirty = true; });
      on('#scopeAuto', () => {
        // pick a time base that shows ~2 periods of the first periodic channel, else follow sim speed
        const t = this.scope.traces[0];
        const win = this.scope._window();
        const st = t && win && this.scope._stats(t, win);
        const target = st && st.f ? 2 / st.f / 10 : this.doc.settings.speed * 0.5;
        this.doc.settings.tdiv = EL.Scope.TDIVS.reduce((a, b) => (Math.abs(Math.log(b / target)) < Math.abs(Math.log(a / target)) ? b : a));
        this.scope.traces.forEach((x) => { x.vdiv = null; x.center = null; });
        this._syncControls();
        this.scope.clear();
      });
    },
    _bindKeys() {
      window.addEventListener('keydown', (e) => {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || $('#modalRoot').children.length) return;
        const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
        if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
        if (mod && k === 'y') { e.preventDefault(); this.redo(); return; }
        if (mod && k === 's') { e.preventDefault(); this.saveFile(); return; }
        if (mod && k === 'o') { e.preventDefault(); this.openFile(); return; }
        if (e.key === ' ') {
          e.preventDefault();
          if (!e.repeat) { this.editor.spaceDown = true; this.editor.spaceUsed = false; }
          return;
        }
        if (e.key === 'Escape' && !this.ui.menu.hidden) { this.ui.hideMenu(); return; }
        if (e.key === '?') { this.ui.helpDialog(); return; }
        if (k === 'm' && !mod) { this.table.record(true); return; }
        if (this.editor.onKey(e)) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => {
        if (e.key !== ' ') return;
        const tag = e.target.tagName;
        const ed = this.editor;
        if (ed.spaceDown && !ed.spaceUsed && tag !== 'INPUT' && tag !== 'TEXTAREA' && !$('#modalRoot').children.length) this.setRunning(!this.sim.running);
        ed.spaceDown = false;
      });
    },
    _bindSplitter() {
      const sp = $('#splitter'), scope = $('#scope');
      const saved = +localStorage.getItem('elab.scopeH');
      if (saved) scope.style.height = saved + 'px';
      let drag = null;
      sp.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, h: scope.offsetHeight }; sp.setPointerCapture(e.pointerId); document.body.classList.add('resizing'); });
      sp.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const max = window.innerHeight - 260;
        const hgt = U.clamp(drag.h - (e.clientY - drag.y), 120, max);
        scope.style.height = hgt + 'px';
        scope.classList.remove('collapsed');
      });
      sp.addEventListener('pointerup', () => { if (drag) { localStorage.setItem('elab.scopeH', scope.offsetHeight); drag = null; document.body.classList.remove('resizing'); } });
      sp.addEventListener('dblclick', () => scope.classList.toggle('collapsed'));
    },
  });

  window.addEventListener('DOMContentLoaded', () => app.init());
})(globalThis.EL = globalThis.EL || {});
