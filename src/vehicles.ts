import { initialFlight, jetProfile, stepFlight, type Controls, type FlightState } from './flight'

export type VehicleKind = 'trainer' | 'drone' | 'helicopter' | 'jet'
export const vehicles: { id: VehicleKind; name: string; className: string; lesson: string }[] = [
  { id: 'trainer', name: 'Trainer 1500', className: 'Pervaneli eğitim uçağı', lesson: 'Pist kalkışı · temel dönüş · iniş' },
  { id: 'drone', name: 'Quad X', className: 'Dört rotorlu drone', lesson: 'Hover · hassas konumlama' },
  { id: 'helicopter', name: 'Heli 500', className: 'RC helikopter', lesson: 'Collective · cyclic · kuyruk rotoru' },
  { id: 'jet', name: 'EDF Sport', className: 'Elektrikli fanlı RC jet', lesson: 'Yüksek hız · geniş dönüş · yaklaşma' },
]

export function initialVehicle(kind: VehicleKind): FlightState {
  const state = initialFlight()
  return kind === 'drone' || kind === 'helicopter' ? { ...state, position: [0, .18, -30] } : state
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// Stabilized learning mode for rotorcraft, not a validated rotor or ESC model.
function stepRotorcraft(state: FlightState, c: Controls, dt: number, wind: number, helicopter: boolean): FlightState {
  if (state.crashed || dt <= 0) return state
  const h = Math.min(dt, 1 / 30)
  const [x, y, z] = state.position
  const [vx, vy, vz] = state.velocity
  const groundHeight = .18
  const power = clamp(c.throttle, 0, 1)
  const response = helicopter ? 2.3 : 4.2
  const targetRoll = clamp(c.aileron, -1, 1) * (helicopter ? .46 : .52)
  const targetPitch = -clamp(c.elevator, -1, 1) * (helicopter ? .46 : .52)
  const rollRate = (targetRoll - state.roll) * response
  const pitchRate = (targetPitch - state.pitch) * response
  const roll = state.roll + rollRate * h
  const pitch = state.pitch + pitchRate * h
  const yawRate = state.yawRate + ((clamp(c.rudder, -1, 1) * (helicopter ? 1.7 : 2.2)) - state.yawRate) * h * response
  const yaw = state.yaw + yawRate * h
  const vertical = (power - (helicopter ? .52 : .5)) * (helicopter ? 20 : 24) * Math.cos(roll) * Math.cos(pitch) - vy * (helicopter ? 1.2 : 1.8)
  const nextVy = clamp(vy + vertical * h, -12, 12)
  const forwardAccel = -Math.sin(pitch) * (helicopter ? 11 : 15)
  const sideAccel = Math.sin(roll) * (helicopter ? 11 : 15)
  const nextVx = vx + (sideAccel * Math.cos(yaw) + forwardAccel * Math.sin(yaw) + wind * .15 - vx * (helicopter ? .8 : 1.2)) * h
  const nextVz = vz + (forwardAccel * Math.cos(yaw) - sideAccel * Math.sin(yaw) - vz * (helicopter ? .8 : 1.2)) * h
  const nextY = y + nextVy * h
  const landing = nextY <= groundHeight && y > groundHeight + .001
  const crashed = landing && (nextVy < -3.5 || Math.abs(roll) > .55 || Math.abs(pitch) > .55)
  const onGround = nextY <= groundHeight
  return {
    position: [x + nextVx * h, Math.max(groundHeight, nextY), z + nextVz * h],
    velocity: [nextVx, onGround ? 0 : nextVy, nextVz], yaw, roll, pitch,
    rollRate, pitchRate, yawRate,
    airspeed: Math.hypot(nextVx - wind, nextVy, nextVz), angleOfAttack: 0,
    crashed, stalled: false,
  }
}

export function stepVehicle(kind: VehicleKind, state: FlightState, controls: Controls, dt: number, wind = 0): FlightState {
  if (kind === 'drone') return stepRotorcraft(state, controls, dt, wind, false)
  if (kind === 'helicopter') return stepRotorcraft(state, controls, dt, wind, true)
  if (kind === 'jet') {
    return stepFlight(state, controls, dt, wind, jetProfile)
  }
  return stepFlight(state, controls, dt, wind)
}
