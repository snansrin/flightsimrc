import { describe, expect, it } from 'vitest'
import { calibrateAxis, defaultMapping, defaultTuning, gamepadControls } from './input'

const pad = (axes: number[]) => ({ axes }) as unknown as Gamepad

describe('RC input tuning', () => {
  it('keeps a centered stick at zero and maps throttle endpoints', () => {
    expect(gamepadControls(pad([0, 0, 1, 0]), defaultMapping).throttle).toBe(0)
    expect(gamepadControls(pad([0, 0, -1, 0]), defaultMapping).throttle).toBe(1)
    expect(gamepadControls(pad([.03, 0, 1, 0]), defaultMapping).aileron).toBe(0)
  })
  it('reverses an axis without changing the other controls', () => {
    const normal = gamepadControls(pad([.5, 0, 1, 0]), defaultMapping)
    const reversed = gamepadControls(pad([.5, 0, 1, 0]), defaultMapping, { ...defaultTuning, reversed: { ...defaultTuning.reversed, aileron: true } })
    expect(reversed.aileron).toBeCloseTo(-normal.aileron)
    expect(reversed.throttle).toBe(normal.throttle)
  })
  it('normalizes measured endpoints and rejects invalid calibration', () => {
    const range = { min: -.7, center: .12, max: .8 }
    expect(calibrateAxis(-.7, range)).toBe(-1)
    expect(calibrateAxis(.12, range)).toBe(0)
    expect(calibrateAxis(.8, range)).toBe(1)
    expect(calibrateAxis(.4, { min: 0, center: 0, max: 0 })).toBe(.4)
  })
  it('applies a device calibration to assigned control axes', () => {
    const c = gamepadControls(pad([.46, .12, .8, 0]), defaultMapping, defaultTuning, {
      aileron: { min: -.7, center: .12, max: .8 },
      elevator: { min: -.7, center: .12, max: .8 },
      throttle: { min: -.8, center: 0, max: .8 },
    })
    expect(c.aileron).toBeGreaterThan(.39)
    expect(c.elevator).toBe(0)
    expect(c.throttle).toBe(0)
  })
})
