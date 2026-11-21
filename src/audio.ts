import type { VehicleKind } from './vehicles'
import type { FlightState } from './flight'
import type { AircraftSpec } from './sim/types'
import type { Vec3 } from './sim/math'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function bladePassageFrequency(spec: AircraftSpec, power: number): number {
  const rpm = clamp(Number.isFinite(power) ? power : 0, 0, 1)
  if (spec.family === 'heli') return rpm * (spec.rotor?.headSpeed ?? 2200) * 2 / 60
  if (spec.family === 'multirotor') return rpm * 16500 * Math.max(2, spec.visual.propBlades) / 60
  if (spec.prop.kind === 'none') return 0
  return rpm * spec.prop.maxRpm * (spec.prop.kind === 'edf' ? 11 : Math.max(2, spec.visual.propBlades)) / 60
}

export function soundPerspective(flight: Pick<FlightState, 'position' | 'velocity'>, listener?: Vec3) {
  if (!listener) return { gain: 1, doppler: 1 }
  const dx = flight.position[0] - listener[0], dy = flight.position[1] - listener[1], dz = flight.position[2] - listener[2]
  const distance = Math.hypot(dx, dy, dz)
  const [vx, vy, vz] = flight.velocity
  const radial = distance > 1 ? (dx * vx + dy * vy + dz * vz) / distance : 0
  return { gain: 1 / Math.hypot(1, distance / 14), doppler: 343 / (343 + clamp(radial, -95, 95)) }
}

export type EngineTimbre = {
  fundamental: number
  harmonic: number
  blade: number
  whine: number
  tonalGain: number
  bladeGain: number
  whineGain: number
  engineNoise: number
  windNoise: number
  noiseFilter: number
  volume: number
}

/** Procedural, intentionally approximate turbine / propeller / rotor sound design. */
export function engineTimbre(kind: VehicleKind, throttle: number, airspeed: number, rpm?: number): EngineTimbre {
  const power = clamp(Number.isFinite(throttle) ? throttle : 0, 0, 1)
  const speed = clamp(Number.isFinite(airspeed) ? airspeed : 0, 0, 120)
  const spin = rpm !== undefined && Number.isFinite(rpm) ? clamp(rpm, 0, 1.3) : power
  const response = clamp(power * .48 + spin * .52, 0, 1.3)
  const rotor = kind === 'helicopter'
  const drone = kind === 'drone'
  const jet = kind === 'jet'
  const frequency = jet ? 52 + response * 135 : rotor ? 27 + response * 18 : drone ? 72 + response * 205 : 35 + response * 85
  return {
    fundamental: frequency,
    harmonic: frequency * (rotor ? 3 : drone ? 2.1 : jet ? 2.8 : 2),
    blade: frequency * (rotor ? 2 : drone ? 3.8 : jet ? 5 : 2),
    whine: jet ? 480 + response * 1850 : drone ? 340 + response * 1050 : rotor ? 145 + response * 220 : 130 + response * 240,
    tonalGain: jet ? .32 : rotor ? .42 : drone ? .30 : .5,
    bladeGain: rotor ? .4 + power * .18 : jet ? .12 : drone ? .3 + power * .17 : .30 + power * .12,
    whineGain: jet ? .08 + response * .38 : drone ? .1 + response * .23 : rotor ? .045 : .025 + response * .035,
    engineNoise: jet ? .14 + response * .38 : rotor ? .09 + power * .12 : drone ? .07 + power * .18 : .05 + power * .13,
    windNoise: clamp((speed - 2) / 65, 0, .35) * (jet ? 1.1 : .65),
    noiseFilter: jet ? 520 + response * 3400 : rotor ? 360 + response * 1100 : drone ? 700 + response * 2300 : 270 + response * 1500,
    volume: jet ? .095 : rotor ? .10 : drone ? .075 : .095,
  }
}

export class EngineAudio {
  private context: AudioContext
  private prop: OscillatorNode
  private harmonic: OscillatorNode
  private blade: OscillatorNode
  private whine: OscillatorNode
  private propGain: GainNode
  private harmonicGain: GainNode
  private bladeGain: GainNode
  private whineGain: GainNode
  private engineNoiseGain: GainNode
  private windNoiseGain: GainNode
  private engineFilter: BiquadFilterNode
  private master: GainNode

  constructor() {
    this.context = new AudioContext()
    const ctx = this.context
    this.master = ctx.createGain()
    this.master.gain.value = 0
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -20
    compressor.knee.value = 14
    compressor.ratio.value = 6
    compressor.attack.value = .004
    compressor.release.value = .16
    this.master.connect(compressor).connect(ctx.destination)

    const osc = (type: OscillatorType) => {
      const node = ctx.createOscillator()
      node.type = type
      const gain = ctx.createGain()
      gain.gain.value = 0
      node.connect(gain).connect(this.master)
      node.start()
      return { node, gain }
    }
    const fundamental = osc('sawtooth')
    const overtone = osc('triangle')
    const blades = osc('sine')
    const turbine = osc('sine')
    this.prop = fundamental.node
    this.harmonic = overtone.node
    this.blade = blades.node
    this.whine = turbine.node
    this.propGain = fundamental.gain
    this.harmonicGain = overtone.gain
    this.bladeGain = blades.gain
    this.whineGain = turbine.gain

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    noise.loop = true
    const engineFilter = ctx.createBiquadFilter()
    engineFilter.type = 'bandpass'
    engineFilter.frequency.value = 800
    engineFilter.Q.value = .7
    this.engineFilter = engineFilter
    this.engineNoiseGain = ctx.createGain()
    this.engineNoiseGain.gain.value = 0
    noise.connect(engineFilter).connect(this.engineNoiseGain).connect(this.master)
    const windFilter = ctx.createBiquadFilter()
    windFilter.type = 'highpass'
    windFilter.frequency.value = 520
    this.windNoiseGain = ctx.createGain()
    this.windNoiseGain.gain.value = 0
    noise.connect(windFilter).connect(this.windNoiseGain).connect(this.master)
    noise.start()
  }

  async resume() { await this.context.resume() }

  update(kind: VehicleKind, throttle: number, airspeed: number, paused: boolean, rpm?: number,
    spec?: AircraftSpec, flight?: FlightState, listener?: Vec3) {
    const now = this.context.currentTime
    const t = engineTimbre(kind, throttle, airspeed, rpm)
    const scope = flight ? soundPerspective(flight, listener) : { gain: 1, doppler: 1 }
    const physicalBlade = spec ? bladePassageFrequency(spec, rpm ?? throttle) : t.blade
    const engineLevel = spec ? clamp((rpm ?? throttle) * 2, 0, 1) : 1
    this.prop.frequency.setTargetAtTime(t.fundamental * scope.doppler, now, .1)
    this.harmonic.frequency.setTargetAtTime(t.harmonic * scope.doppler, now, .12)
    this.blade.frequency.setTargetAtTime(clamp(physicalBlade * scope.doppler, 16, 8300), now, .1)
    this.whine.frequency.setTargetAtTime(t.whine * scope.doppler, now, .16)
    this.propGain.gain.setTargetAtTime(t.tonalGain * engineLevel, now, .08)
    this.harmonicGain.gain.setTargetAtTime(t.tonalGain * .26 * engineLevel, now, .08)
    this.bladeGain.gain.setTargetAtTime(t.bladeGain * engineLevel, now, .1)
    this.whineGain.gain.setTargetAtTime(t.whineGain * engineLevel, now, .13)
    this.engineFilter.frequency.setTargetAtTime(t.noiseFilter, now, .12)
    this.engineNoiseGain.gain.setTargetAtTime(t.engineNoise * engineLevel, now, .12)
    this.windNoiseGain.gain.setTargetAtTime(t.windNoise, now, .18)
    this.master.gain.setTargetAtTime(paused ? 0 : t.volume * scope.gain, now, paused ? .06 : .13)
  }

  async close() { await this.context.close() }
}
