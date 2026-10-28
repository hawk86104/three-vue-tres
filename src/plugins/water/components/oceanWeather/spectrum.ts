// Independent JONSWAP spectrum. Coordinates and amplitudes are in metres.
export const cascadeLengths = [256, 32, 4] as const
export interface WaveMode { kx: number; kz: number; omega: number; re: number; im: number }
export interface Spectrum { data: Float32Array; modes: WaveMode[]; variance: number }

export function createSpectrum(size: number, length: number, cascade: number, wind: number, wavelength: number): Spectrum {
  let seed = 73013 + cascade * 9749
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed + 1) / 4294967297 }
  const data = new Float32Array(size * size * 4)
  const modes: WaveMode[] = []
  const dk = 2 * Math.PI / length
  const peak = Math.sqrt(9.81 * 2 * Math.PI / wavelength)
  const minK = [0, 2 * Math.PI / 18, 2 * Math.PI / 2][cascade]
  const maxK = [2 * Math.PI / 18, 2 * Math.PI / 2, Infinity][cascade]
  let variance = 0
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const kx = (x - size / 2) * dk, kz = (z - size / 2) * dk
    const k = Math.hypot(kx, kz)
    if (k < Math.max(minK, 0.00001) || k >= maxK || x === 0 || z === 0) continue
    const omega = Math.sqrt(9.81 * k)
    const sigma = omega <= peak ? 0.07 : 0.09
    const enhancement = Math.exp(-((omega - peak) ** 2) / (2 * sigma * sigma * peak * peak))
    const jonswap = 0.0081 * 9.81 ** 2 / omega ** 5 * Math.exp(-1.25 * (peak / omega) ** 4) * 3.3 ** enhancement
    const alignment = (kx * 0.94 + kz * 0.342) / k
    const direction = 0.12 + 0.88 * Math.max(alignment, 0) ** 4
    const capillaryDamping = cascade === 2 ? Math.exp(-((k / 18) ** 2)) : 1
    const density = jonswap * 0.5 * Math.sqrt(9.81 / k) / k * direction * capillaryDamping
    const amplitude = Math.sqrt(density * dk * dk * 0.5)
    const gaussian = Math.sqrt(-2 * Math.log(random()))
    const phase = 2 * Math.PI * random()
    const re = gaussian * Math.cos(phase) * amplitude, im = gaussian * Math.sin(phase) * amplitude
    const offset = (z * size + x) * 4
    data[offset] = re; data[offset + 1] = im
    modes.push({ kx, kz, omega, re, im })
    variance += 2 * (re * re + im * im)
  }
  // The three bands retain independent energy; capillary detail stays present in light wind.
  const rms = [0.7, 0.23, 0.045][cascade] * (0.035 + (wind / 15) ** 1.2)
  const scale = variance > 0 ? rms / Math.sqrt(variance) : 0
  for (let i = 0; i < data.length; i += 4) { data[i] *= scale; data[i + 1] *= scale }
  modes.forEach(mode => { mode.re *= scale; mode.im *= scale })
  // Store the conjugate partner so evolution needs just one texture fetch.
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = (z * size + x) * 4
    const partner = (((size - z) % size) * size + (size - x) % size) * 4
    data[i + 2] = data[partner]; data[i + 3] = -data[partner + 1]
  }
  return { data, modes, variance: rms * rms }
}

export function sampleSpectrum(modes: readonly WaveMode[], x: number, z: number, time: number) {
  let height = 0
  for (const m of modes) {
    const phase = m.kx * x + m.kz * z - m.omega * time
    height += 2 * (m.re * Math.cos(phase) - m.im * Math.sin(phase))
  }
  return height
}
