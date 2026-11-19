import {
  defaultTuning, gamepadControls, readSource, type AxisKey, type Calibration,
  type InputTuning, type Mapping,
} from './input'

export type QuickFlightResult =
  | { ok: true; tuning: InputTuning; calibration: Calibration; throttle: number }
  | { ok: false; message: string }

const controlNames: Record<AxisKey, string> = {
  aileron: 'yatış', elevator: 'irtifa', rudder: 'yön', throttle: 'gaz',
}
const directions: Exclude<AxisKey, 'throttle'>[] = ['aileron', 'elevator', 'rudder']

/**
 * One-click RC setup without the 12-position calibration wizard.
 * The user explicitly holds the throttle at IDLE and the other sticks CENTERED.
 * Do not guess missing channel data or bypass zero-throttle arming.
 */
export function prepareQuickFlight(pad: Gamepad, mapping: Mapping, tuning: InputTuning): QuickFlightResult {
  const sources = Object.values(mapping)
  if (new Set(sources).size !== 4) {
    return { ok: false, message: 'Uçuş için dört farklı kanal gerekli. Eksen eşlemesini düzelt veya Ekseni bul düğmesini kullan.' }
  }
  const raw = {} as Record<AxisKey, number>
  for (const key of ['aileron', 'elevator', 'rudder', 'throttle'] as AxisKey[]) {
    const reading = readSource(pad, mapping[key])
    if (!Number.isFinite(reading) || reading! < -1.1 || reading! > 1.1) {
      return { ok: false, message: `${controlNames[key]} kanalı okunamıyor. Bağlı cihazı ve eksen eşlemesini kontrol et.` }
    }
    raw[key] = reading!
  }

  // A center-value near an endpoint indicates a wrong mapping or a stick still held over.
  for (const key of directions) {
    if (Math.abs(raw[key]) > .45) {
      return { ok: false, message: `${controlNames[key]} kolu merkezde değil (değer: ${raw[key].toFixed(2)}). Ortaya getir veya doğru ekseni seç.` }
    }
  }
  // The user must explicitly hold the throttle at idle. We only infer USB sign,
  // never infer which physical position is idle without this user action.
  if (Math.abs(raw.throttle) < .6) {
    return { ok: false, message: `Gaz kanalı uç konumda görünmüyor (değer: ${raw.throttle.toFixed(2)}). Gazı tam rölantiye indir; hâlâ böyleyse gaz eksenini seç.` }
  }

  const throttlePositiveAtIdle = raw.throttle > 0
  const min = throttlePositiveAtIdle ? -1 : raw.throttle
  const max = throttlePositiveAtIdle ? raw.throttle : 1
  const calibration: Calibration = {
    throttle: { min, center: (min + max) / 2, max },
  }
  for (const key of directions) {
    // Remove minor RC neutral offset without asking the user to save three positions.
    if (Math.abs(raw[key]) > .02) {
      calibration[key] = { min: -1, center: raw[key], max: 1 }
    }
  }
  const nextTuning: InputTuning = {
    ...defaultTuning, ...tuning,
    reversed: { ...defaultTuning.reversed, ...tuning.reversed, throttle: throttlePositiveAtIdle },
  }
  const controls = gamepadControls(pad, mapping, nextTuning, calibration)
  if (controls.throttle > .05 || Math.max(Math.abs(controls.aileron), Math.abs(controls.elevator), Math.abs(controls.rudder)) > .22) {
    return { ok: false, message: 'Gaz sıfırı veya merkezler doğrulanamadı. Gazı rölantiye, diğer kolları ortaya getir ve tekrar dene.' }
  }
  return { ok: true, tuning: nextTuning, calibration, throttle: controls.throttle }
}
