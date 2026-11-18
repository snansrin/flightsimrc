import { describe, expect, it } from 'vitest'
import { calibrateAxis, defaultChannels, defaultMapping, defaultTuning, detectMovedAxis, detectMovedSource, gamepadControls, normalizeSource, readSource } from './input'

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
    expect(calibrateAxis(1, { min: 1, center: 0, max: -1 })).toBe(-1)
    expect(calibrateAxis(0, { min: 1, center: 0, max: -1 })).toBe(0)
    expect(calibrateAxis(-1, { min: 1, center: 0, max: -1 })).toBe(1)
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
  it('finds the moved stick axis without reacting to jitter', () => {
    expect(detectMovedAxis([0, 0, -1, 0], [.01, -.02, -.98, 0])).toBeNull()
    expect(detectMovedAxis([0, 0, -1, 0], [.01, -.02, .6, 0])).toBe(2)
    expect(detectMovedAxis([0, 0], [0])).toBeNull()
  })
  it('reads channels beyond eight axes and analog button channels', () => {
    const device = { axes: Array.from({ length: 16 }, (_, i) => i === 11 ? .75 : 0), buttons: [{ value: .8 }] } as unknown as Gamepad
    expect(readSource(device, 'axis:11')).toBe(.75)
    expect(readSource(device, 'button:0')).toBeCloseTo(.6)
    expect(gamepadControls(device, { ...defaultMapping, aileron: 'axis:11' }).aileron).toBeGreaterThan(.6)
    expect(gamepadControls(device, { ...defaultMapping, aileron: 'button:0' }).aileron).toBeGreaterThan(.49)
  })
  it('detects button channels and migrates old numeric mappings', () => {
    expect(detectMovedSource([0, 0], [0, .02], [0, 0], [0, 1])).toBe('button:1')
    expect(detectMovedSource(Array(12).fill(0), [...Array(11).fill(0), .8], [], [])).toBe('axis:11')
    expect(normalizeSource(11, 'axis:0')).toBe('axis:11')
    expect(normalizeSource('axis:9999', 'axis:0')).toBe('axis:0')
  })
  it('builds a channel panel from each device reported inputs', () => {
    expect(defaultChannels(7, 0).auxiliary).toEqual(['axis:4', 'axis:5', 'axis:6'])
    expect(defaultChannels(16, 0).auxiliary).toHaveLength(12)
    expect(defaultChannels(2, 2).mapping.throttle).toBe('button:0')
    expect(defaultChannels(0, 0).auxiliary).toHaveLength(0)
  })
})
