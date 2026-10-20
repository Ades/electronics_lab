/* Electronics Lab – transient circuit simulator (Modified Nodal Analysis + Newton–Raphson) */
(function (EL) {
  'use strict';

  const VT = 0.025852; // thermal voltage at ~27 °C
  const GMIN = 1e-10; // tiny conductance from every node to ground keeps floating nodes solvable
  const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

  /** SPICE-style pn-junction voltage limiting, keeps exp() from exploding between Newton iterations. */
  function pnjlim(vnew, vold, vt, vcrit) {
    if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
      if (vold > 0) {
        const arg = 1 + (vnew - vold) / vt;
        vnew = arg > 0 ? vold + vt * Math.log(arg) : vcrit;
      } else {
        vnew = vt * Math.log(vnew / vt);
      }
    }
    return vnew;
  }

  /**
   * Engine: unknown vector x = [v1 … v(n-1), branch currents].
   * Node 0 is ground. KCL rows: Σ currents leaving node = 0, with source terms on the RHS.
   */
  class Engine {
    constructor(nodeCount, elements) {
      this.nn = nodeCount;
      this.els = elements;
      let nb = 0;
      for (const e of elements) if (e.nBranch) { e.br = nb; nb += e.nBranch; }
      this.nb = nb;
      const N = (this.N = nodeCount - 1 + nb);
      this.A = new Float64Array(N * N);
      this.b = new Float64Array(N);
      this.x = new Float64Array(N);
      this.xPrev = new Float64Array(N);
      this.sol = new Float64Array(N);
      this.t = 0;
      this.tNext = 0;
      this.dt = 1e-5;
      this.method = 'trap';
      this.nonlinear = elements.some((e) => e.nonlinear);
      this.error = null;
      this.nonConv = 0;
      this.steps = 0;
    }

    v(n) { return n > 0 ? this.x[n - 1] : 0; }
    vp(n) { return n > 0 ? this.xPrev[n - 1] : 0; }
    brI(k) { return this.x[this.nn - 1 + k]; }

    /* ---- stamping helpers ---- */
    cond(a, b, g) {
      const A = this.A, N = this.N;
      if (a > 0) A[(a - 1) * N + a - 1] += g;
      if (b > 0) A[(b - 1) * N + b - 1] += g;
      if (a > 0 && b > 0) { A[(a - 1) * N + b - 1] -= g; A[(b - 1) * N + a - 1] -= g; }
    }
    /** Constant current i flowing from node a through the element to node b. */
    cur(a, b, i) {
      if (a > 0) this.b[a - 1] -= i;
      if (b > 0) this.b[b - 1] += i;
    }
    /** Ideal voltage source on branch k: v(p) − v(n) = V; branch current flows p → n inside the source. */
    vsrc(k, p, n, V) {
      const r = this.nn - 1 + k, N = this.N, A = this.A;
      if (p > 0) { A[(p - 1) * N + r] += 1; A[r * N + p - 1] += 1; }
      if (n > 0) { A[(n - 1) * N + r] -= 1; A[r * N + n - 1] -= 1; }
      this.b[r] += V;
    }
    brRow(k, node, val) { if (node > 0) this.A[(this.nn - 1 + k) * this.N + node - 1] += val; }
    brRhs(k, val) { this.b[this.nn - 1 + k] += val; }
    nodeBr(node, k, val) { if (node > 0) this.A[(node - 1) * this.N + this.nn - 1 + k] += val; }
    /**
     * Linearised nonlinear device: f[k] = current leaving node[k] into the device at terminal voltages v0,
     * J[k][m] = ∂f[k]/∂v[m].
     */
    nl(nodes, f, J, v0) {
      const A = this.A, N = this.N;
      for (let k = 0; k < nodes.length; k++) {
        const rn = nodes[k];
        if (rn <= 0) continue;
        let c = f[k];
        const Jk = J[k];
        for (let m = 0; m < nodes.length; m++) {
          const g = Jk[m];
          if (!g) continue;
          c -= g * v0[m];
          if (nodes[m] > 0) A[(rn - 1) * N + nodes[m] - 1] += g;
        }
        this.b[rn - 1] -= c;
      }
    }

    _assemble() {
      const N = this.N;
      this.A.fill(0);
      this.b.fill(0);
      for (let i = 0; i < this.nn - 1; i++) this.A[i * N + i] = GMIN;
      for (const e of this.els) e.stamp(this);
    }

    /** Gaussian elimination with partial pivoting; result in this.sol. */
    _solve() {
      const N = this.N, A = this.A, b = this.b, x = this.sol;
      for (let k = 0; k < N; k++) {
        let p = k, max = Math.abs(A[k * N + k]);
        for (let i = k + 1; i < N; i++) {
          const v = Math.abs(A[i * N + k]);
          if (v > max) { max = v; p = i; }
        }
        if (max < 1e-18) return false;
        if (p !== k) {
          for (let j = k; j < N; j++) { const t = A[k * N + j]; A[k * N + j] = A[p * N + j]; A[p * N + j] = t; }
          const tb = b[k]; b[k] = b[p]; b[p] = tb;
        }
        const piv = A[k * N + k];
        for (let i = k + 1; i < N; i++) {
          const f = A[i * N + k] / piv;
          if (f === 0) continue;
          for (let j = k + 1; j < N; j++) A[i * N + j] -= f * A[k * N + j];
          b[i] -= f * b[k];
        }
      }
      for (let i = N - 1; i >= 0; i--) {
        let s = b[i];
        for (let j = i + 1; j < N; j++) s -= A[i * N + j] * x[j];
        x[i] = s / A[i * N + i];
      }
      return true;
    }

    /** Advance one time step. Returns false on fatal error (see this.error). */
    step() {
      if (this.error) return false;
      const N = this.N, nn1 = this.nn - 1;
      this.tNext = this.t + this.dt;
      for (const e of this.els) if (e.beginStep) e.beginStep(this);
      const maxIt = this.nonlinear ? 150 : 1;
      let conv = false;
      for (let it = 0; it < maxIt; it++) {
        this._assemble();
        if (!this._solve()) { this.error = 'singular'; return false; }
        conv = true;
        const x = this.x, s = this.sol;
        for (let i = 0; i < N; i++) {
          const nv = s[i];
          if (!(Math.abs(nv) < 1e15)) { this.error = 'diverged'; return false; }
          const tol = i < nn1 ? 1e-6 + 1e-4 * Math.abs(nv) : 1e-9 + 1e-4 * Math.abs(nv);
          if (Math.abs(nv - x[i]) > tol) conv = false;
        }
        x.set(s);
        if (!this.nonlinear) { conv = true; break; }
        if (conv && it > 0) break;
      }
      if (!conv) this.nonConv++;
      for (const e of this.els) if (e.accept) e.accept(this);
      this.xPrev.set(this.x);
      this.t = this.tNext;
      this.steps++;
      return true;
    }

    /** Solve one step for display purposes without advancing time or element history. */
    preview() {
      if (this.error) return;
      const saved = this.els.map((e) => (e.stateKeys ? e.stateKeys.map((k) => clone(e[k])) : null));
      const t = this.t, xp = this.xPrev.slice(), steps = this.steps, nc = this.nonConv;
      this.step();
      this.els.forEach((e, i) => { if (saved[i]) e.stateKeys.forEach((k, j) => { e[k] = saved[i][j]; }); });
      this.t = t;
      this.xPrev.set(xp);
      this.steps = steps;
      this.nonConv = nc;
    }
  }

  /* ======================= Elements ======================= */

  class Resistor {
    constructor(a, b, r) { this.n = [a, b]; this.R = Math.max(Math.abs(r), 1e-9); this.i = 0; }
    stamp(S) { S.cond(this.n[0], this.n[1], 1 / this.R); }
    accept(S) { this.i = (S.v(this.n[0]) - S.v(this.n[1])) / this.R; }
  }

  class Capacitor {
    constructor(a, b, c) { this.n = [a, b]; this.C = Math.max(c, 1e-18); this.vPrev = 0; this.iPrev = 0; this.i = 0; this.geq = 0; this.ieq = 0; }
    stamp(S) {
      if (S.method === 'be') { this.geq = this.C / S.dt; this.ieq = this.geq * this.vPrev; }
      else { this.geq = (2 * this.C) / S.dt; this.ieq = this.geq * this.vPrev + this.iPrev; }
      S.cond(this.n[0], this.n[1], this.geq);
      S.cur(this.n[0], this.n[1], -this.ieq);
    }
    accept(S) {
      const v = S.v(this.n[0]) - S.v(this.n[1]);
      this.i = this.geq * v - this.ieq;
      this.vPrev = v;
      this.iPrev = this.i;
    }
  }
  Capacitor.prototype.stateKeys = ['vPrev', 'iPrev', 'i'];

  class Inductor {
    constructor(a, b, l) { this.n = [a, b]; this.L = Math.max(l, 1e-15); this.iPrev = 0; this.vPrev = 0; this.i = 0; this.geq = 0; this.ieq = 0; }
    stamp(S) {
      if (S.method === 'be') { this.geq = S.dt / this.L; this.ieq = this.iPrev; }
      else { this.geq = S.dt / (2 * this.L); this.ieq = this.iPrev + this.geq * this.vPrev; }
      S.cond(this.n[0], this.n[1], this.geq);
      S.cur(this.n[0], this.n[1], this.ieq);
    }
    accept(S) {
      const v = S.v(this.n[0]) - S.v(this.n[1]);
      this.i = this.geq * v + this.ieq;
      this.vPrev = v;
      this.iPrev = this.i;
    }
  }
  Inductor.prototype.stateKeys = ['vPrev', 'iPrev', 'i'];

  class VSource {
    constructor(p, n, fn) { this.n = [p, n]; this.fn = fn; this.nBranch = 1; this.i = 0; this.V = 0; }
    stamp(S) { this.V = this.fn(S.tNext); S.vsrc(this.br, this.n[0], this.n[1], this.V); }
    accept(S) { this.i = S.brI(this.br); }
  }

  class ISource {
    constructor(from, to, fn) { this.n = [from, to]; this.fn = fn; this.i = 0; }
    stamp(S) { this.i = this.fn(S.tNext); S.cur(this.n[0], this.n[1], this.i); }
  }

  /** Shockley diode with optional reverse (Zener) breakdown. p: {vf (V @ 10 mA), n, vz} */
  class Diode {
    constructor(a, k, p = {}) {
      this.n = [a, k];
      this.nVt = (p.n || 1) * VT;
      const vf = p.vf ?? 0.7;
      this.Is = p.Is ?? 0.01 / Math.exp(vf / this.nVt);
      this.vzOff = p.vz > 0 ? Math.max(p.vz - vf, 0.1) : 0;
      this.vcrit = this.nVt * Math.log(this.nVt / (Math.SQRT2 * this.Is));
      this.vLast = 0; this.vd = 0; this.id = 0; this.gd = 0; this.i = 0;
      this.nonlinear = true;
    }
    stamp(S) {
      const a = this.n[0], k = this.n[1], nVt = this.nVt, Is = this.Is;
      let vd = S.v(a) - S.v(k);
      if (this.vzOff > 0 && vd < -this.vzOff * 0.5) {
        const vr = pnjlim(-vd - this.vzOff, -this.vLast - this.vzOff, nVt, this.vcrit);
        vd = -vr - this.vzOff;
      } else vd = pnjlim(vd, this.vLast, nVt, this.vcrit);
      this.vLast = vd;
      const e = Math.exp(Math.min(vd / nVt, 200));
      let id = Is * (e - 1), gd = (Is * e) / nVt;
      if (this.vzOff > 0) {
        const er = Math.exp(Math.min((-vd - this.vzOff) / nVt, 200));
        id -= Is * er;
        gd += (Is * er) / nVt;
      }
      gd += 1e-12;
      this.vd = vd; this.id = id; this.gd = gd;
      S.cond(a, k, gd);
      S.cur(a, k, id - gd * vd);
    }
    accept(S) { this.i = this.id + this.gd * (S.v(this.n[0]) - S.v(this.n[1]) - this.vd); }
  }
  Diode.prototype.stateKeys = ['vLast'];

  /** Ebers–Moll bipolar transistor (transport model). nodes: C, B, E; pol = +1 NPN, −1 PNP. */
  class BJT {
    constructor(c, b, e, pol, p = {}) {
      this.n = [c, b, e]; this.pol = pol;
      this.Is = p.Is || 1e-14; this.bf = p.beta || 100; this.br = p.betaR || 1;
      this.vcrit = VT * Math.log(VT / (Math.SQRT2 * this.Is));
      this.vbeL = 0; this.vbcL = 0; this.ic = 0; this.ib = 0; this.ie = 0;
      this.nonlinear = true;
      this.J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    }
    stamp(S) {
      const [nc, nb, ne] = this.n, p = this.pol, Is = this.Is, bf = this.bf, br = this.br;
      const vc = S.v(nc), vb = S.v(nb), ve = S.v(ne);
      let vbe = pnjlim(p * (vb - ve), this.vbeL, VT, this.vcrit);
      let vbc = pnjlim(p * (vb - vc), this.vbcL, VT, this.vcrit);
      this.vbeL = vbe; this.vbcL = vbc;
      const ebe = Math.exp(Math.min(vbe / VT, 200)), ebc = Math.exp(Math.min(vbc / VT, 200));
      const If = Is * (ebe - 1), Ir = Is * (ebc - 1);
      const gf = (Is * ebe) / VT + 1e-12, gr = (Is * ebc) / VT + 1e-12;
      const Ic = If - Ir - Ir / br, Ib = If / bf + Ir / br;
      const dIc_be = gf, dIc_bc = -gr - gr / br, dIb_be = gf / bf, dIb_bc = gr / br;
      const J = this.J;
      // ∂/∂[vc, vb, ve] of p·I (independent of polarity)
      J[0][0] = -dIc_bc; J[0][1] = dIc_be + dIc_bc; J[0][2] = -dIc_be;
      J[1][0] = -dIb_bc; J[1][1] = dIb_be + dIb_bc; J[1][2] = -dIb_be;
      J[2][0] = -(J[0][0] + J[1][0]); J[2][1] = -(J[0][1] + J[1][1]); J[2][2] = -(J[0][2] + J[1][2]);
      const vb0 = ve + p * vbe, vc0 = vb0 - p * vbc;
      this.ic = p * Ic; this.ib = p * Ib; this.ie = -(this.ic + this.ib);
      S.nl(this.n, [this.ic, this.ib, this.ie], J, [vc0, vb0, ve]);
    }
  }
  BJT.prototype.stateKeys = ['vbeL', 'vbcL'];

  /** Level-1 (square-law) MOSFET. nodes: D, G, S; pol = +1 NMOS, −1 PMOS. */
  class MOSFET {
    constructor(d, g, s, pol, p = {}) {
      this.n = [d, g, s]; this.pol = pol;
      this.vth = Math.abs(p.vth ?? 1.5); this.k = p.k ?? 0.05; this.lambda = p.lambda ?? 0.01;
      this.vgsL = 0; this.vdsL = 0; this.id = 0; this.nonlinear = true;
    }
    stamp(S) {
      const [nd, ng, ns] = this.n, p = this.pol;
      const vd = S.v(nd), vg = S.v(ng), vs = S.v(ns);
      let vgs = p * (vg - vs), vds = p * (vd - vs);
      // simple step limiting
      if (vgs - this.vgsL > 0.5) vgs = this.vgsL + 0.5; else if (vgs - this.vgsL < -0.5) vgs = this.vgsL - 0.5;
      if (vds - this.vdsL > 2) vds = this.vdsL + 2; else if (vds - this.vdsL < -2) vds = this.vdsL - 2;
      this.vgsL = vgs; this.vdsL = vds;
      let dN = nd, sN = ns, vgsE = vgs, vdsE = vds, sign = 1;
      if (vds < 0) { dN = ns; sN = nd; vgsE = vgs - vds; vdsE = -vds; sign = -1; }
      const vov = vgsE - this.vth, K = this.k, lam = this.lambda;
      let Id = 0, gm = 0, gds = 0;
      if (vov > 0) {
        if (vdsE < vov) {
          const base = vov * vdsE - (vdsE * vdsE) / 2;
          Id = K * base * (1 + lam * vdsE);
          gm = K * vdsE * (1 + lam * vdsE);
          gds = K * (vov - vdsE) * (1 + lam * vdsE) + K * base * lam;
        } else {
          Id = (K / 2) * vov * vov * (1 + lam * vdsE);
          gm = K * vov * (1 + lam * vdsE);
          gds = (K / 2) * vov * vov * lam;
        }
      }
      gds += 1e-9;
      const vs0 = S.v(sN), vg0 = vs0 + p * vgsE, vd0 = vs0 + p * vdsE;
      const f = p * Id;
      S.nl([dN, ng, sN], [f, 0, -f], [[gds, gm, -gm - gds], [0, 0, 0], [-gds, -gm, gm + gds]], [vd0, vg0, vs0]);
      this.id = sign * f; // current into the drain terminal
    }
  }
  MOSFET.prototype.stateKeys = ['vgsL', 'vdsL'];

  /** Operational amplifier: smooth (tanh) saturation between rails, ideal output. nodes: +, −, out */
  class OpAmp {
    constructor(np, nn, out, o = {}) {
      this.n = [np, nn, out]; this.nBranch = 1; this.nonlinear = true;
      this.A = o.gain || 1e5; this.vhi = o.vhi ?? 15; this.vlo = o.vlo ?? -15;
      this.rails = o.rails || null; this.drop = o.drop || [0, 0];
      this.i = 0;
    }
    stamp(S) {
      const [np, nn, out] = this.n, k = this.br;
      let hi = this.vhi, lo = this.vlo;
      if (this.rails) {
        hi = S.v(this.rails[0]) - this.drop[0];
        lo = S.v(this.rails[1]) + this.drop[1];
        if (hi < lo) hi = lo;
      }
      const vd = S.v(np) - S.v(nn);
      const mid = (hi + lo) / 2, h = Math.max((hi - lo) / 2, 1e-6);
      const th = Math.tanh((this.A * vd) / h);
      const vo = mid + h * th, g = this.A * (1 - th * th);
      S.nodeBr(out, k, 1);
      S.brRow(k, out, 1);
      S.brRow(k, np, -g);
      S.brRow(k, nn, g);
      S.brRhs(k, vo - g * vd);
    }
    accept(S) { this.i = S.brI(this.br); }
  }

  /**
   * Behavioural digital/mixed block. Inputs are read from the previous accepted time step,
   * outputs are push-pull stages (R_out to VCC or GND).
   * o: {vcc, gnd: pin indices or null (implicit 0 V / vhigh), vhigh, outputs: [pin idx], rOut, init(), logic(ctx), stamp(S, self)}
   */
  class Behavioral {
    constructor(nodes, o) {
      this.n = nodes; this.o = o;
      this.outs = o.outputs || [];
      this.rOut = o.rOut || 25;
      this.state = o.init ? o.init() : {};
      this.levels = new Array(nodes.length).fill(null);
      this.prev = new Array(nodes.length).fill(0);
      this.bits = new Array(nodes.length).fill(0);
      this.powered = true;
      this.vcc = o.vhigh || 5;
      const self = this;
      this.ctx = {
        t: 0, vcc: 5, state: this.state, S: null,
        v: (i) => self.ctx.S.vp(self.n[i]) - self.vref,
        bit: (i) => self.bits[i],
        rise: (i) => (self.bits[i] && !self.prev[i] ? 1 : 0),
        fall: (i) => (!self.bits[i] && self.prev[i] ? 1 : 0),
        out: (i, lvl) => { self.levels[i] = lvl == null ? null : lvl ? 1 : 0; },
      };
      this.vref = 0;
    }
    beginStep(S) {
      const o = this.o, n = this.n;
      const vg = o.gnd != null ? S.vp(n[o.gnd]) : 0;
      this.vref = vg;
      this.vcc = o.vcc != null ? S.vp(n[o.vcc]) - vg : o.vhigh || 5;
      const wasPowered = this.powered;
      this.powered = this.vcc > 1.5;
      const th = this.vcc / 2;
      for (let i = 0; i < n.length; i++) this.bits[i] = S.vp(n[i]) - vg > th ? 1 : 0;
      if (this.powered && !wasPowered) for (let i = 0; i < n.length; i++) this.prev[i] = this.bits[i]; // no edges at power-up
      const ctx = this.ctx;
      ctx.S = S; ctx.t = S.tNext; ctx.vcc = this.vcc; ctx.state = this.state;
      if (this.powered) o.logic(ctx);
      for (let i = 0; i < n.length; i++) this.prev[i] = this.bits[i];
    }
    stamp(S) {
      const n = this.n, o = this.o, g = 1 / this.rOut;
      const gndN = o.gnd != null ? n[o.gnd] : 0;
      for (const i of this.outs) {
        const lvl = this.levels[i];
        if (!this.powered || lvl == null) { S.cond(n[i], gndN, 1e-8); continue; }
        if (lvl && o.vcc != null) S.cond(n[i], n[o.vcc], g);
        else if (lvl) { S.cond(n[i], gndN, g); S.cur(gndN, n[i], g * this.vcc); }
        else S.cond(n[i], gndN, g);
      }
      if (o.stamp) o.stamp(S, this);
    }
  }
  Behavioral.prototype.stateKeys = ['state', 'levels', 'prev', 'powered'];

  EL.sim = { Engine, Resistor, Capacitor, Inductor, VSource, ISource, Diode, BJT, MOSFET, OpAmp, Behavioral, VT, pnjlim };
})(globalThis.EL = globalThis.EL || {});
