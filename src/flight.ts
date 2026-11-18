export type Controls = { throttle: number; aileron: number; elevator: number; rudder: number }
export type FlightState = {
  position: [number, number, number]
  velocity: [number, number, number]
  yaw: number
  pitch: number
  roll: number
  crashed: boolean
  stalled: boolean
}

const GROUND_HEIGHT = .25
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export const initialFlight = (): FlightState => ({
  position: [0, GROUND_HEIGHT, -55], velocity: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, crashed: false, stalled: false,
})

// A fixed-step, air-relative trainer approximation. Tuned for a 1.5 m RC high-wing model.
// Coefficients are illustrative until validated against flight test data or a reference FDM.
export function stepFlight(state: FlightState, controls: Controls, dt: number, crosswind = 0): FlightState {
  if (state.crashed || dt <= 0) return state
  const [x, y, z] = state.position
  const [vx, vy, vz] = state.velocity
  const c = {
    throttle: clamp(controls.throttle, 0, 1),
    aileron: clamp(controls.aileron, -1, 1),
    elevator: clamp(controls.elevator, -1, 1),
    rudder: clamp(controls.rudder, -1, 1),
  }
  const airX = vx - crosswind
  const airspeed = Math.hypot(airX, vy, vz)
  const ground = y <= GROUND_HEIGHT + .001
  const controlAuthority = clamp(airspeed / 7, .12, 1)
  const roll = clamp(state.roll + (c.aileron * 1.55 * controlAuthority - state.roll * .75) * dt, -1.2, 1.2)
  const pitch = clamp(state.pitch + (c.elevator * .9 * controlAuthority - state.pitch * .55) * dt, -.55, .55)
  const yaw = state.yaw + (c.rudder * .56 * controlAuthority + Math.sin(roll) * airspeed * .022) * dt
  const forwardX = Math.sin(yaw)
  const forwardZ = Math.cos(yaw)
  const horizontalSpeed = Math.hypot(airX, vz)
  const flightPathAngle = Math.atan2(vy, Math.max(horizontalSpeed, .01))
  const angleOfAttack = pitch - flightPathAngle
  const stalled = !ground && (airspeed < 8 || angleOfAttack > .42 && airspeed < 14)
  const liftCoefficient = stalled ? .12 : clamp(.24 + angleOfAttack * 1.2, 0, 1.25)
  const lift = airspeed * airspeed * .08 * liftCoefficient * Math.cos(roll)
  const drag = airspeed * .055 + airspeed * airspeed * (.014 + Math.abs(angleOfAttack) * .009)
  const thrust = c.throttle * 10.5
  const forwardAcceleration = thrust - drag - Math.sin(pitch) * 9.81
  const forwardSpeed = clamp(horizontalSpeed + forwardAcceleration * dt, 0, 34)
  const nextVx = forwardX * forwardSpeed + (ground ? 0 : crosswind)
  const nextVz = forwardZ * forwardSpeed
  const verticalAcceleration = lift - 9.81 + Math.sin(pitch) * thrust - (vy - forwardSpeed * Math.sin(pitch)) * 1.45
  const nextVy = clamp(vy + verticalAcceleration * dt, -30, 25)
  const nextY = y + nextVy * dt
  const impact = nextY <= GROUND_HEIGHT && !ground
  const crashed = impact && (nextVy < -3.3 || Math.abs(roll) > .52 || Math.abs(pitch) > .42)
  const onGround = nextY <= GROUND_HEIGHT
  return {
    position: [x + nextVx * dt, Math.max(GROUND_HEIGHT, nextY), z + nextVz * dt],
    velocity: [nextVx, onGround ? 0 : nextVy, nextVz], yaw,
    pitch: onGround ? clamp(pitch, -.1, .15) : pitch,
    roll: onGround ? clamp(roll, -.14, .14) : roll,
    crashed, stalled,
  }
}
