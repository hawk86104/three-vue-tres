import { BufferGeometry as h, Sphere as u, Vector3 as m, Float32BufferAttribute as r, Loader as T, Data3DTexture as g, FileLoader as f, UnsignedByteType as l, RedFormat as w, NearestFilter as i, RepeatWrapping as a } from "three";
import { i as b } from "./shared.js";
const S = 128, y = 128, E = 64, R = "9627216cc50057994c98a2118f3c4a23765d43b9", _ = `https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/${R}/packages/core/assets/stbn.bin`;
class F extends h {
  constructor() {
    super(), this.boundingSphere = new u(), this.boundingSphere.set(new m(), 1 / 0), this.setAttribute(
      "position",
      new r([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3)
    ), this.setAttribute("uv", new r([0, -1, 0, 1, 2, 1], 2));
  }
}
class A extends T {
  load(o, d, p, c) {
    const e = new g(), t = new f(this.manager);
    return t.setPath(this.path), t.setRequestHeader(this.requestHeader), t.setWithCredentials(this.withCredentials), t.setResponseType("arraybuffer"), t.load(
      o,
      (s) => {
        b(s instanceof ArrayBuffer), e.image.data = new Uint8Array(s), e.image.width = S, e.image.height = y, e.image.depth = E, e.type = l, e.format = w, e.minFilter = i, e.magFilter = i, e.wrapS = a, e.wrapT = a, e.wrapR = a, e.needsUpdate = !0, d?.(e);
      },
      p,
      c
    ), e;
  }
}
export {
  _ as D,
  F as Q,
  A as S,
  E as a,
  y as b,
  S as c
};
