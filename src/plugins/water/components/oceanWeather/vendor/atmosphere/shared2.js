import { Matrix3 as E, Vector3 as c } from "three";
const T = "eac103980f20c0956f2d3215833e73514be08462", S = `https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/${T}/packages/atmosphere/assets`, d = `https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/${T}/packages/atmosphere/assets/stars.bin`, f = 64, A = 16, i = 32, _ = 128, R = 32, u = 8, U = u * R, g = _, N = i, C = 256, p = 64, w = 1 / 1e3, h = 100, D = /* @__PURE__ */ new E(
  3.2406255,
  -1.537208,
  -0.4986286,
  -0.9689307,
  1.8757561,
  0.0415175,
  0.0557101,
  -0.2040211,
  1.0569959
), I = /* @__PURE__ */ new c();
function X(t, a, e, s) {
  const n = e.projectOnSurface(
    t,
    I
  );
  return n != null ? e.getOsculatingSphereCenter(n, a, s).negate() : s.setScalar(0);
}
var l = "production" === "production", r = "Invariant failed";
function G(t, a) {
  if (!t) {
    if (l)
      throw new Error(r);
    var e = r;
    throw new Error(e);
  }
}
const H = typeof window < "u" && window.requestIdleCallback != null ? window.requestIdleCallback : function(a, e = {}) {
  const n = e.timeout ?? 1, o = performance.now();
  return setTimeout(() => {
    a({
      get didTimeout() {
        return e.timeout != null ? !1 : performance.now() - o - 1 > n;
      },
      timeRemaining() {
        return Math.max(0, 1 + (performance.now() - o));
      }
    });
  }, 1);
};
export {
  S as D,
  A as I,
  w as M,
  N as S,
  p as T,
  D as X,
  d as a,
  f as b,
  g as c,
  _ as d,
  R as e,
  u as f,
  i as g,
  U as h,
  h as i,
  C as j,
  X as k,
  G as l,
  H as r
};
