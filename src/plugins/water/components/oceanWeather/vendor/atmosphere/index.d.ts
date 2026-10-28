import { Effect } from 'postprocessing'
import { Camera, Color, Data3DTexture, Matrix4, Texture, Vector3, WebGLRenderer } from 'three'

export interface PrecomputedTextures {
    irradianceTexture: Texture
    scatteringTexture: Data3DTexture
    transmittanceTexture: Texture
    singleMieScatteringTexture?: Data3DTexture
    higherOrderScatteringTexture?: Data3DTexture
}

export class AerialPerspectiveEffect extends Effect {
    constructor(camera: Camera, options?: { sky?: boolean; sunLight?: boolean; skyLight?: boolean })
    worldToECEFMatrix: Matrix4
    sunDirection: Vector3
    moonDirection: Vector3
    overlay: unknown
    shadowLength: unknown
    sun: boolean
    transmittanceTexture: Texture | null
}

export class PrecomputedTexturesLoader {
    setType(renderer: WebGLRenderer): this
    load(url: string, onLoad: (textures: PrecomputedTextures) => void, onProgress?: unknown, onError?: (error: unknown) => void): PrecomputedTextures
}

export function getSunLightColor(texture: Texture, position: Vector3, direction: Vector3, result: Color): Color
export function getSunDirectionECEF(date: Date, result: Vector3, observer: Vector3): Vector3
export function getMoonDirectionECEF(date: Date, result: Vector3, observer: Vector3): Vector3
