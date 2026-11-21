import type { FlightState } from './flight'
import type { Field } from './sim/fields'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** Headings use true north = 0°, east = 90° in the simulator's +Z-forward display coordinates. */
export function wrapHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}
export function angleDifference(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180
}
export type NavTarget = 'runway' | 'approach'
export type LocalWaypoint = { x: number; z: number; label: string }
export type NavigationReadout = {
  heading: number
  track: number | null
  bearing: number
  relativeBearing: number
  course: number
  courseRelative: number
  cdi: number
  crossTrackMeters: number
  distanceMeters: number
  groundspeed: number
  etaSeconds: number | null
  toFrom: 'TO' | 'FROM'
  waypoint: LocalWaypoint
}

/** Local simulator waypoints; never claim these are certified GPS/ILS facilities. */
export function localWaypoint(field: Field, target: NavTarget): LocalWaypoint {
  const { center, heading, length } = field.runway
  const cx = center[0], cz = -center[1]
  if (!length) return { x: cx, z: cz, label: 'BAŞLANGIÇ NOKTASI' }
  if (target === 'runway') return { x: cx, z: cz, label: 'PİST MERKEZİ' }
  const offset = length / 2 + 220
  return {
    x: cx - Math.sin(heading * RAD) * offset,
    z: cz - Math.cos(heading * RAD) * offset,
    label: 'YAKLAŞMA WP',
  }
}

/** Linear navigation over a local procedural airfield, using the aircraft's true simulated position. */
export function navigationReadout(flight: FlightState, field: Field, selectedCourse: number, target: NavTarget): NavigationReadout {
  const course = wrapHeading(selectedCourse)
  const heading = wrapHeading(flight.yaw * DEG)
  const waypoint = localWaypoint(field, target)
  const dx = waypoint.x - flight.position[0]
  const dz = waypoint.z - flight.position[2]
  const bearing = wrapHeading(Math.atan2(dx, dz) * DEG)
  const relativeBearing = angleDifference(bearing, heading)
  const courseRelative = angleDifference(course, heading)
  const groundspeed = Math.hypot(flight.velocity[0], flight.velocity[2])
  const track = groundspeed < 0.5 ? null : wrapHeading(Math.atan2(flight.velocity[0], flight.velocity[2]) * DEG)
  const distanceMeters = Math.hypot(dx, dz)
  const closingSpeed = distanceMeters > 0.5 ? (flight.velocity[0] * dx + flight.velocity[2] * dz) / distanceMeters : 0
  // Signed lateral displacement from a line THROUGH THE FIX, oriented at selected course.
  // Positive means aircraft is right of the course; CDI needle moves left.
  const offsetX = flight.position[0] - waypoint.x
  const offsetZ = flight.position[2] - waypoint.z
  const crossTrackMeters = offsetX * Math.cos(course * RAD) - offsetZ * Math.sin(course * RAD)
  const cdi = Math.abs(crossTrackMeters) < 0.00001 ? 0 : clamp(-crossTrackMeters / 40, -2.5, 2.5)
  const along = dx * Math.sin(course * RAD) + dz * Math.cos(course * RAD)
  return {
    heading, track, bearing, relativeBearing, course, courseRelative, cdi, crossTrackMeters,
    distanceMeters, groundspeed,
    etaSeconds: closingSpeed > 1.5 ? distanceMeters / closingSpeed : null,
    toFrom: along >= 0 ? 'TO' : 'FROM', waypoint,
  }
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '--:--'
  const whole = Math.round(seconds)
  return String(Math.floor(whole / 60)).padStart(2, '0') + ':' + String(whole % 60).padStart(2, '0')
}
