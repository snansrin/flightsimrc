import type { Controls } from './flight'
export type AxisKey = keyof Controls
export type InputSource = `axis:${number}` | `button:${number}`
export type Mapping = Record<AxisKey, InputSource>
export type InputTuning = { reversed: Record<AxisKey, boolean>; deadzone: number; expo: number; rates: Record<Exclude<AxisKey, 'throttle'>, number> }
export type AxisCalibration = { min: number; center: number; max: number }
export type Calibration = Partial<Record<AxisKey, AxisCalibration>>
export type Travel = { min: number; max: number }

export function observeTravel(ranges: (Travel | undefined)[], values: readonly number[]): void {
  for (let index = 0; index < values.length; index++) {
    const value = values[index]
    if (!Number.isFinite(value)) continue
    const range = ranges[index]
    if (range) {
      range.min = Math.min(range.min, value)
      range.max = Math.max(range.max, value)
    } else ranges[index] = { min: value, max: value }
  }
}

export const hasTravel = (range?: Travel) => Boolean(range && range.max - range.min >= .035)
export function axisSignalSummary(axes: readonly number[], ranges: readonly (Travel | undefined)[]) {
  return {
    reported: axes.length,
    received: axes.filter(Number.isFinite).length,
    moving: axes.filter((value, index) => Number.isFinite(value) && hasTravel(ranges[index])).length,
  }
}
export const defaultMapping: Mapping = { aileron: 'axis:0', elevator: 'axis:1', throttle: 'axis:2', rudder: 'axis:3' }
export const flightChannels = [
  { key: 'aileron', name: 'Yatış', positive: 'sağa', negative: 'sola' },
  { key: 'elevator', name: 'İrtifa dümeni', positive: 'burnu kaldırma yönüne', negative: 'burnu indirme yönüne' },
  { key: 'rudder', name: 'Yön dümeni', positive: 'sağa', negative: 'sola' },
  { key: 'throttle', name: 'Gaz', positive: 'tam gaz konumuna', negative: 'rölanti konumuna' },
] as const

export const standardMapping: Mapping = { aileron: 'axis:2', elevator: 'axis:3', throttle: 'button:7', rudder: 'axis:0' }

export function validCalibration(range?: AxisCalibration): range is AxisCalibration {
  if (!range || ![range.min, range.center, range.max].every(Number.isFinite)) return false
  const direction = Math.sign(range.max - range.min)
  return (range.center - range.min) * direction >= .04 && (range.max - range.center) * direction >= .04
}

export function calibrationRange(key: AxisKey, min: number, max: number, neutral: number): AxisCalibration | undefined {
  const range = { min, max, center: key === 'throttle' ? (min + max) / 2 : neutral }
  return Math.abs(max - min) >= .16 && validCalibration(range) ? range : undefined
}
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
export function detectMovedSource(baseline: number[], current: number[], baselineButtons: number[], currentButtons: number[], axisThreshold = .18): InputSource | null {
  const axis = detectMovedAxis(baseline, current, axisThreshold)
  const button = detectMovedAxis(baselineButtons, currentButtons, .5)
  if (axis === null) return button === null ? null : `button:${button}`
  if (button === null) return `axis:${axis}`
  return Math.abs(current[axis] - baseline[axis]) >= Math.abs(currentButtons[button] - baselineButtons[button]) ? `axis:${axis}` : `button:${button}`
}
export const defaultTuning: InputTuning = { reversed: { aileron: false, elevator: true, throttle: true, rudder: false }, deadzone: .06, expo: .2, rates: { aileron: 1, elevator: 1, rudder: 1 } }
export function detectMovedAxis(baseline: number[], current: number[], threshold = .18): number | null {
  if (baseline.length !== current.length || !current.length) return null
  const changes = current.map((value, index) => Number.isFinite(value) && Number.isFinite(baseline[index]) ? Math.abs(value - baseline[index]) : 0)
  const largest = Math.max(...changes)
  return largest >= threshold ? changes.indexOf(largest) : null
}
export function calibrateAxis(raw: number, range?: AxisCalibration): number {
  if (!Number.isFinite(raw)) return 0
  if (!validCalibration(range)) return Math.max(-1, Math.min(1, raw))
  const direction = range.max > range.min ? 1 : -1
  const low = range.min * direction, middle = range.center * direction, high = range.max * direction
  const value = raw * direction
  return Math.max(-1, Math.min(1, value < middle ? (value - middle) / (middle - low) : (value - middle) / (high - middle)))
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
  const rate = (key: 'aileron' | 'elevator' | 'rudder') => {
    const scale = Math.max(.5, Math.min(2, tuning.rates?.[key] ?? 1))
    return Math.max(-1, Math.min(1, shape(axis(key)) * scale))
  }
  const rawThrottle = readSource(pad, mapping.throttle)
  const throttle = Number.isFinite(rawThrottle) ? (axis('throttle') + 1) / 2 : 0
  return { aileron: rate('aileron'), elevator: rate('elevator'), rudder: rate('rudder'), throttle }
}
