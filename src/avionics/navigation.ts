import type { FlightState } from '../flight'
import type { Field } from '../sim/fields'

export type NavWaypoint = {
  id: 'threshold' | 'final' | 'upwind' | 'crosswind'
  label: string
  x: number
  z: number
}
export type NavigationSolution = {
  heading: number
  track: number
  bearing: number
  course: number
  distance: number
  crossTrack: number
  deviation: number
  fullScale: number
  toFrom: 'TO' | 'FROM'
  groundSpeed: number
  closingSpeed: number
  etaSeconds: number | null
}

export function normalizedHeading(value: number): number {
  if (!Number.isFinite(value)) return 0
  return ((value % 360) + 360) % 360
}
export const signedHeadingDelta = (a: number, b: number): number =>
  ((normalizedHeading(a - b) + 540) % 360) - 180

const radians = (degrees: number): number => degrees * Math.PI / 180
const deg = (radiansValue: number): number => radiansValue * 180 / Math.PI
const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value))

/** Local training field: scene +Z is north and +X is east. No GPS/real-world navaid claim. */
export function localWaypoints(field: Field): NavWaypoint[] {
  const { center, heading, length } = field.runway
  const h = radians(heading)
  const dx = Math.sin(h), dz = Math.cos(h)
  const x = center[0] - dx * length * .5
  const z = -center[1] - dz * length * .5
  return [
    { id: 'threshold', label: 'Pist eşiği', x, z },
    { id: 'final', label: 'Son yaklaşma', x: x - dx * 260, z: z - dz * 260 },
    { id: 'upwind', label: 'Kalkış rotası', x: x + dx * (length + 350), z: z + dz * (length + 350) },
    { id: 'crosswind', label: 'Dönüş noktası', x: x + dx * 290 + dz * 230, z: z + dz * 290 - dx * 230 },
  ]
}

export function navigationSolution(flight: FlightState, waypoint: NavWaypoint, courseDegrees: number, fullScale = 80): NavigationSolution {
  const x = flight.position[0], z = flight.position[2]
  const dx = waypoint.x - x, dz = waypoint.z - z
  const distance = Math.hypot(dx, dz)
  const heading = normalizedHeading(deg(flight.yaw))
  const course = normalizedHeading(courseDegrees)
  const r = radians(course)
  const alongEast = Math.sin(r), alongNorth = Math.cos(r)
  const bearing = distance < 1e-6 ? heading : normalizedHeading(deg(Math.atan2(dx, dz)))
  const vx = flight.velocity[0], vz = flight.velocity[2]
  const groundSpeed = Math.hypot(vx, vz)
  const track = groundSpeed < .3 ? heading : normalizedHeading(deg(Math.atan2(vx, vz)))
  // + deviation = aircraft right of inbound course line; +/- 2 dots at full scale.
  const crossTrack = (x - waypoint.x) * alongNorth - (z - waypoint.z) * alongEast
  const scale = Math.max(1, fullScale)
  const deviation = clamp(crossTrack / scale, -1, 1)
  const remainingAlong = dx * alongEast + dz * alongNorth
  const closingSpeed = distance < .01 ? 0 : (dx * vx + dz * vz) / distance
  const etaSeconds = distance > 1 && closingSpeed > .5 ? Math.ceil(distance / closingSpeed) : null
  return {
    heading, track, bearing, course, distance, crossTrack, deviation, fullScale: scale,
    toFrom: remainingAlong >= 0 ? 'TO' : 'FROM',
    groundSpeed, closingSpeed, etaSeconds,
  }
}

export function formatNavDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`
}
export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—:—'
  const safe = Math.min(359999, Math.max(0, Math.ceil(seconds)))
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`
}
