export type Controls = { throttle: number; aileron: number; elevator: number; rudder: number }
export type FlightState = {
  position: [number, number, number]
  velocity: [number, number, number]
  yaw: number
  pitch: number
  roll: number
  rollRate: number
  pitchRate: number
  yawRate: number
  airspeed: number
  angleOfAttack: number
  crashed: boolean
  stalled: boolean
}

const GROUND_HEIGHT = .25
const GRAVITY = 9.81
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export const initialFlight = (): FlightState => ({
  position: [0, GROUND_HEIGHT, -55], velocity: [0, 0, 0], yaw: 0, pitch: 0, roll: 0,
  rollRate: 0, pitchRate: 0, yawRate: 0, airspeed: 0, angleOfAttack: 0,
  crashed: false, stalled: false,
})

// Fixed-step, air-relative RC trainer model. Coefficients need flight-test calibration.
// World axes: +Y up, +Z runway forward, +X right. Wind is world-X velocity.
export function stepFlight(state: FlightState, controls: Controls, dt: number, crosswind = 0): FlightState {
  if (state.crashed || dt <= 0) return state
  const h = Math.min(dt, 1 / 30)
  const [x, y, z] = state.position
  const [vx, vy, vz] = state.velocity
  const throttle = clamp(controls.throttle, 0, 1)
  const aileron = clamp(controls.aileron, -1, 1)
  const elevator = clamp(controls.elevator, -1, 1)
  const rudder = clamp(controls.rudder, -1, 1)
  const ground = y <= GROUND_HEIGHT + .001
  const airX = vx - crosswind
  const airspeed = Math.hypot(airX, vy, vz)
  const horizontalSpeed = Math.hypot(airX, vz)
  const flightPath = Math.atan2(vy, Math.max(horizontalSpeed, .01))
  const angleOfAttack = state.pitch - flightPath
  const authority = clamp(airspeed / 12, 0, 1.5)
  const rollRate = state.rollRate + (aileron * 4.0 * authority - state.rollRate * 2.8 - state.roll * .32) * h
  const pitchRate = state.pitchRate + (elevator * 2.3 * authority - state.pitchRate * 2.2 - state.pitch * .75) * h
  const roll = clamp(state.roll + rollRate * h, -1.4, 1.4)
  const pitch = clamp(state.pitch + pitchRate * h, -.7, .7)
  const coordinatedTurn = ground ? 0 : GRAVITY * Math.tan(roll) / Math.max(horizontalSpeed, 6)
  const yawRate = state.yawRate + (rudder * .95 * authority + coordinatedTurn - state.yawRate) * Math.min(1, h * 3)
  const yaw = state.yaw + yawRate * h
  const forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw)
  const sideX = forwardZ, sideZ = -forwardX
  const forwardAir = airX * forwardX + vz * forwardZ
  const sideAir = airX * sideX + vz * sideZ
  const stalled = !ground && (airspeed < 7.5 || Math.abs(angleOfAttack) > .38)
  const cl = stalled ? clamp(.25 - (Math.abs(angleOfAttack) - .38) * .45, .08, .25) : clamp(.34 + angleOfAttack * 1.5, -.4, 1.15)
  const lift = airspeed * airspeed * .086 * cl
  const drag = airspeed * (.035 + airspeed * (.012 + .025 * cl * cl))
  const thrust = throttle * 11.5
  const nextForward = Math.max(0, forwardAir + (thrust - drag - GRAVITY * Math.sin(pitch)) * h)
  const nextSide = ground ? sideAir * Math.max(0, 1 - h * 8) : sideAir * Math.max(0, 1 - h * (1.1 + airspeed * .12))
  const nextVx = forwardX * nextForward + sideX * nextSide + (ground ? 0 : crosswind)
  const nextVz = forwardZ * nextForward + sideZ * nextSide
  const verticalAcceleration = lift * Math.cos(roll) - GRAVITY + Math.sin(pitch) * thrust - vy * .22
  const nextVy = ground && verticalAcceleration < 0 ? 0 : clamp(vy + verticalAcceleration * h, -32, 25)
  const nextY = y + nextVy * h
  const impact = nextY <= GROUND_HEIGHT && !ground
  const crashed = impact && (nextVy < -3.3 || Math.abs(roll) > .52 || Math.abs(pitch) > .42)
  const onGround = nextY <= GROUND_HEIGHT
  return {
    position: [x + nextVx * h, Math.max(GROUND_HEIGHT, nextY), z + nextVz * h],
    velocity: [nextVx, onGround ? 0 : nextVy, nextVz], yaw,
    pitch: onGround ? clamp(pitch, -.09, .2) : pitch,
    roll: onGround ? clamp(roll, -.12, .12) : roll,
    rollRate: onGround ? 0 : rollRate,
    pitchRate: onGround ? 0 : pitchRate,
    yawRate, airspeed, angleOfAttack, crashed, stalled,
  }
}
