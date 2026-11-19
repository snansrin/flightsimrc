import { describe, expect, it } from 'vitest'
import { engineTimbre } from './audio'

describe('procedural engine sound profile', () => {
  it('increases engine frequency and filtered noise with throttle', () => {
    const idle = engineTimbre('trainer', 0, 0, 0)
    const full = engineTimbre('trainer', 1, 30, 1)
    expect(full.fundamental).toBeGreaterThan(idle.fundamental)
    expect(full.blade).toBeGreaterThan(idle.blade)
    expect(full.engineNoise).toBeGreaterThan(idle.engineNoise)
    expect(full.windNoise).toBeGreaterThan(idle.windNoise)
  })
  it('produces distinct turbine, rotor and quadcopter sound layers', () => {
    const jet = engineTimbre('jet', .8, 30, .8)
    const prop = engineTimbre('trainer', .8, 30, .8)
    const quad = engineTimbre('drone', .8, 30, .8)
    const heli = engineTimbre('helicopter', .8, 30, .8)
    expect(jet.whine).toBeGreaterThan(prop.whine)
    expect(quad.fundamental).toBeGreaterThan(heli.fundamental)
    expect(heli.bladeGain).toBeGreaterThan(prop.bladeGain)
  })
  it('clamps invalid controls so no NaN frequencies or gains reach WebAudio', () => {
    const invalid = engineTimbre('jet', Number.NaN, Number.POSITIVE_INFINITY, Number.NaN)
    expect(Object.values(invalid).every(Number.isFinite)).toBe(true)
    expect(engineTimbre('trainer', -4, -3).windNoise).toBe(0)
    expect(engineTimbre('trainer', 5, 90).fundamental).toBe(engineTimbre('trainer', 1, 90).fundamental)
  })
})
