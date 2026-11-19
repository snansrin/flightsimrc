import { describe, expect, it } from 'vitest'
import { fieldById, groundTractionAt, ridgeLiftAt } from './fields'
import { groundContact } from './rigidBody'
import { Simulation } from './simulation'
import { zeroControls } from './types'

describe('field and aircraft interaction', () => {
  it('reverses the vertical flow when the wind reverses and fades above the ridge', () => {
    const field = { ...fieldById('alp'), height: (_x: number, z: number) => z * .3 }
    const lift = ridgeLiftAt(field, 200, 20, 10, [0, 0, 5])
    expect(lift).toBeGreaterThan(0)
    expect(ridgeLiftAt(field, 200, 20, 10, [0, 0, -5])).toBeCloseTo(-lift)
    expect(ridgeLiftAt(field, 200, 20, 10, [5, 0, 0])).toBe(0)
    expect(ridgeLiftAt(field, 200, 20, 170, [0, 0, 5])).toBeLessThan(lift / 10)
  })

  it('increases wheel drag on turf and applies brakes only on command', () => {
    const sim = new Simulation({ aircraft: 'trainer1500' })
    const state = { ...sim.state, position: [0, .17, 0] as [number, number, number], velocity: [0, 0, -5] as [number, number, number] }
    const asphalt = groundContact(sim.spec, state, zeroControls(), sim.env, 1 / 240)
    const grass = { ...sim.env, groundTraction: () => groundTractionAt(fieldById('alp'), 0, 0) }
    expect(groundContact(sim.spec, state, zeroControls(), grass, 1 / 240).forceWorld[2]).toBeGreaterThan(asphalt.forceWorld[2])
    const brake = zeroControls()
    brake.aux[1] = 1
    expect(groundContact(sim.spec, state, brake, sim.env, 1 / 240).forceWorld[2]).toBeGreaterThan(asphalt.forceWorld[2])
  })

  it('keeps the entire lagoon runway underwater and only reports a splash on contact', () => {
    const lagoon = fieldById('ada')
    for (const z of [-100, 0, 100]) expect(lagoon.height(0, z)).toBeLessThan(lagoon.waterLevel)
    const sim = new Simulation({ aircraft: 'float1200', field: lagoon.id, airborne: { altitude: 10, airspeed: 12 } })
    expect(sim.state.agl).toBeCloseTo(10)
    expect(groundContact(sim.spec, sim.state, zeroControls(), sim.env, 1 / 240).inWater).toBe(false)
    const onWater = new Simulation({ aircraft: 'float1200', field: lagoon.id })
    onWater.update(.15)
    expect(onWater.state.agl).toBeLessThan(.5)
    expect(onWater.state.crashed).toBe(false)
  })
})
