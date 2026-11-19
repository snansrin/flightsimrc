import type { VehicleKind } from './vehicles'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

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

  update(kind: VehicleKind, throttle: number, airspeed: number, paused: boolean, rpm?: number) {
    const now = this.context.currentTime
    const t = engineTimbre(kind, throttle, airspeed, rpm)
    this.prop.frequency.setTargetAtTime(t.fundamental, now, .1)
    this.harmonic.frequency.setTargetAtTime(t.harmonic, now, .12)
    this.blade.frequency.setTargetAtTime(t.blade, now, .1)
    this.whine.frequency.setTargetAtTime(t.whine, now, .16)
    this.propGain.gain.setTargetAtTime(t.tonalGain, now, .08)
    this.harmonicGain.gain.setTargetAtTime(t.tonalGain * .26, now, .08)
    this.bladeGain.gain.setTargetAtTime(t.bladeGain, now, .1)
    this.whineGain.gain.setTargetAtTime(t.whineGain, now, .13)
    this.engineFilter.frequency.setTargetAtTime(t.noiseFilter, now, .12)
    this.engineNoiseGain.gain.setTargetAtTime(t.engineNoise, now, .12)
    this.windNoiseGain.gain.setTargetAtTime(t.windNoise, now, .18)
    this.master.gain.setTargetAtTime(paused ? 0 : t.volume, now, paused ? .06 : .13)
  }

  async close() { await this.context.close() }
}
