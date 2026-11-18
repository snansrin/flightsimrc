import type { VehicleKind } from './vehicles'

export class EngineAudio {
  private context: AudioContext
  private low: OscillatorNode
  private high: OscillatorNode
  private gain: GainNode
  private noiseGain: GainNode

  constructor() {
    this.context = new AudioContext()
    this.low = this.context.createOscillator()
    this.high = this.context.createOscillator()
    this.gain = this.context.createGain()
    this.noiseGain = this.context.createGain()
    const lowGain = this.context.createGain()
    const highGain = this.context.createGain()
    lowGain.gain.value = .65
    highGain.gain.value = .18
    this.low.type = 'sawtooth'
    this.high.type = 'triangle'
    this.low.connect(lowGain).connect(this.gain)
    this.high.connect(highGain).connect(this.gain)
    const samples = this.context.sampleRate * 2
    const buffer = this.context.createBuffer(1, samples, this.context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1
    const noise = this.context.createBufferSource()
    noise.buffer = buffer
    noise.loop = true
    const filter = this.context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 800
    noise.connect(filter).connect(this.noiseGain).connect(this.gain)
    this.gain.connect(this.context.destination)
    this.gain.gain.value = 0
    this.low.start()
    this.high.start()
    noise.start()
  }

  async resume() { await this.context.resume() }

  update(kind: VehicleKind, throttle: number, airspeed: number, paused: boolean) {
    const t = this.context.currentTime
    const power = Math.max(0, Math.min(1, throttle))
    const base = kind === 'jet' ? 95 : kind === 'drone' ? 120 : kind === 'helicopter' ? 42 : 34
    this.low.frequency.setTargetAtTime(base + power * (kind === 'jet' ? 210 : 90), t, .07)
    this.high.frequency.setTargetAtTime((base + power * 90) * (kind === 'drone' ? 2.1 : 3), t, .07)
    this.noiseGain.gain.setTargetAtTime(kind === 'jet' ? .35 + power * .3 : .06 + Math.min(airspeed / 50, .16), t, .08)
    this.gain.gain.setTargetAtTime(paused ? 0 : .018 + power * .07, t, .08)
  }

  async close() { await this.context.close() }
}
