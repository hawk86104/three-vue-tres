/** Refractive index of air at visible wavelengths. */
export const AIR_IOR = 1.0

/** Representative visible-spectrum refractive index of seawater. */
export const WATER_IOR = 1.333

/** Per-metre RGB extinction shared by surface transmission and aquatic fog. */
export const AQUATIC_EXTINCTION = [0.026, 0.0085, 0.005] as const

/** Open-water in-scatter for downward-looking rays. */
export const AQUATIC_AMBIENT_DOWN = [0.01, 0.075, 0.14] as const

/** Open-water in-scatter for upward-looking rays. */
export const AQUATIC_AMBIENT_UP = [0.1, 0.32, 0.37] as const
