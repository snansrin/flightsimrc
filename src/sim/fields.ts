import { clamp, fbm, smoothstep, type Vec3 } from './math'
import { calmWeather, type WeatherConfig } from './atmosphere'

export type Biome = 'grass' | 'coast' | 'alpine' | 'desert' | 'snow' | 'city' | 'island'

export type Runway = {
  /** Magnetic-ish heading of the take-off direction, degrees (0 = north / -Z). */
  heading: number
  length: number
  width: number
  surface: 'asphalt' | 'grass' | 'concrete' | 'water'
  /** Centre of the strip in world x/z. */
  center: [number, number]
  elevation: number
}

export type Field = {
  id: string
  name: string
  subtitle: string
  biome: Biome
  seed: number
  weather: WeatherConfig
  runway: Runway
  waterLevel: number
  /** Terrain height above datum, metres. */
  height: (x: number, z: number) => number
  /** Flat, obstacle-free radius around the strip. */
  clearing: number
  trees: number
  buildings: number
  ridgeLift: number
  notes: string
}

const flatBlend = (distance: number, clearing: number): number => smoothstep(clearing, clearing * 2.4, distance)

function makeHeight(seed: number, clearing: number, shape: (x: number, z: number, n: (s: number) => number) => number) {
  return (x: number, z: number): number => {
    const d = Math.hypot(x, z)
    const blend = flatBlend(d, clearing)
    if (blend <= 0) return 0
    const n = (scale: number) => fbm(x / scale, z / scale, 5, seed)
    return shape(x, z, n) * blend
  }
}

export const fields: Field[] = [
  {
    id: 'anadolu',
    name: 'Anadolu Eğitim Pisti',
    subtitle: 'Açık ova · sakin hava · 100 m asfalt',
    biome: 'grass', seed: 11, weather: { ...calmWeather, windSpeed: 1.2, windDirection: 340, turbulence: 0.12, thermals: 0.35, label: 'Hafif rüzgâr' },
    runway: { heading: 0, length: 100, width: 9, surface: 'asphalt', center: [0, 0], elevation: 0 },
    waterLevel: -Infinity,
    height: makeHeight(11, 150, (_x, _z, n) => 14 * n(420) + 5 * n(120) + 3),
    clearing: 150, trees: 260, buildings: 6, ridgeLift: 0,
    notes: 'İlk kalkış ve devriye turu için referans saha. Ufukta yumuşak tepeler.',
  },
  {
    id: 'ege',
    name: 'Ege Kıyı Pisti',
    subtitle: 'Deniz kenarı · yan rüzgâr · yüzdürmeli uçuş',
    biome: 'coast', seed: 23, weather: { ...calmWeather, windSpeed: 3.6, windDirection: 260, turbulence: 0.3, thermals: 0.25, label: 'Deniz meltemi' },
    runway: { heading: 0, length: 90, width: 8, surface: 'asphalt', center: [0, 0], elevation: 0 },
    waterLevel: -0.35,
    height: makeHeight(23, 140, (x, _z, n) => (x > 150 ? -6 + 2 * n(90) : 10 * n(380) + 4 * n(110))),
    clearing: 140, trees: 150, buildings: 5, ridgeLift: 0.3,
    notes: 'Doğuda deniz; yüzdürmeli model ve yan rüzgâr inişi çalışması için.',
  },
  {
    id: 'alp',
    name: 'Alp Vadisi',
    subtitle: 'Dağ vadisi · türbülans · yamaç kaldırması',
    biome: 'alpine', seed: 37, weather: { ...calmWeather, windSpeed: 5.5, windDirection: 290, turbulence: 0.55, thermals: 0.6, cloudBase: 1400, label: 'Vadi rüzgârı' },
    runway: { heading: 0, length: 80, width: 7, surface: 'grass', center: [0, 0], elevation: 0 },
    waterLevel: -Infinity,
    height: makeHeight(37, 130, (x, z, n) => {
      const ridge = Math.pow(Math.abs(n(500)), 1.2) * 260
      const valley = smoothstep(60, 320, Math.abs(x)) * 0.8 + 0.2
      return ridge * valley + 18 * n(140)
    }),
    clearing: 130, trees: 420, buildings: 3, ridgeLift: 1.4,
    notes: 'Yamaç kaldırması ve dağ türbülansı; planör ve dağ uçuşu dersleri.',
  },
  {
    id: 'col',
    name: 'Çöl Meydanı',
    subtitle: 'Kumullar · sıcak hava · uzun görüş',
    biome: 'desert', seed: 53, weather: { ...calmWeather, windSpeed: 4.2, windDirection: 200, turbulence: 0.35, thermals: 0.85, label: 'Sıcak termal' },
    runway: { heading: 0, length: 110, width: 10, surface: 'concrete', center: [0, 0], elevation: 0 },
    waterLevel: -Infinity,
    height: makeHeight(53, 160, (_x, _z, n) => 22 * Math.abs(n(260)) + 7 * n(70)),
    clearing: 160, trees: 40, buildings: 4, ridgeLift: 0.2,
    notes: 'Güçlü termaller; yoğunluk irtifası ve uzun süzülüş çalışması.',
  },
  {
    id: 'kuzey',
    name: 'Kuzey Yaylası',
    subtitle: 'Karlı plato · soğuk yoğun hava',
    biome: 'snow', seed: 71, weather: { ...calmWeather, windSpeed: 2.8, windDirection: 20, turbulence: 0.25, thermals: 0.1, label: 'Soğuk sakin' },
    runway: { heading: 0, length: 95, width: 8, surface: 'asphalt', center: [0, 0], elevation: 0 },
    waterLevel: -Infinity,
    height: makeHeight(71, 145, (_x, _z, n) => 30 * n(460) + 10 * n(150) + 6),
    clearing: 145, trees: 300, buildings: 4, ridgeLift: 0.4,
    notes: 'Yoğun hava daha fazla kaldırma üretir; kar zeminde kayma artar.',
  },
  {
    id: 'sehir',
    name: 'Şehir Meydanı',
    subtitle: 'Binalar · drone ve heli nokta inişi',
    biome: 'city', seed: 89, weather: { ...calmWeather, windSpeed: 2.2, windDirection: 310, turbulence: 0.45, thermals: 0.2, label: 'Şehir türbülansı' },
    runway: { heading: 0, length: 40, width: 12, surface: 'concrete', center: [0, 0], elevation: 0 },
    waterLevel: -Infinity,
    height: makeHeight(89, 120, (_x, _z, n) => 6 * n(300)),
    clearing: 120, trees: 120, buildings: 90, ridgeLift: 0,
    notes: 'Çatı inişleri, dar alan manevrası ve GPS loiter dersleri.',
  },
  {
    id: 'ada',
    name: 'Ada Lagünü',
    subtitle: 'Su üstü · yüzdürmeli ve deniz uçağı',
    biome: 'island', seed: 101, weather: { ...calmWeather, windSpeed: 3.0, windDirection: 240, turbulence: 0.28, thermals: 0.3, label: 'Lagün meltemi' },
    runway: { heading: 0, length: 200, width: 40, surface: 'water', center: [0, 0], elevation: 0 },
    waterLevel: 0,
    height: makeHeight(101, 60, (x, z, n) => {
      const d = Math.hypot(x, z)
      const island = smoothstep(320, 120, d) * (26 + 14 * n(160))
      return island - 8 + 3 * n(60)
    }),
    clearing: 60, trees: 220, buildings: 3, ridgeLift: 0.5,
    notes: 'Sudan kalkış ve suya iniş; step tekniği ve su direnci.',
  },
]

export const fieldById = (id: string): Field => fields.find(f => f.id === id) ?? fields[0]

/** Start position on the threshold, pointing down the strip. */
export function startOnRunway(field: Field, offset = 6): { position: Vec3; heading: number } {
  const heading = (field.runway.heading * Math.PI) / 180
  const half = field.runway.length / 2 - offset
  const x = field.runway.center[0] + Math.sin(heading) * half
  const z = field.runway.center[1] + Math.cos(heading) * half
  const ground = field.height(x, z)
  return { position: [x, ground, z], heading }
}

export const runwayAxis = (field: Field): Vec3 => {
  const h = (field.runway.heading * Math.PI) / 180
  return [-Math.sin(h), 0, -Math.cos(h)]
}

/** Ridge lift when wind blows against a slope; used by the glider lessons. */
export function ridgeLiftAt(field: Field, x: number, z: number, agl: number, windSpeed: number): number {
  if (field.ridgeLift <= 0 || windSpeed < 1) return 0
  const e = 3
  const slope = (field.height(x + e, z) - field.height(x - e, z)) / (2 * e)
  const facing = clamp(-slope, 0, 1)
  const proximity = Math.exp(-Math.pow(clamp(agl, 0, 200) / 70, 2))
  return facing * windSpeed * field.ridgeLift * proximity * 0.8
}

export type Gate = { position: Vec3; radius: number; heading: number }

/** Ring-run course: a closed loop of gates around the field. */
export function gateCourse(field: Field, count = 8, radius = 90, altitude = 22): Gate[] {
  const gates: Gate[] = []
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2
    const x = Math.sin(t) * radius
    const z = Math.cos(t) * radius * 0.8
    const y = field.height(x, z) + altitude + Math.sin(t * 2) * 8
    gates.push({ position: [x, y, z], radius: 9, heading: t + Math.PI / 2 })
  }
  return gates
}
