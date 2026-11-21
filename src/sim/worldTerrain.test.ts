import { describe, expect, it } from 'vitest'
import { localWaypoint } from '../avionics'
import { Simulation } from './simulation'
import { aerialUrl, coarseEdgeHeight, coarserNeighbor, geographic, mercator, parentTile, satelliteUrl, terrainSubdivisions, terrainTiles, terrariumHeight, tileAt, tileKey, WorldTerrain } from './worldTerrain'

describe('world terrain coordinates and level of detail', () => {
  it('round-trips local metres and crosses the international date line', () => {
    const world = new WorldTerrain({ latitude: 40, longitude: 179.999 })
    const moved = world.toMercator(600, -250)
    const [east, south] = world.toLocal(moved.x, moved.y)
    expect(east).toBeCloseTo(600, 5)
    expect(south).toBeCloseTo(-250, 5)
    expect(geographic(moved.x, moved.y).longitude).toBeLessThan(-179)
    expect(geographic(moved.x, moved.y).latitude).toBeGreaterThan(40)
    expect(satelliteUrl({ z: 3, x: 8, y: 1 })).toContain('/3/1/0.jpg')
  })

  it('selects disjoint near and horizon tiles and follows a distant aircraft', () => {
    const start = mercator({ latitude: 41, longitude: 29 })
    const end = mercator({ latitude: 47, longitude: 7 })
    const tiles = terrainTiles(start.x, start.y)
    const selected = new Set(tiles.map(tileKey))
    expect(tiles.some(tile => tile.z === 9)).toBe(true)
    expect(tiles.some(tile => tile.z === 14 && Math.floor(start.x * 2 ** 14) === tile.x && Math.floor(start.y * 2 ** 14) === tile.y)).toBe(true)
    expect(tiles).toHaveLength(selected.size)
    for (const tile of tiles) {
      for (let z = 9; z < tile.z; z++) expect(selected.has(tileKey(parentTile(tile, z)))).toBe(false)
    }
    expect(terrainTiles(end.x, end.y).some(tile => selected.has(tileKey(tile)))).toBe(false)
  })

  it('decodes terrain RGB and starts a fixed-wing aircraft above the actual field datum', () => {
    expect(terrariumHeight(128, 0, 0)).toBe(0)
    expect(terrariumHeight(127, 255, 128)).toBe(-.5)
    const world = new WorldTerrain({ latitude: 45, longitude: 7 })
    const field = { ...world.field(90), datumAltitude: 2000, height: (x: number) => 24 + x * .01 }
    const simulation = new Simulation()
    const airborne = { altitude: 350, airspeed: 20, offset: 0 }
    simulation.reset({ field, airborne })
    expect(simulation.field).toBe(field)
    expect(simulation.state.position).toEqual([0, 374, 0])
    expect(simulation.attitude.yaw).toBeCloseTo(Math.PI / 2)
    expect(localWaypoint(field, 'runway')).toEqual({ x: 0, z: -0, label: 'BAŞLANGIÇ NOKTASI' })
    simulation.reset({ field: 'anadolu' })
    expect(simulation.field.id).toBe('anadolu')
  })

  it('aligns the fine boundary with the triangle edge of the coarser tile to its north', () => {
    const fine = { z: 14, x: 8000, y: 4000 }
    const coarse = { z: 13, x: 4000, y: 1999 }
    const tiles = new Set([tileKey(fine), tileKey(coarse)])
    expect(coarserNeighbor(fine, 0, -1, tiles)).toEqual(coarse)
    expect(coarserNeighbor(fine, -1, 0, tiles)).toBeUndefined()
    const n = 2 ** coarse.z, subdivisions = terrainSubdivisions(coarse.z)
    const y = fine.y / 2 ** fine.z
    const start = coarse.x / n, step = 1 / (n * subdivisions)
    const sample = (x: number) => ((x - start) / step) ** 2 * 12
    expect(coarseEdgeHeight(coarse, true, start + step / 2, y, sample)).toBeCloseTo(6)
    expect(coarseEdgeHeight(coarse, true, start + step, y, sample)).toBeCloseTo(12)
  })

  it('offers the detailed public USGS overlay only for close tiles wholly inside the contiguous United States', () => {
    const boulder = mercator({ latitude: 40.08539, longitude: -105.2327 })
    const ankara = mercator({ latitude: 39.9552, longitude: 32.8117 })
    const request = aerialUrl(tileAt(14, boulder.x, boulder.y))
    expect(request).toContain('USGSImageryOnly')
    const params = new URL(request!).searchParams
    expect(params.get('size')).toBe('768,768')
    expect(params.get('bbox')?.split(',').map(Number)).toHaveLength(4)
    expect(aerialUrl(tileAt(13, boulder.x, boulder.y))).toBeUndefined()
    expect(aerialUrl(tileAt(14, ankara.x, ankara.y))).toBeUndefined()
  })
})
