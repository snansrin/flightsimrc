/**
 * Connect the 240 Hz six-DOF physics engine to the original R3F scene, HUD and
 * multiplayer wire format. Do not resimulate in the renderer or networking layer.
 * The legacy scene faces +Z, while physics uses north = -Z; mirror that axis.
 */
import type { Controls as DisplayControls, FlightState } from '../flight'
import type { VehicleKind } from '../vehicles'
import { Simulation } from './simulation'
import { fields } from './fields'
import { zeroControls } from './types'

export const physicsAircraft: Record<VehicleKind, string> = {
  trainer: 'trainer1500', drone: 'quad5', helicopter: 'heli500', jet: 'edf90',
}

/** Only the first five scene configurations have corresponding scene artwork. */
export const physicsFieldId = (sceneIndex: number): string => fields[Math.max(0, Math.min(4, sceneIndex))].id

export const newFlightSimulation = (kind: VehicleKind, sceneIndex = 0): Simulation => new Simulation({
  aircraft: physicsAircraft[kind], field: physicsFieldId(sceneIndex),
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
    crashed: s.crashed, stalled: s.stalled,
  }
}

export function applyDisplayControls(sim: Simulation, c: DisplayControls): void {
  const input = zeroControls()
  input.throttle = c.throttle
  input.aileron = c.aileron
  input.elevator = c.elevator
  input.rudder = c.rudder
  // Acro / angle on racing quad, GPS loiter on camera drone.
  input.aux[0] = sim.spec.id === 'quad5' ? 1 : 0
  // Helicopter heading gyro enabled; normal rate mode for the other families.
  if (sim.spec.family === 'heli') input.aux[3] = 1
  sim.raw = input
}
