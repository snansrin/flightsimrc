import { describe, expect, it } from 'vitest'
import { localWaypoint } from '../avionics'
import { Simulation } from './simulation'
import { geographic, mercator, parentTile, satelliteUrl, terrainTiles, terrariumHeight, tileKey, WorldTerrain } from './worldTerrain'

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
    const field = { ...world.field(), datumAltitude: 2000, height: (x: number) => 24 + x * .01 }
    const simulation = new Simulation()
    const airborne = { altitude: 150, airspeed: 20, offset: 0 }
    simulation.reset({ field, airborne })
    expect(simulation.field).toBe(field)
    expect(simulation.state.position).toEqual([0, 174, 0])
    expect(localWaypoint(field, 'runway')).toEqual({ x: 0, z: -0, label: 'BAŞLANGIÇ NOKTASI' })
    simulation.reset({ field: 'anadolu' })
    expect(simulation.field.id).toBe('anadolu')
  })
})
