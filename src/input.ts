import type { Controls } from './flight'
export type AxisKey = keyof Controls
export type Mapping = Record<AxisKey, number>
export type InputTuning = { reversed: Record<AxisKey, boolean>; deadzone: number; expo: number }
export const defaultMapping: Mapping = { aileron: 0, elevator: 1, throttle: 2, rudder: 3 }
export const defaultTuning: InputTuning = { reversed: { aileron: false, elevator: true, throttle: true, rudder: false }, deadzone: .06, expo: .2 }
export function gamepadControls(pad: Gamepad, mapping: Mapping, tuning: InputTuning = defaultTuning): Controls {
  const axis = (key: AxisKey) => Math.max(-1, Math.min(1, pad.axes[mapping[key]] ?? 0)) * (tuning.reversed[key] ? -1 : 1)
  const shape = (v: number) => {
    const deadzone = Math.max(0, Math.min(.3, tuning.deadzone))
    if (Math.abs(v) <= deadzone) return 0
    const value = Math.sign(v) * (Math.abs(v) - deadzone) / (1 - deadzone)
    const expo = Math.max(0, Math.min(.8, tuning.expo))
    return value * (1 - expo) + value * value * value * expo
  }
  return { aileron: shape(axis('aileron')), elevator: shape(axis('elevator')), rudder: shape(axis('rudder')), throttle: Math.max(0, Math.min(1, (axis('throttle') + 1) / 2)) }
}
