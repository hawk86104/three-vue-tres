import * as THREE from "three/webgpu";

export const SUBMARINE_DIMENSIONS = {
  dome: {
    center: new THREE.Vector3(0, 0.02, 0.92),
    radius: 1,
    tilt: THREE.MathUtils.degToRad(24),
    planeOffset: 0.14,
  },
  hull: { tailZ: -1.3, tailR: 0.3, maxR: 1.015, rings: 56, segs: 128 },
  tail: {
    collarZ: -1.3,
    tipZ: -1.74,
    tipR: 0.105,
    ringZ: -1.76,
    ringR: 0.8,
    ringW: 0.145,
    ringD: 0.26,
    spikeZ0: -1.86,
    spikeZ1: -2.3,
    prop: { blades: 8, r: 0.62, hubR: 0.115 },
  },
  finH: {
    rootZ0: -0.42,
    rootZ1: -1.22,
    tipZ0: -1.18,
    tipZ1: -1.66,
    span: 0.98,
    dihedral: THREE.MathUtils.degToRad(3),
  },
  finL: { angle: THREE.MathUtils.degToRad(146), scale: 0.62 },
  pod: { len: 0.52, r: 0.105 },
  window: {
    uCenter: 0.345,
    vCenter: 0.205,
    uHalf: 0.052,
    vHalf: 0.135,
  },
  seat: { x: 0, y: -0.34, z: 0.62 },
  deck: { y: -0.52 },
};

export const SUBMARINE_PALETTE = {
  porcelain: new THREE.Color(0xf8f4ea),
  porcelainLow: new THREE.Color(0xe9e2d2),
  brass: new THREE.Color(0xc7973f),
  brassDeep: new THREE.Color(0x8f6a28),
  leather: new THREE.Color(0xefe3cb),
  wood: new THREE.Color(0x5c4430),
  glassTint: new THREE.Color(0xdcebe6),
  lamp: new THREE.Color(0xffd9a4),
  interiorDark: new THREE.Color(0x3d3225),
};
