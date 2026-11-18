import { describe, expect, it } from 'vitest'
import { initialFlight, stepFlight } from './flight'
describe('trainer dynamics', () => {
  it('accelerates with throttle and remains finite', () => {
    let s = initialFlight()
    for (let i = 0; i < 300; i++) s = stepFlight(s, { throttle: 1, aileron: 0, elevator: 0, rudder: 0 }, 1 / 60)
    expect(Math.hypot(s.velocity[0], s.velocity[2])).toBeGreaterThan(10)
    expect(s.position.every(Number.isFinite)).toBe(true)
  })
  it('keeps a crashed aircraft frozen', () => {
    const s = { ...initialFlight(), crashed: true }
    expect(stepFlight(s, { throttle: 1, aileron: 0, elevator: 0, rudder: 0 }, 1 / 60)).toBe(s)
  })
  it('takes off with sufficient speed and a gentle elevator input', () => {
    let s = initialFlight()
    for (let i = 0; i < 360; i++) s = stepFlight(s, { throttle: 1, aileron: 0, elevator: i > 180 ? .15 : 0, rudder: 0 }, 1 / 60)
    expect(s.position[1]).toBeGreaterThan(2)
    expect(s.crashed).toBe(false)
  })
  it('does not accelerate with no throttle on the runway', () => {
    let s = initialFlight()
    for (let i = 0; i < 120; i++) s = stepFlight(s, { throttle: 0, aileron: 0, elevator: 0, rudder: 0 }, 1 / 60)
    expect(s.position[1]).toBe(.25)
    expect(Math.hypot(s.velocity[0], s.velocity[2])).toBe(0)
  })
  it('builds roll rate before bank angle and turns under bank', () => {
    let s = { ...initialFlight(), position: [0, 15, 0] as [number, number, number], velocity: [0, 0, 16] as [number, number, number] }
    s = stepFlight(s, { throttle: .6, aileron: .35, elevator: 0, rudder: 0 }, 1 / 60)
    expect(s.rollRate).toBeGreaterThan(0)
    expect(s.roll).toBeGreaterThan(0)
    for (let i = 0; i < 90; i++) s = stepFlight(s, { throttle: .6, aileron: .35, elevator: 0, rudder: 0 }, 1 / 60)
    expect(s.yaw).toBeGreaterThan(0)
    expect(s.position[0]).toBeGreaterThan(0)
  })
  it('loses lift when slow and reports a stall', () => {
    const s = { ...initialFlight(), position: [0, 12, 0] as [number, number, number], velocity: [0, 0, 4] as [number, number, number] }
    const next = stepFlight(s, { throttle: 0, aileron: 0, elevator: 0, rudder: 0 }, 1 / 60)
    expect(next.stalled).toBe(true)
    expect(next.velocity[1]).toBeLessThan(0)
  })
})
