import { describe, expect, it } from 'vitest'
import { signalPosition } from './ControllerSignalRow'

describe('controller calibration display', () => {
  it('places signed sticks at stable track positions', () => {
    expect(signalPosition(-1, -1, 1)).toBe(0)
    expect(signalPosition(0, -1, 1)).toBe(50)
    expect(signalPosition(1, -1, 1)).toBe(100)
    expect(signalPosition(-.5, -1, 1)).toBe(25)
  })

  it('handles button values and clips malformed out-of-range data', () => {
    expect(signalPosition(.5, 0, 1)).toBe(50)
    expect(signalPosition(-10, -1, 1)).toBe(0)
    expect(signalPosition(10, -1, 1)).toBe(100)
  })

  it('does not show a marker before a valid controller sample arrives', () => {
    expect(signalPosition(NaN, -1, 1)).toBeNull()
    expect(signalPosition(Infinity, -1, 1)).toBeNull()
    expect(signalPosition(0, 1, 1)).toBeNull()
  })
})
