import { Vector3 as a, Matrix4 as T, BufferGeometry as W, BufferAttribute as S } from "three";
import { i as O } from "./shared.js";
const $ = /* @__PURE__ */ new a();
function D(q, t, i = new a(), s) {
  const { x: r, y: e, z: n } = q, o = t.x, h = t.y, u = t.z, d = r * r * o, m = e * e * h, c = n * n * u, l = d + m + c, p = Math.sqrt(1 / l);
  if (!Number.isFinite(p))
    return;
  const w = $.copy(q).multiplyScalar(p);
  if (l < (s?.centerTolerance ?? 0.1))
    return i.copy(w);
  const f = w.multiply(t).multiplyScalar(2);
  let y = (1 - p) * q.length() / (f.length() / 2), I = 0, x, M, g, v;
  do {
    y -= I, x = 1 / (1 + y * o), M = 1 / (1 + y * h), g = 1 / (1 + y * u);
    const V = x * x, F = M * M, L = g * g, G = V * x, j = F * M, B = L * g;
    v = d * V + m * F + c * L - 1, I = v / ((d * G * o + m * j * h + c * B * u) * -2);
  } while (Math.abs(v) > 1e-12);
  return i.set(r * x, e * M, n * g);
}
const E = /* @__PURE__ */ new a(), R = /* @__PURE__ */ new a(), U = /* @__PURE__ */ new a(), b = class b {
  constructor(t, i, s) {
    this.radii = new a(t, i, s);
  }
  // TODO: Rename to semiMinorAxis
  get minimumRadius() {
    return Math.min(this.radii.x, this.radii.y, this.radii.z);
  }
  // TODO: Rename to semiMajorAxis
  get maximumRadius() {
    return Math.max(this.radii.x, this.radii.y, this.radii.z);
  }
  get flattening() {
    return 1 - this.minimumRadius / this.maximumRadius;
  }
  get eccentricity() {
    return Math.sqrt(this.eccentricitySquared);
  }
  get eccentricitySquared() {
    const t = this.maximumRadius ** 2, i = this.minimumRadius ** 2;
    return (t - i) / t;
  }
  reciprocalRadii(t = new a()) {
    const { x: i, y: s, z: r } = this.radii;
    return t.set(1 / i, 1 / s, 1 / r);
  }
  reciprocalRadiiSquared(t = new a()) {
    const { x: i, y: s, z: r } = this.radii;
    return t.set(1 / i ** 2, 1 / s ** 2, 1 / r ** 2);
  }
  projectOnSurface(t, i = new a(), s) {
    return D(
      t,
      this.reciprocalRadiiSquared(),
      i,
      s
    );
  }
  getSurfaceNormal(t, i = new a()) {
    return i.multiplyVectors(this.reciprocalRadiiSquared(E), t).normalize();
  }
  getEastNorthUpVectors(t, i = new a(), s = new a(), r = new a()) {
    this.getSurfaceNormal(t, r), i.set(-t.y, t.x, 0).normalize(), s.crossVectors(r, i).normalize();
  }
  getEastNorthUpFrame(t, i = new T()) {
    const s = E, r = R, e = U;
    return this.getEastNorthUpVectors(t, s, r, e), i.makeBasis(s, r, e).setPosition(t);
  }
  getNorthUpEastFrame(t, i = new T()) {
    const s = E, r = R, e = U;
    return this.getEastNorthUpVectors(t, s, r, e), i.makeBasis(r, e, s).setPosition(t);
  }
  getIntersection(t, i = new a()) {
    const s = this.reciprocalRadii(E), r = R.copy(s).multiply(t.origin), e = U.copy(s).multiply(t.direction), n = r.lengthSq(), o = e.lengthSq(), h = r.dot(e), u = h ** 2 - o * (n - 1);
    if (n === 1)
      return i.copy(t.origin);
    if (n > 1) {
      if (h >= 0 || u < 0)
        return;
      const d = Math.sqrt(u), m = (-h - d) / o, c = (-h + d) / o;
      return t.at(Math.min(m, c), i);
    }
    if (n < 1) {
      const d = h ** 2 - o * (n - 1), m = Math.sqrt(d), c = (-h + m) / o;
      return t.at(c, i);
    }
    if (h < 0)
      return t.at(-h / o, i);
  }
  getOsculatingSphereCenter(t, i, s = new a()) {
    O(this.radii.x === this.radii.y);
    const r = this.radii.x ** 2, e = this.radii.z ** 2, n = E.set(
      t.x / r,
      t.y / r,
      t.z / e
    ).normalize();
    return s.copy(n.multiplyScalar(-i).add(t));
  }
  getNormalAtHorizon(t, i, s = new a()) {
    O(this.radii.x === this.radii.y);
    const r = this.radii.x ** 2, e = this.radii.z ** 2, n = t, o = i;
    let h = (n.x * o.x + n.y * o.y) / r + n.z * o.z / e;
    h /= (n.x ** 2 + n.y ** 2) / r + n.z ** 2 / e;
    const u = E.copy(o).multiplyScalar(-h).add(t);
    return s.set(u.x / r, u.y / r, u.z / e).normalize();
  }
};
b.WGS84 = /* @__PURE__ */ new b(
  6378137,
  6378137,
  6356752314245179e-9
);
let N = b;
class Q extends W {
  constructor(t = new a(1, 1, 1), i = 32, s = 16) {
    super(), this.type = "EllipsoidGeometry", this.parameters = {
      radii: t,
      longitudeSegments: i,
      latitudeSegments: s
    }, i = Math.max(3, Math.floor(i)), s = Math.max(2, Math.floor(s));
    const r = (i + 1) * (s + 1), e = new a(), n = new a(), o = new Float32Array(r * 3), h = new Float32Array(r * 3), u = new Float32Array(r * 2), d = [], m = [];
    for (let c = 0, l = 0, p = 0, w = 0; c <= s; ++c) {
      const f = [], y = c / s, I = y * Math.PI;
      let x = 0;
      c === 0 ? x = 0.5 / i : c === s && (x = -0.5 / i);
      for (let M = 0; M <= i; ++M, l += 3, p += 2, ++w) {
        const g = M / i, v = (g - 0.5) * Math.PI * 2;
        e.x = t.x * Math.cos(v) * Math.sin(I), e.y = t.y * Math.sin(v) * Math.sin(I), e.z = t.z * Math.cos(I), o[l] = e.x, o[l + 1] = e.y, o[l + 2] = e.z, n.copy(e).normalize(), h[l] = n.x, h[l + 1] = n.y, h[l + 2] = n.z, u[p] = g + x, u[p + 1] = 1 - y, f.push(w);
      }
      d.push(f);
    }
    for (let c = 0; c < s; ++c)
      for (let l = 0; l < i; ++l) {
        const p = d[c][l + 1], w = d[c][l], f = d[c + 1][l], y = d[c + 1][l + 1];
        c !== 0 && m.push(p, w, y), c !== s - 1 && m.push(w, f, y);
      }
    this.setIndex(m), this.setAttribute("position", new S(o, 3)), this.setAttribute("normal", new S(h, 3)), this.setAttribute("uv", new S(u, 2));
  }
  copy(t) {
    return super.copy(t), this.parameters = { ...t.parameters }, this;
  }
}
const A = /* @__PURE__ */ new a(), P = /* @__PURE__ */ new a(), z = class z {
  constructor(t = 0, i = 0, s = 0) {
    this.longitude = t, this.latitude = i, this.height = s;
  }
  set(t, i, s) {
    return this.longitude = t, this.latitude = i, s != null && (this.height = s), this;
  }
  clone() {
    return new z(this.longitude, this.latitude, this.height);
  }
  copy(t) {
    return this.longitude = t.longitude, this.latitude = t.latitude, this.height = t.height, this;
  }
  equals(t) {
    return t.longitude === this.longitude && t.latitude === this.latitude && t.height === this.height;
  }
  setLongitude(t) {
    return this.longitude = t, this;
  }
  setLatitude(t) {
    return this.latitude = t, this;
  }
  setHeight(t) {
    return this.height = t, this;
  }
  normalize() {
    return this.longitude < z.MIN_LONGITUDE && (this.longitude += Math.PI * 2), this;
  }
  // See: https://en.wikipedia.org/wiki/Geographic_coordinate_conversion
  // Reference: https://github.com/CesiumGS/cesium/blob/1.122/packages/engine/Source/Core/Geodetic.js#L119
  setFromECEF(t, i) {
    const r = (i?.ellipsoid ?? N.WGS84).reciprocalRadiiSquared(A), e = D(
      t,
      r,
      P,
      i
    );
    if (e == null)
      throw new Error(
        `Could not project position to ellipsoid surface: ${t.toArray()}`
      );
    const n = A.multiplyVectors(e, r).normalize();
    this.longitude = Math.atan2(n.y, n.x), this.latitude = Math.asin(n.z);
    const o = A.subVectors(t, e);
    return this.height = Math.sign(o.dot(t)) * o.length(), this;
  }
  // See: https://en.wikipedia.org/wiki/Geographic_coordinate_conversion
  // Reference: https://github.com/CesiumGS/cesium/blob/1.122/packages/engine/Source/Core/Cartesian3.js#L916
  toECEF(t = new a(), i) {
    const s = i?.ellipsoid ?? N.WGS84, r = A.multiplyVectors(
      s.radii,
      s.radii
    ), e = Math.cos(this.latitude), n = P.set(
      e * Math.cos(this.longitude),
      e * Math.sin(this.longitude),
      Math.sin(this.latitude)
    ).normalize();
    return t.multiplyVectors(r, n), t.divideScalar(Math.sqrt(n.dot(t))).add(n.multiplyScalar(this.height));
  }
  fromArray(t, i = 0) {
    return this.longitude = t[i], this.latitude = t[i + 1], this.height = t[i + 2], this;
  }
  toArray(t = [], i = 0) {
    return t[i] = this.longitude, t[i + 1] = this.latitude, t[i + 2] = this.height, t;
  }
  *[Symbol.iterator]() {
    yield this.longitude, yield this.latitude, yield this.height;
  }
};
z.MIN_LONGITUDE = -Math.PI, z.MAX_LONGITUDE = Math.PI, z.MIN_LATITUDE = -Math.PI / 2, z.MAX_LATITUDE = Math.PI / 2;
let C = z;
export {
  N as E,
  C as G,
  Q as a
};
