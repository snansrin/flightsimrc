import { GRAVITY } from './atmosphere'
import { stallSpeed } from './aero'
import { aircraftById } from './catalog'
import { attitudeEuler, clamp, deg, rad } from './math'
import { Simulation } from './simulation'
import { zeroControls, type AircraftSpec, type Controls } from './types'

/**
 * Automated flight-test harness. Every scenario flies the real physics model with
 * scripted inputs and reports measured numbers against analytical targets.
 * Used by unit tests, by `npm run verify` and by the in-app diagnostics panel.
 */

export type Measurement = {
  scenario: string
  aircraft: string
  value: number
  unit: string
  target?: number
  tolerance?: number
  pass: boolean
  detail: string
}

const flat = 'anadolu'

function fly(spec: AircraftSpec, seconds: number, pilot: (sim: Simulation, t: number) => void, options: {
  altitude?: number
  airspeed?: number
  assists?: Partial<Simulation['assists']>
} = {}): Simulation {
  const sim = new Simulation({
    aircraft: spec.id,
    field: flat,
    weather: { windSpeed: 0, turbulence: 0, thermals: 0 },
    assists: { autoLevel: 0, bankLimit: 0, stallProtection: false, windEffects: false, rateScale: 1, ...options.assists },
    airborne: options.altitude ? { altitude: options.altitude, airspeed: options.airspeed ?? 15 } : undefined,
  })
  const dt = 1 / 240
  for (let t = 0; t < seconds; t += dt) {
    pilot(sim, t)
    sim.step(dt)
    if (sim.state.crashed) break
  }
  return sim
}

const set = (sim: Simulation, c: Partial<Controls>) => { sim.raw = { ...zeroControls(), ...sim.raw, ...c } }

/** Simple altitude hold used only to reach a trimmed measurement condition. */
const altitudeHold = (sim: Simulation, target: number, gain = 0.02) => {
  const err = target - sim.state.agl
  const pitchCommand = clamp(err * gain - sim.state.velocity[1] * 0.09, -0.35, 0.35)
  return clamp(pitchCommand, -1, 1)
}

export function measureTrim(spec: AircraftSpec, throttle = 0.62): Measurement {
  const startAlt = 120
  let speedSum = 0, samples = 0, alphaSum = 0
  const sim = fly(spec, 26, (s, t) => {
    set(s, { throttle, elevator: altitudeHold(s, startAlt), aileron: 0, rudder: 0 })
    if (t > 18) { speedSum += s.state.airspeed; alphaSum += s.state.alpha; samples++ }
  }, { altitude: startAlt, airspeed: spec.envelope.cruise })
  const speed = samples ? speedSum / samples : 0
  const alpha = samples ? alphaSum / samples : 0
  const target = spec.envelope.cruise
  const error = Math.abs(speed - target) / target
  return {
    scenario: 'Trim (yatay uçuş)', aircraft: spec.id, value: speed, unit: 'm/s', target, tolerance: 0.3,
    pass: error < 0.3 && !sim.state.crashed,
    detail: `gaz %${Math.round(throttle * 100)}, α ${deg(alpha).toFixed(1)}°, irtifa ${sim.state.agl.toFixed(0)} m, kaldırma/ağırlık ${(sim.state.lift / (spec.mass * GRAVITY)).toFixed(2)}`,
  }
}

export function measureStall(spec: AircraftSpec): Measurement {
  let minSpeed = Infinity
  const sim = fly(spec, 30, (s, t) => {
    const throttle = t < 6 ? 0.5 : 0
    set(s, { throttle, elevator: altitudeHold(s, 140, 0.03) })
    if (t > 8 && s.state.agl > 40 && !s.state.onGround) minSpeed = Math.min(minSpeed, s.state.airspeed)
  }, { altitude: 140, airspeed: spec.envelope.cruise })
  const target = stallSpeed(spec)
  const value = Number.isFinite(minSpeed) ? minSpeed : 0
  const error = Math.abs(value - target) / target
  return {
    scenario: 'Stall hızı', aircraft: spec.id, value, unit: 'm/s', target, tolerance: 0.25,
    pass: error < 0.25,
    detail: `analitik √(2W/ρS·CLmax) = ${target.toFixed(1)} m/s, ölçülen en düşük hız ${value.toFixed(1)} m/s, stall bayrağı ${sim.state.stalled}`,
  }
}

export function measureGlide(spec: AircraftSpec): Measurement {
  let best = 0
  const startAlt = 160
  const sim = fly(spec, 40, (s, t) => {
    set(s, { throttle: 0, elevator: altitudeHold(s, -1000, 0) })
    // Hold the best-glide attitude: small nose-down, wings level.
    const attitude = attitudeEuler(s.state.attitude)
    set(s, { throttle: 0, elevator: clamp((rad(-3.5) - attitude.pitch) * 2.2 - s.state.omega[1] * 0.25, -1, 1), aileron: clamp(-attitude.roll * 2, -1, 1) })
    if (t > 6 && s.state.agl > 20 && s.state.climbRate < -0.2) {
      best = Math.max(best, s.state.groundSpeed / -s.state.climbRate)
    }
  }, { altitude: startAlt, airspeed: spec.envelope.cruise * 0.85 })
  const target = spec.envelope.glideRatio
  const error = Math.abs(best - target) / target
  return {
    scenario: 'Süzülüş oranı (L/D)', aircraft: spec.id, value: best, unit: ':1', target, tolerance: 0.35,
    pass: error < 0.35,
    detail: `motorsuz, ${sim.state.agl.toFixed(0)} m kalan irtifa; en iyi yatay/dikey oran`,
  }
}

export function measureTakeoff(spec: AircraftSpec): Measurement {
  let liftOffDistance = 0
  let liftOffSpeed = 0
  const start = { x: 0, z: 0 }
  const sim = new Simulation({ aircraft: spec.id, field: flat, weather: { windSpeed: 0, turbulence: 0, thermals: 0 }, assists: { autoLevel: 0, bankLimit: 0, stallProtection: false, windEffects: false, rateScale: 1 } })
  start.x = sim.state.position[0]
  start.z = sim.state.position[2]
  const dt = 1 / 240
  for (let t = 0; t < 30; t += dt) {
    const rotate = sim.state.airspeed > stallSpeed(spec) * 1.05
    set(sim, { throttle: 1, elevator: rotate ? 0.35 : 0.02, rudder: clamp(-attitudeEuler(sim.state.attitude).yaw * 2, -0.4, 0.4) })
    sim.step(dt)
    if (!liftOffDistance && sim.state.agl > 0.6) {
      liftOffDistance = Math.hypot(sim.state.position[0] - start.x, sim.state.position[2] - start.z)
      liftOffSpeed = sim.state.airspeed
    }
    if (liftOffDistance && sim.state.agl > 8) break
    if (sim.state.crashed) break
  }
  const target = 35
  return {
    scenario: 'Kalkış koşusu', aircraft: spec.id, value: liftOffDistance, unit: 'm', target, tolerance: 0.85,
    pass: liftOffDistance > 3 && liftOffDistance < 90 && !sim.state.crashed,
    detail: `kalkış hızı ${liftOffSpeed.toFixed(1)} m/s (stall ${stallSpeed(spec).toFixed(1)}), 8 m irtifaya ${sim.state.agl.toFixed(1)} m'de ulaştı`,
  }
}

export function measureTurn(spec: AircraftSpec, bank = 30): Measurement {
  let rateSum = 0, speedSum = 0, samples = 0
  const sim = fly(spec, 30, (s, t) => {
    const attitude = attitudeEuler(s.state.attitude)
    const bankTarget = rad(bank)
    const aileron = clamp((bankTarget - attitude.roll) * 2.4 - s.state.omega[0] * 0.22, -1, 1)
    set(s, {
      throttle: 0.72,
      aileron,
      elevator: clamp(altitudeHold(s, 150) + 0.16 * (1 / Math.cos(attitude.roll) - 1) * 3, -1, 1),
      rudder: clamp(-s.state.beta * 2.5, -0.5, 0.5),
    })
    if (t > 16 && Math.abs(attitude.roll - bankTarget) < 0.09) {
      rateSum += Math.abs(s.state.omega[2]); speedSum += s.state.airspeed; samples++
    }
  }, { altitude: 150, airspeed: spec.envelope.cruise })
  const rate = samples ? rateSum / samples : 0
  const speed = samples ? speedSum / samples : spec.envelope.cruise
  const target = (GRAVITY * Math.tan(rad(bank))) / Math.max(5, speed)
  const error = Math.abs(rate - target) / target
  return {
    scenario: `Koordineli dönüş (${bank}°)`, aircraft: spec.id, value: deg(rate), unit: '°/s', target: deg(target), tolerance: 0.25,
    pass: error < 0.25 && samples > 20,
    detail: `${speed.toFixed(1)} m/s hızda ölçülen yaw hızı; teorik g·tanφ/V = ${deg(target).toFixed(1)}°/s`,
  }
}

export function measureRollRate(spec: AircraftSpec): Measurement {
  let peak = 0
  fly(spec, 6, (s, t) => {
    set(s, { throttle: 0.7, aileron: t > 1 ? 1 : 0, elevator: altitudeHold(s, 150) })
    if (t > 1) peak = Math.max(peak, Math.abs(s.state.omega[0]))
  }, { altitude: 150, airspeed: spec.envelope.cruise })
  return {
    scenario: 'Maksimum roll hızı', aircraft: spec.id, value: deg(peak), unit: '°/s', target: 200, tolerance: 1,
    pass: peak > rad(60) && peak < rad(1200),
    detail: 'tam aileron sapması, serbest akış',
  }
}

export function measureClimb(spec: AircraftSpec): Measurement {
  let best = 0
  const sim = fly(spec, 24, (s, t) => {
    const attitude = attitudeEuler(s.state.attitude)
    set(s, { throttle: 1, elevator: clamp((rad(12) - attitude.pitch) * 2 - s.state.omega[1] * 0.2, -1, 1), aileron: clamp(-attitude.roll * 2, -1, 1) })
    if (t > 8) best = Math.max(best, s.state.climbRate)
  }, { altitude: 60, airspeed: spec.envelope.cruise })
  const target = spec.envelope.climb
  const error = Math.abs(best - target) / target
  return {
    scenario: 'Tırmanma hızı', aircraft: spec.id, value: best, unit: 'm/s', target, tolerance: 0.6,
    pass: error < 0.6 && !sim.state.crashed,
    detail: `tam gaz, 12° burun; itki/ağırlık ${(spec.prop.staticThrust / (spec.mass * GRAVITY)).toFixed(2)}`,
  }
}

export function measureHover(id: string): Measurement {
  const spec = aircraftById(id)
  const sim = new Simulation({ aircraft: id, field: flat, weather: { windSpeed: 0, turbulence: 0, thermals: 0 }, airborne: { altitude: 12, airspeed: 0 } })
  const dt = 1 / 240
  let drift = 0
  const startY = sim.state.position[1]
  const startX = sim.state.position[0], startZ = sim.state.position[2]
  for (let t = 0; t < 12; t += dt) {
    if (spec.family === 'heli') {
      const attitude = attitudeEuler(sim.state.attitude)
      set(sim, {
        throttle: 0.52,
        aileron: clamp(-attitude.roll * 1.6 - sim.state.omega[0] * 0.12 - sim.state.velocity[0] * 0.05, -0.5, 0.5),
        elevator: clamp(-attitude.pitch * 1.6 - sim.state.omega[1] * 0.12 + sim.state.velocity[2] * 0.05, -0.5, 0.5),
        rudder: clamp(-sim.state.omega[2] * 0.5, -0.5, 0.5),
      })
    } else {
      set(sim, { throttle: spec.envelope.hoverThrottle ?? 0.5, aux: [1, 0, 0, 0, 0, 0, 0, 0] })
    }
    sim.step(dt)
    if (sim.state.crashed) break
    if (t > 6) drift = Math.max(drift, Math.abs(sim.state.position[1] - startY))
  }
  const horizontal = Math.hypot(sim.state.position[0] - startX, sim.state.position[2] - startZ)
  return {
    scenario: 'Hover kararlılığı', aircraft: id, value: drift, unit: 'm', target: 0, tolerance: 2.5,
    pass: !sim.state.crashed && drift < 2.5 && horizontal < 6,
    detail: `6 s sonra dikey sapma ${drift.toFixed(2)} m, yatay kayma ${horizontal.toFixed(2)} m`,
  }
}

export function measureLanding(spec: AircraftSpec): Measurement {
  const sim = new Simulation({
    aircraft: spec.id, field: flat, weather: { windSpeed: 0, turbulence: 0, thermals: 0 },
    assists: { autoLevel: 0, bankLimit: 0, stallProtection: false, windEffects: false, rateScale: 1 },
    airborne: { altitude: 22, airspeed: stallSpeed(spec) * 1.35, offset: 150 },
  })
  const dt = 1 / 240
  let touchdown = 0
  let flareAltitude = 0
  for (let t = 0; t < 40; t += dt) {
    const attitude = attitudeEuler(sim.state.attitude)
    const agl = sim.state.agl
    const glideTarget = -1.1
    const flare = agl < 2.2
    if (flare && !flareAltitude) flareAltitude = agl
    const pitchTarget = flare ? rad(7) : rad(-2)
    set(sim, {
      throttle: flare ? 0 : clamp(0.22 + (glideTarget - sim.state.velocity[1]) * 0.1, 0, 0.5),
      elevator: clamp((pitchTarget - attitude.pitch) * 2.6 - sim.state.omega[1] * 0.3, -1, 1),
      aileron: clamp(-attitude.roll * 2.5, -1, 1),
      rudder: clamp(-attitude.yaw * 1.5, -0.4, 0.4),
    })
    sim.step(dt)
    if (sim.state.onGround && !touchdown) touchdown = Math.abs(sim.state.velocity[1])
    if (sim.state.onGround && sim.state.groundSpeed < 3) break
    if (sim.state.crashed) break
  }
  return {
    scenario: 'Yaklaşma ve iniş', aircraft: spec.id, value: touchdown, unit: 'm/s', target: 0, tolerance: 2,
    pass: !sim.state.crashed && touchdown < 2.0,
    detail: `1.35·Vs yaklaşma, ${flareAltitude.toFixed(1)} m'de flare; tekerlek teması ${touchdown.toFixed(2)} m/s, kaza: ${sim.state.crashReason || 'yok'}`,
  }
}

export function verifyAirframe(id: string): Measurement[] {
  const spec = aircraftById(id)
  if (spec.family !== 'fixed') return [measureHover(id)]
  return [
    measureTrim(spec),
    measureStall(spec),
    measureGlide(spec),
    measureTakeoff(spec),
    measureTurn(spec),
    measureRollRate(spec),
    measureClimb(spec),
    measureLanding(spec),
  ]
}

export function verifyAll(): Measurement[] {
  return ['trainer1500', 'cub800', 'extra330', 'warbird1400', 'edf90', 'glider2000', 'wing1000', 'float1200', 'quad5', 'cinedrone', 'heli500']
    .flatMap(id => verifyAirframe(id))
}

export const formatMeasurements = (rows: Measurement[]): string => rows.map(r =>
  `${r.pass ? 'GEÇTİ' : 'KALDI'} | ${r.aircraft.padEnd(13)} | ${r.scenario.padEnd(26)} | ${r.value.toFixed(2)} ${r.unit}${r.target !== undefined ? ` (hedef ${r.target.toFixed(2)})` : ''} | ${r.detail}`,
).join('\n')
