/**
 * Connect the 240 Hz six-DOF physics engine to the original R3F scene, HUD and
 * multiplayer wire format. Do not resimulate in the renderer or networking layer.
 * The legacy scene faces +Z, while physics uses north = -Z; mirror that axis.
 */
import type { Controls as DisplayControls, FlightState } from '../flight'
import { hangarAircraft } from '../hangar'
import { Simulation } from './simulation'
import { fields } from './fields'
import { zeroControls } from './types'
import type { AircraftSpec } from './types'

export type AirframeConfiguration = { flaps: 0 | .5 | 1; gearDown: boolean }
export const cleanConfiguration: AirframeConfiguration = { flaps: 0, gearDown: true }
export const hasRetractableGear = (spec: AircraftSpec) => spec.gear.some(gear => gear.retractChannel >= 0)

export const physicsFieldId = (sceneIndex: number): string => (fields[sceneIndex] ?? fields[0]).id

export const newFlightSimulation = (kind: string, sceneIndex = 0): Simulation => new Simulation({
  aircraft: hangarAircraft(kind).id, field: physicsFieldId(sceneIndex),
})

export function toDisplayFlight(sim: Simulation): FlightState {
  const s = sim.state
  const a = sim.attitude
  return {
    position: [s.position[0], s.position[1], -s.position[2]],
    velocity: [s.velocity[0], s.velocity[1], -s.velocity[2]],
    yaw: a.yaw, pitch: a.pitch, roll: a.roll,
    rollRate: s.omega[0], pitchRate: s.omega[1], yawRate: s.omega[2],
    airspeed: s.airspeed, angleOfAttack: s.alpha,
    engineSpeed: s.rpm, gearPosition: s.gearPosition, flapPosition: s.flapPosition,
    crashed: s.crashed, stalled: s.stalled && !s.onGround && s.agl > .6,
  }
}

export function applyDisplayControls(sim: Simulation, c: DisplayControls, config: AirframeConfiguration = cleanConfiguration): void {
  const input = zeroControls()
  input.throttle = c.throttle
  input.aileron = c.aileron
  input.elevator = c.elevator
  input.rudder = c.rudder
  // Acro / angle on racing quad, GPS loiter on camera drone.
  input.aux[0] = sim.spec.id === 'quad5' ? 1 : 0
  if (sim.spec.family === 'fixed') {
    if (sim.spec.flaps) input.flaps = config.flaps
    if (!config.gearDown && hasRetractableGear(sim.spec)) input.aux[0] = 1
  }
  // Helicopter heading gyro enabled; normal rate mode for the other families.
  if (sim.spec.family === 'heli') input.aux[3] = 1
  sim.raw = input
}
