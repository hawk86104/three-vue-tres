export {
  VolumetricFluidFire,
} from "./source/VolumetricFluidFire.ts";
export { SDFShape } from "./source/sdf/shape/SDFShape.ts";
export { SDFBox } from "./source/sdf/shape/SDFBox.ts";
export { SDFEllipsoid } from "./source/sdf/shape/SDFEllipsoid.ts";

export const VOLUMETRIC_FLUID_FIRE_PRESET = Object.freeze({
  resolution: 0.75,
  vorticityConfinementStrength: 7.01,
  vertexEmissionRadius: 0,
  blurStrength: 0,
  steps: 22,
  simulationSpeed: 1.5,
  temperature: 8.5,
  fireDensity: 0.644,
  turbulenceFrecuency: 6.81,
  turbulenceDecay: 0.76,
  turbulence: 0.2,
  friction: 0.9,
  angularVelocityMultiplier: 1.36,
  collisionMargin: 0.034,
  densityDissipation: 1.02,
  cooling: 0.4831,
  velocityDamping: 0.25,
  buoyancy: 2.3729,
  smokeWeight: 0.15,
  pressureIterations: 4,
  curlNoiseMultiplier: 5.82,
  colorBase: 0,
  colorTier1: 16734464,
  colorTier2: 16777068,
  colorTier3: 16777215,
  colorSpecial: 65535,
  colorRadianceMultiplier: 14.78,
  tier1Stop: { from: 0.01, to: 0.1 },
  tier2Stop: { from: 0.3, to: 0.5 },
  tier3Stop: { from: 0.7, to: 0.8 },
  temperatureAtMaxColor: 10,
  timestamp: "2026-07-30T16:35:28.278Z",
});
