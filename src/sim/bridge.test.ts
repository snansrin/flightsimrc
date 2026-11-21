import { describe, expect, it } from 'vitest'
import { applyDisplayControls, newFlightSimulation, physicsFieldId, toDisplayFlight } from './bridge'
import { hangar } from '../hangar'
import { fields, runwayAxis, startOnRunway } from './fields'
import { aerodynamics } from './aero'
import { zeroControls } from './types'

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

  it('keeps four flight channels intact and actuates flap and retractable gear separately', () => {
    const sim = newFlightSimulation('jet')
    sim.reset({ airborne: { altitude: 35, airspeed: 21 } })
    const controls = { throttle: .45, aileron: .2, elevator: -.1, rudder: -.15 }
    applyDisplayControls(sim, controls, { flaps: 1, gearDown: false })
    expect(sim.raw).toMatchObject({ ...controls, flaps: 1 })
    expect(sim.raw.aux[0]).toBe(1)
    sim.step()
    expect(sim.state.flapPosition).toBeGreaterThan(0)
    expect(sim.state.flapPosition).toBeLessThan(1)
    expect(sim.state.gearPosition).toBeLessThan(1)
    applyDisplayControls(sim, controls)
    expect(sim.raw.flaps).toBe(0)
    expect(sim.raw.aux[0]).toBe(0)
    const clean = aerodynamics(sim.spec, sim.state, zeroControls(), sim.env)
    const flap = aerodynamics(sim.spec, sim.state, { ...zeroControls(), flaps: 1 }, sim.env)
    expect(flap.drag).toBeGreaterThan(clean.drag)
    expect(flap.lift).toBeGreaterThan(clean.lift)
    const trainer = newFlightSimulation('trainer')
    applyDisplayControls(trainer, controls, { flaps: 1, gearDown: false })
    expect(trainer.raw).toMatchObject({ ...controls, flaps: 0 })
    expect(trainer.raw.aux[0]).toBe(0)
  })

  it('places the Chatfield departure on its photographed runway at the local field pressure altitude', () => {
    const sim = newFlightSimulation('trainer', 7)
    expect(sim.field.id).toBe('chatfield')
    expect(sim.headingDegrees).toBeCloseTo(90)
    const [x, y, z] = sim.state.position
    expect(sim.field.height(x, z)).toBeCloseTo(0)
    expect(sim.field.height(sim.field.runway.center[0] + 119, sim.field.runway.center[1] + 24)).toBeCloseTo(0)
    expect(y).toBeGreaterThan(0)
    expect(sim.env.density).toBeLessThan(1.1)
    expect(sim.field.height(-800, -700)).toBeLessThan(-5)
  })
})
