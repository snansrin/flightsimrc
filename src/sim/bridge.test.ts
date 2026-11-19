import { describe, expect, it } from 'vitest'
import { applyDisplayControls, newFlightSimulation, physicsFieldId, toDisplayFlight } from './bridge'
import { hangar } from '../hangar'
import { fields, runwayAxis, startOnRunway } from './fields'

describe('legacy scene and modern physics bridge', () => {
  it('preserves the runway position and maps the northbound physics axis to the scene', () => {
    const sim = newFlightSimulation('trainer')
    expect(sim.spec.id).toBe('trainer1500')
    const view = toDisplayFlight(sim)
    expect(view.position[2]).toBeLessThan(-30)
    expect(view.position[1]).toBeGreaterThan(0)
    expect(view.crashed).toBe(false)
  })
  it('routes each model to its own flight physics and selects a supported airfield', () => {
    for (const { id, spec } of hangar) {
      const sim = newFlightSimulation(id, 1)
      expect(sim.spec).toBe(spec)
      expect(sim.field.id).toBe('ege')
    }
    expect(physicsFieldId(6)).toBe('ada')
    expect(physicsFieldId(999)).toBe('anadolu')
  })
  it('aligns an angled runway spawn with the departure axis', () => {
    const field = { ...fields[0], runway: { ...fields[0].runway, heading: 90, center: [4, 12] as [number, number] } }
    const start = startOnRunway(field)
    const direction = runwayAxis(field)
    const distance = field.runway.length / 2 - 6
    expect(start.position[0] + direction[0] * distance).toBeCloseTo(field.runway.center[0])
    expect(start.position[2] + direction[2] * distance).toBeCloseTo(field.runway.center[1])
  })
  it('drives the active physics model without corrupting the network/HUD state', () => {
    const sim = newFlightSimulation('drone')
    applyDisplayControls(sim, { throttle: 0.55, aileron: 0, elevator: 0, rudder: 0 })
    expect(sim.raw.aux[0]).toBe(1)
    for (let i = 0; i < 60; i++) sim.update(1 / 60)
    const view = toDisplayFlight(sim)
    expect(view.position.every(Number.isFinite)).toBe(true)
    expect(view.airspeed).toBeGreaterThanOrEqual(0)
    expect(view.crashed).toBe(false)
  })
  it('restores model-specific assists on model switch', () => {
    const sim = newFlightSimulation('trainer')
    sim.reset({ aircraft: 'extra330' })
    expect(sim.assists.autoLevel).toBe(0)
    sim.reset({ aircraft: 'trainer1500' })
    expect(sim.assists.autoLevel).toBeGreaterThan(0)
  })
  it('suppresses a stall advisory on the runway without hiding an airborne stall', () => {
    const sim = newFlightSimulation('glider2000', 2)
    sim.state.stalled = true
    expect(toDisplayFlight(sim).stalled).toBe(false)
    sim.state.onGround = false
    sim.state.agl = 2
    expect(toDisplayFlight(sim).stalled).toBe(true)
  })
})
