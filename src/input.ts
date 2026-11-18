import type { Controls } from './flight'
export type AxisKey = keyof Controls
export type Mapping = Record<AxisKey, number>
export type InputTuning = { reversed: Record<AxisKey, boolean>; deadzone: number; expo: number }
export type AxisCalibration = { min: number; center: number; max: number }
export type Calibration = Partial<Record<AxisKey, AxisCalibration>>
export const defaultMapping: Mapping = { aileron: 0, elevator: 1, throttle: 2, rudder: 3 }
export const defaultTuning: InputTuning = { reversed: { aileron: false, elevator: true, throttle: true, rudder: false }, deadzone: .06, expo: .2 }
export function calibrateAxis(raw: number, range?: AxisCalibration): number {
  if (!range || !Number.isFinite(raw) || !Number.isFinite(range.min) || !Number.isFinite(range.center) || !Number.isFinite(range.max) || range.center - range.min < .15 || range.max - range.center < .15) return Math.max(-1, Math.min(1, raw || 0))
  return Math.max(-1, Math.min(1, raw < range.center ? (raw - range.center) / (range.center - range.min) : (raw - range.center) / (range.max - range.center)))
}
export function gamepadControls(pad: Gamepad, mapping: Mapping, tuning: InputTuning = defaultTuning, calibration: Calibration = {}): Controls {
  const axis = (key: AxisKey) => calibrateAxis(pad.axes[mapping[key]] ?? 0, calibration[key]) * (tuning.reversed[key] ? -1 : 1)
  const shape = (v: number) => {
    const deadzone = Math.max(0, Math.min(.3, tuning.deadzone))
    if (Math.abs(v) <= deadzone) return 0
    const value = Math.sign(v) * (Math.abs(v) - deadzone) / (1 - deadzone)
    const expo = Math.max(0, Math.min(.8, tuning.expo))
    return value * (1 - expo) + value * value * value * expo
  }
  return { aileron: shape(axis('aileron')), elevator: shape(axis('elevator')), rudder: shape(axis('rudder')), throttle: Math.max(0, Math.min(1, (axis('throttle') + 1) / 2)) }
}
