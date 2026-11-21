import {
  add, clamp, cross, dot, length, scale, sigmoid,
  type Quat, type Vec3, qConj, qRotate,
} from './math'
import type { AircraftSpec, Controls, Environment, SimState, Surface } from './types'

/**
 * Component-buildup aerodynamics for model aircraft.
 * Method: Selig, "Modeling Full-Envelope Aerodynamics of Small UAVs in Realtime" (AIAA 2010-7635),
 * the basis of the FS One RC simulator: per-component forces over the full +/-180 deg alpha/beta
 * envelope, linear airfoil region blended into flat-plate behaviour past stall, plus propwash.
 * Coefficients here are engineering estimates for the RC class, not measured airframe data.
 */

export type Coefficients = { cl: number; cd: number; postStall: number }

/** Airfoil polar with smooth post-stall blend to flat plate. */
export function coefficients(alpha: number, surface: Surface, aspect: number, clExtra = 0, cdExtra = 0, stallShift = 0): Coefficients {
  const a = alpha
  const stall = Math.max(0.12, surface.alphaStall + stallShift)
  const width = Math.max(0.02, surface.stallWidth)
  const postStall = sigmoid((Math.abs(a) - stall) / width)
  const linear = surface.cl0 + surface.clAlpha * a + clExtra
  const limited = clamp(linear, -surface.clMax * 1.08, surface.clMax * 1.08)
  // Flat plate normal force resolved into lift: 2 sin(a) cos(a), slightly reduced for finite span.
  const flat = 1.85 * Math.sin(a) * Math.cos(a)
  const cl = (1 - postStall) * limited + postStall * flat
  const induced = (limited * limited) / (Math.PI * Math.max(0.8, aspect) * surface.oswald)
  const cdPre = surface.cd0 + induced + cdExtra
  const cdPost = surface.cd0 + 1.9 * Math.sin(a) * Math.sin(a) + cdExtra * 0.5
  const cd = (1 - postStall) * cdPre + postStall * cdPost
  return { cl, cd, postStall }
}

/** Fuselage/boom crossflow: linear at small incidence, flat-plate normal force near 90 deg. */
const crossflowCoefficient = (angle: number, cd: number): number => {
  const s = Math.sin(angle)
  return cd * (0.5 * Math.sin(2 * angle) * (1 - Math.abs(s)) + s * Math.abs(s))
}

export type AeroOutput = {
  force: Vec3
  moment: Vec3
  lift: number
  drag: number
  thrust: number
  slipstream: number
  stalled: boolean
  alpha: number
  beta: number
  airspeed: number
  /** Per-surface load, for the debug overlay. */
  surfaces: { id: string; alpha: number; cl: number; load: number }[]
}

const controlCommand = (surface: Surface, controls: Controls): number => {
  switch (surface.control) {
    case 'aileron': return controls.aileron
    case 'elevator': return controls.elevator
    case 'rudder': return controls.rudder
    case 'flap': return controls.flaps * 2 - 1
    case 'elevon': return clamp(controls.elevator + controls.aileron * surface.controlSign, -1, 1) * surface.controlSign
    default: return 0
  }
}

export function propellerState(spec: AircraftSpec, rpm: number, axialSpeed: number, density: number) {
  const prop = spec.prop
  if (prop.kind === 'none' || rpm <= 0.001) return { thrust: 0, torque: 0, slipstream: 0, angularMomentum: 0, revs: 0 }
  const revs = (rpm * prop.maxRpm) / 60
  const discArea = Math.PI * (prop.diameter / 2) ** 2
  const ct0 = prop.staticThrust / Math.max(1e-6, 1.225 * (prop.maxRpm / 60) ** 2 * prop.diameter ** 4)
  const advance = revs > 0.5 ? clamp(axialSpeed / (revs * prop.diameter), -0.4, 3) : 0
  const zeroThrustRatio = (prop.pitch / prop.diameter) * (prop.kind === 'edf' ? 2.6 : 1.15)
  let ct = ct0 * (1 - advance / zeroThrustRatio)
  if (ct < 0) ct *= 0.22 // windmilling drag
  const thrust = ct * density * revs * revs * prop.diameter ** 4
  const cq = ct0 * (prop.kind === 'edf' ? 0.03 : 0.055)
  const torque = cq * density * revs * revs * prop.diameter ** 5
  const slipstream = thrust > 0 ? Math.sqrt(thrust / (2 * density * discArea)) * prop.slipstream : 0
  return { thrust, torque, slipstream, angularMomentum: prop.inertia * 2 * Math.PI * revs * prop.rotation, revs }
}

/** Ground-effect factor on induced drag (Raymer-style, h/b based). */
export const groundEffect = (agl: number, span: number): number => {
  if (span <= 0) return 1
  const ratio = (16 * Math.max(agl, 0.02)) / span
  return clamp((ratio * ratio) / (1 + ratio * ratio), 0.25, 1)
}

export function aerodynamics(
  spec: AircraftSpec,
  state: SimState,
  controls: Controls,
  env: Environment,
): AeroOutput {
  const inverse = qConj(state.attitude)
  const relative: Vec3 = [state.velocity[0] - env.wind[0], state.velocity[1] - env.wind[1], state.velocity[2] - env.wind[2]]
  const body = qRotate(inverse, relative)
  const airspeed = length(body)
  const alpha = airspeed > 0.35 ? Math.atan2(body[2], body[0]) : 0
  const beta = airspeed > 0.35 ? Math.atan2(body[1], Math.hypot(body[0], body[2])) : 0
  const rho = env.density
  const prop = propellerState(spec, state.rpm, body[0], rho)
  const slipstream = prop.slipstream

  let force: Vec3 = [prop.thrust, 0, 0]
  let moment: Vec3 = [0, 0, 0]
  let liftTotal = 0
  let dragTotal = 0
  let stalled = false
  const surfaces: AeroOutput['surfaces'] = []
  const agl = state.agl
  const ge = groundEffect(agl, spec.span)

  // Propeller reaction torque, P-factor and gyroscopic precession.
  if (spec.prop.kind !== 'none') {
    moment[0] -= spec.prop.rotation * prop.torque
    const h = prop.angularMomentum
    moment[1] += -state.omega[2] * h
    moment[2] += state.omega[1] * h
    const pf = spec.prop.pFactor * prop.thrust * spec.prop.diameter * 0.3 * spec.prop.rotation
    moment[2] += pf * alpha
    moment[1] += -pf * beta
  }

  for (const surface of spec.surfaces) {
    const local = add(add(body, cross(state.omega, surface.arm)), [slipstream * surface.propwash, 0, 0])
    const speed = length(local)
    const qbar = 0.5 * rho * speed * speed
    if (qbar < 1e-5) { surfaces.push({ id: surface.id, alpha: 0, cl: 0, load: 0 }); continue }
    const aspect = surface.span > 0 ? (surface.span * surface.span) / Math.max(1e-4, surface.area) : 2
    const command = controlCommand(surface, controls)
    let clExtra = surface.controlCl * surface.controlSign * command
    let cdExtra = surface.controlCd * Math.abs(command)
    let stallShift = 0
    if (surface.control === 'flap' && controls.flaps > 0) {
      clExtra += surface.controlCl * controls.flaps
      cdExtra += surface.controlCd * controls.flaps * controls.flaps * 2.2
      stallShift = -0.035 * controls.flaps
    }
    if (surface.kind === 'wing' && spec.flaps?.wingLift && controls.flaps > 0) {
      clExtra += spec.flaps.wingLift * controls.flaps
      cdExtra += (spec.flaps.wingDrag ?? 0) * controls.flaps ** 2
      stallShift = -.025 * controls.flaps
    }

    let componentForce: Vec3 = [0, 0, 0]
    let localAlpha = 0
    let cl = 0

    if (surface.kind === 'wing' || surface.kind === 'htail') {
      const d = surface.dihedral
      const wEff = local[2] * Math.cos(d) + local[1] * Math.sin(d)
      localAlpha = Math.atan2(wEff, local[0]) + surface.incidence
      const polar = coefficients(localAlpha, surface, aspect, clExtra, cdExtra, stallShift)
      cl = polar.cl
      const effect = surface.kind === 'wing' ? ge : 1
      const inducedPart = (polar.cl * polar.cl) / (Math.PI * Math.max(0.8, aspect) * surface.oswald)
      const cd = polar.cd - inducedPart * (1 - effect) * (1 - polar.postStall)
      const lift = qbar * surface.area * cl * (1 + 0.06 * (1 - effect))
      const drag = qbar * surface.area * cd
      const sa = Math.sin(localAlpha), ca = Math.cos(localAlpha)
      const sd = Math.sin(d), cd2 = Math.cos(d)
      // Panel axes: chord = body x, normal = (0, sin d, cos d).
      const liftDir: Vec3 = [sa, -ca * sd, -ca * cd2]
      const dragDir: Vec3 = [-ca, -sa * sd, -sa * cd2]
      componentForce = add(scale(liftDir, lift), scale(dragDir, drag))
      liftTotal += lift
      dragTotal += drag
      // Quarter-chord pitching moment of a cambered section.
      moment[1] += -0.09 * surface.cl0 * qbar * surface.area * spec.chord * (surface.kind === 'wing' ? 1 : 0.25)
      if (surface.kind === 'wing' && polar.postStall > 0.5 && speed > 2) stalled = true
    } else if (surface.kind === 'vtail') {
      localAlpha = Math.atan2(local[1], local[0]) + surface.incidence
      const polar = coefficients(localAlpha, surface, aspect, clExtra, cdExtra)
      cl = polar.cl
      const side = qbar * surface.area * cl
      const drag = qbar * surface.area * polar.cd
      const sb = Math.sin(localAlpha), cb = Math.cos(localAlpha)
      componentForce = add(scale([-sb, -cb, 0], side), scale([-cb, -sb, 0], drag))
      dragTotal += drag
    } else {
      // Fuselage / boom: axial drag plus crossflow normal forces (knife-edge support).
      const cd = surface.crossflow ?? 1.1
      const aLocal = Math.atan2(local[2], local[0])
      const bLocal = Math.atan2(local[1], local[0])
      const normalZ = qbar * surface.area * crossflowCoefficient(aLocal, cd)
      const normalY = qbar * surface.area * crossflowCoefficient(bLocal, cd)
      const axial = qbar * surface.area * surface.cd0
      const sa = Math.sin(aLocal), ca = Math.cos(aLocal)
      const sb = Math.sin(bLocal), cb = Math.cos(bLocal)
      componentForce = [
        -axial + normalZ * sa + normalY * sb,
        -normalY * cb,
        -normalZ * ca,
      ]
      dragTotal += axial
      localAlpha = aLocal
    }

    force = add(force, componentForce)
    moment = add(moment, cross(surface.arm, componentForce))
    surfaces.push({ id: surface.id, alpha: localAlpha, cl, load: length(componentForce) })
  }

  // Thrust line offset from CG.
  const thrustArm: Vec3 = [spec.visual.noseLength * 0.9, 0, 0]
  moment = add(moment, cross(thrustArm, [prop.thrust, 0, 0]))

  return {
    force, moment, lift: liftTotal, drag: dragTotal, thrust: prop.thrust,
    slipstream, stalled, alpha, beta, airspeed, surfaces,
  }
}

/** Body-axis velocity helper shared by rotor models and telemetry. */
export const bodyVelocity = (attitude: Quat, velocity: Vec3, wind: Vec3): Vec3 =>
  qRotate(qConj(attitude), [velocity[0] - wind[0], velocity[1] - wind[1], velocity[2] - wind[2]])

export const dynamicPressure = (density: number, speed: number): number => 0.5 * density * speed * speed

/** Trim helper used by tests and the "start in air" lesson presets. */
export function trimSpeed(spec: AircraftSpec, density = 1.225, loadFactor = 1): number {
  const wing = spec.surfaces.filter(s => s.kind === 'wing')
  const area = wing.reduce((sum, s) => sum + s.area, 0) || spec.wingArea
  const clCruise = 0.55
  return Math.sqrt((2 * spec.mass * 9.80665 * loadFactor) / (density * area * clCruise))
}

export const stallSpeed = (spec: AircraftSpec, density = 1.225): number => {
  const wing = spec.surfaces.filter(s => s.kind === 'wing')
  const area = wing.reduce((sum, s) => sum + s.area, 0) || spec.wingArea
  const clMax = wing.length ? Math.max(...wing.map(s => s.clMax)) : 1.2
  return Math.sqrt((2 * spec.mass * 9.80665) / (density * area * clMax))
}

export const liftToDrag = (output: AeroOutput): number => (output.drag > 1e-6 ? output.lift / output.drag : 0)
export const incidenceOf = (surface: Surface): number => surface.incidence
export const angleBetween = (a: Vec3, b: Vec3): number => Math.acos(clamp(dot(a, b) / (length(a) * length(b) || 1), -1, 1))
