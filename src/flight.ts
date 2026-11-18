export type Controls = { throttle: number; aileron: number; elevator: number; rudder: number }
export type FlightState = { position: [number, number, number]; velocity: [number, number, number]; yaw: number; pitch: number; roll: number; crashed: boolean }
export const initialFlight = (): FlightState => ({ position: [0, 1.3, 0], velocity: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, crashed: false })
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
// Fixed timestep trainer model. Axes: +z forward, +y up. SI units, simplified aerodynamic coefficients.
export function stepFlight(s: FlightState, c: Controls, dt: number, wind = 0): FlightState {
  if (s.crashed) return s
  const [x, y, z] = s.position
  const [vx, vy, vz] = s.velocity
  const speed = Math.hypot(vx, vz)
  const roll = clamp(s.roll + (c.aileron * 1.35 - s.roll * 1.1) * dt, -0.9, 0.9)
  const pitch = clamp(s.pitch + (c.elevator * 0.9 - s.pitch * 0.6) * dt, -0.45, 0.55)
  const yaw = s.yaw + (c.rudder * 0.45 + Math.sin(roll) * speed * 0.014) * dt
  const drag = 0.028 * speed * speed + 0.3 * speed
  const accel = c.throttle * 18 - drag
  const forward = clamp(speed + accel * dt, 0, 38)
  const lift = Math.max(0, speed - 7) ** 2 * 0.025 * Math.cos(roll)
  const vertical = clamp(vy + (lift - 9.81 + Math.sin(pitch) * forward * 0.7 - vy * 0.7) * dt, -25, 25)
  const nx = x + (Math.sin(yaw) * forward + wind) * dt
  const nz = z + Math.cos(yaw) * forward * dt
  const ny = y + vertical * dt
  const crashed = ny < 1.1 && (vertical < -3 || Math.abs(roll) > 0.35 || Math.abs(pitch) > 0.3)
  return { position: [nx, Math.max(1.1, ny), nz], velocity: [Math.sin(yaw) * forward, ny <= 1.1 ? 0 : vertical, Math.cos(yaw) * forward], yaw, pitch, roll, crashed }
}
