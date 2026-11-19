import { calibrationRange, detectMovedAxis, type AxisCalibration, type AxisKey, type InputSource } from './input'

export type GuidedStep = {
  index: number
  stage: 'neutral' | 'positive' | 'negative'
  neutral?: number[]
  source?: InputSource
  positive?: number
}

// Only axis movement not already claimed by an earlier channel can be selected.
// The baseline is captured *after* the previous stick has been released.
export function findGuidedAxis(neutral: readonly number[], current: readonly number[], used: readonly InputSource[]): InputSource | null {
  const available = current.map((value, index) => used.includes(`axis:${index}`) ? Number.NaN : value)
  const index = detectMovedAxis([...neutral], available, .12)
  return index === null ? null : `axis:${index}`
}

export function guidedRange(key: AxisKey, source: InputSource, neutral: readonly number[], positive: number, negative: number): AxisCalibration | undefined {
  if (!source.startsWith('axis:') || !Number.isFinite(positive) || !Number.isFinite(negative)) return undefined
  const center = neutral[Number(source.slice(5))]
  if (!Number.isFinite(center)) return undefined
  return calibrationRange(key, negative, positive, center)
}
