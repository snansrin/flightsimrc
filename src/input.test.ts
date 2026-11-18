import { describe, expect, it } from 'vitest'
import { defaultMapping, defaultTuning, gamepadControls } from './input'

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
})
