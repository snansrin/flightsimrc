import type { Controls } from './flight'
export type AxisKey = keyof Controls
export type InputSource = `axis:${number}` | `button:${number}`
export type Mapping = Record<AxisKey, InputSource>
export type InputTuning = { reversed: Record<AxisKey, boolean>; deadzone: number; expo: number }
export type AxisCalibration = { min: number; center: number; max: number }
export type Calibration = Partial<Record<AxisKey, AxisCalibration>>
export const defaultMapping: Mapping = { aileron: 'axis:0', elevator: 'axis:1', throttle: 'axis:2', rudder: 'axis:3' }
export const defaultAuxiliary: InputSource[] = Array.from({ length: 8 }, (_, index) => `axis:${index + 4}` as InputSource)
export function deviceSources(axisCount: number, buttonCount: number): InputSource[] {
  const safeAxes = Math.max(0, Math.min(256, Math.floor(axisCount) || 0))
  const safeButtons = Math.max(0, Math.min(256, Math.floor(buttonCount) || 0))
  return [
    ...Array.from({ length: safeAxes }, (_, index) => `axis:${index}` as InputSource),
    ...Array.from({ length: safeButtons }, (_, index) => `button:${index}` as InputSource),
  ]
}
export function defaultChannels(axisCount: number, buttonCount: number): { mapping: Mapping; auxiliary: InputSource[] } {
  const sources = deviceSources(axisCount, buttonCount)
  const flightKeys: AxisKey[] = ['aileron', 'elevator', 'throttle', 'rudder']
  const mapping = { ...defaultMapping }
  flightKeys.forEach((key, index) => { mapping[key] = sources[index] ?? defaultMapping[key] })
  return { mapping, auxiliary: sources.slice(4) }
}
export function normalizeSource(value: unknown, fallback: InputSource): InputSource {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 256) return `axis:${value}`
  return typeof value === 'string' && /^(axis|button):(?:0|[1-9]\d{0,2})$/.test(value) ? value as InputSource : fallback
}
export function readSource(pad: Gamepad, source: InputSource): number | undefined {
  const [kind, indexText] = source.split(':')
  const index = Number(indexText)
  if (kind === 'axis') return pad.axes[index]
  const button = pad.buttons?.[index]
  return button ? button.value * 2 - 1 : undefined
}
export function detectMovedSource(baseline: number[], current: number[], baselineButtons: number[], currentButtons: number[]): InputSource | null {
  const axis = detectMovedAxis(baseline, current)
  const button = detectMovedAxis(baselineButtons, currentButtons, .5)
  if (axis === null) return button === null ? null : `button:${button}`
  if (button === null) return `axis:${axis}`
  return Math.abs(current[axis] - baseline[axis]) >= Math.abs(currentButtons[button] - baselineButtons[button]) ? `axis:${axis}` : `button:${button}`
}
export const defaultTuning: InputTuning = { reversed: { aileron: false, elevator: true, throttle: true, rudder: false }, deadzone: .06, expo: .2 }
export function detectMovedAxis(baseline: number[], current: number[], threshold = .35): number | null {
  if (baseline.length !== current.length || !current.length) return null
  const changes = current.map((value, index) => Number.isFinite(value) && Number.isFinite(baseline[index]) ? Math.abs(value - baseline[index]) : 0)
  const largest = Math.max(...changes)
  return largest >= threshold ? changes.indexOf(largest) : null
}
export function calibrateAxis(raw: number, range?: AxisCalibration): number {
  if (!range || !Number.isFinite(raw) || !Number.isFinite(range.min) || !Number.isFinite(range.center) || !Number.isFinite(range.max) || range.center - range.min < .15 || range.max - range.center < .15) return Math.max(-1, Math.min(1, raw || 0))
  return Math.max(-1, Math.min(1, raw < range.center ? (raw - range.center) / (range.center - range.min) : (raw - range.center) / (range.max - range.center)))
}
export function gamepadControls(pad: Gamepad, mapping: Mapping, tuning: InputTuning = defaultTuning, calibration: Calibration = {}): Controls {
  const axis = (key: AxisKey) => calibrateAxis(readSource(pad, mapping[key]) ?? 0, calibration[key]) * (tuning.reversed[key] ? -1 : 1)
  const shape = (v: number) => {
    const deadzone = Math.max(0, Math.min(.3, tuning.deadzone))
    if (Math.abs(v) <= deadzone) return 0
    const value = Math.sign(v) * (Math.abs(v) - deadzone) / (1 - deadzone)
    const expo = Math.max(0, Math.min(.8, tuning.expo))
    return value * (1 - expo) + value * value * value * expo
  }
  return { aileron: shape(axis('aileron')), elevator: shape(axis('elevator')), rudder: shape(axis('rudder')), throttle: Math.max(0, Math.min(1, (axis('throttle') + 1) / 2)) }
}
