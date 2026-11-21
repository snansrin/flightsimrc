import { describe, expect, it } from 'vitest'
import { aircraftById } from '../sim/catalog'
import { cabinGeometry, wingPieces } from './aircraftGeometry'

describe('detailed aircraft meshes', () => {
  it('separates the solid canopy frame from the glazing without dropping any faces', () => {
    const spec = aircraftById('edf90')
    const simple = cabinGeometry(spec)
    const detailed = cabinGeometry(spec, true)
    const [frame, glass] = detailed.groups
    expect(frame.count).toBeGreaterThan(0)
    expect(glass.count).toBeGreaterThan(0)
    expect(glass.start).toBe(frame.count)
    expect(frame.count + glass.count).toBe(simple.getIndex()!.count)
    simple.dispose()
    detailed.dispose()
  })

  it('provides panel coordinates on tapered wings and keeps flaps and ailerons articulated', () => {
    const pieces = wingPieces(aircraftById('warbird1400'))
    expect(pieces.filter(piece => piece.control).map(piece => piece.control)).toEqual(['flap', 'aileron'])
    for (const { geometry } of pieces) {
      expect(geometry.getAttribute('uv').count).toBe(geometry.getAttribute('position').count)
      geometry.dispose()
    }
  })
})
