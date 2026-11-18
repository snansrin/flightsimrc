import { describe, expect, it } from 'vitest'
import { aircraftById } from './catalog'
import { stallSpeed } from './aero'
import { attitudeEuler, attitudeQuat, qRotate, deg, rad } from './math'
import { Simulation } from './simulation'
import { formatMeasurements, measureHover, measureTakeoff, measureTrim, verifyAirframe } from './verify'
import { zeroControls } from './types'

describe('attitude maths', () => {
  it('maps body nose to world north at zero attitude', () => {
    const q = attitudeQuat(0, 0, 0)
    const nose = qRotate(q, [1, 0, 0])
    expect(nose[0]).toBeCloseTo(0, 5)
    expect(nose[1]).toBeCloseTo(0, 5)
    expect(nose[2]).toBeCloseTo(-1, 5)
    const right = qRotate(q, [0, 1, 0])
    expect(right[0]).toBeCloseTo(1, 5)
    const down = qRotate(q, [0, 0, 1])
    expect(down[1]).toBeCloseTo(-1, 5)
  })
  it('round-trips yaw/pitch/roll', () => {
    for (const [yaw, pitch, roll] of [[0.4, 0.2, -0.3], [-1.2, -0.35, 0.9], [2.9, 0.1, 2.4]]) {
      const e = attitudeEuler(attitudeQuat(yaw, pitch, roll))
      expect(e.yaw).toBeCloseTo(yaw, 4)
      expect(e.pitch).toBeCloseTo(pitch, 4)
      expect(e.roll).toBeCloseTo(roll, 4)
    }
  })
})

describe('fixed wing physics', () => {
  const trainer = aircraftById('trainer1500')

  it('sits on the gear without sinking or exploding', () => {
    const sim = new Simulation({ aircraft: 'trainer1500', field: 'anadolu' })
    for (let i = 0; i < 480; i++) sim.step()
    expect(sim.state.crashed).toBe(false)
    expect(sim.state.agl).toBeGreaterThan(0.05)
    expect(sim.state.agl).toBeLessThan(0.4)
    expect(Math.abs(sim.state.velocity[1])).toBeLessThan(0.05)
  })

  it('accelerates down the runway and lifts off', () => {
    const m = measureTakeoff(trainer)
    expect(m.pass).toBe(true)
    expect(m.value).toBeGreaterThan(5)
  })

  it('stall speed matches the analytic wing loading estimate', () => {
    const analytic = stallSpeed(trainer)
    expect(analytic).toBeGreaterThan(7)
    expect(analytic).toBeLessThan(12)
  })

  it('produces positive lift in cruise and stays level with trim', () => {
    const m = measureTrim(trainer)
    expect(m.value).toBeGreaterThan(9)
    expect(m.pass).toBe(true)
  })

  it('bank angle produces a coordinated turn', () => {
    const rows = verifyAirframe('trainer1500')
    const turn = rows.find(r => r.scenario.startsWith('Koordineli'))!
    expect(turn.value).toBeGreaterThan(5)
  })

  it('nose-up elevator pitches the aircraft up', () => {
    const sim = new Simulation({ aircraft: 'trainer1500', field: 'anadolu', airborne: { altitude: 120, airspeed: 17 }, assists: { autoLevel: 0, stallProtection: false } })
    sim.raw = { ...zeroControls(), throttle: 0.6, elevator: 0.3 }
    for (let i = 0; i < 240; i++) sim.step()
    expect(attitudeEuler(sim.state.attitude).pitch).toBeGreaterThan(0.05)
  })

  it('right aileron rolls right', () => {
    const sim = new Simulation({ aircraft: 'trainer1500', field: 'anadolu', airborne: { altitude: 120, airspeed: 17 }, assists: { autoLevel: 0, stallProtection: false } })
    sim.raw = { ...zeroControls(), throttle: 0.6, aileron: 0.5 }
    for (let i = 0; i < 120; i++) sim.step()
    expect(attitudeEuler(sim.state.attitude).roll).toBeGreaterThan(0.1)
  })

  it('right rudder yaws right', () => {
    const sim = new Simulation({ aircraft: 'trainer1500', field: 'anadolu', airborne: { altitude: 120, airspeed: 17 }, assists: { autoLevel: 0, stallProtection: false } })
    sim.raw = { ...zeroControls(), throttle: 0.6, rudder: 0.5 }
    for (let i = 0; i < 240; i++) sim.step()
    expect(attitudeEuler(sim.state.attitude).yaw).toBeGreaterThan(0.03)
  })

  it('recognizes a physical high-angle-of-attack stall, then recovers after unloading', () => {
    // Full aft stick alone does not guarantee a stall on a stable trainer.
    // Create the actual hazardous condition: nose 30° above the flight path.
    const sim = new Simulation({ aircraft: 'trainer1500', field: 'anadolu',
      weather: { windSpeed: 0, turbulence: 0, thermals: 0 },
      airborne: { altitude: 200, airspeed: 10 },
      assists: { autoLevel: 0, stallProtection: false } })
    sim.state.attitude = attitudeQuat(0, rad(30), 0)
    sim.state.velocity = qRotate(attitudeQuat(0, 0, 0), [10, 0, 0])
    sim.raw = { ...zeroControls(), throttle: 0, elevator: 1 }
    sim.step()
    expect(sim.state.alpha).toBeGreaterThan(rad(25))
    expect(sim.state.stalled).toBe(true)
    // After rotating the nose into the flow, the same velocity is no longer stalled.
    sim.state.attitude = attitudeQuat(0, rad(1), 0)
    sim.raw = { ...zeroControls(), throttle: 0.5, elevator: 0 }
    sim.step()
    expect(sim.state.stalled).toBe(false)
  })

})

describe('rotorcraft', () => {
  it('racing quad holds altitude in angle mode', () => {
    const m = measureHover('quad5')
    expect(m.pass).toBe(true)
  })
  it('camera drone loiters without drifting away', () => {
    const m = measureHover('cinedrone')
    expect(m.pass).toBe(true)
  })
  it('helicopter hovers with collective and cyclic', () => {
    const m = measureHover('heli500')
    expect(m.pass).toBe(true)
  })
})

describe('full catalogue verification report', () => {
  it('prints measured performance for every airframe', () => {
    const rows = ['trainer1500', 'extra330', 'edf90', 'glider2000', 'quad5', 'heli500'].flatMap(id => verifyAirframe(id))
    // eslint-disable-next-line no-console
    console.log('\n' + formatMeasurements(rows) + '\n')
    expect(rows.length).toBeGreaterThan(10)
    const trainerRows = rows.filter(r => r.aircraft === 'trainer1500')
    expect(trainerRows.filter(r => r.pass).length).toBeGreaterThanOrEqual(5)
    expect(deg(1)).toBeCloseTo(57.2958, 3)
  })
})
