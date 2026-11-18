import type { Controls } from './flight'
export type AxisKey = keyof Controls
export type Mapping = Record<AxisKey, number>
export const defaultMapping: Mapping = { aileron: 0, elevator: 1, throttle: 2, rudder: 3 }
export function gamepadControls(pad: Gamepad, mapping: Mapping): Controls {
  const axis = (key: AxisKey) => Math.max(-1, Math.min(1, pad.axes[mapping[key]] ?? 0))
  const dead = (v: number) => Math.abs(v) < 0.06 ? 0 : v
  return { aileron: dead(axis('aileron')), elevator: -dead(axis('elevator')), rudder: dead(axis('rudder')), throttle: (1 - axis('throttle')) / 2 }
}
