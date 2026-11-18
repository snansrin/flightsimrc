import { describe, expect, it } from 'vitest'
import { applyDisplayControls, newFlightSimulation, physicsFieldId, toDisplayFlight } from './bridge'

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
    for (const [kind, spec] of Object.entries({ trainer: 'trainer1500', jet: 'edf90', drone: 'quad5', helicopter: 'heli500' })) {
      const sim = newFlightSimulation(kind as 'trainer' | 'jet' | 'drone' | 'helicopter', 1)
      expect(sim.spec.id).toBe(spec)
      expect(sim.field.id).toBe('ege')
    }
    expect(physicsFieldId(999)).toBe('kuzey')
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
})
