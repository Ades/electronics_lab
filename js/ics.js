/* Electronics Lab – integrated circuits: standard library, custom ICs and the logic expression language */
(function (EL) {
  'use strict';

  /* ---------------- Logic expression language ----------------
     Lines:   NAME = expression            (combinational, evaluated in order)
              NAME = expression @ clock    (register, updated on rising edge of clock expression;
                                            use "@ !CLK" for falling edge)
     Operators: ! or ~ (not), & or * (and), ^ (xor), | or + (or), parentheses, constants 0 and 1.
     Comments start with # or //.  Statements may be separated by ';'.                      */

  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[A-Za-z0-9_]/.test(ch)) {
        let j = i;
        while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
        toks.push({ t: 'id', v: src.slice(i, j) });
        i = j;
        continue;
      }
      if ('!~&|^()*+'.includes(ch)) { toks.push({ t: 'op', v: ch }); i++; continue; }
      throw new Error(`unexpected character "${ch}"`);
    }
    return toks;
  }

  function parseExpr(toks) {
    let p = 0;
    const ids = new Set();
    const peek = () => toks[p];
    const isOp = (...ops) => peek() && peek().t === 'op' && ops.includes(peek().v);
    function orE() { let l = xorE(); while (isOp('|', '+')) { p++; const a = l, r = xorE(); l = (e) => a(e) | r(e); } return l; }
    function xorE() { let l = andE(); while (isOp('^')) { p++; const a = l, r = andE(); l = (e) => a(e) ^ r(e); } return l; }
    function andE() { let l = unE(); while (isOp('&', '*')) { p++; const a = l, r = unE(); l = (e) => a(e) & r(e); } return l; }
    function unE() {
      const t = toks[p++];
      if (!t) throw new Error('unexpected end of expression');
      if (t.t === 'op' && (t.v === '!' || t.v === '~')) { const a = unE(); return (e) => a(e) ^ 1; }
      if (t.t === 'op' && t.v === '(') {
        const a = orE();
        const c = toks[p++];
        if (!c || c.v !== ')') throw new Error('missing ")"');
        return a;
      }
      if (t.t === 'id') {
        if (t.v === '0') return () => 0;
        if (t.v === '1') return () => 1;
        const name = t.v;
        ids.add(name);
        return (e) => (e[name] ? 1 : 0);
      }
      throw new Error(`unexpected "${t.v}"`);
    }
    const f = orE();
    if (p < toks.length) throw new Error(`unexpected "${toks[p].v}"`);
    return { f, ids };
  }

  function compileLogic(code) {
    const lines = [];
    String(code).split(/\n/).forEach((rawLine, ln) => {
      rawLine.split(';').forEach((raw) => {
        const s = raw.replace(/(#|\/\/).*$/, '').trim();
        if (!s) return;
        const m = s.match(/^([A-Za-z0-9_]+)\s*=\s*(.+?)(?:\s*@\s*(.+))?$/);
        if (!m) throw new Error(`Line ${ln + 1}: expected "NAME = expression"`);
        try {
          const e = parseExpr(tokenize(m[2]));
          const c = m[3] ? parseExpr(tokenize(m[3])) : null;
          lines.push({ lhs: m[1], expr: e.f, clk: c && c.f, ids: [...e.ids, ...(c ? c.ids : [])] });
        } catch (err) {
          throw new Error(`Line ${ln + 1}: ${err.message}`);
        }
      });
    });
    const regs = lines.filter((l) => l.clk), combs = lines.filter((l) => !l.clk);
    return {
      assigned: new Set(lines.map((l) => l.lhs)),
      used: new Set(lines.flatMap((l) => l.ids)),
      init: () => ({ vals: {}, clk: regs.map(() => 0) }),
      run(inputs, st) {
        const env = Object.assign({}, st.vals, inputs);
        const upd = [];
        regs.forEach((r, i) => {
          const c = r.clk(env);
          if (c && !st.clk[i]) upd.push([r.lhs, r.expr(env)]);
          st.clk[i] = c;
        });
        for (const [k, v] of upd) env[k] = st.vals[k] = v;
        for (const l of combs) env[l.lhs] = st.vals[l.lhs] = l.expr(env);
        return env;
      },
    };
  }

  /* ---------------- Built-in (JavaScript) IC models ---------------- */
  // Each receives (nodes by pin index, P = {pinName: index}, B = netlist builder)
  const SEG = [0x7e, 0x30, 0x6d, 0x79, 0x33, 0x5b, 0x5f, 0x70, 0x7f, 0x7b]; // a..g as bits 6..0

  const BUILTIN = {
    ne555(n, P, B) {
      B.R(n[P.VCC], n[P.CTRL], 5000);
      B.R(n[P.CTRL], n[P.GND], 10000);
      B.behav(n, {
        vcc: P.VCC, gnd: P.GND, outputs: [P.OUT], rOut: 10,
        init: () => ({ q: 0 }),
        logic(ctx) {
          const s = ctx.state, vc = ctx.v(P.CTRL);
          if (ctx.v(P['~RESET']) < 0.7) s.q = 0;
          else if (ctx.v(P.TRIG) < vc / 2) s.q = 1;
          else if (ctx.v(P.THR) > vc) s.q = 0;
          ctx.out(P.OUT, s.q);
        },
        stamp(S, self) { S.cond(n[P.DIS], n[P.GND], !self.powered || self.state.q ? 1e-9 : 0.1); },
      });
    },
    lm358(n, P, B) {
      const o = { rails: [n[P.VCC], n[P.GND]], drop: [1.5, 0.02], gain: 1e5 };
      B.OA(n[P['IN1+']], n[P['IN1-']], n[P.OUT1], o);
      B.OA(n[P['IN2+']], n[P['IN2-']], n[P.OUT2], o);
    },
    lm741(n, P, B) {
      B.OA(n[P['IN+']], n[P['IN-']], n[P.OUT], { rails: [n[P['V+']], n[P['V-']]], drop: [1.5, 1.5], gain: 2e5 });
    },
    dff7474(n, P, B) {
      const f = (k) => ({ clr: P[`~${k}CLR`], pre: P[`~${k}PRE`], clk: P[`${k}CLK`], d: P[`${k}D`], q: P[`${k}Q`], qn: P[`~${k}Q`] });
      const ff = [f(1), f(2)];
      B.behav(n, {
        vcc: P.VCC, gnd: P.GND, outputs: ff.flatMap((x) => [x.q, x.qn]), rOut: 30,
        init: () => ({ q: [0, 0] }),
        logic(ctx) {
          ff.forEach((x, i) => {
            const pre = !ctx.bit(x.pre), clr = !ctx.bit(x.clr);
            let q = ctx.state.q[i], qn;
            if (pre && clr) { q = 1; qn = 1; }
            else if (pre) q = 1;
            else if (clr) q = 0;
            else if (ctx.rise(x.clk)) q = ctx.bit(x.d);
            ctx.state.q[i] = q;
            ctx.out(x.q, q);
            ctx.out(x.qn, qn ?? (q ? 0 : 1));
          });
        },
      });
    },
    counter(mod) {
      return (n, P, B) => {
        const Q = [P.QA, P.QB, P.QC, P.QD], D = [P.A, P.B, P.C, P.D];
        B.behav(n, {
          vcc: P.VCC, gnd: P.GND, outputs: [...Q, P.RCO], rOut: 30,
          init: () => ({ c: 0 }),
          logic(ctx) {
            const s = ctx.state;
            if (!ctx.bit(P['~CLR'])) s.c = 0;
            else if (ctx.rise(P.CLK)) {
              if (!ctx.bit(P['~LOAD'])) s.c = D.reduce((a, p, i) => a | (ctx.bit(p) << i), 0);
              else if (ctx.bit(P.ENP) && ctx.bit(P.ENT)) s.c = (s.c + 1) % mod;
            }
            Q.forEach((p, i) => ctx.out(p, (s.c >> i) & 1));
            ctx.out(P.RCO, ctx.bit(P.ENT) && s.c === mod - 1 ? 1 : 0);
          },
        });
      };
    },
    lm393(n, P, B) {
      const ch = [['IN1+', 'IN1-', 'OUT1'], ['IN2+', 'IN2-', 'OUT2']];
      B.behav(n, {
        vcc: P.VCC, gnd: P.GND, outputs: [],
        init: () => ({ lo: [0, 0] }),
        logic(c) { ch.forEach(([p, m], i) => { c.state.lo[i] = c.v(P[m]) > c.v(P[p]) ? 1 : 0; }); },
        stamp(S, self) { ch.forEach(([, , o], i) => S.cond(n[P[o]], n[P.GND], self.powered && self.state.lo[i] ? 0.02 : 1e-9)); },
      });
    },
    reg7805(n, P, B) {
      const g = 20; // 50 mΩ output resistance
      B.behav(n, {
        gnd: P.GND, outputs: [],
        init: () => ({ vt: 0, iout: 0 }),
        logic(c) {
          const s = c.state;
          s.vt = Math.max(0, Math.min(5, c.v(P.IN) - 2));
          s.iout = Math.max(0, g * (s.vt - c.v(P.OUT)));
        },
        stamp(S, self) {
          const s = self.state;
          S.cond(n[P.OUT], n[P.GND], g);
          S.cur(n[P.GND], n[P.OUT], g * s.vt);
          S.cur(n[P.IN], n[P.GND], s.iout + 5e-3); // input current = load + 5 mA quiescent
        },
      });
    },
    cd4511(n, P, B) {
      const segs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s) => P[s]);
      B.behav(n, {
        vcc: P.VDD, gnd: P.VSS, outputs: segs, rOut: 60,
        init: () => ({ v: 0 }),
        logic(ctx) {
          const s = ctx.state;
          if (!ctx.bit(P.LE)) s.v = ctx.bit(P.A) | (ctx.bit(P.B) << 1) | (ctx.bit(P.C) << 2) | (ctx.bit(P.D) << 3);
          let pat = s.v < 10 ? SEG[s.v] : 0;
          if (!ctx.bit(P['~BI'])) pat = 0;
          if (!ctx.bit(P['~LT'])) pat = 0x7f;
          segs.forEach((p, i) => ctx.out(p, (pat >> (6 - i)) & 1));
        },
      });
    },
  };

  /* ---------------- Standard IC definitions ---------------- */
  const quad = (op, inv) => [1, 2, 3, 4].map((k) => `${k}Y = ${inv ? '!' : ''}(${k}A ${op} ${k}B)`).join('\n');
  const tri = (op, inv) => [1, 2, 3].map((k) => `${k}Y = ${inv ? '!' : ''}(${k}A ${op} ${k}B ${op} ${k}C)`).join('\n');
  const hex = (inv) => [1, 2, 3, 4, 5, 6].map((k) => `${k}Y = ${inv ? '!' : ''}${k}A`).join('\n');
  const GATE14 = ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'];
  const TRI14 = ['1A', '1B', '2A', '2B', '2C', '2Y', 'GND', '3Y', '3A', '3B', '3C', '1Y', '1C', 'VCC'];
  const HEX14 = ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'];
  const CMOS14 = ['1A', '1B', '1Y', '2Y', '2A', '2B', 'VSS', '3A', '3B', '3Y', '4Y', '4A', '4B', 'VDD'];
  const F = (name, num, side) => ({ name, num, side });
  /** Function-layout pin list: F2({L: [[name, num], …], R: …, T: …, B: …}) */
  const F2 = (sides) => Object.entries(sides).flatMap(([side, list]) => list.map(([n, num]) => F(n, num, side)));
  const PWR = { T: [['VCC', 16]], B: [['GND', 8]] };
  /** JavaScript logic model: logic(I, state) returns {outputPin: 0 | 1 | null(high-Z)}.
      I(name) → input bit, I.r / I.f → rising / falling edge, I.v → voltage, I.vcc → supply. */
  const J = (outs, logic) => ({ kind: 'js', outs, logic });
  const num = (I, names) => names.reduce((a, n, i) => a | (I(n) << i), 0);
  const put = (o, names, v) => { names.forEach((n, i) => { o[n] = (v >> i) & 1; }); return o; };
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const QS = ['QA', 'QB', 'QC', 'QD'];
  const G = '74xx gates', FF = '74xx flip-flops, counters & registers', MSI = '74xx decoders, mux & arithmetic', CM = '4000 CMOS', AN = 'Analog, timer & power';
  const gate = (id, title, pins, code, cat = G, name) => ({ id, name: name || '74HC' + id.slice(2), title, cat, layout: 'dip', pins, model: { kind: 'logic', code } });

  const STD = [
    /* ---- analog / timer / power ---- */
    { id: '555', name: 'NE555', title: 'Timer', cat: AN, layout: 'func', w: 8, pullup: ['~RESET'],
      desc: 'Precision timer. Astable / monostable operation. Thresholds at ⅓ and ⅔ of V(CTRL).',
      pins: [F('DIS', 7, 'L'), F('THR', 6, 'L'), F('TRIG', 2, 'L'), F('OUT', 3, 'R'), F('CTRL', 5, 'R'), F('VCC', 8, 'T'), F('~RESET', 4, 'T'), F('GND', 1, 'B')],
      model: { kind: 'builtin', fn: 'ne555' } },
    { id: 'LM358', name: 'LM358', title: 'Dual op-amp (single supply)', cat: AN, layout: 'dip',
      desc: 'Two operational amplifiers. Output swings from GND to VCC − 1.5 V.',
      pins: ['OUT1', 'IN1-', 'IN1+', 'GND', 'IN2+', 'IN2-', 'OUT2', 'VCC'], model: { kind: 'builtin', fn: 'lm358' } },
    { id: 'LM741', name: 'LM741', title: 'Op-amp', cat: AN, layout: 'dip',
      desc: 'General purpose operational amplifier. Output swings to within 1.5 V of the rails.',
      pins: ['NULL', 'IN-', 'IN+', 'V-', 'NULL', 'OUT', 'V+', 'NC'], model: { kind: 'builtin', fn: 'lm741' } },
    { id: 'LM393', name: 'LM393', title: 'Dual comparator (open collector)', cat: AN, layout: 'dip',
      desc: 'Output sinks current to GND when IN− > IN+, otherwise it is open. Needs a pull-up resistor on each output.',
      pins: ['OUT1', 'IN1-', 'IN1+', 'GND', 'IN2+', 'IN2-', 'OUT2', 'VCC'], model: { kind: 'builtin', fn: 'lm393' } },
    { id: '7805', name: 'LM7805', title: '+5 V voltage regulator', cat: AN, layout: 'func', w: 6,
      desc: 'Linear regulator: OUT = 5 V when IN ≥ 7 V (2 V drop-out). Output resistance 50 mΩ.',
      pins: [F('IN', 1, 'L'), F('OUT', 3, 'R'), F('GND', 2, 'B')], model: { kind: 'builtin', fn: 'reg7805' } },

    /* ---- 74xx gates ---- */
    gate('7400', 'Quad 2-input NAND', GATE14, quad('&', true)),
    gate('7402', 'Quad 2-input NOR', ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'], quad('|', true)),
    gate('7404', 'Hex inverter', HEX14, hex(true)),
    gate('7408', 'Quad 2-input AND', GATE14, quad('&')),
    gate('7410', 'Triple 3-input NAND', TRI14, tri('&', true)),
    gate('7411', 'Triple 3-input AND', TRI14, tri('&')),
    { id: '7414', name: '74HC14', title: 'Hex Schmitt-trigger inverter', cat: G, layout: 'dip', pins: HEX14,
      desc: 'Inverters with hysteresis: switch at 60 % and 40 % of VCC.',
      model: J(range(1, 6).map((k) => k + 'Y'), (I, s) => {
        const o = {};
        for (let k = 1; k <= 6; k++) {
          const v = I.v(k + 'A');
          if (v > 0.6 * I.vcc) s[k] = 1; else if (v < 0.4 * I.vcc) s[k] = 0;
          o[k + 'Y'] = s[k] ? 0 : 1;
        }
        return o;
      }) },
    gate('7420', 'Dual 4-input NAND', ['1A', '1B', 'NC', '1C', '1D', '1Y', 'GND', '2Y', '2A', '2B', 'NC', '2C', '2D', 'VCC'], '1Y = !(1A & 1B & 1C & 1D)\n2Y = !(2A & 2B & 2C & 2D)'),
    gate('7427', 'Triple 3-input NOR', TRI14, tri('|', true)),
    gate('7432', 'Quad 2-input OR', GATE14, quad('|')),
    gate('7486', 'Quad 2-input XOR', GATE14, quad('^')),
    { id: '74125', name: '74HC125', title: 'Quad tri-state buffer', cat: G, layout: 'dip',
      desc: 'Y = A when ~OE is low, otherwise the output is high-impedance (disconnected).',
      pins: ['~1OE', '1A', '1Y', '~2OE', '2A', '2Y', 'GND', '3Y', '3A', '~3OE', '4Y', '4A', '~4OE', 'VCC'],
      model: J(['1Y', '2Y', '3Y', '4Y'], (I) => { const o = {}; for (let k = 1; k <= 4; k++) o[k + 'Y'] = I(`~${k}OE`) ? null : I(k + 'A'); return o; }) },

    /* ---- 74xx flip-flops, counters & registers ---- */
    { id: '7474', name: '74HC74', title: 'Dual D flip-flop', cat: FF, layout: 'dip', pullup: ['~1CLR', '~1PRE', '~2CLR', '~2PRE'],
      desc: 'Positive-edge triggered D flip-flops with active-low preset and clear.',
      pins: ['~1CLR', '1D', '1CLK', '~1PRE', '1Q', '~1Q', 'GND', '~2Q', '2Q', '~2PRE', '2CLK', '2D', '~2CLR', 'VCC'],
      model: { kind: 'builtin', fn: 'dff7474' } },
    { id: '74112', name: '74HC112', title: 'Dual JK flip-flop', cat: FF, layout: 'dip', pullup: ['~1CLR', '~1PRE', '~2CLR', '~2PRE'],
      desc: 'Negative-edge triggered JK flip-flops: J K = 00 hold, 10 set, 01 reset, 11 toggle. Active-low preset and clear.',
      pins: ['1CLK', '1K', '1J', '~1PRE', '1Q', '~1Q', '~2Q', 'GND', '2Q', '~2PRE', '2J', '2K', '2CLK', '~2CLR', '~1CLR', 'VCC'],
      model: J(['1Q', '~1Q', '2Q', '~2Q'], (I, s) => {
        const o = {};
        for (const k of [1, 2]) {
          const pre = !I(`~${k}PRE`), clr = !I(`~${k}CLR`);
          let q = s[k] || 0;
          if (pre && clr) { o[`${k}Q`] = 1; o[`~${k}Q`] = 1; continue; }
          if (pre) q = 1;
          else if (clr) q = 0;
          else if (I.f(`${k}CLK`)) { const j = I(`${k}J`), kk = I(`${k}K`); q = j && kk ? q ^ 1 : j ? 1 : kk ? 0 : q; }
          s[k] = q; o[`${k}Q`] = q; o[`~${k}Q`] = q ^ 1;
        }
        return o;
      }) },
    { id: '74174', name: '74HC174', title: 'Hex D flip-flop with clear', cat: FF, layout: 'dip', pullup: ['~CLR'],
      desc: 'Six D flip-flops sharing a rising-edge clock and an active-low asynchronous clear.',
      pins: ['~CLR', '1Q', '1D', '2D', '2Q', '3D', '3Q', 'GND', 'CLK', '4Q', '4D', '5Q', '5D', '6D', '6Q', 'VCC'],
      model: J(range(1, 6).map((k) => k + 'Q'), (I, s) => {
        if (!I('~CLR')) s.q = 0; else if (I.r('CLK')) s.q = num(I, range(1, 6).map((k) => k + 'D'));
        return put({}, range(1, 6).map((k) => k + 'Q'), s.q || 0);
      }) },
    { id: '74175', name: '74HC175', title: 'Quad D flip-flop with clear', cat: FF, layout: 'dip', pullup: ['~CLR'],
      desc: 'Four D flip-flops with true and inverted outputs, common rising-edge clock and active-low clear.',
      pins: ['~CLR', '1Q', '~1Q', '1D', '2D', '~2Q', '2Q', 'GND', 'CLK', '3Q', '~3Q', '3D', '4D', '~4Q', '4Q', 'VCC'],
      model: J(range(1, 4).flatMap((k) => [k + 'Q', `~${k}Q`]), (I, s) => {
        if (!I('~CLR')) s.q = 0; else if (I.r('CLK')) s.q = num(I, ['1D', '2D', '3D', '4D']);
        const o = put({}, ['1Q', '2Q', '3Q', '4Q'], s.q || 0);
        put(o, ['~1Q', '~2Q', '~3Q', '~4Q'], ~(s.q || 0));
        return o;
      }) },
    ...[['74160', 'Decade counter (sync.)', 10], ['74161', '4-bit binary counter (sync.)', 16]].map(([id, title, mod]) => ({
      id, name: '74HC' + id.slice(2), title, cat: FF, layout: 'func', w: 8, pullup: ['~CLR', '~LOAD'],
      desc: `Synchronous ${mod === 10 ? 'decade' : '4-bit binary'} counter. Count when ENP = ENT = 1; ~LOAD loads A–D on the clock edge; ~CLR clears asynchronously.`,
      pins: [F('CLK', 2, 'L'), F('~CLR', 1, 'L'), F('~LOAD', 9, 'L'), F('ENP', 7, 'L'), F('ENT', 10, 'L'), F('A', 3, 'L'), F('B', 4, 'L'), F('C', 5, 'L'), F('D', 6, 'L'),
        F('QA', 14, 'R'), F('QB', 13, 'R'), F('QC', 12, 'R'), F('QD', 11, 'R'), F('RCO', 15, 'R'), F('VCC', 16, 'T'), F('GND', 8, 'B')],
      model: { kind: 'builtin', fn: 'counter', arg: mod },
    })),
    ...[['74192', 'Up/down decade counter', 10], ['74193', 'Up/down 4-bit binary counter', 16]].map(([id, title, mod]) => ({
      id, name: '74HC' + id.slice(2), title, cat: FF, layout: 'func', w: 8, pullup: ['~LOAD'],
      desc: 'Counts up on a rising edge of UP (while DOWN is high) and down on a rising edge of DOWN (while UP is high). CLR (high) clears, ~LOAD loads A–D asynchronously.',
      pins: F2({ L: [['UP', 5], ['DOWN', 4], ['CLR', 14], ['~LOAD', 11], ['A', 15], ['B', 1], ['C', 10], ['D', 9]], R: [['QA', 3], ['QB', 2], ['QC', 6], ['QD', 7], ['~CO', 12], ['~BO', 13]], ...PWR }),
      model: J([...QS, '~CO', '~BO'], (I, s) => {
        let c = s.c || 0;
        if (I('CLR')) c = 0;
        else if (!I('~LOAD')) c = num(I, ['A', 'B', 'C', 'D']);
        else if (I.r('UP') && I('DOWN')) c = (c + 1) % mod;
        else if (I.r('DOWN') && I('UP')) c = (c + mod - 1) % mod;
        s.c = c;
        const o = put({}, QS, c);
        o['~CO'] = c === mod - 1 && !I('UP') ? 0 : 1;
        o['~BO'] = c === 0 && !I('DOWN') ? 0 : 1;
        return o;
      }),
    })),
    ...[['7490', 'Decade ripple counter', 5], ['7493', '4-bit binary ripple counter', 8]].map(([id, title, mod]) => ({
      id, name: '74LS' + id.slice(2), title, cat: FF, layout: 'func', w: 8,
      desc: `Falling-edge counter: CKA toggles QA; CKB drives a ÷${mod} counter on QB–QD. Connect QA to CKB for ÷${mod * 2}. R0(1)·R0(2) = 1 resets${mod === 5 ? ', R9(1)·R9(2) = 1 sets 9' : ''}. Note VCC on pin 5 and GND on pin 10.`,
      pins: F2({ L: [['CKA', 14], ['CKB', 1], ['R0(1)', 2], ['R0(2)', 3], ...(mod === 5 ? [['R9(1)', 6], ['R9(2)', 7]] : [])], R: [['QA', 12], ['QB', 9], ['QC', 8], ['QD', 11]], T: [['VCC', 5]], B: [['GND', 10]] }),
      model: J(QS, (I, s) => {
        let a = s.a || 0, b = s.b || 0;
        if (mod === 5 && I('R9(1)') && I('R9(2)')) { a = 1; b = 4; }
        else if (I('R0(1)') && I('R0(2)')) { a = 0; b = 0; }
        else { if (I.f('CKA')) a ^= 1; if (I.f('CKB')) b = (b + 1) % mod; }
        s.a = a; s.b = b;
        return put({ QA: a }, ['QB', 'QC', 'QD'], b);
      }),
    })),
    { id: '74164', name: '74HC164', title: '8-bit serial-in, parallel-out shift register', cat: FF, layout: 'func', w: 8, pullup: ['~CLR'],
      desc: 'On each rising CLK edge, A·B is shifted into QA and the register moves one step towards QH.',
      pins: F2({ L: [['A', 1], ['B', 2], ['CLK', 8], ['~CLR', 9]], R: [['QA', 3], ['QB', 4], ['QC', 5], ['QD', 6], ['QE', 10], ['QF', 11], ['QG', 12], ['QH', 13]], T: [['VCC', 14]], B: [['GND', 7]] }),
      model: J(['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'], (I, s) => {
        if (!I('~CLR')) s.q = 0; else if (I.r('CLK')) s.q = (((s.q || 0) << 1) | (I('A') & I('B'))) & 255;
        return put({}, ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'], s.q || 0);
      }) },
    { id: '74165', name: '74HC165', title: '8-bit parallel-in, serial-out shift register', cat: FF, layout: 'func', w: 8, pullup: ['SH/LD'],
      desc: 'SH/LD = 0 loads A–H. With SH/LD = 1 and INH = 0, each rising CLK edge shifts SER → A … → H. QH is the serial output.',
      pins: F2({ L: [['SH/LD', 1], ['CLK', 2], ['INH', 15], ['SER', 10], ['A', 11], ['B', 12], ['C', 13], ['D', 14], ['E', 3], ['F', 4], ['G', 5], ['H', 6]], R: [['QH', 9], ['~QH', 7]], ...PWR }),
      model: J(['QH', '~QH'], (I, s) => {
        if (!I('SH/LD')) s.q = num(I, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
        else if (I.r('CLK') && !I('INH')) s.q = (((s.q || 0) << 1) | I('SER')) & 255;
        const h = ((s.q || 0) >> 7) & 1;
        return { QH: h, '~QH': h ^ 1 };
      }) },
    { id: '74595', name: '74HC595', title: '8-bit shift register with output latch', cat: FF, layout: 'func', w: 8, pullup: ['~SRCLR'],
      desc: 'SER is shifted in on rising SRCLK; a rising RCLK copies the shift register to the outputs. ~OE = 1 makes QA–QH high-impedance. QH′ chains to the next 595.',
      pins: F2({ L: [['SER', 14], ['SRCLK', 11], ['RCLK', 12], ['~SRCLR', 10], ['~OE', 13]], R: [['QA', 15], ['QB', 1], ['QC', 2], ['QD', 3], ['QE', 4], ['QF', 5], ['QG', 6], ['QH', 7], ["QH'", 9]], ...PWR }),
      model: J(['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', "QH'"], (I, s) => {
        if (I.r('RCLK')) s.l = s.q || 0;
        if (!I('~SRCLR')) s.q = 0; else if (I.r('SRCLK')) s.q = (((s.q || 0) << 1) | I('SER')) & 255;
        const o = put({}, ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'], s.l || 0);
        if (I('~OE')) for (const k in o) o[k] = null;
        o["QH'"] = ((s.q || 0) >> 7) & 1;
        return o;
      }) },

    /* ---- 74xx decoders, multiplexers & arithmetic ---- */
    { id: '74138', name: '74HC138', title: '3-to-8 line decoder', cat: MSI, layout: 'func', w: 8, pullup: ['G1'],
      desc: 'Output ~Yn goes low for input CBA = n when G1 = 1 and ~G2A = ~G2B = 0.',
      pins: F2({ L: [['A', 1], ['B', 2], ['C', 3], ['G1', 6], ['~G2A', 4], ['~G2B', 5]], R: range(0, 7).map((k) => [`~Y${k}`, k === 7 ? 7 : 15 - k]), ...PWR }),
      model: J(range(0, 7).map((k) => `~Y${k}`), (I) => {
        const en = I('G1') && !I('~G2A') && !I('~G2B'), v = num(I, ['A', 'B', 'C']), o = {};
        for (let k = 0; k < 8; k++) o[`~Y${k}`] = en && v === k ? 0 : 1;
        return o;
      }) },
    { id: '74139', name: '74HC139', title: 'Dual 2-to-4 line decoder', cat: MSI, layout: 'func', w: 8,
      desc: 'Two independent decoders: ~nYk goes low for BA = k while ~nG is low.',
      pins: F2({ L: [['~1G', 1], ['1A', 2], ['1B', 3], ['~2G', 15], ['2A', 14], ['2B', 13]], R: [['~1Y0', 4], ['~1Y1', 5], ['~1Y2', 6], ['~1Y3', 7], ['~2Y0', 12], ['~2Y1', 11], ['~2Y2', 10], ['~2Y3', 9]], ...PWR }),
      model: J(['~1Y0', '~1Y1', '~1Y2', '~1Y3', '~2Y0', '~2Y1', '~2Y2', '~2Y3'], (I) => {
        const o = {};
        for (const n of [1, 2]) { const v = num(I, [`${n}A`, `${n}B`]), en = !I(`~${n}G`); for (let k = 0; k < 4; k++) o[`~${n}Y${k}`] = en && v === k ? 0 : 1; }
        return o;
      }) },
    { id: '74151', name: '74HC151', title: '8-to-1 multiplexer', cat: MSI, layout: 'func', w: 8,
      desc: 'Y = D(CBA) while ~G is low; ~W is the inverted output.',
      pins: F2({ L: [...range(0, 7).map((k) => [`D${k}`, [4, 3, 2, 1, 15, 14, 13, 12][k]]), ['A', 11], ['B', 10], ['C', 9], ['~G', 7]], R: [['Y', 5], ['~W', 6]], ...PWR }),
      model: J(['Y', '~W'], (I) => { const y = I('~G') ? 0 : I(`D${num(I, ['A', 'B', 'C'])}`); return { Y: y, '~W': y ^ 1 }; }) },
    { id: '74153', name: '74HC153', title: 'Dual 4-to-1 multiplexer', cat: MSI, layout: 'func', w: 8,
      desc: 'nY = nC(BA) while ~nG is low. A and B select both multiplexers.',
      pins: F2({ L: [['1C0', 6], ['1C1', 5], ['1C2', 4], ['1C3', 3], ['2C0', 10], ['2C1', 11], ['2C2', 12], ['2C3', 13], ['A', 14], ['B', 2], ['~1G', 1], ['~2G', 15]], R: [['1Y', 7], ['2Y', 9]], ...PWR }),
      model: J(['1Y', '2Y'], (I) => { const v = num(I, ['A', 'B']); return { '1Y': I('~1G') ? 0 : I(`1C${v}`), '2Y': I('~2G') ? 0 : I(`2C${v}`) }; }) },
    { id: '74157', name: '74HC157', title: 'Quad 2-to-1 multiplexer', cat: MSI, layout: 'func', w: 8,
      desc: 'nY = nA when S = 0 and nB when S = 1 (while ~G is low).',
      pins: F2({ L: [['1A', 2], ['1B', 3], ['2A', 5], ['2B', 6], ['3A', 11], ['3B', 10], ['4A', 14], ['4B', 13], ['S', 1], ['~G', 15]], R: [['1Y', 4], ['2Y', 7], ['3Y', 9], ['4Y', 12]], ...PWR }),
      model: J(['1Y', '2Y', '3Y', '4Y'], (I) => { const o = {}; for (let k = 1; k <= 4; k++) o[k + 'Y'] = I('~G') ? 0 : I(k + (I('S') ? 'B' : 'A')); return o; }) },
    { id: '7442', name: '74HC42', title: 'BCD to decimal decoder', cat: MSI, layout: 'func', w: 8,
      desc: 'Output ~Yn goes low for BCD input DCBA = n (0–9); all high for 10–15.',
      pins: F2({ L: [['A', 15], ['B', 14], ['C', 13], ['D', 12]], R: range(0, 9).map((k) => [`~Y${k}`, k < 7 ? k + 1 : k + 2]), ...PWR }),
      model: J(range(0, 9).map((k) => `~Y${k}`), (I) => { const v = num(I, ['A', 'B', 'C', 'D']), o = {}; for (let k = 0; k < 10; k++) o[`~Y${k}`] = v === k ? 0 : 1; return o; }) },
    { id: '7447', name: '74LS47', title: 'BCD to 7-segment decoder (active low)', cat: MSI, layout: 'func', w: 8, pullup: ['~LT', '~BI', '~RBI'],
      desc: 'Active-low outputs for common-anode displays. ~LT lights all segments, ~BI blanks, ~RBI blanks a leading zero.',
      pins: F2({ L: [['A', 7], ['B', 1], ['C', 2], ['D', 6], ['~LT', 3], ['~BI', 4], ['~RBI', 5]], R: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x, i) => ['~' + x, [13, 12, 11, 10, 9, 15, 14][i]]), ...PWR }),
      model: J(['~a', '~b', '~c', '~d', '~e', '~f', '~g'], (I) => {
        const v = num(I, ['A', 'B', 'C', 'D']);
        let pat = v < 10 ? SEG[v] : 0;
        if (v === 0 && !I('~RBI')) pat = 0;
        if (!I('~BI')) pat = 0;
        if (!I('~LT')) pat = 0x7f;
        const o = {};
        ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((x, i) => { o['~' + x] = (pat >> (6 - i)) & 1 ? 0 : 1; });
        return o;
      }) },
    { id: '7485', name: '74HC85', title: '4-bit magnitude comparator', cat: MSI, layout: 'func', w: 8, pullup: ['IA=B'],
      desc: 'Compares A3–A0 with B3–B0. Cascade inputs IA<B, IA=B, IA>B decide when A = B (tie IA=B high for a single chip).',
      pins: F2({ L: [['A0', 10], ['A1', 12], ['A2', 13], ['A3', 15], ['B0', 9], ['B1', 11], ['B2', 14], ['B3', 1], ['IA<B', 2], ['IA=B', 3], ['IA>B', 4]], R: [['OA<B', 7], ['OA=B', 6], ['OA>B', 5]], ...PWR }),
      model: J(['OA<B', 'OA=B', 'OA>B'], (I) => {
        const a = num(I, ['A0', 'A1', 'A2', 'A3']), b = num(I, ['B0', 'B1', 'B2', 'B3']);
        if (a > b) return { 'OA<B': 0, 'OA=B': 0, 'OA>B': 1 };
        if (a < b) return { 'OA<B': 1, 'OA=B': 0, 'OA>B': 0 };
        if (I('IA=B')) return { 'OA<B': 0, 'OA=B': 1, 'OA>B': 0 };
        return { 'OA<B': I('IA>B') ? 0 : 1, 'OA=B': 0, 'OA>B': I('IA<B') ? 0 : 1 };
      }) },
    { id: '74283', name: '74HC283', title: '4-bit binary full adder', cat: MSI, layout: 'func', w: 8,
      desc: 'S4–S1 + C4 = A4–A1 + B4–B1 + C0.',
      pins: F2({ L: [['A1', 5], ['A2', 3], ['A3', 14], ['A4', 12], ['B1', 6], ['B2', 2], ['B3', 15], ['B4', 11], ['C0', 7]], R: [['S1', 4], ['S2', 1], ['S3', 13], ['S4', 10], ['C4', 9]], ...PWR }),
      model: J(['S1', 'S2', 'S3', 'S4', 'C4'], (I) => put({}, ['S1', 'S2', 'S3', 'S4', 'C4'], num(I, ['A1', 'A2', 'A3', 'A4']) + num(I, ['B1', 'B2', 'B3', 'B4']) + I('C0'))) },

    /* ---- 4000-series CMOS ---- */
    gate('4001', 'Quad 2-input NOR', CMOS14, quad('|', true), CM, 'CD4001'),
    gate('4011', 'Quad 2-input NAND', CMOS14, quad('&', true), CM, 'CD4011'),
    gate('4069', 'Hex inverter', ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'VSS', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VDD'], hex(true), CM, 'CD4069'),
    gate('4070', 'Quad 2-input XOR', CMOS14, quad('^'), CM, 'CD4070'),
    gate('4071', 'Quad 2-input OR', CMOS14, quad('|'), CM, 'CD4071'),
    gate('4081', 'Quad 2-input AND', CMOS14, quad('&'), CM, 'CD4081'),
    { id: '4013', name: 'CD4013', title: 'Dual D flip-flop', cat: CM, layout: 'dip',
      desc: 'Rising-edge D flip-flops with active-high SET and RESET.',
      pins: ['Q1', '~Q1', 'CLK1', 'RST1', 'D1', 'SET1', 'VSS', 'SET2', 'D2', 'RST2', 'CLK2', '~Q2', 'Q2', 'VDD'],
      model: J(['Q1', '~Q1', 'Q2', '~Q2'], (I, s) => {
        const o = {};
        for (const k of [1, 2]) {
          const set = I('SET' + k), rst = I('RST' + k);
          let q = s[k] || 0;
          if (set && rst) { o['Q' + k] = 1; o['~Q' + k] = 1; continue; }
          if (set) q = 1; else if (rst) q = 0; else if (I.r('CLK' + k)) q = I('D' + k);
          s[k] = q; o['Q' + k] = q; o['~Q' + k] = q ^ 1;
        }
        return o;
      }) },
    { id: '4017', name: 'CD4017', title: 'Decade counter / divider (1-of-10)', cat: CM, layout: 'func', w: 8,
      desc: 'One of Q0–Q9 is high; advances on rising CLK while INH = 0. RST = 1 returns to Q0. CO is high for counts 0–4.',
      pins: F2({ L: [['CLK', 14], ['INH', 13], ['RST', 15]], R: [...range(0, 9).map((k) => [`Q${k}`, [3, 2, 4, 7, 10, 1, 5, 6, 9, 11][k]]), ['CO', 12]], T: [['VDD', 16]], B: [['VSS', 8]] }),
      model: J([...range(0, 9).map((k) => `Q${k}`), 'CO'], (I, s) => {
        let c = s.c || 0;
        if (I('RST')) c = 0; else if (I.r('CLK') && !I('INH')) c = (c + 1) % 10;
        s.c = c;
        const o = { CO: c < 5 ? 1 : 0 };
        for (let k = 0; k < 10; k++) o[`Q${k}`] = c === k ? 1 : 0;
        return o;
      }) },
    { id: '4511', name: 'CD4511', title: 'BCD to 7-segment decoder', cat: CM, layout: 'func', w: 8, pullup: ['~LT', '~BI'],
      desc: 'Latch/decoder/driver. LE = 0: transparent. ~LT = 0: lamp test, ~BI = 0: blank.',
      pins: [F('A', 7, 'L'), F('B', 1, 'L'), F('C', 2, 'L'), F('D', 6, 'L'), F('LE', 5, 'L'), F('~LT', 3, 'L'), F('~BI', 4, 'L'),
        F('a', 13, 'R'), F('b', 12, 'R'), F('c', 11, 'R'), F('d', 10, 'R'), F('e', 9, 'R'), F('f', 15, 'R'), F('g', 14, 'R'), F('VDD', 16, 'T'), F('VSS', 8, 'B')],
      model: { kind: 'builtin', fn: 'cd4511' } },
  ];

  /* ---------------- Registry ---------------- */
  const std = new Map(STD.map((d) => [d.id, d]));
  const custom = new Map();
  const LS_KEY = 'elab.customICs';

  function get(id) { return std.get(id) || custom.get(id) || null; }

  /** Normalised pin list [{name, num, side}] (index = node index). */
  function pins(def) {
    if (def._pins) return def._pins;
    let out;
    if (def.layout === 'dip') {
      const n = def.pins.length, half = n / 2;
      out = def.pins.map((name, i) => ({ name, num: i + 1, side: i < half ? 'L' : 'R' }));
    } else out = def.pins.map((p, i) => ({ name: p.name, num: p.num ?? i + 1, side: p.side || 'L' }));
    Object.defineProperty(def, '_pins', { value: out, configurable: true });
    return out;
  }

  /** Geometry in local grid units: pins with positions, body rectangle, bounding box. */
  function geom(def) {
    if (def._geom) return def._geom;
    const ps = pins(def).map((p) => Object.assign({}, p));
    let body;
    if (def.layout === 'dip') {
      const half = ps.length / 2;
      ps.forEach((p, i) => {
        if (i < half) { p.x = -6; p.y = -(half - 1) + 2 * i; }
        else { p.x = 6; p.y = half - 1 - 2 * (i - half); }
      });
      body = { x1: -4, y1: -half, x2: 4, y2: half };
    } else {
      const S = { L: [], R: [], T: [], B: [] };
      ps.forEach((p) => S[p.side].push(p));
      const rows = Math.max(S.L.length, S.R.length, 1);
      const len = (a) => a.reduce((m, p) => Math.max(m, p.name.replace('~', '').length), 0);
      let w = def.w;
      if (!w) {
        const need = (len(S.L) + len(S.R)) * 0.42 + Math.max(String(def.name).length * 0.5, 1) + 1.6;
        w = Math.max(6, S.T.length * 2 + 2, S.B.length * 2 + 2, Math.ceil(need / 2) * 2);
      }
      const hw = w / 2;
      S.L.forEach((p, i) => { p.x = -hw - 2; p.y = -(rows - 1) + 2 * i; });
      S.R.forEach((p, i) => { p.x = hw + 2; p.y = -(rows - 1) + 2 * i; });
      const sp = (n) => (n > 1 && (n - 1) * 4 <= w - 2 ? 4 : 2);
      const y1 = -rows - (S.T.length ? 1 : 0), y2 = rows + (S.B.length ? 1 : 0);
      S.T.forEach((p, j) => { p.x = (j - (S.T.length - 1) / 2) * sp(S.T.length); p.y = y1 - 2; });
      S.B.forEach((p, j) => { p.x = (j - (S.B.length - 1) / 2) * sp(S.B.length); p.y = y2 + 2; });
      body = { x1: -hw, y1, x2: hw, y2 };
    }
    const box = { x1: body.x1, y1: body.y1, x2: body.x2, y2: body.y2 };
    for (const p of ps) { box.x1 = Math.min(box.x1, p.x); box.x2 = Math.max(box.x2, p.x); box.y1 = Math.min(box.y1, p.y); box.y2 = Math.max(box.y2, p.y); }
    const g = { pins: ps, body, box };
    Object.defineProperty(def, '_geom', { value: g, configurable: true });
    return g;
  }

  function program(def) {
    if (!def._prog) Object.defineProperty(def, '_prog', { value: compileLogic(def.model.code), configurable: true });
    return def._prog;
  }

  const isPower = (name) => /^(VCC|VDD|GND|VSS)$/i.test(name);

  /** Build simulation elements for an IC instance. ctx.sub(def, nodes) flattens sub-circuits. */
  function build(def, nodes, B, ctx) {
    const ps = pins(def);
    const P = {};
    ps.forEach((p, i) => { P[p.name] = i; });
    const m = def.model;
    if (m.kind === 'builtin') {
      const fn = m.arg != null ? BUILTIN[m.fn](m.arg) : BUILTIN[m.fn];
      fn(nodes, P, B);
    } else if (m.kind === 'logic') {
      const prog = program(def);
      const vcc = P.VCC ?? P.VDD, gnd = P.GND ?? P.VSS;
      const outs = [], ins = [];
      ps.forEach((p, i) => {
        if (isPower(p.name)) return;
        (prog.assigned.has(p.name) ? outs : ins).push(i);
      });
      B.behav(nodes, {
        vcc, gnd, outputs: outs, rOut: 25, vhigh: 5,
        init: prog.init,
        logic(c) {
          const inp = {};
          for (const i of ins) inp[ps[i].name] = c.bit(i);
          const env = prog.run(inp, c.state);
          for (const o of outs) c.out(o, env[ps[o].name]);
        },
      });
    } else if (m.kind === 'js') {
      let cur = null;
      const I = (nm) => cur.bit(P[nm]);
      I.r = (nm) => cur.rise(P[nm]);
      I.f = (nm) => cur.fall(P[nm]);
      I.v = (nm) => cur.v(P[nm]);
      B.behav(nodes, {
        vcc: P.VCC ?? P.VDD, gnd: P.GND ?? P.VSS, outputs: m.outs.map((nm) => P[nm]), rOut: 30,
        init: () => ({}),
        logic(c) {
          cur = c;
          I.vcc = c.vcc;
          const o = m.logic(I, c.state);
          for (const k in o) c.out(P[k], o[k]);
        },
      });
    } else if (m.kind === 'subckt') {
      ctx.sub(def, nodes);
    }
    // weak (100 kΩ) pull-ups keep unconnected control inputs inactive
    const vccPin = P.VCC ?? P.VDD;
    if (def.pullup && vccPin != null) for (const nm of def.pullup) if (P[nm] != null) B.R(nodes[P[nm]], nodes[vccPin], 1e5);
  }

  /* ---------------- Custom IC persistence ---------------- */
  function strip(def) {
    const d = {};
    for (const k of Object.keys(def)) if (!k.startsWith('_')) d[k] = def[k];
    return JSON.parse(JSON.stringify(d));
  }
  function register(def, persist = true) {
    custom.set(def.id, strip(def));
    if (persist) saveLocal();
    return custom.get(def.id);
  }
  function remove(id) { custom.delete(id); saveLocal(); }
  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify([...custom.values()].map(strip))); } catch (e) { /* storage unavailable */ }
  }
  function loadLocal() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      for (const d of arr) custom.set(d.id, d);
    } catch (e) { /* ignore */ }
  }

  /** Validate a custom logic IC; returns error string or null. */
  function validateLogic(inputs, outputs, code) {
    let prog;
    try { prog = compileLogic(code); } catch (e) { return e.message; }
    const known = new Set([...inputs, ...prog.assigned]);
    for (const id of prog.used) if (!known.has(id)) return `Unknown signal "${id}" (not an input and never assigned)`;
    for (const o of outputs) if (!prog.assigned.has(o)) return `Output "${o}" is never assigned`;
    for (const i of inputs) if (prog.assigned.has(i)) return `Input "${i}" cannot be assigned`;
    return null;
  }

  EL.ics = { STD, std, custom, get, pins, geom, build, compileLogic, register, remove, loadLocal, saveLocal, validateLogic, strip, SEG };
})(globalThis.EL = globalThis.EL || {});
