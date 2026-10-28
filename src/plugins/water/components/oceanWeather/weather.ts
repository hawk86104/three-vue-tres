import { MathUtils, Matrix4, Vector3 } from 'three'
import { getMoonDirectionECEF, getSunDirectionECEF } from './vendor/atmosphere/index.js'
import { Ellipsoid, Geodetic } from './vendor/geospatial/index.js'
import type { WaterSettings } from './settings'

// A fixed non-leap calendar keeps dayOfYear 1–365 reproducible across machines.
export const WEATHER_YEAR = 2026
export const WEATHER_LONGITUDE = 139.8146
export const WEATHER_LATITUDE = 35.7455
export const weatherOrigin = new Geodetic(MathUtils.degToRad(WEATHER_LONGITUDE), MathUtils.degToRad(WEATHER_LATITUDE)).toECEF()
// Ocean coordinates: X east, Y up, Z south.
export const worldToECEF = Ellipsoid.WGS84.getEastNorthUpFrame(weatherOrigin)
  .multiply(new Matrix4().makeRotationX(Math.PI / 2))
const ecefToWorld = worldToECEF.clone().invert()
const hoursPerYear = 365 * 24

export interface WeatherSnapshot {
  dayOfYear: number
  timeOfDay: number
  sunElevation: number
  sunAzimuth: number
}

export function normalizeLocalDate(dayOfYear: number, timeOfDay: number) {
  const day = Number.isFinite(dayOfYear) ? MathUtils.clamp(Math.floor(dayOfYear), 1, 365) : 170
  const hour = Number.isFinite(timeOfDay) ? timeOfDay : 15
  const total = MathUtils.euclideanModulo((day - 1) * 24 + hour, hoursPerYear)
  return { dayOfYear: Math.floor(total / 24) + 1, timeOfDay: total % 24 }
}

export function localWeatherDate(dayOfYear: number, timeOfDay: number): Date {
  // The reference uses local mean solar time (longitude / 15), not the PC timezone.
  return new Date(Date.UTC(WEATHER_YEAR, 0, 1) + ((dayOfYear - 1) * 24 + timeOfDay - WEATHER_LONGITUDE / 15) * 3600000)
}

export function formatWeatherDay(dayOfYear: number): string {
  const date = new Date(Date.UTC(WEATHER_YEAR, 0, dayOfYear))
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')} / ${String(date.getUTCDate()).padStart(2, '0')}`
}

/** Owns independent cloud and celestial clocks, driven by OceanScene's one RAF. */
export class WeatherSystem {
  dayOfYear = 170
  timeOfDay = 15
  cloudTime = 0
  readonly sunDirection = new Vector3()
  readonly moonDirection = new Vector3()

  constructor(settings: Pick<WaterSettings, 'dayOfYear' | 'timeOfDay'>) {
    this.setDate(settings.dayOfYear, settings.timeOfDay)
  }

  setDate(dayOfYear: number, timeOfDay: number) {
    Object.assign(this, normalizeLocalDate(dayOfYear, timeOfDay))
    const date = localWeatherDate(this.dayOfYear, this.timeOfDay)
    getSunDirectionECEF(date, this.sunDirection, weatherOrigin).transformDirection(ecefToWorld)
    getMoonDirectionECEF(date, this.moonDirection, weatherOrigin).transformDirection(ecefToWorld)
  }

  advance(deltaSeconds: number, settings: Pick<WaterSettings, 'paused' | 'animateTime' | 'timeSpeed' | 'animateClouds' | 'cloudSpeed'>): boolean {
    if (settings.paused || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return false
    if (settings.animateClouds && Number.isFinite(settings.cloudSpeed)) this.cloudTime += deltaSeconds * MathUtils.clamp(settings.cloudSpeed, 0, 5)
    if (!settings.animateTime || !Number.isFinite(settings.timeSpeed) || settings.timeSpeed === 0) return false
    // Match the reference's speed at 60 FPS, with elapsed-time integration so
    // low/high refresh-rate displays run at the same rate. Negative speed reverses.
    this.setDate(this.dayOfYear, this.timeOfDay + deltaSeconds * 60 * MathUtils.clamp(settings.timeSpeed, -0.5, 0.5))
    return true
  }

  snapshot(): WeatherSnapshot {
    return {
      dayOfYear: this.dayOfYear, timeOfDay: this.timeOfDay,
      sunElevation: MathUtils.radToDeg(Math.asin(MathUtils.clamp(this.sunDirection.y, -1, 1))),
      sunAzimuth: MathUtils.euclideanModulo(MathUtils.radToDeg(Math.atan2(this.sunDirection.x, -this.sunDirection.z)), 360),
    }
  }
}
