import { Loader as K, FileLoader as ze, BufferGeometry as He, BufferAttribute as Ht, Box3 as We, Vector3 as U, Sphere as Ve, WebGLRenderer as Ye, LinearFilter as Wt, RGBAFormat as Xe, ByteType as qe, UnsignedByteType as Vt, ShortType as ke, UnsignedShortType as Je, IntType as $e, UnsignedIntType as Qe, HalfFloatType as Ze, FloatType as Yt, MathUtils as _, Material as pt, Data3DTexture as Ke, DataTexture as tn, Quaternion as en, Matrix4 as nn, Ray as rn, Vector2 as ue } from "three";
import { i as ye } from "./shared.js";
import { D as ns, Q as rs, S as ss, a as os, b as is, c as cs } from "./shared2.js";
import { E as Xt, G as V } from "./shared3.js";
import { a as hs } from "./shared3.js";
import { EXRLoader as de } from "three/addons/loaders/EXRLoader.js";
class sn extends K {
  load(t, n, r, o) {
    const s = new ze(this.manager);
    s.setResponseType("arraybuffer"), s.setRequestHeader(this.requestHeader), s.setPath(this.path), s.setWithCredentials(this.withCredentials), s.load(
      t,
      (i) => {
        ye(i instanceof ArrayBuffer);
        try {
          n(i);
        } catch (c) {
          o != null ? o(c) : console.error(c), this.manager.itemError(t);
        }
      },
      r,
      o
    );
  }
}
function Ar(e) {
  const { attributes: t, index: n, boundingBox: r, boundingSphere: o } = e;
  return [
    { attributes: t, index: n, boundingBox: r, boundingSphere: o },
    [
      ...Object.values(e.attributes).map(
        (s) => s.array.buffer
      ),
      e.index?.array.buffer
    ].filter((s) => s != null)
  ];
}
function gr(e, t = new He()) {
  for (const [n, r] of Object.entries(e.attributes))
    t.setAttribute(
      n,
      new Ht(
        r.array,
        r.itemSize,
        r.normalized
      )
    );
  if (t.index = e.index != null ? new Ht(
    e.index.array,
    e.index.itemSize,
    e.index.normalized
  ) : null, e.boundingBox != null) {
    const { min: n, max: r } = e.boundingBox;
    t.boundingBox = new We(
      new U(n.x, n.y, n.z),
      new U(r.x, r.y, r.z)
    );
  }
  if (e.boundingSphere != null) {
    const { center: n, radius: r } = e.boundingSphere;
    t.boundingSphere = new Ve(
      new U(n.x, n.y, n.z),
      r
    );
  }
  return t;
}
function wr(e) {
  return e instanceof Ye ? e.getContext().getExtension("OES_texture_float_linear") != null : e.backend.hasFeature?.("float32-filterable") ?? !1;
}
const on = "This is not an object", cn = "This is not a Float16Array object", qt = "This constructor is not a subclass of Float16Array", pe = "The constructor property value is not an object", an = "Species constructor didn't return TypedArray object", hn = "Derived constructor created TypedArray object which was too small length", J = "Attempting to access detached ArrayBuffer", Pt = "Cannot convert undefined or null to object", xt = "Cannot mix BigInt and other types, use explicit conversions", kt = "@@iterator property is not callable", Jt = "Reduce of empty array with no initial value", fn = "The comparison function must be either a function or undefined", St = "Offset is out of bounds";
function g(e) {
  return (t, ...n) => S(e, t, n);
}
function H(e, t) {
  return g(
    v(
      e,
      t
    ).get
  );
}
const {
  apply: S,
  construct: q,
  defineProperty: $t,
  get: mt,
  getOwnPropertyDescriptor: v,
  getPrototypeOf: tt,
  has: Nt,
  ownKeys: Ae,
  set: Qt,
  setPrototypeOf: ge
} = Reflect, ln = Proxy, {
  EPSILON: un,
  MAX_SAFE_INTEGER: Zt,
  isFinite: we,
  isNaN: G
} = Number, {
  iterator: x,
  species: yn,
  toStringTag: Mt,
  for: dn
} = Symbol, j = Object, {
  create: At,
  defineProperty: et,
  freeze: pn,
  is: Kt
} = j, Lt = j.prototype, An = (
  /** @type {any} */
  Lt.__lookupGetter__ ? g(
    /** @type {any} */
    Lt.__lookupGetter__
  ) : (e, t) => {
    if (e == null)
      throw w(
        Pt
      );
    let n = j(e);
    do {
      const r = v(n, t);
      if (r !== void 0)
        return R(r, "get") ? r.get : void 0;
    } while ((n = tt(n)) !== null);
  }
), R = (
  /** @type {any} */
  j.hasOwn || g(Lt.hasOwnProperty)
), Te = Array, be = Te.isArray, gt = Te.prototype, gn = g(gt.join), wn = g(gt.push), Tn = g(
  gt.toLocaleString
), Bt = gt[x], bn = g(Bt), {
  abs: Sn,
  trunc: Se
} = Math, wt = ArrayBuffer, mn = wt.isView, me = wt.prototype, _n = g(me.slice), En = H(me, "byteLength"), Rt = typeof SharedArrayBuffer < "u" ? SharedArrayBuffer : null, In = Rt && H(Rt.prototype, "byteLength"), Ft = tt(Uint8Array), On = Ft.from, b = Ft.prototype, Pn = b[x], xn = g(b.keys), Nn = g(
  b.values
), Ln = g(
  b.entries
), Rn = g(b.set), te = g(
  b.reverse
), Un = g(b.fill), Cn = g(
  b.copyWithin
), ee = g(b.sort), Y = g(b.slice), Mn = g(
  b.subarray
), T = H(
  b,
  "buffer"
), C = H(
  b,
  "byteOffset"
), y = H(
  b,
  "length"
), _e = H(
  b,
  Mt
), Bn = Uint8Array, m = Uint16Array, ne = (...e) => S(On, m, e), Dt = Uint32Array, Fn = Float32Array, M = tt([][x]()), Tt = g(M.next), Dn = g((function* () {
})().next), vn = tt(M), Gn = DataView.prototype, jn = g(
  Gn.getUint16
), w = TypeError, _t = RangeError, Ee = WeakSet, Ie = Ee.prototype, zn = g(Ie.add), Hn = g(Ie.has), bt = WeakMap, vt = bt.prototype, at = g(vt.get), Wn = g(vt.has), Gt = g(vt.set), Oe = new bt(), Vn = At(null, {
  next: {
    value: function() {
      const t = at(Oe, this);
      return Tt(t);
    }
  },
  [x]: {
    value: function() {
      return this;
    }
  }
});
function k(e) {
  if (e[x] === Bt && M.next === Tt)
    return e;
  const t = At(Vn);
  return Gt(Oe, t, bn(e)), t;
}
const Pe = new bt(), xe = At(vn, {
  next: {
    value: function() {
      const t = at(Pe, this);
      return Dn(t);
    },
    writable: !0,
    configurable: !0
  }
});
for (const e of Ae(M))
  e !== "next" && et(xe, e, v(M, e));
function re(e) {
  const t = At(xe);
  return Gt(Pe, t, e), t;
}
function ht(e) {
  return e !== null && typeof e == "object" || typeof e == "function";
}
function se(e) {
  return e !== null && typeof e == "object";
}
function ft(e) {
  return _e(e) !== void 0;
}
function Ut(e) {
  const t = _e(e);
  return t === "BigInt64Array" || t === "BigUint64Array";
}
function Yn(e) {
  try {
    return be(e) ? !1 : (En(
      /** @type {any} */
      e
    ), !0);
  } catch {
    return !1;
  }
}
function Ne(e) {
  if (Rt === null)
    return !1;
  try {
    return In(
      /** @type {any} */
      e
    ), !0;
  } catch {
    return !1;
  }
}
function Xn(e) {
  return Yn(e) || Ne(e);
}
function oe(e) {
  return be(e) ? e[x] === Bt && M.next === Tt : !1;
}
function qn(e) {
  return ft(e) ? e[x] === Pn && M.next === Tt : !1;
}
function nt(e) {
  if (typeof e != "string")
    return !1;
  const t = +e;
  return e !== t + "" || !we(t) ? !1 : t === Se(t);
}
const lt = dn("__Float16Array__");
function kn(e) {
  if (!se(e))
    return !1;
  const t = tt(e);
  if (!se(t))
    return !1;
  const n = t.constructor;
  if (n === void 0)
    return !1;
  if (!ht(n))
    throw w(pe);
  return Nt(n, lt);
}
const Ct = 1 / un;
function Jn(e) {
  return e + Ct - Ct;
}
const Le = 6103515625e-14, $n = 65504, Re = 9765625e-10, ie = Re * Le, Qn = Re * Ct;
function Zn(e) {
  const t = +e;
  if (!we(t) || t === 0)
    return t;
  const n = t > 0 ? 1 : -1, r = Sn(t);
  if (r < Le)
    return n * Jn(r / ie) * ie;
  const o = (1 + Qn) * r, s = o - (o - r);
  return s > $n || G(s) ? n * (1 / 0) : n * s;
}
const Ue = new wt(4), Ce = new Fn(Ue), Me = new Dt(Ue), E = new m(512), I = new Bn(512);
for (let e = 0; e < 256; ++e) {
  const t = e - 127;
  t < -24 ? (E[e] = 0, E[e | 256] = 32768, I[e] = 24, I[e | 256] = 24) : t < -14 ? (E[e] = 1024 >> -t - 14, E[e | 256] = 1024 >> -t - 14 | 32768, I[e] = -t - 1, I[e | 256] = -t - 1) : t <= 15 ? (E[e] = t + 15 << 10, E[e | 256] = t + 15 << 10 | 32768, I[e] = 13, I[e | 256] = 13) : t < 128 ? (E[e] = 31744, E[e | 256] = 64512, I[e] = 24, I[e | 256] = 24) : (E[e] = 31744, E[e | 256] = 64512, I[e] = 13, I[e | 256] = 13);
}
function P(e) {
  Ce[0] = Zn(e);
  const t = Me[0], n = t >> 23 & 511;
  return E[n] + ((t & 8388607) >> I[n]);
}
const jt = new Dt(2048);
for (let e = 1; e < 1024; ++e) {
  let t = e << 13, n = 0;
  for (; (t & 8388608) === 0; )
    t <<= 1, n -= 8388608;
  t &= -8388609, n += 947912704, jt[e] = t | n;
}
for (let e = 1024; e < 2048; ++e)
  jt[e] = 939524096 + (e - 1024 << 13);
const W = new Dt(64);
for (let e = 1; e < 31; ++e)
  W[e] = e << 23;
W[31] = 1199570944;
W[32] = 2147483648;
for (let e = 33; e < 63; ++e)
  W[e] = 2147483648 + (e - 32 << 23);
W[63] = 3347054592;
const Be = new m(64);
for (let e = 1; e < 64; ++e)
  e !== 32 && (Be[e] = 1024);
function p(e) {
  const t = e >> 10;
  return Me[0] = jt[Be[t] + (e & 1023)] + W[t], Ce[0];
}
function L(e) {
  const t = +e;
  return G(t) || t === 0 ? 0 : Se(t);
}
function Et(e) {
  const t = L(e);
  return t < 0 ? 0 : t < Zt ? t : Zt;
}
function rt(e, t) {
  if (!ht(e))
    throw w(on);
  const n = e.constructor;
  if (n === void 0)
    return t;
  if (!ht(n))
    throw w(pe);
  const r = n[yn];
  return r ?? t;
}
function $(e) {
  if (Ne(e))
    return !1;
  try {
    return _n(e, 0, 0), !1;
  } catch {
  }
  return !0;
}
function ce(e, t) {
  const n = G(e), r = G(t);
  if (n && r)
    return 0;
  if (n)
    return 1;
  if (r || e < t)
    return -1;
  if (e > t)
    return 1;
  if (e === 0 && t === 0) {
    const o = Kt(e, 0), s = Kt(t, 0);
    if (!o && s)
      return -1;
    if (o && !s)
      return 1;
  }
  return 0;
}
const zt = 2, ut = new bt();
function D(e) {
  return Wn(ut, e) || !mn(e) && kn(e);
}
function u(e) {
  if (!D(e))
    throw w(cn);
}
function st(e, t) {
  const n = D(e), r = ft(e);
  if (!n && !r)
    throw w(an);
  if (typeof t == "number") {
    let o;
    if (n) {
      const s = l(e);
      o = y(s);
    } else
      o = y(e);
    if (o < t)
      throw w(
        hn
      );
  }
  if (Ut(e))
    throw w(xt);
}
function l(e) {
  const t = at(ut, e);
  if (t !== void 0) {
    const o = T(t);
    if ($(o))
      throw w(J);
    return t;
  }
  const n = (
    /** @type {any} */
    e.buffer
  );
  if ($(n))
    throw w(J);
  const r = q(A, [
    n,
    /** @type {any} */
    e.byteOffset,
    /** @type {any} */
    e.length
  ], e.constructor);
  return at(ut, r);
}
function ae(e) {
  const t = y(e), n = [];
  for (let r = 0; r < t; ++r)
    n[r] = p(e[r]);
  return n;
}
const Fe = new Ee();
for (const e of Ae(b)) {
  if (e === Mt)
    continue;
  const t = v(b, e);
  R(t, "get") && typeof t.get == "function" && zn(Fe, t.get);
}
const Kn = pn(
  /** @type {ProxyHandler<Float16BitsArray>} */
  {
    get(e, t, n) {
      return nt(t) && R(e, t) ? p(mt(e, t)) : Hn(Fe, An(e, t)) ? mt(e, t) : mt(e, t, n);
    },
    set(e, t, n, r) {
      return nt(t) && R(e, t) ? Qt(e, t, P(n)) : Qt(e, t, n, r);
    },
    getOwnPropertyDescriptor(e, t) {
      if (nt(t) && R(e, t)) {
        const n = v(e, t);
        return n.value = p(n.value), n;
      }
      return v(e, t);
    },
    defineProperty(e, t, n) {
      return nt(t) && R(e, t) && R(n, "value") && (n.value = P(n.value)), $t(e, t, n);
    }
  }
);
class A {
  /** @see https://tc39.es/ecma262/#sec-typedarray */
  constructor(t, n, r) {
    let o;
    if (D(t))
      o = q(m, [l(t)], new.target);
    else if (ht(t) && !Xn(t)) {
      let i, c;
      if (ft(t)) {
        i = t, c = y(t);
        const a = T(t);
        if ($(a))
          throw w(J);
        if (Ut(t))
          throw w(xt);
        const h = new wt(
          c * zt
        );
        o = q(m, [h], new.target);
      } else {
        const a = t[x];
        if (a != null && typeof a != "function")
          throw w(kt);
        a != null ? oe(t) ? (i = t, c = t.length) : (i = [.../** @type {Iterable<unknown>} */
        t], c = i.length) : (i = /** @type {ArrayLike<unknown>} */
        t, c = Et(i.length)), o = q(m, [c], new.target);
      }
      for (let a = 0; a < c; ++a)
        o[a] = P(i[a]);
    } else
      o = q(m, arguments, new.target);
    const s = (
      /** @type {any} */
      new ln(o, Kn)
    );
    return Gt(ut, s, o), s;
  }
  /**
   * limitation: `Object.getOwnPropertyNames(Float16Array)` or `Reflect.ownKeys(Float16Array)` include this key
   * @see https://tc39.es/ecma262/#sec-%typedarray%.from
   */
  static from(t, ...n) {
    const r = this;
    if (!Nt(r, lt))
      throw w(
        qt
      );
    if (r === A) {
      if (D(t) && n.length === 0) {
        const f = l(t), d = new m(
          T(f),
          C(f),
          y(f)
        );
        return new A(
          T(Y(d))
        );
      }
      if (n.length === 0)
        return new A(
          T(
            ne(t, P)
          )
        );
      const a = n[0], h = n[1];
      return new A(
        T(
          ne(t, function(f, ...d) {
            return P(
              S(a, this, [f, ...k(d)])
            );
          }, h)
        )
      );
    }
    let o, s;
    const i = t[x];
    if (i != null && typeof i != "function")
      throw w(kt);
    if (i != null)
      oe(t) ? (o = t, s = t.length) : qn(t) ? (o = t, s = y(t)) : (o = [...t], s = o.length);
    else {
      if (t == null)
        throw w(
          Pt
        );
      o = j(t), s = Et(o.length);
    }
    const c = new r(s);
    if (n.length === 0)
      for (let a = 0; a < s; ++a)
        c[a] = /** @type {number} */
        o[a];
    else {
      const a = n[0], h = n[1];
      for (let f = 0; f < s; ++f)
        c[f] = S(a, h, [o[f], f]);
    }
    return c;
  }
  /**
   * limitation: `Object.getOwnPropertyNames(Float16Array)` or `Reflect.ownKeys(Float16Array)` include this key
   * @see https://tc39.es/ecma262/#sec-%typedarray%.of
   */
  static of(...t) {
    const n = this;
    if (!Nt(n, lt))
      throw w(
        qt
      );
    const r = t.length;
    if (n === A) {
      const s = new A(r), i = l(s);
      for (let c = 0; c < r; ++c)
        i[c] = P(t[c]);
      return s;
    }
    const o = new n(r);
    for (let s = 0; s < r; ++s)
      o[s] = t[s];
    return o;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.keys */
  keys() {
    u(this);
    const t = l(this);
    return xn(t);
  }
  /**
   * limitation: returns a object whose prototype is not `%ArrayIteratorPrototype%`
   * @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.values
   */
  values() {
    u(this);
    const t = l(this);
    return re((function* () {
      for (const n of Nn(t))
        yield p(n);
    })());
  }
  /**
   * limitation: returns a object whose prototype is not `%ArrayIteratorPrototype%`
   * @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.entries
   */
  entries() {
    u(this);
    const t = l(this);
    return re((function* () {
      for (const [n, r] of Ln(t))
        yield (
          /** @type {[number, number]} */
          [n, p(r)]
        );
    })());
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.at */
  at(t) {
    u(this);
    const n = l(this), r = y(n), o = L(t), s = o >= 0 ? o : r + o;
    if (!(s < 0 || s >= r))
      return p(n[s]);
  }
  /** @see https://tc39.es/proposal-change-array-by-copy/#sec-%typedarray%.prototype.with */
  with(t, n) {
    u(this);
    const r = l(this), o = y(r), s = L(t), i = s >= 0 ? s : o + s, c = +n;
    if (i < 0 || i >= o)
      throw _t(St);
    const a = new m(
      T(r),
      C(r),
      y(r)
    ), h = new A(
      T(
        Y(a)
      )
    ), f = l(h);
    return f[i] = P(c), h;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.map */
  map(t, ...n) {
    u(this);
    const r = l(this), o = y(r), s = n[0], i = rt(r, A);
    if (i === A) {
      const a = new A(o), h = l(a);
      for (let f = 0; f < o; ++f) {
        const d = p(r[f]);
        h[f] = P(
          S(t, s, [d, f, this])
        );
      }
      return a;
    }
    const c = new i(o);
    st(c, o);
    for (let a = 0; a < o; ++a) {
      const h = p(r[a]);
      c[a] = S(t, s, [h, a, this]);
    }
    return (
      /** @type {any} */
      c
    );
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.filter */
  filter(t, ...n) {
    u(this);
    const r = l(this), o = y(r), s = n[0], i = [];
    for (let h = 0; h < o; ++h) {
      const f = p(r[h]);
      S(t, s, [f, h, this]) && wn(i, f);
    }
    const c = rt(r, A), a = new c(i);
    return st(a), /** @type {any} */
    a;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.reduce */
  reduce(t, ...n) {
    u(this);
    const r = l(this), o = y(r);
    if (o === 0 && n.length === 0)
      throw w(Jt);
    let s, i;
    n.length === 0 ? (s = p(r[0]), i = 1) : (s = n[0], i = 0);
    for (let c = i; c < o; ++c)
      s = t(
        s,
        p(r[c]),
        c,
        this
      );
    return s;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.reduceright */
  reduceRight(t, ...n) {
    u(this);
    const r = l(this), o = y(r);
    if (o === 0 && n.length === 0)
      throw w(Jt);
    let s, i;
    n.length === 0 ? (s = p(r[o - 1]), i = o - 2) : (s = n[0], i = o - 1);
    for (let c = i; c >= 0; --c)
      s = t(
        s,
        p(r[c]),
        c,
        this
      );
    return s;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.foreach */
  forEach(t, ...n) {
    u(this);
    const r = l(this), o = y(r), s = n[0];
    for (let i = 0; i < o; ++i)
      S(t, s, [
        p(r[i]),
        i,
        this
      ]);
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.find */
  find(t, ...n) {
    u(this);
    const r = l(this), o = y(r), s = n[0];
    for (let i = 0; i < o; ++i) {
      const c = p(r[i]);
      if (S(t, s, [c, i, this]))
        return c;
    }
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.findindex */
  findIndex(t, ...n) {
    u(this);
    const r = l(this), o = y(r), s = n[0];
    for (let i = 0; i < o; ++i) {
      const c = p(r[i]);
      if (S(t, s, [c, i, this]))
        return i;
    }
    return -1;
  }
  /** @see https://tc39.es/proposal-array-find-from-last/index.html#sec-%typedarray%.prototype.findlast */
  findLast(t, ...n) {
    u(this);
    const r = l(this), o = y(r), s = n[0];
    for (let i = o - 1; i >= 0; --i) {
      const c = p(r[i]);
      if (S(t, s, [c, i, this]))
        return c;
    }
  }
  /** @see https://tc39.es/proposal-array-find-from-last/index.html#sec-%typedarray%.prototype.findlastindex */
  findLastIndex(t, ...n) {
    u(this);
    const r = l(this), o = y(r), s = n[0];
    for (let i = o - 1; i >= 0; --i) {
      const c = p(r[i]);
      if (S(t, s, [c, i, this]))
        return i;
    }
    return -1;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.every */
  every(t, ...n) {
    u(this);
    const r = l(this), o = y(r), s = n[0];
    for (let i = 0; i < o; ++i)
      if (!S(t, s, [
        p(r[i]),
        i,
        this
      ]))
        return !1;
    return !0;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.some */
  some(t, ...n) {
    u(this);
    const r = l(this), o = y(r), s = n[0];
    for (let i = 0; i < o; ++i)
      if (S(t, s, [
        p(r[i]),
        i,
        this
      ]))
        return !0;
    return !1;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.set */
  set(t, ...n) {
    u(this);
    const r = l(this), o = L(n[0]);
    if (o < 0)
      throw _t(St);
    if (t == null)
      throw w(
        Pt
      );
    if (Ut(t))
      throw w(
        xt
      );
    if (D(t))
      return Rn(
        l(this),
        l(t),
        o
      );
    if (ft(t)) {
      const a = T(t);
      if ($(a))
        throw w(J);
    }
    const s = y(r), i = j(t), c = Et(i.length);
    if (o === 1 / 0 || c + o > s)
      throw _t(St);
    for (let a = 0; a < c; ++a)
      r[a + o] = P(i[a]);
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.reverse */
  reverse() {
    u(this);
    const t = l(this);
    return te(t), this;
  }
  /** @see https://tc39.es/proposal-change-array-by-copy/#sec-%typedarray%.prototype.toReversed */
  toReversed() {
    u(this);
    const t = l(this), n = new m(
      T(t),
      C(t),
      y(t)
    ), r = new A(
      T(
        Y(n)
      )
    ), o = l(r);
    return te(o), r;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.fill */
  fill(t, ...n) {
    u(this);
    const r = l(this);
    return Un(
      r,
      P(t),
      ...k(n)
    ), this;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.copywithin */
  copyWithin(t, n, ...r) {
    u(this);
    const o = l(this);
    return Cn(o, t, n, ...k(r)), this;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.sort */
  sort(t) {
    u(this);
    const n = l(this), r = t !== void 0 ? t : ce;
    return ee(n, (o, s) => r(p(o), p(s))), this;
  }
  /** @see https://tc39.es/proposal-change-array-by-copy/#sec-%typedarray%.prototype.toSorted */
  toSorted(t) {
    u(this);
    const n = l(this);
    if (t !== void 0 && typeof t != "function")
      throw new w(fn);
    const r = t !== void 0 ? t : ce, o = new m(
      T(n),
      C(n),
      y(n)
    ), s = new A(
      T(
        Y(o)
      )
    ), i = l(s);
    return ee(i, (c, a) => r(p(c), p(a))), s;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.slice */
  slice(t, n) {
    u(this);
    const r = l(this), o = rt(r, A);
    if (o === A) {
      const je = new m(
        T(r),
        C(r),
        y(r)
      );
      return new A(
        T(
          Y(je, t, n)
        )
      );
    }
    const s = y(r), i = L(t), c = n === void 0 ? s : L(n);
    let a;
    i === -1 / 0 ? a = 0 : i < 0 ? a = s + i > 0 ? s + i : 0 : a = s < i ? s : i;
    let h;
    c === -1 / 0 ? h = 0 : c < 0 ? h = s + c > 0 ? s + c : 0 : h = s < c ? s : c;
    const f = h - a > 0 ? h - a : 0, d = new o(f);
    if (st(d, f), f === 0)
      return d;
    const O = T(r);
    if ($(O))
      throw w(J);
    let F = 0;
    for (; a < h; )
      d[F] = p(r[a]), ++a, ++F;
    return (
      /** @type {any} */
      d
    );
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.subarray */
  subarray(t, n) {
    u(this);
    const r = l(this), o = rt(r, A), s = new m(
      T(r),
      C(r),
      y(r)
    ), i = Mn(s, t, n), c = new o(
      T(i),
      C(i),
      y(i)
    );
    return st(c), /** @type {any} */
    c;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.indexof */
  indexOf(t, ...n) {
    u(this);
    const r = l(this), o = y(r);
    let s = L(n[0]);
    if (s === 1 / 0)
      return -1;
    s < 0 && (s += o, s < 0 && (s = 0));
    for (let i = s; i < o; ++i)
      if (R(r, i) && p(r[i]) === t)
        return i;
    return -1;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.lastindexof */
  lastIndexOf(t, ...n) {
    u(this);
    const r = l(this), o = y(r);
    let s = n.length >= 1 ? L(n[0]) : o - 1;
    if (s === -1 / 0)
      return -1;
    s >= 0 ? s = s < o - 1 ? s : o - 1 : s += o;
    for (let i = s; i >= 0; --i)
      if (R(r, i) && p(r[i]) === t)
        return i;
    return -1;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.includes */
  includes(t, ...n) {
    u(this);
    const r = l(this), o = y(r);
    let s = L(n[0]);
    if (s === 1 / 0)
      return !1;
    s < 0 && (s += o, s < 0 && (s = 0));
    const i = G(t);
    for (let c = s; c < o; ++c) {
      const a = p(r[c]);
      if (i && G(a) || a === t)
        return !0;
    }
    return !1;
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.join */
  join(t) {
    u(this);
    const n = l(this), r = ae(n);
    return gn(r, t);
  }
  /** @see https://tc39.es/ecma262/#sec-%typedarray%.prototype.tolocalestring */
  toLocaleString(...t) {
    u(this);
    const n = l(this), r = ae(n);
    return Tn(r, ...k(t));
  }
  /** @see https://tc39.es/ecma262/#sec-get-%typedarray%.prototype-@@tostringtag */
  get [Mt]() {
    if (D(this))
      return (
        /** @type {any} */
        "Float16Array"
      );
  }
}
et(A, "BYTES_PER_ELEMENT", {
  value: zt
});
et(A, lt, {});
ge(A, Ft);
const yt = A.prototype;
et(yt, "BYTES_PER_ELEMENT", {
  value: zt
});
et(yt, x, {
  value: yt.values,
  writable: !0,
  configurable: !0
});
ge(yt, b);
function tr(e, t, ...n) {
  return p(
    jn(e, t, ...k(n))
  );
}
function Tr(e) {
  return e instanceof Int8Array || e instanceof Uint8Array || e instanceof Uint8ClampedArray || e instanceof Int16Array || e instanceof Uint16Array || e instanceof Int32Array || e instanceof Uint32Array || e instanceof A || e instanceof Float32Array || e instanceof Float64Array;
}
class er extends K {
  constructor(t, n) {
    super(n), this.parser = t;
  }
  load(t, n, r, o) {
    const s = new sn(this.manager);
    s.setRequestHeader(this.requestHeader), s.setPath(this.path), s.setWithCredentials(this.withCredentials), s.load(
      t,
      (i) => {
        try {
          n(this.parser(i));
        } catch (c) {
          o != null ? o(c) : console.error(c), this.manager.itemError(t);
        }
      },
      r,
      o
    );
  }
}
function nr(e) {
  const t = e instanceof Int8Array ? qe : e instanceof Uint8Array ? Vt : e instanceof Uint8ClampedArray ? Vt : e instanceof Int16Array ? ke : e instanceof Uint16Array ? Je : e instanceof Int32Array ? $e : e instanceof Uint32Array ? Qe : e instanceof A ? Ze : e instanceof Float32Array ? Yt : e instanceof Float64Array ? Yt : null;
  return ye(t != null), t;
}
class br extends K {
  constructor(t, n, r = {}, o) {
    super(o), this.textureClass = t, this.parser = n, this.options = {
      format: Xe,
      minFilter: Wt,
      magFilter: Wt,
      ...r
    };
  }
  load(t, n, r, o) {
    const s = new this.textureClass(), i = new er(this.parser, this.manager);
    return i.setRequestHeader(this.requestHeader), i.setPath(this.path), i.setWithCredentials(this.withCredentials), i.load(
      t,
      (c) => {
        s.image.data = c instanceof A ? new Uint16Array(c.buffer) : c;
        const { width: a, height: h, depth: f, ...d } = this.options;
        a != null && (s.image.width = a), h != null && (s.image.height = h), "depth" in s.image && f != null && (s.image.depth = f), s.type = nr(c), Object.assign(s, d), s.needsUpdate = !0, n?.(s);
      },
      r,
      o
    ), s;
  }
}
const z = _.clamp, Sr = _.euclideanModulo, mr = _.inverseLerp, _r = _.lerp, Er = _.degToRad, Ir = _.radToDeg, Or = _.isPowerOfTwo, Pr = _.ceilPowerOfTwo, xr = _.floorPowerOfTwo, Nr = _.normalize;
function Lr(e, t, n, r = 0, o = 1) {
  return _.mapLinear(e, t, n, r, o);
}
function Rr(e, t, n, r = 0, o = 1) {
  return z(_.mapLinear(e, t, n, r, o), r, o);
}
function Ur(e, t, n) {
  return n <= e ? 0 : n >= t ? 1 : (n = (n - e) / (t - e), n * n * (3 - 2 * n));
}
function Cr(e) {
  return Math.min(Math.max(e, 0), 1);
}
function Mr(e, t, n, r = n) {
  const o = Math.abs(e - t);
  return o <= r || o <= n * Math.max(Math.abs(e), Math.abs(t));
}
function Br(e) {
  return (t, n) => {
    t instanceof pt ? Object.defineProperty(t, n, {
      enumerable: !0,
      get() {
        return this.defines?.[e] != null;
      },
      set(r) {
        r !== this[n] && (r ? (this.defines ??= {}, this.defines[e] = "1") : delete this.defines?.[e], this.needsUpdate = !0);
      }
    }) : Object.defineProperty(t, n, {
      enumerable: !0,
      get() {
        return this.defines.has(e);
      },
      set(r) {
        r !== this[n] && (r ? this.defines.set(e, "1") : this.defines.delete(e), this.setChanged());
      }
    });
  };
}
function he(e) {
  return typeof e == "number" ? Math.floor(e) : typeof e == "string" ? parseInt(e, 10) : typeof e == "boolean" ? +e : 0;
}
function Fr(e, {
  min: t = Number.MIN_SAFE_INTEGER,
  max: n = Number.MAX_SAFE_INTEGER
} = {}) {
  return (r, o) => {
    r instanceof pt ? Object.defineProperty(r, o, {
      enumerable: !0,
      get() {
        const s = this.defines?.[e];
        return s != null ? he(s) : 0;
      },
      set(s) {
        const i = this[o];
        s !== i && (this.defines ??= {}, this.defines[e] = z(s, t, n).toFixed(0), this.needsUpdate = !0);
      }
    }) : Object.defineProperty(r, o, {
      enumerable: !0,
      get() {
        const s = this.defines.get(e);
        return s != null ? he(s) : 0;
      },
      set(s) {
        const i = this[o];
        s !== i && (this.defines.set(e, z(s, t, n).toFixed(0)), this.setChanged());
      }
    });
  };
}
function fe(e) {
  return typeof e == "number" ? e : typeof e == "string" ? parseFloat(e) : typeof e == "boolean" ? +e : 0;
}
function Dr(e, {
  min: t = -1 / 0,
  max: n = 1 / 0,
  precision: r = 7
} = {}) {
  return (o, s) => {
    o instanceof pt ? Object.defineProperty(o, s, {
      enumerable: !0,
      get() {
        const i = this.defines?.[e];
        return i != null ? fe(i) : 0;
      },
      set(i) {
        const c = this[s];
        i !== c && (this.defines ??= {}, this.defines[e] = z(i, t, n).toFixed(r), this.needsUpdate = !0);
      }
    }) : Object.defineProperty(o, s, {
      enumerable: !0,
      get() {
        const i = this.defines.get(e);
        return i != null ? fe(i) : 0;
      },
      set(i) {
        const c = this[s];
        i !== c && (this.defines.set(e, z(i, t, n).toFixed(r)), this.setChanged());
      }
    });
  };
}
function vr(e, { validate: t } = {}) {
  return (n, r) => {
    n instanceof pt ? Object.defineProperty(n, r, {
      enumerable: !0,
      get() {
        return this.defines?.[e];
      },
      set(o) {
        if (o !== this[r]) {
          if (t?.(o) === !1) {
            console.error(`Expression validation failed: ${o}`);
            return;
          }
          this.defines ??= {}, this.defines[e] = o, this.needsUpdate = !0;
        }
      }
    }) : Object.defineProperty(n, r, {
      enumerable: !0,
      get() {
        return this.defines.get(e);
      },
      set(o) {
        if (o !== this[r]) {
          if (t?.(o) === !1) {
            console.error(`Expression validation failed: ${o}`);
            return;
          }
          this.defines.set(e, o), this.setChanged();
        }
      }
    });
  };
}
function Gr(e, ...t) {
  const n = {};
  for (let r = 0; r < t.length; r += 2) {
    const o = t[r], s = t[r + 1];
    for (const i of s)
      n[i] = {
        enumerable: !0,
        get: () => o[i],
        set: (c) => {
          o[i] = c;
        }
      };
  }
  return Object.defineProperties(e, n), e;
}
function jr(e, t, n) {
  const r = {};
  for (const o of n)
    r[o] = {
      enumerable: !0,
      get: () => t.uniforms[o].value,
      set: (s) => {
        t.uniforms[o].value = s;
      }
    };
  return Object.defineProperties(e, r), e;
}
class zr extends K {
  constructor(t = {}, n) {
    super(n), this.options = t;
  }
  load(t, n, r, o) {
    const { width: s, height: i, depth: c } = this.options, a = new Ke(null, s, i, c), h = new de(this.manager);
    return h.setRequestHeader(this.requestHeader), h.setPath(this.path), h.setWithCredentials(this.withCredentials), h.load(
      t,
      (f) => {
        const { image: d } = f;
        a.image = {
          data: d.data,
          width: s ?? d.width,
          height: i ?? d.height,
          depth: c ?? Math.sqrt(d.height)
        }, a.type = f.type, a.format = f.format, a.colorSpace = f.colorSpace, a.needsUpdate = !0;
        try {
          n?.(a);
        } catch (O) {
          o != null ? o(O) : console.error(O), this.manager.itemError(t);
        }
      },
      r,
      o
    ), a;
  }
}
class Hr extends K {
  constructor(t = {}, n) {
    super(n), this.options = t;
  }
  load(t, n, r, o) {
    const { width: s, height: i } = this.options, c = new tn(null, s, i), a = new de(this.manager);
    return a.setRequestHeader(this.requestHeader), a.setPath(this.path), a.setWithCredentials(this.withCredentials), a.load(
      t,
      (h) => {
        const { image: f } = h;
        c.image = {
          data: f.data,
          width: s ?? f.width,
          height: i ?? f.height
        }, c.type = h.type, c.format = h.format, c.colorSpace = h.colorSpace, c.needsUpdate = !0;
        try {
          n?.(c);
        } catch (d) {
          o != null ? o(d) : console.error(d), this.manager.itemError(t);
        }
      },
      r,
      o
    ), c;
  }
}
const It = 1e-6, ot = /* @__PURE__ */ new U(), it = /* @__PURE__ */ new U(), N = /* @__PURE__ */ new U(), X = /* @__PURE__ */ new U(), Ot = /* @__PURE__ */ new U(), rr = /* @__PURE__ */ new U(), sr = /* @__PURE__ */ new nn(), or = /* @__PURE__ */ new en(), ir = /* @__PURE__ */ new rn();
class De {
  constructor(t = 0, n = 0, r = 0, o = 0) {
    this.distance = t, this.heading = n, this.pitch = r, this.roll = o;
  }
  get distance() {
    return this._distance;
  }
  set distance(t) {
    this._distance = Math.max(t, It);
  }
  get pitch() {
    return this._pitch;
  }
  set pitch(t) {
    this._pitch = z(t, -Math.PI / 2 + It, Math.PI / 2 - It);
  }
  set(t, n, r, o) {
    return this.distance = t, this.heading = n, this.pitch = r, o != null && (this.roll = o), this;
  }
  clone() {
    return new De(this.distance, this.heading, this.pitch, this.roll);
  }
  copy(t) {
    return this.distance = t.distance, this.heading = t.heading, this.pitch = t.pitch, this.roll = t.roll, this;
  }
  equals(t) {
    return t.distance === this.distance && t.heading === this.heading && t.pitch === this.pitch && t.roll === this.roll;
  }
  decompose(t, n, r, o, s = Xt.WGS84) {
    s.getEastNorthUpVectors(
      t,
      ot,
      it,
      N
    ), o?.copy(N);
    const i = X.copy(ot).multiplyScalar(Math.cos(this.heading)).add(
      Ot.copy(it).multiplyScalar(Math.sin(this.heading))
    ).multiplyScalar(Math.cos(this.pitch)).add(Ot.copy(N).multiplyScalar(Math.sin(this.pitch))).normalize().multiplyScalar(this.distance);
    if (n.copy(t).sub(i), this.roll !== 0) {
      const c = X.copy(t).sub(n).normalize();
      N.applyQuaternion(
        or.setFromAxisAngle(c, this.roll)
      );
    }
    r.setFromRotationMatrix(
      sr.lookAt(n, t, N)
    );
  }
  setFromCamera(t, n = Xt.WGS84, r) {
    const o = X.setFromMatrixPosition(t.matrixWorld), s = Ot.set(0, 0, 0.5).unproject(t).sub(o).normalize(), i = n.getIntersection(
      ir.set(o, s)
    );
    if (i == null)
      return;
    r?.copy(i), this.distance = o.distanceTo(i), n.getEastNorthUpVectors(
      i,
      ot,
      it,
      N
    ), this.heading = Math.atan2(
      it.dot(s),
      ot.dot(s)
    ), this.pitch = Math.asin(N.dot(s));
    const c = X.copy(t.up).applyQuaternion(t.quaternion), a = rr.copy(s).multiplyScalar(-c.dot(s)).add(c).normalize(), h = X.copy(s).multiplyScalar(-N.dot(s)).add(N).normalize(), f = h.dot(a), d = s.dot(h.cross(a));
    return this.roll = Math.atan2(d, f), this;
  }
}
const Q = class Q {
  constructor(t = 0, n = 0, r = 0, o = 0) {
    this.west = t, this.south = n, this.east = r, this.north = o;
  }
  get width() {
    let t = this.east;
    return t < this.west && (t += Math.PI * 2), t - this.west;
  }
  get height() {
    return this.north - this.south;
  }
  set(t, n, r, o) {
    return this.west = t, this.south = n, this.east = r, this.north = o, this;
  }
  clone() {
    return new Q(this.west, this.south, this.east, this.north);
  }
  copy(t) {
    return this.west = t.west, this.south = t.south, this.east = t.east, this.north = t.north, this;
  }
  equals(t) {
    return t.west === this.west && t.south === this.south && t.east === this.east && t.north === this.north;
  }
  at(t, n, r = new V()) {
    return r.set(
      this.west + (this.east - this.west) * t,
      this.north + (this.south - this.north) * n
    );
  }
  fromArray(t, n = 0) {
    return this.west = t[n], this.south = t[n + 1], this.east = t[n + 2], this.north = t[n + 3], this;
  }
  toArray(t = [], n = 0) {
    return t[n] = this.west, t[n + 1] = this.south, t[n + 2] = this.east, t[n + 3] = this.north, t;
  }
  *[Symbol.iterator]() {
    yield this.west, yield this.south, yield this.east, yield this.north;
  }
};
Q.MAX = /* @__PURE__ */ new Q(
  V.MIN_LONGITUDE,
  V.MIN_LATITUDE,
  V.MAX_LONGITUDE,
  V.MAX_LATITUDE
);
let dt = Q;
const cr = /^[ \t]*#include +"([\w\d./]+)"/gm;
function ar(e, t) {
  return e.replace(cr, (n, r) => {
    const s = r.split("/").reduce(
      (i, c) => typeof i != "string" && i != null ? i[c] : void 0,
      t
    );
    if (typeof s != "string")
      throw new Error(`Could not find include for ${r}.`);
    return ar(s, t);
  });
}
function* ve(e, t, n, r, o) {
  if (n >= r)
    return;
  const s = 2 ** n, i = n + 1, c = 2 ** i, a = Math.floor(e / s * c), h = Math.floor(t / s * c), f = [
    [a, h, i],
    [a + 1, h, i],
    [a, h + 1, i],
    [a + 1, h + 1, i]
  ];
  if (i < r)
    for (const d of f)
      for (const O of ve(...d, r, o))
        yield O;
  else
    for (const d of f)
      yield (o ?? new Z()).set(...d);
}
class Z {
  constructor(t = 0, n = 0, r = 0) {
    this.x = t, this.y = n, this.z = r;
  }
  set(t, n, r) {
    return this.x = t, this.y = n, r != null && (this.z = r), this;
  }
  clone() {
    return new Z(this.x, this.y, this.z);
  }
  copy(t) {
    return this.x = t.x, this.y = t.y, this.z = t.z, this;
  }
  equals(t) {
    return t.x === this.x && t.y === this.y && t.z === this.z;
  }
  getParent(t = new Z()) {
    const n = 2 ** this.z, r = this.x / n, o = this.y / n, s = this.z - 1, i = 2 ** s;
    return t.set(Math.floor(r * i), Math.floor(o * i), s);
  }
  *traverseChildren(t, n) {
    const { x: r, y: o, z: s } = this;
    for (const i of ve(r, o, s, s + t, n))
      yield i;
  }
  fromArray(t, n = 0) {
    return this.x = t[n], this.y = t[n + 1], this.z = t[n + 2], this;
  }
  toArray(t = [], n = 0) {
    return t[n] = this.x, t[n + 1] = this.y, t[n + 2] = this.z, t;
  }
  *[Symbol.iterator]() {
    yield this.x, yield this.y, yield this.z;
  }
}
const le = /* @__PURE__ */ new ue();
class Ge {
  constructor(t = 2, n = 1, r = dt.MAX) {
    this.width = t, this.height = n, this.rectangle = r;
  }
  clone() {
    return new Ge(this.width, this.height, this.rectangle.clone());
  }
  copy(t) {
    return this.width = t.width, this.height = t.height, this.rectangle.copy(t.rectangle), this;
  }
  getSize(t, n = new ue()) {
    return n.set(this.width << t, this.height << t);
  }
  // Reference: https://github.com/CesiumGS/cesium/blob/1.122/packages/engine/Source/Core/GeographicTilingScheme.js#L210
  getTile(t, n, r = new Z()) {
    const o = this.getSize(n, le), { rectangle: s } = this, i = s.width / o.x, c = s.height / o.y, { west: a, south: h, east: f } = s;
    let d = t.longitude;
    f < a && (d += Math.PI * 2);
    let O = Math.floor((d - a) / i);
    O >= o.x && (O = o.x - 1);
    let F = Math.floor((t.latitude - h) / c);
    return F >= o.y && (F = o.y - 1), r.x = O, r.y = F, r.z = n, r;
  }
  // Reference: https://github.com/CesiumGS/cesium/blob/1.122/packages/engine/Source/Core/GeographicTilingScheme.js#L169
  getRectangle(t, n = new dt()) {
    const r = this.getSize(t.z, le), { rectangle: o } = this, s = o.width / r.x, i = o.height / r.y, { west: c, north: a } = o;
    return n.west = t.x * s + c, n.east = (t.x + 1) * s + c, n.north = a - (r.y - t.y - 1) * i, n.south = a - (r.y - t.y) * i, n;
  }
}
let ct;
function hr() {
  if (ct != null)
    return ct;
  const e = new Uint32Array([268435456]);
  return ct = new Uint8Array(e.buffer, e.byteOffset, e.byteLength)[0] === 0, ct;
}
function B(e, t, n, r = !0) {
  if (r === hr())
    return new t(e);
  const o = Object.assign(new DataView(e), {
    getFloat16(i, c) {
      return tr(this, i, c);
    }
  }), s = new t(o.byteLength / t.BYTES_PER_ELEMENT);
  for (let i = 0, c = 0; i < s.length; ++i, c += t.BYTES_PER_ELEMENT)
    s[i] = o[n](c, r);
  return s;
}
const Wr = (e) => new Uint8Array(e), Vr = (e) => new Int8Array(e), Yr = (e, t) => B(e, Uint16Array, "getUint16", t), Xr = (e, t) => B(e, Int16Array, "getInt16", t), qr = (e, t) => B(e, Int32Array, "getInt32", t), kr = (e, t) => B(e, Uint32Array, "getUint32", t), Jr = (e, t) => B(e, A, "getFloat16", t), $r = (e, t) => B(e, Float32Array, "getFloat32", t), Qr = (e, t) => B(e, Float64Array, "getFloat64", t);
function Zr(e) {
}
const fr = /#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*(?:i\s*\+\+|\+\+\s*i)\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;
function lr(e, t, n, r) {
  let o = "";
  for (let s = parseInt(t, 10); s < parseInt(n, 10); ++s)
    o += r.replace(/\[\s*i\s*\]/g, `[${s}]`).replace(/UNROLLED_LOOP_INDEX/g, `${s}`);
  return o;
}
function Kr(e) {
  return e.replace(fr, lr);
}
export {
  sn as ArrayBufferLoader,
  ns as DEFAULT_STBN_URL,
  br as DataTextureLoader,
  zr as EXR3DTextureLoader,
  Hr as EXRTextureLoader,
  Xt as Ellipsoid,
  hs as EllipsoidGeometry,
  A as Float16Array,
  V as Geodetic,
  De as PointOfView,
  rs as QuadGeometry,
  dt as Rectangle,
  ss as STBNLoader,
  os as STBN_TEXTURE_DEPTH,
  is as STBN_TEXTURE_HEIGHT,
  cs as STBN_TEXTURE_WIDTH,
  Z as TileCoordinate,
  Ge as TilingScheme,
  er as TypedArrayLoader,
  Pr as ceilPowerOfTwo,
  z as clamp,
  Mr as closeTo,
  Br as define,
  vr as defineExpression,
  Dr as defineFloat,
  Fr as defineInt,
  Gr as definePropertyShorthand,
  jr as defineUniformShorthand,
  Ir as degrees,
  Sr as euclideanModulo,
  xr as floorPowerOfTwo,
  gr as fromBufferGeometryLike,
  mr as inverseLerp,
  wr as isFloatLinearSupported,
  Or as isPowerOfTwo,
  Tr as isTypedArray,
  _r as lerp,
  Nr as normalize,
  Jr as parseFloat16Array,
  $r as parseFloat32Array,
  Qr as parseFloat64Array,
  Xr as parseInt16Array,
  qr as parseInt32Array,
  Vr as parseInt8Array,
  Yr as parseUint16Array,
  kr as parseUint32Array,
  Wr as parseUint8Array,
  Er as radians,
  Zr as reinterpretType,
  Lr as remap,
  Rr as remapClamped,
  ar as resolveIncludes,
  Cr as saturate,
  Ur as smoothstep,
  Ar as toBufferGeometryLike,
  Kr as unrollLoops
};
