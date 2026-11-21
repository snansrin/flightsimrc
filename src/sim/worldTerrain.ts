import { calmWeather } from './atmosphere'
import type { Field } from './fields'
import { lower48Boundary } from './lower48'

export type WorldPoint = { latitude: number; longitude: number }
export type WorldStart = WorldPoint & { heading: number; altitude: number }
export type Tile = { z: number; x: number; y: number }
type Elevation = { size: number; heights: Float32Array }
const circumference = 2 * Math.PI * 6378137
export const mercatorLatitude = 85.05112878
const elevationZoom = 13
const tileTimeout = 12000
export const worldAltitude = { min: 60, max: 600, default: 150 }
const wrapped = (value: number, size: number) => ((value % size) + size) % size
export const satelliteTemplate = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'
export const satelliteCredit = 'EOxCloudless by EOX IT Services GmbH · modified Copernicus Sentinel data 2016'
export const aerialSource = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer'

export function mercator(point: WorldPoint) {
  const lat = Math.max(-mercatorLatitude, Math.min(mercatorLatitude, point.latitude)) * Math.PI / 180
  return { x: (point.longitude + 180) / 360, y: (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 }
}

export function geographic(x: number, y: number): WorldPoint {
  return { longitude: wrapped(x, 1) * 360 - 180, latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI }
}

export const tileKey = ({ z, x, y }: Tile) => [z, x, y].join('/')
export const tileAt = (z: number, x: number, y: number): Tile =>
  ({ z, x: Math.floor(x * 2 ** z), y: Math.floor(y * 2 ** z) })
export function parentTile(tile: Tile, z: number): Tile {
  const divider = 2 ** (tile.z - z)
  return { z, x: Math.floor(tile.x / divider), y: Math.floor(tile.y / divider) }
}

export const terrainSubdivisions = (z: number) => z === 14 ? 72 : z === 13 ? 46 : 24

export function coarserNeighbor(tile: Tile, dx: number, dy: number, visible: ReadonlySet<string>) {
  const adjacent = { z: tile.z, x: tile.x + dx, y: tile.y + dy }
  for (let z = tile.z - 1; z >= 9; z--) {
    const candidate = parentTile(adjacent, z)
    if (visible.has(tileKey(candidate))) return candidate
  }
}

/** A fine tile's shared edge lies on the coarser mesh's straight vertex segments. */
export function coarseEdgeHeight(tile: Tile, horizontal: boolean, x: number, y: number,
  sample: (x: number, y: number, zoom: number) => number) {
  const count = 2 ** tile.z
  const subdivisions = terrainSubdivisions(tile.z)
  const origin = horizontal ? tile.x : tile.y
  const coordinate = horizontal ? x : y
  const segment = Math.max(0, Math.min(subdivisions, (coordinate * count - origin) * subdivisions))
  const start = Math.min(subdivisions - 1, Math.floor(segment))
  const a = (origin + start / subdivisions) / count
  const b = (origin + (start + 1) / subdivisions) / count
  const before = horizontal ? sample(a, y, tile.z) : sample(x, a, tile.z)
  const after = horizontal ? sample(b, y, tile.z) : sample(x, b, tile.z)
  return before + (after - before) * (segment - start)
}

export function satelliteUrl({ z, x, y }: Tile) {
  return satelliteTemplate.replace('{z}', String(z)).replace('{x}', String(wrapped(x, 2 ** z))).replace('{y}', String(y))
}

function isLower48({ latitude, longitude }: WorldPoint) {
  let inside = false
  for (let i = 1; i < lower48Boundary.length; i++) {
    const [ax, ay] = lower48Boundary[i - 1], [bx, by] = lower48Boundary[i]
    if ((ay > latitude) !== (by > latitude) && longitude < (bx - ax) * (latitude - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}

export function aerialUrl(tile: Tile) {
  if (tile.z < 14) return undefined
  const n = 2 ** tile.z, x = wrapped(tile.x, n)
  if (![0, 1].every(dy => [0, 1].every(dx => isLower48(geographic((x + dx) / n, (tile.y + dy) / n))))) return undefined
  const west = (x / n - .5) * circumference, east = ((x + 1) / n - .5) * circumference
  const south = (.5 - (tile.y + 1) / n) * circumference, north = (.5 - tile.y / n) * circumference
  return aerialSource + '/export?bbox=' + [west, south, east, north].map(value => value.toFixed(3)).join(',')
    + '&bboxSR=3857&imageSR=3857&size=768,768&format=jpg&f=image'
}

function loadSatellite(url: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    const timeout = window.setTimeout(() => { finish(null); image.removeAttribute('src') }, timeoutMs)
    function finish(result: HTMLImageElement | null) {
      window.clearTimeout(timeout)
      image.onload = image.onerror = null
      resolve(result)
    }
    image.onload = () => finish(image)
    image.onerror = () => finish(null)
    image.src = url
  })
}

async function bestSatellite(tile: Tile) {
  const standard = loadSatellite(satelliteUrl(tile), 11000)
  const detail = aerialUrl(tile)
  return detail ? await loadSatellite(detail, 4500) ?? standard : standard
}

export const terrariumHeight = (red: number, green: number, blue: number) => red * 256 + green + blue / 256 - 32768

async function loadElevation({ z, x, y }: Tile): Promise<Elevation> {
  const response = await fetch('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + [z, wrapped(x, 2 ** z), y].join('/') + '.png',
    { signal: AbortSignal.timeout(tileTimeout) })
  if (!response.ok) throw new Error('Yükseklik verisi alınamadı.')
  const image = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none' })
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = image.width
  const context = canvas.getContext('2d', { willReadFrequently: true })
  try {
    if (!context) throw new Error('Yükseklik verisi çözülemedi.')
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const heights = new Float32Array(data.length / 4)
    for (let i = 0; i < heights.length; i++) heights[i] = terrariumHeight(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    return { size: canvas.width, heights }
  } finally { image.close() }
}

export function terrainTiles(x: number, y: number): Tile[] {
  const rootZoom = 9
  const roots = 2 ** rootZoom
  const cx = Math.floor(x * roots), cy = Math.floor(y * roots)
  const selected: Tile[] = []
  const visit = (tile: Tile) => {
    const count = 2 ** tile.z
    const distance = Math.hypot(Math.max(0, Math.abs(x * count - tile.x - .5) - .5),
      Math.max(0, Math.abs(y * count - tile.y - .5) - .5))
    if (tile.z >= 14 || distance > .38) { selected.push(tile); return }
    for (const dy of [0, 1]) for (const dx of [0, 1]) visit({ z: tile.z + 1, x: tile.x * 2 + dx, y: tile.y * 2 + dy })
  }
  for (let row = Math.max(0, cy - 1); row <= Math.min(roots - 1, cy + 1); row++) {
    for (let column = cx - 1; column <= cx + 1; column++) visit({ z: rootZoom, x: column, y: row })
  }
  const distance = (tile: Tile) => Math.hypot((tile.x + .5) / 2 ** tile.z - x, (tile.y + .5) / 2 ** tile.z - y)
  return selected.sort((a, b) => distance(a) - distance(b))
}

export class WorldTerrain {
  readonly origin: ReturnType<typeof mercator>
  readonly startTile: Tile
  readonly scale: number
  datum = 0
  private elevations = new Map<string, Elevation>()
  private requests = new Map<string, Promise<void>>()
  private startPhoto?: Promise<HTMLImageElement | null>

  constructor(readonly point: WorldPoint) {
    this.origin = mercator(point)
    this.startTile = tileAt(14, this.origin.x, this.origin.y)
    this.scale = circumference * Math.cos(point.latitude * Math.PI / 180)
  }

  toMercator(x: number, south: number) {
    return { x: this.origin.x + x / this.scale, y: this.origin.y + south / this.scale }
  }

  toLocal(x: number, y: number): [number, number] {
    return [(x - this.origin.x) * this.scale, (y - this.origin.y) * this.scale]
  }

  coordinates(x: number, south: number) {
    const point = this.toMercator(x, south)
    return geographic(point.x, point.y)
  }

  #sample(x: number, y: number, maxZoom: number) {
    for (let z = Math.min(elevationZoom, maxZoom); z >= 9; z--) {
      const n = 2 ** z
      const column = Math.floor(x * n), row = Math.floor(y * n)
      const dem = this.elevations.get(tileKey({ z, x: wrapped(column, n), y: row }))
      if (!dem) continue
      const { size, heights } = dem
      const pixelX = x * n * size - .5, pixelY = y * n * size - .5
      const px = Math.floor(pixelX), py = Math.floor(pixelY)
      const read = (gx: number, gy: number) => {
        const tx = Math.floor(gx / size), ty = Math.floor(gy / size)
        const other = tx === column && ty === row ? dem : this.elevations.get(tileKey({ z, x: wrapped(tx, n), y: ty }))
        if (other) return other.heights[wrapped(gy, size) * size + wrapped(gx, size)]
        const u = Math.max(0, Math.min(size - 1, gx - column * size))
        const v = Math.max(0, Math.min(size - 1, gy - row * size))
        return heights[v * size + u]
      }
      const u = pixelX - px, v = pixelY - py
      return (read(px, py) * (1 - u) + read(px + 1, py) * u) * (1 - v)
        + (read(px, py + 1) * (1 - u) + read(px + 1, py + 1) * u) * v
    }
    return this.datum
  }

  heightAtMercator = (x: number, y: number, maxZoom = elevationZoom) => this.#sample(x, y, maxZoom) - this.datum

  height = (x: number, south: number) => {
    const point = this.toMercator(x, south)
    return this.heightAtMercator(point.x, point.y)
  }

  preload(tile: Tile): Promise<void> {
    const level = parentTile(tile, Math.min(tile.z, elevationZoom))
    level.x = wrapped(level.x, 2 ** level.z)
    const key = tileKey(level)
    if (this.elevations.has(key)) return Promise.resolve()
    const inProgress = this.requests.get(key)
    if (inProgress) return inProgress
    const promise = loadElevation(level).then(elevation => {
      this.elevations.set(key, elevation)
      if (this.elevations.size > 144) this.elevations.delete(this.elevations.keys().next().value!)
    }).finally(() => this.requests.delete(key))
    this.requests.set(key, promise)
    return promise
  }

  async prepare() {
    this.startPhoto = bestSatellite(this.startTile)
    await this.preload(this.startTile)
    this.datum = this.#sample(this.origin.x, this.origin.y, elevationZoom)
  }

  satellite(tile: Tile) {
    return tileKey(tile) === tileKey(this.startTile) && this.startPhoto ? this.startPhoto : bestSatellite(tile)
  }

  field(heading = 0): Field {
    return {
      id: 'world', name: 'Dünya Keşfi', subtitle: 'Gerçek uydu görüntüsü ve arazi', biome: 'grass',
      seed: 0, weather: { ...calmWeather, label: 'Sakin hava' }, datumAltitude: this.datum,
      runway: { heading, length: 0, width: 0, surface: 'grass', center: [0, 0], elevation: 0 },
      waterLevel: -Infinity, height: this.height, clearing: 0, trees: 0, buildings: 0, ridgeLift: 0, notes: '',
    }
  }
}
