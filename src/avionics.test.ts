import { describe, expect, it } from 'vitest'
import { angleDifference, formatEta, localWaypoint, navigationReadout, wrapHeading } from './avionics'
import { fields } from './sim/fields'
import { initialFlight } from './flight'

const field = fields[0]
const flight = (position: [number, number, number], yaw = 0, velocity: [number, number, number] = [0, 0, 0]) =>
  ({ ...initialFlight(), position, yaw, velocity })

describe('local HSI navigation', () => {
  it('wraps headings across north without a discontinuity', () => {
    expect(wrapHeading(-10)).toBe(350)
    expect(wrapHeading(370)).toBe(10)
    expect(angleDifference(5, 355)).toBe(10)
    expect(angleDifference(355, 5)).toBe(-10)
  })
  it('calculates true bearing and distance to the runway reference', () => {
    const nav = navigationReadout(flight([0, 20, -100], 0, [0, 0, 10]), field, 0, 'runway')
    expect(nav.bearing).toBe(0)
    expect(nav.distanceMeters).toBe(100)
    expect(nav.crossTrackMeters).toBe(0)
    expect(nav.cdi).toBe(0)
    expect(nav.toFrom).toBe('TO')
    expect(nav.etaSeconds).toBe(10)
  })
  it('deflects CDI in the correct direction and shows TO/FROM correctly', () => {
    const east = navigationReadout(flight([40, 20, -100]), field, 0, 'runway')
    expect(east.crossTrackMeters).toBe(40)
    expect(east.cdi).toBe(-1)
    const west = navigationReadout(flight([-40, 20, -100]), field, 0, 'runway')
    expect(west.cdi).toBe(1)
    const pastFix = navigationReadout(flight([0, 20, 50]), field, 0, 'runway')
    expect(pastFix.toFrom).toBe('FROM')
  })
  it('rotates heading and displays bearing-relative direction', () => {
    const eastbound = navigationReadout(flight([0, 20, -100], Math.PI / 2), field, 0, 'runway')
    expect(eastbound.heading).toBe(90)
    expect(eastbound.relativeBearing).toBe(-90)
    expect(eastbound.courseRelative).toBe(-90)
  })
  it('does not invent an ETA when flying away from the selected waypoint', () => {
    const outbound = navigationReadout(flight([0, 20, -100], 0, [0, 0, -12]), field, 0, 'runway')
    expect(outbound.groundspeed).toBe(12)
    expect(outbound.etaSeconds).toBeNull()
  })
  it('uses an independent local approach waypoint and does not invent an ETA at standstill', () => {
    const wp = localWaypoint(field, 'approach')
    expect(wp.z).toBeLessThan(0)
    const nav = navigationReadout(flight([0, 0, 0]), field, field.runway.heading, 'approach')
    expect(nav.etaSeconds).toBeNull()
    expect(nav.track).toBeNull()
    expect(formatEta(null)).toBe('--:--')
    expect(formatEta(75)).toBe('01:15')
  })
})
