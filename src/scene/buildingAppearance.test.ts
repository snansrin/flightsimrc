import { describe, expect, it } from 'vitest'
import { Vector2 } from 'three'
import { buildingMesh } from './buildingAppearance'

const footprint = [[0, 0], [15, 0], [15, 8], [0, 8], [0, 0]].map(([x, y]) => new Vector2(x, y))

describe('georeferenced building appearance', () => {
  it('fits a pitched roof inside small rectangular footprints without increasing the mapped height', () => {
    const house = buildingMesh(footprint, [], 15, 4, 8, 0, undefined)!
    house.computeBoundingBox()
    expect(house.boundingBox?.min.y).toBeCloseTo(11)
    expect(house.boundingBox?.min.z).toBeCloseTo(-8)
    expect(house.boundingBox?.max.x).toBeCloseTo(15)
    expect(house.boundingBox?.max.y).toBeCloseTo(23)
    expect(house.boundingBox?.max.z).toBeCloseTo(0)
    const levels = new Set<number>()
    const surface = house.getAttribute('buildingSurface')
    for (let i = 0; i < surface.count; i++) levels.add(surface.getY(i))
    expect(levels.size).toBeGreaterThan(2)
    house.dispose()
  })

  it('keeps high rises flat and supplies distinct facade and roof material coordinates', () => {
    const tower = buildingMesh(footprint, [], 0, 2, 48, 1, '#a0b0c0')!
    const surface = tower.getAttribute('buildingSurface')
    const kinds = new Set<number>()
    for (let i = 0; i < surface.count; i++) kinds.add(surface.getZ(i))
    expect(kinds).toEqual(new Set([0, 2]))
    tower.dispose()
  })
})
