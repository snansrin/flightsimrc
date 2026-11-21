import { describe, expect, it } from 'vitest'
import { bladePassageFrequency, engineTimbre, soundPerspective } from './audio'
import { aircraftById } from './sim/catalog'

describe('procedural engine sound profile', () => {
  it('sets blade passage frequencies from rotor RPM and blade count', () => {
    expect(bladePassageFrequency(aircraftById('warbird1400'), .5)).toBeCloseTo(245)
    expect(bladePassageFrequency(aircraftById('edf90'), 1)).toBeCloseTo(5866.67, 1)
    expect(bladePassageFrequency(aircraftById('warbird1400'), 0)).toBe(0)
  })

  it('raises the pitch of an approaching aircraft and attenuates distant sound', () => {
    const far = soundPerspective({ position: [100, 0, 0], velocity: [-25, 0, 0] }, [0, 0, 0])
    const near = soundPerspective({ position: [10, 0, 0], velocity: [25, 0, 0] }, [0, 0, 0])
    expect(far.gain).toBeLessThan(near.gain)
    expect(far.doppler).toBeGreaterThan(1)
    expect(near.doppler).toBeLessThan(1)
    expect(far.lowpass).toBeLessThan(near.lowpass)
    expect(near.pan).toBeGreaterThan(0)
    const rotated = soundPerspective({ position: [10, 0, 0], velocity: [0, 0, 0] }, [0, 0, 0], Math.PI)
    expect(rotated.pan).toBeLessThan(0)
  })
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
