export type Controls = { throttle: number; aileron: number; elevator: number; rudder: number }
// Acceleration parameters, not manufacturer measurements.
export type FixedWingProfile = { thrust: number; lift: number; drag: number; stallSpeed: number; rollResponse: number }
export const trainerProfile: FixedWingProfile = { thrust: 7.2, lift: .095, drag: 1, stallSpeed: 8, rollResponse: 1 }
export const jetProfile: FixedWingProfile = { thrust: 10.5, lift: .048, drag: .78, stallSpeed: 13, rollResponse: 1.45 }
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
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const initialFlight = (): FlightState => ({
  position: [0, GROUND_HEIGHT, -55], velocity: [0, 0, 0], yaw: 0, pitch: 0, roll: 0,
  rollRate: 0, pitchRate: 0, yawRate: 0, airspeed: 0, angleOfAttack: 0,
  crashed: false, stalled: false,
})

// Air-relative 3D forces and damped angular rates at the caller's fixed step.
// +Y up, +Z runway forward, +X right; crosswind is world-X velocity.
export function stepFlight(state: FlightState, controls: Controls, dt: number, crosswind = 0, profile: FixedWingProfile = trainerProfile): FlightState {
  if (state.crashed || !Number.isFinite(dt) || dt <= 0) return state
  const h = Math.min(dt, 1 / 60)
  const throttle = clamp(controls.throttle, 0, 1)
  const aileron = clamp(controls.aileron, -1, 1)
  const elevator = clamp(controls.elevator, -1, 1)
  const rudder = clamp(controls.rudder, -1, 1)
  const [x, y, z] = state.position
  const [vx, vy, vz] = state.velocity
  const ground = y <= GROUND_HEIGHT + .001
  const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw)
  const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch)
  const forward = [sy * cp, sp, cy * cp]
  const right = [cy, 0, -sy]
  const bodyUp = [-sy * sp, cp, -cy * sp]
  const air = [vx - crosswind, vy, vz]
  const airspeed = Math.hypot(...air)
  const airflow = airspeed > .01 ? air.map(v => v / airspeed) : [0, 0, 1]
  const forwardAir = dot(air, forward)
  const angleOfAttack = airspeed < 1 ? 0 : Math.atan2(-dot(air, bodyUp), Math.max(.1, forwardAir))
  const sideslip = dot(air, right)
  const authority = clamp(airspeed / (profile.stallSpeed * 1.35), .08, 1.4)

  const rollAccel = aileron * 2.5 * profile.rollResponse * authority - 1.8 * state.rollRate - 1.8 * state.roll
  const rollRate = ground ? 0 : state.rollRate + rollAccel * h
  const roll = ground ? 0 : clamp(state.roll + rollRate * h, -1.25, 1.25)
  const pitchAccel = elevator * 2.0 * authority + (.11 - angleOfAttack) * 2.4 - 2.2 * state.pitchRate
  const pitchRate = ground ? 0 : state.pitchRate + pitchAccel * h
  const pitch = ground
    ? clamp(state.pitch + elevator * authority * .85 * h - state.pitch * .5 * h, -.025, .23)
    : clamp(state.pitch + pitchRate * h, -.65, .65)
  const targetYawRate = ground
    ? rudder * .55 * clamp(airspeed / 8, 0, 1)
    : GRAVITY * Math.tan(roll) / Math.max(airspeed, 5) + rudder * .5 * authority - sideslip * .022
  const yawRate = state.yawRate + (targetYawRate - state.yawRate) * Math.min(1, h * (ground ? 2 : 2.5))
  const yaw = state.yaw + yawRate * h

  // Smooth loss of lift past the peak; avoid the old stall discontinuity.
  const alpha = clamp(angleOfAttack, -.6, .75)
  const preStall = clamp(.24 + alpha * 4.2, -.65, 1.35)
  const excess = Math.max(0, Math.abs(alpha) - .27)
  const cl = preStall * (1 - .78 * clamp(excess / .38, 0, 1))
  const stalled = !ground && (angleOfAttack > .3 || airspeed < profile.stallSpeed * .8)
  const lift = airspeed * airspeed * profile.lift * cl
  const drag = airspeed * airspeed * profile.drag * (.012 + .018 * cl * cl + excess * .18)
  const bankedUp = bodyUp.map((v, i) => v * Math.cos(roll) + right[i] * Math.sin(roll))
  const upAlongAir = dot(bankedUp, airflow)
  const liftAxis = bankedUp.map((v, i) => v - airflow[i] * upAlongAir)
  const liftLength = Math.max(.01, Math.hypot(...liftAxis))
  const thrust = throttle * profile.thrust
  const sideForce = ground ? -sideslip * 3.2 : -sideslip * clamp(airspeed * .12, .3, 2.4)
  const acceleration = forward.map((v, i) =>
    v * thrust + liftAxis[i] / liftLength * lift - airflow[i] * drag + right[i] * sideForce - (i === 1 ? GRAVITY : 0))

  let nextVx = vx + acceleration[0] * h
  let nextVy = vy + acceleration[1] * h
  let nextVz = vz + acceleration[2] * h
  if (ground) {
    nextVy = Math.max(0, nextVy)
    const headingSpeed = nextVx * sy + nextVz * cy
    const lateralSpeed = nextVx * cy - nextVz * sy
    const rolling = Math.max(0, headingSpeed - (.28 + (1 - throttle) * .28) * h)
    const lateral = lateralSpeed * Math.max(0, 1 - 8 * h)
    nextVx = sy * rolling + cy * lateral
    nextVz = cy * rolling - sy * lateral
  }
  const rawY = y + nextVy * h
  const impact = !ground && rawY <= GROUND_HEIGHT
  const crashed = impact && (nextVy < -3.2 || Math.abs(roll) > .52 || Math.abs(pitch) > .4)
  const onGround = rawY <= GROUND_HEIGHT
  return {
    position: [x + nextVx * h, Math.max(GROUND_HEIGHT, rawY), z + nextVz * h],
    velocity: [nextVx, onGround ? 0 : nextVy, nextVz], yaw, pitch: onGround ? clamp(pitch, -.025, .23) : pitch,
    roll: onGround ? 0 : roll, rollRate: onGround ? 0 : rollRate,
    pitchRate: onGround ? 0 : pitchRate, yawRate, airspeed, angleOfAttack, crashed, stalled,
  }
}
