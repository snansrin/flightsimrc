import { describe, expect, it } from 'vitest'
import { defaultMapping, defaultTuning, gamepadControls, type Mapping } from './input'
import { prepareQuickFlight } from './quickFlight'

const device = (axes: number[]) => ({ axes, buttons: [], mapping: '' }) as unknown as Gamepad
const check = (axes: number[], mapping: Mapping = defaultMapping) => prepareQuickFlight(device(axes), mapping, defaultTuning)

describe('one-click flight without manual calibration', () => {
  it('accepts a T12D at idle with raw throttle -1 and enables flight', () => {
    const result = check([0, 0, -1, 0])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tuning.reversed.throttle).toBe(false)
    expect(gamepadControls(device([0, 0, -1, 0]), defaultMapping, result.tuning, result.calibration).throttle).toBe(0)
    expect(gamepadControls(device([0, 0, 1, 0]), defaultMapping, result.tuning, result.calibration).throttle).toBe(1)
  })

  it('accepts idle at +1 and automatically reverses throttle', () => {
    const result = check([0, 0, 1, 0])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tuning.reversed.throttle).toBe(true)
    expect(gamepadControls(device([0, 0, 1, 0]), defaultMapping, result.tuning, result.calibration).throttle).toBe(0)
    expect(gamepadControls(device([0, 0, -1, 0]), defaultMapping, result.tuning, result.calibration).throttle).toBe(1)
  })

  it('supports narrow raw travel endpoints and minor center drift without wizard', () => {
    const result = check([.12, -.1, -.75, .05])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const idle = gamepadControls(device([.12, -.1, -.75, .05]), defaultMapping, result.tuning, result.calibration)
    expect(idle.throttle).toBe(0)
    expect(idle.aileron).toBe(0)
    expect(idle.elevator).toBe(0)
    expect(idle.rudder).toBe(0)
    expect(gamepadControls(device([.7, -.1, .75, .05]), defaultMapping, result.tuning, result.calibration).throttle).toBeGreaterThan(.8)
  })

  it('rejects a throttle near midpoint rather than pretending it is idle', () => {
    const result = check([0, 0, .1, 0])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('Gaz')
  })

  it('rejects missing / duplicate channels and non-centered sticks', () => {
    expect(check([0, 0, -1, 0], { ...defaultMapping, rudder: defaultMapping.aileron }).ok).toBe(false)
    expect(check([0, 0, Number.NaN, 0]).ok).toBe(false)
    expect(check([.9, 0, -1, 0]).ok).toBe(false)
    expect(check([0, 0, -1]).ok).toBe(false)
  })

  it('honors a manually selected throttle channel instead of assuming a fixed axis index', () => {
    const mapping: Mapping = { ...defaultMapping, throttle: 'axis:5', rudder: 'axis:2' }
    const result = check([0, 0, 0, 0, 0, -1], mapping)
    expect(result.ok).toBe(true)
  })
  it('keeps manual roll/pitch/yaw reverse settings when entering calibration-free flight', () => {
    const customTuning = {
      ...defaultTuning,
      reversed: { aileron: true, elevator: false, rudder: true, throttle: false },
    }
    const started = prepareQuickFlight(device([0, 0, -1, 0]), defaultMapping, customTuning)
    expect(started.ok).toBe(true)
    if (!started.ok) return
    expect(started.tuning.reversed.aileron).toBe(true)
    expect(started.tuning.reversed.elevator).toBe(false)
    expect(started.tuning.reversed.rudder).toBe(true)
    const moved = gamepadControls(device([.6, .5, -.5, .6]), defaultMapping, started.tuning, started.calibration)
    expect(moved.aileron).toBeLessThan(0)
    expect(moved.elevator).toBeGreaterThan(0)
    expect(moved.rudder).toBeLessThan(0)
  })

  it('never overwrites a manually selected throttle direction during quick flight', () => {
    const positiveIdle = prepareQuickFlight(device([0, 0, 1, 0]), defaultMapping, defaultTuning, true)
    expect(positiveIdle.ok).toBe(true)
    if (positiveIdle.ok) expect(positiveIdle.tuning.reversed.throttle).toBe(true)
    const wrongIdle = prepareQuickFlight(device([0, 0, 1, 0]), defaultMapping, defaultTuning, false)
    expect(wrongIdle.ok).toBe(false)
    if (!wrongIdle.ok) expect(wrongIdle.message).toContain('Gaz ters yönü')
    const negativeIdle = prepareQuickFlight(device([0, 0, -1, 0]), defaultMapping, defaultTuning, false)
    expect(negativeIdle.ok).toBe(true)
    if (negativeIdle.ok) expect(negativeIdle.tuning.reversed.throttle).toBe(false)
    const otherWrongIdle = prepareQuickFlight(device([0, 0, -1, 0]), defaultMapping, defaultTuning, true)
    expect(otherWrongIdle.ok).toBe(false)
  })

  it('continues to infer throttle polarity when no manual override is specified', () => {
    const auto = prepareQuickFlight(device([0, 0, 1, 0]), defaultMapping, {
      ...defaultTuning, reversed: { ...defaultTuning.reversed, throttle: false },
    }, null)
    expect(auto.ok).toBe(true)
    if (auto.ok) expect(auto.tuning.reversed.throttle).toBe(true)
  })

})
