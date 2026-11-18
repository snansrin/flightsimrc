import { aerodynamics, stallSpeed } from './aero'
import { atmosphere, GRAVITY, windVector, type WeatherConfig } from './atmosphere'
import { aircraftById } from './catalog'
import { fieldById, ridgeLiftAt, startOnRunway, type Field } from './fields'
import { attitudeEuler, clamp, length, type Vec3 } from './math'
import { createHeliState, createFcState, heliController, heliForces, heliRpm, quadController, quadForces, type FcState, type HeliState } from './rotor'
import { createState, integrate, lag, type ForceModel } from './rigidBody'
import { cloneControls, zeroControls, type AircraftSpec, type Controls, type Environment, type FlightAssistSettings, type SimState } from './types'

export const PHYSICS_HZ = 240
const STEP = 1 / PHYSICS_HZ
const MAX_STEPS = 16

export type AssistProfile = FlightAssistSettings & { label: string }

export const assistProfiles: AssistProfile[] = [
  { label: 'Öğrenci (SAFE)', autoLevel: 0.55, bankLimit: 0.7, stallProtection: true, windEffects: true, rateScale: 0.75 },
  { label: 'Sport', autoLevel: 0.2, bankLimit: 0, stallProtection: true, windEffects: true, rateScale: 1 },
  { label: 'Tam manuel (ACRO)', autoLevel: 0, bankLimit: 0, stallProtection: false, windEffects: true, rateScale: 1.25 },
  { label: 'Rüzgârsız stüdyo', autoLevel: 0.2, bankLimit: 0, stallProtection: true, windEffects: false, rateScale: 1 },
]

/** Stability augmentation. Every term is optional so ACRO is genuinely raw. */
export function applyAssists(spec: AircraftSpec, state: SimState, raw: Controls, assists: FlightAssistSettings): Controls {
  const c = cloneControls(raw)
  if (spec.family !== 'fixed') return c
  const attitude = attitudeEuler(state.attitude)
  const scale = clamp(assists.rateScale, 0.3, 2)
  c.aileron = clamp(c.aileron * scale, -1, 1)
  c.elevator = clamp(c.elevator * scale, -1, 1)
  c.rudder = clamp(c.rudder * scale, -1, 1)
  if (assists.autoLevel > 0) {
    const dead = 0.06
    if (Math.abs(raw.aileron) < dead) {
      c.aileron += clamp(-attitude.roll * 1.6 - state.omega[0] * 0.16, -0.7, 0.7) * assists.autoLevel
    }
    if (Math.abs(raw.elevator) < dead) {
      const targetPitch = clamp(state.velocity[1] * 0.012, -0.12, 0.12)
      c.elevator += clamp((targetPitch - attitude.pitch) * 1.1 - state.omega[1] * 0.12, -0.4, 0.4) * assists.autoLevel
    }
    // Rudder/aileron coordination keeps turns clean for students.
    c.rudder += clamp(-state.beta * 1.4, -0.35, 0.35) * assists.autoLevel
  }
  if (assists.bankLimit > 0) {
    const over = Math.abs(attitude.roll) - assists.bankLimit
    if (over > 0) {
      const restore = -Math.sign(attitude.roll) * clamp(over * 2.4, 0, 0.8)
      c.aileron = Math.sign(c.aileron) === Math.sign(attitude.roll) ? clamp(c.aileron * 0.25 + restore, -1, 1) : c.aileron
    }
  }
  if (assists.stallProtection) {
    const wingStall = spec.surfaces.find(s => s.kind === 'wing')?.alphaStall ?? 0.22
    const vs = stallSpeed(spec)
    if (state.alpha > wingStall * 0.86 && state.airspeed > 2) {
      c.elevator = clamp(c.elevator - (state.alpha - wingStall * 0.86) * 5.5, -1, 1)
    }
    if (state.airspeed < vs * 1.06 && state.agl > 3 && !state.onGround) {
      c.throttle = Math.max(c.throttle, 0.75)
    }
  }
  c.aileron = clamp(c.aileron, -1, 1)
  c.elevator = clamp(c.elevator, -1, 1)
  c.rudder = clamp(c.rudder, -1, 1)
  c.throttle = clamp(c.throttle, 0, 1)
  return c
}

export type SimulationOptions = {
  aircraft?: string
  field?: string
  assists?: Partial<FlightAssistSettings>
  weather?: Partial<WeatherConfig>
  airborne?: { altitude: number; airspeed: number; offset?: number }
}

export class Simulation {
  spec: AircraftSpec
  field: Field
  state: SimState
  raw: Controls = zeroControls()
  applied: Controls = zeroControls()
  assists: FlightAssistSettings
  weather: WeatherConfig
  paused = false
  timeScale = 1
  fc: FcState = createFcState()
  heli: HeliState = createHeliState()
  private accumulator = 0
  private lastAero = { lift: 0, drag: 0, thrust: 0 }
  env: Environment

  constructor(options: SimulationOptions = {}) {
    this.spec = aircraftById(options.aircraft ?? 'trainer1500')
    this.field = fieldById(options.field ?? 'anadolu')
    this.assists = { ...this.spec.assists, ...options.assists }
    this.weather = { ...this.field.weather, ...options.weather }
    this.env = this.buildEnvironment(0)
    this.state = this.spawn(options.airborne)
  }

  private buildEnvironment(time: number): Environment {
    const field = this.field
    const density = atmosphere(this.state?.position[1] ?? 0).density
    return {
      wind: [0, 0, 0],
      turbulence: this.weather.turbulence,
      density,
      temperature: atmosphere(this.state?.position[1] ?? 0).temperature,
      groundHeight: (x, z) => field.height(x, z),
      waterHeight: field.waterLevel,
      time,
    }
  }

  spawn(airborne?: { altitude: number; airspeed: number; offset?: number }): SimState {
    const start = startOnRunway(this.field, airborne?.offset ?? 8)
    const state = createState(this.spec, {
      position: start.position,
      heading: start.heading,
      altitude: airborne?.altitude ?? 0,
      airspeed: airborne?.airspeed ?? 0,
      pitch: airborne ? 0.02 : 0,
      groundHeight: this.field.height(start.position[0], start.position[2]),
    })
    if (this.spec.family !== 'fixed') {
      state.position[1] = this.field.height(start.position[0], start.position[2]) + (airborne?.altitude ?? 0.02) + 0.02
      if (airborne) {
        state.rpm = this.spec.family === 'heli' ? 1 : 0
        state.motors = [0.5, 0.5, 0.5, 0.5]
      }
    }
    this.fc = createFcState()
    this.heli = createHeliState()
    this.lastAero = { lift: 0, drag: 0, thrust: 0 }
    return state
  }

  reset(options: SimulationOptions = {}) {
    if (options.aircraft) this.spec = aircraftById(options.aircraft)
    if (options.field) { this.field = fieldById(options.field); this.weather = { ...this.field.weather, ...options.weather } }
    if (options.assists) this.assists = { ...this.spec.assists, ...options.assists }
    if (options.weather) this.weather = { ...this.weather, ...options.weather }
    this.state = this.spawn(options.airborne)
    this.raw = zeroControls()
    this.applied = zeroControls()
    this.accumulator = 0
  }

  setAircraft(id: string, airborne?: SimulationOptions['airborne']) {
    this.spec = aircraftById(id)
    this.assists = { ...this.spec.assists }
    this.state = this.spawn(airborne)
    this.raw = zeroControls()
  }

  setField(id: string, airborne?: SimulationOptions['airborne']) {
    this.field = fieldById(id)
    this.weather = { ...this.field.weather }
    this.state = this.spawn(airborne)
  }

  private model: ForceModel = (state, controls, env) => {
    if (this.spec.family === 'multirotor') {
      const out = quadForces(this.spec, state, controls, env, state.motors)
      this.lastAero = { lift: out.info.lift ?? 0, drag: out.info.drag ?? 0, thrust: out.info.thrust ?? 0 }
      return { forceBody: out.forceBody, momentBody: out.momentBody, info: out.info }
    }
    if (this.spec.family === 'heli') {
      const out = heliForces(this.spec, state, controls, env, this.heli)
      this.lastAero = { lift: out.info.lift ?? 0, drag: out.info.drag ?? 0, thrust: out.info.thrust ?? 0 }
      return { forceBody: out.forceBody, momentBody: out.momentBody, info: out.info }
    }
    const aero = aerodynamics(this.spec, state, controls, env)
    this.lastAero = { lift: aero.lift, drag: aero.drag, thrust: aero.thrust }
    return {
      forceBody: aero.force,
      momentBody: aero.moment,
      info: {
        airspeed: aero.airspeed, alpha: aero.alpha, beta: aero.beta, stalled: aero.stalled,
        slipstream: aero.slipstream, lift: aero.lift, drag: aero.drag, thrust: aero.thrust,
      },
    }
  }

  /** One physics substep; public so tests and the verification harness can drive it. */
  step(dt = STEP) {
    const state = this.state
    if (state.crashed) return
    const agl = Math.max(0, state.position[1] - this.field.height(state.position[0], state.position[2]))
    const wind = windVector(this.weather, state.position, agl, state.time, this.assists.windEffects)
    if (this.field.ridgeLift > 0) {
      wind[1] += ridgeLiftAt(this.field, state.position[0], state.position[2], agl, this.weather.windSpeed)
    }
    const air = atmosphere(state.position[1])
    this.env = {
      wind, turbulence: this.weather.turbulence, density: air.density, temperature: air.temperature,
      groundHeight: (x, z) => this.field.height(x, z), waterHeight: this.field.waterLevel, time: state.time,
    }
    this.applied = applyAssists(this.spec, state, this.raw, this.assists)
    // Actuators.
    if (this.spec.family === 'fixed') {
      const idle = this.spec.prop.idleRpm / this.spec.prop.maxRpm
      const target = this.spec.prop.kind === 'none' ? 0 : idle + (1 - idle) * this.applied.throttle
      this.state.rpm = lag(state.rpm, target, this.spec.prop.spoolTime, dt)
    } else if (this.spec.family === 'heli') {
      this.state.rpm = heliRpm(this.spec, state, this.applied, dt)
      this.state.autorotation = this.applied.aux[4] > 0.5 && state.velocity[1] < -1
      heliController(this.spec, state, this.applied, this.heli, dt)
    } else {
      const commands = quadController(this.spec, state, this.applied, this.env, this.fc, dt)
      const tau = this.spec.rotor?.motorTime ?? 0.05
      this.state.motors = commands.map((command, i) => lag(state.motors[i] ?? 0, command, tau, dt))
    }
    const wantsGearUp = this.spec.gear.some(g => g.retractChannel >= 0) && this.applied.aux[0] > 0.5
    this.state.gearPosition = lag(state.gearPosition, wantsGearUp ? 0 : 1, 0.7, dt)
    const result = integrate(this.spec, this.state, this.applied, this.env, dt, this.model)
    this.state = result.state
    if (this.spec.family === 'multirotor') {
      this.state.rpm = this.state.motors.reduce((a, b) => a + b, 0) / 4
    } else if (this.spec.family === 'heli') {
      const out = heliForces(this.spec, this.state, this.applied, this.env, this.heli)
      this.heli.inflow = out.inflow
      this.heli.tailCommand = out.tailCommand
    }
    this.state.throttleActual = this.applied.throttle
    this.state.loadFactor = this.lastAero.lift / Math.max(1e-3, this.spec.mass * GRAVITY)
    this.state.lift = this.lastAero.lift
    this.state.drag = this.lastAero.drag
    this.state.thrust = this.lastAero.thrust
  }

  /** Advance by a render frame, keeping the physics step fixed. */
  update(frameDt: number) {
    if (this.paused) return 0
    const dt = clamp(frameDt, 0, 0.25) * this.timeScale
    this.accumulator += dt
    let steps = 0
    while (this.accumulator >= STEP && steps < MAX_STEPS) {
      this.step(STEP)
      this.accumulator -= STEP
      steps++
    }
    if (steps === MAX_STEPS) this.accumulator = 0
    return steps
  }

  get attitude() { return attitudeEuler(this.state.attitude) }
  get headingDegrees() { return ((this.attitude.yaw * 180) / Math.PI + 360) % 360 }
  get stallSpeed() { return stallSpeed(this.spec, this.env.density) }
  get speedKmh() { return this.state.airspeed * 3.6 }
  get verticalSpeed() { return this.state.velocity[1] }
  get energyHeight() { return this.state.agl + (this.state.airspeed * this.state.airspeed) / (2 * GRAVITY) }
  get warnings(): string[] {
    const list: string[] = []
    const s = this.state
    if (s.crashed) list.push(s.crashReason || 'Kaza')
    if (s.stalled) list.push('STALL — burnu indir, gaz ver')
    if (s.vortexRing) list.push('VORTEX RING — ileri cyclic, collective azalt')
    if (!s.crashed && s.agl < 12 && s.velocity[1] < -3 && this.spec.family === 'fixed') list.push('YÜKSEK BATMA HIZI')
    if (this.spec.family === 'fixed' && s.airspeed < this.stallSpeed * 1.15 && s.agl > 4) list.push('HIZ DÜŞÜK')
    if (this.spec.family === 'fixed' && s.airspeed > this.spec.envelope.maxSpeed * 1.15) list.push('AŞIRI HIZ')
    if (Math.abs(this.attitude.roll) > 1.4 && s.agl < 20) list.push('DİK YATIŞ / ALÇAK İRTİFA')
    return list
  }
}

export const totalSpeed = (v: Vec3): number => length(v)