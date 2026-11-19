import { describe, expect, it } from 'vitest'
import { chaseFraming } from './cameraFraming'

describe('runway-first chase camera framing', () => {
  it('increases aircraft and runway apparent scale when zoom slider is increased', () => {
    const wide = chaseFraming(1.5, .75)
    const normal = chaseFraming(1.5, 1)
    const close = chaseFraming(1.5, 1.6)
    expect(close.distance).toBeLessThan(normal.distance)
    expect(close.fov).toBeLessThan(normal.fov)
    expect(normal.distance).toBeLessThan(wide.distance)
    expect(normal.fov).toBeLessThan(wide.fov)
  })

  it('stays finite and bounded with extreme zoom or model sizes', () => {
    expect(chaseFraming(1.5, 0)).toEqual(chaseFraming(1.5, .65))
    expect(chaseFraming(1.5, 999)).toEqual(chaseFraming(1.5, 2.2))
    const fallback = chaseFraming(Number.NaN, Number.NaN)
    expect(fallback.distance).toBeGreaterThan(0)
    expect(Number.isFinite(fallback.fov)).toBe(true)
    expect(fallback.fov).toBeGreaterThanOrEqual(40)
    expect(fallback.fov).toBeLessThanOrEqual(74)
  })
})
