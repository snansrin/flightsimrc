import { describe, expect, it } from 'vitest'
import { fields } from '../sim/fields'
import type { FlightState } from '../flight'
import { localWaypoints, navigationSolution, normalizedHeading, signedHeadingDelta, formatEta, formatNavDistance } from './navigation'

const sample = (x: number, z: number, yaw = 0, vx = 0, vz = 0): FlightState => ({
  position: [x, 20, z], velocity: [vx, 0, vz], yaw, pitch: 0, roll: 0, rollRate: 0, pitchRate: 0,
  yawRate: 0, airspeed: Math.hypot(vx, vz), angleOfAttack: 0, crashed: false, stalled: false,
})

describe('local runway navigation', () => {
  it('uses exact runway geometry in the scene coordinate system', () => {
    const field = fields[0]
    const waypoints = localWaypoints(field)
    const threshold = waypoints[0]
    expect(threshold.x).toBeCloseTo(field.runway.center[0], 5)
    expect(threshold.z).toBeCloseTo(-field.runway.center[1] - field.runway.length / 2, 5)
    expect(waypoints).toHaveLength(4)
  })
  it('reports north bearing, true ground track and closing ETA in seconds', () => {
    const nav = navigationSolution(sample(0, 0, 0, 0, 10), { id: 'threshold', label: 'WP', x: 0, z: 100 }, 0, 100)
    expect(nav.bearing).toBe(0)
    expect(nav.heading).toBe(0)
    expect(nav.track).toBe(0)
    expect(nav.distance).toBe(100)
    expect(nav.crossTrack).toBe(0)
    expect(nav.etaSeconds).toBe(10)
    expect(nav.toFrom).toBe('TO')
  })
  it('moves CDI right when east of a northbound inbound course', () => {
    const nav = navigationSolution(sample(40, 0, 0, 0, 4), { id: 'threshold', label: 'WP', x: 0, z: 100 }, 0, 80)
    expect(nav.crossTrack).toBeCloseTo(40)
    expect(nav.deviation).toBe(.5)
    expect(nav.bearing).toBeGreaterThan(330)
  })
  it('respects rotated course vectors and marks a waypoint behind as FROM', () => {
    const nav = navigationSolution(sample(0, 50, Math.PI / 2), { id: 'threshold', label: 'WP', x: 100, z: 0 }, 90)
    expect(nav.heading).toBeCloseTo(90)
    expect(nav.crossTrack).toBeCloseTo(-50)
    expect(nav.toFrom).toBe('TO')
    const behind = navigationSolution(sample(150, 0), { id: 'threshold', label: 'WP', x: 100, z: 0 }, 90)
    expect(behind.toFrom).toBe('FROM')
    expect(behind.etaSeconds).toBeNull()
  })
  it('bounds CDI and heading and formats nav units without fake position claims', () => {
    const nav = navigationSolution(sample(10000, 0), { id: 'threshold', label: 'WP', x: 0, z: 0 }, 0, 80)
    expect(nav.deviation).toBe(1)
    expect(normalizedHeading(-5)).toBe(355)
    expect(signedHeadingDelta(5, 355)).toBe(10)
    expect(formatEta(null)).toBe('—:—')
    expect(formatEta(75)).toBe('01:15')
    expect(formatNavDistance(250)).toBe('250 m')
    expect(formatNavDistance(1520)).toBe('1.52 km')
  })
})
