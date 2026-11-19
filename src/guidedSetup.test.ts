import { describe, expect, it } from 'vitest'
import { findGuidedAxis, guidedRange } from './guidedSetup'

describe('optional guided RC calibration', () => {
  it('detects the yaw stick without accidentally reusing previously assigned sticks', () => {
    const neutral = [0, 0, 0, 0]
    const selected = findGuidedAxis(neutral, [-.3, 0, -.9, 0], ['axis:0', 'axis:1'])
    expect(selected).toBe('axis:2')
    const yaw = guidedRange('rudder', selected!, neutral, -.9, .85)
    expect(yaw).toEqual({ min: .85, center: 0, max: -.9 })
  })

  it('accepts a left yaw endpoint when the user captures it after center and right', () => {
    const neutral = [0, 0, 0, 0]
    const source = findGuidedAxis(neutral, [0, 0, 0, .9], ['axis:0', 'axis:1', 'axis:2'])
    expect(source).toBe('axis:3')
    expect(guidedRange('rudder', source!, neutral, .9, -.85)).toEqual({ min: -.85, center: 0, max: .9 })
  })

  it('rejects missing data and same-side positions with a useful retry path', () => {
    expect(findGuidedAxis([0, 0, 0], [0, .01, -.04], [])).toBeNull()
    expect(findGuidedAxis([0, 0], [.9, 0], ['axis:0'])).toBeNull()
    expect(guidedRange('rudder', 'axis:3', [0, 0, 0, 0], .7, .6)).toBeUndefined()
    expect(guidedRange('rudder', 'axis:3', [0, 0, 0, 0], .8, NaN)).toBeUndefined()
    expect(guidedRange('rudder', 'axis:7', [0, 0, 0, 0], .8, -.8)).toBeUndefined()
  })

  it('supports throttle calibration at half stick in either report direction', () => {
    expect(guidedRange('throttle', 'axis:3', [0, 0, 0, 0], 1, -1)).toEqual({ min: -1, center: 0, max: 1 })
    expect(guidedRange('throttle', 'axis:3', [0, 0, 0, 0], -1, 1)).toEqual({ min: 1, center: 0, max: -1 })
  })
})
