import {
  add, clamp, cross, dot, length, normalize, qConj, qIntegrate, qMul, qNormalize, qRotate, scale, sub,
  attitudeEuler, attitudeQuat, inertiaApply, inertiaInverse,
  type Quat, type Vec3,
} from './math'
import { GRAVITY } from './atmosphere'
import type { AircraftSpec, Controls, Environment, GearPoint, SimState } from './types'

export type ForceModel = (state: SimState, controls: Controls, env: Environment) => {
  forceBody: Vec3
  momentBody: Vec3
  info?: Partial<SimState>
}

export const blankState = (): SimState => ({
  position: [0, 0, 0], velocity: [0, 0, 0], attitude: attitudeQuat(0, 0, 0), omega: [0, 0, 0],
  rpm: 0, motors: [0, 0, 0, 0], gearCompression: [], gearPosition: 1,
  onGround: true, crashed: false, crashReason: '', stalled: false,
  airspeed: 0, alpha: 0, beta: 0, gLoad: 1, climbRate: 0, agl: 0, groundSpeed: 0,
  throttleActual: 0, slipstream: 0, rotorInflow: 0, vortexRing: false, autorotation: false,
  time: 0, distance: 0, lift: 0, drag: 0, thrust: 0, loadFactor: 1,
})

/** Rest height so the gear sits on the ground with static compression. */
export const restHeight = (spec: AircraftSpec): number => {
  const lowest = spec.gear.filter(g => g.kind !== 'tip').reduce((max, g) => Math.max(max, g.position[2] + g.radius), 0.05)
  return lowest - (spec.mass * GRAVITY) / Math.max(1, spec.gear.filter(g => g.kind !== 'tip').length * 2600)
}

export function createState(spec: AircraftSpec, options: {
  position?: Vec3
  heading?: number
  airspeed?: number
  altitude?: number
  pitch?: number
  groundHeight?: number
} = {}): SimState {
  const state = blankState()
  const heading = options.heading ?? 0
  const base = options.position ?? [0, 0, 0]
  const ground = options.groundHeight ?? base[1]
  const airborne = (options.altitude ?? 0) > 0.5
  const height = ground + (airborne ? (options.altitude ?? 60) : restHeight(spec))
  state.position = [base[0], height, base[2]]
  state.attitude = attitudeQuat(heading, options.pitch ?? 0, 0)
  state.gearCompression = spec.gear.map(() => 0)
  state.motors = spec.rotor?.kind === 'quad' ? [0, 0, 0, 0] : []
  if (airborne && options.airspeed) {
    const forward = qRotate(state.attitude, [1, 0, 0])
    state.velocity = scale(forward, options.airspeed)
    state.rpm = spec.family === 'fixed' ? 0.55 : 0
    state.onGround = false
  }
  state.agl = state.position[1] - ground
  return state
}

const gearActive = (gear: GearPoint, state: SimState): boolean =>
  gear.retractChannel < 0 || state.gearPosition > 0.05

/** Terrain normal from finite differences so slopes push the aircraft correctly. */
function groundNormal(env: Environment, x: number, z: number): Vec3 {
  const e = 0.6
  const hx = env.groundHeight(x + e, z) - env.groundHeight(x - e, z)
  const hz = env.groundHeight(x, z + e) - env.groundHeight(x, z - e)
  return normalize([-hx, 2 * e, -hz])
}

export type ContactResult = {
  forceWorld: Vec3
  momentBody: Vec3
  compression: number[]
  contact: boolean
  hardImpact: number
  tipStrike: boolean
  bellyStrike: boolean
  inWater: boolean
}

export function groundContact(spec: AircraftSpec, state: SimState, controls: Controls, env: Environment, dt: number): ContactResult {
  const inverse = qConj(state.attitude)
  const result: ContactResult = {
    forceWorld: [0, 0, 0], momentBody: [0, 0, 0], compression: spec.gear.map(() => 0),
    contact: false, hardImpact: 0, tipStrike: false, bellyStrike: false, inWater: false,
  }
  const weight = spec.mass * GRAVITY
  for (let i = 0; i < spec.gear.length; i++) {
    const gear = spec.gear[i]
    if (!gearActive(gear, state)) continue
    const r = gear.position
    const world = add(state.position, qRotate(state.attitude, r))
    let surface = env.groundHeight(world[0], world[2])
    const water = env.waterHeight
    const floating = gear.kind === 'float' && Number.isFinite(water) && water > surface - 0.05
    if (floating) surface = Math.max(surface, water)
    const penetration = surface + gear.radius - world[1]
    if (penetration <= 0) continue
    result.contact = true
    result.inWater ||= floating
    const normal = floating ? [0, 1, 0] as Vec3 : groundNormal(env, world[0], world[2])
    const pointVelocity = add(state.velocity, qRotate(state.attitude, cross(state.omega, r)))
    const vn = dot(pointVelocity, normal)
    const stiffness = gear.stiffness
    const normalForce = clamp(stiffness * Math.min(penetration, 0.25) - gear.damping * vn, 0, weight * 25)
    result.compression[i] = clamp(penetration, 0, 0.12)
    if (vn < result.hardImpact) result.hardImpact = vn
    if (gear.kind === 'tip' && length(pointVelocity) > 1.6) result.tipStrike = true
    if (gear.kind === 'belly' && length(pointVelocity) > 8) result.bellyStrike = true

    const tangent = sub(pointVelocity, scale(normal, vn))
    const steerAngle = gear.steering * controls.rudder
    const rollAxis = normalize(qRotate(state.attitude, [Math.cos(steerAngle), Math.sin(steerAngle), 0]))
    const rollDir = normalize(sub(rollAxis, scale(normal, dot(rollAxis, normal))))
    const traction = env.groundTraction?.(world[0], world[2])
    const brake = gear.brake * clamp(controls.aux[1], 0, 1) * (traction?.braking ?? 1)
    let friction: Vec3
    if (gear.kind === 'wheel') {
      const rollSpeed = dot(tangent, rollDir)
      const lateral = sub(tangent, scale(rollDir, rollSpeed))
      const lateralSpeed = length(lateral)
      const rollMu = gear.rollingResistance * (traction?.rolling ?? 1) + brake
      const rollForce = -Math.tanh(rollSpeed * 4) * rollMu * normalForce
      const lateralForce = lateralSpeed > 1e-4
        ? scale(lateral, -Math.min(gear.grip * (traction?.lateral ?? 1) * normalForce, lateralSpeed * spec.mass / Math.max(dt, 1e-3) * 0.4) / lateralSpeed)
        : [0, 0, 0] as Vec3
      friction = add(scale(rollDir, rollForce), lateralForce)
    } else if (floating) {
      const forwardSpeed = dot(tangent, rollDir)
      const crossFlow = sub(tangent, scale(rollDir, forwardSpeed))
      const planing = clamp((forwardSpeed - 4) / 7, 0, .72)
      const drag = -Math.tanh(forwardSpeed * .7) * gear.grip * (1 - planing) * .35 * normalForce
      const lateral = scale(crossFlow, -Math.min(gear.grip * normalForce / Math.max(.3, length(crossFlow)), spec.mass * 6))
      friction = add(scale(rollDir, drag), lateral)
    } else {
      const speed = length(tangent)
      const mu = gear.grip * (traction?.lateral ?? 1)
      friction = speed > 1e-4
        ? scale(tangent, -Math.min(mu * normalForce, speed * spec.mass / Math.max(dt, 1e-3) * 0.4) / speed)
        : [0, 0, 0] as Vec3
    }
    const total = add(scale(normal, normalForce), friction)
    result.forceWorld = add(result.forceWorld, total)
    result.momentBody = add(result.momentBody, cross(r, qRotate(inverse, total)))
  }
  return result
}

type Derivative = { dPos: Vec3; dVel: Vec3; dOmega: Vec3; dQ: Quat }

const qDerivative = (q: Quat, omega: Vec3): Quat => [
  0.5 * (q[3] * omega[0] + q[1] * omega[2] - q[2] * omega[1]),
  0.5 * (q[3] * omega[1] - q[0] * omega[2] + q[2] * omega[0]),
  0.5 * (q[3] * omega[2] + q[0] * omega[1] - q[1] * omega[0]),
  0.5 * (-q[0] * omega[0] - q[1] * omega[1] - q[2] * omega[2]),
]

function shifted(state: SimState, d: Derivative, h: number, groundHeight: (x: number, z: number) => number): SimState {
  const position = add(state.position, scale(d.dPos, h)) as Vec3
  return {
    ...state,
    position,
    velocity: add(state.velocity, scale(d.dVel, h)) as Vec3,
    attitude: qNormalize([
      state.attitude[0] + d.dQ[0] * h, state.attitude[1] + d.dQ[1] * h,
      state.attitude[2] + d.dQ[2] * h, state.attitude[3] + d.dQ[3] * h,
    ]),
    omega: add(state.omega, scale(d.dOmega, h)) as Vec3,
    agl: position[1] - groundHeight(position[0], position[2]),
  }
}

/** Classic RK4 over position, velocity, attitude and body rates. */
export function integrate(
  spec: AircraftSpec,
  state: SimState,
  controls: Controls,
  env: Environment,
  dt: number,
  model: ForceModel,
): { state: SimState; contact: ContactResult } {
  const inverse = qConj(state.attitude)
  const evaluate = (s: SimState): { d: Derivative; contact: ContactResult; info?: Partial<SimState> } => {
    const { forceBody, momentBody, info } = model(s, controls, env)
    const contact = groundContact(spec, s, controls, env, dt)
    const gravityWorld: Vec3 = [0, -spec.mass * GRAVITY, 0]
    const forceWorld = add(qRotate(s.attitude, forceBody), add(gravityWorld, contact.forceWorld))
    const momentBodyTotal = add(momentBody, contact.momentBody)
    const gyroscopic = cross(s.omega, inertiaApply(spec.inertia, s.omega))
    return {
      d: {
        dPos: s.velocity,
        dVel: scale(forceWorld, 1 / spec.mass),
        dOmega: inertiaInverse(spec.inertia, sub(momentBodyTotal, gyroscopic)),
        dQ: qDerivative(s.attitude, s.omega),
      },
      contact,
      info,
    }
  }
  const k1 = evaluate(state)
  const elevation = (x: number, z: number) => Math.max(env.groundHeight(x, z), env.waterHeight)
  const k2 = evaluate(shifted(state, k1.d, dt / 2, elevation))
  const k3 = evaluate(shifted(state, k2.d, dt / 2, elevation))
  const k4 = evaluate(shifted(state, k3.d, dt, elevation))
  const mix = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 => [
    (a[0] + 2 * b[0] + 2 * c[0] + d[0]) / 6,
    (a[1] + 2 * b[1] + 2 * c[1] + d[1]) / 6,
    (a[2] + 2 * b[2] + 2 * c[2] + d[2]) / 6,
  ]
  const dPos = mix(k1.d.dPos, k2.d.dPos, k3.d.dPos, k4.d.dPos)
  const dVel = mix(k1.d.dVel, k2.d.dVel, k3.d.dVel, k4.d.dVel)
  const dOmega = mix(k1.d.dOmega, k2.d.dOmega, k3.d.dOmega, k4.d.dOmega)
  const position = add(state.position, scale(dPos, dt)) as Vec3
  const velocity = add(state.velocity, scale(dVel, dt)) as Vec3
  const omega = add(state.omega, scale(dOmega, dt)) as Vec3
  const qd = qDerivative(state.attitude, state.omega)
  const attitude = qIntegrate(state.attitude, add(state.omega, scale(dOmega, dt * 0.5)), dt)
  void qd
  const contact = k1.contact
  const ground = env.groundHeight(position[0], position[2])
  const agl = position[1] - Math.max(ground, env.waterHeight)
  const info = k1.info ?? {}
  const next: SimState = {
    ...state,
    ...info,
    position,
    velocity,
    attitude: qNormalize(attitude),
    omega,
    agl,
    onGround: contact.contact,
    gearCompression: contact.compression,
    climbRate: velocity[1],
    groundSpeed: Math.hypot(velocity[0], velocity[2]),
    time: state.time + dt,
    distance: state.distance + length(scale(dPos, dt)),
    gLoad: length(sub(scale(dVel, 1 / GRAVITY), qRotate(qConj(attitude), [0, -1, 0]))),
  }
  // Never let the airframe sink through the terrain.
  const minHeight = ground + (spec.gear.some(g => g.kind === 'tip') ? 0.01 : 0.02)
  if (next.position[1] < minHeight && contact.contact) {
    next.position[1] = minHeight
    if (next.velocity[1] < 0) next.velocity[1] = 0
  }
  const attitudeE = attitudeEuler(next.attitude)
  if (!state.crashed) {
    const limits = spec.family === 'fixed' ? { impact: -3.4, tilt: 0.95 } : { impact: -3.2, tilt: 0.8 }
    const waterImpact = env.waterHeight - ground > .08 && agl < Math.max(.04, spec.visual.fuselageRadius * .6)
      && !spec.gear.some(gear => gear.kind === 'float')
    if (waterImpact) { next.crashed = true; next.crashReason = 'Suya temas' }
    else if (contact.tipStrike) { next.crashed = true; next.crashReason = 'Kanat ucu / rotor yere değdi' }
    else if (contact.hardImpact < limits.impact && !state.onGround) { next.crashed = true; next.crashReason = `Sert temas (${Math.abs(contact.hardImpact).toFixed(1)} m/s dikey)` }
    else if (contact.contact && Math.abs(attitudeE.roll) > limits.tilt && spec.visual.gearStyle !== 'none') { next.crashed = true; next.crashReason = 'Yan yatış ile temas' }
    else if (agl < spec.visual.fuselageRadius * 0.55 && next.groundSpeed > 5 && !contact.contact) { next.crashed = true; next.crashReason = 'Gövde yere sürttü' }
    else if (contact.inWater && Math.abs(attitudeE.pitch) > 0.75 && next.groundSpeed > 6) { next.crashed = true; next.crashReason = 'Suya burun ile giriş' }
  }
  void inverse
  return { state: next, contact }
}

/** Exponential actuator lag used for motors, servos and gear. */
export const lag = (current: number, target: number, tau: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-dt / Math.max(1e-4, tau)))

export const forwardVector = (state: SimState): Vec3 => qRotate(state.attitude, [1, 0, 0])
export const upVector = (state: SimState): Vec3 => qRotate(state.attitude, [0, 0, -1])
export const rightVector = (state: SimState): Vec3 => qRotate(state.attitude, [0, 1, 0])
export const headingOf = (state: SimState): number => attitudeEuler(state.attitude).yaw
export const bodyRates = (state: SimState): Vec3 => state.omega
export const combineQuat = qMul
