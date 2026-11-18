import { it } from 'vitest'
import { Simulation } from './simulation'
import { attitudeEuler, deg } from './math'
import { zeroControls } from './types'

const dump = (label: string, sim: Simulation) => {
  const e = attitudeEuler(sim.state.attitude)
  console.log(label,
    'agl', sim.state.agl.toFixed(3),
    'V', sim.state.airspeed.toFixed(2),
    'pitch', deg(e.pitch).toFixed(1),
    'roll', deg(e.roll).toFixed(1),
    'alpha', deg(sim.state.alpha).toFixed(1),
    'lift', sim.state.lift.toFixed(2),
    'thr', sim.state.thrust.toFixed(2),
    'crash', sim.state.crashReason || '-')
}

it('debug ground', () => {
  for (const id of ['trainer1500', 'extra330', 'edf90', 'glider2000']) {
    const sim = new Simulation({ aircraft: id, field: 'anadolu' })
    for (let i = 0; i < 480; i++) { sim.step(); if (i % 120 === 0) dump(id + ' t' + (i / 240).toFixed(1), sim) }
    dump(id + ' end', sim)
  }
})

it('debug air', () => {
  for (const id of ['trainer1500', 'extra330', 'edf90']) {
    const sim = new Simulation({ aircraft: id, field: 'anadolu', airborne: { altitude: 120, airspeed: 20 }, assists: { autoLevel: 0, stallProtection: false, windEffects: false } })
    sim.raw = { ...zeroControls(), throttle: 0.6 }
    for (let i = 0; i < 240 * 6; i++) { sim.step(); if (i % 120 === 0) dump(id + ' air t' + (i / 240).toFixed(1), sim) }
  }
})

it('debug takeoff', () => {
  const sim = new Simulation({ aircraft: 'trainer1500', field: 'anadolu', assists: { autoLevel: 0, stallProtection: false, windEffects: false } })
  for (let i = 0; i < 240 * 12; i++) {
    sim.raw = { ...zeroControls(), throttle: 1, elevator: sim.state.airspeed > 10 ? 0.3 : 0 }
    sim.step()
    if (i % 240 === 0) dump('takeoff t' + (i / 240).toFixed(0), sim)
    if (sim.state.crashed) break
  }
})
