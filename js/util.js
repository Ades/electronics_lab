/* Electronics Lab – shared utilities */
(function (EL) {
  'use strict';

  const PREFIXES = [
    [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
    [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f'],
  ];

  /** Format a number with an SI prefix: fmt(0.0047, 'F') → "4.7 mF". */
  function fmt(v, unit = '', digits = 3, fixed = false) {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a < 1e-15) return (fixed ? (0).toFixed(Math.max(0, digits - 1)) : '0') + ' ' + unit;
    let m = 1e-15, p = 'f';
    for (const e of PREFIXES) if (a >= e[0] * 0.99995) { m = e[0]; p = e[1]; break; }
    let s = (v / m).toPrecision(digits);
    if (s.includes('e')) return fmt(Number(v.toPrecision(digits)) * 1.0000001, unit, digits, fixed);
    if (!fixed && s.includes('.')) s = s.replace(/\.?0+$/, '');
    return s + ' ' + p + unit;
  }

  const MULT = { T: 1e12, G: 1e9, M: 1e6, meg: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };

  /** Parse "4.7k", "4k7", "10u", "2.2 nF", "1meg", "1e-3" → number (NaN if invalid). */
  function parseValue(str) {
    if (typeof str === 'number') return str;
    const s = String(str).trim().replace(',', '.');
    if (!s) return NaN;
    let m = s.match(/^([-+]?\d+)([TGMkKmuµμnpfR])(\d+)\s*[A-Za-zΩ]*$/);
    if (m) return parseFloat(m[1] + '.' + m[3]) * (m[2] === 'R' ? 1 : MULT[m[2]]);
    m = s.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(meg|MEG|Meg|[TGMkKmuµμnpf])?/);
    if (!m) return NaN;
    let v = parseFloat(m[1]);
    if (m[2]) v *= MULT[m[2].length === 3 ? 'meg' : m[2]];
    return v;
  }

  /** Rotate a local grid point by rot·90° (clockwise on screen) after optional horizontal flip. */
  function rot(x, y, r, flip) {
    if (flip) x = -x;
    switch (r & 3) {
      case 0: return [x, y];
      case 1: return [-y, x];
      case 2: return [-x, -y];
      default: return [y, -x];
    }
  }
  /** Inverse of rot(). */
  function unrot(x, y, r, flip) {
    let p;
    switch (r & 3) {
      case 0: p = [x, y]; break;
      case 1: p = [y, -x]; break;
      case 2: p = [-x, -y]; break;
      default: p = [-y, x];
    }
    if (flip) p[0] = -p[0];
    return p;
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  let idCounter = 0;
  const uid = (p = 'c') => p + Date.now().toString(36).slice(-4) + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 5);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Smallest value from the 1-2-5 sequence that is >= v. */
  function nice125(v) {
    if (!(v > 0)) return 1;
    const e = Math.floor(Math.log10(v)), b = Math.pow(10, e), f = v / b;
    return (f <= 1.0001 ? 1 : f <= 2.0001 ? 2 : f <= 5.0001 ? 5 : 10) * b;
  }
  /** Largest value from the 1-2-5 sequence that is <= v. */
  function floor125(v) {
    if (!(v > 0)) return 1;
    const e = Math.floor(Math.log10(v)), b = Math.pow(10, e), f = v / b;
    return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * b;
  }

  function download(name, text, mime = 'application/json') {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

  EL.util = { fmt, parseValue, rot, unrot, clamp, uid, esc, nice125, floor125, download, clone };
})(globalThis.EL = globalThis.EL || {});
