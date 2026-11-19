import { describe, expect, it } from 'vitest'
import { axisSignalSummary, calibrationRange, calibrateAxis, defaultChannels, defaultMapping, defaultTuning, detectMovedAxis, detectMovedSource, gamepadControls, hasTravel, normalizeSource, observeTravel, readSource, type Travel } from './input'

const pad = (axes: number[]) => ({ axes }) as unknown as Gamepad

it('counts actual movement without counting the T12D midpoint channels or jitter', () => {
  const ranges: (Travel | undefined)[] = []
  observeTravel(ranges, [-1, -1, -1, -1, 0, -1, 0, -1])
  observeTravel(ranges, [-1, -1, -1, -1, 0, -1, .007, -1])
  expect(ranges.filter(hasTravel)).toHaveLength(0)
  observeTravel(ranges, [-.67, -.71, -.44, -.52, 0, -1, 0, -1])
  expect(ranges.filter(hasTravel)).toHaveLength(4)
})

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
describe('guided setup', () => {
  it('calibrates a reversed narrow-range stick and throttle from observed endpoints', () => {
    expect(calibrationRange('aileron', .64, .27, .46)).toEqual({ min: .64, center: .46, max: .27 })
    const throttle = calibrationRange('throttle', .86, -.73, .86)
    expect(gamepadControls(pad([0, 0, .86, 0]), defaultMapping, {
      ...defaultTuning, reversed: { ...defaultTuning.reversed, throttle: false },
    }, { throttle }).throttle).toBe(0)
    expect(calibrationRange('rudder', -.03, .04, 0)).toBeUndefined()
  })
  it('fails to idle when the throttle report is missing or has not arrived', () => {
    expect(gamepadControls(pad([0, 0, NaN, 0]), defaultMapping).throttle).toBe(0)
    expect(gamepadControls(pad([]), defaultMapping).throttle).toBe(0)
  })
})


describe('FPV rate tuning and signal health', () => {
  it('distinguishes device-reported axes from received and moving axes', () => {
    const ranges: (Travel | undefined)[] = []
    observeTravel(ranges, [-1, -1, NaN, 0])
    observeTravel(ranges, [-.5, -1, NaN, .01])
    expect(axisSignalSummary([-.5, -1, NaN, .01], ranges)).toEqual({ reported: 4, received: 3, moving: 1 })
  })
  it('scales and clamps FPV rates without affecting throttle', () => {
    const device = pad([.5, .5, 1, .5])
    const normal = gamepadControls(device, defaultMapping)
    const fast = gamepadControls(device, defaultMapping, { ...defaultTuning, rates: { aileron: 2, elevator: 2, rudder: 2 } })
    expect(fast.aileron).toBeGreaterThan(normal.aileron)
    expect(fast.elevator).toBeLessThan(normal.elevator)
    expect(fast.throttle).toBe(normal.throttle)
    expect(gamepadControls(pad([1, 1, 1, 1]), defaultMapping, { ...defaultTuning, rates: { aileron: 2, elevator: 2, rudder: 2 } }).aileron).toBe(1)
  })
  it('retains original behavior with a legacy profile missing rates', () => {
    const legacy = { reversed: defaultTuning.reversed, deadzone: .06, expo: .2 } as typeof defaultTuning
    expect(gamepadControls(pad([.4, 0, 1, 0]), defaultMapping, legacy)).toEqual(gamepadControls(pad([.4, 0, 1, 0]), defaultMapping, defaultTuning))
  })
})
