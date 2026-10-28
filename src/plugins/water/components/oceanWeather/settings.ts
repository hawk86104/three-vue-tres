export type CameraMode = 'orbit' | 'fly' | 'boat'
export type Quality = 'Low' | 'Medium' | 'High' | 'Ultra'

export interface WaterSettings {
  preset: string
  quality: Quality
  wind: number
  wavelength: number
  dayOfYear: number
  timeOfDay: number
  animateTime: boolean
  timeSpeed: number
  animateClouds: boolean
  cloudSpeed: number
  skyExposure: number
  haze: boolean
  clouds: number
  pixelRatio: number
  buoyancyProbes: boolean
  wakeProbes: boolean
  paused: boolean
}

export const presets = {
  'Three.js Sky Pro': { wind: 15, wavelength: 47, timeOfDay: 15, clouds: 0.37, water: '#007d9e', fog: 0.0009 },
  Arctic: { wind: 8, wavelength: 31, timeOfDay: 9, clouds: 0.48, water: '#23667e', fog: 0.002 },
  'Black Flag': { wind: 18, wavelength: 47, timeOfDay: 16.5, clouds: 0.48, water: '#096574', fog: 0.0012 },
  Dusk: { wind: 9, wavelength: 38, timeOfDay: 19.5, clouds: 0.34, water: '#25435e', fog: 0.0018 },
  Foggy: { wind: 7, wavelength: 35, timeOfDay: 11, clouds: 0.88, water: '#527a7d', fog: 0.011 },
  Moonlit: { wind: 8, wavelength: 36, timeOfDay: 0, clouds: 0.2, water: '#082c48', fog: 0.0015 },
  'Sea of Thieves': { wind: 17, wavelength: 55, timeOfDay: 13, clouds: 0.3, water: '#008c87', fog: 0.0007 },
  Storm: { wind: 28, wavelength: 68, timeOfDay: 16, clouds: 0.95, water: '#23454b', fog: 0.0045 },
  Sunset: { wind: 10, wavelength: 42, timeOfDay: 18.9, clouds: 0.4, water: '#175d68', fog: 0.0014 },
} as const

export const defaultSettings: WaterSettings = {
  preset: 'Three.js Sky Pro', quality: 'High', wind: 15, wavelength: 47,
  dayOfYear: 170, timeOfDay: 15, animateTime: false, timeSpeed: 0.05,
  animateClouds: true, cloudSpeed: 1, skyExposure: 10, haze: true,
  clouds: 0.37, pixelRatio: 1,
  buoyancyProbes: false, wakeProbes: false, paused: false,
}

// Keep the last parameter choices during scene switches, without keeping a WebGL renderer alive.
export const rememberedSettings: WaterSettings = { ...defaultSettings }

export const qualityOptions: Record<Quality, { segments: number; reflection: number; refraction: number }> = {
  Low: { segments: 128, reflection: 512, refraction: 0.5 },
  Medium: { segments: 192, reflection: 768, refraction: 0.7 },
  High: { segments: 256, reflection: 1024, refraction: 1 },
  Ultra: { segments: 384, reflection: 1536, refraction: 1 },
}
