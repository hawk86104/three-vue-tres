import { Effect } from 'postprocessing'
import { Camera, Matrix4, Vector2, Vector3 } from 'three'

export class CloudsEffect extends Effect {
    constructor(camera: Camera)
    worldToECEFMatrix: Matrix4
    sunDirection: Vector3
    localWeatherOffset: Vector2
    shapeOffset: Vector3
    shapeDetailOffset: Vector3
    events: { addEventListener(type: 'change', listener: () => void): void }
    atmosphereOverlay: unknown
    atmosphereShadowLength: unknown
    coverage: number
    qualityPreset: 'low' | 'medium' | 'high' | 'ultra'
    temporalUpscale: boolean
    haze: boolean
    cloudsPass: { resolveMaterial: { uniforms: { temporalAlpha: { value: number } } } }
    shadow: { temporalPass: boolean; temporalJitter: boolean; cascadeCount: number; mapSize: Vector2 }
}
