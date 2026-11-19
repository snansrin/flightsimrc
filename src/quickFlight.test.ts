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
})
