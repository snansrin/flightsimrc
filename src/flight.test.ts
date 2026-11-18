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
  it('keeps a released aileron from banking indefinitely', () => {
    let s = { ...initialFlight(), position: [0, 30, 0] as [number, number, number], velocity: [0, 0, 15] as [number, number, number] }
    for (let i = 0; i < 60; i++) s = stepFlight(s, { throttle: .55, aileron: .35, elevator: 0, rudder: 0 }, 1 / 60)
    const bank = s.roll
    for (let i = 0; i < 240; i++) s = stepFlight(s, { throttle: .55, aileron: 0, elevator: 0, rudder: 0 }, 1 / 60)
    expect(Math.abs(s.roll)).toBeLessThan(Math.abs(bank))
    expect(Math.abs(s.roll)).toBeLessThan(.12)
  })
  it('glides forward and down with the motor off', () => {
    let s = { ...initialFlight(), position: [0, 30, 0] as [number, number, number], velocity: [0, 0, 14] as [number, number, number], pitch: .1 }
    for (let i = 0; i < 180; i++) s = stepFlight(s, { throttle: 0, aileron: 0, elevator: 0, rudder: 0 }, 1 / 60)
    expect(s.position[2]).toBeGreaterThan(20)
    expect(s.position[1]).toBeLessThan(30)
    expect(s.crashed).toBe(false)
  })
  it('does not instantaneously rotate sideways velocity with heading', () => {
    const s = { ...initialFlight(), position: [0, 20, 0] as [number, number, number], velocity: [0, 0, 16] as [number, number, number], yaw: .5 }
    const next = stepFlight(s, { throttle: .5, aileron: 0, elevator: 0, rudder: 0 }, 1 / 60)
    expect(Math.abs(next.velocity[0])).toBeLessThan(.3)
  })
  it('keeps a crosswind as air-relative flow without teleporting the aircraft', () => {
    const s = { ...initialFlight(), position: [0, 15, 0] as [number, number, number], velocity: [0, 0, 13] as [number, number, number] }
    const next = stepFlight(s, { throttle: .5, aileron: 0, elevator: 0, rudder: 0 }, 1 / 60, 4)
    expect(Math.abs(next.velocity[0])).toBeLessThan(.2)
    expect(next.airspeed).toBeGreaterThan(13)
  })
  it('remains bounded through a long neutral trainer flight', () => {
    let s = { ...initialFlight(), position: [0, 45, 0] as [number, number, number], velocity: [0, 0, 15] as [number, number, number], pitch: .1 }
    for (let i = 0; i < 1200; i++) {
      s = stepFlight(s, { throttle: .55, aileron: 0, elevator: 0, rudder: 0 }, 1 / 60)
      expect([...s.position, ...s.velocity, s.roll, s.pitch, s.yaw].every(Number.isFinite)).toBe(true)
    }
    expect(s.crashed).toBe(false)
    expect(s.airspeed).toBeGreaterThan(8)
    expect(s.airspeed).toBeLessThan(25)
    expect(Math.abs(s.roll)).toBeLessThan(.1)
    expect(s.position[1]).toBeGreaterThan(2)
  })
  it('accepts a shallow, wings-level touchdown', () => {
    let s = { ...initialFlight(), position: [0, .45, 0] as [number, number, number], velocity: [0, -1.1, 10] as [number, number, number], pitch: .06 }
    for (let i = 0; i < 60 && s.position[1] > .25; i++) s = stepFlight(s, { throttle: 0, aileron: 0, elevator: 0, rudder: 0 }, 1 / 60)
    expect(s.position[1]).toBe(.25)
    expect(s.crashed).toBe(false)
    expect(s.velocity[1]).toBe(0)
  })
})
