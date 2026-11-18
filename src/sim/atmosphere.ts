import { clamp, fbm, type Vec3 } from './math'

export const SEA_LEVEL_DENSITY = 1.225
export const GRAVITY = 9.80665

/** ISA troposphere density/temperature at geometric altitude (m). */
export function atmosphere(altitude: number) {
  const h = clamp(altitude, -500, 11000)
  const temperature = 288.15 - 0.0065 * h
  const density = SEA_LEVEL_DENSITY * Math.pow(1 - 2.25577e-5 * h, 4.2559)
  return { density, temperature, sound: Math.sqrt(1.4 * 287.05 * temperature) }
}

export type WeatherConfig = {
  /** m/s at 10 m above ground. */
  windSpeed: number
  /** Degrees the wind comes FROM, 0 = north. */
  windDirection: number
  /** 0..1 gust/turbulence intensity. */
  turbulence: number
  /** 0..1 thermal activity (gliders). */
  thermals: number
  /** Cloud base for visual layer, m. */
  cloudBase: number
  timeOfDay: number
  label: string
}

export const calmWeather: WeatherConfig = {
  windSpeed: 0, windDirection: 0, turbulence: 0.05, thermals: 0.2, cloudBase: 900, timeOfDay: 11, label: 'Sakin',
}

/** Log-law boundary layer: wind is slower close to the ground. */
export const shearFactor = (agl: number, reference = 10): number => {
  const z0 = 0.08
  return clamp(Math.log((Math.max(agl, 0.3) + z0) / z0) / Math.log((reference + z0) / z0), 0.25, 1.35)
}

/** Smooth pseudo-random gust field; deterministic for replay and tests. */
export function gustAt(time: number, position: Vec3, intensity: number, seed = 1): Vec3 {
  if (intensity <= 0) return [0, 0, 0]
  const s = intensity * 3.2
  return [
    s * fbm(time * 0.35 + position[0] * 0.004, position[2] * 0.004, 3, seed),
    s * 0.7 * fbm(time * 0.5 + position[2] * 0.005, position[0] * 0.003, 3, seed + 31),
    s * fbm(time * 0.31 + position[2] * 0.004, position[0] * 0.005, 3, seed + 71),
  ]
}

/** Thermal columns: rising air with a sink ring, useful for sailplane lessons. */
export function thermalAt(position: Vec3, strength: number): number {
  if (strength <= 0) return 0
  const cell = 260
  const cx = Math.floor(position[0] / cell), cz = Math.floor(position[2] / cell)
  let lift = 0
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const gx = cx + i, gz = cz + j
    const seed = ((gx * 73856093) ^ (gz * 19349663)) >>> 0
    const rand = (seed % 1000) / 1000
    if (rand > 0.35) continue
    const ox = (gx + 0.5 + ((seed >> 3) % 100) / 200) * cell
    const oz = (gz + 0.5 + ((seed >> 7) % 100) / 200) * cell
    const r = Math.hypot(position[0] - ox, position[2] - oz)
    const radius = 45 + ((seed >> 11) % 60)
    const core = Math.exp(-(r * r) / (radius * radius))
    const sink = -0.35 * Math.exp(-Math.pow((r - radius * 1.7) / (radius * 0.9), 2))
    lift += (core + sink) * (1.5 + ((seed >> 5) % 100) / 40)
  }
  return lift * strength
}

/** World wind vector including shear, gusts and thermals. */
export function windVector(weather: WeatherConfig, position: Vec3, agl: number, time: number, enabled = true): Vec3 {
  if (!enabled) return [0, 0, 0]
  const from = (weather.windDirection * Math.PI) / 180
  const speed = weather.windSpeed * shearFactor(agl)
  // Meteorological "from" direction: north wind blows toward +z (south) in world axes.
  const base: Vec3 = [-Math.sin(from) * speed, 0, Math.cos(from) * speed]
  const gust = gustAt(time, position, weather.turbulence * clamp(speed / 4 + 0.35, 0.35, 2))
  return [base[0] + gust[0], base[1] + gust[1] + thermalAt(position, weather.thermals), base[2] + gust[2]]
}

export const windLabel = (weather: WeatherConfig): string =>
  `${Math.round(weather.windSpeed * 1.94384)} kt / ${Math.round(weather.windDirection)}°`
