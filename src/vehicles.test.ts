import { describe, expect, it } from 'vitest'
import { initialVehicle, stepVehicle, vehicles } from './vehicles'

const neutral = { throttle: 0, aileron: 0, elevator: 0, rudder: 0 }

describe('vehicle selection and dynamics', () => {
  it('provides four distinct selectable aircraft classes', () => {
    expect(vehicles.map(v => v.id)).toEqual(['trainer', 'drone', 'helicopter', 'jet'])
  })
  it.each(['drone', 'helicopter'] as const)('%s climbs with high collective and remains finite', kind => {
    let state = initialVehicle(kind)
    for (let i = 0; i < 120; i++) state = stepVehicle(kind, state, { ...neutral, throttle: .72 }, 1 / 60)
    expect(state.position[1]).toBeGreaterThan(2)
    expect(state.position.every(Number.isFinite)).toBe(true)
  })
  it('gives the jet a higher low-speed stall threshold than the trainer', () => {
    const flight = { ...initialVehicle('jet'), position: [0, 10, 0] as [number, number, number], velocity: [0, 0, 10] as [number, number, number] }
    expect(stepVehicle('jet', flight, neutral, 1 / 60).stalled).toBe(true)
    expect(stepVehicle('trainer', flight, neutral, 1 / 60).stalled).toBe(false)
  })
  it('tilts a hovering drone forward under forward stick input', () => {
    let state = { ...initialVehicle('drone'), position: [0, 3, 0] as [number, number, number] }
    for (let i = 0; i < 60; i++) state = stepVehicle('drone', state, { ...neutral, throttle: .5, elevator: .4 }, 1 / 60)
    expect(state.pitch).toBeLessThan(0)
    expect(state.position[2]).toBeGreaterThan(0)
  })
})
