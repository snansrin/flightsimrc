import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { tileKey, type Tile } from '../sim/worldTerrain'

let source: Promise<string> | undefined
const tiles = new Map<string, Promise<VectorTile>>()

function tileSource() {
  source ??= fetch('https://tiles.openfreemap.org/planet', { signal: AbortSignal.timeout(8000) })
    .then(async response => {
      if (!response.ok) throw new Error('Vector service unavailable')
      const { tiles } = await response.json() as { tiles: string[] }
      if (!tiles?.[0]?.startsWith('https://tiles.openfreemap.org/')) throw new Error('Invalid vector tile source')
      return tiles[0]
    }).catch(error => { source = undefined; throw error })
  return source
}

export function loadSceneryTile(tile: Tile) {
  const count = 2 ** tile.z
  const column = ((tile.x % count) + count) % count
  const key = tileKey({ ...tile, x: column })
  const cached = tiles.get(key)
  if (cached) return cached
  const request = tileSource().then(async template => {
    const url = template.replace('{z}', String(tile.z)).replace('{x}', String(column)).replace('{y}', String(tile.y))
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error('Vector tile unavailable')
    return new VectorTile(new PbfReader(await response.arrayBuffer()))
  })
  tiles.set(key, request)
  if (tiles.size > 72) tiles.delete(tiles.keys().next().value!)
  void request.catch(() => { if (tiles.get(key) === request) tiles.delete(key) })
  return request
}
