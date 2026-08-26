import { BackSide, DirectionalLight, Mesh, Scene, SphereGeometry } from 'three'
import { MeshBasicNodeMaterial, PMREMGenerator } from 'three/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import { float, normalize, positionLocal } from 'three/tsl'
import { skyRadiance } from './sky-radiance'
import { SUN_LIGHT_INTENSITY, sunColor, sunDirection } from './sun'

/**
 * Sky dome on the shared radiance function, the one directional sun, and a
 * once-baked PMREM environment. The sun never moves, so the environment never
 * regenerates.
 *
 * The dome passes `discStrength 1`: it is the only surface that draws the HDR
 * disc. Every optical surface passes 0 and answers the disc with its own
 * analytic glint instead — re-reflecting a sub-pixel HDR disc through a bumpy
 * normal double-counts it as sparkling white pixels.
 *
 * Dome radius 3400 m. Keep the camera far plane beyond it: far-plane culling of
 * the dome is the "black sky" failure mode.
 */
export function createSkyDome(): Mesh {
  const domeMaterial = new MeshBasicNodeMaterial()
  domeMaterial.colorNode = skyRadiance(normalize(positionLocal), float(1))
  domeMaterial.side = BackSide
  domeMaterial.depthWrite = false
  domeMaterial.fog = false
  const dome = new Mesh(new SphereGeometry(3400, 48, 24), domeMaterial)
  dome.frustumCulled = false
  dome.renderOrder = -100
  return dome
}

/** The one sun light, aimed at the origin from the shared direction. */
export function createSunLight(shadowMapSize = 2048): DirectionalLight {
  const sun = new DirectionalLight(sunColor, SUN_LIGHT_INTENSITY)
  sun.castShadow = true
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize)
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.02
  sun.position.copy(sunDirection).multiplyScalar(700)
  sun.target.position.set(0, 0, 0)
  return sun
}

/**
 * Bake the environment from the dome's own material, exactly once. Sharing the
 * material is what keeps the environment and the visible sky from disagreeing.
 */
export function bakeSkyEnvironment(
  renderer: WebGPURenderer,
  dome: Mesh,
): { texture: import('three').Texture; dispose: () => void } {
  const envScene = new Scene()
  const envDome = new Mesh(new SphereGeometry(50, 32, 16), dome.material)
  envScene.add(envDome)
  const pmrem = new PMREMGenerator(renderer)
  const envTarget = pmrem.fromScene(envScene, 0.03, 1, 90)
  pmrem.dispose()
  return {
    texture: envTarget.texture,
    dispose: () => {
      envTarget.dispose()
      envDome.geometry.dispose()
    },
  }
}

/** Environment intensity the whole optical stack is calibrated against. */
export const SKY_ENVIRONMENT_INTENSITY = 0.5
