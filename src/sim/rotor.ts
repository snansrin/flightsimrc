import { aerodynamics } from './aero'
import { GRAVITY } from './atmosphere'
import { add, attitudeEuler, clamp, cross, length, lerp, normalize, qConj, qRotate, scale, type Vec3 } from './math'
import { lag } from './rigidBody'
import type { AircraftSpec, Controls, Environment, SimState } from './types'

export type QuadMode = 'acro' | 'angle' | 'altitude' | 'loiter'

/** X-configuration motor layout: position signs and rotation direction seen from above. */
export const MOTOR_LAYOUT = [
  { x: 1, y: -1, spin: 1 },
  { x: 1, y: 1, spin: -1 },
  { x: -1, y: 1, spin: 1 },
  { x: -1, y: -1, spin: -1 },
]

export type FcState = {
  integral: Vec3
  lastRate: Vec3
  positionHold: [number, number] | null
  altitudeHold: number | null
  mode: QuadMode
  commands: number[]
}

export const createFcState = (): FcState => ({
  integral: [0, 0, 0], lastRate: [0, 0, 0], positionHold: null, altitudeHold: null,
  mode: 'angle', commands: [0, 0, 0, 0],
})

export const quadModeFromControls = (spec: AircraftSpec, controls: Controls): QuadMode => {
  const sw = controls.aux[0]
  if (spec.id === 'cinedrone') return sw > 0.5 ? 'acro' : sw < -0.5 ? 'altitude' : 'loiter'
  return sw > 0.5 ? 'angle' : sw < -0.5 ? 'altitude' : 'acro'
}

export const hoverThrottle = (spec: AircraftSpec, state: SimState): number => {
  const rotor = spec.rotor
  if (!rotor) return 0.5
  if (rotor.kind === 'quad') {
    const total = (rotor.motorThrust ?? 8) * 4
    const attitude = attitudeEuler(state.attitude)
    const tilt = Math.max(0.35, Math.cos(attitude.roll) * Math.cos(attitude.pitch))
    return clamp(Math.sqrt((spec.mass * GRAVITY) / (total * tilt)), 0, 1)
  }
  return spec.envelope.hoverThrottle ?? 0.5
}

/**
 * Cascaded flight controller: rate PID -> angle P -> velocity P -> position P.
 * Runs once per physics step (never inside the RK4 stages) exactly like real firmware.
 */
export function quadController(spec: AircraftSpec, state: SimState, controls: Controls, env: Environment, fc: FcState, dt: number): number[] {
  const rotor = spec.rotor!
  const arm = rotor.armLength ?? 0.12
  const maxThrust = rotor.motorThrust ?? 8
  const attitude = attitudeEuler(state.attitude)
  const mode = quadModeFromControls(spec, controls)
  fc.mode = mode
  const rateScale = spec.assists.rateScale || 1
  const maxRate = (mode === 'acro' ? 11 : 6) * rateScale
  const maxAngle = spec.id === 'cinedrone' ? 0.44 : 0.79
  const throttle = clamp(controls.throttle, 0, 1)
  const gentle = spec.id === 'cinedrone'

  let targetRate: Vec3 = [controls.aileron * maxRate, controls.elevator * maxRate * 0.8, controls.rudder * (gentle ? 2.2 : 5) * rateScale]

  if (mode !== 'acro') {
    let rollTarget = controls.aileron * maxAngle
    let pitchTarget = controls.elevator * maxAngle
    if (mode === 'altitude' || mode === 'loiter') {
      const speedCommand = gentle ? 6 : 10
      const forward = -controls.elevator * speedCommand
      const right = controls.aileron * speedCommand
      const cy = Math.cos(attitude.yaw), sy = Math.sin(attitude.yaw)
      let targetVx = right * cy + forward * sy
      let targetVz = -right * sy + forward * cy
      const stickActive = Math.abs(controls.aileron) > 0.07 || Math.abs(controls.elevator) > 0.07
      if (mode === 'loiter' && !stickActive) {
        if (!fc.positionHold) fc.positionHold = [state.position[0], state.position[2]]
        targetVx = clamp((fc.positionHold[0] - state.position[0]) * 0.6, -4, 4)
        targetVz = clamp((fc.positionHold[1] - state.position[2]) * 0.6, -4, 4)
      } else if (mode === 'loiter') {
        fc.positionHold = null
      }
      const gain = gentle ? 0.85 : 0.5
      const ax = clamp((targetVx - state.velocity[0]) * gain, -6, 6)
      const az = clamp((targetVz - state.velocity[2]) * gain, -6, 6)
      // Desired horizontal acceleration -> tilt (small angle: a = g tan(theta)).
      pitchTarget = clamp(Math.atan2(ax * sy + az * cy, GRAVITY), -maxAngle, maxAngle)
      rollTarget = clamp(Math.atan2(ax * cy - az * sy, GRAVITY), -maxAngle, maxAngle)
    }
    const angleP = gentle ? 4.5 : 6
    targetRate = [
      clamp((rollTarget - attitude.roll) * angleP, -maxRate, maxRate),
      clamp((pitchTarget - attitude.pitch) * angleP, -maxRate, maxRate),
      targetRate[2],
    ]
  }

  let collective = throttle
  if (mode === 'altitude' || mode === 'loiter') {
    if (fc.altitudeHold === null) fc.altitudeHold = state.position[1]
    const centered = Math.abs(throttle - 0.5) < 0.07
    let climbTarget: number
    if (centered) climbTarget = clamp((fc.altitudeHold - state.position[1]) * 1.1, -2.5, 2.5)
    else { fc.altitudeHold = state.position[1]; climbTarget = (throttle - 0.5) * 2 * (gentle ? 3 : 6) }
    collective = clamp(hoverThrottle(spec, state) + (climbTarget - state.velocity[1]) * 0.07, 0.05, 0.95)
  }

  const kp: Vec3 = gentle ? [13, 13, 10] : [19, 19, 14]
  const ki: Vec3 = gentle ? [6, 6, 5] : [9, 9, 7]
  const kd: Vec3 = gentle ? [1.1, 1.1, 0.4] : [1.3, 1.3, 0.5]
  const moment: Vec3 = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    const error = targetRate[i] - state.omega[i]
    fc.integral[i] = clamp(fc.integral[i] + error * dt, -4, 4)
    const derivative = (state.omega[i] - fc.lastRate[i]) / Math.max(dt, 1e-4)
    fc.lastRate[i] = state.omega[i]
    const accel = kp[i] * error + ki[i] * fc.integral[i] - kd[i] * clamp(derivative, -400, 400)
    moment[i] = spec.inertia[i] * accel
  }
  const mean = clamp(collective, 0.15, 0.9)
  const tiltAuthority = Math.max(0.05, 8 * mean * maxThrust * arm)
  const yawAuthority = Math.max(0.02, 8 * mean * (rotor.motorTorque ?? 0.03))
  const uRoll = clamp(moment[0] / tiltAuthority, -0.4, 0.4)
  const uPitch = clamp(moment[1] / tiltAuthority, -0.4, 0.4)
  const uYaw = clamp(moment[2] / yawAuthority, -0.3, 0.3)
  fc.commands = MOTOR_LAYOUT.map(m => clamp(collective + uRoll * -m.y + uPitch * m.x + uYaw * -m.spin, 0, 1))
  void env
  return fc.commands
}

/** Pure force model: uses the motor speeds already latched for this step. */
export function quadForces(spec: AircraftSpec, state: SimState, controls: Controls, env: Environment, motors: number[]) {
  const rotor = spec.rotor!
  const arm = rotor.armLength ?? 0.12
  const maxThrust = rotor.motorThrust ?? 8
  const aero = aerodynamics(spec, state, controls, env)
  let forceBody: Vec3 = [0, 0, 0]
  let momentBody: Vec3 = [0, 0, 0]
  let totalThrust = 0
  for (let i = 0; i < 4; i++) {
    const speed = clamp(motors[i] ?? 0, 0, 1)
    const thrust = maxThrust * speed * speed
    totalThrust += thrust
    const r: Vec3 = [MOTOR_LAYOUT[i].x * arm, MOTOR_LAYOUT[i].y * arm, -0.012]
    const f: Vec3 = [0, 0, -thrust]
    forceBody = add(forceBody, f)
    momentBody = add(momentBody, cross(r, f))
    momentBody[2] += -MOTOR_LAYOUT[i].spin * (rotor.motorTorque ?? 0.03) * speed * speed
  }
  const relative: Vec3 = [state.velocity[0] - env.wind[0], state.velocity[1] - env.wind[1], state.velocity[2] - env.wind[2]]
  const horizontal = Math.hypot(relative[0], relative[2])
  // Blade flapping drag grows with airspeed and rotor loading.
  const flapping = 0.014 * totalThrust * horizontal
  const dragWorld: Vec3 = horizontal > 0.05
    ? [-relative[0] / horizontal * flapping, 0, -relative[2] / horizontal * flapping]
    : [0, 0, 0]
  forceBody = add(forceBody, qRotate(qConj(state.attitude), dragWorld))
  forceBody = add(forceBody, scale(aero.force, 0.5))
  momentBody = add(momentBody, scale(aero.moment, 0.4))
  return {
    forceBody,
    momentBody,
    info: {
      airspeed: length(relative), alpha: aero.alpha, beta: aero.beta, thrust: totalThrust,
      lift: totalThrust, drag: aero.drag, stalled: false,
    } as Partial<SimState>,
  }
}

export type HeliState = {
  tiltRoll: number
  tiltPitch: number
  yawHold: number | null
  yawAssist: number
  collective: number
  inflow: number
  tailCommand: number
}
export const createHeliState = (): HeliState => ({
  tiltRoll: 0, tiltPitch: 0, yawHold: null, yawAssist: 0, collective: 0, inflow: 0.03, tailCommand: 0,
})

/** Head speed governor with autorotation support. */
export function heliRpm(spec: AircraftSpec, state: SimState, controls: Controls, dt: number): number {
  const throttleHold = controls.aux[4] > 0.5
  const descending = state.velocity[1] < -1.5
  if (throttleHold) {
    const driven = descending
      ? clamp(0.84 + (-state.velocity[1] - 1.5) * 0.02 + controls.throttle * 0.04, 0.6, 1.05)
      : 0.55
    return lag(state.rpm, driven, descending ? 0.9 : 2.2, dt)
  }
  const target = controls.throttle > 0.08 ? 1 : 0
  return lag(state.rpm, target, target > state.rpm ? 1.4 : 2.6, dt)
}

/** Cyclic flapping lag, collective curve and gyro assist, once per step. */
export function heliController(spec: AircraftSpec, state: SimState, controls: Controls, heli: HeliState, dt: number) {
  const rotor = spec.rotor!
  const attitude = attitudeEuler(state.attitude)
  const idleUp = controls.aux[2] > 0
  const range = rotor.collectiveMax ?? 0.21
  heli.collective = idleUp
    ? (controls.throttle * 2 - 1) * range
    : lerp(-0.05, range, clamp(controls.throttle, 0, 1))
  const cyclic = (rotor.cyclicTilt ?? 0.16) * (spec.assists.rateScale || 1)
  heli.tiltRoll = lag(heli.tiltRoll, cyclic * controls.aileron, rotor.flapTime ?? 0.09, dt)
  heli.tiltPitch = lag(heli.tiltPitch, cyclic * controls.elevator, rotor.flapTime ?? 0.09, dt)
  const gyro = rotor.gyroGain ?? 2.5
  const headingHold = controls.aux[3] > 0
  if (headingHold) {
    if (heli.yawHold === null) heli.yawHold = attitude.yaw
    const err = Math.atan2(Math.sin(heli.yawHold - attitude.yaw), Math.cos(heli.yawHold - attitude.yaw))
    heli.yawAssist = gyro * (clamp(err * 2.2, -2.5, 2.5) - state.omega[2])
  } else {
    heli.yawHold = null
    heli.yawAssist = gyro * (controls.rudder * 2.4 - state.omega[2])
  }
}

/** Blade-element + momentum main rotor, rigid hub moments, tail rotor. Pure per RK4 stage. */
export function heliForces(spec: AircraftSpec, state: SimState, controls: Controls, env: Environment, heli: HeliState) {
  const rotor = spec.rotor!
  const radius = rotor.radius ?? 0.55
  const area = rotor.discArea ?? Math.PI * radius * radius
  const solidity = rotor.solidity ?? 0.045
  const a = rotor.bladeLiftSlope ?? 5.7
  const omega = ((rotor.headSpeed ?? 2200) / 60) * 2 * Math.PI * state.rpm
  const tipSpeed = omega * radius
  const aero = aerodynamics(spec, state, controls, env)
  const collective = heli.collective
  const relative: Vec3 = [state.velocity[0] - env.wind[0], state.velocity[1] - env.wind[1], state.velocity[2] - env.wind[2]]
  const bodyVel = qRotate(qConj(state.attitude), relative)
  const speed = length(relative)
  const horizontal = Math.hypot(relative[0], relative[2])
  const mu = tipSpeed > 1 ? horizontal / tipSpeed : 0
  const lambdaC = tipSpeed > 1 ? -bodyVel[2] / tipSpeed : 0

  let inflow = heli.inflow || 0.03
  let ct = 0
  for (let i = 0; i < 6; i++) {
    const lambda = lambdaC + inflow
    ct = (solidity * a / 4) * ((2 / 3) * collective - lambda)
    const induced = Math.sqrt(Math.abs(ct) / 2) * Math.sign(ct || 1)
    const target = induced / (1 + 14 * mu * mu)
    inflow += (target - inflow) * 0.55
  }
  const groundBoost = 1 + 0.16 * Math.exp(-Math.pow(state.agl / (radius * 1.2), 2))
  const descent = -state.velocity[1]
  const vortex = descent > 2.8 && horizontal < 4.5 && collective > 0.04
  const vortexFactor = vortex ? clamp(1 - (descent - 2.8) * 0.1, 0.55, 1) : 1
  let thrust = ct * env.density * area * tipSpeed * tipSpeed * groundBoost * vortexFactor
  thrust = clamp(thrust, -spec.mass * GRAVITY * 4, spec.mass * GRAVITY * 6)

  // A real tail rotor creates lateral thrust while cancelling engine torque.
  // Helicopters are trimmed with a small opposing main-disc lateral tilt; without
  // this rigging offset the aircraft accelerates sideways even at centred cyclic.
  const cq = Math.abs(ct) * Math.abs(inflow) + (solidity * 0.012) / 8
  const torque = cq * env.density * area * tipSpeed * tipSpeed * radius
  const tailArm = rotor.tailArm ?? 0.72
  const tailMax = rotor.tailThrust ?? 11
  const tailCommand = clamp(torque / tailArm + heli.yawAssist + controls.rudder * tailMax * 0.5, -tailMax, tailMax)
  const sideTrim = clamp(torque / Math.max(0.1, tailArm * Math.abs(thrust)), -0.15, 0.15)
  const discDir = normalize([
    -Math.sin(heli.tiltPitch),
    Math.sin(heli.tiltRoll) + sideTrim,
    -Math.cos(heli.tiltPitch) * Math.cos(heli.tiltRoll),
  ])
  const rotorArm: Vec3 = [0, 0, -0.16]
  const rotorForce = scale(discDir, thrust)
  let forceBody = add(rotorForce, scale(aero.force, 0.9))
  let momentBody = add(cross(rotorArm, rotorForce), scale(aero.moment, 0.9))
  const hub = rotor.hubStiffness ?? 90
  const loadRatio = Math.abs(thrust) / (spec.mass * GRAVITY)
  momentBody[0] += hub * heli.tiltRoll * loadRatio
  momentBody[1] += hub * heli.tiltPitch * loadRatio

  momentBody[2] -= torque
  const tailForce: Vec3 = [0, -tailCommand, 0]
  const tailPos: Vec3 = [-tailArm, 0, -0.06]
  forceBody = add(forceBody, tailForce)
  momentBody = add(momentBody, cross(tailPos, tailForce))
  const h = 0.02 * omega
  momentBody[1] += -state.omega[2] * h * 0.2
  momentBody[0] += state.omega[2] * h * 0.08

  return {
    forceBody,
    momentBody,
    info: {
      airspeed: speed, alpha: aero.alpha, beta: aero.beta, thrust, lift: thrust, drag: aero.drag,
      rotorInflow: inflow, vortexRing: vortex, stalled: false,
    } as Partial<SimState>,
    torque,
    inflow,
    tailCommand,
  }
}

export const rotorDownwash = (thrust: number, area: number, density: number): number =>
  Math.sqrt(Math.max(0, thrust) / (2 * density * Math.max(0.05, area)))

export const isAutorotating = (spec: AircraftSpec, state: SimState, controls: Controls): boolean =>
  spec.family === 'heli' && controls.aux[4] > 0.5 && state.velocity[1] < -1

export const mixPreview = (spec: AircraftSpec, controls: Controls): number[] =>
  MOTOR_LAYOUT.map(m => clamp(controls.throttle + controls.aileron * -m.y * 0.2 + controls.elevator * m.x * 0.2 + controls.rudder * -m.spin * 0.15, 0, 1))
