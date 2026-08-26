import {
  ClampToEdgeWrapping,
  Data3DTexture,
  LinearFilter,
  RGBAFormat,
  UnsignedByteType,
} from 'three'
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js'
import {
  clamp,
  float,
  screenUV,
  smoothstep,
  texture3D,
  uniform,
  vec4,
} from 'three/tsl'

type AnyNode = object
const asColor = (node: AnyNode) => node as ReturnType<typeof vec4>
const LUT_SIZE = 32

/** Final calibrated controls. Exposure is owned by the luminance meter. */
export const gradeParams = {
  exposureEV: uniform(0),
  lutIntensity: uniform(1),
  vignette: uniform(0.115),
}

export const dreamLutTexture = createDreamLutTexture()

/** Post-tonemap 32³ grade plus a spatial vignette (which cannot live in a LUT). */
export function dreamGrade(inputColor: AnyNode) {
  const input = clamp(asColor(inputColor), 0, 1)
  const graded = lut3D(
    input,
    texture3D(dreamLutTexture),
    LUT_SIZE,
    gradeParams.lutIntensity,
  ) as unknown as ReturnType<typeof vec4>
  const centered = screenUV.sub(0.5)
  const falloff = smoothstep(0.38, 0.94, centered.length().mul(1.34))
  const vignetted = graded.rgb.mul(float(1).sub(falloff.mul(gradeParams.vignette)))
  return vec4(vignetted.clamp(0, 1), float(1))
}

function createDreamLutTexture(): Data3DTexture {
  const data = new Uint8Array(LUT_SIZE ** 3 * 4)
  let offset = 0
  for (let b = 0; b < LUT_SIZE; b++) {
    for (let g = 0; g < LUT_SIZE; g++) {
      for (let r = 0; r < LUT_SIZE; r++) {
        const source: [number, number, number] = [
          r / (LUT_SIZE - 1),
          g / (LUT_SIZE - 1),
          b / (LUT_SIZE - 1),
        ]
        const graded = gradeSample(source)
        data[offset++] = Math.round(graded[0] * 255)
        data[offset++] = Math.round(graded[1] * 255)
        data[offset++] = Math.round(graded[2] * 255)
        data[offset++] = 255
      }
    }
  }
  const texture3D = new Data3DTexture(data, LUT_SIZE, LUT_SIZE, LUT_SIZE)
  texture3D.format = RGBAFormat
  texture3D.type = UnsignedByteType
  texture3D.minFilter = LinearFilter
  texture3D.magFilter = LinearFilter
  texture3D.wrapS = ClampToEdgeWrapping
  texture3D.wrapT = ClampToEdgeWrapping
  texture3D.wrapR = ClampToEdgeWrapping
  texture3D.generateMipmaps = false
  texture3D.needsUpdate = true
  texture3D.name = 'dreamGrade32'
  return texture3D
}

function gradeSample(color: [number, number, number]): [number, number, number] {
  const lift = [0.011, 0.026, 0.033] as const
  const gain = [1.042, 1.008, 0.972] as const
  const balanced = color.map((channel, index) => (
    channel * gain[index] + lift[index] * (1 - channel)
  )) as [number, number, number]
  const luminance = balanced[0] * 0.2126 + balanced[1] * 0.7152 + balanced[2] * 0.0722
  const saturation = Math.max(...balanced) - Math.min(...balanced)
  const vibrance = 1 + 0.17 * (1 - saturation)
  return balanced.map((channel) => clampCpu(luminance + (channel - luminance) * vibrance)) as [
    number,
    number,
    number,
  ]
}

function clampCpu(value: number): number {
  return Math.max(0, Math.min(1, value))
}
